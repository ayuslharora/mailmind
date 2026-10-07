import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import PublicRoute from './components/PublicRoute'
import { AuthProvider } from './context/AuthContext'
import Landing from './pages/Landing'
import Today from './pages/Today'
import Ask from './pages/Ask'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/"
            element={
              <PublicRoute>
                <Landing />
              </PublicRoute>
            }
          />
          <Route
            path="/today"
            element={
              <ProtectedRoute>
                <Today />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ask"
            element={
              <ProtectedRoute>
                <Ask />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
