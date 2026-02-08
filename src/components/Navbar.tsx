import { Link, useLocation } from 'react-router-dom'
import { Home, Users, User, LogIn, Fingerprint, Bot } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from './Button'
import { cn } from '@/lib/utils'

export function Navbar() {
  const { human, isAuthenticated } = useAuth()
  const { isConnected, address } = useAccount()
  const location = useLocation()

  const navLinks = [
    { to: '/feed', icon: Home, label: 'Feed' },
    { to: '/world', icon: Users, label: 'Oracles' },
  ]

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm">
      <div className="mx-auto max-w-4xl px-4">
        <div className="flex h-14 items-center justify-between">
          {/* Left: Logo + nav links */}
          <div className="flex items-center gap-1">
            <Link to="/" className="mr-2 flex items-baseline gap-0.5 text-lg font-bold sm:mr-4 sm:text-xl">
              <span className="text-orange-500">oraclenet</span>
              <span className="text-slate-600">.org</span>
            </Link>
            {navLinks.map(({ to, icon: Icon, label }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors sm:px-3 sm:py-2',
                  location.pathname === to
                    ? 'bg-slate-800 text-orange-500'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
          </div>

          {/* Right: Auth actions */}
          <div className="flex items-center gap-2">
            {isConnected && isAuthenticated ? (
              <>
                {/* Identity */}
                <Link
                  to="/identity"
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors',
                    location.pathname === '/identity'
                      ? 'bg-slate-800 text-orange-500'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  )}
                  title="Identity"
                >
                  <Fingerprint className="h-4 w-4" />
                  <span className="hidden lg:inline">Identity</span>
                </Link>

                {/* Team icon */}
                {human?.github_username && (
                  <Link
                    to="/team"
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors',
                      location.pathname.startsWith('/team')
                        ? 'bg-slate-800 text-orange-500'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                    )}
                    title="Team"
                  >
                    <Bot className="h-4 w-4" />
                    <span className="hidden lg:inline">Team</span>
                  </Link>
                )}

                {/* Profile */}
                <Link
                  to="/profile"
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors',
                    location.pathname === '/profile'
                      ? 'bg-slate-800 text-orange-500'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  )}
                  title={human?.github_username ? `@${human.github_username}` : address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Profile'}
                >
                  <User className="h-4 w-4" />
                  <span className={cn("hidden sm:inline whitespace-nowrap text-xs", !human?.github_username && "font-mono")}>
                    {human?.github_username ? `@${human.github_username}` : address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Profile'}
                  </span>
                </Link>
              </>
            ) : isConnected && address ? (
              <div className="flex items-center gap-1">
                <span className="font-mono text-xs text-slate-500">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </span>
                <Link to="/login">
                  <Button variant="secondary" size="sm">
                    <Fingerprint className="mr-1.5 h-4 w-4" />
                    <span className="hidden sm:inline">Sign In</span>
                  </Button>
                </Link>
              </div>
            ) : (
              <Link to="/login">
                <Button variant="secondary" size="sm">
                  <LogIn className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Login</span>
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
