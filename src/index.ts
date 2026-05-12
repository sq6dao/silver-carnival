import joplin from 'api';
import { MenuItemLocation, ToastType, ToolbarButtonLocation } from 'api/types';

import { AnkiConnectGateway } from './anki/gateway';
import { JoplinChunkRepository } from './chunks/repository';
import type { JoplinSourceNote } from './chunks/types';
import { EnableIncrementalReadingService } from './plugin/enable-ir';

joplin.plugins.register({
	onStart: async function() {
		const repository = new JoplinChunkRepository(joplin.data);
		const ankiGateway = new AnkiConnectGateway();
		const enableService = new EnableIncrementalReadingService(repository, ankiGateway);

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

		await joplin.views.menuItems.create(
			'irAnkiEnableCurrentNoteMenuItem',
			'irAnkiEnableCurrentNote',
			MenuItemLocation.Tools,
		);

		await joplin.views.toolbarButtons.create(
			'irAnkiEnableCurrentNoteButton',
			'irAnkiEnableCurrentNote',
			ToolbarButtonLocation.NoteToolbar,
		);
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
