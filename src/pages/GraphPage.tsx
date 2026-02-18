import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { SearchPanel } from "@/components/search/SearchPanel";
import { InfoPanel } from "@/components/details/InfoPanel";
import { DependencyGraph } from "@/components/graph/DependencyGraph";
import { Toaster } from "@/components/ui/toaster";
import { useServerStore } from "@/stores/server-store";
import { setServiceIndexUrl, setCacheOnlyMode } from "@/services/nuget-api";
import { Button } from "@/components/ui/button";
import { GitBranch } from "lucide-react";
import { ServerSelector } from "@/components/layout/ServerSelector";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export function GraphPage() {
  const serverUrl = useServerStore((state) => state.serverUrl);
  const cacheOnly = useServerStore((state) => state.cacheOnly);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // Sync persisted server URL to API service on app load
  useEffect(() => {
    setServiceIndexUrl(serverUrl);
  }, [serverUrl]);

  // Sync cache-only mode
  useEffect(() => {
    setCacheOnlyMode(cacheOnly);
  }, [cacheOnly]);

  const toggleLeft = useCallback(() => setLeftCollapsed((prev) => !prev), []);
  const toggleRight = useCallback(() => setRightCollapsed((prev) => !prev), []);

  return (
    <>
      <div className="h-screen flex flex-col">
        {/* Navigation Header */}
        <header className="border-b px-4 py-2 flex items-center justify-between bg-background">
          <nav className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/">
                <GitBranch className="h-4 w-4 mr-1" />
                Migration Analysis
              </Link>
            </Button>
            <Button variant="default" size="sm" asChild>
              <Link to="/graph">Dependency Graph</Link>
            </Button>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <ServerSelector />
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          <AppLayout
            leftPanel={<SearchPanel />}
            mainContent={<DependencyGraph />}
            rightPanel={<InfoPanel />}
            leftCollapsed={leftCollapsed}
            rightCollapsed={rightCollapsed}
            onToggleLeft={toggleLeft}
            onToggleRight={toggleRight}
          />
        </div>
      </div>
      <Toaster />
    </>
  );
}
