import { useCallback } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useGraphStore, type GraphNode } from "@/stores/graph-store";
import { getPackageDetails, getPackageVersions } from "@/services/nuget-api";
import { useToast } from "@/hooks/use-toast";
import { Expand, Trash2, GitBranch, Copy } from "lucide-react";

interface NodeContextMenuProps {
  children: React.ReactNode;
  node: GraphNode | null;
  onOpenChange?: (open: boolean) => void;
}

export function NodeContextMenu({
  children,
  node,
  onOpenChange,
}: NodeContextMenuProps) {
  const { toast } = useToast();
  const removeNode = useGraphStore((s) => s.removeNode);
  const expandDependency = useGraphStore((s) => s.expandDependency);
  const selectDependencies = useGraphStore((s) => s.selectDependencies);

  const handleExpand = useCallback(async () => {
    if (!node || !node.data.isPlaceholder) return;

    const packageId = node.data.packageId;

    try {
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
  }, [node, expandDependency, toast]);

  const handleRemove = useCallback(() => {
    if (!node) return;
    removeNode(node.id);
  }, [node, removeNode]);

  const handleSelectDependencies = useCallback(() => {
    if (!node) return;
    selectDependencies(node.id);
    toast({
      title: "Dependencies selected",
      description: `Selected all dependencies of ${node.data.packageId}`,
    });
  }, [node, selectDependencies, toast]);

  const handleCopyId = useCallback(() => {
    if (!node) return;
    navigator.clipboard.writeText(node.data.packageId);
    toast({
      title: "Copied",
      description: `${node.data.packageId} copied to clipboard`,
    });
  }, [node, toast]);

  if (!node) {
    return <>{children}</>;
  }

  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {node.data.isPlaceholder && (
          <>
            <ContextMenuItem onClick={handleExpand}>
              <Expand className="mr-2 h-4 w-4" />
              Expand
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onClick={handleSelectDependencies}>
          <GitBranch className="mr-2 h-4 w-4" />
          Select Dependencies
        </ContextMenuItem>
        <ContextMenuItem onClick={handleCopyId}>
          <Copy className="mr-2 h-4 w-4" />
          Copy Package ID
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={handleRemove}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Remove from Graph
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
