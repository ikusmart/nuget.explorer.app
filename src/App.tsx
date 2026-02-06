import { useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { SearchPanel } from "@/components/search/SearchPanel";
import { InfoPanel } from "@/components/details/InfoPanel";
import { DependencyGraph } from "@/components/graph/DependencyGraph";
import { Toaster } from "@/components/ui/toaster";
import { useServerStore } from "@/stores/server-store";
import { setServiceIndexUrl } from "@/services/nuget-api";

function App() {
  const serverUrl = useServerStore((state) => state.serverUrl);

  // Sync persisted server URL to API service on app load
  useEffect(() => {
    setServiceIndexUrl(serverUrl);
  }, []);

  return (
    <>
      <AppLayout
        leftPanel={<SearchPanel />}
        mainContent={<DependencyGraph />}
        rightPanel={<InfoPanel />}
      />
      <Toaster />
    </>
  );
}

export default App;
