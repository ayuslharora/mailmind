import { createContext, useContext, useEffect, useState } from 'react'
import axiosInstance from '../axiosCalls/axios'

const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // The login cookie is httpOnly, so the page asks the server who is signed in.
  useEffect(() => {
    axiosInstance
      .get('/auth/me')
      .then(({ data }) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const logout = async () => {
    try {
      await axiosInstance.post('/auth/logout')
    } finally {
      setUser(null)
    }
  }

  return <AuthContext.Provider value={{ user, loading, logout }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
