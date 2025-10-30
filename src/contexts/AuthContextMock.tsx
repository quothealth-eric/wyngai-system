'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

interface User {
  id: string
  email: string
  email_verified: boolean
  created_at: string
  last_login_at?: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  signInWithEmail: (email: string, password: string) => Promise<{ data?: any, error?: any }>
  signUpWithEmail: (email: string, password: string) => Promise<{ data?: any, error?: any }>
  signOut: () => Promise<void>
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check for existing session in localStorage
    const savedUser = localStorage.getItem('wyng_user')
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser))
      } catch (error) {
        localStorage.removeItem('wyng_user')
      }
    }
    setLoading(false)
  }, [])

  const signInWithEmail = async (email: string, password: string) => {
    // Mock authentication - in production this would call the API
    if (email && password.length >= 8) {
      const mockUser: User = {
        id: 'mock-user-' + Date.now(),
        email: email,
        email_verified: true,
        created_at: new Date().toISOString(),
        last_login_at: new Date().toISOString()
      }

      setUser(mockUser)
      localStorage.setItem('wyng_user', JSON.stringify(mockUser))

      return { data: mockUser }
    } else {
      return { error: { message: 'Invalid email or password' } }
    }
  }

  const signUpWithEmail = async (email: string, password: string) => {
    // Mock signup - in production this would call the API
    if (email && password.length >= 8) {
      const mockUser: User = {
        id: 'mock-user-' + Date.now(),
        email: email,
        email_verified: false,
        created_at: new Date().toISOString()
      }

      setUser(mockUser)
      localStorage.setItem('wyng_user', JSON.stringify(mockUser))

      return { data: mockUser }
    } else {
      return { error: { message: 'Password must be at least 8 characters' } }
    }
  }

  const signOut = async () => {
    setUser(null)
    localStorage.removeItem('wyng_user')
  }

  const value = {
    user,
    loading,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    isAuthenticated: !!user
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}