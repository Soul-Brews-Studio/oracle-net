import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { API_URL, getMe, getMyOracles, getToken, setToken, type Human, type Oracle } from '@/lib/pocketbase'

interface AuthContextType {
  human: Human | null
  oracles: Oracle[]
  isLoading: boolean
  isAuthenticated: boolean
  logout: () => void
  setHuman: (human: Human | null) => void
  setOracles: (oracles: Oracle[]) => void
  refreshAuth: () => Promise<void>
  // Legacy compatibility - returns first oracle or null
  oracle: Oracle | null
  setOracle: (oracle: Oracle | null) => void
  refreshOracle: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [human, setHuman] = useState<Human | null>(null)
  const [oracles, setOracles] = useState<Oracle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { isConnected } = useAccount()
  const wasConnected = useRef(false)

  const fetchAuth = useCallback(async () => {
    const token = getToken()
    if (token && isConnected) {
      const me = await getMe()
      if (!me) {
        // Token is stale or invalid — clear it so SIWE can re-trigger
        setToken(null)
        setHuman(null)
        setOracles([])
      } else {
        setHuman(me)
        // Fetch oracles owned by this human
        if (me.wallet_address) {
          const myOracles = await getMyOracles()
          setOracles(myOracles)
        } else {
          setOracles([])
        }
      }
    } else if (!isConnected && !token) {
      setHuman(null)
      setOracles([])
    } else if (token && !isConnected) {
      // Token exists but wagmi still reconnecting — wait
    } else {
      setHuman(null)
      setOracles([])
    }
    setIsLoading(false)
  }, [isConnected])

  // Clear auth when wallet disconnects
  useEffect(() => {
    if (wasConnected.current && !isConnected) {
      // Wallet was connected, now disconnected - clear auth
      setToken(null)
      setHuman(null)
      setOracles([])
    }
    wasConnected.current = isConnected
  }, [isConnected])

  useEffect(() => {
    fetchAuth()
  }, [fetchAuth])

  // Heartbeat for all owned oracles
  useEffect(() => {
    const token = getToken()
    if (oracles.length === 0 || !token) return

    const sendHeartbeats = async () => {
      const currentToken = getToken()
      if (!currentToken) return
      for (const oracle of oracles) {
        try {
          await fetch(`${API_URL}/api/heartbeats`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${currentToken}`
            },
            body: JSON.stringify({ oracle: oracle.id, status: 'online' })
          })
        } catch (e) {
          console.error('Heartbeat failed for oracle:', oracle.id, e)
        }
      }
    }

    sendHeartbeats()
    const interval = setInterval(sendHeartbeats, 2 * 60 * 1000)

    return () => clearInterval(interval)
  }, [oracles])

  const logout = () => {
    setToken(null)
    setHuman(null)
    setOracles([])
  }

  const refreshAuth = async () => {
    await fetchAuth()
  }

  // Legacy compatibility
  const oracle = oracles.length > 0 ? oracles[0] : null
  const setOracle = (o: Oracle | null) => {
    if (o) setOracles([o])
    else setOracles([])
  }
  const refreshOracle = refreshAuth

  return (
    <AuthContext.Provider
      value={{
        human,
        oracles,
        isLoading,
        isAuthenticated: !!human,
        logout,
        setHuman,
        setOracles,
        refreshAuth,
        // Legacy
        oracle,
        setOracle,
        refreshOracle,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
