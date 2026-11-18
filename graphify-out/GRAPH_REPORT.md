# Graph Report - suggestions-system-dcci  (2026-11-18)

## Corpus Check
- 107 files · ~546,059 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 3, .ico 2, .css 1)

## Summary
- 495 nodes · 784 edges · 42 communities (24 shown, 18 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `560da401`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- lucide-react
- suggestions/[id]/route.ts
- connectToDatabase
- package.json
- compilerOptions
- What You Must Do When Invoked
- VoiceInputButton.tsx
- File Structure
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
- Design: Role-Aware Dashboard
- SuggestionWizard.tsx
- graphify reference: extra exports and benchmark
- suggestionSimilarity.ts
- graphify reference: query, path, explain
- FR.MI-001-26 Form Suggestion System_4bde853e.md
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- suggestions/page.tsx
- rules/graphify.md
- extraction-spec.md
- workflows/graphify.md

## God Nodes (most connected - your core abstractions)
1. `connectToDatabase()` - 66 edges
2. `react` - 27 edges
3. `authOptions` - 26 edges
4. `next-auth` - 24 edges
5. `lucide-react` - 23 edges
6. `compilerOptions` - 16 edges
7. `File Structure` - 16 edges
8. `mongoose` - 14 edges
9. `What You Must Do When Invoked` - 12 edges
10. `/graphify` - 10 edges

## Surprising Connections (you probably didn't know these)
- `GET()` --calls--> `connectToDatabase()`  [EXTRACTED]
  app/api/suggestions/[id]/route.ts → lib/mongodb.ts
- `PATCH()` --calls--> `connectToDatabase()`  [EXTRACTED]
  app/api/suggestions/[id]/route.ts → lib/mongodb.ts
- `GET()` --calls--> `connectToDatabase()`  [EXTRACTED]
  app/api/notifications/route.ts → lib/mongodb.ts
- `PATCH()` --calls--> `connectToDatabase()`  [EXTRACTED]
  app/api/notifications/route.ts → lib/mongodb.ts
- `GET()` --calls--> `connectToDatabase()`  [EXTRACTED]
  app/api/news/[id]/route.ts → lib/mongodb.ts

## Import Cycles
- None detected.

## Communities (42 total, 18 thin omitted)

### Community 1 - "suggestions/[id]/route.ts"
Cohesion: 0.12
Nodes (20): dynamic, GET(), PATCH(), GET(), PATCH(), PUT(), GET(), POST() (+12 more)

### Community 2 - "connectToDatabase"
Cohesion: 0.06
Nodes (63): dynamic, GET(), DELETE(), PATCH(), dynamic, GET(), POST(), POST() (+55 more)

### Community 3 - "package.json"
Cohesion: 0.04
Nodes (42): dependencies, bcryptjs, exceljs, lucide-react, mongoose, next, next-auth, nodemailer (+34 more)

### Community 4 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 5 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 6 - "VoiceInputButton.tsx"
Cohesion: 0.19
Nodes (14): getServerSupportSnapshot(), getSpeechRecognitionConstructor(), getSupportSnapshot(), SpeechRecognitionAlternativeLike, SpeechRecognitionConstructor, SpeechRecognitionEventLike, SpeechRecognitionLike, SpeechRecognitionResultLike (+6 more)

### Community 7 - "File Structure"
Cohesion: 0.15
Nodes (12): File Structure, Global Constraints, Review Focus, Role-Aware Dashboard Implementation Plan, Task 1: `useCountUp` hook, Task 2: Admin system-health endpoint, Task 3: Reviewer "needs your review" widget, Task 4: Admin system-health widget (+4 more)

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
Cohesion: 0.33
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

### Community 21 - "RichTextEditor.tsx"
Cohesion: 0.24
Nodes (4): ReactQuill, RichTextEditor(), RichTextEditorProps, react-quill-new

### Community 27 - "Design: Role-Aware Dashboard"
Cohesion: 0.17
Nodes (11): A. How to gate dashboard sections per role, Approaches Considered, B. Where the Admin system-health numbers come from, C. Count-up animation, Constraints, Decided, Design: Role-Aware Dashboard, Goals (+3 more)

### Community 28 - "SuggestionWizard.tsx"
Cohesion: 0.07
Nodes (40): buildSuggestionFormData(), CreateSuggestionWizardPage(), Department, LoadedDraft, readErrorMessage(), buildResubmitFormData(), Department, EditRevisionSuggestionPage() (+32 more)

### Community 29 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 30 - "suggestionSimilarity.ts"
Cohesion: 0.48
Nodes (5): POST(), findSimilarSuggestions(), jaccardSimilarity(), STOPWORDS, tokenize()

### Community 31 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 32 - "FR.MI-001-26 Form Suggestion System_4bde853e.md"
Cohesion: 0.33
Nodes (5): Sheet: Form, Sheet: Matrix #1, Sheet: MatriX #2, Sheet: Sheet1, Sheet: Sheet3

### Community 33 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 34 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 35 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

## Knowledge Gaps
- **234 isolated node(s):** `graphify`, `Usage`, `What graphify is for`, `Step 0 - GitHub repos and multi-path merge (only if a URL or several paths)`, `Step 1 - Ensure graphify is installed` (+229 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 285 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `lucide-react`, `package.json`, `suggestions/page.tsx`, `VoiceInputButton.tsx`, `app/layout.tsx`, `profile/page.tsx`, `RichTextEditor.tsx`, `roles/page.tsx`, `app/terms/page.tsx`, `reset-password/page.tsx`, `dashboard/page.tsx`, `dashboard/terms/page.tsx`, `SuggestionWizard.tsx`?**
  _High betweenness centrality (0.139) - this node is a cross-community bridge._
- **Why does `next-auth` connect `connectToDatabase` to `suggestions/[id]/route.ts`, `package.json`, `next-auth.d.ts`, `suggestionSimilarity.ts`?**
  _High betweenness centrality (0.123) - this node is a cross-community bridge._
- **Why does `lucide-react` connect `lucide-react` to `package.json`, `suggestions/page.tsx`, `VoiceInputButton.tsx`, `profile/page.tsx`, `react`, `RichTextEditor.tsx`, `roles/page.tsx`, `app/terms/page.tsx`, `dashboard/page.tsx`, `dashboard/terms/page.tsx`, `SuggestionWizard.tsx`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **What connects `graphify`, `Usage`, `What graphify is for` to the rest of the system?**
  _234 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `suggestions/[id]/route.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12169312169312169 - nodes in this community are weakly interconnected._
- **Should `connectToDatabase` be split into smaller, more focused modules?**
  _Cohesion score 0.05515151515151515 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.043478260869565216 - nodes in this community are weakly interconnected._