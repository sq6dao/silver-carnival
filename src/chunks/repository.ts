import { parseChunkMetadata, renderChunkNoteBody } from './metadata';
import type { ChunkRecord } from './types';

export const IR_CHUNKS_NOTEBOOK_TITLE = 'IR Chunks';

export interface StoredChunk {
	chunk: ChunkRecord;
	joplinNoteId: string;
	title: string;
}

export interface ChunkRepository {
	saveNew(chunk: ChunkRecord): Promise<StoredChunk>;
	updateChunkNote(joplinNoteId: string, chunk: ChunkRecord): Promise<void>;
	deleteChunkNote(joplinNoteId: string): Promise<void>;
	listBySource(sourceNoteId: string): Promise<StoredChunk[]>;
	findByAnkiCardId(cardId: number): Promise<StoredChunk | null>;
}

export interface JoplinDataApi {
	get(path: string[], query?: Record<string, unknown>): Promise<unknown>;
	post(
		path: string[],
		query?: Record<string, unknown> | null,
		body?: Record<string, unknown>,
		files?: unknown[],
	): Promise<unknown>;
	put(
		path: string[],
		query?: Record<string, unknown> | null,
		body?: Record<string, unknown>,
	): Promise<unknown>;
	delete(path: string[], query?: Record<string, unknown>): Promise<unknown>;
}

interface JoplinFolder {
	id: string;
	title: string;
}

interface JoplinNote {
	id: string;
	title: string;
	body: string;
}

export class JoplinChunkRepository implements ChunkRepository {
	private chunkNotebookId: string | null = null;

	public constructor(
		private readonly data: JoplinDataApi,
		private readonly notebookTitle = IR_CHUNKS_NOTEBOOK_TITLE,
	) {}

	public async saveNew(chunk: ChunkRecord): Promise<StoredChunk> {
		const parentId = await this.ensureChunkNotebook();
		const title = titleForChunk(chunk);
		const created = await this.data.post(['notes'], null, {
			parent_id: parentId,
			title,
			body: renderChunkNoteBody(chunk),
		});
		const noteId = requireStringField(created, 'id', 'created note');

		return {
			chunk,
			joplinNoteId: noteId,
			title,
		};
	}

	public async updateChunkNote(joplinNoteId: string, chunk: ChunkRecord): Promise<void> {
		await this.data.put(['notes', joplinNoteId], null, {
			title: titleForChunk(chunk),
			body: renderChunkNoteBody(chunk),
		});
	}

	public async deleteChunkNote(joplinNoteId: string): Promise<void> {
		await this.data.delete(['notes', joplinNoteId]);
	}

	public async listBySource(sourceNoteId: string): Promise<StoredChunk[]> {
		const chunks = await this.listAllChunks();

		return chunks.filter(stored => stored.chunk.sourceNoteId === sourceNoteId);
	}

	public async findByAnkiCardId(cardId: number): Promise<StoredChunk | null> {
		const chunks = await this.listAllChunks();

		return chunks.find(stored => stored.chunk.scheduler.ankiCardId === cardId) ?? null;
	}

	private async listAllChunks(): Promise<StoredChunk[]> {
		const notebookId = await this.findChunkNotebookId();
		if (!notebookId) return [];

		const notes = await this.listNotesInFolder(notebookId);
		const chunks: StoredChunk[] = [];

		for (const note of notes) {
			const parsed = parseChunkMetadata(note.body);
			if (!parsed) continue;

			chunks.push({
				chunk: parsed.chunk,
				joplinNoteId: note.id,
				title: note.title,
			});
		}

		return chunks;
	}

	private async ensureChunkNotebook(): Promise<string> {
		const existing = await this.findChunkNotebookId();
		if (existing) return existing;

		const created = await this.data.post(['folders'], null, {
			title: this.notebookTitle,
		});
		const folderId = requireStringField(created, 'id', 'created folder');
		this.chunkNotebookId = folderId;

		return folderId;
	}

	private async findChunkNotebookId(): Promise<string | null> {
		if (this.chunkNotebookId) return this.chunkNotebookId;

		const folders = await this.listFolders();
		const folder = folders.find(item => item.title === this.notebookTitle);
		this.chunkNotebookId = folder?.id ?? null;

		return this.chunkNotebookId;
	}

	private async listFolders(): Promise<JoplinFolder[]> {
		return this.paginate<JoplinFolder>(['folders'], ['id', 'title']);
	}

	private async listNotesInFolder(folderId: string): Promise<JoplinNote[]> {
		return this.paginate<JoplinNote>(['folders', folderId, 'notes'], ['id', 'title', 'body']);
	}

	private async paginate<T>(path: string[], fields: string[]): Promise<T[]> {
		const output: T[] = [];
		let page = 1;

		while (true) {
			const response = await this.data.get(path, {
				fields,
				limit: 100,
				page,
			});
			const { items, hasMore } = normalizePage<T>(response);
			output.push(...items);

			if (!hasMore) break;
			page++;
		}

		return output;
	}
}

export function titleForChunk(chunk: ChunkRecord): string {
	const path = chunk.headingPath ?? chunk.anchor?.headingPath ?? [];
	const title = path[path.length - 1] || chunk.sourceNoteTitle || chunk.id;

	return title;
}

function normalizePage<T>(response: unknown): { items: T[]; hasMore: boolean } {
	if (Array.isArray(response)) {
		return {
			items: response as T[],
			hasMore: false,
		};
	}

	if (isRecord(response) && Array.isArray(response.items)) {
		return {
			items: response.items as T[],
			hasMore: response.has_more === true,
		};
	}

	throw new Error('Unexpected Joplin API list response.');
}

function requireStringField(value: unknown, fieldName: string, context: string): string {
	if (!isRecord(value)) {
		throw new Error(`Expected ${context} to include string field "${fieldName}".`);
	}

	const fieldValue = value[fieldName];

	if (typeof fieldValue !== 'string' || !fieldValue) {
		throw new Error(`Expected ${context} to include string field "${fieldName}".`);
	}

	return fieldValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
