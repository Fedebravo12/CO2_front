/**
 * Cliente HTTP contra el backend (CO2_back).
 *
 * Todas las rutas son relativas (`/api/...`): en Docker el nginx del backend
 * sirve el front y la API desde el mismo origen, y en desarrollo el proxy de
 * Vite hace lo mismo. Así no hay CORS ni URLs absolutas que configurar.
 *
 * La sesión es JWT. El token de acceso dura 30 min; cuando vence, este módulo
 * lo renueva con el de refresco y reintenta la petición una vez. Si la
 * renovación también falla, la sesión terminó y se avisa a quien se haya
 * suscrito con `alExpirarSesion` (el AuthContext, que manda al login).
 *
 * Los tokens van en sessionStorage y no en localStorage a propósito: la PC del
 * laboratorio es compartida, y cerrar el navegador tiene que cerrar la sesión.
 */

const CLAVE_SESION = 'co2.sesion'

interface Tokens {
  access: string
  refresh: string
}

export class ErrorApi extends Error {
  constructor(
    public status: number,
    mensaje: string,
  ) {
    super(mensaje)
    this.name = 'ErrorApi'
  }
}

export function leerTokens(): Tokens | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE_SESION)
    return crudo ? (JSON.parse(crudo) as Tokens) : null
  } catch {
    return null
  }
}

export function guardarTokens(tokens: Tokens) {
  sessionStorage.setItem(CLAVE_SESION, JSON.stringify(tokens))
}

export function borrarTokens() {
  sessionStorage.removeItem(CLAVE_SESION)
}

let alExpirar: (() => void) | null = null

/** Registra qué hacer cuando la sesión vence y no se puede renovar. */
export function alExpirarSesion(callback: (() => void) | null) {
  alExpirar = callback
}

// Si varias peticiones reciben 401 a la vez, se renueva el token una sola vez
// y todas esperan esa misma renovación.
let renovacionEnCurso: Promise<boolean> | null = null

async function renovarAcceso(): Promise<boolean> {
  const tokens = leerTokens()
  if (!tokens) return false
  renovacionEnCurso ??= (async () => {
    try {
      const r = await fetch('/api/auth/token/refresh/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: tokens.refresh }),
      })
      if (!r.ok) return false
      const { access } = (await r.json()) as { access: string }
      guardarTokens({ ...tokens, access })
      return true
    } catch {
      return false
    } finally {
      renovacionEnCurso = null
    }
  })()
  return renovacionEnCurso
}

async function mensajeDeError(r: Response): Promise<string> {
  try {
    const cuerpo = await r.json()
    if (typeof cuerpo?.detail === 'string') return cuerpo.detail
    // Errores de validación de DRF: { campo: ["mensaje"] }
    return Object.entries(cuerpo)
      .map(([campo, msgs]) => `${campo}: ${Array.isArray(msgs) ? msgs.join(' ') : msgs}`)
      .join(' · ')
  } catch {
    return `Error ${r.status}`
  }
}

/**
 * Hace una petición autenticada a la API y devuelve el JSON de la respuesta.
 *
 * @throws ErrorApi si la respuesta no es 2xx.
 */
export async function pedir<T>(ruta: string, init: RequestInit = {}, reintento = true): Promise<T> {
  const tokens = leerTokens()
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (tokens) headers.set('Authorization', `Bearer ${tokens.access}`)

  const r = await fetch(`/api${ruta}`, { ...init, headers })

  if (r.status === 401 && tokens && reintento) {
    if (await renovarAcceso()) return pedir<T>(ruta, init, false)
    borrarTokens()
    alExpirar?.()
  }
  if (!r.ok) throw new ErrorApi(r.status, await mensajeDeError(r))
  if (r.status === 204) return undefined as T
  return (await r.json()) as T
}

/** Petición sin autenticación (login y healthcheck). */
export async function pedirPublico<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  const r = await fetch(`/api${ruta}`, { ...init, headers })
  if (!r.ok) throw new ErrorApi(r.status, await mensajeDeError(r))
  return (await r.json()) as T
}
