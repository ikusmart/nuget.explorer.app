import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { useServerStore } from "@/stores/server-store";
import { setServiceIndexUrl, setCacheOnlyMode } from "@/services/nuget-api";
import { Button } from "@/components/ui/button";
import { Network } from "lucide-react";
import { ServerSelector } from "@/components/layout/ServerSelector";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { MigrationToolbar } from "@/components/migration/MigrationToolbar";
import { MigrationTable } from "@/components/migration/MigrationTable";
import { MigrationRoadmap } from "@/components/migration/MigrationRoadmap";
import { useMigrationStore } from "@/stores/migration-store";

export function MigrationPage() {
  const serverUrl = useServerStore((state) => state.serverUrl);
  const cacheOnly = useServerStore((state) => state.cacheOnly);
  const packages = useMigrationStore((s) => s.packages);
  const loadingProgress = useMigrationStore((s) => s.loadingProgress);
  const error = useMigrationStore((s) => s.error);
  const warning = useMigrationStore((s) => s.warning);

  // Sync persisted server URL to API service on app load
  useEffect(() => {
    setServiceIndexUrl(serverUrl);
  }, [serverUrl]);

  // Sync cache-only mode
  useEffect(() => {
    setCacheOnlyMode(cacheOnly);
  }, [cacheOnly]);

  return (
    <>
      <div className="h-screen flex flex-col">
        {/* Navigation Header */}
        <header className="border-b px-4 py-2 flex items-center justify-between bg-background">
          <nav className="flex gap-2">
            <Button variant="default" size="sm" asChild>
              <Link to="/">Migration Analysis</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/graph">
                <Network className="h-4 w-4 mr-1" />
                Dependency Graph
              </Link>
            </Button>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <ServerSelector />
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <MigrationToolbar />

          {/* Loading Progress */}
          {loadingProgress && (
            <div className="px-4 py-2 bg-muted border-b space-y-1">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-muted-foreground/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width:
                        loadingProgress.total > 0
                          ? `${(loadingProgress.current / loadingProgress.total) * 100}%`
                          : "0%",
                    }}
                  />
                </div>
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {loadingProgress.total > 0
                    ? `${loadingProgress.phase === "analyzing" ? "Analyzing" : "Loading"}: ${loadingProgress.current}/${loadingProgress.total}`
                    : "Discovering..."}
                  {loadingProgress.concurrency > 0 &&
                    ` · ${loadingProgress.concurrency} active`}
                </span>
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {loadingProgress.activePackages.length > 0 ? (
                  <>
                    Loading:{" "}
                    {loadingProgress.activePackages.slice(0, 3).join(", ")}
                    {loadingProgress.activePackages.length > 3 &&
                      ` +${loadingProgress.activePackages.length - 3} more`}
                  </>
                ) : loadingProgress.total === 0 ? (
                  "Discovering packages..."
                ) : loadingProgress.phase === "analyzing" ? (
                  "Analyzing framework compatibility..."
                ) : loadingProgress.current < loadingProgress.total ? (
                  "Processing cached data..."
                ) : (
                  "Finalizing..."
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-4 py-2 bg-destructive/10 border-b text-destructive text-sm">
              Analysis failed: {error}
            </div>
          )}

          {/* Warning (e.g. offline fallback) */}
          {warning && !error && (
            <div className="px-4 py-2 bg-amber-100 dark:bg-amber-950/30 border-b text-amber-800 dark:text-amber-300 text-sm">
              {warning}
            </div>
          )}

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {packages.length > 0 ? (
              <>
                <MigrationTable />
                <MigrationRoadmap />
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Enter a package prefix and click Analyze to start
              </div>
            )}
          </div>
        </div>
      </div>
      <Toaster />
    </>
  );
}
