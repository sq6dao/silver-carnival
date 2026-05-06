# Joplin Incremental Reading Plugin - Design Spec (v0.2)

## 1. Overview

This plugin enables incremental reading in Joplin, using Anki as a
scheduling backend.

Core principles:

- Joplin is canonical for content and workflow.
- Chunks are separate Joplin notes.
- Chunks are the primary review unit.
- Anki is used only as a scheduler.
- Chunk review happens exclusively in Joplin.
- Created Anki cards are optional and independent.
- Full provenance is preserved: Note -> Chunk -> Card.
- All chunk metadata is stored as YAML in the note body.

## 2. Core Concepts

### 2.1 Source Note

- A standard Joplin note.
- User enables incremental reading on it.
- Acts as the origin of chunks.

### 2.2 Chunk (Joplin Note)

A chunk is a standalone Joplin note containing:

- Excerpt content.
- YAML metadata at the top of the note.
- Link to the source note.

Chunks are:

- Independently reviewable.
- Schedulable via Anki.
- Safe to open/edit without plugin, with caveats.

### 2.3 Scheduler Card (Anki)

- One per active chunk.
- Used only for scheduling.
- Not meant to be reviewed in the Anki UI.

### 2.4 Created Card (Anki)

- Optional study card, such as basic or cloze.
- Derived from chunk content.
- Reviewed normally in Anki.

## 3. High-Level Architecture

```text
Source Note (Joplin)
-> Chunk Notes (Joplin, YAML metadata)
-> Scheduler Cards (Anki)
-> Due state (queried from Anki)
```

Optional:

```text
Chunk -> Created Cards -> Reviewed in Anki
```

## 4. Chunk Note Format

Each chunk is a Joplin note.

### 4.1 YAML Metadata (Top of Note)

```yaml
---
type: ir-chunk

id: chunk_123
rootChunkId: chunk_123
parentChunkId: null

sourceNoteId: abc123
sourceNoteTitle: My Source Note

headingPath:
  - Section 1
  - Subsection A

anchor:
  startOffset: 120
  endOffset: 340
  textHash: abcxyz

lifecycle: active   # active | paused | superseded | done

scheduler:
  ankiNoteId: 123456789
  ankiCardId: 987654321
  deckName: IR::Chunks::abc123
  modelName: IRChunk
  lastKnownDue: null
  lastKnownState: null
  lastSyncAt: null

createdCards: []

createdAt: 1710000000
updatedAt: 1710000000
version: 1
textHash: hash_of_content
---
```

### 4.2 Note Body

Below YAML:

```markdown
# Chunk Title (optional)

<chunk content here>

---

Open source note: joplin://x-callback-url/openNote?id=abc123
```

## 5. Data Model (TypeScript)

### 5.1 ChunkRecord

```typescript
type ChunkId = string;

interface ChunkRecord {
  id: ChunkId;
  rootChunkId: ChunkId;
  parentChunkId?: ChunkId;

  sourceNoteId: string;
  sourceNoteTitle: string;

  headingPath?: string[];
  anchor?: ChunkAnchor;

  text: string;
  textHash: string;
  version: number;

  lifecycle: 'active' | 'paused' | 'superseded' | 'done';

  scheduler: ChunkSchedulerBinding;

  createdCards: CreatedCardLink[];

  createdAt: number;
  updatedAt: number;
}
```

### 5.2 Scheduler Binding

```typescript
interface ChunkSchedulerBinding {
  ankiNoteId: number;
  ankiCardId: number;

  deckName: string;
  modelName: string;

  lastKnownDue?: number | null;
  lastKnownState?: 'new' | 'learn' | 'review' | 'relearn' | 'suspended' | null;

  lastSyncAt?: number | null;
}
```

### 5.3 Created Card Link

```typescript
interface CreatedCardLink {
  ankiNoteId: number;
  ankiCardIds: number[];

  deckName: string;
  modelName: string;

  sourceChunkId: string;
  sourceChunkVersion: number;
  sourceTextHash: string;

  createdAt: number;

  status: 'active' | 'stale' | 'deleted';
}
```

### 5.4 Anchor

```typescript
interface ChunkAnchor {
  startOffset?: number;
  endOffset?: number;
  textHash?: string;
  headingPath?: string[];
}
```

## 6. Storage Strategy

Joplin notes are primary:

- YAML metadata + note content = source of truth.

Plugin-local storage is optional and may contain:

- Index.
- Due cache.
- Performance optimizations.

Rule: YAML is authoritative.

## 7. Notebook Structure

Option A:

```text
<Source Notebook>/
  Source Note
  Chunks/
    Active/
    Due/
    Done/
```

Option B:

```text
IR/
  <note_id>/
    chunks/
    cards/
```

## 8. Anki Integration

### 8.1 IRChunk Note Type

Fields:

- `chunkId`
- `rootChunkId`
- `joplinNoteId`
- `joplinNoteTitle`
- `chunkVersion`
- `chunkTextHash`
- `headingPath`
- `anchorData`
- `displayTitle`

Front:

```text
IR Chunk: {displayTitle}
```

Back:

```text
Reviewed in Joplin
```

### 8.2 Deck Structure

```text
IR/
  Chunks/
    <note_id>/
  Cards/
    <note_id>/
```

Rules:

- Chunks deck is not reviewed in Anki.
- Cards deck is used normally.

## 9. Core Workflows

### 9.1 Enable Incremental Reading

- Extract chunks from source note.
- Create chunk notes.
- Create scheduler cards.

### 9.2 Review Queue

- Query Anki for due chunk cards.
- Map to chunk notes.
- Display in Joplin.

### 9.3 Review

User can:

- Read.
- Open source.
- Split.
- Create cards.
- Grade.

### 9.4 Grading

- Send rating to Anki.
- Update scheduling.
- Refresh metadata.

### 9.5 Card Creation

- Create Basic/Cloze card.
- Store `CreatedCardLink` in YAML.

## 10. Chunk Splitting

Given chunk `C1`:

- Create `C1a` and `C1b`.
- Mark `C1` lifecycle as `superseded`.
- Suspend parent scheduler card.
- Create new scheduler cards for children.

Rules:

- Never reuse scheduler cards.
- Children start fresh scheduling.
- Parent is kept for provenance.

## 11. Provenance Rules

Chunk lineage:

- `rootChunkId` remains constant.
- `parentChunkId` tracks splits.

Cards store:

- `chunkId`
- `chunkVersion`
- `textHash`

No reassignment:

- Cards stay linked to original chunk.
- Cards may become stale.

## 12. Sync Model

- Ensure scheduler card exists per chunk.
- Fetch due cards.
- Map to chunks.
- Send grades.
- Update metadata.
- Handle splits.

## 13. Invariants

- Each active chunk has one scheduler card.
- Scheduler cards are not reviewed in Anki.
- Created cards are separate.
- Splitting creates new scheduler cards.
- Cards reference exact chunk version.

## 14. Module Boundaries

### ChunkExtractor

```typescript
interface ChunkExtractor {
  extract(note: JoplinNote): Promise<ChunkRecord[]>;
}
```

### ChunkRepository

```typescript
interface ChunkRepository {
  get(id: string): Promise<ChunkRecord | null>;
  listBySource(sourceNoteId: string): Promise<ChunkRecord[]>;
  save(chunk: ChunkRecord): Promise<void>;
  supersede(parentId: string, children: ChunkRecord[]): Promise<void>;
}
```

### AnkiGateway

```typescript
interface AnkiGateway {
  createChunkNote(chunk: ChunkRecord): Promise<{ noteId: number; cardId: number }>;
  reviewCard(cardId: number, rating: number): Promise<void>;
  getDueChunkCardIds(): Promise<number[]>;
}
```

### ReviewQueueService

```typescript
interface ReviewQueueService {
  getDueChunks(now: number): Promise<ChunkRecord[]>;
}
```

## 15. Milestones

### M1 - Chunk System

- Extraction.
- Chunk notes with YAML.
- Scheduler card creation.
- Due queue, read-only.

### M2 - Review Loop

- Grading.
- Sync.

### M3 - Splitting

- Lineage.
- Scheduler regeneration.

### M4 - Card Creation

- Basic/cloze cards.

### M5 - Staleness

- Detect and mark stale cards.

## 16. Open Questions

- Auto-chunking strategy?
- YAML validation?
- Notebook organization?
- Deletion handling?
- Offline mode?

## 17. Next Step

Implement M1:

- Chunk extraction based on headings.
- YAML parsing/serialization.
- Chunk note creation.
- Minimal Anki gateway.
- Mapping between chunk and card.
- Simple Due Chunks view.
