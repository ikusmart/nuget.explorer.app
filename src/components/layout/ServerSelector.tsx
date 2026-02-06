import { useState, useEffect } from "react";
import { Settings, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useServerStore, SERVER_PRESETS } from "@/stores/server-store";
import { validateServiceIndex, setServiceIndexUrl } from "@/services/nuget-api";

export function ServerSelector() {
  const { serverUrl, setServerUrl, setValidationResult } = useServerStore();

  const [open, setOpen] = useState(false);
  const [inputUrl, setInputUrl] = useState(serverUrl);
  const [localValidating, setLocalValidating] = useState(false);
  const [localValid, setLocalValid] = useState<boolean | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // Reset local state when dialog opens
  useEffect(() => {
    if (open) {
      setInputUrl(serverUrl);
      setLocalValid(null);
      setLocalError(null);
    }
  }, [open, serverUrl]);

  // Extract display name from URL
  const getDisplayName = (url: string) => {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace("www.", "").replace("api.", "");
    } catch {
      return url;
    }
  };

  const handleValidate = async () => {
    setLocalValidating(true);
    setLocalValid(null);
    setLocalError(null);

    const result = await validateServiceIndex(inputUrl);

    setLocalValidating(false);
    setLocalValid(result.isValid);
    setLocalError(result.error || null);
  };

  const handleApply = async () => {
    if (!localValid) {
      // Validate first if not already validated
      setLocalValidating(true);
      const result = await validateServiceIndex(inputUrl);
      setLocalValidating(false);

      if (!result.isValid) {
        setLocalValid(false);
        setLocalError(result.error || "Invalid server");
        return;
      }
    }

    // Update stores and API
    setServerUrl(inputUrl);
    setServiceIndexUrl(inputUrl);
    setValidationResult(true);
    setOpen(false);
  };

  const handlePresetClick = (url: string) => {
    setInputUrl(url);
    setLocalValid(null);
    setLocalError(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="h-4 w-4" />
          <span className="max-w-[150px] truncate">
            {getDisplayName(serverUrl)}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>NuGet Server Configuration</DialogTitle>
          <DialogDescription>
            Configure the NuGet server to search for packages. The server must
            be a valid NuGet V3 API endpoint.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <label htmlFor="server-url" className="text-sm font-medium">
              Server URL
            </label>
            <div className="flex gap-2">
              <Input
                id="server-url"
                value={inputUrl}
                onChange={(e) => {
                  setInputUrl(e.target.value);
                  setLocalValid(null);
                  setLocalError(null);
                }}
                placeholder="https://api.nuget.org/v3/index.json"
                className="flex-1"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleValidate}
                disabled={localValidating || !inputUrl}
              >
                {localValidating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Validate"
                )}
              </Button>
            </div>

            {/* Validation status */}
            {localValid !== null && (
              <div
                className={`flex items-center gap-2 text-sm ${
                  localValid ? "text-green-600" : "text-red-600"
                }`}
              >
                {localValid ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Valid NuGet V3 Server</span>
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4" />
                    <span>{localError || "Invalid server"}</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Presets</label>
            <div className="flex flex-col gap-1">
              {SERVER_PRESETS.map((preset) => (
                <Button
                  key={preset.url}
                  variant={inputUrl === preset.url ? "secondary" : "ghost"}
                  size="sm"
                  className="justify-start"
                  onClick={() => handlePresetClick(preset.url)}
                >
                  {preset.name}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={localValidating}>
            {localValidating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Validating...
              </>
            ) : (
              "Apply"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
