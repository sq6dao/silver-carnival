import type { AnkiGateway } from '../anki/gateway';
import type { ChunkRepository, StoredChunk } from '../chunks/repository';

export interface ReviewQueueService {
	getDueChunks(): Promise<StoredChunk[]>;
}

export class AnkiReviewQueueService implements ReviewQueueService {
	public constructor(
		private readonly anki: Pick<AnkiGateway, 'getDueChunkCardIds'>,
		private readonly chunks: Pick<ChunkRepository, 'findByAnkiCardId'>,
	) {}

	public async getDueChunks(): Promise<StoredChunk[]> {
		const cardIds = await this.anki.getDueChunkCardIds();
		const dueChunks: StoredChunk[] = [];

		for (const cardId of cardIds) {
			const stored = await this.chunks.findByAnkiCardId(cardId);
			if (!stored || stored.chunk.lifecycle !== 'active') continue;

			dueChunks.push(stored);
		}

		return dueChunks;
	}
}
