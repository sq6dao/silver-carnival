# Decisions

## D001 — Anki schedules chunks

Chunk scheduler cards live in Anki, but reviews happen in Joplin.

## D002 — Splitting creates fresh scheduler cards

Do not reuse parent scheduler cards after splitting.

## D003 — Created study cards are independent

Cards derived from chunks are normal Anki cards and remain linked to the original chunk version.

## D004 — M1 chunks live in a plugin notebook

For M1, chunk notes are created in a single top-level Joplin notebook named
`IR Chunks`. Source-note provenance is stored in each chunk note's YAML
metadata, so the notebook layout can be changed later without changing the
core data model.

## D005 — Plugin ensures Anki scheduler resources

For M1, the plugin creates the `IRChunk` Anki note type and scheduler decks
through AnkiConnect when they are missing. If AnkiConnect is unavailable, the
operation fails clearly instead of silently creating unscheduled chunks.

## D006 — M3 splits use an explicit marker

Joplin's plugin API does not expose a stable selected-text workflow for this
milestone, so chunk splitting uses an explicit marker in the selected chunk
note body:

```markdown
<!-- ir-split -->
```

The plugin trims empty split parts, creates one child chunk per non-empty
part, suspends the parent scheduler card, and marks the parent chunk as
`superseded`.

## D007 — M3 created cards use plugin-owned models

Created study cards use plugin-owned Anki note types: `IRBasic` and
`IRCloze`. They are created in `IR::Cards::<sourceNoteId>` and recorded in
the chunk note's `createdCards` YAML metadata with the source chunk ID,
chunk version, and source text hash.

The card creation service refuses duplicate active cards for the same model,
chunk version, and text hash. If the current chunk note body changed since
the last stored text hash, card creation advances the chunk version and
marks older created-card links for that chunk text as `stale`.

## D008 — AnkiConnect requests use closed HTTP connections

Sequential Node `http.request` calls against AnkiConnect can fail with
`socket hang up` when a previous request connection is reused. The plugin
therefore sends each AnkiConnect request with `Connection: close` and
`agent: false`. This keeps the gateway simple and matches the local
AnkiConnect behavior verified during manual testing.

Transport-level failures include the AnkiConnect action name in the error
message so the failing request is visible in Joplin dialogs.

## D009 — Due panel opens chunks via plugin messages

The Due Chunks panel does not navigate directly to `joplin://` URLs because
Joplin's panel webview can block that scheme with Content Security Policy
errors. Chunk titles post an `openChunk` message to the plugin, and the
plugin opens the note through Joplin's command API.

## D010 — Chunk metadata lives at the end of notes

Chunk notes render readable content first and store plugin-owned YAML in a
footer HTML comment block. This keeps review text prominent when a chunk is
opened in Joplin while preserving local-first YAML provenance in the note
body.

The parser remains backward compatible with earlier top-of-note YAML
frontmatter. When an existing chunk is updated by the plugin, it is rewritten
with footer metadata.
