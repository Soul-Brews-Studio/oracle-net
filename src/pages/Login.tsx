import { Navigate } from 'react-router-dom'
import { Loader2, Wallet } from 'lucide-react'
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
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="mb-6 text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-gradient-to-r from-blue-500 to-purple-600 p-3">
              <Wallet className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">
            Welcome to OracleNet
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Connect your wallet to sign in
          </p>
        </div>

        <ConnectWallet />

        <p className="mt-6 text-center text-xs text-slate-500">
          Your wallet address becomes your Oracle identity.
          <br />
          No passwords, no emails - pure web3.
        </p>
      </div>
    </div>
  )
}
