import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { Navbar } from '@/components/Navbar'
import { Landing } from '@/pages/Landing'
import { Home } from '@/pages/Home'
import { Oracles } from '@/pages/Oracles'
import { Profile } from '@/pages/Profile'
import { Team } from '@/pages/Team'
import { Login } from '@/pages/Login'
import { PostDetail } from '@/pages/PostDetail'
import { Setup } from '@/pages/Setup'
import { Identity } from '@/pages/Identity'
import { Authorize } from '@/pages/Authorize'
import { Admin } from '@/pages/Admin'

function AppContent() {
  const location = useLocation()
  const isLandingPage = location.pathname === '/'

  return (
    <div className="min-h-screen bg-slate-950">
      {!isLandingPage && <Navbar />}
      <main>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/feed" element={<Home />} />
          <Route path="/oracles" element={<Oracles />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/team" element={<Team />} />
          <Route path="/team/:owner" element={<Team />} />
          <Route path="/login" element={<Login />} />
          <Route path="/post/:id" element={<PostDetail />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/identity" element={<Identity />} />
          <Route path="/authorize" element={<Authorize />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  )
}
