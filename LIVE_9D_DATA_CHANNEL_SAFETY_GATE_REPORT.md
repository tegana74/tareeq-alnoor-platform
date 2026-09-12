# REVISED LIVE-9D DATA CHANNEL SAFETY GATE REPORT

## 1. Executive Summary
This revised report confirms the Hybrid architecture for real-time communication. All student-initiated actions must transit through the REST API for server-side validation.

## 2. Rules Loaded
- CLAUDE.md
- AGENTS.md

## 3. Current LiveKit Data State
- `canPublishData: false` for students.
- Hybrid architecture ensures students never need `canPublishData: true`.

## 4. Security Threat Model
- Students cannot originate data packets directly into the room.
- REST API enforces auth, roles, and course ownership before broadcasting signals.

## 5. Direct DataChannel Analysis
- Rejected: Insecure for students, difficult to secure.

## 6. REST Relay Analysis
- Supported for persistence, but Hybrid adds performance for ephemeral UI signals.

## 7. Hybrid Analysis (Recommended)
- **REST:** Authorization, validation, history, broadcasting via server-sdk.
- **DataChannel:** Ephemeral broadcast (Server -> Client) only.

## 8. Authorization Model
- **Action Flow:** Student -> REST API -> Server-Side Auth/Logic -> LiveKit Room broadcast (using server-side `canPublishData`).
- **Teacher/Admin:** Can publish via API or direct DataChannel if permitted.

## 9. Server Authority
- All actions are server-authoritative. REST API validates state (e.g., "is user allowed to raise hand").

## 10. Message Contract
- **Schema:** 
  - `type`: "CHAT_MESSAGE" | "RAISE_HAND" | "RAISE_HAND_CLEAR" | "MUTE_EVENT"
  - `version`: 1
  - `sessionId`: string
  - `senderId`: string
  - `timestamp`: number
  - `payload`: { message?: string, ... }
- **Validation:** Server-side JSON schema validation (Zod). Unknown/malformed packets are dropped by server/discarded by client.

## 11. Rate Limiting
- **Chat:** Max 5 messages/second per user.
- **Raise Hand:** Max 1 request/second per user.
- **REST:** 20 requests/10 seconds per user.

## 12. Chat History
- **LIVE-9D Scope:** Ephemeral only. Persistent chat history is OUT OF SCOPE.

## 13. Raise Hand State
- **State:** Server-managed.
- **Reconnect:** Client fetches current state on join/reconnect via REST.

## 14. Reliable vs Lossy
- **Chat/Raise Hand:** Reliable (via REST broadcast).
- **UI Events:** Lossy (if needed, via DataChannel).

## 15. Browser E2E
- **Unit/Mock:** Test logic/schemas.
- **Playwright:** Network stubbing for API responses.
- **Real E2E:** 2 browser contexts (Teacher + Student), real room join, REST action trigger -> verify signal receipt in Student view.

## 16. Test Environment
- Isolated Test Project ID, non-prod Neon DB, 2+ browser contexts.

## 17. Production Safety
- No code/DB changes this phase.

## 18. Decision Matrix
| Criterion | Hybrid (Proposed) |
| :--- | :--- |
| Security | Highest (Auth-first) |
| Scalability | Server-managed |

## 19. Final Architectural Decision
- **RECOMMENDED:** Hybrid (Client -> REST -> Server -> DataChannel).
- **CHATS:** Ephemeral.
- **RAISE HAND:** Server-managed state.

## 20. Open Questions
- None.

## 21. Implementation Scope
- **IN SCOPE:** Define Schema, Implement REST Relay API, Setup ephemeral broadcasting logic.
- **OUT OF SCOPE:** DB Migrations, Persistence, UI Implementation.
- **Migration Required:** NO
- **New Service Required:** NO
- **New Dependency Required:** NO

## 22. Status
- PASS — READY FOR IMPLEMENTATION

## 23. Confirmations
- NO CODE CHANGES: YES
- NO DB CHANGES: YES
- NO MIGRATION: YES
- NO COMMIT: YES
- NO PUSH: YES
- NO DEPLOY: YES
