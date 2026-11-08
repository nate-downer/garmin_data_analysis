/**
 * Auth state (Milestone 1.0 phase 2) - the first global Context in this app;
 * everything else is hook-based per-page state, but auth is genuinely global.
 */
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { authAPI } from '../services/api'

interface AuthContextValue {
  isAdmin: boolean
  isLoading: boolean
  email: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    authAPI.me()
      .then((status) => {
        setIsAdmin(status.authenticated && status.role === 'admin')
        setEmail(status.email || null)
      })
      .catch(() => {
        setIsAdmin(false)
        setEmail(null)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const login = async (emailInput: string, password: string) => {
    const status = await authAPI.login(emailInput, password)
    setIsAdmin(status.role === 'admin')
    setEmail(status.email || null)
  }

  const logout = async () => {
    await authAPI.logout()
    setIsAdmin(false)
    setEmail(null)
  }

  return (
    <AuthContext.Provider value={{ isAdmin, isLoading, email, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
