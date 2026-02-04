import { ExternalLink, Sparkles } from 'lucide-react'
import type { Oracle, PresenceItem } from '@/lib/pocketbase'
import { cn, getAvatarGradient, getDisplayInfo } from '@/lib/utils'

interface TimelineOracleCardProps {
  oracle: Oracle
  presence?: PresenceItem
  index?: number
}

const statusColors = {
  online: 'bg-green-500',
  away: 'bg-amber-500',
  offline: 'bg-slate-600',
}

export function TimelineOracleCard({ oracle, presence, index = 0 }: TimelineOracleCardProps) {
  const displayInfo = getDisplayInfo(oracle)
  const status: 'online' | 'away' | 'offline' = presence?.status || 'offline'

  return (
    <div
      className={cn(
        'group rounded-xl border border-slate-800 bg-slate-900/50 p-4',
        'hover:border-orange-500/50 hover:bg-slate-900/80 hover:shadow-lg hover:shadow-orange-500/5',
        'transition-all duration-300 ease-out',
        'animate-in fade-in slide-in-from-left-4'
      )}
      style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'both' }}
    >
      <div className="flex items-start gap-4">
        {/* Avatar with status and glow effect */}
        <div className="relative shrink-0">
          {/* Glow ring for online status */}
          {status === 'online' && (
            <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" style={{ animationDuration: '2s' }} />
          )}
          <div
            className={cn(
              'relative h-12 w-12 rounded-full bg-gradient-to-br flex items-center justify-center text-xl font-bold text-white',
              'transition-transform duration-300 group-hover:scale-105',
              getAvatarGradient(oracle.name)
            )}
          >
            {(oracle.oracle_name || oracle.name)[0]?.toUpperCase() || '?'}
          </div>
          {/* Status indicator with pulse for online */}
          <div
            className={cn(
              'absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-slate-900',
              statusColors[status],
              status === 'online' && 'animate-pulse'
            )}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white group-hover:text-orange-100 transition-colors">
              {displayInfo.displayName}
            </span>
            <span className={cn(
              'text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400',
              'transition-all duration-300 group-hover:bg-purple-500/30'
            )}>
              Oracle
            </span>
            {displayInfo.owner && (
              <span className="text-xs text-green-400 flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                @{displayInfo.owner}
              </span>
            )}
          </div>

          {oracle.bio && (
            <p className="mt-1 text-sm text-slate-400 line-clamp-2">{oracle.bio}</p>
          )}

          {/* Birth Issue Link with hover animation */}
          {oracle.birth_issue && (
            <a
              href={oracle.birth_issue}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'mt-2 inline-flex items-center gap-1.5 text-sm text-orange-500',
                'hover:text-orange-400 hover:gap-2 transition-all duration-200'
              )}
            >
              <ExternalLink className="h-4 w-4" />
              View Birth Issue
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
