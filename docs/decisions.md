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
