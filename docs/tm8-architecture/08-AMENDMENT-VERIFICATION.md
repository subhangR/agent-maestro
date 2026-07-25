# tm8 — Amendment Verification (second review pass)

**Status:** Final
**Date:** 2026-07-25
**Verifier:** Fable 5 verification reviewer (`sess_1784941747577_6shiysouf`, task `task_1784941718086_u2n464zsy`)
**Scope:** Fidelity + coherence pass over docs 00–06 as amended against `07-ARCHITECTURE-REVIEW.md`, per the T-D20 adjudication (R1–R13, R15–R29 accepted; R14 deferred). Not a re-review of the architecture; no settled decision is relitigated.

**Verdict: FAIL (narrow) — 27 of 29 R-changes verified applied correctly; R1 and R3 each left one contradicting residue in text the amendment sweep did not touch.** Two one-line fixes are blocking; four editorial nits are recommended. After the two blocking fixes land, the set can be stamped FINAL on a spot-check of those lines only — no further full pass needed.

---

## 1. Per-R verification table

Verdicts: **AC** = APPLIED-CORRECTLY · **AI** = APPLIED-INCORRECTLY (folded but residue/dilution breaks the R's intent somewhere in the set) · **MISSING** · **N/A** (deferred / no doc-text obligation).

| R | Demand (short) | Verdict | Evidence |
|---|---|---|---|
| R1 | Identity/accounts into the server block, every composition; gateway = routing + relay + spawner + remote-facing auth surface, never the primary account store | **AI** | Applied correctly in 01 T-L1 (server block gains identity/accounts, all compositions) and T-L8 (forbids gateway-owned account database); 02 §2 server/gateway rows; 02 §4.1 (auth surface fronts the node's identity block); 03 §5 (id issued by the node's identity block). **Residue: 05 T-D6 still reads "Owns identity/routing store only"** — a decision-log row asserting exactly the gateway-owned identity store R1 removed. See §2 fix F1. |
| R2 | Per-transaction `SET LOCAL` identity claims, not self-minted JWTs; low-privilege role invariant; JWTs only at verifying boundaries | AC | 01 T-L11 second para (mechanism + never table-owner/superuser + SECURITY DEFINER catalog per D8); 03 §5 ("posture kept… token step replaced"); 05 T-D3 (posture + R2 mechanism). The review's non-negotiable role invariant is carried in law text, not just the plan. |
| R3 | Bridge carries the full operation catalog (create/patch, RLS-scoped, expectedVersion); asymmetry re-scoped to bind the pulled-projection discipline; forbids-clause rewritten | **AI** | Applied correctly in 01 T-L6 (a/b split; forbids-clause matches the review verbatim) and 02 §5 (`create/patch` verb row [R3]; "the bridge carries the full operation catalog"). **Residue: 02 §2 bridge row "Never does" still reads "any write other than appends/commands to a remote"** — the pre-R3 restriction, contradicting §5 of the same doc. See §2 fix F2. |
| R4 | Hub trust model explicit in 02 §4 | AC | 02 §4 "The hub trust model, explicit [R4]" — admin-can-act-as, relay sees/never stores bytes, non-repudiation deferred to Phase 4, "choose your hub like your git host". Matches review intent fully. |
| R5 | Hosted-workspace execution disabled by default; node-admin capability, not a space role | AC | 02 §4.3 [R5] (with the "isolation is a start, not a sandbox" rationale); echoed in 06 Phase 2 and 06 §4 Q1. |
| R6 | Account lifecycle minimums: recovery, revocation, re-key compatibility | AC | 02 §4 "Account lifecycle minimums [R6]" — all three events, one line each, matching the review's answers (admin reset; sessions/tokens killed + history retained; opaque immutable `identity_id`). |
| R7 | `entity_kinds` keying: surrogate PK + `UNIQUE(space_id, kind)` + partial unique index for core; two-step kind resolution; no cross-space custom kinds; bridge delivers projection not registry import | AC | 03 §2 SQL (all three keying elements present, annotated [R7]) + resolution bullet (two-step lookup, trigger does the same; bridge note). |
| R8 | Drop `entity_ref` from v1; scalars only; relations are edges | AC | 03 §2 field_schema comment ("scalars ONLY") + dedicated bullet [R8] with the review's full rationale and "revisit only on demonstrated need"; 06 §4 Q3. |
| R9 | Schema-evolution rule: additive-or-relaxing; reads tolerate missing; tightening = explicit backfill; write-only validation, grandfathered rows | AC | 03 §2 "Schema evolution [R9]" — all four clauses present, semantically identical to the review. |
| R10 | `work_session` kind definition points at its commands | AC | 03 §1.1 "Commands: the `execution.*` operation-catalog family… [R10/R16]" — the delta doc now names the verbs where the kind is defined, as demanded. |
| R11 | Bridge infrastructure verbs: `fetch-blob`; remote inbox/read-marks home-side via catalog ops; cross-space Inbox aggregation named for the impl plan | AC | 02 §5 verb list (`fetch-blob` row [R11], membership-checked, relayable) + the per-member-state/Inbox-aggregation sentence [R11]; 06 Phase 2 ("full-catalog per R3 + fetch-blob per R11"). |
| R12 | Subscription depth: remote-live, memory-bounded cursor-keyed cache, cursor-resume/re-walk, no durable replication ever | AC | 02 §5 "Subscription depth rule [R12]" — all elements incl. the 7-day window, the pull-artifact/bookkeeping exception, and "durable replication… forbidden (multi-master by installments)"; 06 §4 Q2. |
| R13 | T-L5 carries its trades on its face | AC | 01 T-L5 "Consequences accepted [R13]" — availability, partition degradation, rehoming/membership re-establishment, export as trust backstop; identity-remap echoed in 06 §4 Q7. |
| R14 | Push transport — **DEFERRED by user (T-D20)** | **N/A** | Deferral recorded consistently: 05 T-D20 (outbox transport-agnostic, `channel` column, workers per transport, nothing in v1 needs one); 06 §4 "Deferred by the user"; 06 homes + Phase 2 ("dispatcher slot, transport deferred"). **Nothing in the set commits to a transport.** Observation (no action): T-D3's pre-existing "no Firebase anywhere" still latently forecloses FCM — that is the original R14 tension the user chose to leave open, correctly untouched by the amendments. |
| R15 | Sidecar operational story is v1 scope (pin major, backup-before-migrate, pg_dump, PG18+/uuidv7, locking, PGlite trigger = distribution failure) | AC | 06 §4 Q5 (all six rules adopted, incl. dual-stack data dirs and "never schema-forking") + 06 Phase 1 scope line. Fine-grain details (data-dir path shape, refuse-to-start-with-backup-path-surfaced) are summarized, not verbatim — acceptable: R15 is a fold-into-implementation-plan requirement and 06 carries the normative rules. |
| R16 | `execution.*` operation-catalog family designed now; 501 gating; terminal-frame exemption sentence in 01-LAWS | AC | 04 §5 (all four verbs, T-L12/`capabilities`/501 rationale verbatim); 01 T-L10 exemption sentence [R16]; 03 §1.1 cross-ref; 06 Phase 1 includes the family in contract scope. |
| R17 | `session prompt` = PTY delivery mechanism, named v1 requirement | AC | 04 §6 (dedicated section: subscribe-and-inject, mark delivery, "single most dangerous silent-failure seam… named v1 requirement, not an option"); 04 §1.3 mapping row; 06 Phase 1 ("R17 prompt delivery"). |
| R18 | Adapter = worker+coordinator core loop; frozen v1 list; grep re-run before final freeze | AC | 04 §1.3 (corrected ~54-endpoint scope; frozen list matches the review's plus `task children/tree` — which the review's own surface enumeration includes — and `modal`, which implements R29's "adapter must carry modal"; the R18-vs-R29 tension inside the review is resolved in R29's favor, correctly, with `modal-show` still migrating natively); 06 §4 Q4 carries the grep re-run — GO-condition 3 discharged. Note the dilution residue in 05 T-D15 (§2 fix F3, recommended). |
| R19 | Skills/spells feed the manifest from the graph (`equips` edges); spell engine homed | AC | 04 §1.2 closing para [R19] (in-transaction rendering replaces filesystem scope-loading; engine → server block, WorkspaceEvent-driven); 06 homes (R24 entry). Minor: the review's side-instruction "verify the UI session card needs nothing timeline-shaped" is not carried anywhere — impl-plan-grade, listed in §3. |
| R20 | Status chattiness: debounce idle-flapping before the graph; throttling re-keyed | AC | 04 §1.2 "Status chattiness [R20]" (review asked for the sentence in 04 §3; it landed in §1.2 — location differs, substance identical and arguably better-placed next to single-writer status; re-keying covered by the R28 row in §1.1). |
| R21 | v1 named honestly: one from-contract build + one transplant; M1–M3 milestones; conformance suite as deliverable | AC | 05 T-D14 ("Amended per R21/R27"); 06 Phase 1 (crib-gap list, M1 headless conformance suite "treated as a deliverable", M2 facade swap, M3 = 04 §7 parity). Minor: the review §9 in-flight note (relay `execution.*` to the UI coordinator only if the contract module gains it before W5, so `types/` is amended once) is not carried — listed in §3. |
| R22 | Push dispatcher homed: hub-side worker Phase 2+; local nodes in-app + OS-native | AC | 06 homes ("push dispatcher = hub-side worker, Phase 2+, transport deferred") + 05 T-D20 ("local nodes use in-app + OS-native desktop notifications"). Correctly adjusted for the R14 deferral. |
| R23 | Mobile assigned a phase + a sentence in 00 | AC | 00 Status line ("maestro-mobile joins the unification as a thin client of the contract (server-hosted PTY mode), Phase 3 [R23]"); 06 Phase 3 + homes. (Landed in 00's Status line rather than §3's table — substance present; nit only.) |
| R24 | Spell engine homed: server-block WorkspaceEvent-driven service; side tables operational | AC | 06 homes (verbatim intent incl. "without this, spells would silently mean inert documents"); 04 §1.2 cross-reference. |
| R25 | Workspace-scope query variant for Home-across-spaces + Inbox | AC | 06 homes (`spaceId:'*'` or `workspace.collections.query`). |
| R26 | One scheduler in the server block (reminders, spell schedules, retention jobs) | AC | 06 homes (all three job families named incl. command-ledger TTL, event pruning, soft-delete purge). |
| R27 | Spawn/manifest reclassified as bounded re-authoring with behavioral parity; in-process manifest; model-power → data; ~1.5–2k LOC planned as build | AC | 04 title/intro + §1.2 (full audit facts carried: 850-LOC route, seven entity types, subprocess + `flush()` hack, verbatim duplication; SpawnService target shape; "planned as a build, not budgeted as a lift"); 05 T-D14; 06 Phase 1. GO-condition 1's core correction is discharged. |
| R28 | WS-bridge policy re-map named and budgeted in 04 §1.1 | AC | 04 §1.1 WS-bridge row ("Budgeted delta [R28]": ~40%/~150–190 LOC policy, ~200 LOC rewrite, spawn/modal-immediacy load-bearing); 06 Phase 1. |
| R29 | Single-writer `work_session.status`; `session:spawn` payload preserved verbatim; modal + docs homes carried by the adapter | AC | 04 §1.2 (single-writer funnel + payload contract); 03 §1.1 (single-writer note); 03 §4 `session_modals` (side table + immediate-class event + "compat adapter must carry the `modal` verbs"); docs home pre-existing in 03 §3. |

**Score: 26 × APPLIED-CORRECTLY, 2 × APPLIED-INCORRECTLY (R1, R3 — correct at their primary targets, each with one contradicting residue), 1 × N/A (R14, deferral recorded correctly, nothing commits to a transport).** No R is MISSING.

## 2. Contradictions / broken references found

### Blocking (the two FAIL causes — one line each)

- **F1 — 05-DECISIONS T-D6 contradicts R1.** T-D6 still reads *"Owns identity/routing store only — never graph data (T-L8)."* Post-R1, the identity/account store lives in the server block in every composition and T-L8 explicitly forbids "a gateway-owned account database" — a reader of the decision log alone reconstructs the pre-review architecture. **Fix:** reword to *"Owns routing + relay + hosted-workspace spawner + the remote-facing auth surface (fronting the server's identity block) — never graph data, never the primary account store [R1] (T-L8)."*
- **F2 — 02 §2 bridge row contradicts R3 (and 02 §5 four sections later).** The bridge block's "Never does" column still reads *"any write other than appends/commands to a remote"* — the pre-R3 restriction. §5 of the same doc grants `create/patch` (full catalog) over the bridge; `entities.create/patch` are writes that are neither appends nor commands. **Fix:** reword to *"writes outside the operation catalog; any automated write-back from a pulled projection (T-L6b) [R3]"* (optionally add `create/patch` to the "Owns" column).

### Recommended (non-blocking editorial fixes)

- **F3 — 05 T-D15 dilutes R18.** "A thin worker-verb compat adapter (old `task report`/`session report` verbs as sugar…)" retains the understated framing R18 explicitly corrected ("the worker+coordinator core loop, not six report verbs"). T-D20 records R18 correctly, so the log self-corrects, but the row should say *"a compat adapter covering the worker+coordinator core loop (R18 frozen list, 04 §1.3)"*.
- **F4 — 02 §2 execution row cites "T-04 doc §4"** for the contract-only seam; the seam law is **04 §2** (04 §4 is the operational-lessons list). Change to "04 §2".
- **F5 — 04 §1.3 cites "§6" for `execution.spawn`**; the family is defined in **§5** (§6 is prompt delivery). Change to "§5".
- **F6 — "06 §5-homes" labeling.** 04 §1.2 and 06's Status line refer to "06 §5-homes", but the homes block is an unnumbered preamble and 06's actual §5 is the review charter. Either number the homes block or change references to "06 homes (preamble)". Also: 05's Status line still says "Draft for architecture review" though T-D3/T-D14/T-D20 were amended — update it to match the other docs' amended-status convention.

### Cross-reference sweep (04 renumbering) — otherwise clean

All other references checked and valid: 06 Phase 1 and M3 correctly point at **04 §7** (new acceptance number); 03 §1.1 correctly points at **04 §6** (prompt delivery); 06 §5 charter's "04 §2" (seam law) remains correct; 03's "(review §4)"/"(review §12)" and 06 §4's "review §10" point at the right 07 sections; nothing still uses old "04 §5 = acceptance" semantics.

## 3. GO-conditions (07 §13) — discharge check

1. **Adjudicate R1–R3, R7, R14, R16–R18, R27** → discharged: T-D20 records the adjudication (R14 deferred is a valid adjudication) and all are folded into doc text (R1/R3 modulo F1/F2 above).
2. **Fold R4–R6, R9, R13, R15, R19–R26, R28–R29 into the implementation plan as requirements** → discharged ahead of schedule: all are folded into the doc text itself (02/03/04) and 06 carries the plan-facing ones (Phase scopes, §4 resolutions, homes preamble). Two review side-notes are not carried anywhere and should ride into the implementation plan: *(a)* verify the UI session card needs nothing timeline-shaped beyond anchored messages/activity (R19 tail); *(b)* relay the `execution.*` contract addition to the UI coordinator only if the contract module gains it before W5 finishes, so `types/` is amended once by its owner (review §9 tail). Neither is doc-text-blocking.
3. **Re-run the Q4 prompt-corpus grep before freezing the adapter list** → carried explicitly: 04 §1.3 ("Frozen v1 list (pending the prompt-corpus grep)") and 06 §4 Q4.

## 4. Final verdict

**FAIL — do not stamp FINAL yet.** The amendment quality is high: every accepted R is present, none is semantically diluted at its primary target, the R14 deferral is recorded consistently with no accidental transport commitment, and the 04 renumbering broke nothing. But the sweep missed two consequential edits (F1 in the decision log, F2 in 02's block-responsibility table), each of which reintroduces exactly the pre-review architecture the adjudicated changes removed — a FINAL stamp over either would leave the set self-contradictory on its two headline law changes (R1, R3).

**Path to FINAL:** apply F1 and F2 (two one-line edits; F3–F6 recommended in the same pass), then stamp. Re-verification can be a spot-check of the edited lines; no further full pass is required.

---

## Resolution addendum (2026-07-25, design session sess_1784931993141_0y6d4fs4v)

The FAIL verdict above was **narrow and is now resolved**; this addendum is the closing record so the doc no longer contradicts the set's FINAL stamp:

1. **F1, F2 (blocking)** — applied same-day: T-D6 reworded to the R1 gateway scope (routing + relay + spawner + remote-facing auth, never the primary account store); the 02 §2 bridge row's "never does" now reads "writes outside the operation catalog; any automated write-back from a pulled projection (T-L6b)". Spot-check per this doc's own guidance ("no second full pass") completed.
2. **F3–F6 (nits)** — applied: T-D15 points at the R18 frozen list; 04 §2 / execution.spawn §5 cross-references corrected; 06 homes promoted to a proper heading; 05 status updated.
3. **Post-FINAL in-place rewrites** — per AM-1/T-D21 (no Tauri) the overlay amendments flagged as P0-5 by the tm8 implementation review were replaced with in-place rewrites across 04 (lift table, R29 wire-contract wording, §4 lesson), 06 (Phase-1 scope, repo shape), and 09 (definition of done, scaffold, M2/M3, wave table). No normative Tauri requirement remains anywhere in docs 00–09.

**Closing verdict: PASS — the FINAL stamp on docs 00–06 (and the amended 09) stands.** Subsequent amendments are tracked as decision-log rows (T-D21, T-D22) with in-place rewrites, never overlay notes.
