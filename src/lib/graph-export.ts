import { z } from "zod";
import type {
  GraphNode,
  GraphEdge,
  PackageNodeData,
} from "@/stores/graph-store";
import type { ForceLayoutMode } from "@/lib/force-simulation";

/** Schema version for future compatibility */
const SCHEMA_VERSION = 1;

/** Export format schema */
const PackageNodeDataSchema = z.object({
  packageId: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),
  iconUrl: z.string().optional(),
  projectUrl: z.string().optional(),
  licenseUrl: z.string().optional(),
  authors: z.array(z.string()).optional(),
  dependencyGroups: z.array(z.any()).optional(),
  isPlaceholder: z.boolean(),
  clusterId: z.string().optional(),
  clusterColor: z.string().optional(),
});

const NodeSchema = z.object({
  id: z.string(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: PackageNodeDataSchema,
});

const EdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
});

const GraphExportSchema = z.object({
  version: z.number(),
  exportedAt: z.string(),
  layoutMode: z.enum(["force", "cluster", "hierarchy", "radial"]),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export type GraphExport = z.infer<typeof GraphExportSchema>;

/** Export graph state to JSON object */
export function exportGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  layoutMode: ForceLayoutMode,
): GraphExport {
  return {
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    layoutMode,
    nodes: nodes.map((n) => ({
      id: n.id,
      position: n.position,
      data: {
        packageId: n.data.packageId,
        version: n.data.version,
        description: n.data.description,
        iconUrl: n.data.iconUrl,
        projectUrl: n.data.projectUrl,
        licenseUrl: n.data.licenseUrl,
        authors: n.data.authors,
        dependencyGroups: n.data.dependencyGroups,
        isPlaceholder: n.data.isPlaceholder,
        clusterId: n.data.clusterId,
        clusterColor: n.data.clusterColor,
      },
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === "string" ? e.label : undefined,
    })),
  };
}

/** Validate and parse imported JSON */
export function parseGraphExport(json: unknown): GraphExport | null {
  const result = GraphExportSchema.safeParse(json);
  if (result.success) {
    return result.data;
  }
  console.error("Invalid graph export format:", result.error);
  return null;
}

/** Convert export data back to graph nodes */
export function importNodes(data: GraphExport): GraphNode[] {
  return data.nodes.map((n) => ({
    id: n.id,
    type: "packageNode",
    position: n.position,
    data: n.data as PackageNodeData,
  }));
}

/** Convert export data back to graph edges */
export function importEdges(data: GraphExport): GraphEdge[] {
  return data.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: false,
  }));
}

/** Download graph as JSON file */
export function downloadGraphExport(data: GraphExport): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `nuget-graph-${timestamp}.json`;

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Read file and parse as graph export */
export async function readGraphExportFile(
  file: File,
): Promise<GraphExport | null> {
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    return parseGraphExport(json);
  } catch (error) {
    console.error("Failed to read file:", error);
    return null;
  }
}
