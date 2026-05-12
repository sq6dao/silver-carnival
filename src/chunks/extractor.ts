import { createHash } from 'crypto';

import type { ChunkRecord, JoplinSourceNote } from './types';

export interface HeadingExtractionOptions {
	now?: number;
}

interface HeadingBoundary {
	level: number;
	title: string;
	offset: number;
	headingPath: string[];
}

interface ChunkBoundary {
	startOffset: number;
	endOffset: number;
	headingPath: string[];
}

export function extractHeadingChunks(
	note: JoplinSourceNote,
	options: HeadingExtractionOptions = {},
): ChunkRecord[] {
	const now = options.now ?? Date.now();
	const boundaries = findChunkBoundaries(note);

	return boundaries.map((boundary, index) => {
		const text = note.body.slice(boundary.startOffset, boundary.endOffset);
		const textHash = hashText(text);
		const id = `chunk_${note.id}_${index}`;

		return {
			id,
			rootChunkId: id,
			sourceNoteId: note.id,
			sourceNoteTitle: note.title,
			headingPath: boundary.headingPath,
			anchor: {
				startOffset: boundary.startOffset,
				endOffset: boundary.endOffset,
				textHash,
				headingPath: boundary.headingPath,
			},
			text,
			textHash,
			version: 1,
			lifecycle: 'active',
			scheduler: {
				deckName: `IR::Chunks::${note.id}`,
				modelName: 'IRChunk',
				lastKnownDue: null,
				lastKnownState: null,
				lastSyncAt: null,
			},
			createdCards: [],
			createdAt: now,
			updatedAt: now,
		};
	});
}

function findChunkBoundaries(note: JoplinSourceNote): ChunkBoundary[] {
	const headings = findHeadings(note.body);
	const rawBoundaries: ChunkBoundary[] = [];

	if (!headings.length) {
		const intro = trimOuterWhitespace(note.body, 0, note.body.length);

		if (!intro) return [];

		return [{
			startOffset: intro.startOffset,
			endOffset: intro.endOffset,
			headingPath: [note.title],
		}];
	}

	const intro = trimOuterWhitespace(note.body, 0, headings[0].offset);
	if (intro) {
		rawBoundaries.push({
			startOffset: intro.startOffset,
			endOffset: intro.endOffset,
			headingPath: [note.title],
		});
	}

	for (let index = 0; index < headings.length; index++) {
		const heading = headings[index];
		const nextHeading = headings[index + 1];
		const rawEndOffset = nextHeading ? nextHeading.offset : note.body.length;
		const range = trimOuterWhitespace(note.body, heading.offset, rawEndOffset);

		if (!range) continue;

		rawBoundaries.push({
			startOffset: range.startOffset,
			endOffset: range.endOffset,
			headingPath: heading.headingPath,
		});
	}

	return rawBoundaries;
}

function findHeadings(body: string): HeadingBoundary[] {
	const headings: HeadingBoundary[] = [];
	const headingPathByLevel: string[] = [];
	let lineStartOffset = 0;

	while (lineStartOffset < body.length) {
		const nextLineOffset = body.indexOf('\n', lineStartOffset);
		const lineEndOffset = nextLineOffset === -1 ? body.length : nextLineOffset;
		const line = body.slice(lineStartOffset, lineEndOffset).replace(/\r$/, '');
		const heading = parseAtxHeading(line);

		if (heading) {
			headingPathByLevel[heading.level - 1] = heading.title;
			headingPathByLevel.length = heading.level;

			headings.push({
				...heading,
				offset: lineStartOffset,
				headingPath: headingPathByLevel.slice(),
			});
		}

		if (nextLineOffset === -1) break;
		lineStartOffset = nextLineOffset + 1;
	}

	return headings;
}

function parseAtxHeading(line: string): { level: number; title: string } | null {
	const match = /^(?: {0,3})(#{1,6})(?:[ \t]+|$)(.*)$/.exec(line);
	if (!match) return null;

	const title = match[2].replace(/[ \t]+#{1,}[ \t]*$/, '').trim() || 'Untitled';

	return {
		level: match[1].length,
		title,
	};
}

function trimOuterWhitespace(
	text: string,
	startOffset: number,
	endOffset: number,
): { startOffset: number; endOffset: number } | null {
	while (startOffset < endOffset && /\s/.test(text[startOffset])) {
		startOffset++;
	}

	while (endOffset > startOffset && /\s/.test(text[endOffset - 1])) {
		endOffset--;
	}

	if (startOffset >= endOffset) return null;

	return { startOffset, endOffset };
}

function hashText(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}
