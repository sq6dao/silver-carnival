# Usage Guide

This guide covers the current M1-M3 workflow: enabling incremental reading
for a Joplin note, reviewing due chunks in Joplin, grading those reviews
through Anki, splitting chunks, and creating study cards from chunks.

## Requirements

- Joplin Desktop with the plugin installed and enabled.
- Anki Desktop running.
- The AnkiConnect add-on enabled at `http://127.0.0.1:8765`.

The plugin creates its own Anki decks and note types when needed. It does
not require manual Anki setup beyond AnkiConnect.

## Concepts

- A source note is the original Joplin note you want to read
  incrementally.
- A chunk is a separate Joplin note created from a heading section in the
  source note.
- A scheduler card is an Anki card used only to schedule chunk reviews.
  Review the chunk in Joplin, not in Anki.
- A created card is an optional Basic or Cloze Anki card made from a chunk.
  These cards are reviewed normally in Anki.

Joplin is the source of truth for chunk content and metadata. Anki is used
as the scheduler for chunks and as the normal review tool for created cards.

## Enable Incremental Reading

Prepare a Joplin note with Markdown headings:

```markdown
# First Topic

Text for the first chunk.

# Second Topic

Text for the second chunk.
```

Then:

1. Start Anki Desktop.
2. Select the source note in Joplin.
3. Run `Tools > Enable Incremental Reading`.

The plugin creates:

- An `IR Chunks` notebook in Joplin.
- One chunk note per heading section.
- An Anki scheduler deck named `IR::Chunks::<sourceNoteId>`.
- One `IRChunk` scheduler card per chunk.

If AnkiConnect is unavailable, the command fails and any partially created
chunk notes are removed.

## Review Due Chunks

Run `Tools > Show Due Chunks`.

The Due Chunks panel lists active chunks whose Anki scheduler cards are new
or due. Open the chunk from the panel, read it in Joplin, then grade it from
the panel:

- `Again`
- `Hard`
- `Good`
- `Easy`

The grade is sent to Anki for the scheduler card. The plugin then refreshes
the panel and writes scheduler metadata such as `lastSyncAt` back into the
chunk note YAML.

Do not review `IRChunk` scheduler cards directly in Anki. They exist only to
drive the Joplin review queue.

## Split a Chunk

Open an active chunk note and add this marker anywhere you want a new child
chunk boundary:

```markdown
<!-- ir-split -->
```

Example:

```markdown
First child text.

<!-- ir-split -->

Second child text.
```

Then run `Tools > Split Current IR Chunk`.

The plugin:

- Creates one child chunk for each non-empty split part.
- Preserves the original `rootChunkId`.
- Sets each child's `parentChunkId` to the original chunk ID.
- Creates fresh scheduler cards for the child chunks.
- Suspends the parent scheduler card.
- Marks the parent chunk lifecycle as `superseded`.

Splitting requires the selected note to be an active IR chunk with an
existing scheduler card.

## Create a Basic Card

Select an active chunk note and run
`Tools > Create Basic Card from Chunk`.

The plugin creates a Basic Anki card using:

- Front: chunk title.
- Back: chunk body.

The card is created in `IR::Cards::<sourceNoteId>` with the `IRBasic` note
type. The chunk YAML receives a `createdCards` entry with the Anki note ID,
card IDs, source chunk ID, source chunk version, and source text hash.

The plugin refuses to create a duplicate active Basic card for the same
chunk version and text hash.

## Create a Cloze Card

Edit the active chunk body so it contains Anki cloze syntax:

```markdown
The capital of France is {{c1::Paris}}.
```

Then run `Tools > Create Cloze Card from Chunk`.

The card is created in `IR::Cards::<sourceNoteId>` with the `IRCloze` note
type. The chunk YAML receives the same provenance fields as Basic cards.

If the chunk does not contain cloze syntax, the command fails before calling
Anki.

## Editing Chunks

Chunk notes are ordinary Joplin notes, but their YAML frontmatter is plugin
metadata. Avoid editing YAML fields unless you are intentionally repairing
metadata.

If chunk body text changes before card creation, the plugin updates the
chunk text hash, advances the chunk version, and marks older created-card
links for that chunk text as `stale`.

Automatic stale-card reconciliation is not implemented yet.

## Troubleshooting

If enabling, grading, splitting, or card creation fails:

1. Confirm Anki Desktop is open.
2. Confirm AnkiConnect is installed and enabled.
3. Confirm `http://127.0.0.1:8765` is reachable from the same machine.
4. Confirm the selected Joplin note is the right kind of note:
   source note for enabling, active IR chunk note for split/card commands.
5. Check the error dialog shown by Joplin for the specific failing step.

Common causes:

- Anki is not running.
- AnkiConnect is not installed.
- The selected note is not an IR chunk.
- The chunk has already been superseded.
- The chunk has no scheduler card.
- A Cloze card command was run without `{{c1::...}}` syntax.

## Generated Resources

Joplin:

- Notebook: `IR Chunks`
- Chunk notes with YAML frontmatter and source-note links.

Anki:

- Scheduler deck: `IR::Chunks::<sourceNoteId>`
- Created-card deck: `IR::Cards::<sourceNoteId>`
- Scheduler note type: `IRChunk`
- Created-card note types: `IRBasic`, `IRCloze`
