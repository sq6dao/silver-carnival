export type ChunkId = string;

export type ChunkLifecycle = 'active' | 'paused' | 'superseded' | 'done';

export type SchedulerCardState = 'new' | 'learn' | 'review' | 'relearn' | 'suspended';

export type CreatedCardStatus = 'active' | 'stale' | 'deleted';

export interface JoplinSourceNote {
	id: string;
	title: string;
	body: string;
}

export interface ChunkAnchor {
	startOffset?: number;
	endOffset?: number;
	textHash?: string;
	headingPath?: string[];
}

export interface ChunkSchedulerBinding {
	ankiNoteId?: number;
	ankiCardId?: number;
	deckName: string;
	modelName: string;
	lastKnownDue?: number | null;
	lastKnownState?: SchedulerCardState | null;
	lastSyncAt?: number | null;
}

export interface CreatedCardLink {
	ankiNoteId: number;
	ankiCardIds: number[];
	deckName: string;
	modelName: string;
	sourceChunkId: string;
	sourceChunkVersion: number;
	sourceTextHash: string;
	createdAt: number;
	status: CreatedCardStatus;
}

export interface ChunkRecord {
	id: ChunkId;
	rootChunkId: ChunkId;
	parentChunkId?: ChunkId;
	sourceNoteId: string;
	sourceNoteTitle: string;
	headingPath?: string[];
	anchor?: ChunkAnchor;
	text: string;
	textHash: string;
	version: number;
	lifecycle: ChunkLifecycle;
	scheduler: ChunkSchedulerBinding;
	createdCards: CreatedCardLink[];
	createdAt: number;
	updatedAt: number;
}
