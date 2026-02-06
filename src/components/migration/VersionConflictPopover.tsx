import type { VersionConflict } from "@/types/migration";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface VersionConflictPopoverProps {
  conflict: VersionConflict;
  children: React.ReactNode;
}

export function VersionConflictPopover({
  conflict,
  children,
}: VersionConflictPopoverProps) {
  // Group by version for cleaner display
  const versionGroups = new Map<string, string[]>();
  for (const req of conflict.requestedVersions) {
    if (!versionGroups.has(req.version)) {
      versionGroups.set(req.version, []);
    }
    versionGroups.get(req.version)!.push(req.by);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Version Conflict</h4>
          <p className="text-sm text-muted-foreground">
            Multiple versions of <code className="font-mono">{conflict.packageId}</code> are requested:
          </p>
          <div className="space-y-2">
            {Array.from(versionGroups.entries()).map(([version, requestedBy]) => (
              <div key={version} className="text-sm">
                <span className="font-mono font-medium">{version}</span>
                <span className="text-muted-foreground"> requested by:</span>
                <ul className="list-disc list-inside ml-2 text-muted-foreground">
                  {requestedBy.map((pkg) => (
                    <li key={pkg} className="font-mono text-xs">{pkg}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
