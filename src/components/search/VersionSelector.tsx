import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface VersionSelectorProps {
  versions: string[]
  selectedVersion?: string
  onVersionSelect: (version: string) => void
  loading?: boolean
}

export function VersionSelector({
  versions,
  selectedVersion,
  onVersionSelect,
  loading,
}: VersionSelectorProps) {
  if (loading) {
    return (
      <div className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground">
        Loading versions...
      </div>
    )
  }

  if (versions.length === 0) {
    return null
  }

  return (
    <Select value={selectedVersion} onValueChange={onVersionSelect}>
      <SelectTrigger>
        <SelectValue placeholder="Select version" />
      </SelectTrigger>
      <SelectContent>
        {versions.slice(0, 20).map((version) => (
          <SelectItem key={version} value={version}>
            {version}
          </SelectItem>
        ))}
        {versions.length > 20 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            Showing first 20 of {versions.length} versions
          </div>
        )}
      </SelectContent>
    </Select>
  )
}
