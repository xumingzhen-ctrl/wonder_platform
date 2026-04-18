import React, { createContext, useContext, useState, useEffect } from 'react'
import { authApi, companiesApi } from '../api/index.js'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [companies, setCompanies] = useState([])
  const [currentCompany, setCurrentCompany] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { setLoading(false); return }

    authApi.me()
      .then(({ data }) => {
        setUser(data)
        return companiesApi.list()
      })
      .then(({ data }) => {
        setCompanies(data)
        const savedId = localStorage.getItem('currentCompanyId')
        const found = data.find(c => c.id === savedId) || data[0]
        if (found) setCurrentCompany(found)
      })
      .catch(() => { localStorage.removeItem('token') })
      .finally(() => setLoading(false))
  }, [])

  function switchCompany(company) {
    setCurrentCompany(company)
    localStorage.setItem('currentCompanyId', company.id)
  }

  function login(token, userData) {
    localStorage.setItem('token', token)
    setUser(userData)
    return companiesApi.list().then(({ data }) => {
      setCompanies(data)
      const found = data[0]
      if (found) {
        setCurrentCompany(found)
        localStorage.setItem('currentCompanyId', found.id)
      }
      return found
    })
  }

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('currentCompanyId')
    setUser(null)
    setCompanies([])
    setCurrentCompany(null)
  }

  return (
    <AppContext.Provider value={{
      user, companies, currentCompany,
      loading, login, logout, switchCompany,
      refreshCompanies: () => companiesApi.list().then(r => setCompanies(r.data)),
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
