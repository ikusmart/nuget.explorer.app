import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  forceRadial,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";

/** Available force layout modes */
export type ForceLayoutMode = "force" | "cluster" | "hierarchy" | "radial";

/** Node data for simulation */
export interface SimNode extends SimulationNodeDatum {
  id: string;
  clusterId?: string;
  depth?: number;
}

/** Link data for simulation */
export interface SimLink extends SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
}

/** Simulation options */
export interface SimulationOptions {
  width: number;
  height: number;
  clusters?: Map<string, string>; // nodeId -> clusterId
  clusterCenters?: Map<string, { x: number; y: number }>;
  nodeDepths?: Map<string, number>; // nodeId -> depth (for hierarchy)
  centerNodeId?: string; // for radial mode
}

/** Layout mode configurations */
const MODE_CONFIGS: Record<
  ForceLayoutMode,
  {
    name: string;
    description: string;
  }
> = {
  force: {
    name: "Force",
    description: "Classic force-directed with repulsion",
  },
  cluster: {
    name: "Cluster",
    description: "Nodes attract to cluster centers",
  },
  hierarchy: {
    name: "Hierarchy",
    description: "Dependencies flow downward",
  },
  radial: {
    name: "Radial",
    description: "Radiate from center node",
  },
};

export function getLayoutModes(): {
  mode: ForceLayoutMode;
  name: string;
  description: string;
}[] {
  return Object.entries(MODE_CONFIGS).map(([mode, config]) => ({
    mode: mode as ForceLayoutMode,
    ...config,
  }));
}

/** Create a force simulation with the specified mode */
export function createSimulation(
  nodes: SimNode[],
  links: SimLink[],
  mode: ForceLayoutMode,
  options: SimulationOptions,
): Simulation<SimNode, SimLink> {
  const { width, height } = options;
  const centerX = width / 2;
  const centerY = height / 2;

  // Clone nodes to avoid mutating originals
  const simNodes: SimNode[] = nodes.map((n) => ({
    ...n,
    x: n.x ?? centerX + (Math.random() - 0.5) * 100,
    y: n.y ?? centerY + (Math.random() - 0.5) * 100,
  }));

  // Clone links with string IDs
  const simLinks: SimLink[] = links.map((l) => ({
    source: typeof l.source === "string" ? l.source : l.source.id,
    target: typeof l.target === "string" ? l.target : l.target.id,
  }));

  const simulation = forceSimulation<SimNode>(simNodes);

  // Base link force (all modes use this)
  simulation.force(
    "link",
    forceLink<SimNode, SimLink>(simLinks)
      .id((d) => d.id)
      .distance(180)
      .strength(0.3),
  );

  // Collision force (all modes) - node is ~200x60, so use ~110 radius
  simulation.force(
    "collide",
    forceCollide<SimNode>(110).strength(1).iterations(3),
  );

  switch (mode) {
    case "force":
      configureForceMode(simulation, centerX, centerY);
      break;
    case "cluster":
      configureClusterMode(simulation, options, centerX, centerY);
      break;
    case "hierarchy":
      configureHierarchyMode(simulation, options, centerX, centerY, height);
      break;
    case "radial":
      configureRadialMode(simulation, options, centerX, centerY);
      break;
  }

  // Set initial alpha for animation
  simulation.alpha(1).alphaDecay(0.02);

  return simulation;
}

/** Classic force-directed layout */
function configureForceMode(
  simulation: Simulation<SimNode, SimLink>,
  centerX: number,
  centerY: number,
): void {
  simulation
    .force("charge", forceManyBody<SimNode>().strength(-800).distanceMax(800))
    .force("center", forceCenter(centerX, centerY));
}

/** Cluster-focused layout - nodes attract to cluster centers */
function configureClusterMode(
  simulation: Simulation<SimNode, SimLink>,
  options: SimulationOptions,
  centerX: number,
  centerY: number,
): void {
  const { clusters, clusterCenters } = options;

  // Strong charge to push nodes apart within clusters
  simulation.force(
    "charge",
    forceManyBody<SimNode>().strength(-600).distanceMax(600),
  );

  if (clusters && clusterCenters && clusterCenters.size > 0) {
    // Attract to cluster centers
    simulation
      .force(
        "x",
        forceX<SimNode>((d) => {
          const clusterId = clusters.get(d.id);
          if (clusterId) {
            const center = clusterCenters.get(clusterId);
            if (center) return center.x;
          }
          return centerX;
        }).strength(0.3),
      )
      .force(
        "y",
        forceY<SimNode>((d) => {
          const clusterId = clusters.get(d.id);
          if (clusterId) {
            const center = clusterCenters.get(clusterId);
            if (center) return center.y;
          }
          return centerY;
        }).strength(0.3),
      );
  } else {
    // Fallback to center if no clusters
    simulation.force("center", forceCenter(centerX, centerY));
  }
}

/** Hierarchical layout - dependencies flow downward */
function configureHierarchyMode(
  simulation: Simulation<SimNode, SimLink>,
  options: SimulationOptions,
  centerX: number,
  _centerY: number,
  height: number,
): void {
  const { nodeDepths } = options;
  const maxDepth = nodeDepths
    ? Math.max(...Array.from(nodeDepths.values()), 1)
    : 1;
  const levelHeight = Math.max(150, height / (maxDepth + 2));

  // Strong horizontal repulsion for hierarchy
  simulation.force(
    "charge",
    forceManyBody<SimNode>().strength(-500).distanceMax(500),
  );

  // Center horizontally
  simulation.force("x", forceX<SimNode>(centerX).strength(0.1));

  // Position by depth vertically
  simulation.force(
    "y",
    forceY<SimNode>((d) => {
      const depth = nodeDepths?.get(d.id) ?? 0;
      return 100 + depth * levelHeight;
    }).strength(0.8),
  );
}

/** Radial layout - nodes radiate from center */
function configureRadialMode(
  simulation: Simulation<SimNode, SimLink>,
  options: SimulationOptions,
  centerX: number,
  centerY: number,
): void {
  const { nodeDepths, centerNodeId } = options;

  // Strong charge to spread nodes on each ring
  simulation.force(
    "charge",
    forceManyBody<SimNode>().strength(-400).distanceMax(400),
  );

  // Radial force based on depth
  simulation.force(
    "radial",
    forceRadial<SimNode>(
      (d) => {
        if (d.id === centerNodeId) return 0;
        const depth = nodeDepths?.get(d.id) ?? 1;
        return depth * 200;
      },
      centerX,
      centerY,
    ).strength(0.8),
  );
}

/** Stop and cleanup simulation */
export function stopSimulation(
  simulation: Simulation<SimNode, SimLink> | null,
): void {
  if (simulation) {
    simulation.stop();
  }
}

/** Get current node positions from simulation */
export function getNodePositions(
  simulation: Simulation<SimNode, SimLink>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  simulation.nodes().forEach((node) => {
    if (node.x !== undefined && node.y !== undefined) {
      positions.set(node.id, { x: node.x, y: node.y });
    }
  });
  return positions;
}

/** Run simulation to completion synchronously (for instant layout) */
export function runSimulationSync(
  simulation: Simulation<SimNode, SimLink>,
  iterations: number = 500,
): void {
  simulation.stop();
  for (let i = 0; i < iterations; i++) {
    simulation.tick();
  }
}
