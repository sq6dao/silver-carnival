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
- Grading.
- Splitting.
- Created study cards.
- Staleness detection.
