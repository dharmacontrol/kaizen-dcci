# Design: Advanced Suggestion Submission Flow

Date: 2026-11-17
Status: Approved by product owner (verbal, this conversation) — pending plan

## Intent & Why

This is the core, production app for DCCI's kaizen-style suggestion system
(employees submit improvement ideas, section heads/admins review and score
them, points feed a leaderboard). The submission flow — the page where an
employee actually writes and sends an idea — is the entry point for the
whole system, and it currently has real gaps that block or discourage use:

- The "Simpan Draft" and "Batal" buttons on the create form do nothing
  (`app/(dashboard)/dashboard/suggestions/create/page.tsx:287-299`) — no
  `onClick` handler at all.
- When a reviewer sets a suggestion's status to `"Revision"` via
  `PATCH /api/suggestions/[id]`, there is no page for the author to edit
  and resubmit it. The suggestion is stuck.
- The monthly cap of 5 submissions (`app/api/suggestions/route.ts:96-104`)
  is only discovered after a user fills out the entire form and submits.
- Images are a single before/after pair with no client-side size/type
  enforcement (the API never checks `beforeImage.size` or type at all).
- There is no way to see, before submitting, whether a very similar idea
  already exists.
- `problem`/`solution` are free-text with no structure or minimum length,
  so low-effort one-liners are as easy to submit as thorough write-ups.

Owner's framing: the goal is to fix the submission flow specifically
(feature, interface, experience) — not the review/scoring side, which is
out of scope here.

## Goals

1. Close the process dead-end: an author can always get a `Revision`
   suggestion back to `Pending` by editing and resubmitting it, with the
   old version preserved for the reviewer to compare against.
2. Let an author save an idea in progress and come back to it later
   without losing work, without that in-progress idea counting against
   their monthly quota.
3. Surface the monthly quota and any likely-duplicate ideas *before* the
   user has invested time writing, not as a rejection at the end.
4. Make the form itself easier to complete on a phone, on a factory
   floor, possibly one-handed or by voice: shorter steps, bigger touch
   targets, optional dictation.
5. Raise the baseline quality of what gets submitted (more complete
   problem/solution write-ups, supporting photos, smaller uploads) without
   making submission slower for someone who already knows what they want
   to say.

## Non-Goals

- Changing anything about how suggestions are reviewed, scored, or how
  points/leaderboard work (`app/api/suggestions/[id]/route.ts` PATCH logic,
  `approvals` page, `PointLog`, leaderboard) — that's the review side, out
  of scope.
- AI-assisted title/category generation or AI writing help (deferred by
  the product owner — "nanti dulu").
- Real-time (WebSocket/SSE) status push. The existing 3-second polling on
  the detail page is untouched.
- Team/multi-author submissions, anonymous submissions — not requested,
  not building them now.
- Changing where images are stored (still local `public/uploads`, not a
  CDN/object store migration) — out of scope for this pass.

## Anti-Goals

- A redesign that makes the *common* case (someone who already knows
  exactly what they want to submit) slower than it is today. Every new
  step/prompt must be skippable or fast for a confident user.
- A duplicate-detection or validation feature that *blocks* submission.
  Both are advisory — they inform, they never prevent a legitimate idea
  from going in.

## Constraints

- No new paid dependencies, no API keys. (Project has no LLM key wired up
  for app code — that's graphify-only — and AI assistance is explicitly
  deferred here anyway.) Duplicate detection and voice input must use
  what's already free: plain JS/text comparison, and the browser's native
  `SpeechRecognition` API.
- Must keep working with the existing Mongoose models and NextAuth
  session shape (`session.user.role`, `session.user.id`) already used
  throughout `app/api/suggestions/*`.
- Must not break the existing reviewer-side read of a `Suggestion`
  document (`app/api/suggestions/[id]/route.ts` GET, the approvals page) —
  additive schema changes only, no renames/removals of existing fields.
- Mobile-first: current users submit from phones on a shop floor
  (evidenced by `capture="environment"` already on the file inputs).

## Approaches Considered

### A. Duplicate detection method
- **Embedding/semantic similarity (LLM-based).** Most accurate at
  catching paraphrased duplicates, but needs an API key, has per-call
  cost and latency, and AI help is explicitly deferred right now.
  Rejected for this pass.
- **Fuzzy string distance (e.g. Levenshtein) on full text.** Catches
  near-identical text well but is expensive to run across many records
  and bad at reordered/paraphrased sentences.
- **Word-overlap / Jaccard similarity on title + problem text,
  scoped to the same department over a recent window (picked).** Pure
  JS, no dependency, O(n) over a small, pre-filtered candidate set (same
  department, last 6 months). Not perfect at paraphrase detection, but
  this is explicitly an advisory signal ("3 similar ideas exist, continue
  anyway?") not a hard gate, so recall matters more than precision here.

### B. How drafts save
- **Autosave on every keystroke (debounced).** Always up to date, but
  means a network write every few seconds while someone is mid-sentence —
  unnecessary DB load and more failure surface on bad factory wifi.
- **Manual save only.** Simple, but a crashed tab/browser loses everything
  since the last manual save.
- **Manual "Simpan Draft" (wired to a real save) + `localStorage` mirror
  on every change (picked).** The manual save is the source of truth in
  the DB; the `localStorage` copy is pure crash insurance, read back only
  if a newer local draft is found than what's on the server for that
  suggestion ID. No extra network traffic over today without a draft
  button at all, still protects against tab crashes.

### C. Form structure
- **Keep the single long page, just add small fixes.** Lowest effort, but
  doesn't address the "feels heavy on a phone" problem at all.
- **Multi-step wizard (picked).** Same fields, same API payload shape,
  broken into 5 client-side steps (Info → Problem/Solution → Cost Impact →
  Photos → Review) with per-step validation and a progress indicator. No
  new backend endpoint — it still posts the same `FormData` to
  `POST /api/suggestions` at the end. Lowest-risk way to make the phone
  experience better without touching the API contract.

## Decided (owner's calls + mine, as agreed in conversation)

1. **Revision → edit → resubmit.** New page
   `app/(dashboard)/dashboard/suggestions/[id]/edit/page.tsx`, mirroring
   the pattern of `news/[id]/edit/page.tsx`. Accessible only when
   `suggestion.status === "Revision"` and `session.user.id === suggestion.author`.
   This route handles **only** the Revision case — draft resumption is a
   separate route (see #2a below), so there is no overlap/ambiguity in
   what this page's access guard checks.
   On resubmit: `PUT /api/suggestions/[id]` (new handler, separate from the
   reviewer's `PATCH`) pushes the current `{title, problem, solution,
   category, costEffective, images}` onto a new `revisionHistory` array
   field on `Suggestion` **only when the document's status before this
   PUT was `"Revision"`**, applies the edited values, and sets
   `status = "Pending"`. Reviewer's detail view should be able to show
   `revisionHistory` (expandable "see previous version") — that's a small
   additive change to the detail page, in scope since it's necessary to
   make the resubmit flow legible, but the review/scoring logic itself is
   untouched.

2. **Drafts.**
   - Add `"Draft"` to `Suggestion.status` enum (currently `Pending |
     Approved | Rejected | Revision`).
   - Relax Mongoose `required` on `problem`/`solution`/`category`/`department`
     so a draft can be saved with only a title, or even nothing — the
     "required for real submission" rule is enforced in the wizard's final
     "Review & Submit" step and in the API, not at the schema level.
   - **Drafts do not count against the 5/month quota.** See #3 below for
     exactly how the quota query is kept correct across month boundaries.
   - A draft is owned by its author only; it does not generate reviewer
     notifications (only a real `Pending` submission does, same as today).
   - "My Suggestions" list (`suggestions/page.tsx`) should show drafts in
     their own filter/tab so they're easy to find and resume. Note while
     building this: that page's current status filter options ("In
     Process"/"Completed") don't match the model's real enum at all
     (`Pending/Approved/Rejected/Revision`) — a pre-existing bug, unrelated
     to this feature, but since we're already touching that page's filter
     UI to add a Drafts tab, fix the options to match the real statuses in
     the same change.

2a. **Resuming a draft.** Handled by the **create page itself**
    (`suggestions/create/page.tsx`), not the edit page from #1 — a draft
    is still "being created," conceptually. The create page accepts an
    optional `?draftId=<id>` query param:
    - **First "Simpan Draft" click** (no `draftId` yet):
      `POST /api/suggestions` with `status: "Draft"` in the form data.
      The response's `_id` is stored in component state and reflected into
      the URL (`router.replace`) as `?draftId=...`, so a page refresh
      doesn't orphan the in-progress draft.
    - **Later "Simpan Draft" clicks** (draftId already known):
      `PUT /api/suggestions/[id]` with the current fields and
      `status: "Draft"` — a plain update, no `revisionHistory` push (per
      #1's status-before-PUT condition — Draft isn't Revision).
    - **Final "Ajukan Suggestion" click:** if a `draftId` exists, `PUT
      /api/suggestions/[id]` with `status: "Pending"` (finalize); if not
      (user never saved a draft), `POST /api/suggestions` directly with
      `status: "Pending"` — identical to today's flow, unchanged.
    - The GET used to load a draft for resuming must reject the request
      (403) if the requester isn't the draft's author — the existing
      `GET /api/suggestions/[id]` currently has no author check at all for
      any status; add one specifically for `status === "Draft"`.
    - Net effect: `PUT /api/suggestions/[id]` ends up handling three
      transitions (Draft→Draft, Draft→Pending, Revision→Pending), told
      apart by the document's current status read at the top of the
      handler before any field is changed.

3. **Quota visibility, and fixing a cross-month-boundary bug drafts would
   otherwise introduce.** Today's quota query filters by `createdAt`
   within the current calendar month. Once drafts exist, a draft created
   in October and finalized to `Pending` in November would keep its
   October `createdAt` — invisible to both October's (already closed) and
   November's quota count, letting it escape the cap entirely.
   Fix: add a `submittedAt: Date` field to `Suggestion`, set exactly once,
   the moment a document first becomes `"Pending"` (direct submit, or
   draft finalize). **Revision resubmission does not touch
   `submittedAt`** — resubmitting an already-once-submitted idea isn't a
   new submission for quota purposes, it's the same one coming back
   around. The quota query switches from `createdAt` to `submittedAt`,
   falling back to `createdAt` for any pre-existing document that has no
   `submittedAt` (no backfill/migration needed — additive field, old docs
   just use the fallback). Query counts documents with `status !=
   "Draft"` in the current period, same as the existing logic otherwise.
   Exposed as a small `GET /api/suggestions/quota` (or folded into an
   endpoint the create page already calls) returning
   `{ used, max: 5, period }`. Shown as a banner at the top of the
   create/wizard page, before any field is filled in.

4. **Multi-step wizard.** Implemented client-side only in the existing
   create page component (and reused by the new edit page). Steps:
   1. Info Dasar (title, category, department — pre-filled from the
      user's own department as a default, still editable)
   2. Problem & Solution (see #7 below)
   3. Dampak Biaya (cost explanation + nominal, unchanged fields)
   4. Foto (before/after + up to 3 supporting photos)
   5. Review (read-only summary of everything above, this is where the
      duplicate-check warning and final "Ajukan" button live)
   Each step validates its own required fields before "Next" is enabled;
   users can go back freely. No new API calls per step except the
   duplicate check (debounced, fired when leaving step 2).

5. **Photos.** `Suggestion.images` gains an `additional: string[]` field
   (max 3, enforced client- and server-side) alongside the existing
   `before`/`after` strings — additive, no migration needed for existing
   documents (`additional` just doesn't exist on old docs, treated as
   empty array). Client-side compression: resize to a max dimension (e.g.
   1600px) and re-encode via `<canvas>` + `toBlob("image/jpeg", 0.8)`
   before upload — no new dependency. Server-side: reject any uploaded
   file over 5MB *after* compression, and reject non-image MIME types,
   in `POST /api/suggestions` and the new `PUT` handler (today it checks
   neither).

6. **Duplicate detection.** New small helper (e.g.
   `lib/suggestionSimilarity.ts`) exposing a function that takes a
   candidate `{title, problem}` and a department ID, queries
   `Suggestion.find({ department, createdAt: { $gte: sixMonthsAgo } })`
   with a lean projection, tokenizes title+problem into a word set
   (lowercased, stopwords stripped), computes Jaccard similarity against
   each candidate, and returns the top 3 matches above a 0.4 threshold.
   Called from the wizard's step 2→3 transition (debounced) and again at
   step 5, surfaced as a dismissible, non-blocking warning card with links
   to the similar suggestions.

7. **Guided problem/solution.** No schema change. The two textareas get:
   structured helper placeholder/label text (what happened, when, who's
   affected / what you propose, expected effect), and a client-side
   minimum length (e.g. 50 characters) before the wizard will advance past
   step 2 — this is UX guidance, not a hard schema constraint, so the
   `Suggestion` model stays exactly as permissive as it is today for
   drafts.

8. **Preview/Review step.** Step 5 of the wizard (see #4) — this *is* the
   preview, not a separate feature; it renders the same read-only layout
   style used on the suggestion detail page so what the author sees
   before submitting matches what they'll see after.

9. **Voice-to-text.** A small reusable mic-button component wrapping the
   browser's `window.SpeechRecognition` / `window.webkitSpeechRecognition`,
   attached to the problem/solution textareas in step 2. Feature-detects
   support and simply doesn't render the mic button when unavailable
   (notably: iOS Safari). Pure client-side, appends recognized text to
   the textarea's current value rather than replacing it.

## What's Left to the Builder

- Exact Tailwind/visual styling of the new wizard step indicator and the
  duplicate-warning card — follow the existing design language already in
  `suggestions/create/page.tsx` (rounded-3xl cards, primary color, lucide
  icons); no new design system needed.
- Exact wording of the guided placeholder text for problem/solution
  (Indonesian, matching the app's existing tone).
- Whether the quota endpoint is its own route or folded into an existing
  one — pick whichever is less code; behavior (`{used, max, period}`) is
  what matters.
- Unit/integration test coverage for the new similarity function and the
  quota-excludes-drafts logic — follow whatever testing approach (or
  absence of one) already exists elsewhere in this codebase.
- Migration: none required. All schema changes are additive
  (`revisionHistory`, `images.additional`, `"Draft"` status value) and
  existing documents remain valid without a backfill script.
