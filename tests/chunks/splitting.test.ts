import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import type { AnkiGateway, SchedulerCardBinding } from '../../src/anki/gateway';
import { extractHeadingChunks } from '../../src/chunks/extractor';
import type { ChunkRepository, StoredChunk } from '../../src/chunks/repository';
import { CHUNK_SPLIT_MARKER, SplitChunkService } from '../../src/chunks/splitting';
import type { ChunkRecord } from '../../src/chunks/types';

test('split creates child chunks and supersedes the parent', async () => {
	const parent = storedParent(`# Parent
First part.

${CHUNK_SPLIT_MARKER}

Second part.`);
	const chunks = new FakeChunkRepository();
	const anki = new FakeAnkiGateway();
	const service = new SplitChunkService(chunks, anki, {
		now: () => 999,
	});

	const result = await service.split(parent);

	assert.deepEqual(anki.ensureCalls, ['sourceA']);
	assert.equal(result.children.length, 2);
	assert.equal(result.children[0].chunk.id, `${parent.chunk.id}_split_1`);
	assert.equal(result.children[1].chunk.id, `${parent.chunk.id}_split_2`);
	assert.equal(result.children[0].chunk.parentChunkId, parent.chunk.id);
	assert.equal(result.children[0].chunk.rootChunkId, parent.chunk.rootChunkId);
	assert.equal(result.children[0].chunk.lifecycle, 'active');
	assert.equal(result.children[0].chunk.scheduler.ankiNoteId, 100);
	assert.equal(result.children[0].chunk.scheduler.ankiCardId, 200);
	assert.equal(result.children[1].chunk.scheduler.ankiNoteId, 101);
	assert.equal(result.children[1].chunk.scheduler.ankiCardId, 201);
	assert.equal(result.parent.chunk.lifecycle, 'superseded');
	assert.equal(result.parent.chunk.scheduler.lastKnownState, 'suspended');
	assert.equal(result.parent.chunk.scheduler.lastSyncAt, 999);
	assert.deepEqual(anki.suspendedCards, [456]);
	assert.equal(chunks.updated[chunks.updated.length - 1].joplinNoteId, parent.joplinNoteId);
});

test('split requires an active parent chunk', async () => {
	const parent = storedParent(`# Parent
One.

${CHUNK_SPLIT_MARKER}

Two.`);
	parent.chunk.lifecycle = 'done';
	const service = new SplitChunkService(new FakeChunkRepository(), new FakeAnkiGateway());

	await assert.rejects(
		() => service.split(parent),
		/is not active/,
	);
});

test('split requires a scheduler card to suspend', async () => {
	const parent = storedParent(`# Parent
One.

${CHUNK_SPLIT_MARKER}

Two.`);
	delete parent.chunk.scheduler.ankiCardId;
	const service = new SplitChunkService(new FakeChunkRepository(), new FakeAnkiGateway());

	await assert.rejects(
		() => service.split(parent),
		/has no scheduler card/,
	);
});

test('split requires at least two non-empty parts', async () => {
	const parent = storedParent('# Parent\nOnly one part.');
	const service = new SplitChunkService(new FakeChunkRepository(), new FakeAnkiGateway());

	await assert.rejects(
		() => service.split(parent),
		/Add <!-- ir-split -->/,
	);
});

test('split rolls back child notes when scheduler creation fails', async () => {
	const parent = storedParent(`# Parent
One.

${CHUNK_SPLIT_MARKER}

Two.`);
	const chunks = new FakeChunkRepository();
	const anki = new FakeAnkiGateway();
	anki.failCreateChunkNote = true;
	const service = new SplitChunkService(chunks, anki);

	await assert.rejects(
		() => service.split(parent),
		/Anki failed/,
	);
	assert.deepEqual(chunks.deleted, ['child_note_0']);
	assert.deepEqual(anki.suspendedCards, []);
	assert.equal(chunks.updated.length, 0);
});

function storedParent(text: string): StoredChunk {
	const [chunk] = extractHeadingChunks({
		id: 'sourceA',
		title: 'Source Note',
		body: '# Source\nBody.',
	}, { now: 1234 });

	return {
		chunk: {
			...chunk,
			id: 'chunk_parent',
			rootChunkId: 'chunk_parent',
			text,
			scheduler: {
				...chunk.scheduler,
				ankiNoteId: 123,
				ankiCardId: 456,
			},
		},
		joplinNoteId: 'parent_note',
		title: 'Parent',
	};
}

class FakeChunkRepository implements Pick<
	ChunkRepository,
	'deleteChunkNote' | 'saveNew' | 'updateChunkNote'
> {
	public saved: StoredChunk[] = [];
	public updated: Array<{ joplinNoteId: string; chunk: ChunkRecord }> = [];
	public deleted: string[] = [];

	public async saveNew(chunk: ChunkRecord): Promise<StoredChunk> {
		const stored = {
			chunk,
			joplinNoteId: `child_note_${this.saved.length}`,
			title: chunk.headingPath?.join(' / ') ?? chunk.id,
		};
		this.saved.push(stored);

		return stored;
	}

	public async updateChunkNote(joplinNoteId: string, chunk: ChunkRecord): Promise<void> {
		this.updated.push({ joplinNoteId, chunk });
	}

	public async deleteChunkNote(joplinNoteId: string): Promise<void> {
		this.deleted.push(joplinNoteId);
	}
}

class FakeAnkiGateway implements Pick<
	AnkiGateway,
	'createChunkNote' | 'ensureSchedulerResources' | 'suspendCard'
> {
	public ensureCalls: string[] = [];
	public suspendedCards: number[] = [];
	public failCreateChunkNote = false;
	private createdCards = 0;

	public async ensureSchedulerResources(sourceNoteId: string): Promise<void> {
		this.ensureCalls.push(sourceNoteId);
	}

	public async createChunkNote(): Promise<SchedulerCardBinding> {
		if (this.failCreateChunkNote) throw new Error('Anki failed');

		return {
			noteId: 100 + this.createdCards,
			cardId: 200 + this.createdCards++,
		};
	}

	public async suspendCard(cardId: number): Promise<void> {
		this.suspendedCards.push(cardId);
	}
}
