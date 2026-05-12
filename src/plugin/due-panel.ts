import type { AnkiReviewRating } from '../anki/gateway';
import type { StoredChunk } from '../chunks/repository';
import type { GradeChunkInput } from '../review/grading';
import type { ReviewQueueService } from '../review/queue';

export interface PanelApi {
	setHtml(handle: string, html: string): Promise<string>;
	show(handle: string, show?: boolean): Promise<void>;
}

export interface GradeChunkServiceApi {
	grade(input: GradeChunkInput): Promise<unknown>;
}

export interface DueChunksPanelMessageDependencies {
	grading: GradeChunkServiceApi;
	panelHandle: string;
	panels: PanelApi;
	reviewQueue: ReviewQueueService;
}

export async function handleDueChunksPanelMessage(
	message: unknown,
	dependencies: DueChunksPanelMessageDependencies,
): Promise<boolean> {
	if (isRefreshMessage(message)) {
		await refreshAndShowPanel(dependencies);
		return true;
	}

	if (isGradeMessage(message)) {
		try {
			await dependencies.grading.grade({
				ankiCardId: message.ankiCardId,
				rating: message.rating,
			});
			await refreshAndShowPanel(dependencies);
		} catch (error) {
			await dependencies.panels.setHtml(
				dependencies.panelHandle,
				renderDueChunksErrorHtml(errorMessage(error)),
			);
			await dependencies.panels.show(dependencies.panelHandle, true);
		}

		return true;
	}

	return false;
}

export async function refreshDueChunksPanel(
	panelHandle: string,
	panels: PanelApi,
	reviewQueue: ReviewQueueService,
): Promise<number> {
	const dueChunks = await reviewQueue.getDueChunks();
	await panels.setHtml(panelHandle, renderDueChunksHtml(dueChunks));

	return dueChunks.length;
}

async function refreshAndShowPanel(dependencies: DueChunksPanelMessageDependencies): Promise<void> {
	await refreshDueChunksPanel(
		dependencies.panelHandle,
		dependencies.panels,
		dependencies.reviewQueue,
	);
	await dependencies.panels.show(dependencies.panelHandle, true);
}

export function renderDueChunksHtml(chunks: StoredChunk[]): string {
	return panelShell(`
		<header>
			<h1>Due Chunks</h1>
			<button type="button" onclick="webviewApi.postMessage({ type: 'refresh' })">Refresh</button>
		</header>
		${chunks.length ? renderChunkList(chunks) : '<p class="empty">No due chunks.</p>'}
	`);
}

export function renderDueChunksErrorHtml(message: string): string {
	return panelShell(`
		<header>
			<h1>Due Chunks</h1>
			<button type="button" onclick="webviewApi.postMessage({ type: 'refresh' })">Refresh</button>
		</header>
		<p class="error">${escapeHtml(message)}</p>
	`);
}

function renderChunkList(chunks: StoredChunk[]): string {
	const items = chunks.map(stored => `
		<li>
			<a href="${joplinNoteUrl(stored.joplinNoteId)}">${escapeHtml(stored.title)}</a>
			<span>${escapeHtml(stored.chunk.sourceNoteTitle)}</span>
			${renderGradeControls(stored)}
		</li>
	`).join('');

	return `<ol>${items}</ol>`;
}

function renderGradeControls(stored: StoredChunk): string {
	const cardId = stored.chunk.scheduler.ankiCardId;
	if (typeof cardId !== 'number') {
		return '<p class="missing-card">Missing scheduler card.</p>';
	}

	return `
		<div class="grades" aria-label="Grade ${escapeHtml(stored.title)}">
			${gradeButton(cardId, 1, 'Again')}
			${gradeButton(cardId, 2, 'Hard')}
			${gradeButton(cardId, 3, 'Good')}
			${gradeButton(cardId, 4, 'Easy')}
		</div>
	`;
}

function gradeButton(cardId: number, rating: number, label: string): string {
	return `
		<button
			type="button"
			onclick="webviewApi.postMessage({ type: 'grade', ankiCardId: ${cardId}, rating: ${rating} })"
		>${label}</button>
	`;
}

function panelShell(content: string): string {
	return `<!doctype html>
<html>
<head>
	<meta charset="utf-8">
	<style>
		:root {
			color-scheme: light dark;
			font-family: system-ui, sans-serif;
		}

		body {
			margin: 0;
			padding: 12px;
		}

		header {
			align-items: center;
			display: flex;
			gap: 8px;
			justify-content: space-between;
			margin-bottom: 12px;
		}

		h1 {
			font-size: 16px;
			font-weight: 600;
			line-height: 1.3;
			margin: 0;
		}

		button {
			font: inherit;
		}

		ol {
			list-style-position: inside;
			margin: 0;
			padding: 0;
		}

		li {
			border-bottom: 1px solid rgba(127, 127, 127, 0.25);
			padding: 8px 0;
		}

		a {
			display: block;
			font-weight: 600;
			margin-bottom: 2px;
		}

		span,
		.empty,
		.error,
		.missing-card {
			color: rgba(127, 127, 127, 0.9);
			font-size: 12px;
		}

		.error {
			color: #b00020;
		}

		.grades {
			display: flex;
			flex-wrap: wrap;
			gap: 4px;
			margin-top: 6px;
		}
	</style>
</head>
<body>
	${content}
</body>
</html>`;
}

function joplinNoteUrl(noteId: string): string {
	return `joplin://x-callback-url/openNote?id=${encodeURIComponent(noteId)}`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function isRefreshMessage(value: unknown): value is { type: 'refresh' } {
	return isRecord(value) && value.type === 'refresh';
}

function isGradeMessage(value: unknown): value is {
	type: 'grade';
	ankiCardId: number;
	rating: AnkiReviewRating;
} {
	return (
		isRecord(value) &&
		value.type === 'grade' &&
		typeof value.ankiCardId === 'number' &&
		isAnkiReviewRating(value.rating)
	);
}

function isAnkiReviewRating(value: unknown): value is AnkiReviewRating {
	return value === 1 || value === 2 || value === 3 || value === 4;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;

	return String(error);
}
