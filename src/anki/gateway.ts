import { request as httpRequest } from 'http';
import { URL } from 'url';

import { titleForChunk } from '../chunks/repository';
import type { ChunkRecord } from '../chunks/types';

export const ANKI_CONNECT_VERSION = 6;
export const IR_CHUNK_MODEL_NAME = 'IRChunk';

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

export interface AnkiGateway {
	ensureSchedulerResources(sourceNoteId: string): Promise<void>;
	createChunkNote(chunk: ChunkRecord, joplinNoteId: string): Promise<SchedulerCardBinding>;
	getDueChunkCardIds(): Promise<number[]>;
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

	public async getDueChunkCardIds(): Promise<number[]> {
		return this.invoke<number[]>('findCards', {
			query: `note:${IR_CHUNK_MODEL_NAME} (is:new OR is:due)`,
		});
	}

	private async invoke<T>(action: string, params?: Record<string, unknown>): Promise<T> {
		const response = await this.transport({
			action,
			version: ANKI_CONNECT_VERSION,
			params,
		});

		if (response.error) {
			throw new Error(`AnkiConnect ${action} failed: ${response.error}`);
		}

		return response.result as T;
	}
}

export function chunkDeckName(sourceNoteId: string): string {
	return `IR::Chunks::${sourceNoteId}`;
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
				headers: {
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

function isAnkiConnectResponse(value: unknown): value is AnkiConnectResponse {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

	const candidate = value as Record<string, unknown>;

	return 'result' in candidate && (candidate.error === null || typeof candidate.error === 'string');
}
