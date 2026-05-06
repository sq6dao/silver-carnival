# Joplin IR Anki Plugin — Agent Instructions

We are building a Joplin plugin for incremental reading using Anki.

## Product direction

- Joplin is canonical for content and workflow.
- Chunks are separate reviewable Joplin notes/documents.
- Anki is used as the scheduler for chunks.
- Chunk review happens in Joplin, not Anki.
- Created Anki cards are optional and independent.
- Preserve provenance: source note ID, chunk ID, source text hash, card links.

## Engineering preferences

- TypeScript.
- Standard Joplin plugin patterns.
- Small modules with explicit interfaces.
- Local-first storage.
- Idempotent sync behavior.
- Avoid duplicate scheduler cards and duplicate created cards.
- Prefer minimal working milestones.

## Module boundaries

Keep these separate:

- Joplin API/UI layer
- Chunk extraction
- Chunk repository/storage
- Anki gateway
- Review queue service
- Card creation service

## First milestone

Implement M1 only:

- heading-based chunk extraction
- local chunk repository
- minimal AnkiConnect gateway
- create IRChunk scheduler notes
- map chunkId to ankiCardId
- simple Due Chunks panel

## Before coding

Read:

- docs/design-spec.md
- docs/roadmap.md
- docs/decisions.md

When unsure, make the smallest reversible implementation and record the assumption in docs/decisions.md.
