import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { SystemProvider } from './context/SystemContext'
import { AppLayout } from './layout/AppLayout'
import { Administracion } from './pages/Administracion'
import { Alertas } from './pages/Alertas'
import { ControlManual } from './pages/ControlManual'
import { DetalleEnsayo } from './pages/DetalleEnsayo'
import { Login } from './pages/Login'
import { NuevoEnsayo } from './pages/NuevoEnsayo'
import { Programas } from './pages/Programas'
import { Registro } from './pages/Registro'
import { Telemetria } from './pages/Telemetria'

/** Deja pasar solo con sesión iniciada; si no, manda al login y recuerda a dónde iba. */
function ConSesion({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useAuth()
  const loc = useLocation()
  if (cargando) return <div className="splash">Verificando sesión…</div>
  if (!usuario) return <Navigate to="/login" replace state={{ desde: loc.pathname }} />
  return <SystemProvider>{children}</SystemProvider>
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<Login />} />
        <Route
          element={
            <ConSesion>
              <AppLayout />
            </ConSesion>
          }
        >
          <Route index element={<Telemetria />} />
          <Route path="nuevo-ensayo" element={<NuevoEnsayo />} />
          <Route path="registro" element={<Registro />} />
          <Route path="registro/:id" element={<DetalleEnsayo />} />
          <Route path="programas" element={<Programas />} />
          <Route path="control-manual" element={<ControlManual />} />
          <Route path="alertas" element={<Alertas />} />
          <Route path="admin" element={<Navigate to="/admin/usuarios" replace />} />
          <Route path="admin/:seccion" element={<Administracion />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
