# Design: Role-Aware Dashboard

Date: 2026-11-17
Status: Approved by product owner (verbal, this conversation) — pending plan

## Intent & Why

The main dashboard (`app/(dashboard)/dashboard/page.tsx`) is the first screen every user lands on. Today it is one component rendered identically for everyone, with exactly one branch point: the boolean permission `canViewDashboard` (either you get the company-wide analytics cards, or you don't). With 8 distinct, admin-configurable permission flags on `Role` (`models/Role.ts`), the dashboard ignores almost all of that nuance — a SectionHead/Admin who can approve suggestions sees exactly the same screen as one who can't, and neither sees anything that tells them what, specifically, needs their attention right now. An Employee sees their own point total and recent ideas, but nothing about how close they are to the monthly submission cap.

Owner's framing: make the dashboard more advanced and have it adapt to whoever is logged in.

## Goals

1. Give a user with `canManageSuggestions` (reviewer) a prominent, actionable "needs your review" count that links straight to Approvals — today they'd have to open Approvals and scan manually to know if anything's waiting.
2. Give an Employee visibility into their monthly submission quota on the dashboard itself (reusing the quota endpoint being built in the suggestion-submission-flow project).
3. Give a user with `canManageSystem` (Admin) a system-health glance: user/department counts, departments that have gone quiet, roles with nobody assigned.
4. Add a small, permission-gated quick-actions row so the dashboard itself is a useful launch point, not just a readout.
5. Carry over the same visual-polish bar as the submission-flow work: count-up animation on numeric stats, skeleton loading on every card (today only the news section has it), fully responsive at both mobile and desktop widths.

## Non-Goals

- Changing anything about how suggestions are reviewed/approved (`approvals` page, `PATCH /api/suggestions/[id]`) — out of scope, same boundary as the submission-flow project.
- Fixing a pre-existing, unrelated inconsistency noticed while reading this code: the Approvals page's own copy says "submitted by your department," but `GET /api/suggestions` returns suggestions company-wide for any non-`Employee` role — there is no actual department scoping today. Flagged here for visibility, not fixed, because fixing it means deciding how a reviewer gets scoped to a department at all, which the current `Role`/`User` model doesn't represent (see Non-Goals below) and is its own project.
- A distinct "department head" dashboard view scoped to one department's own numbers. There is no permission flag or data model concept today for "this reviewer is scoped to department X" — `Role` permissions are global flags, not department-scoped, and `User.department` just says which department someone belongs to, not which one(s) they review for. Building that scoping concept is a real feature on its own (new field, new query shape, new UI) and is parked here rather than guessed at.
- Any change to `models/Role.ts` or the permission set itself — this project only reads existing permission flags, it doesn't add new ones.

## Constraints

- No new npm dependencies (count-up animation implemented with a small custom hook — `requestAnimationFrame`/CSS — not a library).
- Dashboard sections are gated by **permission flags** (`session.user.permissions.canManageSuggestions`, `canManageSystem`, `canViewDashboard`), the same pattern the sidebar (`app/(dashboard)/layout.tsx:94-101`) already uses — never by matching a literal role name string, since `Role` is admin-configurable with arbitrary names.
- The Admin system-health numbers must never be computed or sent to a session without `canManageSystem` — gate it server-side in the new endpoint, not just by hiding the component client-side.
- Cross-project dependency: the Employee quota widget calls `GET /api/suggestions/quota`, which is being built in the suggestion-submission-flow project (`docs/superpowers/plans/2026-11-17-suggestion-submission-flow.md`, Task 2). This project's quota-widget task cannot land before that endpoint exists.
- Visual design stays inside the existing system (rounded-2xl cards, primary blue, slate-900/emerald-600 accent cards already used on this exact page, `lucide-react` icons, `recharts` already in use for charts) — no new palette or typeface, consistent with the submission-flow project's design stance.
- Must look and work correctly at both a ~375px mobile width and a ~1280px+ desktop width.

## Approaches Considered

### A. How to gate dashboard sections per role
- **Hardcode checks against `session.user.role === "SectionHead"` etc.** Rejected — `Role` is admin-configurable (created/edited via `/dashboard/roles`), so a literal name match breaks the moment someone renames or adds a role, and the codebase already shows this exact fragility in one place (`app/api/suggestions/[id]/route.ts:44`, `session.user.role === "Employee"`) — not a pattern to extend.
- **Gate by permission flag (picked).** Matches the sidebar's own existing convention exactly (`app/(dashboard)/layout.tsx:94-101`). A section shows for *any* role that happens to carry the relevant flag, which is the actual intent ("people who can manage suggestions should see a review count"), not "people whose role happens to be named X."

### B. Where the Admin system-health numbers come from
- **Compute them client-side from data already fetched elsewhere.** Rejected — user/department/role counts aren't returned by any endpoint the dashboard already calls, and computing them client-side would mean fetching full `User`/`Role`/`Department` lists to the browser just to count them, leaking data to the client unnecessarily.
- **New small server-gated endpoint (picked).** `GET /api/dashboard/admin-stats`, checks `canManageSystem` server-side (403 otherwise), runs a handful of `countDocuments`/small aggregations, returns only the counts — no underlying records ever reach the client.

### C. Count-up animation
- **A library (e.g. a counter/animation package).** Rejected — constraint is no new dependencies, and this is a genuinely small amount of logic.
- **Small custom hook (picked).** `useCountUp(target: number, durationMs?: number): number`, driven by `requestAnimationFrame`, easing linearly from `0` (or the previous value) to `target` over ~800ms; respects `prefers-reduced-motion` by snapping straight to `target` with no animation when that's set.

## Decided

1. **Reviewer "needs your review" widget.** The data already exists — `GET /api/dashboard/stats` already returns `processStatuses.pending` (`app/api/dashboard/stats/route.ts:23-24,46-50`), which is already the company-wide `Pending` count (matching what the Approvals page actually shows today, per the non-goal above — not department-scoped, because nothing is). Shown only when `session.user.permissions.canManageSuggestions` is true, as a prominent card (reusing the existing slate-900 "My Points" card's visual weight, not its color) reading "{n} ide menunggu review kamu," linking to `/dashboard/approvals`. When `n === 0`, show a calmer "Semua ide sudah direview" state rather than a zero that reads like nothing's there.

2. **Employee quota widget.** `GET /api/suggestions/quota` (from the submission-flow project), shown only when `session.user.permissions.canCreateSuggestions` is true (the permission that actually governs whether someone submits ideas at all — matches `models/Role.ts`'s own flag, not an assumption about role name). A small progress bar: "{used}/{max} ide bulan ini," same amber-at-cap / blue-otherwise color rule as the submission wizard's own quota banner, for visual consistency between the two places that show the same number.

3. **Admin system-health widget.** New `GET /api/dashboard/admin-stats` (session + `canManageSystem` required, 403 otherwise): `{ totalUsers, totalDepartments, unassignedRoles, quietDepartments }` where `unassignedRoles` is the count of `Role` documents with zero `User`s referencing them, and `quietDepartments` is the count of `Department`s with zero `Suggestion`s in the last 3 months. Shown only when `session.user.permissions.canManageSystem` is true, as a small 2x2 stat grid with a link to the relevant management page per number (Users→`/dashboard/users`, Departments→`/dashboard/departments`, Roles→`/dashboard/roles`; `quietDepartments` links to `/dashboard/departments` too, there's no filtered view for it and building one is out of scope).

4. **Quick actions row.** A small horizontal row of 2-4 shortcut buttons, built from the same permission flags already checked above — `canCreateSuggestions` → "Buat Suggestion Baru" (`/dashboard/suggestions/create`), `canManageSuggestions` → "Ke Approvals" (`/dashboard/approvals`), `canManageSystem` → "Kelola Users" (`/dashboard/users`). Reuses `lucide-react` icons already imported elsewhere in the sidebar for visual consistency (same icon per destination as the sidebar uses).

5. **Count-up + skeleton loading.** `useCountUp` (hook described in Approach C) applied to every numeric stat currently rendered as plain text (`My Points`, `Total Cost Saved`, the new review-count and admin-stat numbers). Skeleton-loading treatment (matching the existing pulse-skeleton already used for the news cards, `app/(dashboard)/dashboard/page.tsx:150-164`) extended to the stats row, leaderboard card, and analytics charts so first paint never shows a bare `"..."` string.

6. **Layout or responsiveness.** No new grid system — extend the existing `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4` pattern already on this page for the new widgets; each new widget is checked at ~375px and ~1280px+ same as the submission-flow work.

## What's Left to the Builder

- Exact Tailwind styling/icon choice for the quick-actions row — follow the existing card language already on this page.
- Exact copy for the "semua sudah direview" empty state and the admin widget labels — Indonesian, matching the app's existing tone.
- Whether `unassignedRoles`/`quietDepartments` are computed with `aggregate` or a couple of small sequential queries — pick whichever is less code for the data sizes this app has (tens to low hundreds of documents, not a performance-sensitive query).
- No schema changes and no migration — this project only reads existing collections.
