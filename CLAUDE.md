# NuGet Package Explorer

## Project Overview

A browser-based tool for exploring NuGet package dependencies. Two main views:
- **Migration Analysis** (`/`) — analyze packages by prefix, build dependency trees, check target framework compatibility, generate migration roadmaps
- **Dependency Graph** (`/graph`) — interactive force-directed graph visualization of package dependencies

## Tech Stack

- React 19 + TypeScript + Vite
- Tailwind CSS + Radix UI (shadcn/ui components)
- Zustand (state management with localStorage persistence)
- @xyflow/react (graph visualization)
- d3-force (force-directed layout)
- TanStack Table + TanStack Virtual (migration table)

## Build & Run

```bash
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # production build to dist/
npm run preview  # preview production build
npm run lint     # eslint
```

No .env files needed. The app uses public nuget.org API by default.

## Project Structure

```
src/
  main.tsx                          # Router: / -> MigrationPage, /graph -> GraphPage
  pages/
    MigrationPage.tsx               # Migration analysis page
    GraphPage.tsx                   # Dependency graph page
  components/
    layout/
      AppLayout.tsx                 # 3-panel layout with ServerSelector in header
      ServerSelector.tsx            # NuGet server URL configuration dialog
    search/                         # Package search, version picker, csproj import
    graph/                          # Graph canvas, nodes, context menu
    details/                        # InfoPanel (selected node details)
    migration/                      # Migration toolbar, table, roadmap, conflicts
    ui/                             # shadcn/ui primitives
  services/
    nuget-api.ts                    # NuGet V3 API client (search, versions, details)
    migration-analyzer.ts           # Dependency tree loader, TFM analysis, topo sort
  stores/
    server-store.ts                 # Server URL + validation state
    graph-store.ts                  # Graph nodes/edges, selection, layout, export
    migration-store.ts              # Migration analysis state + actions
  lib/
    clustering.ts                   # Graph clustering algorithms
    force-simulation.ts             # d3-force layout wrapper
    graph-export.ts                 # Graph JSON export/import
    csproj-parser.ts                # .csproj XML parser
  types/
    nuget.ts                        # NuGet API types
    migration.ts                    # Migration analysis types
  hooks/
    use-nuget.ts                    # React hooks for NuGet API
    use-toast.ts                    # Toast notifications
```

## Installing Claude Code Skills (Optional)

The project uses skills from three repos. They are symlinked into `.claude/skills/` (gitignored).

### 1. Clone skill repos

```bash
git clone https://github.com/obra/superpowers.git
git clone https://github.com/dmccreary/claude-skills.git
git clone https://github.com/vercel-labs/agent-skills.git
```

### 2. Symlink skills into the project

From the project root, create `.claude/skills/` and symlink each skill:

```bash
mkdir -p .claude/skills

# obra/superpowers
for skill in brainstorming dispatching-parallel-agents executing-plans \
  finishing-a-development-branch receiving-code-review requesting-code-review \
  subagent-driven-development systematic-debugging test-driven-development \
  using-git-worktrees using-superpowers verification-before-completion \
  writing-plans writing-skills; do
  ln -s /path/to/superpowers/skills/$skill .claude/skills/$skill
done

# dmccreary/claude-skills
for skill in book-chapter-generator book-installer book-metrics-generator \
  chapter-content-generator concept-classifier course-description-analyzer \
  diagram-reports-generator faq-generator glossary-generator \
  learning-graph-generator linkedin-announcement-generator microsim-generator \
  microsim-utils moving-rainbow quiz-generator readme-generator \
  reference-generator story-generator; do
  ln -s /path/to/claude-skills/skills/$skill .claude/skills/$skill
done

# vercel-labs/agent-skills
for skill in composition-patterns react-best-practices react-native-skills \
  web-design-guidelines; do
  ln -s /path/to/agent-skills/skills/$skill .claude/skills/$skill
done
ln -s /path/to/agent-skills/skills/claude.ai/vercel-deploy-claimable .claude/skills/vercel-deploy-claimable
```

Replace `/path/to/` with the actual clone location. On Windows use `mklink /D` or Git Bash symlinks.

## Key Patterns

- Server URL is configurable via Settings dialog (gear icon in header), available on all pages
- Default server: `https://api.nuget.org/v3/index.json`
- CORS proxy in dev mode via Vite plugin (`/api/nuget-proxy`)
- Dependency groups are normalized to handle different NuGet server response formats
- Version selection in migration: stable preferred, prerelease only with explicit dev filter
- Graph uses placeholder nodes (dashed) for unresolved dependencies, resolved on double-click
