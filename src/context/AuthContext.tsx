import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ROL_DE_CODIGO, type UsuarioApi } from '../api/client'
import { alExpirarSesion, borrarTokens, guardarTokens, leerTokens, pedir, pedirPublico } from '../api/http'
import type { Rol } from '../mock/types'

export interface UsuarioSesion {
  username: string
  nombre: string
  rol: Rol
}

interface AuthValue {
  usuario: UsuarioSesion | null
  /** `true` mientras se verifica una sesión guardada al cargar la página. */
  cargando: boolean
  iniciarSesion: (username: string, password: string) => Promise<void>
  cerrarSesion: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

function aSesion(u: UsuarioApi): UsuarioSesion {
  // Sin rol asignado se trata como Operador: es el rol con menos permisos, y
  // el backend aplica igual sus propias restricciones.
  return { username: u.username, nombre: u.nombre, rol: u.rol ? ROL_DE_CODIGO[u.rol] : 'Operador' }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null)
  const [cargando, setCargando] = useState(() => leerTokens() !== null)

  const cerrarSesion = useCallback(() => {
    borrarTokens()
    setUsuario(null)
  }, [])

  // Si el token de refresco vence a mitad de un turno, la próxima petición lo
  // detecta y se vuelve al login en lugar de mostrar pantallas vacías.
  useEffect(() => {
    alExpirarSesion(() => setUsuario(null))
    return () => alExpirarSesion(null)
  }, [])

  // Al recargar la página hay token pero no usuario: se pregunta quién es.
  useEffect(() => {
    if (!leerTokens()) return
    pedir<UsuarioApi>('/auth/yo/')
      .then((u) => setUsuario(aSesion(u)))
      .catch(() => borrarTokens())
      .finally(() => setCargando(false))
  }, [])

  const iniciarSesion = useCallback(async (username: string, password: string) => {
    const r = await pedirPublico<{ access: string; refresh: string; usuario: UsuarioApi }>('/auth/token/', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    guardarTokens({ access: r.access, refresh: r.refresh })
    setUsuario(aSesion(r.usuario))
  }, [])

  const value = useMemo(
    () => ({ usuario, cargando, iniciarSesion, cerrarSesion }),
    [usuario, cargando, iniciarSesion, cerrarSesion],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fuera de AuthProvider')
  return ctx
}
