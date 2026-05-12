import type { AnkiGateway, AnkiReviewRating, SchedulerCardInfo } from '../anki/gateway';
import type { ChunkRepository, StoredChunk } from '../chunks/repository';
import type { ChunkRecord } from '../chunks/types';

export interface GradeChunkInput {
	ankiCardId: number;
	rating: AnkiReviewRating;
}

export interface GradeChunkOptions {
	now?: () => number;
}

export class GradeChunkService {
	private readonly now: () => number;

	public constructor(
		private readonly anki: Pick<AnkiGateway, 'getCardSchedulerInfo' | 'reviewCard'>,
		private readonly chunks: Pick<ChunkRepository, 'findByAnkiCardId' | 'updateChunkNote'>,
		options: GradeChunkOptions = {},
	) {
		this.now = options.now ?? Date.now;
	}

	public async grade(input: GradeChunkInput): Promise<StoredChunk> {
		const stored = await this.chunks.findByAnkiCardId(input.ankiCardId);
		if (!stored) {
			throw new Error(`No chunk is mapped to Anki card ${input.ankiCardId}.`);
		}

		if (stored.chunk.lifecycle !== 'active') {
			throw new Error(`Chunk ${stored.chunk.id} is not active.`);
		}

		await this.anki.reviewCard(input.ankiCardId, input.rating);

		const schedulerInfo = await this.getSchedulerInfo(input.ankiCardId);
		const updatedChunk = updateSchedulerMetadata(stored.chunk, this.now(), schedulerInfo);

		await this.chunks.updateChunkNote(stored.joplinNoteId, updatedChunk);

		return {
			...stored,
			chunk: updatedChunk,
		};
	}

	private async getSchedulerInfo(cardId: number): Promise<SchedulerCardInfo | null> {
		try {
			return await this.anki.getCardSchedulerInfo(cardId);
		} catch (error) {
			return null;
		}
	}
}

function updateSchedulerMetadata(
	chunk: ChunkRecord,
	now: number,
	schedulerInfo: SchedulerCardInfo | null,
): ChunkRecord {
	return {
		...chunk,
		scheduler: {
			...chunk.scheduler,
			lastKnownDue: schedulerInfo ? schedulerInfo.due : chunk.scheduler.lastKnownDue,
			lastKnownState: schedulerInfo ? schedulerInfo.state : chunk.scheduler.lastKnownState,
			lastSyncAt: now,
		},
		updatedAt: now,
	};
}
