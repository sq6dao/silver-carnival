import { createHash } from 'crypto';

import type { AnkiGateway, SchedulerCardBinding } from '../anki/gateway';
import type { ChunkRepository, StoredChunk } from './repository';
import type { ChunkRecord } from './types';

export const CHUNK_SPLIT_MARKER = '<!-- ir-split -->';

export interface SplitChunkOptions {
	now?: () => number;
}

export interface SplitChunkResult {
	parent: StoredChunk;
	children: StoredChunk[];
}

export class SplitChunkService {
	private readonly now: () => number;

	public constructor(
		private readonly chunks: Pick<
			ChunkRepository,
			'deleteChunkNote' | 'saveNew' | 'updateChunkNote'
		>,
		private readonly anki: Pick<
			AnkiGateway,
			'createChunkNote' | 'ensureSchedulerResources' | 'suspendCard'
		>,
		options: SplitChunkOptions = {},
	) {
		this.now = options.now ?? Date.now;
	}

	public async split(storedParent: StoredChunk): Promise<SplitChunkResult> {
		const parent = storedParent.chunk;
		if (parent.lifecycle !== 'active') {
			throw new Error(`Chunk ${parent.id} is not active.`);
		}

		if (typeof parent.scheduler.ankiCardId !== 'number') {
			throw new Error(`Chunk ${parent.id} has no scheduler card to suspend.`);
		}

		const parts = splitText(parent.text);
		if (parts.length < 2) {
			throw new Error(`Add ${CHUNK_SPLIT_MARKER} between child chunks before splitting.`);
		}

		await this.anki.ensureSchedulerResources(parent.sourceNoteId);

		const createdChildren: StoredChunk[] = [];

		try {
			for (let index = 0; index < parts.length; index++) {
				const child = createChildChunk(parent, parts[index], index, this.now());
				const storedChild = await this.chunks.saveNew(child);
				createdChildren.push(storedChild);

				const binding = await this.anki.createChunkNote(child, storedChild.joplinNoteId);
				const scheduledChild = bindSchedulerCard(child, binding, this.now());
				await this.chunks.updateChunkNote(storedChild.joplinNoteId, scheduledChild);
				storedChild.chunk = scheduledChild;
			}
		} catch (error) {
			await this.rollbackCreatedChildren(createdChildren);
			throw error;
		}

		await this.anki.suspendCard(parent.scheduler.ankiCardId);

		const updatedParent = supersedeParent(parent, this.now());
		await this.chunks.updateChunkNote(storedParent.joplinNoteId, updatedParent);

		return {
			parent: {
				...storedParent,
				chunk: updatedParent,
			},
			children: createdChildren,
		};
	}

	private async rollbackCreatedChildren(createdChildren: StoredChunk[]): Promise<void> {
		for (const child of createdChildren.slice().reverse()) {
			await this.chunks.deleteChunkNote(child.joplinNoteId);
		}
	}
}

function splitText(text: string): string[] {
	return text
		.split(CHUNK_SPLIT_MARKER)
		.map(part => part.trim())
		.filter(part => part.length > 0);
}

function createChildChunk(
	parent: ChunkRecord,
	text: string,
	index: number,
	now: number,
): ChunkRecord {
	const textHash = hashText(text);
	const childNumber = index + 1;
	const headingPath = [
		...(parent.headingPath ?? parent.anchor?.headingPath ?? [parent.sourceNoteTitle]),
		`Part ${childNumber}`,
	];
	const id = `${parent.id}_split_${childNumber}`;

	return {
		id,
		rootChunkId: parent.rootChunkId,
		parentChunkId: parent.id,
		sourceNoteId: parent.sourceNoteId,
		sourceNoteTitle: parent.sourceNoteTitle,
		headingPath,
		anchor: {
			textHash,
			headingPath,
		},
		text,
		textHash,
		version: 1,
		lifecycle: 'active',
		scheduler: {
			deckName: parent.scheduler.deckName,
			modelName: parent.scheduler.modelName,
			lastKnownDue: null,
			lastKnownState: null,
			lastSyncAt: null,
		},
		createdCards: [],
		createdAt: now,
		updatedAt: now,
	};
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

function supersedeParent(parent: ChunkRecord, updatedAt: number): ChunkRecord {
	return {
		...parent,
		lifecycle: 'superseded',
		scheduler: {
			...parent.scheduler,
			lastKnownState: 'suspended',
			lastSyncAt: updatedAt,
		},
		updatedAt,
	};
}

function hashText(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}
