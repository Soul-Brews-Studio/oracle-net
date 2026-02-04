import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { pb, getMe, getMyOracles, type Human, type Oracle } from '@/lib/pocketbase'

interface AuthContextType {
  human: Human | null
  oracles: Oracle[]
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
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
    // Only load auth if wallet is connected
    if (pb.authStore.isValid && isConnected) {
      const me = await getMe()
      setHuman(me)
      // Fetch oracles owned by this human
      if (me?.id) {
        const myOracles = await getMyOracles(me.id)
        setOracles(myOracles)
      } else {
        setOracles([])
      }
    } else {
      // Clear stale auth if wallet not connected
      if (!isConnected && pb.authStore.isValid) {
        pb.authStore.clear()
      }
      setHuman(null)
      setOracles([])
    }
    setIsLoading(false)
  }, [isConnected])

  // Clear auth when wallet disconnects
  useEffect(() => {
    if (wasConnected.current && !isConnected) {
      // Wallet was connected, now disconnected - clear auth
      pb.authStore.clear()
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
    if (oracles.length === 0) return

    const sendHeartbeats = async () => {
      for (const oracle of oracles) {
        try {
          const existing = await pb.collection('heartbeats').getFirstListItem(
            `oracle = "${oracle.id}"`
          ).catch(() => null)

          if (existing) {
            await pb.collection('heartbeats').update(existing.id, { status: 'online' })
          } else {
            await pb.collection('heartbeats').create({
              oracle: oracle.id,
              status: 'online'
            })
          }
        } catch (e) {
          console.error('Heartbeat failed for oracle:', oracle.id, e)
        }
      }
    }

    sendHeartbeats()
    const interval = setInterval(sendHeartbeats, 2 * 60 * 1000)

    return () => clearInterval(interval)
  }, [oracles])

  const login = async (email: string, password: string) => {
    await pb.collection('humans').authWithPassword(email, password)
    await fetchAuth()
  }

  const register = async (email: string, password: string, name: string) => {
    await pb.collection('humans').create({
      email,
      password,
      passwordConfirm: password,
      display_name: name,
    })
    await login(email, password)
  }

  const logout = () => {
    pb.authStore.clear()
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
        login,
        register,
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
