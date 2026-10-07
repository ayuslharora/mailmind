import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Loading from './Loading'

function PublicRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <Loading />
  }

  if (user) {
    return <Navigate to="/today" replace />
  }

  return children
}

export default PublicRoute
