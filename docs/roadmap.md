# Roadmap

## M1 — Chunk System

Goal: create and track reviewable chunks with scheduler cards.

Implementation steps:

1. Record implementation assumptions in `docs/decisions.md`.
   - Decide where chunk notes live in Joplin.
   - Decide whether the plugin creates the `IRChunk` Anki model and decks
     automatically.

2. Add core TypeScript modules.
   - Define `ChunkRecord`, scheduler binding, created-card link, and anchor
     types.
   - Implement heading-based chunk extraction.
   - Implement YAML metadata serialization and parsing.
   - Implement a local `ChunkRepository` backed by Joplin notes.

3. Implement a minimal AnkiConnect gateway.
   - Connect to local AnkiConnect.
   - Ensure the `IRChunk` model exists.
   - Ensure the scheduler deck exists.
   - Create one scheduler note/card per active chunk.
   - Return and persist `ankiNoteId` and `ankiCardId`.

4. Add the Joplin command to enable incremental reading.
   - Read the current note.
   - Extract heading-based chunks.
   - Create chunk notes.
   - Create scheduler cards.
   - Persist the scheduler mapping into chunk YAML.

5. Add the simple Due Chunks panel.
   - Query Anki for due `IRChunk` cards.
   - Map `ankiCardId` values back to chunk notes.
   - Show a clickable list of due chunks in Joplin.

6. Add basic verification.
   - Test chunk extraction.
   - Test YAML round-trip behavior.
   - Run `npm run dist`.
   - Smoke-test in Joplin dev mode with AnkiConnect running.

Out of scope:
- Grading. Deferred to M2.
- Splitting.
- Created study cards.
- Staleness detection.

## M2 — Review Loop / Grading Sync

Goal: review due chunks in Joplin and send grades to Anki scheduler cards.

Status: implemented.

Implementation steps:

1. Extend the Anki gateway for review grading.
   - Add `reviewCard(cardId, rating)`.
   - Use Anki's normal answer buttons, with ratings `1` through `4`.
   - Surface AnkiConnect errors clearly.

2. Add grade controls to the Due Chunks panel.
   - Show grade buttons for each due chunk.
   - Send panel messages with the selected `ankiCardId` and rating.
   - Keep the panel read-only for chunk text.

3. Handle grading messages in the plugin.
   - Send the selected rating to Anki.
   - Refresh the Due Chunks panel after grading.
   - Show a clear error if grading fails.

4. Sync scheduler metadata after grading.
   - Always update `scheduler.lastSyncAt`.
   - Update `scheduler.lastKnownState` and `scheduler.lastKnownDue` when
     AnkiConnect exposes them cleanly.
   - Persist updated scheduler metadata back into chunk YAML.

5. Add verification.
   - Test Anki gateway grading request shape.
   - Test panel grade message rendering and handling.
   - Test scheduler metadata updates.
   - Test queue refresh after grading.
   - Run `npm test`.
   - Run `npm run dist`.
   - Smoke-test grading in Joplin dev mode with AnkiConnect running.

Out of scope:
- Splitting chunks.
- Created study cards.
- Staleness detection.
- Editing chunk text during review.
- Custom scheduling policy beyond Anki ratings.

## M3 — Chunk Splitting / Card Creation

Implementation steps:

1. Add chunk splitting commands.
   - Split a selected chunk into child chunks.
   - Preserve `rootChunkId`.
   - Set each child chunk's `parentChunkId`.
   - Mark the parent chunk as `superseded`.

2. Regenerate scheduler cards for split chunks.
   - Suspend the parent chunk's scheduler card.
   - Create fresh scheduler cards for each child chunk.
   - Persist each child chunk's scheduler binding in YAML.

3. Add card creation from chunks.
   - Add commands to create Basic cards.
   - Add commands to create Cloze cards.
   - Create cards in `IR::Cards::<sourceNoteId>`.
   - Store `CreatedCardLink` entries in chunk YAML.

4. Preserve provenance.
   - Link created cards to the source chunk ID.
   - Store the source chunk version.
   - Store the source text hash.
   - Never reassign created cards to newer chunk versions.

5. Add verification.
   - Test parent superseding and child lineage.
   - Test scheduler regeneration after splitting.
   - Test Basic card creation.
   - Test Cloze card creation.
   - Test `CreatedCardLink` persistence.
   - Run `npm test`.
   - Run `npm run dist`.
