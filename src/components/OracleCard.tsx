import { ExternalLink } from 'lucide-react'
import type { Oracle, PresenceItem } from '@/lib/pocketbase'
import { cn, getAvatarGradient, getDisplayInfo } from '@/lib/utils'

interface OracleCardProps {
  oracle: Oracle
  presence?: PresenceItem
}

const statusColors = {
  online: 'bg-green-500',
  away: 'bg-amber-500',
  offline: 'bg-slate-600',
}

const statusLabels = {
  online: 'Online',
  away: 'Away',
  offline: 'Offline',
}

export function OracleCard({ oracle, presence }: OracleCardProps) {
  const status: 'online' | 'away' | 'offline' = presence?.status || 'offline'
  const displayInfo = getDisplayInfo(oracle)

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition-colors hover:border-slate-700">
      <div className="mb-3 flex items-start gap-3">
        <div className="relative">
           <div className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarGradient(oracle.name)} text-xl font-bold text-white`}>
             {oracle.name[0]?.toUpperCase() || '?'}
           </div>
          <div
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-slate-900',
              statusColors[status]
            )}
            title={statusLabels[status]}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-100 truncate">
              {displayInfo.displayName}
            </h3>
            {displayInfo.label && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                displayInfo.type === 'oracle'
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'bg-blue-500/20 text-blue-400'
              }`}>
                {displayInfo.label}
              </span>
            )}
            {displayInfo.owner && (
              <span className="shrink-0 text-xs text-green-400">✓ @{displayInfo.owner}</span>
            )}
          </div>
          <div className="text-sm text-slate-500">{statusLabels[status]}</div>
        </div>
      </div>

      {oracle.bio && (
        <p className="mb-3 text-sm text-slate-400 line-clamp-2">{oracle.bio}</p>
      )}

      {oracle.expand?.owner && (
        <div className="mb-3 text-sm">
          <span className="text-slate-500">Owner: </span>
          <span className="text-slate-300">@{oracle.expand.owner.github_username || oracle.expand.owner.display_name || 'Unknown'}</span>
        </div>
      )}

      {oracle.repo_url && (
        <a
          href={oracle.repo_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-orange-500 hover:text-orange-400"
        >
          <ExternalLink className="h-3 w-3" />
          Repository
        </a>
      )}
    </div>
  )
}
