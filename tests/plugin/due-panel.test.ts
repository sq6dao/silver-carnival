import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { extractHeadingChunks } from '../../src/chunks/extractor';
import type { StoredChunk } from '../../src/chunks/repository';
import {
	refreshDueChunksPanel,
	renderDueChunksErrorHtml,
	renderDueChunksHtml,
	type PanelApi,
} from '../../src/plugin/due-panel';

test('renderDueChunksHtml shows an empty state', () => {
	const html = renderDueChunksHtml([]);

	assert.match(html, /Due Chunks/);
	assert.match(html, /Refresh/);
	assert.match(html, /No due chunks\./);
});

test('renderDueChunksHtml renders escaped chunk links', () => {
	const html = renderDueChunksHtml([
		storedChunk('note id/1', 'Chunk <One>', 'Source & Note', 456),
	]);

	assert.match(
		html,
		/joplin:\/\/x-callback-url\/openNote\?id=note%20id%2F1/,
	);
	assert.match(html, /Chunk &lt;One&gt;/);
	assert.match(html, /Source &amp; Note/);
});

test('renderDueChunksHtml renders grade buttons with panel messages', () => {
	const html = renderDueChunksHtml([
		storedChunk('note_1', 'Chunk One', 'Source Note', 456),
	]);

	assert.match(html, />Again<\/button>/);
	assert.match(html, />Hard<\/button>/);
	assert.match(html, />Good<\/button>/);
	assert.match(html, />Easy<\/button>/);
	assert.match(html, /type: 'grade', ankiCardId: 456, rating: 1/);
	assert.match(html, /type: 'grade', ankiCardId: 456, rating: 2/);
	assert.match(html, /type: 'grade', ankiCardId: 456, rating: 3/);
	assert.match(html, /type: 'grade', ankiCardId: 456, rating: 4/);
});

test('renderDueChunksHtml shows missing scheduler card state', () => {
	const html = renderDueChunksHtml([
		storedChunk('note_1', 'Chunk One', 'Source Note'),
	]);

	assert.match(html, /Missing scheduler card\./);
});

test('renderDueChunksErrorHtml renders escaped errors', () => {
	const html = renderDueChunksErrorHtml('Anki <offline>');

	assert.match(html, /Anki &lt;offline&gt;/);
});

test('refreshDueChunksPanel writes panel HTML and returns due count', async () => {
	const panels = new FakePanelApi();
	const chunks = [
		storedChunk('note_1', 'Chunk One', 'Source Note', 1),
		storedChunk('note_2', 'Chunk Two', 'Source Note', 2),
	];

	const count = await refreshDueChunksPanel('panel_1', panels, {
		getDueChunks: async () => chunks,
	});

	assert.equal(count, 2);
	assert.equal(panels.handle, 'panel_1');
	assert.match(panels.html, /Chunk One/);
	assert.match(panels.html, /Chunk Two/);
});

function storedChunk(
	joplinNoteId: string,
	title: string,
	sourceNoteTitle: string,
	ankiCardId?: number,
): StoredChunk {
	const [chunk] = extractHeadingChunks({
		id: 'sourceA',
		title: sourceNoteTitle,
		body: `# ${title}\nBody.`,
	}, { now: 1234 });

	return {
		chunk: {
			...chunk,
			scheduler: {
				...chunk.scheduler,
				ankiCardId,
			},
		},
		joplinNoteId,
		title,
	};
}

class FakePanelApi implements PanelApi {
	public handle = '';
	public html = '';

	public async setHtml(handle: string, html: string): Promise<string> {
		this.handle = handle;
		this.html = html;

		return html;
	}

	public async show(): Promise<void> {
		// No-op for this unit test.
	}
}
