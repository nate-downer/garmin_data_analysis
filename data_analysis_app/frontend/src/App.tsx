import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import AnalysisPage from './pages/AnalysisPage'
import ModelDiagnosticsPage from './pages/ModelDiagnosticsPage'
import PlanRoutesPage from './pages/PlanRoutesPage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import { AuthProvider } from './context/AuthContext'

function App() {
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY
      // Move background at half speed (parallax effect)
      document.body.style.backgroundPosition = `0 ${scrollY * 0.5}px`
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/app" element={<HomePage />} />
            <Route path="/analysis" element={<AnalysisPage />} />
            <Route path="/build-model" element={<ModelDiagnosticsPage />} />
            <Route path="/plan-routes" element={<PlanRoutesPage />} />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
