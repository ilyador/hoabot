# AI-Powered Rule Citation for Violations

## Overview

After creating a violation, admins can click "Find Related Rule" to search indexed CC&Rs/bylaws for the relevant rule section. The AI matches the violation's type and description against document chunks and suggests the top matches. The admin picks one to attach to the violation record. The stored citation appears on the violation detail and feeds into generated notices.

## Prerequisites

- `searchChunks` in `server/src/ai.ts` is currently not exported. It must be exported so the violations router can call it directly.

## Data Model

Add one nullable field to the Violation model in `prisma/schema.prisma`:

```prisma
ruleCitation String?   // AI-suggested CC&R rule text, confirmed by admin
```

No new tables or relations. Requires `pnpm db:push` (safe — nullable field, no data loss).

## Server Endpoints

### Violations Router Additions (`server/src/routers/violations.ts`)

**`violations.suggestRule`** (`adminProcedure`)
- Input: `{ violationId: string }`
- Fetches the violation, validates it belongs to this HOA
- Builds search query from `type + " " + description`
- Calls `searchChunks(hoaId, query, 3)` (newly exported from `ai.ts`)
- Filters results to score > 0.3 (consistent with the threshold used in `askCCR`)
- Returns `{ suggestions: { content: string, section: string | null, score: number }[] }`
- Returns empty array if no documents indexed or no matches above threshold

**`violations.saveRule`** (`adminProcedure`)
- Input: `{ violationId: string, ruleCitation: z.string().max(3000) }`
- Validates violation belongs to this HOA
- Normalizes empty string to `null` before storing
- Updates `Violation.ruleCitation`
- Returns updated violation

Note: `saveRule` does not enforce that the text came from `suggestRule`. Admins are trusted — this is a pragmatic choice for simplicity.

### AI Module Changes

**`server/src/ai.ts`:**
- Export `searchChunks` (add `export` keyword)
- Update `generateViolationNotice` to accept optional `ruleCitation` parameter
- When `ruleCitation` is present, include it in the ChatGPT context as the confirmed rule, plus still fetch additional chunks via `searchChunks` for broader context. The citation is prepended as "The confirmed relevant rule is: {ruleCitation}" before other context.
- Falls back to current behavior (search only) if no citation provided

**`server/src/routers/ai.ts`:**
- `generateNotice` endpoint fetches the violation's `ruleCitation` and passes it to `generateViolationNotice` when present

## Frontend

### ViolationsPage.tsx — Violation Row Additions

The current ViolationsPage shows violations in a list with a status dropdown and delete button per row. There are no expandable detail panels. The rule citation UI is added inline to each violation row.

**When no citation is saved:**
- "Find Related Rule" button (`.btn .btn-secondary .btn-sm`) alongside existing actions
- On click: calls `violations.suggestRule`, shows loading state
- Displays suggestions below the violation row in a dropdown-style panel: section name in bold, content excerpt (first 200 chars) below, "Use This Rule" button on each
- "No matching rules found in your documents" if empty results

**When citation is saved:**
- Display the citation in a styled block below the violation description (bordered, with a "Cited Rule" mono label — uses the existing pattern of `border-left: 3px solid var(--accent)` with background `var(--accent-muted)`)
- Small "Clear" ghost button to remove the citation (calls `saveRule` with empty string)

**No changes to the violation creation form.** This is a post-creation action only.

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| No documents uploaded/indexed | `suggestRule` returns empty suggestions, UI shows "No matching rules found" |
| OpenAI API unavailable | `searchChunks` throws, endpoint returns error, UI shows error message |
| Violation already has a citation | Show it directly, no "Find Related Rule" button (just "Clear" to reset) |
| Admin clears citation | `saveRule` with empty string → server normalizes to null |
| Multiple admins | Last write wins — no conflict resolution needed for a single text field |
| Chunk text very long | `saveRule` Zod schema limits to 3000 chars; `suggestRule` returns raw chunks (~500 words max from chunking) which fit within this limit |

## Out of Scope

- Automatic rule suggestion during violation creation
- Multiple rule citations per violation
- Rule citation for maintenance requests or other entities
- Editing the citation text (admin picks from suggestions or clears — no free-text editing of the AI result)

## Testing

Integration tests:
- `violations.suggestRule` returns suggestions when documents are indexed
- `violations.suggestRule` returns empty array when no documents exist
- `violations.saveRule` stores citation on the violation
- `violations.saveRule` normalizes empty string to null
- `violations.saveRule` rejects violations from other HOAs
- Saved `ruleCitation` is included in `violations.list` results
- `ai.generateNotice` passes `ruleCitation` to the AI function when present
- `ai.generateNotice` falls back to `searchChunks` when no citation exists
