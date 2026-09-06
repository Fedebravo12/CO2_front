import { Navigate, Route, Routes } from 'react-router-dom'
import { SystemProvider } from './context/SystemContext'
import { AppLayout } from './layout/AppLayout'
import { Administracion } from './pages/Administracion'
import { Alertas } from './pages/Alertas'
import { ControlManual } from './pages/ControlManual'
import { Inicio } from './pages/Inicio'
import { NuevoEnsayo } from './pages/NuevoEnsayo'
import { Programas } from './pages/Programas'
import { Registro } from './pages/Registro'

export default function App() {
  return (
    <SystemProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Inicio />} />
          <Route path="nuevo-ensayo" element={<NuevoEnsayo />} />
          <Route path="registro" element={<Registro />} />
          <Route path="programas" element={<Programas />} />
          <Route path="control-manual" element={<ControlManual />} />
          <Route path="alertas" element={<Alertas />} />
          <Route path="admin" element={<Navigate to="/admin/usuarios" replace />} />
          <Route path="admin/:seccion" element={<Administracion />} />
        </Route>
      </Routes>
    </SystemProvider>
  )
}
