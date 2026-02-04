import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Users, ExternalLink } from 'lucide-react'
import { getTeamOracles, getPresence, type Oracle, type PresenceItem } from '@/lib/pocketbase'
import { cn, getAvatarGradient, getDisplayInfo } from '@/lib/utils'

interface TeamSectionProps {
  owner: string
  compact?: boolean
}

const statusColors = {
  online: 'bg-green-500',
  away: 'bg-amber-500',
  offline: 'bg-slate-600',
}

function CompactOracleCard({ oracle, presence }: { oracle: Oracle; presence?: PresenceItem }) {
  const status: 'online' | 'away' | 'offline' = presence?.status || 'offline'
  const displayInfo = getDisplayInfo(oracle)

  return (
    <Link
      to={`/oracles`}
      className="block rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition-colors hover:border-orange-500/50 hover:bg-slate-800/50"
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarGradient(oracle.name)} text-lg font-bold text-white`}>
            {oracle.name[0]?.toUpperCase() || '?'}
          </div>
          <div
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-900',
              statusColors[status]
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-100 truncate">
              {displayInfo.displayName}
            </span>
            {displayInfo.label && (
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${
                displayInfo.type === 'oracle'
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'bg-blue-500/20 text-blue-400'
              }`}>
                {displayInfo.label}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-1">
            <span className={cn('inline-block h-1.5 w-1.5 rounded-full', statusColors[status])} />
            {status === 'online' ? 'Online' : status === 'away' ? 'Away' : 'Offline'}
          </div>
        </div>
      </div>
    </Link>
  )
}

export function TeamSection({ owner, compact = false }: TeamSectionProps) {
  const [oracles, setOracles] = useState<Oracle[]>([])
  const [presenceMap, setPresenceMap] = useState<Map<string, PresenceItem>>(new Map())
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchTeam() {
      try {
        const [teamOracles, presenceData] = await Promise.all([
          getTeamOracles(owner),
          getPresence(),
        ])
        setOracles(teamOracles)

        const pMap = new Map<string, PresenceItem>()
        for (const item of presenceData.items) {
          pMap.set(item.name, item)
        }
        setPresenceMap(pMap)
      } catch (err) {
        console.error('Failed to fetch team:', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchTeam()
  }, [owner])

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    )
  }

  if (oracles.length === 0) {
    return null
  }

  const onlineCount = oracles.filter(o => presenceMap.get(o.name)?.status === 'online').length
  const offlineCount = oracles.length - onlineCount

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-orange-500" />
          <h3 className="text-lg font-semibold text-white">
            {owner}'s AI Team
          </h3>
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-sm text-slate-400">
            {oracles.length} agent{oracles.length !== 1 ? 's' : ''}
          </span>
        </div>
        {!compact && (
          <Link
            to={`/team/${owner}`}
            className="flex items-center gap-1 text-sm text-orange-500 hover:text-orange-400 transition-colors"
          >
            View all <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>

      <div className={cn(
        'grid gap-3',
        compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      )}>
        {oracles.slice(0, compact ? 4 : undefined).map((oracle) => (
          <CompactOracleCard
            key={oracle.id}
            oracle={oracle}
            presence={presenceMap.get(oracle.name)}
          />
        ))}
      </div>

      {compact && oracles.length > 4 && (
        <Link
          to={`/team/${owner}`}
          className="mt-4 block text-center text-sm text-orange-500 hover:text-orange-400 transition-colors"
        >
          View all {oracles.length} agents
        </Link>
      )}

      <div className="mt-4 pt-4 border-t border-slate-800 text-sm text-slate-500">
        {onlineCount} online • {offlineCount} offline
      </div>
    </div>
  )
}
