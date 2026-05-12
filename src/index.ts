import joplin from 'api';
import { MenuItemLocation, ToastType, ToolbarButtonLocation } from 'api/types';

import { AnkiConnectGateway } from './anki/gateway';
import { JoplinChunkRepository } from './chunks/repository';
import type { JoplinSourceNote } from './chunks/types';
import {
	handleDueChunksPanelMessage,
	refreshDueChunksPanel,
	renderDueChunksErrorHtml,
} from './plugin/due-panel';
import { EnableIncrementalReadingService } from './plugin/enable-ir';
import { GradeChunkService } from './review/grading';
import { AnkiReviewQueueService } from './review/queue';

joplin.plugins.register({
	onStart: async function() {
		const repository = new JoplinChunkRepository(joplin.data);
		const ankiGateway = new AnkiConnectGateway();
		const enableService = new EnableIncrementalReadingService(repository, ankiGateway);
		const reviewQueue = new AnkiReviewQueueService(ankiGateway, repository);
		const gradingService = new GradeChunkService(ankiGateway, repository);
		const duePanelHandle = await joplin.views.panels.create('irAnkiDueChunksPanel');

		const showDueChunks = async () => {
			try {
				await refreshDueChunksPanel(duePanelHandle, joplin.views.panels, reviewQueue);
			} catch (error) {
				await joplin.views.panels.setHtml(
					duePanelHandle,
					renderDueChunksErrorHtml(errorMessage(error)),
				);
			}

			await joplin.views.panels.show(duePanelHandle, true);
		};

		await joplin.commands.register({
			name: 'irAnkiEnableCurrentNote',
			label: 'Enable Incremental Reading',
			iconName: 'fas fa-layer-group',
			execute: async () => {
				try {
					const note = await selectedSourceNote();
					const result = await enableService.enable(note);

					await joplin.views.dialogs.showToast({
						message: `Created ${result.createdCount} incremental reading chunks.`,
						type: ToastType.Success,
					});
				} catch (error) {
					await joplin.views.dialogs.showMessageBox(errorMessage(error));
				}
			},
		});

		await joplin.commands.register({
			name: 'irAnkiShowDueChunks',
			label: 'Show Due Chunks',
			iconName: 'fas fa-calendar-check',
			execute: showDueChunks,
		});

		await joplin.views.menuItems.create(
			'irAnkiEnableCurrentNoteMenuItem',
			'irAnkiEnableCurrentNote',
			MenuItemLocation.Tools,
		);

		await joplin.views.menuItems.create(
			'irAnkiShowDueChunksMenuItem',
			'irAnkiShowDueChunks',
			MenuItemLocation.Tools,
		);

		await joplin.views.toolbarButtons.create(
			'irAnkiEnableCurrentNoteButton',
			'irAnkiEnableCurrentNote',
			ToolbarButtonLocation.NoteToolbar,
		);

		await joplin.views.panels.onMessage(duePanelHandle, async message => {
			await handleDueChunksPanelMessage(message, {
				grading: gradingService,
				panelHandle: duePanelHandle,
				panels: joplin.views.panels,
				reviewQueue,
			});
		});
	},
});

async function selectedSourceNote(): Promise<JoplinSourceNote> {
	const selected = await joplin.workspace.selectedNote();

	if (!selected?.id) {
		throw new Error('Select a note before enabling incremental reading.');
	}

	const note = await joplin.data.get(['notes', selected.id], {
		fields: ['id', 'title', 'body'],
	});

	return {
		id: String(note.id),
		title: String(note.title ?? ''),
		body: String(note.body ?? ''),
	};
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;

	return String(error);
}
