# Joplin Incremental Reading Anki Plugin

This is a Joplin plugin for incremental reading with Anki as the
scheduling backend.

Joplin is the canonical workspace for reading, chunk review, and source
content. Anki is used only to schedule chunk reviews. Chunks are stored as
separate Joplin notes with provenance metadata linking them back to their
source note and, later, to any scheduler or study cards created in Anki.

## Current Status

M1 through M3 are implemented:

- Heading-based chunk extraction.
- Joplin-backed chunk repository using an `IR Chunks` notebook.
- YAML metadata serialization and parsing.
- Minimal AnkiConnect gateway.
- Scheduler notes using the `IRChunk` model.
- Mapping from `chunkId` to `ankiCardId`.
- `Tools > Enable Incremental Reading`.
- `Tools > Show Due Chunks`.
- Due chunk grading in Joplin with Anki scheduler sync.
- Scheduler metadata sync back into chunk YAML.
- `Tools > Split Current IR Chunk`.
- `Tools > Create Basic Card from Chunk`.
- `Tools > Create Cloze Card from Chunk`.
- Created-card provenance in chunk YAML.

Out of scope:

- Staleness detection.
- Editing chunk text during review.

## Build

Install dependencies if needed:

```bash
npm install
```

Build the plugin archive:

```bash
npm run dist
```

The generated plugin archive is written to:

```text
publish/joplin.plugin.ir-anki.jpl
```

Run unit tests:

```bash
npm test
```

Check dependencies for known advisories:

```bash
npm audit
```

## Import Into Joplin

For testing, use Joplin's development mode so the plugin runs against a
separate test profile:

1. Open Joplin Desktop.
2. Select `Help > Copy dev mode command to clipboard`.
3. Run the copied command in a terminal.
4. In the development Joplin window, open `Tools > Options > Plugins`
   on Linux/Windows, or `Joplin > Preferences > Plugins` on macOS.
5. Click the plugin tools gear icon.
6. Select `Install from file`.
7. Choose `publish/joplin.plugin.ir-anki.jpl`.
8. Restart Joplin fully. On Linux/Windows, use `File > Quit` if Joplin
   normally minimizes to the system tray.

After restart, `Tools > Options > Plugins` should list:

```text
Joplin Incremental Reading
```

## AnkiConnect Setup

The plugin requires Anki Desktop with the AnkiConnect add-on running
locally at:

```text
http://127.0.0.1:8765
```

When incremental reading is enabled, the plugin creates missing Anki
resources automatically:

- Deck: `IR::Chunks::<sourceNoteId>`
- Note type: `IRChunk`

When study cards are created from chunks, the plugin also creates:

- Deck: `IR::Cards::<sourceNoteId>`
- Note types: `IRBasic`, `IRCloze`

If AnkiConnect is unavailable, enabling incremental reading fails with a
message and any chunk notes created during that failed attempt are deleted.

## M3 Workflows

To split an active chunk:

1. Open the chunk note in Joplin.
2. Insert this marker between each desired child chunk:

```markdown
<!-- ir-split -->
```

3. Run `Tools > Split Current IR Chunk`.

The plugin creates child chunk notes, creates fresh scheduler cards for the
children, suspends the parent scheduler card, and marks the parent chunk as
`superseded`.

To create a Basic card from a chunk, select an active chunk note and run
`Tools > Create Basic Card from Chunk`. The chunk title becomes the card
front and the chunk body becomes the back.

To create a Cloze card, add Anki cloze syntax to the chunk body, for example
`{{c1::answer}}`, then run `Tools > Create Cloze Card from Chunk`.

Created cards are linked in the chunk YAML under `createdCards`. Each link
stores the Anki note ID, card IDs, deck, model, source chunk ID, source chunk
version, and source text hash.

## Smoke Test

Use a test note with Markdown headings, for example:

```markdown
# Section One

Some text.

# Section Two

More text.
```

Then:

1. Start Anki Desktop.
2. Confirm AnkiConnect is enabled.
3. Build and load the plugin in Joplin development mode.
4. Select the test note in Joplin.
5. Run `Tools > Enable Incremental Reading`.
6. Confirm Joplin created an `IR Chunks` notebook with chunk notes.
7. Confirm Anki created scheduler cards using the `IRChunk` note type.
8. Run `Tools > Show Due Chunks`.
9. Confirm the Due Chunks panel lists due chunk notes.
10. Click `Again`, `Hard`, `Good`, or `Easy` for a due chunk.
11. Confirm the panel refreshes after grading.
12. Confirm the chunk note footer YAML updates `scheduler.lastSyncAt`.
13. Open a chunk note, insert `<!-- ir-split -->`, and run
    `Tools > Split Current IR Chunk`.
14. Confirm child chunk notes and child scheduler cards are created, and the
    parent chunk lifecycle is `superseded`.
15. Select an active chunk note and run
    `Tools > Create Basic Card from Chunk`.
16. Confirm Anki created the card in `IR::Cards::<sourceNoteId>` and the
    chunk footer YAML has a new `createdCards` entry.

The Due Chunks panel is read-only for chunk text.

## Development Plugin Path

For iterative development, rebuild with:

```bash
npm run dist
```

Then configure Joplin's development plugin path to point at the repository
root:

```text
/home/rap/Projects/codex/joplin-ir-anki
```

This avoids manually selecting the `.jpl` file after every change.

## References

- [Usage guide](docs/usage-guide.md)
- [Design spec](docs/design-spec.md)
- [Roadmap](docs/roadmap.md)
- [Decisions](docs/decisions.md)
- [Joplin plugin generator notes](GENERATOR_DOC.md)
