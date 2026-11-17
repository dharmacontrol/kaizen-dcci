# Advanced Suggestion Submission Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the suggestion (idea) submission flow into a mobile-friendly, multi-step wizard with real drafts, a revision/resubmit path, upfront quota and duplicate-idea visibility, multi-photo support with client-side compression, guided write-ups, and optional voice input — without touching the review/scoring side of the app.

**Architecture:** The submission flow becomes a single shared step-based wizard component (`components/suggestions/SuggestionWizard.tsx`) consumed by both the create page and a new revision-edit page. The backend gains a `PUT` handler on the existing `suggestions/[id]` route that serves draft-save, draft-finalize, and revision-resubmit as one state machine keyed off the document's *current* status, plus two small new read-only endpoints (`quota`, `similar`) that the wizard calls purely for advisory UI — neither ever blocks submission.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Mongoose 9, NextAuth 4, Tailwind v4, `lucide-react` icons already in use, browser `Canvas`/`SpeechRecognition` APIs. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-17-suggestion-submission-flow-design.md`

## Global Constraints

- No new npm dependencies and no API keys — duplicate detection is plain JS text comparison; voice input uses the browser's native `SpeechRecognition`.
- All `Suggestion` schema changes are additive only — no renaming or removing existing fields (`models/Suggestion.ts`).
- Must keep using the existing NextAuth session shape (`session.user.id`, `session.user.role`) exactly as used today in `app/api/suggestions/*`.
- Quota and duplicate-idea checks are advisory only — they inform the user, they never prevent a legitimate submission.
- Mobile-first: the existing `capture="environment"` camera behavior on file inputs must keep working; new UI must be usable one-handed on a phone.
- Must look and work correctly at both desktop and mobile widths — every new/changed screen (wizard steps, progress indicator, quota banner, duplicate-warning card, edit page, list page) is checked at a narrow phone width (~375px) and a desktop width (~1280px+), not just one.
- No real-time push — the existing 3-second polling on the suggestion detail page is untouched.
- Visual design stays inside the app's existing language (rounded-3xl cards, primary blue, `lucide-react` icons) — no new palette or typeface. The one new animation is the step-to-step transition; icons per step are chosen for meaning (see Task 7), not decoration.

## Testing Approach

This codebase has no test runner configured anywhere (checked: no jest/vitest/playwright config, no `test` script in `package.json`). Introducing one is out of scope for this plan (the design doc defers to "whatever testing approach... already exists," and none does). Verification steps below therefore use the project's own `npx tsc --noEmit` for type-level correctness (already a devDependency, zero new tooling) plus explicit manual steps (`npm run dev` + browser/`curl`) for behavior, in place of automated test code. Each task's steps are still concrete and independently checkable.

## Review Focus

1. **Resuming a Draft with missing required fields must not crash the wizard or let an incomplete document silently become `Pending`.** A draft can legally have only a title.
2. **Double-clicking "Simpan Draft" before the first save round-trip completes must not create two separate Draft documents.** The button must be disabled / the second click ignored while a save is in flight.
3. **A non-image file (renamed extension or wrong MIME) uploaded to any photo slot must be rejected server-side**, even if someone calls the API directly and skips the client-side check.
4. **Revision resubmission must snapshot every edited field into `revisionHistory` — including `department` and `category`, not only the text fields** — otherwise a reviewer comparing versions misses a changed department/category.
5. **A user who is not a Draft's author must get `403` reading it by ID**, so a guessed or shared `?draftId=` link can't expose someone else's in-progress idea.

---

## File Structure

**New files:**
- `lib/suggestionSimilarity.ts` — pure tokenize/Jaccard-similarity helpers + a DB-querying finder function.
- `lib/compressImage.ts` — client-side image resize/re-encode via `<canvas>`.
- `app/api/suggestions/quota/route.ts` — `GET`, returns `{ used, max, period }`.
- `app/api/suggestions/similar/route.ts` — `POST`, returns top similar suggestions.
- `components/suggestions/SuggestionWizard.tsx` — the 5-step wizard: state, navigation, progress indicator.
- `components/suggestions/VoiceInputButton.tsx` — reusable mic button for a textarea.
- `app/(dashboard)/dashboard/suggestions/[id]/edit/page.tsx` — Revision edit/resubmit page.

**Modified files:**
- `models/Suggestion.ts` — schema additions.
- `app/api/suggestions/route.ts` — `POST` changes (status field, additional images, server validation, `submittedAt`).
- `app/api/suggestions/[id]/route.ts` — new `PUT`; `GET` gets an author-check for Drafts.
- `app/(dashboard)/dashboard/suggestions/create/page.tsx` — becomes a thin wrapper around `SuggestionWizard`.
- `app/(dashboard)/dashboard/suggestions/[id]/page.tsx` — adds a `revisionHistory` display section.
- `app/(dashboard)/dashboard/suggestions/page.tsx` — fixes the status filter mismatch, adds a Drafts tab.

---

### Task 1: Suggestion model schema changes

**Files:**
- Modify: `models/Suggestion.ts`

**Interfaces:**
- Produces: `ISuggestion` gains `status: "Draft" | "Pending" | "Approved" | "Rejected" | "Revision"`, `submittedAt?: Date`, `images.additional?: string[]`, `revisionHistory?: { title: string; problem: string; solution: string; category: string; department: mongoose.Types.ObjectId; costEffective?: { explanation?: string; nominal?: number }; images: { before?: string; after?: string; additional?: string[] }; editedAt: Date }[]`. `problem`, `solution`, `category`, `department` are no longer `required: true` at the schema level.

- [ ] **Step 1: Edit `ISuggestion` interface and `SuggestionSchema`** in `models/Suggestion.ts`:
  - Add `"Draft"` to the `status` enum (keep `"Pending"` as the schema default — unchanged).
  - Remove `required: true` from `problem`, `solution`, `category`, `department` (leave everything else about those fields as-is).
  - Add `submittedAt: { type: Date }` (no default).
  - Add `additional: [{ type: String }]` inside the existing `images` sub-schema, alongside `before`/`after`.
  - Add a `revisionHistory` array field matching the interface shape above, each sub-field optional except `editedAt` (`{ type: Date, default: Date.now }`).

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors referencing `models/Suggestion.ts`.

- [ ] **Step 3: Manual check — a document missing problem/solution/category/department can still be created**

Run a short throwaway Node script (delete after) that imports the compiled model via the app's existing `connectToDatabase()` and does `Suggestion.create({ title: "test draft", author: <any existing user _id>, status: "Draft" })`, then logs the created `_id` and deletes it again. Confirm it does not throw a validation error.

- [ ] **Step 4: Commit**

```bash
git add models/Suggestion.ts
git commit -m "feat: add Draft status, revisionHistory, additional images, submittedAt to Suggestion"
```

---

### Task 2: Quota endpoint using `submittedAt`

**Files:**
- Create: `app/api/suggestions/quota/route.ts`

**Interfaces:**
- Consumes: `Suggestion` model (Task 1), `getServerSession(authOptions)`, `connectToDatabase()` — same imports as `app/api/suggestions/route.ts`.
- Produces: `GET` handler returning JSON `{ used: number, max: 5, period: string }` (period formatted `"YYYY-MM"`, same format already used in `PointLog.period`).

- [ ] **Step 1: Implement `GET` in `app/api/suggestions/quota/route.ts`**

Require a session (401 if none, same pattern as `app/api/suggestions/route.ts:15-20`). Compute `startOfMonth`/`endOfMonth` exactly as in `app/api/suggestions/route.ts:93-94`. Count documents matching:
```js
Suggestion.countDocuments({
  author: session.user.id,
  status: { $ne: "Draft" },
  $or: [
    { submittedAt: { $gte: startOfMonth, $lte: endOfMonth } },
    { submittedAt: { $exists: false }, createdAt: { $gte: startOfMonth, $lte: endOfMonth } },
  ],
})
```
Return `{ used: count, max: 5, period }`.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual check**

`npm run dev`, log in as a user with at least one existing `Pending`/`Approved` suggestion this month, `curl` (with the session cookie, or via browser devtools fetch) `GET /api/suggestions/quota`. Confirm `used` matches the real count and `max` is `5`.

- [ ] **Step 4: Commit**

```bash
git add app/api/suggestions/quota/route.ts
git commit -m "feat: add suggestion quota endpoint"
```

---

### Task 3: `POST /api/suggestions` — status field, additional images, server-side validation, `submittedAt`

**Files:**
- Modify: `app/api/suggestions/route.ts`

**Interfaces:**
- Consumes: `ISuggestion` shape from Task 1.
- Produces: `POST` now accepts an optional `status` form field (`"Draft"` or `"Pending"`, defaults to `"Pending"` if absent — preserves today's direct-submit behavior exactly), an optional `additionalImages` (0-3 files) form field, and skips quota-check/points/notification/`PointLog` entirely when `status === "Draft"`.

- [ ] **Step 1: Read `status` from form data**, defaulting to `"Pending"` when absent or not one of `"Draft"`/`"Pending"` (reject anything else with 400).

- [ ] **Step 2: Branch required-field validation on `status`.** When `status === "Pending"`, keep the existing check at line 60 (`title`/`problem`/`solution`/`category`/`departmentId` all required, 400 if missing). When `status === "Draft"`, only `title` is required (400 if missing).

- [ ] **Step 3: Add server-side image validation** for `beforeImage`, `afterImage`, and each file under `additionalImages` (max 3 — 400 if more than 3 provided): reject (400) if `file.size > 5 * 1024 * 1024` or `!file.type.startsWith("image/")`.

- [ ] **Step 4: Save up to 3 `additionalImages` files** the same way `beforeImage`/`afterImage` are saved (same `uploadDir`, same timestamped-filename pattern), collecting their resulting paths into `images.additional`.

- [ ] **Step 5: Gate the quota check, points, notifications, and `PointLog` creation (existing lines 96-165) behind `status === "Pending"`.** When `status === "Draft"`: skip all of that, create the `Suggestion` with `status: "Draft"`, `pointsAwarded: 0`, no `submittedAt`, and return it with `201` immediately — no notifications, no points.

- [ ] **Step 6: When `status === "Pending"`,** keep all existing behavior (quota check, 5 points, `PointLog`, manager notifications) and additionally set `submittedAt: new Date()` on the created document.

- [ ] **Step 7: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Manual check — Draft path**

`npm run dev`. `curl -X POST /api/suggestions` (authenticated) with only `title` and `status=Draft` in the form data. Expect `201`, response `status: "Draft"`, `pointsAwarded: 0`. Confirm no `PointLog` document was created (check via the app's existing admin view or a quick DB query) and the author's `personalPoints` is unchanged.

- [ ] **Step 9: Manual check — rejected oversized/non-image file**

`curl -X POST /api/suggestions` with all required Pending fields and a `beforeImage` that is a >5MB file (or a `.txt` renamed `.jpg`). Expect `400`.

- [ ] **Step 10: Manual check — unchanged direct-submit path still works**

Submit a full Pending suggestion exactly as today's UI does (all required fields, valid images, no `status` field sent at all). Expect identical behavior to before this task: `201`, 5 points awarded, `PointLog` created, manager notified.

- [ ] **Step 11: Commit**

```bash
git add app/api/suggestions/route.ts
git commit -m "feat: support draft submissions and validate uploaded images server-side"
```

---

### Task 4: `PUT /api/suggestions/[id]` — draft save / draft finalize / revision resubmit; `GET` author-guard for Drafts

**Files:**
- Modify: `app/api/suggestions/[id]/route.ts`
- Create: `lib/suggestionUploads.ts`
- Modify: `app/api/suggestions/route.ts` (switch its inline image-save/validate logic from Task 3 over to the new shared helper)

**Interfaces:**
- Consumes: `ISuggestion` (Task 1).
- Produces: `PUT` handler that branches on the document's *current* (pre-update) `status`:
  - current `"Draft"`, requested `status: "Draft"` → plain field update, no `revisionHistory` push, no `submittedAt` change.
  - current `"Draft"`, requested `status: "Pending"` → finalize: update fields, set `submittedAt: new Date()`, run the same quota check as `POST` (reject `400` if already at 5 for the period), award the 5 participation points + `PointLog` + manager notifications (mirroring `POST`'s Pending-path side effects), no `revisionHistory` push.
  - current `"Revision"`, requested `status: "Pending"` → resubmit: push a snapshot of `{ title, problem, solution, category, department, costEffective, images, editedAt: now }` (the document's values *before* this update is applied) onto `revisionHistory`, then update fields, set `status: "Pending"`, leave `submittedAt` untouched (do not re-check quota, do not re-award participation points — this idea already counted once).
  - any other current status, or a requested `status` outside `{"Draft","Pending"}` → `400`.

- [ ] **Step 1: Add author-only guard to `GET`** (`app/api/suggestions/[id]/route.ts`, existing handler): after fetching the suggestion, if `suggestion.status === "Draft"` and `suggestion.author.toString() !== session.user.id`, return `403`.

- [ ] **Step 2: Implement `PUT`** in the same file. Parse the same `FormData` shape as `POST` (title/problem/solution/category/department/costEffective fields + optional image files), require a session (401 if none), fetch the existing `Suggestion` by `id` (404 if missing), verify `session.user.id === suggestion.author.toString()` (403 otherwise — a reviewer should not use this endpoint, that's still `PATCH`).

- [ ] **Step 3: Implement the four branches from the Produces block above**, reusing the image-save and image-validation logic introduced in Task 3 (extract that into a small shared helper, e.g. `lib/suggestionUploads.ts`, exporting `saveSuggestionImage(file): Promise<string>` and `validateSuggestionImage(file): string | null`, and update `POST` in `app/api/suggestions/route.ts` to call the shared helper instead of its inline copy).

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual check — Draft→Draft**

Create a Draft via Task 3's endpoint, then `PUT /api/suggestions/[id]` with updated `title` and `status: "Draft"`. Expect `200`, updated title, `status` still `"Draft"`, no `revisionHistory` entry added.

- [ ] **Step 6: Manual check — Draft→Pending finalize**

`PUT` the same draft with all required fields filled and `status: "Pending"`. Expect `200`, `status: "Pending"`, `submittedAt` set, a `PointLog` created, author's `personalPoints` incremented by 5, no `revisionHistory` entry.

- [ ] **Step 7: Manual check — Revision→Pending resubmit**

Using an existing `Pending` suggestion, `PATCH` it to `"Revision"` via the existing reviewer endpoint, then `PUT` it as the author with changed `problem` text and a different `department`. Expect `200`, `status: "Pending"`, `revisionHistory` has exactly one new entry whose `problem`/`department` match the *pre-edit* values (not the new ones), `submittedAt` unchanged from before, no new `PointLog` entry, `personalPoints` unchanged.

- [ ] **Step 8: Manual check — author guard**

As a *different* authenticated user, `GET` a `Draft` suggestion that isn't theirs. Expect `403`. `PUT` it. Expect `403`.

- [ ] **Step 9: Commit**

```bash
git add app/api/suggestions/[id]/route.ts app/api/suggestions/route.ts lib/suggestionUploads.ts
git commit -m "feat: add draft/revision PUT handler and author guard for suggestion drafts"
```

---

### Task 5: Duplicate-idea similarity helper + endpoint

**Files:**
- Create: `lib/suggestionSimilarity.ts`
- Create: `app/api/suggestions/similar/route.ts`

**Interfaces:**
- Produces (from `lib/suggestionSimilarity.ts`):
  - `tokenize(text: string): Set<string>` — lowercase, strip punctuation, split on whitespace, drop a small fixed Indonesian/English stopword list (e.g. `["yang","dan","di","ke","dari","untuk","the","a","an","and","to","of"]`).
  - `jaccardSimilarity(a: Set<string>, b: Set<string>): number` — `|intersection| / |union|`, `0` if both empty.
  - `findSimilarSuggestions(params: { title: string; problem: string; department: string; excludeId?: string }): Promise<{ _id: string; title: string; score: number }[]>` — queries `Suggestion.find({ department: params.department, createdAt: { $gte: <6 months ago> }, _id: { $ne: params.excludeId } }).select("title problem").lean()`, scores each by `jaccardSimilarity` of `tokenize(title+" "+problem)` against the candidate's own `title+" "+problem`, returns the top 3 with `score > 0.4`, sorted descending.
- Produces (from the route): `POST /api/suggestions/similar` body `{ title, problem, department, excludeId? }` (session required, 401 otherwise) → `{ matches: [{ _id, title, score }] }`.

- [ ] **Step 1: Implement `tokenize` and `jaccardSimilarity`** in `lib/suggestionSimilarity.ts`.

- [ ] **Step 2: Manual check — pure functions**

Temporarily add (then remove) a `console.log` call exercising `jaccardSimilarity(tokenize("Ganti lampu gudang ke LED"), tokenize("Lampu gudang diganti LED"))` and confirm the score is well above `0.4`, and `jaccardSimilarity(tokenize("Ganti lampu LED"), tokenize("Perbaikan AC kantor"))` is near `0`.

- [ ] **Step 3: Implement `findSimilarSuggestions`** in the same file.

- [ ] **Step 4: Implement the `POST` route** in `app/api/suggestions/similar/route.ts`, calling `findSimilarSuggestions`.

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual check — endpoint**

`npm run dev`, `curl -X POST /api/suggestions/similar` (authenticated) with a `title`/`problem` closely matching an existing suggestion's department/text. Expect `matches` to include it with a score `> 0.4`. Try an unrelated `title`/`problem` in the same department — expect an empty `matches` array.

- [ ] **Step 7: Commit**

```bash
git add lib/suggestionSimilarity.ts app/api/suggestions/similar/route.ts
git commit -m "feat: add duplicate-idea similarity detection endpoint"
```

---

### Task 6: Client-side image compression utility

**Files:**
- Create: `lib/compressImage.ts`

**Interfaces:**
- Produces: `compressImageFile(file: File, maxDimension?: number, quality?: number): Promise<File>` — defaults `maxDimension=1600`, `quality=0.8`. Draws the image onto an offscreen `<canvas>` scaled so its longer side is at most `maxDimension` (no upscaling if already smaller), re-encodes via `canvas.toBlob("image/jpeg", quality)`, resolves a new `File` with the same name (extension forced to `.jpg`) and `type: "image/jpeg"`. Rejects the promise if the input `file.type` doesn't start with `"image/"`.

- [ ] **Step 1: Implement `compressImageFile`** in `lib/compressImage.ts` using `createImageBitmap`/`Image` + `OffscreenCanvas` or a regular `<canvas>` element (browser-only — this module is only ever imported from client components).

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual check**

In a scratch client component (or the browser devtools console on any page once this is imported), call `compressImageFile` on a real photo (e.g. a >3MB phone photo) and confirm the resolved `File`'s `size` is meaningfully smaller and it still renders as a valid image via `URL.createObjectURL`.

- [ ] **Step 4: Commit**

```bash
git add lib/compressImage.ts
git commit -m "feat: add client-side image compression utility"
```

---

### Task 7: `SuggestionWizard` shell — steps 1 & 3, navigation, progress indicator, quota banner

**Files:**
- Create: `components/suggestions/SuggestionWizard.tsx`

**Interfaces:**
- Consumes: `GET /api/suggestions/quota` (Task 2).
- Produces: `SuggestionWizard` component, props:
  ```ts
  type SuggestionWizardProps = {
    mode: "create" | "revise";
    initialData?: Partial<SuggestionFormData>; // existing draft or revision being edited
    draftId?: string; // present when resuming/finalizing a draft
    departments: { _id: string; name: string }[];
    onSaveDraft: (data: SuggestionFormData) => Promise<{ _id: string }>;
    onSubmit: (data: SuggestionFormData) => Promise<void>;
  };
  type SuggestionFormData = {
    title: string; category: string; department: string;
    problem: string; solution: string;
    costEffectiveExplanation: string; costEffectiveNominal: string;
    beforeImage: File | null; afterImage: File | null; additionalImages: File[];
  };
  ```
  Internally owns `currentStep: 1-5` state and renders a progress indicator plus the active step's fields. Steps 2/4/5 render as empty placeholders in this task (filled in Tasks 8-10).

- [ ] **Step 1: Define `SuggestionFormData` and `SuggestionWizardProps`** at the top of the file (exported, so Tasks 8-13 can import them).

- [ ] **Step 2: Build the progress indicator** — 5 connected dots/icons: `ClipboardList` (Info Dasar), `Lightbulb` (Problem & Solution), `Wallet` (Dampak Biaya), `Camera` (Foto), `ClipboardCheck` (Review) from `lucide-react`. Current step's dot: filled primary background + a `ring-4 ring-primary/20 animate-pulse` ring (respect `prefers-reduced-motion` via a `motion-reduce:animate-none` Tailwind class). Completed steps (`step < currentStep`): swap their icon for a small `Check` mark. Upcoming steps: muted gray icon. Clicking a *completed* step's dot jumps back to it; clicking an upcoming one does nothing.

- [ ] **Step 3: Build step transition animation** — wrap the active step's content in a container keyed by `currentStep`; on step change, animate the outgoing content out and incoming content in via a short (~200ms) translate-x + opacity transition (CSS transition classes toggled with a `useEffect`/`useState` pair, no new dependency), guarded by `motion-reduce:transition-none`. This is the one orchestrated animation for the whole flow — no other hover/entrance effects are added anywhere else in the wizard.

- [ ] **Step 4: Build Step 1 (Info Dasar)** — same fields as today's `suggestions/create/page.tsx` title/category/department inputs, pre-filled from `initialData`. Default `department` to the field passed in `initialData` if present, else leave unselected (the session's own department default is wired in Task 12, at the page level, not here). Add inline validation state: on blur, an empty required field gets `border-red-300` + a small message below it; a filled one gets a `CheckCircle2` icon inside the input's right edge in `text-emerald-500`. "Next" is disabled until `title`, `category`, `department` are all non-empty.

- [ ] **Step 5: Build Step 3 (Dampak Biaya)** — same `costEffectiveExplanation`/`costEffectiveNominal` fields as today, no required validation (optional, unchanged from current behavior).

- [ ] **Step 6: Build the quota banner**, shown above Step 1 only: on mount, `GET /api/suggestions/quota`; render "Kamu sudah pakai {used}/{max} usulan bulan ini" in a blue-50/blue-700 info card (matching the existing `Info` banner style in `suggestions/create/page.tsx:105-113`); if `used >= max`, swap to an amber-50/amber-700 warning card saying the cap is reached — but still render the rest of the wizard (advisory only, never blocks).

- [ ] **Step 7: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Manual check**

Temporarily render `<SuggestionWizard mode="create" departments={[...]} onSaveDraft={async()=>({_id:"x"})} onSubmit={async()=>{}} />` from a scratch route, confirm: progress dots render with correct icons, clicking Next on Step 1 is blocked until all 3 fields are filled, filling them enables Next and advances with a visible transition, the quota banner shows real numbers from the endpoint. Check this at both a ~375px-wide viewport (browser devtools device toolbar, e.g. iPhone SE) and a ~1280px+ desktop width — the progress indicator must not overflow/wrap awkwardly at either, and step content must stay readable without horizontal scrolling at 375px.

- [ ] **Step 9: Commit**

```bash
git add components/suggestions/SuggestionWizard.tsx
git commit -m "feat: add SuggestionWizard shell with progress indicator and quota banner"
```

---

### Task 8: Wizard Step 2 — guided Problem/Solution + voice input

**Files:**
- Create: `components/suggestions/VoiceInputButton.tsx`
- Modify: `components/suggestions/SuggestionWizard.tsx`

**Interfaces:**
- Produces (`VoiceInputButton`): `<VoiceInputButton onResult={(text: string) => void} disabled?: boolean />` — feature-detects `window.SpeechRecognition ?? window.webkitSpeechRecognition`; renders nothing (`null`) if neither exists; otherwise renders a small mic icon button that starts/stops recognition (`lang: "id-ID"`) and calls `onResult` with the final transcript on each result.

- [ ] **Step 1: Implement `VoiceInputButton`** in its own file, as described above (toggle a `Mic`/`MicOff` lucide icon based on listening state).

- [ ] **Step 2: Build Step 2 (Problem & Solution) inside `SuggestionWizard`** — two textareas as today, each with structured helper text above it in Indonesian (problem: "Apa masalahnya? Kapan terjadi? Siapa/apa yang terdampak?"; solution: "Apa yang kamu usulkan? Apa dampaknya kalau dijalankan?"), each with a `VoiceInputButton` positioned at the textarea's corner that appends recognized text to the current value (not replacing it). "Next" is disabled until both fields are at least 50 characters, with a small live character counter ("23/50 karakter") shown under each while below the minimum.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual check**

In a Chromium-based browser, open the scratch wizard render from Task 7, go to Step 2, confirm: Next is disabled below 50 characters in either field and the counter updates live; clicking the mic button, speaking, and seeing text appended (manual — requires a mic-enabled machine); in a browser without `SpeechRecognition` (or by stubbing it undefined in devtools), confirm the mic button simply doesn't render and everything else still works.

- [ ] **Step 5: Commit**

```bash
git add components/suggestions/VoiceInputButton.tsx components/suggestions/SuggestionWizard.tsx
git commit -m "feat: add guided problem/solution step with voice input"
```

---

### Task 9: Wizard Step 4 — multi-photo with compression

**Files:**
- Modify: `components/suggestions/SuggestionWizard.tsx`

**Interfaces:**
- Consumes: `compressImageFile` (Task 6).

- [ ] **Step 1: Build Step 4 (Foto)** — the existing Before/After drag-and-drop tiles from today's `suggestions/create/page.tsx:240-280`, plus up to 3 "Foto Pendukung" (supporting photo) tiles that can be added one at a time (an "+ Tambah Foto" tile that appears while `additionalImages.length < 3`, each added photo shows a thumbnail with a small `X` remove button).

- [ ] **Step 2: Run every selected file through `compressImageFile` before storing it in state** (before/after/additional alike); show a brief inline "Mengompres..." state on that tile while the promise is pending. If compression rejects (non-image), show an inline error on that tile and don't store the file.

- [ ] **Step 3: Client-side size guard** — after compression, if a file is still over 5MB, show an inline error on that tile ("Masih terlalu besar setelah dikompres") and don't store it (matches the server-side 5MB check from Task 3, so a legitimate file never gets a surprise 400 at submit time).

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual check**

On the scratch wizard render, go to Step 4: add a before photo, confirm it compresses and shows a thumbnail; add 3 supporting photos, confirm the "+ Tambah Foto" tile disappears at 3; remove one, confirm it reappears; try adding a non-image file via the file picker (if the OS file dialog allows selecting one despite `accept="image/*"`), confirm the inline error appears and it isn't added to state. Check the photo tile grid at ~375px (tiles should stack to a usable size, not shrink to illegible thumbnails) and at ~1280px+ (tiles should not stretch awkwardly wide).

- [ ] **Step 6: Commit**

```bash
git add components/suggestions/SuggestionWizard.tsx
git commit -m "feat: add multi-photo support with client-side compression to wizard"
```

---

### Task 10: Wizard Step 5 — Review, duplicate-check, final submit

**Files:**
- Modify: `components/suggestions/SuggestionWizard.tsx`

**Interfaces:**
- Consumes: `POST /api/suggestions/similar` (Task 5).

- [ ] **Step 1: Build Step 5 (Review)** — a read-only summary of every field from Steps 1-4, visually matching the detail-page layout style (`suggestions/[id]/page.tsx`'s problem/solution/cost-effective card sections) so what's previewed matches what's shown after submission.

- [ ] **Step 2: Fire the duplicate check** when the user first reaches Step 5 (and again if they go back and change Step 1/2 fields and return): `POST /api/suggestions/similar` with `{ title, problem, department, excludeId: draftId }`. If `matches.length > 0`, render a dismissible amber-50/amber-700 card: "N ide serupa sudah pernah diajukan di departemen ini" listing each match's title as a link to `/dashboard/suggestions/{_id}` (opens in a new tab). Dismissing it doesn't block the submit button.

- [ ] **Step 3: Wire the final "Ajukan Suggestion" button** to call `props.onSubmit(formData)` (the page-level wrapper built in Tasks 12/13 decides whether that means `POST` or `PUT` — the wizard itself doesn't know draft/revision mechanics, it just calls the prop). Disable the button and show a loading state while the promise is pending; on rejection, show the returned error message (e.g. quota-reached) in place, without losing any entered data.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual check**

On the scratch wizard render, fill Steps 1-4 with data closely matching an existing suggestion in the same department, reach Step 5, confirm the duplicate warning appears with a working link; confirm the review summary accurately reflects every field entered; click submit with a stubbed `onSubmit` that rejects with `{ message: "quota" }` and confirm the error shows without clearing the form. Check the review summary and duplicate-warning card at ~375px (text must wrap, not overflow) and ~1280px+ (content should not stretch into an uncomfortably wide single column — cap its max width consistent with the rest of the dashboard's `max-w-4xl`/`max-w-7xl` containers).

- [ ] **Step 6: Commit**

```bash
git add components/suggestions/SuggestionWizard.tsx
git commit -m "feat: add review step with duplicate-idea warning and final submit"
```

---

### Task 11: Draft save wiring (manual save + localStorage mirror)

**Files:**
- Modify: `components/suggestions/SuggestionWizard.tsx`

**Interfaces:**
- Consumes: `props.onSaveDraft` (Task 7's prop, implemented at the page level in Task 12).

- [ ] **Step 1: Wire the "Simpan Draft" button** (visible on every step, matching today's footer layout): on click, disable the button, call `props.onSaveDraft(formData)`. The wizard holds the returned `_id` in its own state for the rest of the session (it does not need to know about URL query params — that's the page wrapper's job in Task 12) and re-enables the button only after the call resolves or rejects (prevents the double-click-creates-two-drafts failure mode from Review Focus #2). Show a brief "Tersimpan" confirmation (e.g. a toast or inline text next to the button) on success.

- [ ] **Step 2: Mirror every field change to `localStorage`**, keyed by `` `suggestion-draft-${draftId ?? "new"}` ``, debounced ~500ms, storing the full `SuggestionFormData` as JSON (omit `File` objects — store only their names, since `File` isn't JSON-serializable; the mirror is crash insurance for text fields, not photos).

- [ ] **Step 3: On mount, if a `localStorage` entry exists for the current `draftId` (or `"new"` when none) with a *newer* timestamp than `initialData`'s own `updatedAt`, show a dismissible prompt**: "Ada draft yang belum disimpan di perangkat ini, mau dipakai?" — accepting loads those field values into state (overwriting `initialData`); declining or dismissing clears that `localStorage` entry.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual check**

On the scratch wizard render with a real `onSaveDraft` wired to Task 12's implementation once available (or a stub that resolves after a delay): click "Simpan Draft" twice quickly, confirm only one request fires (button was disabled between clicks); type into Step 2's problem field, reload the page (simulated crash), confirm the "ada draft belum disimpan" prompt appears and restores the typed text.

- [ ] **Step 6: Commit**

```bash
git add components/suggestions/SuggestionWizard.tsx
git commit -m "feat: wire draft save with localStorage crash recovery"
```

---

### Task 12: Create page becomes a thin wrapper; draft resume via `?draftId=`

**Files:**
- Modify: `app/(dashboard)/dashboard/suggestions/create/page.tsx`

**Interfaces:**
- Consumes: `SuggestionWizard` (Tasks 7-11), `GET /api/suggestions/[id]` (Task 4's author-guarded version), `POST`/`PUT /api/suggestions`(`/[id]`) (Tasks 3-4).

- [ ] **Step 1: Read `draftId` from `useSearchParams()`.** If present, `GET /api/suggestions/{draftId}` on mount and pass the result as `SuggestionWizard`'s `initialData` + `draftId` prop (redirect to a plain `create` with no query param and show an error if the fetch 403s/404s — the draft isn't theirs or doesn't exist).

- [ ] **Step 2: Default `department`** (when not resuming a draft) from `session.user.department` if the session exposes it, else leave unselected — matches the design doc's "pre-filled from the user's own department as a default, still editable."

- [ ] **Step 3: Implement `onSaveDraft`**: if no `draftId` yet, `POST /api/suggestions` (`multipart/form-data`, `status=Draft`) and, on success, `router.replace` to add `?draftId={newId}` to the current URL without a full navigation; if `draftId` already set, `PUT /api/suggestions/{draftId}` with `status=Draft`. Both return `{ _id }` to the wizard as its contract requires.

- [ ] **Step 4: Implement `onSubmit`**: if `draftId` is set, `PUT /api/suggestions/{draftId}` with `status=Pending`; otherwise `POST /api/suggestions` with `status=Pending` directly (today's exact unchanged path for someone who never saved a draft). On success, `router.push("/dashboard/suggestions")`; on failure, throw so the wizard's Step 5 error handling (Task 10) can display it.

- [ ] **Step 5: Remove the old single-page form JSX**, replaced entirely by `<SuggestionWizard mode="create" .../>`.

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual check — full end-to-end create flow**

`npm run dev`, log in as an Employee. Go to `/dashboard/suggestions/create`: fill Step 1-2, click "Simpan Draft", confirm the URL gains `?draftId=...` and the suggestion appears in the DB with `status: "Draft"`. Reload the page at that exact URL, confirm all previously entered data loads back in. Finish Steps 3-5 and submit; confirm it ends up `Pending` with points/notification/quota all behaving as before this project. Separately, start a brand-new submission and go straight through to submit without ever clicking "Simpan Draft" — confirm it still works exactly as today (single `POST`, no draft ever created). Run this entire end-to-end pass once in a ~375px mobile viewport and once at ~1280px+ desktop width — both must be fully usable (buttons reachable without horizontal scroll, photo capture still works via `capture="environment"` on mobile). Separately, save a draft with *only* a title entered (leave Step 2 empty, never advance past Step 1) and reload `create?draftId=...` — confirm the wizard loads without crashing, lands on Step 1, and Step 2's 50-character gate still correctly blocks "Next" since problem/solution are empty.

- [ ] **Step 8: Commit**

```bash
git add "app/(dashboard)/dashboard/suggestions/create/page.tsx"
git commit -m "feat: rebuild create page as wizard wrapper with draft resume"
```

---

### Task 13: Revision edit page

**Files:**
- Create: `app/(dashboard)/dashboard/suggestions/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `SuggestionWizard` (Tasks 7-11), `GET`/`PUT /api/suggestions/[id]` (Task 4).

- [ ] **Step 1: On mount, `GET /api/suggestions/{id}`.** If `status !== "Revision"` or `session.user.id !== author._id`, redirect to `/dashboard/suggestions/{id}` (nothing to edit here). Otherwise pass the fetched data as `SuggestionWizard`'s `initialData`, with `mode="revise"`.

- [ ] **Step 2: Implement `onSaveDraft` as a no-op that resolves immediately** (an existing `Revision` suggestion is never re-saved as a Draft — "Simpan Draft" should be hidden entirely in `mode="revise"`; add a small `SuggestionWizard` prop check or `mode !== "revise"` guard around rendering that button, reusing Task 11's button).

- [ ] **Step 3: Implement `onSubmit`**: `PUT /api/suggestions/{id}` with `status: "Pending"` (the resubmit branch from Task 4). On success, `router.push("/dashboard/suggestions/{id}")`.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual check**

As a reviewer, `PATCH` an existing `Pending` suggestion to `"Revision"`. As its author, visit `/dashboard/suggestions/{id}/edit`: confirm the wizard loads pre-filled with the current data, "Simpan Draft" is not shown, editing the problem text and submitting results in `status: "Pending"` with a new `revisionHistory` entry holding the pre-edit text. As a *different* user, visiting the same `/edit` URL redirects away.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/dashboard/suggestions/[id]/edit/page.tsx"
git commit -m "feat: add revision edit and resubmit page"
```

---

### Task 14: Detail page — show revision history

**Files:**
- Modify: `app/(dashboard)/dashboard/suggestions/[id]/page.tsx`

**Interfaces:**
- Consumes: `suggestion.revisionHistory` (Task 1), already present on the `GET /api/suggestions/[id]` response (no API change needed — the field is already returned since the handler does `Suggestion.findById(id)` with no field exclusion).

- [ ] **Step 1: Add a "Riwayat Revisi" section** below the existing problem/solution cards (`app/(dashboard)/dashboard/suggestions/[id]/page.tsx`, after the `costEffective` block, before the `assessment` block), rendered only when `suggestion.revisionHistory?.length > 0`: one collapsed `<details>`-style entry per history item, each showing its `editedAt` date and its snapshotted `title`/`problem`/`solution`/`category`/`department` in the same red/emerald problem/solution card style already used above, so a reviewer can expand and compare against the current version shown elsewhere on the page.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual check**

Open the detail page for a suggestion that went through one resubmit cycle (from Task 13's manual check). Confirm the "Riwayat Revisi" section appears, shows the pre-edit text, and the main page body still shows the current (post-edit) text. Open a suggestion that's never been revised — confirm the section doesn't render at all.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/dashboard/suggestions/[id]/page.tsx"
git commit -m "feat: show revision history on suggestion detail page"
```

---

### Task 15: "My Suggestions" list — fix status filter, add Drafts tab

**Files:**
- Modify: `app/(dashboard)/dashboard/suggestions/page.tsx`

**Interfaces:**
- Consumes: `GET /api/suggestions` (unchanged — already returns the caller's own suggestions, drafts included, once Task 1/3 exist).

- [ ] **Step 1: Fix the status `<select>` options** (`app/(dashboard)/dashboard/suggestions/page.tsx:67-73`) to match the real enum: `All Statuses`, `Draft`, `Pending`, `Revision`, `Approved`, `Rejected` (remove the non-existent `"In Process"`/`"Completed"` options), and wire the select to actually filter the already-fetched `suggestions` array client-side by `status` (it currently renders but does nothing — add an `onChange` + filter the rendered list).

- [ ] **Step 2: Add status-aware table styling for `"Draft"` and `"Revision"`** in the existing `statusBg`/`statusDot` branching (lines 98-106) — e.g. slate for Draft, blue for Revision — matching the color language already used on the detail page's `statusConfig`.

- [ ] **Step 3: For rows with `status === "Draft"`, change the row's action link** from `View` (`Eye` icon, linking to the detail page) to `Lanjutkan` (an edit-style icon, e.g. `Pencil`, linking to `/dashboard/suggestions/create?draftId={_id}`) — a draft has no meaningful detail page to view, only a form to resume.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual check**

With at least one Draft and one Revision suggestion existing for the logged-in user, open `/dashboard/suggestions`: confirm the status filter dropdown has the corrected options and actually filters the table when changed; confirm the Draft row shows a "Lanjutkan" link that lands back on the create wizard with that draft's data loaded; confirm Draft/Revision rows have distinct status-pill colors from Pending/Approved/Rejected.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/dashboard/suggestions/page.tsx"
git commit -m "fix: correct status filter options and add drafts tab to suggestions list"
```
