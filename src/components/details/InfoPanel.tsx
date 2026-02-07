import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  useGraphStore,
  useSelectedNode,
  useSelectedNodes,
} from "@/stores/graph-store";
import {
  ExternalLink,
  Package,
  Trash2,
  Plus,
  PlusCircle,
  Check,
  Route,
  XCircle,
} from "lucide-react";
import { flattenDependencies } from "@/services/nuget-api";
import type { FlatDependency } from "@/types/nuget";
import { useToast } from "@/hooks/use-toast";

export function InfoPanel() {
  const { toast } = useToast();
  const selectedNode = useSelectedNode();
  const selectedNodes = useSelectedNodes();
  const removeNode = useGraphStore((s) => s.removeNode);
  const removeSelectedNodes = useGraphStore((s) => s.removeSelectedNodes);
  const addDependency = useGraphStore((s) => s.addDependency);
  const addAllDependencies = useGraphStore((s) => s.addAllDependencies);
  const isNodeOnGraph = useGraphStore((s) => s.isNodeOnGraph);
  const toggleNodeSelection = useGraphStore((s) => s.toggleNodeSelection);
  const findPath = useGraphStore((s) => s.findPath);
  const clearPath = useGraphStore((s) => s.clearPath);
  const highlightedPath = useGraphStore((s) => s.highlightedPath);

  const handleFindPath = () => {
    if (selectedNodes.length !== 2) return;
    const [nodeA, nodeB] = selectedNodes;
    const found = findPath(nodeA.id, nodeB.id);
    if (found) {
      toast({
        title: "Path found",
        description: `Found path between ${nodeA.data.packageId} and ${nodeB.data.packageId}`,
      });
    } else {
      toast({
        title: "No path found",
        description: `No path between ${nodeA.data.packageId} and ${nodeB.data.packageId}`,
        variant: "destructive",
      });
    }
  };

  const handleClearPath = () => {
    clearPath();
  };

  // Multi-select view (more than 1 node selected)
  if (selectedNodes.length > 1) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Multiple Selection</h2>
          <p className="text-sm text-muted-foreground">
            {selectedNodes.length} nodes selected
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {selectedNodes.map((node) => (
              <div
                key={node.id}
                className="flex items-center gap-2 p-2 rounded bg-muted/50 text-sm"
              >
                {node.data.iconUrl ? (
                  <img
                    src={node.data.iconUrl}
                    alt=""
                    className="h-5 w-5 rounded object-contain shrink-0"
                  />
                ) : (
                  <Package className="h-5 w-5 text-muted-foreground shrink-0" />
                )}
                <span className="truncate flex-1">{node.data.packageId}</span>
                {node.data.version && (
                  <span className="text-xs text-muted-foreground">
                    v{node.data.version}
                  </span>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-4 border-t space-y-2">
          {selectedNodes.length === 2 && (
            <>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleFindPath}
              >
                <Route className="h-4 w-4 mr-2" />
                Find Path
              </Button>
              {highlightedPath.size > 0 && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleClearPath}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Clear Path
                </Button>
              )}
            </>
          )}
          <Button
            variant="destructive"
            className="w-full"
            onClick={removeSelectedNodes}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Remove All ({selectedNodes.length})
          </Button>
        </div>
      </div>
    );
  }

  if (!selectedNode) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Package Details</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-muted-foreground text-center">
            Select a node in the graph to view details
          </p>
        </div>
      </div>
    );
  }

  const { data } = selectedNode;
  const isPlaceholder = data.isPlaceholder;

  // Get flattened dependencies if available
  const dependencies: FlatDependency[] =
    !isPlaceholder && data.dependencyGroups
      ? flattenDependencies({
          id: data.packageId,
          version: data.version || "",
          dependencyGroups: data.dependencyGroups,
        })
      : [];

  const handleAddDependency = (dep: FlatDependency) => {
    addDependency(selectedNode.id, dep);
  };

  const handleAddAllDependencies = () => {
    addAllDependencies(selectedNode.id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-start gap-3">
          {data.iconUrl ? (
            <img
              src={data.iconUrl}
              alt=""
              className="h-10 w-10 rounded object-contain shrink-0"
            />
          ) : (
            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="font-semibold truncate">{data.packageId}</h2>
            {data.version && (
              <p className="text-sm text-muted-foreground">v{data.version}</p>
            )}
            {isPlaceholder && (
              <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-muted rounded">
                Placeholder
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {isPlaceholder ? (
            <p className="text-sm text-muted-foreground">
              Double-click this node in the graph to resolve it and see its
              dependencies.
            </p>
          ) : (
            <>
              {/* Description */}
              {data.description && (
                <div>
                  <h3 className="text-sm font-medium mb-1">Description</h3>
                  <p className="text-sm text-muted-foreground">
                    {data.description}
                  </p>
                </div>
              )}

              {/* Authors */}
              {data.authors && data.authors.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-1">Authors</h3>
                  <p className="text-sm text-muted-foreground">
                    {data.authors.join(", ")}
                  </p>
                </div>
              )}

              {/* Links */}
              <div className="flex flex-wrap gap-2">
                {data.projectUrl && (
                  <a
                    href={data.projectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Project
                  </a>
                )}
                {data.licenseUrl && (
                  <a
                    href={data.licenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    License
                  </a>
                )}
              </div>

              {/* Dependencies */}
              {dependencies.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium">
                      Dependencies ({dependencies.length})
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleAddAllDependencies}
                    >
                      <PlusCircle className="h-3 w-3 mr-1" />
                      Add All
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {dependencies.map((dep) => {
                      const onGraph = isNodeOnGraph(dep.id);
                      return (
                        <div
                          key={dep.id}
                          className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{dep.id}</p>
                            {dep.versionRange && (
                              <p className="text-xs text-muted-foreground">
                                {dep.versionRange}
                              </p>
                            )}
                          </div>
                          {onGraph ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 shrink-0 ml-2 text-green-600 hover:text-green-700"
                              onClick={() =>
                                toggleNodeSelection(dep.id.toLowerCase(), false)
                              }
                              title="Select on graph"
                            >
                              <Check className="h-3 w-3 mr-1" />
                              on graph
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 shrink-0 ml-2"
                              onClick={() => handleAddDependency(dep)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {dependencies.length === 0 && !isPlaceholder && (
                <div>
                  <h3 className="text-sm font-medium mb-1">Dependencies</h3>
                  <p className="text-sm text-muted-foreground">
                    No dependencies
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Actions */}
      <div className="p-4 border-t space-y-2">
        {!isPlaceholder && (
          <Button variant="outline" className="w-full" asChild>
            <a
              href={`https://www.nuget.org/packages/${data.packageId}/${data.version}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View on NuGet.org
            </a>
          </Button>
        )}
        <Button
          variant="destructive"
          className="w-full"
          onClick={() => removeNode(selectedNode.id)}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Remove from Graph
        </Button>
      </div>
    </div>
  );
}
