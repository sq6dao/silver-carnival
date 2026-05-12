import { createHash } from 'crypto';

import {
	createdCardsDeckName,
	IR_BASIC_MODEL_NAME,
	IR_CLOZE_MODEL_NAME,
	type AnkiGateway,
	type CreatedCardBinding,
} from '../anki/gateway';
import { titleForChunk, type ChunkRepository, type StoredChunk } from '../chunks/repository';
import type { ChunkRecord, CreatedCardLink } from '../chunks/types';

export interface CardCreationOptions {
	now?: () => number;
}

export interface CardCreationResult {
	storedChunk: StoredChunk;
	createdCard: CreatedCardLink;
}

export class CardCreationService {
	private readonly now: () => number;

	public constructor(
		private readonly chunks: Pick<ChunkRepository, 'updateChunkNote'>,
		private readonly anki: Pick<
			AnkiGateway,
			'createBasicCard' | 'createClozeCard' | 'ensureCreatedCardResources'
		>,
		options: CardCreationOptions = {},
	) {
		this.now = options.now ?? Date.now;
	}

	public async createBasicCard(storedChunk: StoredChunk): Promise<CardCreationResult> {
		const chunk = prepareChunkForCardCreation(storedChunk.chunk, IR_BASIC_MODEL_NAME, this.now());

		await this.anki.ensureCreatedCardResources(chunk.sourceNoteId);
		const binding = await this.anki.createBasicCard(chunk, titleForChunk(chunk), chunk.text);

		return this.recordCreatedCard(storedChunk, chunk, IR_BASIC_MODEL_NAME, binding);
	}

	public async createClozeCard(storedChunk: StoredChunk): Promise<CardCreationResult> {
		const chunk = prepareChunkForCardCreation(storedChunk.chunk, IR_CLOZE_MODEL_NAME, this.now());

		if (!containsClozeDeletion(chunk.text)) {
			throw new Error('Add Anki cloze syntax like {{c1::answer}} before creating a Cloze card.');
		}

		await this.anki.ensureCreatedCardResources(chunk.sourceNoteId);
		const binding = await this.anki.createClozeCard(chunk, chunk.text, titleForChunk(chunk));

		return this.recordCreatedCard(storedChunk, chunk, IR_CLOZE_MODEL_NAME, binding);
	}

	private async recordCreatedCard(
		storedChunk: StoredChunk,
		chunk: ChunkRecord,
		modelName: string,
		binding: CreatedCardBinding,
	): Promise<CardCreationResult> {
		const createdAt = this.now();
		const createdCard: CreatedCardLink = {
			ankiNoteId: binding.noteId,
			ankiCardIds: binding.cardIds,
			deckName: createdCardsDeckName(chunk.sourceNoteId),
			modelName,
			sourceChunkId: chunk.id,
			sourceChunkVersion: chunk.version,
			sourceTextHash: chunk.textHash,
			createdAt,
			status: 'active',
		};
		const updatedChunk = {
			...chunk,
			createdCards: [
				...chunk.createdCards,
				createdCard,
			],
			updatedAt: createdAt,
		};

		await this.chunks.updateChunkNote(storedChunk.joplinNoteId, updatedChunk);

		return {
			storedChunk: {
				...storedChunk,
				chunk: updatedChunk,
				title: titleForChunk(updatedChunk),
			},
			createdCard,
		};
	}
}

function prepareChunkForCardCreation(
	chunk: ChunkRecord,
	modelName: string,
	updatedAt: number,
): ChunkRecord {
	if (chunk.lifecycle !== 'active') {
		throw new Error(`Chunk ${chunk.id} is not active.`);
	}

	const currentChunk = withCurrentTextHash(chunk, updatedAt);
	if (hasActiveCreatedCard(currentChunk, modelName)) {
		throw new Error(`Chunk ${chunk.id} already has an active ${modelName} card.`);
	}

	return currentChunk;
}

function withCurrentTextHash(chunk: ChunkRecord, updatedAt: number): ChunkRecord {
	const textHash = hashText(chunk.text);
	if (textHash === chunk.textHash) return chunk;

	return {
		...chunk,
		textHash,
		version: chunk.version + 1,
		createdCards: chunk.createdCards.map(card => {
			if (
				card.status !== 'active' ||
				card.sourceChunkId !== chunk.id ||
				card.sourceTextHash === textHash
			) {
				return card;
			}

			return {
				...card,
				status: 'stale',
			};
		}),
		updatedAt,
	};
}

function hasActiveCreatedCard(chunk: ChunkRecord, modelName: string): boolean {
	return chunk.createdCards.some(card => (
		card.status === 'active' &&
		card.modelName === modelName &&
		card.sourceChunkId === chunk.id &&
		card.sourceChunkVersion === chunk.version &&
		card.sourceTextHash === chunk.textHash
	));
}

function containsClozeDeletion(text: string): boolean {
	return /\{\{c\d+::[\s\S]+?\}\}/.test(text);
}

function hashText(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}
