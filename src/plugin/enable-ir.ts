import type { AnkiGateway, SchedulerCardBinding } from '../anki/gateway';
import { extractHeadingChunks } from '../chunks/extractor';
import type { ChunkRepository, StoredChunk } from '../chunks/repository';
import type { ChunkRecord, JoplinSourceNote } from '../chunks/types';

export interface EnableIncrementalReadingResult {
	createdCount: number;
}

export interface EnableIncrementalReadingOptions {
	now?: () => number;
}

export class EnableIncrementalReadingService {
	private readonly now: () => number;

	public constructor(
		private readonly chunks: Pick<
			ChunkRepository,
			'deleteChunkNote' | 'listBySource' | 'saveNew' | 'updateChunkNote'
		>,
		private readonly anki: Pick<AnkiGateway, 'createChunkNote' | 'ensureSchedulerResources'>,
		options: EnableIncrementalReadingOptions = {},
	) {
		this.now = options.now ?? Date.now;
	}

	public async enable(note: JoplinSourceNote): Promise<EnableIncrementalReadingResult> {
		const existingChunks = await this.chunks.listBySource(note.id);
		if (existingChunks.length) {
			throw new Error('Incremental reading is already enabled for this note.');
		}

		const extractedChunks = extractHeadingChunks(note, {
			now: this.now(),
		});

		if (!extractedChunks.length) {
			throw new Error('No readable chunks were found in the selected note.');
		}

		await this.anki.ensureSchedulerResources(note.id);

		const created: StoredChunk[] = [];

		try {
			for (const chunk of extractedChunks) {
				const stored = await this.chunks.saveNew(chunk);
				created.push(stored);

				const binding = await this.anki.createChunkNote(chunk, stored.joplinNoteId);
				const scheduledChunk = bindSchedulerCard(chunk, binding, this.now());
				await this.chunks.updateChunkNote(stored.joplinNoteId, scheduledChunk);
			}
		} catch (error) {
			await this.rollbackCreatedNotes(created);
			throw error;
		}

		return {
			createdCount: extractedChunks.length,
		};
	}

	private async rollbackCreatedNotes(created: StoredChunk[]): Promise<void> {
		for (const stored of created.slice().reverse()) {
			await this.chunks.deleteChunkNote(stored.joplinNoteId);
		}
	}
}

function bindSchedulerCard(
	chunk: ChunkRecord,
	binding: SchedulerCardBinding,
	updatedAt: number,
): ChunkRecord {
	return {
		...chunk,
		scheduler: {
			...chunk.scheduler,
			ankiNoteId: binding.noteId,
			ankiCardId: binding.cardId,
			lastSyncAt: updatedAt,
		},
		updatedAt,
	};
}
