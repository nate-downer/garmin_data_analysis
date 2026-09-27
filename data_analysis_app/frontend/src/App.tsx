import { useEffect } from 'react'
import HomePage from './pages/HomePage'

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
    <div className="min-h-screen">
      <HomePage />
    </div>
  )
}

export default App
