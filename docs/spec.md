# NuGet Package Explorer Specification

This document details the architecture, API integration, and user workflow for the NuGet Package Explorer application.

## 1. NuGet V3 API Integration

The application interacts with the [NuGet V3 API](https://learn.microsoft.com/en-us/nuget/api/overview). It is a resource-based API discovered via a service index.

### 1.1 Service Discovery
- **Index URL**: `https://api.nuget.org/v3/index.json`
- **Key Resources Used**:
    - `SearchQueryService`: For searching packages.
    - `RegistrationsBaseUrl`: For retrieving package metadata and dependencies.
    - `PackageBaseAddress`: For retrieving version lists and downloading `.nupkg` files.

### 1.2 Core Workflows (API)
1.  **Search**: `GET {SearchQueryService}?q={query}&prerelease=true&semVerLevel=2.0.0`
    - Returns a list of packages with summaries and icons.
2.  **Version List**: `GET {PackageBaseAddress}/{id-lower}/index.json`
    - Returns all available versions for a specific package ID.
3.  **Package Details & Dependencies**: `GET {RegistrationsBaseUrl}/{id-lower}/{version-lower}.json`
    - Returns metadata (description, authors, iconUrl, projectUrl) and dependency groups.
    - Dependencies are extracted from `dependencyGroups` and flattened.
4.  **Download**: Construct URL via `{PackageBaseAddress}/{id-lower}/{version-lower}/{id-lower}.{version-lower}.nupkg`.

## 2. Application Architecture

### 2.1 State Management
- **React Hooks**: Managed locally via `useState` and `useMemo`.
- **URL State**: The current graph configuration (resolved nodes and selection) is serialized into a Base64 JSON string and stored in the `?g=` URL parameter for shareability.
- **Cache**: A `Map`-based cache in `NugetService` stores API responses to reduce redundant network calls.

### 2.2 Visualization (D3.js)
- **Force-Directed Graph**: Uses `d3-force` simulation.
- **Node Types**:
    - **Resolved Nodes**: Full metadata available (solid border).
    - **Placeholder Nodes**: Detected as dependencies but not yet resolved to a specific version (dashed border).
- **Vulnerability Tracking**: Visual indicators (Red border/icon) for packages flagged in a mock security database.

### 2.3 Utility Features
- **CSProj Parser**: Client-side XML parsing to extract `<PackageReference>` tags.
- **Pathfinding**: BFS algorithm to find the shortest dependency path between two selected nodes.

## 3. User Workflow

### 3.1 Discovery Phase
1.  **Initial Load**: Displays "Popular Packages" (pre-defined list) and an empty graph.
2.  **Search**: User enters a query. Results update in real-time (debounced).
3.  **Selection**: User selects a package result to view its version history.

### 3.2 Exploration Phase
1.  **Selection**: Selecting a specific version triggers a fetch for detailed metadata (Info Panel).
2.  **Graph Addition**: Clicking "Add to Graph" adds the package and its immediate dependencies (as placeholders) to the D3 canvas.
3.  **Expansion**: 
    - Double-clicking or right-clicking a placeholder node "Resolves" it (fetches latest version and its dependencies).
    - This allows "walking" through the dependency tree visually.

### 3.3 Management Phase
1.  **Multi-Select**: Use `Ctrl/Cmd + Click` to select multiple nodes for bulk removal or pathfinding.
2.  **Pathfinding**: Select exactly two nodes and click "Find Path" to highlight the dependency chain between them.
3.  **Filtering**: Use the search bar in the "Nodes in Graph" list to find specific entities.
4.  **Persistence**: 
    - Export/Import the session cache as a JSON file.
    - Copy the URL to share the exact graph state with others.

## 4. UI/UX Principles
- **Theming**: System-aware Dark/Light mode.
- **Responsiveness**: Three-panel layout (Filters | Graph | Controls) that collapses on mobile or small viewports.
- **Feedback**: Comprehensive toast notifications for network errors, successful additions, and cache actions.
- **Performance**: D3 simulations are throttled/stopped when not needed to save CPU.
