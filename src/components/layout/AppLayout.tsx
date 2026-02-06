import type { ReactNode } from "react";

interface AppLayoutProps {
  leftPanel: ReactNode;
  mainContent: ReactNode;
  rightPanel: ReactNode;
}

export function AppLayout({
  leftPanel,
  mainContent,
  rightPanel,
}: AppLayoutProps) {
  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Panel - Search */}
      <aside className="w-72 border-r flex flex-col shrink-0">
        {leftPanel}
      </aside>

      {/* Center - Graph */}
      <main className="flex-1 relative">{mainContent}</main>

      {/* Right Panel - Details */}
      <aside className="w-72 border-l flex flex-col shrink-0">
        {rightPanel}
      </aside>
    </div>
  );
}
