import { useState, useCallback, useRef } from "react";
import { SearchInput } from "./SearchInput";
import { PackageCard } from "./PackageCard";
import { VersionSelector } from "./VersionSelector";
import { CsprojImportDialog } from "./CsprojImportDialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useSearch, useVersions, usePackageDetails } from "@/hooks/use-nuget";
import { useGraphStore } from "@/stores/graph-store";
import { useServerStore } from "@/stores/server-store";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, FileCode } from "lucide-react";
import type { SearchResult } from "@/types/nuget";
import {
  readCsprojFile,
  isCsprojFile,
  type ParsedPackageReference,
} from "@/lib/csproj-parser";

export function SearchPanel() {
  const [selectedPackage, setSelectedPackage] = useState<SearchResult | null>(
    null,
  );
  const [selectedVersion, setSelectedVersion] = useState<string>();
  const [includePrerelease, setIncludePrerelease] = useState(false);
  const [lastQuery, setLastQuery] = useState("");

  // CSProj import state
  const [csprojPackages, setCsprojPackages] = useState<
    ParsedPackageReference[]
  >([]);
  const [csprojDialogOpen, setCsprojDialogOpen] = useState(false);
  const csprojInputRef = useRef<HTMLInputElement>(null);

  const cacheOnly = useServerStore((s) => s.cacheOnly);
  const setCacheOnly = useServerStore((s) => s.setCacheOnly);

  const {
    results,
    loading: searchLoading,
    error: searchError,
    search,
    clear: clearSearch,
  } = useSearch();
  const {
    versions,
    loading: versionsLoading,
    fetchVersions,
    clear: clearVersions,
  } = useVersions();
  const {
    details,
    loading: detailsLoading,
    fetchDetails,
  } = usePackageDetails();
  const addPackage = useGraphStore((s) => s.addPackage);

  const handleSearch = useCallback(
    (query: string) => {
      setLastQuery(query);
      search(query, includePrerelease);
      setSelectedPackage(null);
      setSelectedVersion(undefined);
      clearVersions();
    },
    [search, clearVersions, includePrerelease],
  );

  const handlePrereleaseChange = useCallback(
    (checked: boolean) => {
      setIncludePrerelease(checked);
      if (lastQuery) {
        search(lastQuery, checked);
      }
    },
    [lastQuery, search],
  );

  const handleClear = useCallback(() => {
    clearSearch();
    setSelectedPackage(null);
    setSelectedVersion(undefined);
    clearVersions();
  }, [clearSearch, clearVersions]);

  const handlePackageSelect = useCallback(
    (pkg: SearchResult) => {
      setSelectedPackage(pkg);
      setSelectedVersion(pkg.version);
      fetchVersions(pkg.id);
      fetchDetails(pkg.id, pkg.version);
    },
    [fetchVersions, fetchDetails],
  );

  const handleVersionSelect = useCallback(
    (version: string) => {
      if (!selectedPackage) return;
      setSelectedVersion(version);
      fetchDetails(selectedPackage.id, version);
    },
    [selectedPackage, fetchDetails],
  );

  const { toast } = useToast();

  const handleAddToGraph = useCallback(() => {
    if (details) {
      addPackage(details);
      toast({
        title: "Package added",
        description: `${details.id} v${details.version}`,
      });
    }
  }, [details, addPackage, toast]);

  const handleCsprojClick = useCallback(() => {
    csprojInputRef.current?.click();
  }, []);

  const handleCsprojFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (!isCsprojFile(file)) {
        toast({
          title: "Invalid file",
          description: "Please select a .csproj file",
          variant: "destructive",
        });
        event.target.value = "";
        return;
      }

      const packages = await readCsprojFile(file);
      if (packages.length === 0) {
        toast({
          title: "No packages found",
          description: "No PackageReference elements found in the file",
          variant: "destructive",
        });
        event.target.value = "";
        return;
      }

      setCsprojPackages(packages);
      setCsprojDialogOpen(true);
      event.target.value = "";
    },
    [toast],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search Input */}
      <div className="p-4 border-b space-y-3">
        <SearchInput onSearch={handleSearch} onClear={handleClear} />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={includePrerelease}
              onChange={(e) => handlePrereleaseChange(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-muted-foreground">Include prerelease</span>
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCsprojClick}
            className="h-7"
            title="Import from .csproj"
          >
            <FileCode className="h-4 w-4 mr-1" />
            .csproj
          </Button>
          <input
            ref={csprojInputRef}
            type="file"
            accept=".csproj"
            onChange={handleCsprojFileChange}
            className="hidden"
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={cacheOnly}
            onChange={(e) => setCacheOnly(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-muted-foreground">Cache only</span>
        </label>
      </div>

      {/* CSProj Import Dialog */}
      <CsprojImportDialog
        open={csprojDialogOpen}
        onOpenChange={setCsprojDialogOpen}
        packages={csprojPackages}
      />

      {/* Version Selector & Add Button — placed above results for quick access */}
      {selectedPackage && (
        <div className="p-4 border-b space-y-3">
          <VersionSelector
            versions={versions}
            selectedVersion={selectedVersion}
            onVersionSelect={handleVersionSelect}
            loading={versionsLoading}
          />
          <Button
            className="w-full"
            onClick={handleAddToGraph}
            disabled={!details || detailsLoading}
          >
            {detailsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Add to Graph
          </Button>
        </div>
      )}

      {/* Results */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {searchLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {searchError && (
            <p className="text-sm text-destructive text-center py-4">
              {searchError}
            </p>
          )}

          {!searchLoading && results.length === 0 && !searchError && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Search for NuGet packages
            </p>
          )}

          {results.map((pkg) => (
            <PackageCard
              key={pkg.id}
              package={pkg}
              isSelected={selectedPackage?.id === pkg.id}
              onClick={() => handlePackageSelect(pkg)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
