import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LogIn, Settings } from 'lucide-react'
import { ErrorApi } from '../api/http'
import { useAuth } from '../context/AuthContext'

// Los usuarios de demostración los crea `cargar_datos_iniciales --con-ejemplo`
// en el backend. Solo se muestran en desarrollo o en una build de demo.
const MOSTRAR_DEMO = import.meta.env.DEV || import.meta.env.VITE_DEMO === '1'

export function Login() {
  const { usuario, iniciarSesion } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const destino = (loc.state as { desde?: string } | null)?.desde ?? '/'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (usuario) return <Navigate to={destino} replace />

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await iniciarSesion(username.trim(), password)
      nav(destino, { replace: true })
    } catch (err) {
      setError(
        err instanceof ErrorApi && err.status === 401
          ? 'Usuario o contraseña incorrectos.'
          : 'No se pudo conectar con el servidor. Verificá que el backend esté levantado.',
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={enviar}>
        <div className="brand" style={{ marginBottom: 24 }}>
          <div className="brand-mark">
            <Settings size={18} />
          </div>
          <div className="brand-title">Sistema de Grabado Láser</div>
        </div>

        <div className="field">
          <label htmlFor="usuario">Usuario</label>
          <input
            id="usuario"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="clave">Contraseña</label>
          <input
            id="clave"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="login-error">{error}</p>}

        <button className="primary" type="submit" disabled={enviando || !username || !password}>
          <LogIn size={16} /> {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>

        {MOSTRAR_DEMO && (
          <p className="login-demo">
            Datos de demostración: <b>admin</b>, <b>investigador</b> u <b>operador</b>.
            <br />
            La contraseña es igual al usuario.
          </p>
        )}
      </form>
    </div>
  )
}
