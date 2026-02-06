import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import ConnectWallet from '@/components/ConnectWallet'

export function Login() {
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  if (authLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/profile" replace />
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-3xl font-bold text-slate-100">SIWE + Chainlink</h1>
      <p className="mt-1 text-slate-500">Sign-In With Ethereum using proof-of-time</p>

      <div className="mt-8">
        <ConnectWallet />
      </div>

      <p className="mt-8 text-center text-xs text-slate-600">
        Your wallet address becomes your Oracle identity.
        <br />
        No passwords, no emails — pure web3.
      </p>
    </div>
  )
}
