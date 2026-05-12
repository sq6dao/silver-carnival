import { createHash } from 'crypto';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { extractHeadingChunks } from '../../src/chunks/extractor';
import type { ChunkRecord, JoplinSourceNote } from '../../src/chunks/types';

test('extracts non-overlapping chunks from flat heading boundaries', () => {
	const note = sourceNote(`# One
First paragraph.

## Two
Second paragraph.

# Three
Third paragraph.`);

	const chunks = extractHeadingChunks(note, { now: 1234 });

	assert.equal(chunks.length, 3);
	assert.equal(chunks[0].text, '# One\nFirst paragraph.');
	assert.equal(chunks[1].text, '## Two\nSecond paragraph.');
	assert.equal(chunks[2].text, '# Three\nThird paragraph.');
	assertNonOverlappingSourceSlices(note.body, chunks);
});

test('creates an intro chunk for content before the first heading', () => {
	const note = sourceNote(`Intro paragraph.

# First
Body.`);

	const chunks = extractHeadingChunks(note, { now: 1234 });

	assert.equal(chunks.length, 2);
	assert.equal(chunks[0].text, 'Intro paragraph.');
	assert.deepEqual(chunks[0].headingPath, ['Source Note']);
	assert.equal(chunks[1].text, '# First\nBody.');
	assert.deepEqual(chunks[1].headingPath, ['First']);
	assertNonOverlappingSourceSlices(note.body, chunks);
});

test('creates a single intro chunk when the note has no headings', () => {
	const note = sourceNote('Only body text.');

	const chunks = extractHeadingChunks(note, { now: 1234 });

	assert.equal(chunks.length, 1);
	assert.equal(chunks[0].text, 'Only body text.');
	assert.deepEqual(chunks[0].headingPath, ['Source Note']);
	assertNonOverlappingSourceSlices(note.body, chunks);
});

test('tracks nested heading paths while keeping chunk text flat', () => {
	const note = sourceNote(`# Parent
Parent text.

## Child
Child text.

### Grandchild
Grandchild text.`);

	const chunks = extractHeadingChunks(note, { now: 1234 });

	assert.equal(chunks.length, 3);
	assert.equal(chunks[0].text, '# Parent\nParent text.');
	assert.equal(chunks[1].text, '## Child\nChild text.');
	assert.equal(chunks[2].text, '### Grandchild\nGrandchild text.');
	assert.deepEqual(chunks[0].headingPath, ['Parent']);
	assert.deepEqual(chunks[1].headingPath, ['Parent', 'Child']);
	assert.deepEqual(chunks[2].headingPath, ['Parent', 'Child', 'Grandchild']);
	assertNonOverlappingSourceSlices(note.body, chunks);
});

test('skips whitespace-only intro and trims section edges', () => {
	const note = sourceNote(`
   
# First


## Second
	
`);

	const chunks = extractHeadingChunks(note, { now: 1234 });

	assert.equal(chunks.length, 2);
	assert.equal(chunks[0].text, '# First');
	assert.equal(chunks[1].text, '## Second');
	assertNonOverlappingSourceSlices(note.body, chunks);
});

test('sets stable M1 chunk defaults and hashes', () => {
	const note = sourceNote('# First\nBody.');

	const chunks = extractHeadingChunks(note, { now: 1234 });
	const chunk = chunks[0];

	assert.equal(chunk.id, 'chunk_note123_0');
	assert.equal(chunk.rootChunkId, 'chunk_note123_0');
	assert.equal(chunk.parentChunkId, undefined);
	assert.equal(chunk.sourceNoteId, 'note123');
	assert.equal(chunk.sourceNoteTitle, 'Source Note');
	assert.equal(chunk.version, 1);
	assert.equal(chunk.lifecycle, 'active');
	assert.equal(chunk.createdAt, 1234);
	assert.equal(chunk.updatedAt, 1234);
	assert.equal(chunk.textHash, sha256(chunk.text));
	assert.deepEqual(chunk.createdCards, []);
	assert.deepEqual(chunk.scheduler, {
		deckName: 'IR::Chunks::note123',
		modelName: 'IRChunk',
		lastKnownDue: null,
		lastKnownState: null,
		lastSyncAt: null,
	});
	assert.deepEqual(chunk.anchor, {
		startOffset: 0,
		endOffset: note.body.length,
		textHash: sha256(chunk.text),
		headingPath: ['First'],
	});
});

function sourceNote(body: string): JoplinSourceNote {
	return {
		id: 'note123',
		title: 'Source Note',
		body,
	};
}

function assertNonOverlappingSourceSlices(body: string, chunks: ChunkRecord[]): void {
	for (let index = 0; index < chunks.length; index++) {
		const chunk = chunks[index];

		assert.equal(
			body.slice(chunk.anchor?.startOffset, chunk.anchor?.endOffset),
			chunk.text,
		);

		if (index > 0) {
			const previous = chunks[index - 1];

			assert.ok(
				(previous.anchor?.endOffset ?? 0) <= (chunk.anchor?.startOffset ?? 0),
				`chunk ${index} overlaps previous chunk`,
			);
		}
	}
}

function sha256(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}
