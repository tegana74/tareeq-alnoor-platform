@AGENTS.md

# TAREEQ ALNOOR PROJECT RULES

## Current Project Status

Completed phases:

- FIX-1 — Production Schema Sync
- FIX-2 — Storage Reliability
- FIX-3 — YouTube Hardening
- FIX-4 — Exam Labels i18n
- FIX-5 — Exam Import Wizard
- FIX-6 — AI Exam Expansion
- FIX-7 — Live Room Shell

---

## Core Architecture

Production educational platform using:

- Next.js
- TypeScript
- Prisma
- Neon PostgreSQL
- Supabase Storage
- Existing authentication and role guards
- Existing Exam Engine
- Existing AI Question Generator
- Existing Live Classroom architecture

Do not create duplicate systems when an existing system can be extended safely.

---

## Critical Safety Rules

Never use:

- prisma db push
- prisma migrate reset

For schema changes:

1. inspect current schema
2. inspect migrations
3. validate migration safety
4. run prisma migrate deploy
5. run prisma migrate status
6. verify production

---

## Production Rules

Every implementation phase must end with:

1. local validation
2. git diff review
3. commit
4. git push origin main
5. Vercel deployment verification
6. production smoke test
7. Markdown completion report

Never claim production success without actual evidence.

---

## Validation Commands

Run from the project root:

npx tsc --noEmit
npx eslint src
npx vitest run --no-file-parallelism

Use npx for local binaries.

Do not rely on globally installed eslint/vitest.

---

## Testing Rules

Current baseline after FIX-5:

215/215 tests passing.

If tests fail:

1. determine whether failures are pre-existing
2. compare with baseline
3. do not weaken or delete tests
4. report exact failures

---

## Exam Rules

Exam completion:

- score < 50% = not completed
- score >= 50% = completed

MCQ correct answers remain numeric indexes.

Arabic option labels:

- أ
- ب
- ج
- د

English option labels:

- A
- B
- C
- D

Do not store option letters in the database.

Use the shared exam-label helper.

---

## Exam Engine Rules

Do not create a second Exam Engine.

Existing manual exams and AI-generated exams must continue using the current persistence and grading system.

Question types currently include:

- MCQ
- ESSAY
- AUTO_ESSAY

TRUE/FALSE may be represented as a two-option MCQ when compatible with the current schema.

Do not invent automatic AI essay grading.

---

## Media Rules

Storage bucket must remain private.

Use:

- signed upload
- signed read
- server-side authorization

Never expose:

- Supabase service key
- storage secrets
- unnecessary raw signed URLs
- protected file URLs to unauthorized users

Large videos must not depend on Vercel serverless request-body uploads.

---

## Provider Rules

Existing providers include:

- YouTube
- Vimeo
- Bunny
- VdoCipher
- Gumlet
- Upload

Do not break a working provider while fixing another.

YouTube URLs must use strict validation and normalization.

Failed YouTube extraction must never fall back to injecting the raw URL into an iframe.

---

## Live Streaming Rules

Existing Live Classroom data and access rules must be preserved.

Important:

The project does NOT yet have a complete live media streaming engine.

Do not claim Live Classroom is a complete streaming system merely because room UI exists.

The future live media layer will be implemented separately.

---

## Security

Never trust client-supplied:

- userId
- teacherId
- ownership
- subscription status
- section ownership

Always derive identity from the authenticated session and enforce authorization server-side.

Never expose secrets in:

- browser responses
- client serialization
- logs
- test fixtures
- git

---

## Scope Discipline

Each phase should solve only its defined scope.

Do not refactor unrelated files.

Do not modify completed phases unless required by verified dependency or regression.

Before changing architecture:

- inspect existing implementation
- identify root cause
- prefer the smallest safe change

---

## Claude Code Skills Policy

Skills must be selected deliberately by task type, not left to automatic selection alone.

### Installed Skills

Verified available in this environment (2026-08-25). Use these exact invocation names:

| Purpose | Skill name |
| --- | --- |
| Frontend / UI / UX design | `frontend-design` (also `front:frontend-design`) |
| Browser / E2E automation | `playwright` |
| Frontend testing | `front:frontend-testing` |
| Frontend code review | `front:frontend-code-review` |

The `front:` prefix comes from the `frontend-skills` plugin. Re-verify availability before relying on any skill (see Skill Discovery below).

### 1. Frontend / UI / UX

Use `frontend-design` for any task involving:

- creating a screen
- modifying an interface
- React components
- Tailwind
- layout
- responsive design
- accessibility
- visual hierarchy
- interaction design

After implementation, use the frontend code review skill to review:

- component structure
- React hooks
- performance
- accessibility
- maintainability

### 2. Browser / E2E

Use `playwright` for any task that requires:

- real login
- testing an actual page
- camera / microphone
- screen sharing
- LiveKit browser behavior
- Waiting Room
- Chat
- Raise Hand
- participant management
- reconnect behavior
- mobile / responsive browser behavior

Vitest is not a substitute for browser E2E when the behavior depends on the browser, hardware permissions, or media APIs.

### 3. Frontend Testing

Use `front:frontend-testing` when creating or modifying:

- React UI tests
- browser-facing logic
- component behavior

### 4. Code Review

Before closing any large frontend phase, use `front:frontend-code-review` to review:

- architecture
- React state
- hooks dependencies
- unnecessary rerenders
- accessibility
- security boundaries
- dead code
- duplicated logic

### 5. Design Review

At the end of any UI/UX phase, use `frontend-design` to review:

- typography
- spacing
- visual hierarchy
- consistency
- responsive behavior
- empty states
- error states
- loading states
- accessibility
- mobile behavior

### 6. Live Classroom Special Rules

For LIVE-9 and later:

| Phase | Required skills |
| --- | --- |
| LIVE-9A — Camera / Screen Share | `frontend-design`, `playwright`, `front:frontend-testing` |
| LIVE-9B — Admission / Waiting Room | `frontend-design`, `playwright`, `front:frontend-testing`, `front:frontend-code-review` |
| LIVE-9C — Participant Management | `frontend-design`, `playwright`, `front:frontend-testing`, `front:frontend-code-review` |
| LIVE-9D — Chat / Raise Hand | `frontend-design`, `playwright`, `front:frontend-testing` |
| LIVE-9E — Microphone Permissions / Mute All | `playwright`, `front:frontend-testing`, `front:frontend-code-review` |
| LIVE-9F | `playwright`, `front:frontend-testing`, `front:frontend-code-review` |

### 7. Do Not Load Every Skill For Every Task

Do not load all available skills for every task. Select only the skills that match the current scope.

Purpose:

- reduce conflicting instructions
- reduce context usage
- increase accuracy
- preserve execution speed

### 8. Skill Discovery

Before using a skill, confirm it is installed and available.

If a required skill is not installed:

- do not invent a skill name
- do not claim to have used it
- tell the user it is unavailable
- continue without it only if that is safe

### 9. Skill Priority

When skill instructions conflict with:

- CLAUDE.md
- AGENTS.md
- security rules
- phase scope

project rules and Security/Scope always take priority.

### 10. Phase Completion

A phase is not complete merely because:

- TypeScript passes
- ESLint passes
- Vitest passes

For Browser/UI/LiveKit tasks that depend on browser behavior, Browser E2E is part of the required completion evidence.

### 11. Production Verification

When working with:

- LiveKit
- camera
- microphone
- screen sharing
- Waiting Room
- chat
- participant moderation

distinguish clearly between, and never conflate:

- Unit tests
- Integration tests
- Browser E2E
- Production smoke test

### 12. No False Claims

Do not say "Complete" if the testing required by the phase scope was not actually executed.

If Browser E2E was not run, state explicitly:

"Implementation complete, browser E2E pending"

If a local build fails because of a pre-existing environment issue, do not fix unrelated code just to turn the build green.

### 13. Reports

Every phase report must include:

- Skills used
- Why each skill was used
- Tests run
- Browser E2E status
- Production verification
- Remaining risks

---

## Reports

Every phase must create:

<PHASE>_REPORT.md

Report must include:

- root cause
- files changed
- tests
- TypeScript
- ESLint
- Git commit
- deployment status
- production verification
- remaining risks
- final status

Final status must be:

- COMPLETE
- PARTIAL
- BLOCKED

Never invent production verification.

---

## Current Next Task

FIX-6 — AI Exam Expansion

Goals:

- MCQ
- TRUE/FALSE
- ESSAY
- MIXED
- Arabic
- English

with strict output validation and reuse of the current Exam Engine.