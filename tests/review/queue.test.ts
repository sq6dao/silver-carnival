import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { extractHeadingChunks } from '../../src/chunks/extractor';
import type { ChunkRepository, StoredChunk } from '../../src/chunks/repository';
import { AnkiReviewQueueService } from '../../src/review/queue';

test('getDueChunks maps due Anki card ids to active chunks', async () => {
	const chunkA = storedChunk(1, 'active');
	const chunkB = storedChunk(2, 'active');
	const service = new AnkiReviewQueueService(
		{ getDueChunkCardIds: async () => [1, 2] },
		repository([chunkA, chunkB]),
	);

	assert.deepEqual(await service.getDueChunks(), [chunkA, chunkB]);
});

test('getDueChunks ignores due cards without stored chunks', async () => {
	const chunk = storedChunk(1, 'active');
	const service = new AnkiReviewQueueService(
		{ getDueChunkCardIds: async () => [1, 404] },
		repository([chunk]),
	);

	assert.deepEqual(await service.getDueChunks(), [chunk]);
});

test('getDueChunks ignores non-active chunks', async () => {
	const active = storedChunk(1, 'active');
	const paused = storedChunk(2, 'paused');
	const done = storedChunk(3, 'done');
	const service = new AnkiReviewQueueService(
		{ getDueChunkCardIds: async () => [1, 2, 3] },
		repository([active, paused, done]),
	);

	assert.deepEqual(await service.getDueChunks(), [active]);
});

function storedChunk(
	cardId: number,
	lifecycle: StoredChunk['chunk']['lifecycle'],
): StoredChunk {
	const [chunk] = extractHeadingChunks({
		id: `source_${cardId}`,
		title: 'Source Note',
		body: `# Chunk ${cardId}\nBody.`,
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
		joplinNoteId: `joplin_note_${cardId}`,
		title: `Chunk ${cardId}`,
	};
}

function repository(chunks: StoredChunk[]): Pick<ChunkRepository, 'findByAnkiCardId'> {
	return {
		findByAnkiCardId: async cardId => (
			chunks.find(chunk => chunk.chunk.scheduler.ankiCardId === cardId) ?? null
		),
	};
}
