# Role-Aware Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the main dashboard (`app/(dashboard)/dashboard/page.tsx`) adapt to whoever is logged in — a reviewer sees an actionable review-queue count, an Admin sees system health, an Employee sees their submission quota — gated by the existing permission flags on `Role`, with lightweight visual polish (count-up stats, skeleton loading) applied throughout.

**Architecture:** Every new widget is permission-gated client-side the same way the sidebar already does it (`session.user.permissions.<flag>`), and any widget that needs data the client shouldn't compute itself (admin counts) gets its own small server-gated endpoint. No schema changes; this project only reads existing collections (plus one external endpoint from a sibling project, see Global Constraints).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Mongoose 9, NextAuth 4, Tailwind v4, `lucide-react`, `recharts` (already in use). No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-17-role-aware-dashboard-design.md`

## Global Constraints

- No new npm dependencies.
- Dashboard sections are gated by permission flags (`session.user.permissions.canManageSuggestions` / `canManageSystem` / `canCreateSuggestions`), never by matching a role name string.
- The Admin system-health numbers are computed and returned only to a session with `canManageSystem` — enforced server-side (403 otherwise), not just hidden client-side.
- Cross-project dependency: Task 7 (Employee quota widget) calls `GET /api/suggestions/quota`, built in the sibling `docs/superpowers/plans/2026-11-17-suggestion-submission-flow.md` (its Task 2). Task 7 is deliberately ordered last in this plan so the other project has the most runway to land that endpoint first; if it's genuinely not available yet when Task 7 is reached, implement Task 7 against the documented contract (`{ used, max, period }`) and have it degrade gracefully (hide the widget, don't crash the page) on a fetch failure, per Review Focus #4.
- Visual design stays inside the existing system already on this exact page (rounded-2xl cards, primary blue, the slate-900/emerald-600 accent cards, `lucide-react` icons, `recharts`) — no new palette or typeface.
- Must look and work correctly at both a ~375px mobile width and a ~1280px+ desktop width.

## Testing Approach

Same as the sibling submission-flow plan: this repo has no test runner configured, and introducing one is out of scope. Verification uses `npx tsc --noEmit` diffed against the known pre-existing baseline (`.superpowers/sdd/2026-11-17-suggestion-submission-flow/baseline-tsc-errors.txt` — 26 pre-existing errors unrelated to this plan; see that file before judging any "verify types compile" step) plus explicit manual steps.

## Review Focus

1. **`GET /api/dashboard/admin-stats` must return `403` for a session without `canManageSystem`**, not merely omit the widget client-side — test by calling the endpoint directly as a non-admin.
2. **`quietDepartments`'s 3-month window must be correct at the boundary** — a department whose only suggestion was created exactly 3 months ago (to the day) should not flip in/out depending on a sloppy `Date` comparison.
3. **A user whose permissions include both `canManageSuggestions` and `canManageSystem`** must see both the reviewer widget and the admin widget without layout breakage — most manual test accounts will have only one flag; this combination needs an explicit check.
4. **The quota widget (Task 7) must degrade gracefully if `GET /api/suggestions/quota` fails or 404s** (e.g., the sibling project's endpoint isn't deployed yet) — hide the widget, never crash the dashboard.
5. **`useCountUp` must handle its `target` changing after first mount** (the dashboard polls/refetches) by animating from the *previous* displayed value, not resetting to `0` on every update, and must respect `prefers-reduced-motion` by snapping instantly.

---

## File Structure

**New files:**
- `lib/useCountUp.ts` — the count-up animation hook.
- `app/api/dashboard/admin-stats/route.ts` — `GET`, `canManageSystem`-gated.

**Modified files:**
- `app/(dashboard)/dashboard/page.tsx` — all new widgets, quick actions, count-up/skeleton polish.

---

### Task 1: `useCountUp` hook

**Files:**
- Create: `lib/useCountUp.ts`

**Interfaces:**
- Produces: `useCountUp(target: number, durationMs?: number): number` (default `durationMs = 800`). On mount and whenever `target` changes, animates from the hook's *current displayed value* (not always `0`) to the new `target` over `durationMs` via `requestAnimationFrame`, linear easing. If `window.matchMedia("(prefers-reduced-motion: reduce)").matches`, returns `target` immediately with no animation, on both mount and every subsequent change.

- [ ] **Step 1: Implement `useCountUp`** in `lib/useCountUp.ts` (a `"use client"`-only hook — no directive needed in the hook file itself, but every component using it must already be a client component, which `app/(dashboard)/dashboard/page.tsx` already is).

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors vs. the baseline file.

- [ ] **Step 3: Manual check**

Temporarily render a scratch component calling `useCountUp(1234)` and, a second later via a button click, `useCountUp` with a new target (e.g. `5000`) — confirm it animates from `1234` up to `5000`, not restarting from `0`. In browser devtools, enable "Emulate CSS prefers-reduced-motion: reduce," remount, and confirm the number appears instantly with no animation.

- [ ] **Step 4: Commit**

```bash
git add lib/useCountUp.ts
git commit -m "feat: add count-up animation hook for dashboard stats"
```

---

### Task 2: Admin system-health endpoint

**Files:**
- Create: `app/api/dashboard/admin-stats/route.ts`

**Interfaces:**
- Consumes: `User`, `Role`, `Department`, `Suggestion` models; `getServerSession(authOptions)`; `connectToDatabase()`.
- Produces: `GET` → `{ totalUsers: number, totalDepartments: number, unassignedRoles: number, quietDepartments: number }`. `401` with no session. `403` when `session.user.permissions.canManageSystem` is not `true`.

- [ ] **Step 1: Implement the `GET` handler**: require a session (401 otherwise), check `session.user.permissions?.canManageSystem === true` (403 otherwise, checked *before* any query runs).

- [ ] **Step 2: Compute `totalUsers`/`totalDepartments`** via `User.countDocuments()` / `Department.countDocuments()`.

- [ ] **Step 3: Compute `unassignedRoles`**: count of `Role` documents with no `User` referencing their `_id` — e.g. fetch all role IDs, fetch the distinct `role` values actually used via `User.distinct("role")`, and count roles not in that set (or an equivalent aggregation — pick whichever reads more clearly, per the spec's "What's Left to the Builder").

- [ ] **Step 4: Compute `quietDepartments`**: count of `Department` documents with zero `Suggestion`s whose `createdAt >= threeMonthsAgo` (`new Date(); .setMonth(now.getMonth() - 3)`, matching the existing six-month-ago pattern already used in `app/api/analytics/route.ts:41-43`, just 3 months instead of 6).

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors vs. the baseline file.

- [ ] **Step 6: Manual check — authorization**

`npm run dev`. As a session without `canManageSystem`, `curl`/fetch `GET /api/dashboard/admin-stats` — expect `403`. As a session with it, expect `200` with all four numbers, each matching a manual count you can verify against the actual seed data (e.g. compare `totalUsers` against the Users list page's row count).

- [ ] **Step 7: Manual check — quiet-department boundary**

Pick (or temporarily create) a department whose only suggestion has `createdAt` set to exactly 3 months before "now" (adjust a document directly in the DB for this check, then revert it). Confirm it's counted consistently — document which side of the boundary you chose (`>=` means "exactly 3 months ago" counts as NOT quiet) and that the code matches that choice.

- [ ] **Step 8: Commit**

```bash
git add app/api/dashboard/admin-stats/route.ts
git commit -m "feat: add admin system-health stats endpoint"
```

---

### Task 3: Reviewer "needs your review" widget

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: the existing `stats` state already populated from `GET /api/dashboard/stats` (`processStatuses.pending`, see `app/api/dashboard/stats/route.ts:23-24,46-50`) — no new fetch needed.

- [ ] **Step 1: Add a new card**, shown only when `session?.user?.permissions?.canManageSuggestions` is true, placed in the existing "ROW 1: TOP CARDS" grid (`app/(dashboard)/dashboard/page.tsx:217` onward) alongside the other permission-gated cards already there. While `stats` is `null`, render nothing extra (consistent with the rest of that row's existing `stats ? ... : "..."` convention) rather than a flashing zero.

- [ ] **Step 2: Content** — when `stats.processStatuses.pending > 0`: a prominent number + "ide menunggu review kamu" label, linking (`<Link>`) to `/dashboard/approvals`. When it's exactly `0`: a calmer "Semua ide sudah direview" message, same card, no implication that something's broken.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors vs. the baseline file.

- [ ] **Step 4: Manual check**

Log in as a user whose role has `canManageSuggestions` and whose company has at least one `Pending` suggestion — confirm the card shows the real count and the link lands on Approvals. Temporarily approve/reject every Pending suggestion (or use a test account where none exist) and confirm the zero-state message appears instead of "0." Log in as an Employee (no `canManageSuggestions`) and confirm the card doesn't render at all. Check both ~375px and ~1280px+ widths — the card must not look cramped or oversized at either.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/dashboard/page.tsx"
git commit -m "feat: add reviewer needs-review widget to dashboard"
```

---

### Task 4: Admin system-health widget

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `GET /api/dashboard/admin-stats` (Task 2).

- [ ] **Step 1: Fetch `/api/dashboard/admin-stats` on mount**, only when `session?.user?.permissions?.canManageSystem` is true (don't fire the request at all otherwise — it would just 403 and waste a round-trip).

- [ ] **Step 2: Render a 2x2 stat grid card**: Users (`totalUsers`, links to `/dashboard/users`), Departments (`totalDepartments`, links to `/dashboard/departments`), Roles Belum Terisi (`unassignedRoles`, links to `/dashboard/roles`), Departemen Sepi (`quietDepartments`, links to `/dashboard/departments`). Shown only when `canManageSystem` is true; render nothing while the fetch is in flight (same "no flashing zero" rule as Task 3).

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors vs. the baseline file.

- [ ] **Step 4: Manual check**

As an Admin, confirm the widget renders with correct numbers (cross-check against Task 2's manual verification) and each link lands on the right page. As a non-Admin, confirm no request is even sent (check the browser's network tab) and the widget doesn't render. Log in as a user with *both* `canManageSuggestions` and `canManageSystem` (create/assign a test role with both flags if none exists) — confirm Task 3's card and this one both render side by side without overlapping or breaking the grid, at both ~375px and ~1280px+.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/dashboard/page.tsx"
git commit -m "feat: add admin system-health widget to dashboard"
```

---

### Task 5: Quick actions row

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `session.user.permissions` (already available via `useSession()`, already imported on this page).

- [ ] **Step 1: Add a horizontal row of shortcut buttons** below the welcome banner (or above the top-cards row — pick whichever reads better in context once built): `canCreateSuggestions` → "Buat Suggestion Baru" linking to `/dashboard/suggestions/create` (reuse the `FileText` or a `Plus` icon, whichever lucide icon fits best next to the existing imports); `canManageSuggestions` → "Ke Approvals" linking to `/dashboard/approvals` (reuse `CheckCircle`, already imported on this page per line 10); `canManageSystem` → "Kelola Users" linking to `/dashboard/users` (reuse `Users`, already imported per line 6). Each button renders only when its flag is true — the row can show 0-3 buttons depending on the viewer; if it would show 0, don't render the row's container at all.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors vs. the baseline file.

- [ ] **Step 3: Manual check**

As an Employee, confirm only "Buat Suggestion Baru" shows. As a user with all three flags, confirm all three show without wrapping awkwardly at ~375px (stack or scroll, don't overflow) and sit in a tidy single row at ~1280px+.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/dashboard/page.tsx"
git commit -m "feat: add permission-gated quick actions row to dashboard"
```

---

### Task 6: Count-up animation + skeleton loading polish

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `useCountUp` (Task 1).

- [ ] **Step 1: Apply `useCountUp`** to every plain-text numeric stat currently rendered on this page once data has loaded: "My Points" (`stats.personalPoints`), "Total Cost Saved" (`analytics.overview.totalImpact` — animate the raw number, then format the *animated* value with the existing `formatCurrency`, so the currency string itself counts up smoothly rather than flickering between unrelated formatted strings), the Task 3 reviewer count, and each of the Task 4 admin-stat numbers.

- [ ] **Step 2: Extend the existing skeleton-pulse pattern** (`app/(dashboard)/dashboard/page.tsx:150-164`, currently only used for the news cards) to: the top-cards row (My Points / Total Cost Saved / Top Departments) while `stats`/`analytics`/`leaderboard` are still loading, and the two analytics charts while `analytics` is loading. Replace the current bare `"..."` placeholders with the same pulse-skeleton shape used for news.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors vs. the baseline file.

- [ ] **Step 4: Manual check**

Reload the dashboard with browser devtools network throttled (Slow 3G) and confirm every stat card shows a skeleton pulse instead of `"..."` while loading, and each number animates up smoothly once data arrives — not an instant jump. Reload again with "prefers-reduced-motion: reduce" emulated and confirm numbers appear instantly with no animation. Check both ~375px and ~1280px+.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/dashboard/page.tsx"
git commit -m "feat: add count-up animation and skeleton loading to dashboard stats"
```

---

### Task 7: Employee quota widget

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `GET /api/suggestions/quota` (from the sibling suggestion-submission-flow plan, Task 2) — contract: `{ used: number, max: number, period: string }`.

- [ ] **Step 1: Fetch `/api/suggestions/quota` on mount**, only when `session?.user?.permissions?.canCreateSuggestions` is true. Wrap the fetch so a non-`200` response or a thrown error sets a local "unavailable" flag instead of propagating — this widget must never crash the rest of the dashboard if that endpoint errors or doesn't exist yet (Review Focus #4).

- [ ] **Step 2: Render a small progress-bar card** ("{used}/{max} ide bulan ini") when the fetch succeeded, using `useCountUp` (Task 1) on `used`, and the same amber-at-cap / blue-otherwise color rule as the submission wizard's own quota banner (per the design doc). Render nothing for this widget (not an error message — just omit it) when the fetch failed or the permission is absent.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors vs. the baseline file.

- [ ] **Step 4: Manual check — happy path**

With the sibling plan's quota endpoint deployed, log in as an Employee and confirm the widget shows the real used/max numbers matching what `/dashboard/suggestions/create` itself shows.

- [ ] **Step 5: Manual check — degraded path**

Temporarily rename/break the quota endpoint (or block the request in devtools) and reload the dashboard as an Employee — confirm the rest of the dashboard still renders normally and this widget simply doesn't appear, with no console-breaking error.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/dashboard/page.tsx"
git commit -m "feat: add employee quota widget to dashboard"
```
