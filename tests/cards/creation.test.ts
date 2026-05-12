import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createHash } from 'crypto';

import {
	createdCardsDeckName,
	IR_BASIC_MODEL_NAME,
	IR_CLOZE_MODEL_NAME,
	type AnkiGateway,
	type CreatedCardBinding,
} from '../../src/anki/gateway';
import { CardCreationService } from '../../src/cards/creation';
import { extractHeadingChunks } from '../../src/chunks/extractor';
import type { ChunkRepository, StoredChunk } from '../../src/chunks/repository';
import type { ChunkRecord } from '../../src/chunks/types';

test('createBasicCard appends a created-card link to the chunk', async () => {
	const stored = storedChunk('Chunk body.');
	const chunks = new FakeChunkRepository();
	const anki = new FakeAnkiGateway();
	const service = new CardCreationService(chunks, anki, {
		now: () => 999,
	});

	const result = await service.createBasicCard(stored);

	assert.deepEqual(anki.ensureCalls, ['sourceA']);
	assert.equal(anki.basicCalls.length, 1);
	assert.equal(anki.basicCalls[0].front, 'Heading');
	assert.equal(anki.basicCalls[0].back, 'Chunk body.');
	assert.equal(result.createdCard.ankiNoteId, 1000);
	assert.deepEqual(result.createdCard.ankiCardIds, [2000]);
	assert.equal(result.createdCard.deckName, createdCardsDeckName('sourceA'));
	assert.equal(result.createdCard.modelName, IR_BASIC_MODEL_NAME);
	assert.equal(result.createdCard.sourceChunkId, stored.chunk.id);
	assert.equal(result.createdCard.sourceChunkVersion, 1);
	assert.equal(result.createdCard.sourceTextHash, stored.chunk.textHash);
	assert.equal(result.createdCard.status, 'active');
	assert.equal(chunks.updated.length, 1);
	assert.deepEqual(chunks.updated[0].chunk.createdCards, [result.createdCard]);
});

test('createClozeCard appends a Cloze created-card link', async () => {
	const stored = storedChunk('This has {{c1::a deletion}}.');
	const chunks = new FakeChunkRepository();
	const anki = new FakeAnkiGateway();
	const service = new CardCreationService(chunks, anki, {
		now: () => 1001,
	});

	const result = await service.createClozeCard(stored);

	assert.deepEqual(anki.ensureCalls, ['sourceA']);
	assert.equal(anki.clozeCalls.length, 1);
	assert.equal(anki.clozeCalls[0].text, 'This has {{c1::a deletion}}.');
	assert.equal(anki.clozeCalls[0].backExtra, 'Heading');
	assert.equal(result.createdCard.modelName, IR_CLOZE_MODEL_NAME);
	assert.equal(result.createdCard.createdAt, 1001);
	assert.equal(chunks.updated.length, 1);
});

test('createClozeCard requires cloze syntax before calling Anki', async () => {
	const chunks = new FakeChunkRepository();
	const anki = new FakeAnkiGateway();
	const service = new CardCreationService(chunks, anki);

	await assert.rejects(
		() => service.createClozeCard(storedChunk('Plain text.')),
		/Add Anki cloze syntax/,
	);
	assert.equal(anki.ensureCalls.length, 0);
	assert.equal(anki.clozeCalls.length, 0);
	assert.equal(chunks.updated.length, 0);
});

test('createBasicCard refuses duplicate active cards for the same chunk version', async () => {
	const stored = storedChunk('Chunk body.');
	stored.chunk.createdCards = [{
		ankiNoteId: 1,
		ankiCardIds: [2],
		deckName: createdCardsDeckName(stored.chunk.sourceNoteId),
		modelName: IR_BASIC_MODEL_NAME,
		sourceChunkId: stored.chunk.id,
		sourceChunkVersion: stored.chunk.version,
		sourceTextHash: stored.chunk.textHash,
		createdAt: 123,
		status: 'active',
	}];
	const chunks = new FakeChunkRepository();
	const anki = new FakeAnkiGateway();
	const service = new CardCreationService(chunks, anki);

	await assert.rejects(
		() => service.createBasicCard(stored),
		/already has an active IRBasic card/,
	);
	assert.equal(anki.ensureCalls.length, 0);
	assert.equal(anki.basicCalls.length, 0);
	assert.equal(chunks.updated.length, 0);
});

test('createBasicCard updates stale text provenance before creating a card', async () => {
	const stored = storedChunk('Original text.');
	const oldHash = stored.chunk.textHash;
	stored.chunk.text = 'Edited text.';
	stored.chunk.createdCards = [{
		ankiNoteId: 1,
		ankiCardIds: [2],
		deckName: createdCardsDeckName(stored.chunk.sourceNoteId),
		modelName: IR_BASIC_MODEL_NAME,
		sourceChunkId: stored.chunk.id,
		sourceChunkVersion: stored.chunk.version,
		sourceTextHash: oldHash,
		createdAt: 123,
		status: 'active',
	}];
	const service = new CardCreationService(
		new FakeChunkRepository(),
		new FakeAnkiGateway(),
		{ now: () => 444 },
	);

	const result = await service.createBasicCard(stored);

	assert.equal(result.storedChunk.chunk.version, 2);
	assert.equal(result.storedChunk.chunk.textHash, hashText('Edited text.'));
	assert.equal(result.storedChunk.chunk.createdCards[0].status, 'stale');
	assert.equal(result.createdCard.sourceChunkVersion, 2);
	assert.equal(result.createdCard.sourceTextHash, hashText('Edited text.'));
});

test('createBasicCard does not update metadata when Anki creation fails', async () => {
	const chunks = new FakeChunkRepository();
	const anki = new FakeAnkiGateway();
	anki.failBasic = true;
	const service = new CardCreationService(chunks, anki);

	await assert.rejects(
		() => service.createBasicCard(storedChunk('Chunk body.')),
		/Anki failed/,
	);
	assert.equal(chunks.updated.length, 0);
});

test('createBasicCard requires an active chunk', async () => {
	const stored = storedChunk('Chunk body.');
	stored.chunk.lifecycle = 'superseded';
	const service = new CardCreationService(new FakeChunkRepository(), new FakeAnkiGateway());

	await assert.rejects(
		() => service.createBasicCard(stored),
		/is not active/,
	);
});

function storedChunk(text: string): StoredChunk {
	const [chunk] = extractHeadingChunks({
		id: 'sourceA',
		title: 'Source Note',
		body: '# Heading\nChunk body.',
	}, { now: 1234 });

	return {
		chunk: {
			...chunk,
			text,
			textHash: hashText(text),
			version: 1,
		},
		joplinNoteId: 'chunk_note',
		title: 'Heading',
	};
}

class FakeChunkRepository implements Pick<ChunkRepository, 'updateChunkNote'> {
	public updated: Array<{ joplinNoteId: string; chunk: ChunkRecord }> = [];

	public async updateChunkNote(joplinNoteId: string, chunk: ChunkRecord): Promise<void> {
		this.updated.push({ joplinNoteId, chunk });
	}
}

class FakeAnkiGateway implements Pick<
	AnkiGateway,
	'createBasicCard' | 'createClozeCard' | 'ensureCreatedCardResources'
> {
	public ensureCalls: string[] = [];
	public basicCalls: Array<{ chunk: ChunkRecord; front: string; back: string }> = [];
	public clozeCalls: Array<{ chunk: ChunkRecord; text: string; backExtra: string }> = [];
	public failBasic = false;
	private nextNoteId = 1000;
	private nextCardId = 2000;

	public async ensureCreatedCardResources(sourceNoteId: string): Promise<void> {
		this.ensureCalls.push(sourceNoteId);
	}

	public async createBasicCard(
		chunk: ChunkRecord,
		front: string,
		back: string,
	): Promise<CreatedCardBinding> {
		if (this.failBasic) throw new Error('Anki failed');

		this.basicCalls.push({ chunk, front, back });
		return this.nextBinding();
	}

	public async createClozeCard(
		chunk: ChunkRecord,
		text: string,
		backExtra: string,
	): Promise<CreatedCardBinding> {
		this.clozeCalls.push({ chunk, text, backExtra });
		return this.nextBinding();
	}

	private nextBinding(): CreatedCardBinding {
		return {
			noteId: this.nextNoteId++,
			cardIds: [this.nextCardId++],
		};
	}
}

function hashText(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}
