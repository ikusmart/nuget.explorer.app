import { create } from "zustand";
import { persist } from "zustand/middleware";

const DEFAULT_SERVER_URL = "https://api.nuget.org/v3/index.json";

export interface ServerPreset {
  name: string;
  url: string;
}

export const SERVER_PRESETS: ServerPreset[] = [
  { name: "nuget.org (official)", url: "https://api.nuget.org/v3/index.json" },
  { name: "MyGet", url: "https://www.myget.org/F/nuget/api/v3/index.json" },
];

interface ServerState {
  serverUrl: string;
  isValidating: boolean;
  isValid: boolean;
  error: string | null;
  cacheOnly: boolean;

  // Actions
  setServerUrl: (url: string) => void;
  setValidating: (isValidating: boolean) => void;
  setValidationResult: (isValid: boolean, error?: string | null) => void;
  setCacheOnly: (enabled: boolean) => void;
  reset: () => void;
}

export const useServerStore = create<ServerState>()(
  persist(
    (set) => ({
      serverUrl: DEFAULT_SERVER_URL,
      isValidating: false,
      isValid: true,
      error: null,
      cacheOnly: false,

      setServerUrl: (url: string) => {
        set({ serverUrl: url, isValid: false, error: null });
      },

      setValidating: (isValidating: boolean) => {
        set({ isValidating });
      },

      setValidationResult: (isValid: boolean, error: string | null = null) => {
        set({ isValid, error, isValidating: false });
      },

      setCacheOnly: (enabled: boolean) => {
        set({ cacheOnly: enabled });
      },

      reset: () => {
        set({
          serverUrl: DEFAULT_SERVER_URL,
          isValidating: false,
          isValid: true,
          error: null,
          cacheOnly: false,
        });
      },
    }),
    {
      name: "nuget-server-storage",
      partialize: (state) => ({
        serverUrl: state.serverUrl,
        cacheOnly: state.cacheOnly,
      }),
    },
  ),
);

/** Get display name for current server */
export function getServerDisplayName(url: string): string {
  const preset = SERVER_PRESETS.find((p) => p.url === url);
  if (preset) return preset.name;

  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}
