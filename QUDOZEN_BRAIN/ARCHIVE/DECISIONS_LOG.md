# 🏛️ 1000-YEAR ARCHIVE: DECISIONS LOG

> **What is this?** This is the Long-Term Memory (LTM) vault.
> When `EXECUTION_LOG.md` (Medium-Term Memory) gets too long (over 10 entries), AI agents are instructed to compress the oldest entries and move the "Wisdom" here.

We do NOT save step-by-step logs here. We only save **Immutable Architectural Decisions** and **Hard Lessons Learned**. This prevents context-window bloat while ensuring infinite memory scaling.

---

## 📅 Compressed Wisdom (Chronological)

### [2026-04] The Growth Swarm 3.0 Pivot
- **Context:** The system was originally a single dental reception bot. We pivoted to an autonomous B2B outbound engine (Growth Swarm).
- **Decision:** Shifted the source of truth from `growth_leads_v2` to a 4D-intelligence schema (`gs_leads`, `gs_sequences`, `gs_feedback`).
- **Why:** The legacy system lacked stateful follow-ups and AI self-correction. 
- **Rule Established:** The Twilio webhook now MUST intercept intent and actively pause `gs_sequences` on objections or opt-outs before passing messages to the bot.

### [2026-04] Atomic Slot Locking
- **Context:** High collision risk for appointments.
- **Decision:** Implemented Postgres-level atomic locks in `slots.js` (`UPDATE doctor_slots SET ... WHERE status = 'available' RETURNING *`).
- **Rule Established:** NEVER manage slot availability in Node.js memory. Always rely on Postgres atomic updates.

### [2026-04] Illusion Architecture (Ghost Room)
- **Context:** Need to close leads without a human sales team.
- **Decision:** Created a 3-layer architecture. Layer 1 (Scouting) → Layer 2 (Objection Handling as "Jake") → Layer 3 (Ghost Room Demo).
- **Why:** Let the prospect experience the bot's value natively in WhatsApp before pitching a price.

---
*End of Archive*
