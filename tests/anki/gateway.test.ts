import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createServer } from 'http';

import {
	AnkiConnectGateway,
	IR_BASIC_MODEL_NAME,
	IR_CHUNK_MODEL_FIELDS,
	IR_CHUNK_MODEL_NAME,
	IR_CLOZE_MODEL_NAME,
	chunkDeckName,
	createdCardsDeckName,
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

test('ensureCreatedCardResources creates card deck and missing models', async () => {
	const transport = new FakeAnkiTransport({
		modelNames: [IR_CHUNK_MODEL_NAME],
	});
	const gateway = new AnkiConnectGateway({ transport: transport.send });

	await gateway.ensureCreatedCardResources('sourceA');

	assert.deepEqual(transport.actions(), ['createDeck', 'modelNames', 'createModel', 'createModel']);
	assert.deepEqual(transport.calls[0].params, { deck: createdCardsDeckName('sourceA') });
	assert.equal(transport.calls[2].params?.modelName, IR_BASIC_MODEL_NAME);
	assert.equal(transport.calls[3].params?.modelName, IR_CLOZE_MODEL_NAME);
	assert.equal(transport.calls[3].params?.isCloze, true);
});

test('ensureCreatedCardResources reuses existing card models', async () => {
	const transport = new FakeAnkiTransport({
		modelNames: [IR_BASIC_MODEL_NAME, IR_CLOZE_MODEL_NAME],
	});
	const gateway = new AnkiConnectGateway({ transport: transport.send });

	await gateway.ensureCreatedCardResources('sourceA');

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

test('createBasicCard adds an independent Basic card with provenance fields', async () => {
	const transport = new FakeAnkiTransport({
		addNoteResult: 123,
		findCardsResult: [456],
	});
	const gateway = new AnkiConnectGateway({ transport: transport.send });
	const chunk = sampleChunk();

	assert.deepEqual(await gateway.createBasicCard(chunk, 'Front', 'Back'), {
		noteId: 123,
		cardIds: [456],
	});

	const addNote = transport.calls[0].params?.note as Record<string, unknown>;
	assert.equal(addNote.deckName, createdCardsDeckName('sourceA'));
	assert.equal(addNote.modelName, IR_BASIC_MODEL_NAME);
	assert.deepEqual(addNote.tags, ['joplin-ir', 'ir-created-card', 'ir-basic']);
	assert.deepEqual(addNote.options, {
		allowDuplicate: false,
		duplicateScope: 'deck',
	});
	assert.deepEqual(addNote.fields, {
		Front: 'Front',
		Back: 'Back',
		sourceChunkId: chunk.id,
		sourceChunkVersion: String(chunk.version),
		sourceTextHash: chunk.textHash,
	});
});

test('createClozeCard adds an independent Cloze card with provenance fields', async () => {
	const transport = new FakeAnkiTransport({
		addNoteResult: 123,
		findCardsResult: [456, 457],
	});
	const gateway = new AnkiConnectGateway({ transport: transport.send });
	const chunk = sampleChunk();

	assert.deepEqual(await gateway.createClozeCard(chunk, '{{c1::Front}}', 'Extra'), {
		noteId: 123,
		cardIds: [456, 457],
	});

	const addNote = transport.calls[0].params?.note as Record<string, unknown>;
	assert.equal(addNote.deckName, createdCardsDeckName('sourceA'));
	assert.equal(addNote.modelName, IR_CLOZE_MODEL_NAME);
	assert.deepEqual(addNote.tags, ['joplin-ir', 'ir-created-card', 'ir-cloze']);
	assert.deepEqual(addNote.fields, {
		Text: '{{c1::Front}}',
		'Back Extra': 'Extra',
		sourceChunkId: chunk.id,
		sourceChunkVersion: String(chunk.version),
		sourceTextHash: chunk.textHash,
	});
});

test('created card creation throws when Anki returns no cards', async () => {
	const transport = new FakeAnkiTransport({
		addNoteResult: 123,
		findCardsResult: [],
	});
	const gateway = new AnkiConnectGateway({ transport: transport.send });

	await assert.rejects(
		() => gateway.createBasicCard(sampleChunk(), 'Front', 'Back'),
		/did not return cards/,
	);
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

test('suspendCard sends an Anki suspend request', async () => {
	const transport = new FakeAnkiTransport();
	const gateway = new AnkiConnectGateway({ transport: transport.send });

	await gateway.suspendCard(456);

	assert.deepEqual(transport.actions(), ['suspend']);
	assert.deepEqual(transport.calls[0].params, {
		cards: [456],
	});
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

test('reviewCard sends an Anki answerCards request', async () => {
	const transport = new FakeAnkiTransport();
	const gateway = new AnkiConnectGateway({ transport: transport.send });

	await gateway.reviewCard(456, 3);

	assert.deepEqual(transport.actions(), ['answerCards']);
	assert.deepEqual(transport.calls[0].params, {
		answers: [{
			cardId: 456,
			ease: 3,
		}],
	});
});

test('getCardSchedulerInfo maps cardsInfo into scheduler metadata', async () => {
	const transport = new FakeAnkiTransport({
		cardsInfoResult: [{
			cardId: 456,
			type: 2,
			queue: 2,
			due: 42,
		}],
	});
	const gateway = new AnkiConnectGateway({ transport: transport.send });

	assert.deepEqual(await gateway.getCardSchedulerInfo(456), {
		cardId: 456,
		due: 42,
		state: 'review',
	});
	assert.deepEqual(transport.calls[0].params, {
		cards: [456],
	});
});

test('getCardSchedulerInfo maps suspended cards from queue', async () => {
	const transport = new FakeAnkiTransport({
		cardsInfoResult: [{
			cardId: 456,
			type: 2,
			queue: -1,
			due: 42,
		}],
	});
	const gateway = new AnkiConnectGateway({ transport: transport.send });

	assert.equal((await gateway.getCardSchedulerInfo(456)).state, 'suspended');
});

test('getCardSchedulerInfo throws when card info is missing', async () => {
	const transport = new FakeAnkiTransport({
		cardsInfoResult: [],
	});
	const gateway = new AnkiConnectGateway({ transport: transport.send });

	await assert.rejects(
		() => gateway.getCardSchedulerInfo(456),
		/did not return scheduler info/,
	);
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

test('AnkiConnect transport errors include the failing action name', async () => {
	const gateway = new AnkiConnectGateway({
		transport: async () => {
			throw new Error('socket hang up');
		},
	});

	await assert.rejects(
		() => gateway.getDueChunkCardIds(),
		/AnkiConnect findCards request failed: socket hang up/,
	);
});

test('HTTP transport requests a closed connection for AnkiConnect compatibility', async () => {
	let connectionHeader: string | undefined;
	const server = createServer((request, response) => {
		connectionHeader = request.headers.connection;
		const chunks: Buffer[] = [];

		request.on('data', chunk => chunks.push(Buffer.from(chunk)));
		request.on('end', () => {
			response.setHeader('Content-Type', 'application/json');
			response.end(JSON.stringify({
				result: [123],
				error: null,
			}));
		});
	});

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});

	try {
		const address = server.address();
		if (typeof address !== 'object' || address === null) {
			throw new Error('Expected the test server to listen on a TCP port.');
		}

		const gateway = new AnkiConnectGateway({
			endpoint: `http://127.0.0.1:${address.port}`,
		});

		assert.deepEqual(await gateway.getDueChunkCardIds(), [123]);
		assert.equal(connectionHeader, 'close');
	} finally {
		await new Promise<void>(resolve => server.close(() => resolve()));
	}
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
	cardsInfoResult?: unknown[];
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

		if (request.action === 'answerCards') {
			return { result: [true], error: null };
		}

		if (request.action === 'suspend') {
			return { result: true, error: null };
		}

		if (request.action === 'cardsInfo') {
			return {
				result: this.options.cardsInfoResult ?? [{
					cardId: 456,
					type: 2,
					queue: 2,
					due: 42,
				}],
				error: null,
			};
		}

		throw new Error(`Unexpected action: ${request.action}`);
	}
}
