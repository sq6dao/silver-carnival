import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import type { AnkiGateway, AnkiReviewRating, SchedulerCardInfo } from '../../src/anki/gateway';
import { extractHeadingChunks } from '../../src/chunks/extractor';
import type { ChunkRepository, StoredChunk } from '../../src/chunks/repository';
import type { ChunkRecord } from '../../src/chunks/types';
import { GradeChunkService } from '../../src/review/grading';

test('grade answers Anki card and persists scheduler metadata', async () => {
	const stored = storedChunk(456, 'active');
	const chunks = new FakeChunkRepository([stored]);
	const anki = new FakeAnkiGateway({
		schedulerInfo: {
			cardId: 456,
			due: 42,
			state: 'review',
		},
	});
	const service = new GradeChunkService(anki, chunks, {
		now: () => 999,
	});

	const result = await service.grade({
		ankiCardId: 456,
		rating: 3,
	});

	assert.deepEqual(anki.reviewCalls, [{ cardId: 456, rating: 3 }]);
	assert.deepEqual(anki.infoCalls, [456]);
	assert.equal(chunks.updated.length, 1);
	assert.equal(chunks.updated[0].joplinNoteId, stored.joplinNoteId);
	assert.equal(chunks.updated[0].chunk.scheduler.lastKnownDue, 42);
	assert.equal(chunks.updated[0].chunk.scheduler.lastKnownState, 'review');
	assert.equal(chunks.updated[0].chunk.scheduler.lastSyncAt, 999);
	assert.equal(chunks.updated[0].chunk.updatedAt, 999);
	assert.equal(result.chunk.scheduler.lastKnownState, 'review');
});

test('grade preserves previous scheduler state when scheduler info is unavailable', async () => {
	const stored = storedChunk(456, 'active');
	stored.chunk.scheduler.lastKnownDue = 7;
	stored.chunk.scheduler.lastKnownState = 'learn';
	const chunks = new FakeChunkRepository([stored]);
	const anki = new FakeAnkiGateway({
		failSchedulerInfo: true,
	});
	const service = new GradeChunkService(anki, chunks, {
		now: () => 999,
	});

	await service.grade({
		ankiCardId: 456,
		rating: 4,
	});

	assert.equal(chunks.updated[0].chunk.scheduler.lastKnownDue, 7);
	assert.equal(chunks.updated[0].chunk.scheduler.lastKnownState, 'learn');
	assert.equal(chunks.updated[0].chunk.scheduler.lastSyncAt, 999);
});

test('grade fails when no chunk is mapped to the Anki card', async () => {
	const chunks = new FakeChunkRepository([]);
	const anki = new FakeAnkiGateway();
	const service = new GradeChunkService(anki, chunks);

	await assert.rejects(
		() => service.grade({ ankiCardId: 404, rating: 1 }),
		/No chunk is mapped/,
	);
	assert.deepEqual(anki.reviewCalls, []);
	assert.equal(chunks.updated.length, 0);
});

test('grade fails when the mapped chunk is not active', async () => {
	const chunks = new FakeChunkRepository([storedChunk(456, 'done')]);
	const anki = new FakeAnkiGateway();
	const service = new GradeChunkService(anki, chunks);

	await assert.rejects(
		() => service.grade({ ankiCardId: 456, rating: 1 }),
		/is not active/,
	);
	assert.deepEqual(anki.reviewCalls, []);
	assert.equal(chunks.updated.length, 0);
});

test('grade does not update chunk metadata when Anki review fails', async () => {
	const chunks = new FakeChunkRepository([storedChunk(456, 'active')]);
	const anki = new FakeAnkiGateway({
		failReview: true,
	});
	const service = new GradeChunkService(anki, chunks);

	await assert.rejects(
		() => service.grade({ ankiCardId: 456, rating: 2 }),
		/Anki review failed/,
	);
	assert.equal(chunks.updated.length, 0);
});

function storedChunk(
	cardId: number,
	lifecycle: StoredChunk['chunk']['lifecycle'],
): StoredChunk {
	const [chunk] = extractHeadingChunks({
		id: 'sourceA',
		title: 'Source Note',
		body: '# First\nBody.',
	}, { now: 1234 });

	return {
		chunk: {
			...chunk,
			lifecycle,
			scheduler: {
				...chunk.scheduler,
				ankiCardId: cardId,
			},
		},
		joplinNoteId: 'joplin_note_1',
		title: 'First',
	};
}

class FakeChunkRepository implements Pick<ChunkRepository, 'findByAnkiCardId' | 'updateChunkNote'> {
	public updated: Array<{ joplinNoteId: string; chunk: ChunkRecord }> = [];

	public constructor(private readonly chunks: StoredChunk[]) {}

	public async findByAnkiCardId(cardId: number): Promise<StoredChunk | null> {
		return this.chunks.find(chunk => chunk.chunk.scheduler.ankiCardId === cardId) ?? null;
	}

	public async updateChunkNote(joplinNoteId: string, chunk: ChunkRecord): Promise<void> {
		this.updated.push({ joplinNoteId, chunk });
	}
}

interface FakeAnkiGatewayOptions {
	failReview?: boolean;
	failSchedulerInfo?: boolean;
	schedulerInfo?: SchedulerCardInfo;
}

class FakeAnkiGateway implements Pick<AnkiGateway, 'getCardSchedulerInfo' | 'reviewCard'> {
	public reviewCalls: Array<{ cardId: number; rating: AnkiReviewRating }> = [];
	public infoCalls: number[] = [];

	public constructor(private readonly options: FakeAnkiGatewayOptions = {}) {}

	public async reviewCard(cardId: number, rating: AnkiReviewRating): Promise<void> {
		if (this.options.failReview) throw new Error('Anki review failed');

		this.reviewCalls.push({ cardId, rating });
	}

	public async getCardSchedulerInfo(cardId: number): Promise<SchedulerCardInfo> {
		this.infoCalls.push(cardId);
		if (this.options.failSchedulerInfo) throw new Error('No card info');

		return this.options.schedulerInfo ?? {
			cardId,
			due: null,
			state: null,
		};
	}
}
