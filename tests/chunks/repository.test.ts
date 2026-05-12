import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { extractHeadingChunks } from '../../src/chunks/extractor';
import { parseChunkMetadata } from '../../src/chunks/metadata';
import {
	IR_CHUNKS_NOTEBOOK_TITLE,
	JoplinChunkRepository,
	type JoplinDataApi,
} from '../../src/chunks/repository';
import type { ChunkRecord } from '../../src/chunks/types';

test('saveNew creates the IR Chunks notebook and stores chunk metadata', async () => {
	const data = new FakeJoplinData();
	const repository = new JoplinChunkRepository(data);
	const chunk = sampleChunk('sourceA');

	const stored = await repository.saveNew(chunk);

	assert.equal(data.folders.length, 1);
	assert.equal(data.folders[0].title, IR_CHUNKS_NOTEBOOK_TITLE);
	assert.equal(data.notes.length, 1);
	assert.equal(data.notes[0].parent_id, data.folders[0].id);
	assert.equal(data.notes[0].title, 'First');
	assert.equal(stored.joplinNoteId, data.notes[0].id);
	assert.deepEqual(parseChunkMetadata(data.notes[0].body)?.chunk, chunk);
});

test('saveNew reuses an existing IR Chunks notebook', async () => {
	const data = new FakeJoplinData();
	data.folders.push({ id: 'folder_existing', title: IR_CHUNKS_NOTEBOOK_TITLE });
	const repository = new JoplinChunkRepository(data);

	await repository.saveNew(sampleChunk('sourceA'));

	assert.equal(data.folders.length, 1);
	assert.equal(data.notes[0].parent_id, 'folder_existing');
});

test('listBySource parses chunk notes and filters by source note id', async () => {
	const data = new FakeJoplinData();
	const repository = new JoplinChunkRepository(data);
	const sourceChunk = sampleChunk('sourceA');
	const otherChunk = sampleChunk('sourceB');
	await repository.saveNew(sourceChunk);
	await repository.saveNew(otherChunk);
	data.notes.push({
		id: 'plain_note',
		parent_id: data.folders[0].id,
		title: 'Plain',
		body: '# Not a chunk',
	});

	const chunks = await repository.listBySource('sourceA');

	assert.equal(chunks.length, 1);
	assert.equal(chunks[0].chunk.id, sourceChunk.id);
	assert.equal(chunks[0].title, 'First');
});

test('updateChunkNote writes updated scheduler metadata', async () => {
	const data = new FakeJoplinData();
	const repository = new JoplinChunkRepository(data);
	const stored = await repository.saveNew(sampleChunk('sourceA'));
	const updated = {
		...stored.chunk,
		scheduler: {
			...stored.chunk.scheduler,
			ankiNoteId: 123,
			ankiCardId: 456,
		},
	};

	await repository.updateChunkNote(stored.joplinNoteId, updated);

	const parsed = parseChunkMetadata(data.notes[0].body);
	assert.ok(parsed);
	assert.equal(parsed.chunk.scheduler.ankiNoteId, 123);
	assert.equal(parsed.chunk.scheduler.ankiCardId, 456);
});

test('findByAnkiCardId returns the stored chunk for a scheduler card', async () => {
	const data = new FakeJoplinData();
	const repository = new JoplinChunkRepository(data);
	const chunk = {
		...sampleChunk('sourceA'),
		scheduler: {
			...sampleChunk('sourceA').scheduler,
			ankiCardId: 456,
		},
	};
	await repository.saveNew(chunk);

	assert.equal((await repository.findByAnkiCardId(456))?.chunk.id, chunk.id);
	assert.equal(await repository.findByAnkiCardId(789), null);
});

test('deleteChunkNote deletes a stored chunk note', async () => {
	const data = new FakeJoplinData();
	const repository = new JoplinChunkRepository(data);
	const stored = await repository.saveNew(sampleChunk('sourceA'));

	await repository.deleteChunkNote(stored.joplinNoteId);

	assert.equal(data.notes.length, 0);
});

function sampleChunk(sourceNoteId: string): ChunkRecord {
	const [chunk] = extractHeadingChunks({
		id: sourceNoteId,
		title: 'Source Note',
		body: '# First\nBody.',
	}, { now: 1234 });

	return chunk;
}

interface FakeFolder {
	id: string;
	title: string;
}

interface FakeNote {
	id: string;
	parent_id: string;
	title: string;
	body: string;
}

class FakeJoplinData implements JoplinDataApi {
	public folders: FakeFolder[] = [];
	public notes: FakeNote[] = [];
	private nextFolderId = 1;
	private nextNoteId = 1;

	public async get(path: string[], query?: Record<string, unknown>): Promise<unknown> {
		if (path.length === 1 && path[0] === 'folders') {
			return page(this.folders, query);
		}

		if (path.length === 3 && path[0] === 'folders' && path[2] === 'notes') {
			const folderId = path[1];
			return page(this.notes.filter(note => note.parent_id === folderId), query);
		}

		throw new Error(`Unexpected get path: ${path.join('/')}`);
	}

	public async post(
		path: string[],
		_query?: Record<string, unknown> | null,
		body?: Record<string, unknown>,
	): Promise<unknown> {
		if (path.length === 1 && path[0] === 'folders') {
			const folder = {
				id: `folder_${this.nextFolderId++}`,
				title: String(body?.title),
			};
			this.folders.push(folder);
			return folder;
		}

		if (path.length === 1 && path[0] === 'notes') {
			const note = {
				id: `note_${this.nextNoteId++}`,
				parent_id: String(body?.parent_id),
				title: String(body?.title),
				body: String(body?.body),
			};
			this.notes.push(note);
			return note;
		}

		throw new Error(`Unexpected post path: ${path.join('/')}`);
	}

	public async put(
		path: string[],
		_query?: Record<string, unknown> | null,
		body?: Record<string, unknown>,
	): Promise<unknown> {
		if (path.length === 2 && path[0] === 'notes') {
			const note = this.notes.find(item => item.id === path[1]);
			if (!note) throw new Error(`Missing note ${path[1]}`);
			note.title = String(body?.title);
			note.body = String(body?.body);
			return note;
		}

		throw new Error(`Unexpected put path: ${path.join('/')}`);
	}

	public async delete(path: string[]): Promise<unknown> {
		if (path.length === 2 && path[0] === 'notes') {
			this.notes = this.notes.filter(note => note.id !== path[1]);
			return {};
		}

		throw new Error(`Unexpected delete path: ${path.join('/')}`);
	}
}

function page<T>(items: T[], query?: Record<string, unknown>): { items: T[]; has_more: boolean } {
	const limit = typeof query?.limit === 'number' ? query.limit : 100;
	const pageNumber = typeof query?.page === 'number' ? query.page : 1;
	const start = (pageNumber - 1) * limit;
	const selected = items.slice(start, start + limit);

	return {
		items: selected,
		has_more: start + limit < items.length,
	};
}
