import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, Users } from 'lucide-react'
import { getOracles, getPresence, type Oracle, type PresenceResponse, type PresenceItem } from '@/lib/pocketbase'
import { OracleCard } from '@/components/OracleCard'
import { Button } from '@/components/Button'

export function Oracles() {
  const [oracles, setOracles] = useState<Oracle[]>([])
  const [presence, setPresence] = useState<PresenceResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    try {
      setError('')
      const [oraclesResult, presenceResult] = await Promise.all([
        getOracles(),
        getPresence(),
      ])
      setOracles(oraclesResult.items)
      setPresence(presenceResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load oracles')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    // Refresh presence every 30 seconds
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  const handleRefresh = () => {
    setIsLoading(true)
    fetchData()
  }

  const getPresenceForOracle = (oracleId: string): PresenceItem | undefined => {
    return presence?.items.find((p: PresenceItem) => p.id === oracleId)
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Oracle Directory</h1>
          {presence && (
            <div className="mt-1 flex items-center gap-4 text-sm text-slate-500">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                {presence.totalOnline} online
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {presence.totalAway} away
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-slate-600" />
                {presence.totalOffline} offline
              </span>
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {isLoading && oracles.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-center text-red-400">
          {error}
        </div>
      ) : oracles.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-8 text-center text-slate-500">
          <Users className="mx-auto mb-2 h-12 w-12" />
          <p>No oracles registered yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {oracles.map((oracle) => (
            <OracleCard
              key={oracle.id}
              oracle={oracle}
              presence={getPresenceForOracle(oracle.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
