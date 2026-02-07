import { create } from "zustand";
import type { Node, Edge } from "@xyflow/react";
import type {
  PackageDetails,
  FlatDependency,
  DependencyGroup,
} from "@/types/nuget";
import { flattenDependencies } from "@/services/nuget-api";
import {
  createSimulation,
  stopSimulation,
  getNodePositions,
  runSimulationSync,
  type ForceLayoutMode,
  type SimNode,
  type SimLink,
} from "@/lib/force-simulation";
import {
  computeClusters,
  computeNodeDepths,
  getClusterInfos,
  calculateClusterCenters,
  type ClusterStrategy,
  type ClusterInfo,
} from "@/lib/clustering";
import {
  exportGraph,
  importNodes,
  importEdges,
  downloadGraphExport,
  readGraphExportFile,
  type GraphExport,
} from "@/lib/graph-export";

/** Node data for package nodes */
export type PackageNodeData = {
  packageId: string;
  version?: string;
  description?: string;
  iconUrl?: string;
  projectUrl?: string;
  licenseUrl?: string;
  authors?: string[];
  dependencyGroups?: DependencyGroup[];
  isPlaceholder: boolean;
  isSelected?: boolean;
  isHidden?: boolean;
  clusterId?: string;
  clusterColor?: string;
  [key: string]: unknown;
};

/** Graph node with package data */
export type GraphNode = Node<PackageNodeData>;

/** Graph edge */
export type GraphEdge = Edge;

/** Create a unique node ID */
function createNodeId(packageId: string, version?: string): string {
  if (!packageId) {
    console.error("createNodeId called with undefined packageId");
    return "unknown";
  }
  return version ? `${packageId}@${version}` : packageId.toLowerCase();
}

/** Create a resolved node from package details */
function createResolvedNode(
  details: PackageDetails,
  position: { x: number; y: number },
): GraphNode {
  return {
    id: createNodeId(details.id, details.version),
    type: "packageNode",
    position,
    data: {
      packageId: details.id,
      version: details.version,
      description: details.description,
      iconUrl: details.iconUrl,
      projectUrl: details.projectUrl,
      licenseUrl: details.licenseUrl,
      authors: details.authors,
      dependencyGroups: details.dependencyGroups,
      isPlaceholder: false,
    },
  };
}

/** Create a placeholder node for a dependency */
function createPlaceholderNode(
  dep: FlatDependency,
  position: { x: number; y: number },
): GraphNode {
  return {
    id: createNodeId(dep.id),
    type: "packageNode",
    position,
    data: {
      packageId: dep.id,
      isPlaceholder: true,
    },
  };
}

/** Create an edge between two nodes */
function createEdge(
  sourceId: string,
  targetId: string,
  versionRange?: string,
): GraphEdge {
  return {
    id: `${sourceId}->${targetId}`,
    source: sourceId,
    target: targetId,
    label: versionRange,
    animated: false,
  };
}

interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeIds: Set<string>;
  highlightFilter: string;

  // D3 force layout state
  forceLayoutMode: ForceLayoutMode;
  clusterStrategy: ClusterStrategy;
  clusters: Map<string, string>;
  clusterInfos: Map<string, ClusterInfo>;

  // Filter with hiding
  hiddenNodeIds: Set<string>;

  // Pathfinding
  highlightedPath: Set<string>;

  // Actions
  addPackage: (details: PackageDetails) => void;
  addDependency: (parentNodeId: string, dep: FlatDependency) => void;
  addAllDependencies: (parentNodeId: string) => void;
  isNodeOnGraph: (packageId: string) => boolean;
  removeNode: (id: string) => void;
  removeSelectedNodes: () => void;
  toggleNodeSelection: (id: string, additive: boolean) => void;
  selectNodes: (ids: string[]) => void;
  selectAllNodes: () => void;
  clearSelection: () => void;
  selectDependencies: (nodeId: string) => void;
  expandDependency: (placeholderId: string, details: PackageDetails) => void;
  clearGraph: () => void;
  updateNodePositions: (
    changes: { id: string; position: { x: number; y: number } }[],
  ) => void;
  setHighlightFilter: (filter: string) => void;

  // D3 force actions
  setForceLayoutMode: (mode: ForceLayoutMode) => void;
  setClusterStrategy: (strategy: ClusterStrategy) => void;
  runForceLayout: (width: number, height: number) => void;
  computeLayout: (
    width: number,
    height: number,
  ) => Map<string, { x: number; y: number }>;
  applyFilter: () => void;
  resetFilter: () => void;
  getVisibleNodes: () => GraphNode[];
  getVisibleEdges: () => GraphEdge[];

  // Pathfinding
  findPath: (nodeA: string, nodeB: string) => boolean;
  clearPath: () => void;

  // Export/Import
  exportToFile: () => void;
  importFromFile: (file: File) => Promise<boolean>;
  importFromData: (data: GraphExport) => void;
}

/** Calculate position for new nodes in a radial layout */
function calculateNewNodePosition(
  existingNodes: GraphNode[],
  centerX: number = 400,
  centerY: number = 300,
): { x: number; y: number } {
  if (existingNodes.length === 0) {
    return { x: centerX, y: centerY };
  }

  // Place new nodes in a circle around the center
  const angle = (existingNodes.length * 45 * Math.PI) / 180;
  const radius = 200 + Math.floor(existingNodes.length / 8) * 100;
  return {
    x: centerX + radius * Math.cos(angle),
    y: centerY + radius * Math.sin(angle),
  };
}

/** Calculate positions for dependency nodes around a parent */
function calculateDependencyPositions(
  parentPosition: { x: number; y: number },
  count: number,
): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  const radius = 150;
  const startAngle = -Math.PI / 2; // Start from top

  for (let i = 0; i < count; i++) {
    const angle = startAngle + (i * 2 * Math.PI) / Math.max(count, 1);
    positions.push({
      x: parentPosition.x + radius * Math.cos(angle),
      y: parentPosition.y + radius * Math.sin(angle),
    });
  }

  return positions;
}

/** Calculate position for a single dependency near its parent */
function calculatePositionNearParent(
  parentPosition: { x: number; y: number },
  existingCount: number,
): { x: number; y: number } {
  const radius = 150;
  const angle = -Math.PI / 2 + (existingCount * Math.PI) / 4;
  return {
    x: parentPosition.x + radius * Math.cos(angle),
    y: parentPosition.y + radius * Math.sin(angle),
  };
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeIds: new Set(),
  highlightFilter: "",
  forceLayoutMode: "force",
  clusterStrategy: "namespace",
  clusters: new Map(),
  clusterInfos: new Map(),
  hiddenNodeIds: new Set(),
  highlightedPath: new Set(),

  addPackage: (details: PackageDetails) => {
    console.log("addPackage called with:", details);

    if (!details || !details.id) {
      console.error("Invalid package details:", details);
      return;
    }

    const state = get();
    const nodeId = createNodeId(details.id, details.version);

    // Check if node already exists
    if (state.nodes.some((n) => n.id === nodeId)) {
      return;
    }

    // Create the main node
    const position = calculateNewNodePosition(state.nodes);
    const newNode = createResolvedNode(details, position);

    // Get dependencies and create placeholder nodes
    const dependencies = flattenDependencies(details);
    const depPositions = calculateDependencyPositions(
      position,
      dependencies.length,
    );

    const newNodes: GraphNode[] = [newNode];
    const newEdges: GraphEdge[] = [];

    dependencies.forEach((dep, index) => {
      const depNodeId = createNodeId(dep.id);

      // Only add if doesn't exist
      if (
        !state.nodes.some((n) => n.id === depNodeId) &&
        !newNodes.some((n) => n.id === depNodeId)
      ) {
        newNodes.push(createPlaceholderNode(dep, depPositions[index]));
      }

      // Always add edge if it doesn't exist
      const edgeId = `${nodeId}->${depNodeId}`;
      if (
        !state.edges.some((e) => e.id === edgeId) &&
        !newEdges.some((e) => e.id === edgeId)
      ) {
        newEdges.push(createEdge(nodeId, depNodeId, dep.versionRange));
      }
    });

    set({
      nodes: [...state.nodes, ...newNodes],
      edges: [...state.edges, ...newEdges],
    });
  },

  addDependency: (parentNodeId: string, dep: FlatDependency) => {
    const state = get();
    const parentNode = state.nodes.find((n) => n.id === parentNodeId);
    if (!parentNode) return;

    const depNodeId = createNodeId(dep.id);

    // Check if node already exists
    const existingNode = state.nodes.find((n) => n.id === depNodeId);
    if (existingNode) {
      // Just add edge if missing
      const edgeId = `${parentNodeId}->${depNodeId}`;
      if (!state.edges.some((e) => e.id === edgeId)) {
        set({
          edges: [
            ...state.edges,
            createEdge(parentNodeId, depNodeId, dep.versionRange),
          ],
        });
      }
      return;
    }

    // Count existing edges from parent to calculate position
    const existingEdgesFromParent = state.edges.filter(
      (e) => e.source === parentNodeId,
    ).length;

    // Create placeholder node near parent
    const position = calculatePositionNearParent(
      parentNode.position,
      existingEdgesFromParent,
    );
    const newNode = createPlaceholderNode(dep, position);
    const newEdge = createEdge(parentNodeId, depNodeId, dep.versionRange);

    set({
      nodes: [...state.nodes, newNode],
      edges: [...state.edges, newEdge],
    });
  },

  addAllDependencies: (parentNodeId: string) => {
    const state = get();
    const parentNode = state.nodes.find((n) => n.id === parentNodeId);
    if (!parentNode || !parentNode.data.dependencyGroups) return;

    const dependencies = flattenDependencies({
      id: parentNode.data.packageId,
      version: parentNode.data.version || "",
      dependencyGroups: parentNode.data.dependencyGroups,
    });

    const depPositions = calculateDependencyPositions(
      parentNode.position,
      dependencies.length,
    );

    const newNodes: GraphNode[] = [];
    const newEdges: GraphEdge[] = [];

    dependencies.forEach((dep, index) => {
      const depNodeId = createNodeId(dep.id);

      // Check if node already exists
      const existingNode = state.nodes.find((n) => n.id === depNodeId);
      if (!existingNode && !newNodes.some((n) => n.id === depNodeId)) {
        newNodes.push(createPlaceholderNode(dep, depPositions[index]));
      }

      // Add edge if it doesn't exist
      const edgeId = `${parentNodeId}->${depNodeId}`;
      if (
        !state.edges.some((e) => e.id === edgeId) &&
        !newEdges.some((e) => e.id === edgeId)
      ) {
        newEdges.push(createEdge(parentNodeId, depNodeId, dep.versionRange));
      }
    });

    if (newNodes.length > 0 || newEdges.length > 0) {
      set({
        nodes: [...state.nodes, ...newNodes],
        edges: [...state.edges, ...newEdges],
      });
    }
  },

  isNodeOnGraph: (packageId: string) => {
    const state = get();
    const nodeId = createNodeId(packageId);
    return state.nodes.some((n) => n.id === nodeId);
  },

  removeNode: (id: string) => {
    set((state) => {
      const newSelectedIds = new Set(state.selectedNodeIds);
      newSelectedIds.delete(id);
      return {
        nodes: state.nodes.filter((n) => n.id !== id),
        edges: state.edges.filter((e) => e.source !== id && e.target !== id),
        selectedNodeIds: newSelectedIds,
      };
    });
  },

  removeSelectedNodes: () => {
    const state = get();
    const idsToRemove = state.selectedNodeIds;
    set({
      nodes: state.nodes.filter((n) => !idsToRemove.has(n.id)),
      edges: state.edges.filter(
        (e) => !idsToRemove.has(e.source) && !idsToRemove.has(e.target),
      ),
      selectedNodeIds: new Set(),
    });
  },

  toggleNodeSelection: (id: string, additive: boolean) => {
    set((state) => {
      if (additive) {
        const newSet = new Set(state.selectedNodeIds);
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
        return { selectedNodeIds: newSet };
      } else {
        return { selectedNodeIds: new Set([id]) };
      }
    });
  },

  selectNodes: (ids: string[]) => {
    set({ selectedNodeIds: new Set(ids) });
  },

  selectAllNodes: () => {
    const state = get();
    const visibleIds = state.getVisibleNodes().map((n) => n.id);
    set({ selectedNodeIds: new Set(visibleIds) });
  },

  clearSelection: () => {
    set({ selectedNodeIds: new Set() });
  },

  selectDependencies: (nodeId: string) => {
    const state = get();
    const dependencyIds = state.edges
      .filter((e) => e.source === nodeId)
      .map((e) => e.target);
    const newSelection = new Set([nodeId, ...dependencyIds]);
    set({ selectedNodeIds: newSelection });
  },

  expandDependency: (placeholderId: string, details: PackageDetails) => {
    const state = get();
    const placeholderNode = state.nodes.find((n) => n.id === placeholderId);

    if (!placeholderNode || !placeholderNode.data.isPlaceholder) {
      return;
    }

    // Create resolved node at same position
    const resolvedNode = createResolvedNode(details, placeholderNode.position);

    // Get dependencies
    const dependencies = flattenDependencies(details);
    const depPositions = calculateDependencyPositions(
      placeholderNode.position,
      dependencies.length,
    );

    const newNodes: GraphNode[] = [];
    const newEdges: GraphEdge[] = [];

    dependencies.forEach((dep, index) => {
      const depNodeId = createNodeId(dep.id);

      // Only add if doesn't exist
      if (
        !state.nodes.some((n) => n.id === depNodeId) &&
        !newNodes.some((n) => n.id === depNodeId)
      ) {
        newNodes.push(createPlaceholderNode(dep, depPositions[index]));
      }

      // Add edge from resolved node to dependency
      const edgeId = `${resolvedNode.id}->${depNodeId}`;
      if (
        !state.edges.some((e) => e.id === edgeId) &&
        !newEdges.some((e) => e.id === edgeId)
      ) {
        newEdges.push(createEdge(resolvedNode.id, depNodeId, dep.versionRange));
      }
    });

    // Update edges that pointed to placeholder to point to resolved node
    const updatedEdges = state.edges.map((e) => {
      if (e.target === placeholderId) {
        return { ...e, target: resolvedNode.id };
      }
      if (e.source === placeholderId) {
        return { ...e, source: resolvedNode.id };
      }
      return e;
    });

    set({
      nodes: [
        ...state.nodes.filter((n) => n.id !== placeholderId),
        resolvedNode,
        ...newNodes,
      ],
      edges: [...updatedEdges, ...newEdges],
    });
  },

  clearGraph: () => {
    set({
      nodes: [],
      edges: [],
      selectedNodeIds: new Set(),
      clusters: new Map(),
      clusterInfos: new Map(),
      hiddenNodeIds: new Set(),
      highlightFilter: "",
      highlightedPath: new Set(),
    });
  },

  updateNodePositions: (changes) => {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        const change = changes.find((c) => c.id === node.id);
        if (change) {
          return { ...node, position: change.position };
        }
        return node;
      }),
    }));
  },

  setHighlightFilter: (filter: string) => {
    set({ highlightFilter: filter.toLowerCase() });
  },

  setForceLayoutMode: (mode: ForceLayoutMode) => {
    set({ forceLayoutMode: mode });
  },

  setClusterStrategy: (strategy: ClusterStrategy) => {
    set({ clusterStrategy: strategy });
  },

  runForceLayout: (width: number, height: number) => {
    const state = get();
    const visibleNodes = state.getVisibleNodes();
    const visibleEdges = state.getVisibleEdges();

    if (visibleNodes.length === 0) return;

    // Compute clusters
    const clusters = computeClusters(
      visibleNodes,
      visibleEdges,
      state.clusterStrategy,
    );
    const clusterInfos = getClusterInfos(clusters);
    const clusterCenters = calculateClusterCenters(clusters, width, height);
    const nodeDepths = computeNodeDepths(visibleNodes, visibleEdges);

    // Find center node for radial mode (first root or first node)
    const rootNodes = visibleNodes.filter(
      (n) => !visibleEdges.some((e) => e.target === n.id),
    );
    const centerNodeId = rootNodes[0]?.id ?? visibleNodes[0]?.id;

    // Prepare simulation nodes
    const simNodes: SimNode[] = visibleNodes.map((n) => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      clusterId: clusters.get(n.id),
      depth: nodeDepths.get(n.id),
    }));

    // Prepare simulation links
    const simLinks: SimLink[] = visibleEdges.map((e) => ({
      source: e.source,
      target: e.target,
    }));

    // Create and run simulation
    const simulation = createSimulation(
      simNodes,
      simLinks,
      state.forceLayoutMode,
      {
        width,
        height,
        clusters,
        clusterCenters,
        nodeDepths,
        centerNodeId,
      },
    );

    // Run synchronously for immediate results
    runSimulationSync(simulation, 300);

    // Get final positions
    const positions = getNodePositions(simulation);
    stopSimulation(simulation);

    // Update nodes with new positions and cluster info
    const updatedNodes = state.nodes.map((node) => {
      const newPos = positions.get(node.id);
      const clusterId = clusters.get(node.id);
      const clusterInfo = clusterId ? clusterInfos.get(clusterId) : undefined;

      return {
        ...node,
        position: newPos ?? node.position,
        data: {
          ...node.data,
          clusterId,
          clusterColor: clusterInfo?.color,
        },
      };
    });

    set({
      nodes: updatedNodes,
      clusters,
      clusterInfos,
    });
  },

  computeLayout: (width: number, height: number) => {
    const state = get();
    const visibleNodes = state.getVisibleNodes();
    const visibleEdges = state.getVisibleEdges();

    if (visibleNodes.length === 0) return new Map();

    const clusters = computeClusters(
      visibleNodes,
      visibleEdges,
      state.clusterStrategy,
    );
    const clusterInfos = getClusterInfos(clusters);
    const clusterCenters = calculateClusterCenters(clusters, width, height);
    const nodeDepths = computeNodeDepths(visibleNodes, visibleEdges);

    const rootNodes = visibleNodes.filter(
      (n) => !visibleEdges.some((e) => e.target === n.id),
    );
    const centerNodeId = rootNodes[0]?.id ?? visibleNodes[0]?.id;

    const simNodes: SimNode[] = visibleNodes.map((n) => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      clusterId: clusters.get(n.id),
      depth: nodeDepths.get(n.id),
    }));

    const simLinks: SimLink[] = visibleEdges.map((e) => ({
      source: e.source,
      target: e.target,
    }));

    const simulation = createSimulation(
      simNodes,
      simLinks,
      state.forceLayoutMode,
      { width, height, clusters, clusterCenters, nodeDepths, centerNodeId },
    );

    runSimulationSync(simulation, 300);
    const positions = getNodePositions(simulation);
    stopSimulation(simulation);

    // Update only cluster info on nodes (not positions)
    const updatedNodes = state.nodes.map((node) => {
      const clusterId = clusters.get(node.id);
      const clusterInfo = clusterId ? clusterInfos.get(clusterId) : undefined;
      return {
        ...node,
        data: {
          ...node.data,
          clusterId,
          clusterColor: clusterInfo?.color,
        },
      };
    });

    set({ nodes: updatedNodes, clusters, clusterInfos });

    return positions;
  },

  applyFilter: () => {
    const state = get();
    const filter = state.highlightFilter.toLowerCase();

    if (!filter) return;

    const hiddenNodeIds = new Set<string>();

    for (const node of state.nodes) {
      const matches = node.data.packageId.toLowerCase().includes(filter);
      if (!matches) {
        hiddenNodeIds.add(node.id);
      }
    }

    // Update nodes with hidden state
    const updatedNodes = state.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        isHidden: hiddenNodeIds.has(node.id),
      },
    }));

    set({
      nodes: updatedNodes,
      hiddenNodeIds,
    });
  },

  resetFilter: () => {
    const state = get();

    // Clear hidden state from all nodes
    const updatedNodes = state.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        isHidden: false,
      },
    }));

    set({
      nodes: updatedNodes,
      hiddenNodeIds: new Set(),
      highlightFilter: "",
    });
  },

  getVisibleNodes: () => {
    const state = get();
    return state.nodes.filter((n) => !state.hiddenNodeIds.has(n.id));
  },

  getVisibleEdges: () => {
    const state = get();
    return state.edges.filter(
      (e) =>
        !state.hiddenNodeIds.has(e.source) &&
        !state.hiddenNodeIds.has(e.target),
    );
  },

  findPath: (nodeA: string, nodeB: string) => {
    const state = get();
    const edges = state.edges;

    // BFS from nodeA to nodeB (forward direction)
    const forwardPath = bfsPath(nodeA, nodeB, edges, "forward");
    if (forwardPath) {
      set({ highlightedPath: new Set(forwardPath) });
      return true;
    }

    // Try reverse direction
    const reversePath = bfsPath(nodeA, nodeB, edges, "reverse");
    if (reversePath) {
      set({ highlightedPath: new Set(reversePath) });
      return true;
    }

    return false;
  },

  clearPath: () => {
    set({ highlightedPath: new Set() });
  },

  exportToFile: () => {
    const state = get();
    const data = exportGraph(state.nodes, state.edges, state.forceLayoutMode);
    downloadGraphExport(data);
  },

  importFromFile: async (file: File) => {
    const data = await readGraphExportFile(file);
    if (!data) {
      return false;
    }
    get().importFromData(data);
    return true;
  },

  importFromData: (data: GraphExport) => {
    const nodes = importNodes(data);
    const edges = importEdges(data);
    set({
      nodes,
      edges,
      forceLayoutMode: data.layoutMode,
      selectedNodeIds: new Set(),
      hiddenNodeIds: new Set(),
      highlightedPath: new Set(),
      highlightFilter: "",
    });
  },
}));

/** BFS pathfinding helper */
function bfsPath(
  start: string,
  end: string,
  edges: GraphEdge[],
  direction: "forward" | "reverse",
): string[] | null {
  const visited = new Set<string>();
  const queue: { node: string; path: string[] }[] = [{ node: start, path: [] }];

  while (queue.length > 0) {
    const { node, path } = queue.shift()!;

    if (node === end) {
      return path;
    }

    if (visited.has(node)) continue;
    visited.add(node);

    // Get adjacent edges
    const adjacentEdges =
      direction === "forward"
        ? edges.filter((e) => e.source === node)
        : edges.filter((e) => e.target === node);

    for (const edge of adjacentEdges) {
      const nextNode = direction === "forward" ? edge.target : edge.source;
      if (!visited.has(nextNode)) {
        queue.push({ node: nextNode, path: [...path, edge.id] });
      }
    }
  }

  return null;
}

/** Hook to get the selected nodes */
export function useSelectedNodes(): GraphNode[] {
  const nodes = useGraphStore((s) => s.nodes);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  return nodes.filter((n) => selectedNodeIds.has(n.id));
}

/** Hook to get single selected node (for backward compatibility) */
export function useSelectedNode(): GraphNode | null {
  const selectedNodes = useSelectedNodes();
  return selectedNodes.length === 1 ? selectedNodes[0] : null;
}
