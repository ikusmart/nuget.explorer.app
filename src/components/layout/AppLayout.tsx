import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface AppLayoutProps {
  leftPanel: ReactNode;
  mainContent: ReactNode;
  rightPanel: ReactNode;
  leftCollapsed?: boolean;
  rightCollapsed?: boolean;
  onToggleLeft?: () => void;
  onToggleRight?: () => void;
}

export function AppLayout({
  leftPanel,
  mainContent,
  rightPanel,
  leftCollapsed = false,
  rightCollapsed = false,
  onToggleLeft,
  onToggleRight,
}: AppLayoutProps) {
  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Panel - Search */}
      <aside
        className={cn(
          "border-r flex flex-col shrink-0 transition-all duration-300 overflow-hidden",
          leftCollapsed ? "w-0 border-r-0" : "w-72",
        )}
      >
        {leftPanel}
      </aside>

      {/* Center - Graph */}
      <main className="flex-1 relative">
        {/* Left panel toggle */}
        {onToggleLeft && (
          <button
            onClick={onToggleLeft}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-background border border-l-0 rounded-r-md p-1 hover:bg-accent transition-colors"
            title={leftCollapsed ? "Show search panel" : "Hide search panel"}
          >
            {leftCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        )}

        {/* Right panel toggle */}
        {onToggleRight && (
          <button
            onClick={onToggleRight}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-background border border-r-0 rounded-l-md p-1 hover:bg-accent transition-colors"
            title={rightCollapsed ? "Show details panel" : "Hide details panel"}
          >
            {rightCollapsed ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        )}

        {mainContent}
      </main>

      {/* Right Panel - Details */}
      <aside
        className={cn(
          "border-l flex flex-col shrink-0 transition-all duration-300 overflow-hidden",
          rightCollapsed ? "w-0 border-l-0" : "w-72",
        )}
      >
        {rightPanel}
      </aside>
    </div>
  );
}
