import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { useGraphStore } from "@/stores/graph-store";
import { getPackageDetails, getPackageVersions } from "@/services/nuget-api";
import { useToast } from "@/hooks/use-toast";
import type { ParsedPackageReference } from "@/lib/csproj-parser";
import { Package, Loader2 } from "lucide-react";

interface CsprojImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packages: ParsedPackageReference[];
}

export function CsprojImportDialog({
  open,
  onOpenChange,
  packages,
}: CsprojImportDialogProps) {
  const { toast } = useToast();
  const addPackage = useGraphStore((s) => s.addPackage);
  const runForceLayout = useGraphStore((s) => s.runForceLayout);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(packages.map((p) => p.packageId))
  );
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleToggle = useCallback((packageId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(packageId)) {
        next.delete(packageId);
      } else {
        next.add(packageId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(packages.map((p) => p.packageId)));
  }, [packages]);

  const handleSelectNone = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleImport = useCallback(async () => {
    const selected = packages.filter((p) => selectedIds.has(p.packageId));
    if (selected.length === 0) return;

    setIsLoading(true);
    setProgress({ current: 0, total: selected.length });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < selected.length; i++) {
      const pkg = selected[i];
      setProgress({ current: i + 1, total: selected.length });

      try {
        let version = pkg.version;

        // If no version specified, get latest
        if (!version) {
          const versions = await getPackageVersions(pkg.packageId);
          if (versions.length === 0) {
            failCount++;
            continue;
          }
          version = versions[0];
        }

        const details = await getPackageDetails(pkg.packageId, version);
        addPackage(details);
        successCount++;
      } catch (error) {
        console.error(`Failed to add ${pkg.packageId}:`, error);
        failCount++;
      }
    }

    setIsLoading(false);

    // Run layout after adding all packages
    setTimeout(() => {
      runForceLayout(800, 600);
    }, 100);

    toast({
      title: "Import complete",
      description: `Added ${successCount} packages${failCount > 0 ? `, ${failCount} failed` : ""}`,
    });

    onOpenChange(false);
  }, [packages, selectedIds, addPackage, runForceLayout, toast, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import from .csproj</DialogTitle>
          <DialogDescription>
            Found {packages.length} package references. Select which to add to
            the graph.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-2">
          <Button variant="outline" size="sm" onClick={handleSelectAll}>
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={handleSelectNone}>
            Select None
          </Button>
        </div>

        <ScrollArea className="h-[300px] border rounded-md p-2">
          <div className="space-y-2">
            {packages.map((pkg) => (
              <label
                key={pkg.packageId}
                className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer"
              >
                <Checkbox
                  checked={selectedIds.has(pkg.packageId)}
                  onCheckedChange={() => handleToggle(pkg.packageId)}
                  disabled={isLoading}
                />
                <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{pkg.packageId}</p>
                  {pkg.version && (
                    <p className="text-xs text-muted-foreground">
                      v{pkg.version}
                    </p>
                  )}
                </div>
              </label>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Adding {progress.current}/{progress.total} packages...
            </div>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={selectedIds.size === 0}
              >
                Add {selectedIds.size} Packages
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
