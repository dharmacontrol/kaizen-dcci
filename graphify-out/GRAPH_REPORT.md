# Graph Report - suggestions-system-dcci  (2026-11-17)

## Corpus Check
- 96 files · ~517,892 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 3, .ico 2, .css 1)

## Summary
- 322 nodes · 567 edges · 29 communities (14 shown, 15 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c348e01d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- lucide-react
- suggestions/route.ts
- connectToDatabase
- package.json
- compilerOptions
- news/[id]/route.ts
- dependencies
- Announcement.ts
- app/layout.tsx
- File Structure
- create_god.js
- profile/page.tsx
- next-auth.d.ts
- settings/page.tsx
- eslint.config.mjs
- middleware.ts
- postcss.config.mjs
- Design: Advanced Suggestion Submission Flow
- react
- devDependencies
- RichTextEditor.tsx
- roles/page.tsx
- app/terms/page.tsx
- dashboard/page.tsx
- dashboard/terms/page.tsx

## God Nodes (most connected - your core abstractions)
1. `connectToDatabase()` - 71 edges
2. `react` - 24 edges
3. `authOptions` - 24 edges
4. `next-auth` - 22 edges
5. `lucide-react` - 20 edges
6. `File Structure` - 16 edges
7. `compilerOptions` - 16 edges
8. `mongoose` - 13 edges
9. `Design: Advanced Suggestion Submission Flow` - 9 edges
10. `Role` - 9 edges

## Surprising Connections (you probably didn't know these)
- `POST()` --calls--> `connectToDatabase()`  [EXTRACTED]
  app/api/suggestions/[id]/comments/route.ts → lib/mongodb.ts
- `GET()` --calls--> `connectToDatabase()`  [EXTRACTED]
  app/api/suggestions/[id]/document/route.ts → lib/mongodb.ts
- `GET()` --calls--> `connectToDatabase()`  [EXTRACTED]
  app/api/suggestions/[id]/route.ts → lib/mongodb.ts
- `PATCH()` --calls--> `connectToDatabase()`  [EXTRACTED]
  app/api/suggestions/[id]/route.ts → lib/mongodb.ts
- `POST()` --calls--> `connectToDatabase()`  [EXTRACTED]
  app/api/suggestions/route.ts → lib/mongodb.ts

## Import Cycles
- None detected.

## Communities (29 total, 15 thin omitted)

### Community 1 - "suggestions/route.ts"
Cohesion: 0.10
Nodes (16): POST(), GET(), GET(), PATCH(), POST(), DepartmentSchema, IDepartment, INotification (+8 more)

### Community 2 - "connectToDatabase"
Cohesion: 0.08
Nodes (45): dynamic, GET(), DELETE(), PATCH(), dynamic, GET(), POST(), handler (+37 more)

### Community 3 - "package.json"
Cohesion: 0.06
Nodes (31): POST(), ReactQuill, name, private, scripts, build, dev, lint (+23 more)

### Community 4 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 5 - "news/[id]/route.ts"
Cohesion: 0.23
Nodes (9): DELETE(), GET(), PATCH(), GET(), POST(), INews, News, NewsSchema (+1 more)

### Community 6 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, bcryptjs, exceljs, lucide-react, mongoose, next, next-auth, nodemailer (+7 more)

### Community 7 - "Announcement.ts"
Cohesion: 0.50
Nodes (3): Announcement, AnnouncementSchema, IAnnouncement

### Community 8 - "app/layout.tsx"
Cohesion: 0.22
Nodes (6): inter, lexend, metadata, Providers(), nextConfig, next

### Community 9 - "File Structure"
Cohesion: 0.10
Nodes (20): Advanced Suggestion Submission Flow Implementation Plan, File Structure, Global Constraints, Review Focus, Task 10: Wizard Step 5 — Review, duplicate-check, final submit, Task 11: Draft save wiring (manual save + localStorage mirror), Task 12: Create page becomes a thin wrapper; draft resume via `?draftId=`, Task 13: Revision edit page (+12 more)

### Community 10 - "create_god.js"
Cohesion: 0.29
Nodes (5): bcrypt, envPath, fs, mongoose, path

### Community 11 - "profile/page.tsx"
Cohesion: 0.40
Nodes (3): permissions, Profile, role

### Community 12 - "next-auth.d.ts"
Cohesion: 0.33
Nodes (5): JWT, next-auth, next-auth/jwt, Session, User

### Community 18 - "Design: Advanced Suggestion Submission Flow"
Cohesion: 0.15
Nodes (12): A. Duplicate detection method, Anti-Goals, Approaches Considered, B. How drafts save, C. Form structure, Constraints, Decided (owner's calls + mine, as agreed in conversation), Design: Advanced Suggestion Submission Flow (+4 more)

### Community 20 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/bcryptjs, @types/node, @types/react (+3 more)

## Knowledge Gaps
- **137 isolated node(s):** `Global Constraints`, `Testing Approach`, `Review Focus`, `Task 1: Suggestion model schema changes`, `Task 2: Quota endpoint using `submittedAt`` (+132 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 173 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next-auth` connect `connectToDatabase` to `suggestions/route.ts`, `package.json`, `next-auth.d.ts`, `news/[id]/route.ts`?**
  _High betweenness centrality (0.165) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `lucide-react`, `package.json`, `app/layout.tsx`, `profile/page.tsx`, `RichTextEditor.tsx`, `roles/page.tsx`, `app/terms/page.tsx`, `reset-password/page.tsx`, `dashboard/page.tsx`, `dashboard/terms/page.tsx`, `leaderboard/page.tsx`, `suggestions/create/page.tsx`?**
  _High betweenness centrality (0.146) - this node is a cross-community bridge._
- **Why does `mongoose` connect `suggestions/route.ts` to `connectToDatabase`, `package.json`, `news/[id]/route.ts`, `Announcement.ts`, `create_god.js`?**
  _High betweenness centrality (0.114) - this node is a cross-community bridge._
- **What connects `Global Constraints`, `Testing Approach`, `Review Focus` to the rest of the system?**
  _137 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `suggestions/route.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10344827586206896 - nodes in this community are weakly interconnected._
- **Should `connectToDatabase` be split into smaller, more focused modules?**
  _Cohesion score 0.08269394714407502 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._