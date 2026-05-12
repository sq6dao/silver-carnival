import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import type { AnkiGateway, SchedulerCardBinding } from '../../src/anki/gateway';
import type { ChunkRepository, StoredChunk } from '../../src/chunks/repository';
import type { ChunkRecord, JoplinSourceNote } from '../../src/chunks/types';
import { EnableIncrementalReadingService } from '../../src/plugin/enable-ir';

test('enable creates chunk notes, scheduler cards, and stores scheduler bindings', async () => {
	const repository = new FakeChunkRepository();
	const anki = new FakeAnkiGateway();
	const service = new EnableIncrementalReadingService(repository, anki, {
		now: () => 1234,
	});

	const result = await service.enable(sourceNote(`# One
Body.

# Two
More.`));

	assert.equal(result.createdCount, 2);
	assert.deepEqual(anki.ensureCalls, ['sourceA']);
	assert.equal(repository.saved.length, 2);
	assert.equal(anki.created.length, 2);
	assert.equal(repository.updated.length, 2);
	assert.equal(repository.updated[0].chunk.scheduler.ankiNoteId, 100);
	assert.equal(repository.updated[0].chunk.scheduler.ankiCardId, 200);
	assert.equal(repository.updated[0].chunk.scheduler.lastSyncAt, 1234);
	assert.equal(repository.updated[1].chunk.scheduler.ankiNoteId, 101);
	assert.equal(repository.updated[1].chunk.scheduler.ankiCardId, 201);
});

test('enable fails before creating chunks when already enabled', async () => {
	const repository = new FakeChunkRepository();
	repository.existingChunks = [storedChunk('existing')];
	const anki = new FakeAnkiGateway();
	const service = new EnableIncrementalReadingService(repository, anki);

	await assert.rejects(
		() => service.enable(sourceNote('# One\nBody.')),
		/already enabled/,
	);
	assert.deepEqual(anki.ensureCalls, []);
	assert.equal(repository.saved.length, 0);
});

test('enable fails before Anki when no chunks are found', async () => {
	const repository = new FakeChunkRepository();
	const anki = new FakeAnkiGateway();
	const service = new EnableIncrementalReadingService(repository, anki);

	await assert.rejects(
		() => service.enable(sourceNote('   \n\t')),
		/No readable chunks/,
	);
	assert.deepEqual(anki.ensureCalls, []);
	assert.equal(repository.saved.length, 0);
});

test('enable rolls back created chunk notes when Anki card creation fails', async () => {
	const repository = new FakeChunkRepository();
	const anki = new FakeAnkiGateway();
	anki.failOnCreate = true;
	const service = new EnableIncrementalReadingService(repository, anki);

	await assert.rejects(
		() => service.enable(sourceNote('# One\nBody.')),
		/Anki unavailable/,
	);
	assert.equal(repository.saved.length, 1);
	assert.deepEqual(repository.deleted, ['joplin_note_0']);
	assert.equal(repository.updated.length, 0);
});

function sourceNote(body: string): JoplinSourceNote {
	return {
		id: 'sourceA',
		title: 'Source Note',
		body,
	};
}

function storedChunk(id: string): StoredChunk {
	return {
		chunk: {
			id,
			rootChunkId: id,
			sourceNoteId: 'sourceA',
			sourceNoteTitle: 'Source Note',
			text: 'Body',
			textHash: 'hash',
			version: 1,
			lifecycle: 'active',
			scheduler: {
				deckName: 'IR::Chunks::sourceA',
				modelName: 'IRChunk',
			},
			createdCards: [],
			createdAt: 1,
			updatedAt: 1,
		},
		joplinNoteId: `joplin_${id}`,
		title: id,
	};
}

class FakeChunkRepository implements Pick<
	ChunkRepository,
	'deleteChunkNote' | 'listBySource' | 'saveNew' | 'updateChunkNote'
> {
	public existingChunks: StoredChunk[] = [];
	public saved: StoredChunk[] = [];
	public updated: Array<{ joplinNoteId: string; chunk: ChunkRecord }> = [];
	public deleted: string[] = [];

	public async listBySource(): Promise<StoredChunk[]> {
		return this.existingChunks;
	}

	public async saveNew(chunk: ChunkRecord): Promise<StoredChunk> {
		const stored = {
			chunk,
			joplinNoteId: `joplin_note_${this.saved.length}`,
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

class FakeAnkiGateway implements Pick<AnkiGateway, 'createChunkNote' | 'ensureSchedulerResources'> {
	public ensureCalls: string[] = [];
	public created: Array<{ chunk: ChunkRecord; joplinNoteId: string }> = [];
	public failOnCreate = false;

	public async ensureSchedulerResources(sourceNoteId: string): Promise<void> {
		this.ensureCalls.push(sourceNoteId);
	}

	public async createChunkNote(
		chunk: ChunkRecord,
		joplinNoteId: string,
	): Promise<SchedulerCardBinding> {
		if (this.failOnCreate) throw new Error('Anki unavailable');

		this.created.push({ chunk, joplinNoteId });

		return {
			noteId: 100 + this.created.length - 1,
			cardId: 200 + this.created.length - 1,
		};
	}
}
