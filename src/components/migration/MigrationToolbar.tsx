import { useState, useEffect, useRef } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useMigrationStore } from "@/stores/migration-store";
import { useServerStore } from "@/stores/server-store";
import { TARGET_FRAMEWORKS, type TargetFramework } from "@/types/migration";
import {
  clearMigrationCache,
  getMigrationCacheStats,
} from "@/services/migration-analyzer";
import {
  downloadCacheExport,
  readCacheImportFile,
  saveDefaultSnapshot,
} from "@/services/nuget-api";
import {
  Search,
  RotateCcw,
  Trash2,
  Download,
  Upload,
  ChevronDown,
} from "lucide-react";

export function MigrationToolbar() {
  const searchPrefix = useMigrationStore((s) => s.searchPrefix);
  const internalMask = useMigrationStore((s) => s.internalMask);
  const frameworkSelection = useMigrationStore((s) => s.frameworkSelection);
  const devVersionFilter = useMigrationStore((s) => s.devVersionFilter);
  const loadingProgress = useMigrationStore((s) => s.loadingProgress);

  const setSearchPrefix = useMigrationStore((s) => s.setSearchPrefix);
  const setInternalMask = useMigrationStore((s) => s.setInternalMask);
  const setMigrationTarget = useMigrationStore((s) => s.setMigrationTarget);
  const toggleCurrentFramework = useMigrationStore(
    (s) => s.toggleCurrentFramework,
  );
  const setDevVersionFilter = useMigrationStore((s) => s.setDevVersionFilter);
  const startAnalysis = useMigrationStore((s) => s.startAnalysis);
  const reset = useMigrationStore((s) => s.reset);

  const cacheOnly = useServerStore((s) => s.cacheOnly);
  const setCacheOnly = useServerStore((s) => s.setCacheOnly);

  const cacheFileRef = useRef<HTMLInputElement>(null);

  const [cacheSize, setCacheSize] = useState(
    () => getMigrationCacheStats().size,
  );
  const isLoading = loadingProgress !== null;

  const handleSaveCache = () => {
    downloadCacheExport();
    saveDefaultSnapshot();
  };

  const handleLoadCacheFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const count = await readCacheImportFile(file);
      saveDefaultSnapshot();
      setCacheSize(getMigrationCacheStats().size);
      console.log(`Imported ${count} cache entries`);
    } catch (err) {
      console.error("Failed to import cache:", err);
    }
    // Reset so the same file can be re-selected
    e.target.value = "";
  };

  const handleAnalyze = () => {
    if (!isLoading && searchPrefix) {
      startAnalysis();
    }
  };

  const handleClearCache = () => {
    clearMigrationCache();
    setCacheSize(0);
  };

  // Update cache size when loading finishes
  useEffect(() => {
    if (loadingProgress === null) {
      setCacheSize(getMigrationCacheStats().size);
    }
  }, [loadingProgress]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAnalyze();
    }
  };

  // Format current frameworks button text
  const currentFrameworksText =
    frameworkSelection.currentFrameworks.length > 0
      ? frameworkSelection.currentFrameworks
          .map((tfm) => TARGET_FRAMEWORKS.find((t) => t.value === tfm)?.label)
          .join(", ")
      : "Optional";

  return (
    <div className="border-b px-4 py-3 flex items-center gap-4 flex-wrap">
      {/* Search Prefix */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium whitespace-nowrap">
          Package Prefix:
        </label>
        <Input
          placeholder="e.g. Microsoft.Extensions"
          value={searchPrefix}
          onChange={(e) => setSearchPrefix(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-64"
          disabled={isLoading}
        />
      </div>

      {/* Internal Mask */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium whitespace-nowrap">
          Internal Mask:
        </label>
        <Input
          placeholder="e.g. MyCompany.*"
          value={internalMask}
          onChange={(e) => setInternalMask(e.target.value)}
          className="w-48"
          disabled={isLoading}
        />
      </div>

      {/* Framework Selection */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium whitespace-nowrap">
          Current TFMs:
        </label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-48 justify-between"
              disabled={isLoading}
            >
              <span className="truncate">{currentFrameworksText}</span>
              <ChevronDown className="h-4 w-4 ml-2 flex-shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3">
            <div className="space-y-2">
              {TARGET_FRAMEWORKS.map((tfm) => {
                const isMigrationTarget =
                  tfm.value === frameworkSelection.migrationTarget;
                const isSelected =
                  frameworkSelection.currentFrameworks.includes(tfm.value);
                return (
                  <div key={tfm.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`current-${tfm.value}`}
                      checked={isSelected}
                      disabled={isMigrationTarget || isLoading}
                      onCheckedChange={() => toggleCurrentFramework(tfm.value)}
                    />
                    <label
                      htmlFor={`current-${tfm.value}`}
                      className={`text-sm cursor-pointer ${
                        isMigrationTarget
                          ? "text-muted-foreground"
                          : "text-foreground"
                      }`}
                    >
                      {tfm.label}
                    </label>
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        <span className="text-muted-foreground">→</span>

        <label className="text-sm font-medium whitespace-nowrap">
          Migrate to:
        </label>
        <Select
          value={frameworkSelection.migrationTarget}
          onValueChange={(v) => setMigrationTarget(v as TargetFramework)}
          disabled={isLoading}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TARGET_FRAMEWORKS.map((tfm) => (
              <SelectItem key={tfm.value} value={tfm.value}>
                {tfm.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Dev Version Filter */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium whitespace-nowrap">
          Dev Version:
        </label>
        <Input
          placeholder="e.g. TASK-123 (empty = release only)"
          value={devVersionFilter}
          onChange={(e) => setDevVersionFilter(e.target.value)}
          className="w-56"
          disabled={isLoading}
        />
      </div>

      {/* Cache Only Toggle */}
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={cacheOnly}
          onChange={(e) => setCacheOnly(e.target.checked)}
          className="rounded border-gray-300"
          disabled={isLoading}
        />
        <span className="text-muted-foreground whitespace-nowrap">
          Cache only
        </span>
      </label>

      {/* Actions */}
      <div className="flex items-center gap-2 ml-auto">
        <Button onClick={handleAnalyze} disabled={isLoading || !searchPrefix}>
          <Search className="h-4 w-4 mr-1" />
          Analyze
        </Button>
        <Button variant="outline" onClick={reset} disabled={isLoading}>
          <RotateCcw className="h-4 w-4 mr-1" />
          Reset
        </Button>
        <Button
          variant="ghost"
          onClick={handleSaveCache}
          disabled={isLoading || cacheSize === 0}
          title="Save cache to file"
        >
          <Download className="h-4 w-4 mr-1" />
          Save
        </Button>
        <Button
          variant="ghost"
          onClick={() => cacheFileRef.current?.click()}
          disabled={isLoading}
          title="Load cache from file"
        >
          <Upload className="h-4 w-4 mr-1" />
          Load
        </Button>
        <input
          ref={cacheFileRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleLoadCacheFile}
        />
        <Button
          variant="ghost"
          onClick={handleClearCache}
          disabled={isLoading}
          title="Clear package cache"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Clear Cache {cacheSize > 0 && `(${cacheSize})`}
        </Button>
      </div>
    </div>
  );
}
