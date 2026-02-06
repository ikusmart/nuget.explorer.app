import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type OnNodesChange,
  type OnEdgesChange,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { PackageNode } from "./PackageNode";
import { NodeContextMenu } from "./NodeContextMenu";
import {
  useGraphStore,
  type GraphNode,
  type GraphEdge,
} from "@/stores/graph-store";
import { getPackageDetails, getPackageVersions } from "@/services/nuget-api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Play, Filter, X, Download, Upload } from "lucide-react";
import { getLayoutModes, type ForceLayoutMode } from "@/lib/force-simulation";

const nodeTypes = {
  packageNode: PackageNode,
};

const layoutModes = getLayoutModes();

function DependencyGraphInner() {
  const { toast } = useToast();
  const { fitView } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  const [contextMenuNode, setContextMenuNode] = useState<GraphNode | null>(
    null,
  );

  const storeNodes = useGraphStore((s) => s.nodes);
  const storeEdges = useGraphStore((s) => s.edges);
  const toggleNodeSelection = useGraphStore((s) => s.toggleNodeSelection);
  const clearSelection = useGraphStore((s) => s.clearSelection);
  const expandDependency = useGraphStore((s) => s.expandDependency);
  const updateNodePositions = useGraphStore((s) => s.updateNodePositions);
  const highlightFilter = useGraphStore((s) => s.highlightFilter);
  const setHighlightFilter = useGraphStore((s) => s.setHighlightFilter);
  const hiddenNodeIds = useGraphStore((s) => s.hiddenNodeIds);
  const highlightedPath = useGraphStore((s) => s.highlightedPath);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const exportToFile = useGraphStore((s) => s.exportToFile);
  const importFromFile = useGraphStore((s) => s.importFromFile);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // D3 force layout state
  const forceLayoutMode = useGraphStore((s) => s.forceLayoutMode);
  const setForceLayoutMode = useGraphStore((s) => s.setForceLayoutMode);
  const runForceLayout = useGraphStore((s) => s.runForceLayout);
  const applyFilter = useGraphStore((s) => s.applyFilter);
  const resetFilter = useGraphStore((s) => s.resetFilter);
  const getVisibleNodes = useGraphStore((s) => s.getVisibleNodes);
  const getVisibleEdges = useGraphStore((s) => s.getVisibleEdges);

  const [nodes, setNodes, onNodesChangeInternal] = useNodesState<GraphNode>([]);
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState<GraphEdge>([]);

  // Sync with store when store changes, filtering hidden nodes
  useEffect(() => {
    const visibleNodes = getVisibleNodes();
    const visibleEdges = getVisibleEdges();

    // Mark selected nodes
    const nodesWithSelection = visibleNodes.map((n) => ({
      ...n,
      selected: selectedNodeIds.has(n.id),
    }));

    // Style edges based on highlighted path
    const edgesWithStyle = visibleEdges.map((e) => {
      const isOnPath = highlightedPath.has(e.id);
      const hasPath = highlightedPath.size > 0;
      return {
        ...e,
        style: hasPath
          ? isOnPath
            ? { stroke: "#f97316", strokeWidth: 3 }
            : { opacity: 0.3 }
          : undefined,
      };
    });

    setNodes(nodesWithSelection);
    setEdges(edgesWithStyle);

    // Fit view after nodes are updated
    if (visibleNodes.length > 0) {
      setTimeout(() => {
        fitView({ padding: 0.2 });
      }, 50);
    }
  }, [
    storeNodes,
    storeEdges,
    hiddenNodeIds,
    selectedNodeIds,
    highlightedPath,
    setNodes,
    setEdges,
    fitView,
    getVisibleNodes,
    getVisibleEdges,
  ]);

  const onNodesChange: OnNodesChange<GraphNode> = useCallback(
    (changes) => {
      onNodesChangeInternal(changes);

      // Update store with position changes
      const positionChanges = changes
        .filter(
          (
            c,
          ): c is {
            type: "position";
            id: string;
            position: { x: number; y: number };
          } =>
            c.type === "position" &&
            "position" in c &&
            c.position !== undefined,
        )
        .map((c) => ({
          id: c.id,
          position: c.position,
        }));

      if (positionChanges.length > 0) {
        updateNodePositions(positionChanges);
      }
    },
    [onNodesChangeInternal, updateNodePositions],
  );

  const onEdgesChange: OnEdgesChange<GraphEdge> = useCallback(
    (changes) => {
      onEdgesChangeInternal(changes);
    },
    [onEdgesChangeInternal],
  );

  const onNodeClick: NodeMouseHandler<GraphNode> = useCallback(
    (event, node) => {
      const additive = event.ctrlKey || event.metaKey;
      toggleNodeSelection(node.id, additive);
    },
    [toggleNodeSelection],
  );

  const onNodeDoubleClick: NodeMouseHandler<GraphNode> = useCallback(
    async (_event, node) => {
      // Only expand placeholder nodes
      if (!node.data.isPlaceholder) return;

      const packageId = node.data.packageId;

      try {
        // Get latest version
        const versions = await getPackageVersions(packageId);
        if (versions.length === 0) {
          toast({
            title: "No versions found",
            description: `Could not find versions for ${packageId}`,
            variant: "destructive",
          });
          return;
        }

        const latestVersion = versions[0];
        const details = await getPackageDetails(packageId, latestVersion);

        expandDependency(node.id, details);

        toast({
          title: "Package expanded",
          description: `${packageId} v${latestVersion}`,
        });
      } catch (error) {
        toast({
          title: "Failed to expand package",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    },
    [expandDependency, toast],
  );

  const onPaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const onNodeContextMenu: NodeMouseHandler<GraphNode> = useCallback(
    (event, node) => {
      event.preventDefault();
      setContextMenuNode(node);
    },
    [],
  );

  const handleRunLayout = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    runForceLayout(rect.width, rect.height);

    setTimeout(() => {
      fitView({ padding: 0.2 });
    }, 50);
  }, [runForceLayout, fitView]);

  const handleApplyFilter = useCallback(() => {
    applyFilter();
    // Run layout after hiding nodes
    setTimeout(() => {
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        runForceLayout(rect.width, rect.height);
        setTimeout(() => {
          fitView({ padding: 0.2 });
        }, 50);
      }
    }, 50);
  }, [applyFilter, runForceLayout, fitView]);

  const handleResetFilter = useCallback(() => {
    resetFilter();
  }, [resetFilter]);

  const handleModeChange = useCallback(
    (value: string) => {
      setForceLayoutMode(value as ForceLayoutMode);
    },
    [setForceLayoutMode],
  );

  const handleExport = useCallback(() => {
    exportToFile();
    toast({
      title: "Graph exported",
      description: "Graph saved to file",
    });
  }, [exportToFile, toast]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const success = await importFromFile(file);
      if (success) {
        toast({
          title: "Graph imported",
          description: `Loaded ${file.name}`,
        });
        setTimeout(() => {
          fitView({ padding: 0.2 });
        }, 50);
      } else {
        toast({
          title: "Import failed",
          description: "Invalid file format",
          variant: "destructive",
        });
      }

      // Reset input
      event.target.value = "";
    },
    [importFromFile, toast, fitView],
  );

  const visibleNodeCount = nodes.length;
  const totalNodeCount = storeNodes.length;
  const hasHiddenNodes = hiddenNodeIds.size > 0;

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {/* Toolbar */}
      <div className="absolute top-2 left-2 z-10 flex gap-2 items-center flex-wrap">
        {/* Filter input */}
        <Input
          placeholder="Filter nodes..."
          value={highlightFilter}
          onChange={(e) => setHighlightFilter(e.target.value)}
          className="w-40 h-8 bg-background"
        />

        {/* Apply/Reset filter buttons */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleApplyFilter}
          disabled={!highlightFilter || nodes.length === 0}
          className="h-8"
          title="Hide non-matching nodes"
        >
          <Filter className="h-4 w-4 mr-1" />
          Apply
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleResetFilter}
          disabled={!hasHiddenNodes}
          className="h-8"
          title="Show all nodes"
        >
          <X className="h-4 w-4 mr-1" />
          Reset
        </Button>

        {/* Layout mode selector */}
        <Select value={forceLayoutMode} onValueChange={handleModeChange}>
          <SelectTrigger className="w-32 h-8 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {layoutModes.map((mode) => (
              <SelectItem key={mode.mode} value={mode.mode}>
                {mode.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Run layout button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleRunLayout}
          disabled={nodes.length === 0}
          className="h-8"
          title="Run force layout"
        >
          <Play className="h-4 w-4 mr-1" />
          Layout
        </Button>

        {/* Export/Import */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={nodes.length === 0}
          className="h-8"
          title="Export graph to file"
        >
          <Download className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleImportClick}
          className="h-8"
          title="Import graph from file"
        >
          <Upload className="h-4 w-4" />
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Node count indicator */}
        {hasHiddenNodes && (
          <span className="text-xs text-muted-foreground">
            {visibleNodeCount}/{totalNodeCount} nodes
          </span>
        )}
      </div>

      <NodeContextMenu
        node={contextMenuNode}
        onOpenChange={(open) => !open && setContextMenuNode(null)}
      >
        <div className="w-full h-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeContextMenu={onNodeContextMenu}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.1}
            maxZoom={2}
            defaultEdgeOptions={{
              type: "smoothstep",
              animated: false,
            }}
          >
            <Controls />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          </ReactFlow>
        </div>
      </NodeContextMenu>
    </div>
  );
}

export function DependencyGraph() {
  return (
    <ReactFlowProvider>
      <DependencyGraphInner />
    </ReactFlowProvider>
  );
}
