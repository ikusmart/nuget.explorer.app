import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMigrationStore } from "@/stores/migration-store";
import { TARGET_FRAMEWORKS, type TargetFramework } from "@/types/migration";
import {
  clearMigrationCache,
  getMigrationCacheStats,
} from "@/services/migration-analyzer";
import { Search, RotateCcw, Trash2 } from "lucide-react";

export function MigrationToolbar() {
  const searchPrefix = useMigrationStore((s) => s.searchPrefix);
  const internalMask = useMigrationStore((s) => s.internalMask);
  const targetFramework = useMigrationStore((s) => s.targetFramework);
  const devVersionFilter = useMigrationStore((s) => s.devVersionFilter);
  const loadingProgress = useMigrationStore((s) => s.loadingProgress);

  const setSearchPrefix = useMigrationStore((s) => s.setSearchPrefix);
  const setInternalMask = useMigrationStore((s) => s.setInternalMask);
  const setTargetFramework = useMigrationStore((s) => s.setTargetFramework);
  const setDevVersionFilter = useMigrationStore((s) => s.setDevVersionFilter);
  const startAnalysis = useMigrationStore((s) => s.startAnalysis);
  const reset = useMigrationStore((s) => s.reset);

  const [cacheSize, setCacheSize] = useState(
    () => getMigrationCacheStats().size,
  );
  const isLoading = loadingProgress !== null;

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

      {/* Target Framework */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium whitespace-nowrap">
          Target TFM:
        </label>
        <Select
          value={targetFramework}
          onValueChange={(v) => setTargetFramework(v as TargetFramework)}
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
