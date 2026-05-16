import joplin from 'api';
import { MenuItemLocation, ToastType, ToolbarButtonLocation } from 'api/types';

import { AnkiConnectGateway } from './anki/gateway';
import { CardCreationService } from './cards/creation';
import { parseChunkMetadata } from './chunks/metadata';
import { JoplinChunkRepository, type StoredChunk } from './chunks/repository';
import { SplitChunkService } from './chunks/splitting';
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
		const splitService = new SplitChunkService(repository, ankiGateway);
		const cardCreationService = new CardCreationService(repository, ankiGateway);
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

		await joplin.commands.register({
			name: 'irAnkiSplitCurrentChunk',
			label: 'Split Current IR Chunk',
			iconName: 'fas fa-code-branch',
			execute: async () => {
				try {
					const chunk = await selectedStoredChunk();
					const result = await splitService.split(chunk);

					await joplin.views.dialogs.showToast({
						message: `Split chunk into ${result.children.length} child chunks.`,
						type: ToastType.Success,
					});
				} catch (error) {
					await joplin.views.dialogs.showMessageBox(errorMessage(error));
				}
			},
		});

		await joplin.commands.register({
			name: 'irAnkiCreateBasicCard',
			label: 'Create Basic Card from Chunk',
			iconName: 'fas fa-clone',
			execute: async () => {
				try {
					await cardCreationService.createBasicCard(await selectedStoredChunk());

					await joplin.views.dialogs.showToast({
						message: 'Created Basic Anki card.',
						type: ToastType.Success,
					});
				} catch (error) {
					await joplin.views.dialogs.showMessageBox(errorMessage(error));
				}
			},
		});

		await joplin.commands.register({
			name: 'irAnkiCreateClozeCard',
			label: 'Create Cloze Card from Chunk',
			iconName: 'fas fa-highlighter',
			execute: async () => {
				try {
					await cardCreationService.createClozeCard(await selectedStoredChunk());

					await joplin.views.dialogs.showToast({
						message: 'Created Cloze Anki card.',
						type: ToastType.Success,
					});
				} catch (error) {
					await joplin.views.dialogs.showMessageBox(errorMessage(error));
				}
			},
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

		await joplin.views.menuItems.create(
			'irAnkiSplitCurrentChunkMenuItem',
			'irAnkiSplitCurrentChunk',
			MenuItemLocation.Tools,
		);

		await joplin.views.menuItems.create(
			'irAnkiCreateBasicCardMenuItem',
			'irAnkiCreateBasicCard',
			MenuItemLocation.Tools,
		);

		await joplin.views.menuItems.create(
			'irAnkiCreateClozeCardMenuItem',
			'irAnkiCreateClozeCard',
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
				noteOpener: {
					openNote: noteId => joplin.commands.execute('openNote', noteId),
				},
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

async function selectedStoredChunk(): Promise<StoredChunk> {
	const selected = await joplin.workspace.selectedNote();

	if (!selected?.id) {
		throw new Error('Select an IR chunk note first.');
	}

	const note = await joplin.data.get(['notes', selected.id], {
		fields: ['id', 'title', 'body'],
	});
	const parsed = parseChunkMetadata(String(note.body ?? ''));

	if (!parsed) {
		throw new Error('Select an IR chunk note first.');
	}

	return {
		chunk: parsed.chunk,
		joplinNoteId: String(note.id),
		title: String(note.title ?? ''),
	};
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;

	return String(error);
}
