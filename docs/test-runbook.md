# Manual Test Runbook

This runbook verifies the current M1-M3 plugin behavior in a Joplin
development profile with AnkiConnect running. Use a disposable Joplin profile
and, if possible, a disposable Anki profile.

## 1. Prerequisites

1. Install Joplin Desktop.
2. Install Anki Desktop.
3. Install and enable the AnkiConnect add-on in Anki.
4. Start Anki Desktop.
5. Confirm AnkiConnect responds:

```bash
curl -s http://127.0.0.1:8765 -X POST \
  -H "Content-Type: application/json" \
  -d '{"action":"version","version":6}'
```

Expected result:

```json
{"result":6,"error":null}
```

## 2. Build And Install

1. Install dependencies if needed:

```bash
npm ci
```

2. Run the automated checks:

```bash
npm test
```

Expected result: all tests pass.

3. Build the plugin archive:

```bash
npm run dist
```

Expected result:

```text
publish/joplin.plugin.ir-anki.jpl
```

4. Open Joplin in development mode:
   - Open normal Joplin.
   - Select `Help > Copy dev mode command to clipboard`.
   - Run the copied command in a terminal.

5. Install the built plugin in the development Joplin window:
   - Open `Tools > Options > Plugins` on Linux/Windows, or
     `Joplin > Preferences > Plugins` on macOS.
   - Select the plugin tools gear icon.
   - Select `Install from file`.
   - Choose `publish/joplin.plugin.ir-anki.jpl`.
   - Fully quit and restart the development Joplin window.

Expected result: `Joplin Incremental Reading` appears in the plugin list.

## 3. Test Data

Create a source note in Joplin named `IR QA Source`:

```markdown
# First Topic

The first topic introduces incremental reading.

It has enough text to make the first chunk readable.

# Second Topic

The second topic is used for review, splitting, and card creation.

It should remain separate from the first topic.
```

Keep this source note selected for the first feature test.

## 4. Enable Incremental Reading

1. Run `Tools > Enable Incremental Reading`.

Expected results:

- Joplin shows a success message for 2 created chunks.
- Joplin creates an `IR Chunks` notebook.
- The notebook contains 2 chunk notes.
- Each chunk note begins with readable chunk text, not YAML metadata.
- Each chunk note ends with a source-note link and an
  `<!-- ir-chunk-metadata ... -->` footer.
- The footer metadata contains `type: ir-chunk`, `sourceNoteId`,
  `scheduler.ankiNoteId`, and `scheduler.ankiCardId`.

2. In Anki Browse, confirm these resources exist:
   - Note type: `IRChunk`.
   - Deck: `IR::Chunks::<sourceNoteId>`.
   - 2 scheduler cards for the created chunks.

Expected result: the scheduler cards exist but are only used for scheduling;
chunk review remains in Joplin.

## 5. Due Chunks Panel

1. Run `Tools > Show Due Chunks`.

Expected results:

- The Due Chunks panel opens.
- The 2 new chunks are listed.
- Each listed chunk has `Again`, `Hard`, `Good`, and `Easy` buttons.

2. Click a chunk title in the panel.

Expected results:

- Joplin opens the selected chunk note.
- The Joplin console does not show a `joplin://` Content Security Policy
  error.
- The Due Chunks panel can still be opened again with
  `Tools > Show Due Chunks`.

## 6. Grading

1. Open `Tools > Show Due Chunks`.
2. Click `Good` for one due chunk.

Expected results:

- The panel refreshes.
- The graded chunk may disappear from the due list depending on Anki's
  scheduler state.
- The chunk note footer metadata updates `scheduler.lastSyncAt`.
- Anki receives the grade for the corresponding `IRChunk` scheduler card.

3. Run `Tools > Show Due Chunks` again.

Expected result: only currently due or new active chunks are listed.

## 7. Chunk Splitting

1. Open an active chunk note that has a scheduler card.
2. Replace the readable chunk body with:

```markdown
First child text.

<!-- ir-split -->

Second child text.
```

Leave the metadata footer in place.

3. Run `Tools > Split Current IR Chunk`.

Expected results:

- Joplin shows a success message for 2 child chunks.
- The parent chunk footer metadata changes to `lifecycle: superseded`.
- 2 child chunk notes are created in `IR Chunks`.
- Each child preserves the original `rootChunkId`.
- Each child has `parentChunkId` set to the parent chunk ID.
- Each child has a fresh scheduler binding in footer metadata.
- The parent scheduler card is suspended in Anki.

## 8. Basic Card Creation

1. Select an active chunk note.
2. Run `Tools > Create Basic Card from Chunk`.

Expected results:

- Joplin shows `Created Basic Anki card.`
- Anki creates deck `IR::Cards::<sourceNoteId>` if missing.
- Anki creates note type `IRBasic` if missing.
- A Basic card is created with the chunk title as front and chunk body as back.
- The chunk footer metadata gets a `createdCards` entry with:
  - Anki note ID.
  - Anki card IDs.
  - Deck name.
  - Model name.
  - Source chunk ID.
  - Source chunk version.
  - Source text hash.
  - `status: active`.

3. Run `Tools > Create Basic Card from Chunk` again without changing the
   chunk body.

Expected result: the plugin refuses the duplicate active Basic card.

## 9. Cloze Card Creation

1. Select an active chunk note.
2. Edit the readable chunk body to include Anki cloze syntax:

```markdown
The capital of France is {{c1::Paris}}.
```

Leave the metadata footer in place.

3. Run `Tools > Create Cloze Card from Chunk`.

Expected results:

- Joplin shows `Created Cloze Anki card.`
- Anki creates note type `IRCloze` if missing.
- A Cloze card is created in `IR::Cards::<sourceNoteId>`.
- The chunk footer metadata gets a `createdCards` entry for the Cloze card.

4. Select another active chunk note without `{{c1::...}}` syntax.
5. Run `Tools > Create Cloze Card from Chunk`.

Expected result: the command fails before creating anything in Anki.

## 10. Metadata Footer Regression

1. Open a chunk note created or updated by the plugin.

Expected results:

- The readable chunk content appears at the top of the note.
- Plugin metadata appears at the end in this form:

```markdown
<!-- ir-chunk-metadata
type: ir-chunk
...
-->
```

2. Trigger a metadata update by grading, splitting, or creating a card.

Expected result: the metadata remains at the end of the note.

3. If testing an older chunk with top-of-note YAML frontmatter, trigger a
   plugin update.

Expected result: the plugin still parses the chunk and rewrites it with footer
metadata.

## 11. AnkiConnect Regression

1. With Anki running, run `Tools > Enable Incremental Reading` on a fresh
   source note with at least 2 headings.

Expected results:

- The command does not fail with `socket hang up`.
- If a transport error occurs, the error names the AnkiConnect action, for
  example `AnkiConnect modelNames request failed: ...`.

2. Run `Tools > Show Due Chunks`.

Expected result: due-card lookup succeeds without connection reuse errors.

## 12. Failure Checks

Run these in a disposable profile only.

1. Stop Anki Desktop.
2. Run `Tools > Enable Incremental Reading` on a fresh source note.

Expected results:

- The command fails clearly.
- Any chunk notes created during the failed enable attempt are removed.

3. Restart Anki Desktop.
4. Select a non-IR note.
5. Run `Tools > Split Current IR Chunk`.

Expected result: the command reports that an IR chunk note must be selected.

6. Select a non-IR note.
7. Run `Tools > Create Basic Card from Chunk`.

Expected result: the command reports that an IR chunk note must be selected.

## 13. Cleanup

1. Delete the Joplin test source note.
2. Delete generated test chunk notes from `IR Chunks`.
3. Empty Joplin trash if needed.
4. In Anki, delete test decks created by the run:
   - `IR::Chunks::<sourceNoteId>`
   - `IR::Cards::<sourceNoteId>`

If using a disposable Anki profile, deleting the profile is simpler than
manually deleting generated note types.

## 14. Pass Criteria

The run passes when:

- The plugin installs and loads in Joplin development mode.
- Enabling IR creates chunk notes and scheduler cards.
- Chunks open from the Due Chunks panel.
- Grading updates Anki and chunk footer metadata.
- Splitting supersedes the parent and creates scheduled children.
- Basic and Cloze card creation work and record provenance.
- Duplicate Basic card creation is refused.
- Cloze creation without cloze syntax is refused before Anki mutation.
- Chunk metadata remains at the end of the note.
- No unexpected Joplin dialogs, console errors, or AnkiConnect transport
  resets appear during the passing path.
