# Joplin Incremental Reading Anki Plugin

This is a Joplin plugin for incremental reading with Anki as the
scheduling backend.

Joplin is the canonical workspace for reading, chunk review, and source
content. Anki is used only to schedule chunk reviews. Chunks are stored as
separate Joplin notes with provenance metadata linking them back to their
source note and, later, to any scheduler or study cards created in Anki.

## Current Status

The repository currently builds a minimal plugin that verifies the Joplin
plugin setup works. On startup, it logs:

```text
Hello world. Test plugin started!
```

The first product milestone is M1:

- Heading-based chunk extraction.
- Local chunk repository.
- Minimal AnkiConnect gateway.
- Scheduler notes using the `IRChunk` model.
- Mapping from `chunkId` to `ankiCardId`.
- A simple Due Chunks panel in Joplin.

Out of scope for M1:

- Grading.
- Splitting.
- Created study cards.
- Staleness detection.

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

## Smoke Test

The current minimal plugin does not add UI yet. To verify that it loaded,
check the startup log for:

```text
Hello world. Test plugin started!
```

Useful places to check:

- `Help > Toggle Development Tools`, then the Console tab.
- Joplin's log screen, filtering for `joplin.plugin.ir-anki`.

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

- [Design spec](docs/design-spec.md)
- [Roadmap](docs/roadmap.md)
- [Decisions](docs/decisions.md)
- [Joplin plugin generator notes](GENERATOR_DOC.md)
