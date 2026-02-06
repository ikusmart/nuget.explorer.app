# NuGet Package Explorer

A browser-based tool for exploring NuGet package dependencies with interactive graph visualization and migration analysis.

## Features

### Dependency Graph (`/graph`)
- Search packages from any NuGet V3 server
- Interactive force-directed graph with clustering (namespace, depth, community)
- Expand placeholder nodes by double-clicking to walk the dependency tree
- Multi-select nodes (Ctrl+Click), right-click context menu, pathfinding between nodes
- Import packages from `.csproj` files
- Export/import graph state as JSON

### Migration Analysis (`/`)
- Search packages by prefix (e.g. `MyCompany.Foundation.*`)
- Build full dependency trees with cycle detection
- Check target framework compatibility (net8.0, net9.0, net10.0, etc.)
- Matryoshka-style staged migration roadmap (topological ordering)
- Filter stable vs prerelease versions with dev version filter
- Download migration plan as Markdown
- Detect diamond dependency version conflicts

### Server Configuration
- Configure any NuGet V3 compatible server (nuget.org, MyGet, ProGet, Azure DevOps Artifacts, GitLab, etc.)
- Server selector available on all pages via the gear icon in the header
- URL validation against the NuGet V3 service index specification
- Default: `https://api.nuget.org/v3/index.json`

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
git clone https://github.com/<your-username>/nuget-explorer.git
cd nuget-explorer
npm install
```

### Development

```bash
npm run dev
```

Opens at [http://localhost:5173](http://localhost:5173). The dev server includes a CORS proxy so requests to external NuGet servers work without browser restrictions.

### Production Build

```bash
npm run build
npm run preview   # preview the build locally
```

The production build outputs to `dist/`. Deploy it to any static hosting (Vercel, Netlify, GitHub Pages, etc.).

> **Note**: In production, the CORS proxy is not included. If your NuGet server does not send CORS headers, you will need to configure a reverse proxy or deploy behind one.

### Configuring a NuGet Server

1. Click the gear icon in the top-right corner of the header
2. Enter the NuGet V3 service index URL (e.g. `https://api.nuget.org/v3/index.json`)
3. Click "Validate" to verify the server
4. The setting persists in browser localStorage

**Preset servers included:**
- nuget.org (official)
- MyGet

You can use any NuGet V3 compatible server. The app requires `SearchQueryService` and `RegistrationsBaseUrl` resources in the service index.

## Tech Stack

- **React 19** + TypeScript + Vite
- **Tailwind CSS** + Radix UI (shadcn/ui)
- **Zustand** for state management
- **@xyflow/react** for graph rendering
- **d3-force** for force-directed layout
- **TanStack Table** + **TanStack Virtual** for migration table

## License

MIT
