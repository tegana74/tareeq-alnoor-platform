---
name: live-9d-data-channel-safety-gate
description: Analysis of DataChannel safety for Chat/RaiseHand
metadata:
  type: project
---

The safety gate for LIVE-9D is in progress. The objective is to design a secure, scalable architecture for real-time data communication (Chat, Raise Hand) using LiveKit's infrastructure without introducing security vulnerabilities.

**Key Findings:**
1. Authorization: The current token issuance logic (`src/app/api/live/[id]/token/route.ts`) explicitly grants `canPublishData` only to `ADMIN` and `TEACHER` (session owners). Students currently receive `canPublishData: false`.
2. Security: Relying on `canPublishData: true` for all students would be insecure as it would allow arbitrary packet injection. 
3. Infrastructure: The platform heavily relies on REST + polling. Adding a data channel requires careful architectural consideration.

**Action Plan:**
1. Complete architectural analysis.
2. Produce `LIVE_9D_DATA_CHANNEL_SAFETY_GATE_REPORT.md`.
3. Do not modify any codebase or infrastructure.
