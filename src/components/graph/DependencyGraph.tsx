import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
  Play,
  Filter,
  X,
  Download,
  Upload,
  Maximize2,
  Search,
  Tag,
  Expand,
  Loader2,
  Trash2,
} from "lucide-react";
import { getLayoutModes, type ForceLayoutMode } from "@/lib/force-simulation";

const nodeTypes = {
  packageNode: PackageNode,
};

const layoutModes = getLayoutModes();

function DependencyGraphInner() {
  const { toast } = useToast();
  const { fitView, setCenter, zoomIn, zoomOut } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  const [contextMenuNode, setContextMenuNode] = useState<GraphNode | null>(
    null,
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showEdgeLabels, setShowEdgeLabels] = useState(false);
  const [expandProgress, setExpandProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const animationRef = useRef<number | null>(null);

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
  const selectAllNodes = useGraphStore((s) => s.selectAllNodes);
  const removeSelectedNodes = useGraphStore((s) => s.removeSelectedNodes);
  const clearPath = useGraphStore((s) => s.clearPath);
  const exportToFile = useGraphStore((s) => s.exportToFile);
  const importFromFile = useGraphStore((s) => s.importFromFile);
  const clearGraph = useGraphStore((s) => s.clearGraph);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // D3 force layout state
  const forceLayoutMode = useGraphStore((s) => s.forceLayoutMode);
  const setForceLayoutMode = useGraphStore((s) => s.setForceLayoutMode);
  const runForceLayout = useGraphStore((s) => s.runForceLayout);
  const computeLayout = useGraphStore((s) => s.computeLayout);
  const applyFilter = useGraphStore((s) => s.applyFilter);
  const resetFilter = useGraphStore((s) => s.resetFilter);
  const getVisibleNodes = useGraphStore((s) => s.getVisibleNodes);
  const getVisibleEdges = useGraphStore((s) => s.getVisibleEdges);

  const clusterInfos = useGraphStore((s) => s.clusterInfos);

  const [nodes, setNodes, onNodesChangeInternal] = useNodesState<GraphNode>([]);
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState<GraphEdge>([]);

  // Stats
  const stats = useMemo(() => {
    const resolved = storeNodes.filter((n) => !n.data.isPlaceholder).length;
    const placeholder = storeNodes.filter((n) => n.data.isPlaceholder).length;
    return {
      totalNodes: storeNodes.length,
      totalEdges: storeEdges.length,
      resolved,
      placeholder,
      clusters: clusterInfos.size,
    };
  }, [storeNodes, storeEdges, clusterInfos]);

  // Search-in-graph filtered results
  const searchResults = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    return storeNodes
      .filter((n) => n.data.packageId.toLowerCase().includes(q))
      .slice(0, 20);
  }, [storeNodes, searchQuery]);

  // Sync with store when store changes, filtering hidden nodes
  useEffect(() => {
    const visibleNodes = getVisibleNodes();
    const visibleEdges = getVisibleEdges();

    // Mark selected nodes
    const nodesWithSelection = visibleNodes.map((n) => ({
      ...n,
      selected: selectedNodeIds.has(n.id),
    }));

    // Style edges based on highlighted path and label visibility
    const edgesWithStyle = visibleEdges.map((e) => {
      const isOnPath = highlightedPath.has(e.id);
      const hasPath = highlightedPath.size > 0;
      return {
        ...e,
        label: showEdgeLabels ? e.label : undefined,
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
    showEdgeLabels,
    setNodes,
    setEdges,
    fitView,
    getVisibleNodes,
    getVisibleEdges,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Delete / Backspace — remove selected nodes
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeIds.size > 0) {
          e.preventDefault();
          removeSelectedNodes();
        }
      }

      // Ctrl+A — select all visible nodes
      if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        selectAllNodes();
      }

      // Escape — deselect + clear path
      if (e.key === "Escape") {
        clearSelection();
        clearPath();
        setSearchOpen(false);
      }

      // + / = — zoom in
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomIn();
      }

      // - — zoom out
      if (e.key === "-") {
        e.preventDefault();
        zoomOut();
      }

      // Ctrl+S — export graph
      if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        exportToFile();
        toast({
          title: "Graph exported",
          description: "Graph saved to file",
        });
      }

      // Ctrl+F — search in graph
      if (e.key === "f" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedNodeIds,
    removeSelectedNodes,
    selectAllNodes,
    clearSelection,
    clearPath,
    zoomIn,
    zoomOut,
    exportToFile,
    toast,
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

    // Cancel any running animation
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    const rect = container.getBoundingClientRect();

    // For large graphs (>200 nodes), use instant layout
    if (storeNodes.length > 200) {
      runForceLayout(rect.width, rect.height);
      setTimeout(() => fitView({ padding: 0.2 }), 50);
      return;
    }

    // Compute target positions without applying them
    const targetPositions = computeLayout(rect.width, rect.height);
    if (targetPositions.size === 0) return;

    // Capture start positions from current nodes
    const startPositions = new Map(
      nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }]),
    );

    const startTime = performance.now();
    const duration = 500;

    const animate = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic

      const interpolated = nodes.map((n) => {
        const start = startPositions.get(n.id);
        const target = targetPositions.get(n.id);
        if (!start || !target) return n;
        return {
          ...n,
          position: {
            x: start.x + (target.x - start.x) * eased,
            y: start.y + (target.y - start.y) * eased,
          },
        };
      });

      setNodes(interpolated);

      if (t < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        animationRef.current = null;
        // Commit final positions to store
        updateNodePositions(
          interpolated.map((n) => ({ id: n.id, position: n.position })),
        );
        setTimeout(() => fitView({ padding: 0.2 }), 50);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [
    storeNodes.length,
    nodes,
    runForceLayout,
    computeLayout,
    updateNodePositions,
    setNodes,
    fitView,
  ]);

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

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 300 });
  }, [fitView]);

  const handleGoToNode = useCallback(
    (node: GraphNode) => {
      setCenter(node.position.x, node.position.y, {
        zoom: 1.5,
        duration: 800,
      });
      toggleNodeSelection(node.id, false);
      setSearchOpen(false);
      setSearchQuery("");
    },
    [setCenter, toggleNodeSelection],
  );

  const handleExpandAll = useCallback(async () => {
    const placeholders = storeNodes.filter((n) => n.data.isPlaceholder);
    if (placeholders.length === 0) return;

    setExpandProgress({ current: 0, total: placeholders.length });

    for (let i = 0; i < placeholders.length; i++) {
      const node = placeholders[i];
      try {
        const versions = await getPackageVersions(node.data.packageId);
        if (versions.length > 0) {
          const details = await getPackageDetails(
            node.data.packageId,
            versions[0],
          );
          expandDependency(node.id, details);
        }
      } catch {
        // Skip failed expansions
      }
      setExpandProgress({ current: i + 1, total: placeholders.length });
    }

    setExpandProgress(null);
    toast({
      title: "Expand complete",
      description: `Expanded ${placeholders.length} packages`,
    });
  }, [storeNodes, expandDependency, toast]);

  const placeholderCount = storeNodes.filter(
    (n) => n.data.isPlaceholder,
  ).length;

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

        {/* Expand All */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleExpandAll}
          disabled={placeholderCount === 0 || expandProgress !== null}
          className="h-8"
          title="Expand all placeholder nodes"
        >
          {expandProgress ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              {expandProgress.current}/{expandProgress.total}
            </>
          ) : (
            <>
              <Expand className="h-4 w-4 mr-1" />
              Expand All
            </>
          )}
        </Button>

        {/* Edge Labels Toggle */}
        <Button
          variant={showEdgeLabels ? "default" : "outline"}
          size="sm"
          onClick={() => setShowEdgeLabels((prev) => !prev)}
          disabled={edges.length === 0}
          className="h-8"
          title="Toggle version ranges on edges"
        >
          <Tag className="h-4 w-4" />
        </Button>

        {/* Fit View */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleFitView}
          disabled={nodes.length === 0}
          className="h-8"
          title="Fit all nodes in view"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>

        {/* Search-in-Graph */}
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={storeNodes.length === 0}
              className="h-8"
              title="Find node in graph (Ctrl+F)"
            >
              <Search className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <Input
              placeholder="Go to node..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 mb-2"
              autoFocus
            />
            {searchResults.length > 0 && (
              <ScrollArea className="max-h-48">
                <div className="space-y-1">
                  {searchResults.map((node) => (
                    <button
                      key={node.id}
                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-accent truncate"
                      onClick={() => handleGoToNode(node)}
                    >
                      <span className="font-medium">{node.data.packageId}</span>
                      {node.data.version && (
                        <span className="text-muted-foreground ml-1">
                          v{node.data.version}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
            {searchQuery && searchResults.length === 0 && (
              <p className="text-xs text-muted-foreground px-2 py-1">
                No nodes found
              </p>
            )}
          </PopoverContent>
        </Popover>

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

        {/* Clear All */}
        <Button
          variant="outline"
          size="sm"
          onClick={clearGraph}
          disabled={storeNodes.length === 0}
          className="h-8 text-destructive hover:text-destructive"
          title="Remove all nodes from graph"
        >
          <Trash2 className="h-4 w-4" />
        </Button>

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
            <MiniMap
              nodeColor={(node) => {
                const data = node.data as Record<string, unknown>;
                return (data?.clusterColor as string) ?? "#94a3b8";
              }}
              maskColor="rgba(0,0,0,0.1)"
              pannable
              zoomable
            />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          </ReactFlow>
        </div>
      </NodeContextMenu>

      {/* Stats Overlay */}
      {stats.totalNodes > 0 && (
        <div className="absolute bottom-2 left-2 z-10 bg-background/80 backdrop-blur-sm border rounded-md px-3 py-2 text-xs text-muted-foreground space-y-0.5">
          <div>
            Nodes: {stats.resolved} resolved, {stats.placeholder} placeholder
          </div>
          <div>Edges: {stats.totalEdges}</div>
          {stats.clusters > 0 && <div>Clusters: {stats.clusters}</div>}
        </div>
      )}
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
