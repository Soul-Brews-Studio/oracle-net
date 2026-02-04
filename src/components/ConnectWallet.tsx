import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi'
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { SIWER_URL } from '../lib/wagmi'
import { pb } from '../lib/pocketbase'

export default function ConnectWallet() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { signMessageAsync } = useSignMessage()
  const { setOracle, refreshOracle } = useAuth()
  
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''

  // Handle wallet connect + SIWE auth
  const handleConnect = async () => {
    setError(null)
    
    // First connect wallet
    const connector = connectors[0]
    if (!connector) {
      setError('No wallet found')
      return
    }

    try {
      connect({ connector })
    } catch (e: any) {
      setError(e.message || 'Failed to connect')
    }
  }

  // After wallet connected, do SIWE auth
  const handleSignIn = async () => {
    if (!address) return
    
    setIsAuthenticating(true)
    setError(null)

    try {
      // Step 1: Get nonce from PocketBase SIWE endpoint
      const nonceRes = await fetch(`${SIWER_URL}/api/auth/siwe/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      })
      const { nonce, message } = await nonceRes.json()

      if (!nonce || !message) {
        throw new Error('Failed to get nonce')
      }

      // Step 2: Sign message with wallet
      const signature = await signMessageAsync({ message })

      // Step 3: Verify with PocketBase SIWE endpoint
      const verifyRes = await fetch(`${SIWER_URL}/api/auth/siwe/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature })
      })
      const result = await verifyRes.json()

      if (!result.success) {
        throw new Error(result.error || 'Verification failed')
      }

      // Step 4: Save to PocketBase auth store and fetch fresh oracle data
      pb.authStore.save(result.token, null)
      await refreshOracle()

    } catch (e: any) {
      setError(e.message || 'Sign in failed')
    } finally {
      setIsAuthenticating(false)
    }
  }

  const handleDisconnect = () => {
    disconnect()
    pb.authStore.clear()
    setOracle(null)
  }

  // Connected and authenticated
  if (isConnected && address) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-1.5 text-sm font-mono text-green-400 ring-1 ring-green-500/30">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse"></span>
            {shortAddress}
          </span>
          <button
            onClick={handleDisconnect}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-400 ring-1 ring-gray-600 hover:bg-gray-800 cursor-pointer"
          >
            Disconnect
          </button>
        </div>

        {/* Sign in button */}
        <button
          onClick={handleSignIn}
          disabled={isAuthenticating}
          className="w-full rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {isAuthenticating ? 'Signing...' : 'Sign In to OracleNet'}
        </button>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
      </div>
    )
  }

  // No wallet installed
  if (connectors.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-center">
          <p className="text-sm text-yellow-400">No wallet detected</p>
          <a 
            href="https://metamask.io/download/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm text-blue-400 hover:underline"
          >
            Install MetaMask →
          </a>
        </div>
      </div>
    )
  }

  // Not connected
  return (
    <div className="space-y-4">
      <button
        onClick={handleConnect}
        disabled={isConnecting}
        className="w-full rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-3 font-semibold text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
      >
        {isConnecting ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Connecting...
          </span>
        ) : (
          'Connect Wallet'
        )}
      </button>
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  )
}
