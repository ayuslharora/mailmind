import axios from 'axios'

// Same origin: Vite (development) and Vercel (production) pass /api to the
// Express server, so the login cookie is first-party.
const axiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

export default axiosInstance
