import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { extractHeadingChunks } from '../../src/chunks/extractor';
import {
	parseChunkMetadata,
	renderChunkNoteBody,
	serializeChunkMetadata,
} from '../../src/chunks/metadata';
import type { ChunkRecord } from '../../src/chunks/types';

test('renderChunkNoteBody emits frontmatter, body text, and source link', () => {
	const chunk = sampleChunk();

	const rendered = renderChunkNoteBody(chunk);

	assert.ok(rendered.startsWith('---\ntype: ir-chunk\n'));
	assert.match(rendered, /^parentChunkId: null$/m);
	assert.match(rendered, /^  ankiNoteId: null$/m);
	assert.match(rendered, /^# First$/m);
	assert.match(
		rendered,
		/Open source note: joplin:\/\/x-callback-url\/openNote\?id=note123/,
	);
});

test('parseChunkMetadata round-trips a rendered unscheduled chunk', () => {
	const chunk = sampleChunk();

	const parsed = parseChunkMetadata(renderChunkNoteBody(chunk));

	assert.ok(parsed);
	assert.equal(parsed.body, chunk.text);
	assert.deepEqual(parsed.chunk, chunk);
});

test('parseChunkMetadata returns null for notes without frontmatter', () => {
	assert.equal(parseChunkMetadata('# Plain note\nBody.'), null);
});

test('parseChunkMetadata returns null for other frontmatter types', () => {
	const parsed = parseChunkMetadata(`---
type: other-note
---
Body.`);

	assert.equal(parsed, null);
});

test('parseChunkMetadata throws a useful error for malformed YAML', () => {
	assert.throws(
		() => parseChunkMetadata(`---
type: ir-chunk
id: [
---
Body.`),
		/Invalid chunk metadata YAML/,
	);
});

test('parseChunkMetadata throws a useful error for missing required metadata', () => {
	const rendered = renderChunkNoteBody(sampleChunk()).replace(/^id: .*\n/m, '');

	assert.throws(
		() => parseChunkMetadata(rendered),
		/field "id" must be a non-empty string/,
	);
});

test('optional scheduler ids round-trip when absent', () => {
	const chunk = sampleChunk();

	const yaml = serializeChunkMetadata(chunk);
	const parsed = parseChunkMetadata(renderChunkNoteBody(chunk));

	assert.match(yaml, /^  ankiNoteId: null$/m);
	assert.match(yaml, /^  ankiCardId: null$/m);
	assert.ok(parsed);
	assert.equal(parsed.chunk.scheduler.ankiNoteId, undefined);
	assert.equal(parsed.chunk.scheduler.ankiCardId, undefined);
});

test('optional scheduler ids round-trip when present', () => {
	const chunk = sampleChunk({
		scheduler: {
			...sampleChunk().scheduler,
			ankiNoteId: 123,
			ankiCardId: 456,
			lastKnownDue: 42,
			lastKnownState: 'review',
			lastSyncAt: 789,
		},
	});

	const yaml = serializeChunkMetadata(chunk);
	const parsed = parseChunkMetadata(renderChunkNoteBody(chunk));

	assert.match(yaml, /^  ankiNoteId: 123$/m);
	assert.match(yaml, /^  ankiCardId: 456$/m);
	assert.ok(parsed);
	assert.equal(parsed.chunk.scheduler.ankiNoteId, 123);
	assert.equal(parsed.chunk.scheduler.ankiCardId, 456);
	assert.deepEqual(parsed.chunk, chunk);
});

function sampleChunk(overrides: Partial<ChunkRecord> = {}): ChunkRecord {
	const [chunk] = extractHeadingChunks({
		id: 'note123',
		title: 'Source Note',
		body: '# First\nBody.',
	}, { now: 1234 });

	return {
		...chunk,
		...overrides,
	};
}
