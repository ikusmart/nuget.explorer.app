import { Card, CardContent } from '@/components/ui/card'
import { Package } from 'lucide-react'
import type { SearchResult } from '@/types/nuget'
import { cn } from '@/lib/utils'

interface PackageCardProps {
  package: SearchResult
  isSelected?: boolean
  onClick: () => void
}

export function PackageCard({ package: pkg, isSelected, onClick }: PackageCardProps) {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-colors hover:bg-accent',
        isSelected && 'border-primary bg-accent'
      )}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex gap-3">
          {/* Icon */}
          <div className="shrink-0">
            {pkg.iconUrl ? (
              <img
                src={pkg.iconUrl}
                alt=""
                className="h-10 w-10 rounded object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                  e.currentTarget.nextElementSibling?.classList.remove('hidden')
                }}
              />
            ) : null}
            <div className={cn('h-10 w-10 rounded bg-muted flex items-center justify-center', pkg.iconUrl && 'hidden')}>
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-sm truncate">{pkg.id}</h3>
            <p className="text-xs text-muted-foreground">v{pkg.version}</p>
            {pkg.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {pkg.description}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
