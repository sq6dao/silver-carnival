import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
	AnkiConnectGateway,
	IR_CHUNK_MODEL_FIELDS,
	IR_CHUNK_MODEL_NAME,
	chunkDeckName,
	type AnkiConnectRequest,
	type AnkiConnectResponse,
	type AnkiConnectTransport,
} from '../../src/anki/gateway';
import { extractHeadingChunks } from '../../src/chunks/extractor';
import type { ChunkRecord } from '../../src/chunks/types';

test('ensureSchedulerResources creates the scheduler deck and model when missing', async () => {
	const transport = new FakeAnkiTransport({
		modelNames: [],
	});
	const gateway = new AnkiConnectGateway({ transport: transport.send });

	await gateway.ensureSchedulerResources('sourceA');

	assert.deepEqual(transport.actions(), ['createDeck', 'modelNames', 'createModel']);
	assert.deepEqual(transport.calls[0].params, { deck: chunkDeckName('sourceA') });
	assert.deepEqual(transport.calls[2].params?.modelName, IR_CHUNK_MODEL_NAME);
	assert.deepEqual(transport.calls[2].params?.inOrderFields, IR_CHUNK_MODEL_FIELDS);
});

test('ensureSchedulerResources reuses an existing scheduler model', async () => {
	const transport = new FakeAnkiTransport({
		modelNames: [IR_CHUNK_MODEL_NAME],
	});
	const gateway = new AnkiConnectGateway({ transport: transport.send });

	await gateway.ensureSchedulerResources('sourceA');

	assert.deepEqual(transport.actions(), ['createDeck', 'modelNames']);
});

test('createChunkNote adds an Anki note and returns its first card id', async () => {
	const transport = new FakeAnkiTransport({
		addNoteResult: 123,
		findCardsResult: [456],
	});
	const gateway = new AnkiConnectGateway({ transport: transport.send });
	const chunk = sampleChunk();

	const binding = await gateway.createChunkNote(chunk, 'joplin_note_1');

	assert.deepEqual(binding, { noteId: 123, cardId: 456 });
	assert.deepEqual(transport.actions(), ['addNote', 'findCards']);
	assert.deepEqual(transport.calls[1].params, { query: 'nid:123' });

	const addNote = transport.calls[0].params?.note as Record<string, unknown>;
	assert.equal(addNote.deckName, chunk.scheduler.deckName);
	assert.equal(addNote.modelName, chunk.scheduler.modelName);
	assert.deepEqual(addNote.options, {
		allowDuplicate: false,
		duplicateScope: 'deck',
	});
	assert.deepEqual(addNote.tags, ['joplin-ir', 'ir-chunk']);

	const fields = addNote.fields as Record<string, string>;
	assert.equal(fields.chunkId, chunk.id);
	assert.equal(fields.rootChunkId, chunk.rootChunkId);
	assert.equal(fields.joplinNoteId, 'joplin_note_1');
	assert.equal(fields.joplinNoteTitle, chunk.sourceNoteTitle);
	assert.equal(fields.chunkVersion, '1');
	assert.equal(fields.chunkTextHash, chunk.textHash);
	assert.equal(fields.headingPath, JSON.stringify(chunk.headingPath));
	assert.equal(fields.anchorData, JSON.stringify(chunk.anchor));
	assert.equal(fields.displayTitle, 'First');
});

test('createChunkNote throws when Anki returns no scheduler card', async () => {
	const transport = new FakeAnkiTransport({
		addNoteResult: 123,
		findCardsResult: [],
	});
	const gateway = new AnkiConnectGateway({ transport: transport.send });

	await assert.rejects(
		() => gateway.createChunkNote(sampleChunk(), 'joplin_note_1'),
		/did not return a card/,
	);
});

test('getDueChunkCardIds queries due and new IRChunk cards', async () => {
	const transport = new FakeAnkiTransport({
		findCardsResult: [1, 2],
	});
	const gateway = new AnkiConnectGateway({ transport: transport.send });

	assert.deepEqual(await gateway.getDueChunkCardIds(), [1, 2]);
	assert.deepEqual(transport.calls[0].params, {
		query: `note:${IR_CHUNK_MODEL_NAME} (is:new OR is:due)`,
	});
});

test('AnkiConnect errors include the failing action name', async () => {
	const gateway = new AnkiConnectGateway({
		transport: async request => ({
			result: null,
			error: `${request.action} exploded`,
		}),
	});

	await assert.rejects(
		() => gateway.getDueChunkCardIds(),
		/AnkiConnect findCards failed: findCards exploded/,
	);
});

function sampleChunk(): ChunkRecord {
	const [chunk] = extractHeadingChunks({
		id: 'sourceA',
		title: 'Source Note',
		body: '# First\nBody.',
	}, { now: 1234 });

	return chunk;
}

interface FakeAnkiTransportOptions {
	modelNames?: string[];
	addNoteResult?: number;
	findCardsResult?: number[];
}

class FakeAnkiTransport {
	public calls: AnkiConnectRequest[] = [];

	public constructor(private readonly options: FakeAnkiTransportOptions = {}) {}

	public send: AnkiConnectTransport = async request => {
		this.calls.push(request);

		return this.responseFor(request);
	};

	public actions(): string[] {
		return this.calls.map(call => call.action);
	}

	private responseFor(request: AnkiConnectRequest): AnkiConnectResponse {
		if (request.action === 'createDeck') {
			return { result: 1, error: null };
		}

		if (request.action === 'modelNames') {
			return { result: this.options.modelNames ?? [], error: null };
		}

		if (request.action === 'createModel') {
			return { result: null, error: null };
		}

		if (request.action === 'addNote') {
			return { result: this.options.addNoteResult ?? 123, error: null };
		}

		if (request.action === 'findCards') {
			return { result: this.options.findCardsResult ?? [456], error: null };
		}

		throw new Error(`Unexpected action: ${request.action}`);
	}
}
