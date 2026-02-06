import type { GraphNode, GraphEdge } from "@/stores/graph-store";

/** Available clustering strategies */
export type ClusterStrategy = "namespace" | "root-package" | "depth";

/** Cluster info with color */
export interface ClusterInfo {
  id: string;
  color: string;
  nodeCount: number;
}

/** Predefined color palette for clusters */
const CLUSTER_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#f97316", // orange
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#a855f7", // purple
];

/** Get color for a cluster by index */
export function getClusterColor(index: number): string {
  return CLUSTER_COLORS[index % CLUSTER_COLORS.length];
}

/** Compute clusters based on strategy */
export function computeClusters(
  nodes: GraphNode[],
  edges: GraphEdge[],
  strategy: ClusterStrategy
): Map<string, string> {
  switch (strategy) {
    case "namespace":
      return computeNamespaceClusters(nodes);
    case "root-package":
      return computeRootPackageClusters(nodes, edges);
    case "depth":
      return computeDepthClusters(nodes, edges);
    default:
      return computeNamespaceClusters(nodes);
  }
}

/** Cluster by namespace prefix (e.g., Microsoft.Extensions.* -> Microsoft.Extensions) */
function computeNamespaceClusters(nodes: GraphNode[]): Map<string, string> {
  const clusters = new Map<string, string>();

  for (const node of nodes) {
    const packageId = node.data.packageId;
    const clusterId = extractNamespace(packageId);
    clusters.set(node.id, clusterId);
  }

  return clusters;
}

/** Extract namespace prefix from package ID */
function extractNamespace(packageId: string): string {
  const parts = packageId.split(".");

  // For short names, use the first part
  if (parts.length <= 2) {
    return parts[0];
  }

  // For longer names, use first two parts
  // e.g., Microsoft.Extensions.Logging -> Microsoft.Extensions
  return `${parts[0]}.${parts[1]}`;
}

/** Cluster by root package (all deps of a package share cluster) */
function computeRootPackageClusters(
  nodes: GraphNode[],
  edges: GraphEdge[]
): Map<string, string> {
  const clusters = new Map<string, string>();

  // Build adjacency for finding roots
  const incomingEdges = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = incomingEdges.get(edge.target) || [];
    targets.push(edge.source);
    incomingEdges.set(edge.target, targets);
  }

  // Find root nodes (no incoming edges)
  const rootNodes = nodes.filter((n) => !incomingEdges.has(n.id));

  // If no roots found, use all non-placeholder nodes as potential roots
  const effectiveRoots =
    rootNodes.length > 0
      ? rootNodes
      : nodes.filter((n) => !n.data.isPlaceholder);

  // Assign each root its own cluster
  for (const root of effectiveRoots) {
    clusters.set(root.id, root.id);
  }

  // BFS to assign clusters to descendants
  const outgoingEdges = new Map<string, string[]>();
  for (const edge of edges) {
    const sources = outgoingEdges.get(edge.source) || [];
    sources.push(edge.target);
    outgoingEdges.set(edge.source, sources);
  }

  for (const root of effectiveRoots) {
    const queue = [root.id];
    const visited = new Set<string>([root.id]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = outgoingEdges.get(current) || [];

      for (const child of children) {
        if (!visited.has(child)) {
          visited.add(child);
          // Only assign if not already assigned to a different cluster
          if (!clusters.has(child)) {
            clusters.set(child, root.id);
          }
          queue.push(child);
        }
      }
    }
  }

  // Assign remaining nodes to "unknown" cluster
  for (const node of nodes) {
    if (!clusters.has(node.id)) {
      clusters.set(node.id, "unknown");
    }
  }

  return clusters;
}

/** Cluster by depth from root nodes */
function computeDepthClusters(
  nodes: GraphNode[],
  edges: GraphEdge[]
): Map<string, string> {
  const depths = computeNodeDepths(nodes, edges);
  const clusters = new Map<string, string>();

  for (const [nodeId, depth] of depths) {
    clusters.set(nodeId, `depth-${depth}`);
  }

  return clusters;
}

/** Compute depth of each node from roots */
export function computeNodeDepths(
  nodes: GraphNode[],
  edges: GraphEdge[]
): Map<string, number> {
  const depths = new Map<string, number>();

  // Build adjacency
  const incomingEdges = new Map<string, string[]>();
  const outgoingEdges = new Map<string, string[]>();

  for (const edge of edges) {
    const incoming = incomingEdges.get(edge.target) || [];
    incoming.push(edge.source);
    incomingEdges.set(edge.target, incoming);

    const outgoing = outgoingEdges.get(edge.source) || [];
    outgoing.push(edge.target);
    outgoingEdges.set(edge.source, outgoing);
  }

  // Find roots (no incoming edges)
  const roots = nodes.filter((n) => !incomingEdges.has(n.id));

  // BFS from roots
  const queue: { id: string; depth: number }[] = roots.map((r) => ({
    id: r.id,
    depth: 0,
  }));
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;

    if (visited.has(id)) continue;
    visited.add(id);
    depths.set(id, depth);

    const children = outgoingEdges.get(id) || [];
    for (const child of children) {
      if (!visited.has(child)) {
        queue.push({ id: child, depth: depth + 1 });
      }
    }
  }

  // Assign remaining nodes (disconnected) to depth 0
  for (const node of nodes) {
    if (!depths.has(node.id)) {
      depths.set(node.id, 0);
    }
  }

  return depths;
}

/** Get all unique clusters with their info */
export function getClusterInfos(
  clusters: Map<string, string>
): Map<string, ClusterInfo> {
  const clusterCounts = new Map<string, number>();

  // Count nodes per cluster
  for (const clusterId of clusters.values()) {
    clusterCounts.set(clusterId, (clusterCounts.get(clusterId) || 0) + 1);
  }

  // Build cluster info
  const infos = new Map<string, ClusterInfo>();
  let index = 0;

  for (const [clusterId, count] of clusterCounts) {
    infos.set(clusterId, {
      id: clusterId,
      color: getClusterColor(index),
      nodeCount: count,
    });
    index++;
  }

  return infos;
}

/** Calculate cluster centers for layout */
export function calculateClusterCenters(
  clusters: Map<string, string>,
  width: number,
  height: number
): Map<string, { x: number; y: number }> {
  // Get unique cluster IDs
  const uniqueClusters = new Set(clusters.values());
  const clusterArray = Array.from(uniqueClusters);
  const count = clusterArray.length;

  const centers = new Map<string, { x: number; y: number }>();
  const centerX = width / 2;
  const centerY = height / 2;

  if (count === 1) {
    centers.set(clusterArray[0], { x: centerX, y: centerY });
    return centers;
  }

  // Arrange clusters in a circle
  const radius = Math.min(width, height) * 0.3;

  clusterArray.forEach((clusterId, i) => {
    const angle = (i * 2 * Math.PI) / count - Math.PI / 2;
    centers.set(clusterId, {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  });

  return centers;
}
