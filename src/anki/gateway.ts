import { request as httpRequest } from 'http';
import { URL } from 'url';

import { titleForChunk } from '../chunks/repository';
import type { ChunkRecord, SchedulerCardState } from '../chunks/types';

export const ANKI_CONNECT_VERSION = 6;
export const IR_CHUNK_MODEL_NAME = 'IRChunk';
export const IR_BASIC_MODEL_NAME = 'IRBasic';
export const IR_CLOZE_MODEL_NAME = 'IRCloze';

export const IR_CHUNK_MODEL_FIELDS = [
	'chunkId',
	'rootChunkId',
	'joplinNoteId',
	'joplinNoteTitle',
	'chunkVersion',
	'chunkTextHash',
	'headingPath',
	'anchorData',
	'displayTitle',
];

export interface SchedulerCardBinding {
	noteId: number;
	cardId: number;
}

export type AnkiReviewRating = 1 | 2 | 3 | 4;

export interface SchedulerCardInfo {
	cardId: number;
	due: number | null;
	state: SchedulerCardState | null;
}

export interface CreatedCardBinding {
	noteId: number;
	cardIds: number[];
}

export interface AnkiGateway {
	ensureSchedulerResources(sourceNoteId: string): Promise<void>;
	ensureCreatedCardResources(sourceNoteId: string): Promise<void>;
	createChunkNote(chunk: ChunkRecord, joplinNoteId: string): Promise<SchedulerCardBinding>;
	createBasicCard(chunk: ChunkRecord, front: string, back: string): Promise<CreatedCardBinding>;
	createClozeCard(chunk: ChunkRecord, text: string, backExtra: string): Promise<CreatedCardBinding>;
	getDueChunkCardIds(): Promise<number[]>;
	reviewCard(cardId: number, rating: AnkiReviewRating): Promise<void>;
	getCardSchedulerInfo(cardId: number): Promise<SchedulerCardInfo>;
	suspendCard(cardId: number): Promise<void>;
}

export interface AnkiConnectRequest {
	action: string;
	version: typeof ANKI_CONNECT_VERSION;
	params?: Record<string, unknown>;
}

export interface AnkiConnectResponse {
	result: unknown;
	error: string | null;
}

export type AnkiConnectTransport = (request: AnkiConnectRequest) => Promise<AnkiConnectResponse>;

export interface AnkiConnectGatewayOptions {
	endpoint?: string;
	transport?: AnkiConnectTransport;
}

export class AnkiConnectGateway implements AnkiGateway {
	private readonly transport: AnkiConnectTransport;

	public constructor(options: AnkiConnectGatewayOptions = {}) {
		this.transport = options.transport ?? createHttpTransport(options.endpoint ?? 'http://127.0.0.1:8765');
	}

	public async ensureSchedulerResources(sourceNoteId: string): Promise<void> {
		await this.invoke('createDeck', {
			deck: chunkDeckName(sourceNoteId),
		});

		const modelNames = await this.invoke<string[]>('modelNames');
		if (!modelNames.includes(IR_CHUNK_MODEL_NAME)) {
			await this.createIrChunkModel();
		}
	}

	public async ensureCreatedCardResources(sourceNoteId: string): Promise<void> {
		await this.invoke('createDeck', {
			deck: createdCardsDeckName(sourceNoteId),
		});

		const modelNames = await this.invoke<string[]>('modelNames');
		if (!modelNames.includes(IR_BASIC_MODEL_NAME)) {
			await this.createIrBasicModel();
		}

		if (!modelNames.includes(IR_CLOZE_MODEL_NAME)) {
			await this.createIrClozeModel();
		}
	}

	public async createChunkNote(
		chunk: ChunkRecord,
		joplinNoteId: string,
	): Promise<SchedulerCardBinding> {
		const noteId = await this.invoke<number>('addNote', {
			note: {
				deckName: chunk.scheduler.deckName,
				modelName: chunk.scheduler.modelName,
				fields: schedulerFields(chunk, joplinNoteId),
				options: {
					allowDuplicate: false,
					duplicateScope: 'deck',
				},
				tags: ['joplin-ir', 'ir-chunk'],
			},
		});
		const cardIds = await this.invoke<number[]>('findCards', {
			query: `nid:${noteId}`,
		});
		const cardId = cardIds[0];

		if (typeof cardId !== 'number') {
			throw new Error(`AnkiConnect did not return a card for scheduler note ${noteId}.`);
		}

		return {
			noteId,
			cardId,
		};
	}

	public async createBasicCard(
		chunk: ChunkRecord,
		front: string,
		back: string,
	): Promise<CreatedCardBinding> {
		return this.addCreatedCardNote({
			deckName: createdCardsDeckName(chunk.sourceNoteId),
			modelName: IR_BASIC_MODEL_NAME,
			fields: {
				Front: front,
				Back: back,
				sourceChunkId: chunk.id,
				sourceChunkVersion: String(chunk.version),
				sourceTextHash: chunk.textHash,
			},
			tags: ['joplin-ir', 'ir-created-card', 'ir-basic'],
		});
	}

	public async createClozeCard(
		chunk: ChunkRecord,
		text: string,
		backExtra: string,
	): Promise<CreatedCardBinding> {
		return this.addCreatedCardNote({
			deckName: createdCardsDeckName(chunk.sourceNoteId),
			modelName: IR_CLOZE_MODEL_NAME,
			fields: {
				Text: text,
				'Back Extra': backExtra,
				sourceChunkId: chunk.id,
				sourceChunkVersion: String(chunk.version),
				sourceTextHash: chunk.textHash,
			},
			tags: ['joplin-ir', 'ir-created-card', 'ir-cloze'],
		});
	}

	public async getDueChunkCardIds(): Promise<number[]> {
		return this.invoke<number[]>('findCards', {
			query: `note:${IR_CHUNK_MODEL_NAME} (is:new OR is:due)`,
		});
	}

	public async reviewCard(cardId: number, rating: AnkiReviewRating): Promise<void> {
		await this.invoke<boolean[]>('answerCards', {
			answers: [{
				cardId,
				ease: rating,
			}],
		});
	}

	public async getCardSchedulerInfo(cardId: number): Promise<SchedulerCardInfo> {
		const cards = await this.invoke<unknown[]>('cardsInfo', {
			cards: [cardId],
		});
		const card = cards[0];

		if (!isRecord(card)) {
			throw new Error(`AnkiConnect did not return scheduler info for card ${cardId}.`);
		}

		return {
			cardId,
			due: typeof card.due === 'number' ? card.due : null,
			state: schedulerStateFromCardInfo(card),
		};
	}

	public async suspendCard(cardId: number): Promise<void> {
		await this.invoke<boolean>('suspend', {
			cards: [cardId],
		});
	}

	private async invoke<T>(action: string, params?: Record<string, unknown>): Promise<T> {
		let response: AnkiConnectResponse;

		try {
			response = await this.transport({
				action,
				version: ANKI_CONNECT_VERSION,
				params,
			});
		} catch (error) {
			throw new Error(`AnkiConnect ${action} request failed: ${transportErrorMessage(error)}`);
		}

		if (response.error) {
			throw new Error(`AnkiConnect ${action} failed: ${response.error}`);
		}

		return response.result as T;
	}

	private async addCreatedCardNote(note: {
		deckName: string;
		modelName: string;
		fields: Record<string, string>;
		tags: string[];
	}): Promise<CreatedCardBinding> {
		const noteId = await this.invoke<number>('addNote', {
			note: {
				...note,
				options: {
					allowDuplicate: false,
					duplicateScope: 'deck',
				},
			},
		});
		const cardIds = await this.invoke<number[]>('findCards', {
			query: `nid:${noteId}`,
		});

		if (!cardIds.length) {
			throw new Error(`AnkiConnect did not return cards for created note ${noteId}.`);
		}

		return {
			noteId,
			cardIds,
		};
	}

	private async createIrChunkModel(): Promise<void> {
		await this.invoke('createModel', {
			modelName: IR_CHUNK_MODEL_NAME,
			inOrderFields: IR_CHUNK_MODEL_FIELDS,
			css: '.card { font-family: sans-serif; font-size: 18px; text-align: left; color: #111; background: #fff; }',
			cardTemplates: [
				{
					Name: 'IR Chunk',
					Front: 'IR Chunk: {{displayTitle}}',
					Back: 'Reviewed in Joplin',
				},
			],
		});
	}

	private async createIrBasicModel(): Promise<void> {
		await this.invoke('createModel', {
			modelName: IR_BASIC_MODEL_NAME,
			inOrderFields: ['Front', 'Back', 'sourceChunkId', 'sourceChunkVersion', 'sourceTextHash'],
			css: '.card { font-family: sans-serif; font-size: 18px; text-align: left; color: #111; background: #fff; }',
			cardTemplates: [
				{
					Name: 'Basic',
					Front: '{{Front}}',
					Back: '{{FrontSide}}<hr id="answer">{{Back}}',
				},
			],
		});
	}

	private async createIrClozeModel(): Promise<void> {
		await this.invoke('createModel', {
			modelName: IR_CLOZE_MODEL_NAME,
			inOrderFields: ['Text', 'Back Extra', 'sourceChunkId', 'sourceChunkVersion', 'sourceTextHash'],
			css: '.card { font-family: sans-serif; font-size: 18px; text-align: left; color: #111; background: #fff; } .cloze { font-weight: bold; }',
			isCloze: true,
			cardTemplates: [
				{
					Name: 'Cloze',
					Front: '{{cloze:Text}}',
					Back: '{{cloze:Text}}<br>{{Back Extra}}',
				},
			],
		});
	}
}

export function chunkDeckName(sourceNoteId: string): string {
	return `IR::Chunks::${sourceNoteId}`;
}

export function createdCardsDeckName(sourceNoteId: string): string {
	return `IR::Cards::${sourceNoteId}`;
}

function schedulerFields(chunk: ChunkRecord, joplinNoteId: string): Record<string, string> {
	const headingPath = chunk.headingPath ?? [];

	return {
		chunkId: chunk.id,
		rootChunkId: chunk.rootChunkId,
		joplinNoteId,
		joplinNoteTitle: chunk.sourceNoteTitle,
		chunkVersion: String(chunk.version),
		chunkTextHash: chunk.textHash,
		headingPath: JSON.stringify(headingPath),
		anchorData: JSON.stringify(chunk.anchor ?? {}),
		displayTitle: titleForChunk(chunk),
	};
}

function createHttpTransport(endpoint: string): AnkiConnectTransport {
	return async (payload: AnkiConnectRequest): Promise<AnkiConnectResponse> => {
		const endpointUrl = new URL(endpoint);
		const body = JSON.stringify(payload);

		return new Promise((resolve, reject) => {
			const request = httpRequest({
				hostname: endpointUrl.hostname,
				port: endpointUrl.port || '80',
				path: endpointUrl.pathname || '/',
				method: 'POST',
				agent: false,
				headers: {
					'Connection': 'close',
					'Content-Type': 'application/json',
					'Content-Length': Buffer.byteLength(body),
				},
			}, response => {
				const chunks: Buffer[] = [];

				response.on('data', chunk => chunks.push(Buffer.from(chunk)));
				response.on('end', () => {
					try {
						const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));

						if (!isAnkiConnectResponse(parsed)) {
							reject(new Error('AnkiConnect returned an invalid response.'));
							return;
						}

						resolve(parsed);
					} catch (error) {
						reject(error);
					}
				});
			});

			request.on('error', reject);
			request.write(body);
			request.end();
		});
	};
}

function schedulerStateFromCardInfo(card: Record<string, unknown>): SchedulerCardState | null {
	if (card.queue === -1) return 'suspended';

	if (typeof card.type === 'string') {
		return schedulerStateFromString(card.type);
	}

	if (typeof card.type === 'number') {
		return schedulerStateFromNumber(card.type);
	}

	return null;
}

function schedulerStateFromString(value: string): SchedulerCardState | null {
	if (
		value === 'new' ||
		value === 'learn' ||
		value === 'review' ||
		value === 'relearn' ||
		value === 'suspended'
	) {
		return value;
	}

	return null;
}

function schedulerStateFromNumber(value: number): SchedulerCardState | null {
	if (value === 0) return 'new';
	if (value === 1) return 'learn';
	if (value === 2) return 'review';
	if (value === 3) return 'relearn';

	return null;
}

function isAnkiConnectResponse(value: unknown): value is AnkiConnectResponse {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

	const candidate = value as Record<string, unknown>;

	return 'result' in candidate && (candidate.error === null || typeof candidate.error === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function transportErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;

	return String(error);
}
