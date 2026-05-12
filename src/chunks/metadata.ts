import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import type {
	ChunkAnchor,
	ChunkRecord,
	ChunkSchedulerBinding,
	CreatedCardLink,
} from './types';

const CHUNK_FRONTMATTER_TYPE = 'ir-chunk';

interface ChunkMetadata {
	type: typeof CHUNK_FRONTMATTER_TYPE;
	id: string;
	rootChunkId: string;
	parentChunkId: string | null;
	sourceNoteId: string;
	sourceNoteTitle: string;
	headingPath: string[];
	anchor: {
		startOffset: number | null;
		endOffset: number | null;
		textHash: string | null;
		headingPath: string[];
	};
	lifecycle: ChunkRecord['lifecycle'];
	scheduler: {
		ankiNoteId: number | null;
		ankiCardId: number | null;
		deckName: string;
		modelName: string;
		lastKnownDue: number | null;
		lastKnownState: ChunkSchedulerBinding['lastKnownState'];
		lastSyncAt: number | null;
	};
	createdCards: CreatedCardLink[];
	createdAt: number;
	updatedAt: number;
	version: number;
	textHash: string;
}

export function serializeChunkMetadata(chunk: ChunkRecord): string {
	return stringifyYaml(chunkToMetadata(chunk), {
		aliasDuplicateObjects: false,
		lineWidth: 0,
	}).trimEnd();
}

export function renderChunkNoteBody(chunk: ChunkRecord): string {
	return [
		'---',
		serializeChunkMetadata(chunk),
		'---',
		chunk.text,
		'',
		'---',
		'',
		`Open source note: joplin://x-callback-url/openNote?id=${chunk.sourceNoteId}`,
		'',
	].join('\n');
}

export function parseChunkMetadata(markdown: string): { chunk: ChunkRecord; body: string } | null {
	const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(markdown);
	if (!match) return null;

	const yamlText = match[1];
	const rawBody = match[2];
	let parsed: unknown;

	try {
		parsed = parseYaml(yamlText);
	} catch (error) {
		throw new Error(`Invalid chunk metadata YAML: ${String(error)}`);
	}

	if (!isRecord(parsed)) {
		throw new Error('Chunk metadata YAML must be an object.');
	}

	if (parsed.type !== CHUNK_FRONTMATTER_TYPE) return null;

	const metadata = validateMetadata(parsed);
	const body = stripSourceLinkFooter(rawBody, metadata.sourceNoteId);

	return {
		chunk: metadataToChunk(metadata, body),
		body,
	};
}

function chunkToMetadata(chunk: ChunkRecord): ChunkMetadata {
	return {
		type: CHUNK_FRONTMATTER_TYPE,
		id: chunk.id,
		rootChunkId: chunk.rootChunkId,
		parentChunkId: chunk.parentChunkId ?? null,
		sourceNoteId: chunk.sourceNoteId,
		sourceNoteTitle: chunk.sourceNoteTitle,
		headingPath: chunk.headingPath ?? [],
		anchor: {
			startOffset: chunk.anchor?.startOffset ?? null,
			endOffset: chunk.anchor?.endOffset ?? null,
			textHash: chunk.anchor?.textHash ?? null,
			headingPath: chunk.anchor?.headingPath ?? [],
		},
		lifecycle: chunk.lifecycle,
		scheduler: {
			ankiNoteId: chunk.scheduler.ankiNoteId ?? null,
			ankiCardId: chunk.scheduler.ankiCardId ?? null,
			deckName: chunk.scheduler.deckName,
			modelName: chunk.scheduler.modelName,
			lastKnownDue: chunk.scheduler.lastKnownDue ?? null,
			lastKnownState: chunk.scheduler.lastKnownState ?? null,
			lastSyncAt: chunk.scheduler.lastSyncAt ?? null,
		},
		createdCards: chunk.createdCards,
		createdAt: chunk.createdAt,
		updatedAt: chunk.updatedAt,
		version: chunk.version,
		textHash: chunk.textHash,
	};
}

function metadataToChunk(metadata: ChunkMetadata, body: string): ChunkRecord {
	const scheduler: ChunkSchedulerBinding = {
		deckName: metadata.scheduler.deckName,
		modelName: metadata.scheduler.modelName,
		lastKnownDue: metadata.scheduler.lastKnownDue,
		lastKnownState: metadata.scheduler.lastKnownState,
		lastSyncAt: metadata.scheduler.lastSyncAt,
	};

	if (metadata.scheduler.ankiNoteId !== null) {
		scheduler.ankiNoteId = metadata.scheduler.ankiNoteId;
	}

	if (metadata.scheduler.ankiCardId !== null) {
		scheduler.ankiCardId = metadata.scheduler.ankiCardId;
	}

	const anchor: ChunkAnchor = {
		headingPath: metadata.anchor.headingPath,
	};

	if (metadata.anchor.startOffset !== null) {
		anchor.startOffset = metadata.anchor.startOffset;
	}

	if (metadata.anchor.endOffset !== null) {
		anchor.endOffset = metadata.anchor.endOffset;
	}

	if (metadata.anchor.textHash !== null) {
		anchor.textHash = metadata.anchor.textHash;
	}

	const chunk: ChunkRecord = {
		id: metadata.id,
		rootChunkId: metadata.rootChunkId,
		sourceNoteId: metadata.sourceNoteId,
		sourceNoteTitle: metadata.sourceNoteTitle,
		headingPath: metadata.headingPath,
		anchor,
		text: body,
		textHash: metadata.textHash,
		version: metadata.version,
		lifecycle: metadata.lifecycle,
		scheduler,
		createdCards: metadata.createdCards,
		createdAt: metadata.createdAt,
		updatedAt: metadata.updatedAt,
	};

	if (metadata.parentChunkId !== null) {
		chunk.parentChunkId = metadata.parentChunkId;
	}

	return chunk;
}

function validateMetadata(value: Record<string, unknown>): ChunkMetadata {
	const scheduler = requireRecord(value.scheduler, 'scheduler');
	const anchor = requireRecord(value.anchor, 'anchor');

	return {
		type: CHUNK_FRONTMATTER_TYPE,
		id: requireString(value.id, 'id'),
		rootChunkId: requireString(value.rootChunkId, 'rootChunkId'),
		parentChunkId: optionalString(value.parentChunkId, 'parentChunkId'),
		sourceNoteId: requireString(value.sourceNoteId, 'sourceNoteId'),
		sourceNoteTitle: requireString(value.sourceNoteTitle, 'sourceNoteTitle'),
		headingPath: optionalStringArray(value.headingPath, 'headingPath'),
		anchor: {
			startOffset: optionalNumber(anchor.startOffset, 'anchor.startOffset'),
			endOffset: optionalNumber(anchor.endOffset, 'anchor.endOffset'),
			textHash: optionalString(anchor.textHash, 'anchor.textHash'),
			headingPath: optionalStringArray(anchor.headingPath, 'anchor.headingPath'),
		},
		lifecycle: requireLifecycle(value.lifecycle),
		scheduler: {
			ankiNoteId: optionalNumber(scheduler.ankiNoteId, 'scheduler.ankiNoteId'),
			ankiCardId: optionalNumber(scheduler.ankiCardId, 'scheduler.ankiCardId'),
			deckName: requireString(scheduler.deckName, 'scheduler.deckName'),
			modelName: requireString(scheduler.modelName, 'scheduler.modelName'),
			lastKnownDue: optionalNumber(scheduler.lastKnownDue, 'scheduler.lastKnownDue'),
			lastKnownState: optionalSchedulerState(scheduler.lastKnownState, 'scheduler.lastKnownState'),
			lastSyncAt: optionalNumber(scheduler.lastSyncAt, 'scheduler.lastSyncAt'),
		},
		createdCards: requireCreatedCards(value.createdCards, 'createdCards'),
		createdAt: requireNumber(value.createdAt, 'createdAt'),
		updatedAt: requireNumber(value.updatedAt, 'updatedAt'),
		version: requireNumber(value.version, 'version'),
		textHash: requireString(value.textHash, 'textHash'),
	};
}

function stripSourceLinkFooter(body: string, sourceNoteId: string): string {
	const footer = `\n\n---\n\nOpen source note: joplin://x-callback-url/openNote?id=${sourceNoteId}`;
	const normalizedBody = body.replace(/\s+$/, '');

	if (!normalizedBody.endsWith(footer)) {
		return body.trim();
	}

	return normalizedBody.slice(0, -footer.length);
}

function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
	if (!isRecord(value)) {
		throw new Error(`Chunk metadata field "${fieldName}" must be an object.`);
	}

	return value;
}

function requireString(value: unknown, fieldName: string): string {
	if (typeof value !== 'string' || !value) {
		throw new Error(`Chunk metadata field "${fieldName}" must be a non-empty string.`);
	}

	return value;
}

function optionalString(value: unknown, fieldName: string): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string') return value;

	throw new Error(`Chunk metadata field "${fieldName}" must be a string or null.`);
}

function requireNumber(value: unknown, fieldName: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new Error(`Chunk metadata field "${fieldName}" must be a finite number.`);
	}

	return value;
}

function optionalNumber(value: unknown, fieldName: string): number | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'number' && Number.isFinite(value)) return value;

	throw new Error(`Chunk metadata field "${fieldName}" must be a finite number or null.`);
}

function optionalStringArray(value: unknown, fieldName: string): string[] {
	if (value === null || value === undefined) return [];
	if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
		return value.slice();
	}

	throw new Error(`Chunk metadata field "${fieldName}" must be a string array.`);
}

function requireLifecycle(value: unknown): ChunkRecord['lifecycle'] {
	if (value === 'active' || value === 'paused' || value === 'superseded' || value === 'done') {
		return value;
	}

	throw new Error('Chunk metadata field "lifecycle" must be a valid chunk lifecycle.');
}

function optionalSchedulerState(
	value: unknown,
	fieldName: string,
): ChunkSchedulerBinding['lastKnownState'] {
	if (value === null || value === undefined) return null;

	if (
		value === 'new' ||
		value === 'learn' ||
		value === 'review' ||
		value === 'relearn' ||
		value === 'suspended'
	) {
		return value;
	}

	throw new Error(`Chunk metadata field "${fieldName}" must be a valid scheduler state or null.`);
}

function requireCreatedCards(value: unknown, fieldName: string): CreatedCardLink[] {
	if (!Array.isArray(value)) {
		throw new Error(`Chunk metadata field "${fieldName}" must be an array.`);
	}

	return value.map((item, index) => validateCreatedCard(item, `${fieldName}[${index}]`));
}

function validateCreatedCard(value: unknown, fieldName: string): CreatedCardLink {
	const card = requireRecord(value, fieldName);

	return {
		ankiNoteId: requireNumber(card.ankiNoteId, `${fieldName}.ankiNoteId`),
		ankiCardIds: requireNumberArray(card.ankiCardIds, `${fieldName}.ankiCardIds`),
		deckName: requireString(card.deckName, `${fieldName}.deckName`),
		modelName: requireString(card.modelName, `${fieldName}.modelName`),
		sourceChunkId: requireString(card.sourceChunkId, `${fieldName}.sourceChunkId`),
		sourceChunkVersion: requireNumber(card.sourceChunkVersion, `${fieldName}.sourceChunkVersion`),
		sourceTextHash: requireString(card.sourceTextHash, `${fieldName}.sourceTextHash`),
		createdAt: requireNumber(card.createdAt, `${fieldName}.createdAt`),
		status: requireCreatedCardStatus(card.status, `${fieldName}.status`),
	};
}

function requireNumberArray(value: unknown, fieldName: string): number[] {
	if (Array.isArray(value) && value.every(item => typeof item === 'number' && Number.isFinite(item))) {
		return value.slice();
	}

	throw new Error(`Chunk metadata field "${fieldName}" must be a finite number array.`);
}

function requireCreatedCardStatus(value: unknown, fieldName: string): CreatedCardLink['status'] {
	if (value === 'active' || value === 'stale' || value === 'deleted') {
		return value;
	}

	throw new Error(`Chunk metadata field "${fieldName}" must be a valid created-card status.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
