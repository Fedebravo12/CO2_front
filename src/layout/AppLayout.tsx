import { AvisoEmergencia } from '../components/AvisoEmergencia'
import { ThemeToggle } from '../components/ThemeToggle'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Bell,
  Check,
  ScanLine,
  ClipboardList,
  FolderKanban,
  Home,
  ListChecks,
  LogOut,
  X,
  Play,
  Settings,
  SlidersHorizontal,
  MonitorPlay,
  Square,
  User,
} from 'lucide-react'
import { VERSION } from '../mock/data'
import type { EstadoSistema } from '../mock/types'
import { useAuth } from '../context/AuthContext'
import { useSystem } from '../context/SystemContext'

const NAV = [
  { to: '/', label: 'Telemetría', icon: Home, end: true },
  { to: '/nuevo-ensayo', label: 'Nuevo ensayo', icon: Play },
  { to: '/simulador', label: 'Simulador visual', icon: MonitorPlay },
  { to: '/registro', label: 'Historial de registros', icon: ClipboardList },
  { to: '/programas', label: 'Programas de grabado', icon: FolderKanban },
  { to: '/procedimientos', label: 'Procedimientos', icon: ListChecks },
  { to: '/control-manual', label: 'Control manual', icon: SlidersHorizontal },
  { to: '/alertas', label: 'Alertas / Eventos', icon: Bell },
  // Las secciones (usuarios, umbrales, auditoría) se eligen con las tabs de la página.
  { to: '/admin', label: 'Administración', icon: Settings },
]

/** Nombre de la sección actual, para la barra superior en pantallas angostas. */
function seccionActual(pathname: string) {
  const item = NAV.find((n) => (n.end ? pathname === n.to : pathname === n.to || pathname.startsWith(`${n.to}/`)))
  return item?.label ?? 'Sistema de Grabado Láser'
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function claseDeEstado(estado: EstadoSistema) {
  if (estado === 'LISTO') return 'ready'
  if (estado === 'PREPARACIÓN') return 'prep'
  if (estado === 'GRABANDO') return 'run'
  if (estado === 'REPOSO') return 'idle'
  return 'emg' // EMERGENCIA y SIN CONEXIÓN
}

function StatusIcon({ estado }: { estado: EstadoSistema }) {
  const cls = claseDeEstado(estado)
  return (
    <div className={`status-ico ${cls}`}>
      {estado === 'LISTO' ? <Check size={28} /> : <span style={{ fontSize: 22 }}>●</span>}
    </div>
  )
}

export function AppLayout() {
  const { pathname } = useLocation()
  const dashboard = pathname === '/'
  const { rol, estado, emergencia, now, controlador, errorComando, errorTelemetria } = useSystem()
  const { usuario, cerrarSesion } = useAuth()
  const [confirmSalir, setConfirmSalir] = useState(false)
  const [sidebarCompact, setSidebarCompact] = useState(false)
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 900px)').matches)
  const [mobileOpen, setMobileOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const sidebar = useRef<HTMLElement>(null)
  const app = useRef<HTMLDivElement>(null)
  const topbar = useRef<HTMLElement>(null)

  // El menú desplegable empieza justo debajo de la cabecera, para que la parada
  // de emergencia siga visible. Se mide la altura real: cambia con la pantalla.
  useEffect(() => {
    const cabecera = topbar.current
    if (!cabecera) return
    const medir = () => app.current?.style.setProperty('--header-outer-height', `${cabecera.offsetHeight}px`)
    const observer = new ResizeObserver(medir)
    observer.observe(cabecera)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)')
    const resize = () => { setNarrow(media.matches); setMobileOpen(false) }
    media.addEventListener('change', resize)
    return () => media.removeEventListener('change', resize)
  }, [])
  useEffect(() => { setMobileOpen(false) }, [pathname, estado])
  useEffect(() => {
    if (!mobileOpen) return
    sidebar.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMobileOpen(false) }
    }
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('keydown', escape)
      if (window.matchMedia('(max-width: 900px)').matches) menuButton.current?.focus()
    }
  }, [mobileOpen])

  const fecha = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`
  const hora = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const statusCls = claseDeEstado(estado)
  const sinConexion = estado === 'SIN CONEXIÓN'
  // Conservar el aviso si la comunicación se pierde durante una emergencia.
  const emergenciaActiva = controlador?.estado === 'EMERGENCIA'
  const avisoControlador = controlador?.mensaje?.nivel === 'error' || controlador?.mensaje?.nivel === 'warn'
  const hayAvisos = emergenciaActiva || sinConexion || errorComando || errorTelemetria || avisoControlador

  return (
    <div ref={app} className={`app ${dashboard ? 'app-dashboard' : ''}`}>
      {narrow && mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" />}
      <aside id="app-sidebar" ref={sidebar} aria-label="Menú principal" className={`sidebar ${!narrow && sidebarCompact ? 'compact' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="brand">
            <button
              type="button"
              className="brand-mark"
              onClick={() => narrow ? setMobileOpen(false) : setSidebarCompact(!sidebarCompact)}
              aria-label={narrow ? 'Cerrar menú' : sidebarCompact ? 'Expandir menú' : 'Compactar menú'}
              title={narrow ? 'Cerrar menú' : sidebarCompact ? 'Expandir menú' : 'Compactar menú'}
            >
              {narrow ? <X size={18} /> : <ScanLine size={18} />}
            </button>
            <div className="brand-title">Sistema de Grabado Láser</div>
          </div>
        </div>

        <nav className="nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              end={item.end}
              title={sidebarCompact ? item.label : undefined}
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''} ${isActive && item.to === '/nuevo-ensayo' ? 'teal' : ''}`
              }
            >
              <item.icon size={18} />
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}

        </nav>

        <div className="sidebar-foot">
          <ThemeToggle />
          <div className="user-card">
            <div className="user-meta">
              <User size={16} />
              <div>
                <strong>{usuario?.nombre}</strong>
                <span>{rol}</span>
              </div>
            </div>
            <button type="button" onClick={() => { setMobileOpen(false); setConfirmSalir(true) }} aria-label="Cerrar sesión" title="Cerrar sesión">
              <LogOut size={16} />
            </button>
          </div>
          <div className="clock">
            <span>
              {fecha} · {hora}
            </span>
            <span>Versión {VERSION}</span>
          </div>
        </div>
      </aside>

      <div className="main">
        <header ref={topbar} className="topbar">
          {narrow && (
            // Pantallas angostas: el ícono de la app abre el menú y al lado va la sección actual.
            <div className="mobile-bar">
              <button ref={menuButton} type="button" className="brand-mark mobile-bar-menu"
                aria-label={mobileOpen ? 'Cerrar menú principal' : 'Abrir menú principal'}
                aria-expanded={mobileOpen} aria-controls="app-sidebar"
                onClick={() => setMobileOpen(open => !open)}>
                {mobileOpen ? <X size={18} /> : <ScanLine size={18} />}
              </button>
              <h1 className="mobile-bar-title">{seccionActual(pathname)}</h1>
            </div>
          )}
          <div className="status-card">
            <div className="status-heading">
              <div>
                <h2>ESTADO DEL SISTEMA</h2>
                <p className={`status-value ${statusCls}`}>{estado}</p>
              </div>
            </div>
            <div id="telemetria-toolbar" />
            {hayAvisos ? <AvisoEmergencia /> : <StatusIcon estado={estado} />}
          </div>
          <button
            className="estop-card"
            type="button"
            disabled={estado === 'EMERGENCIA' || sinConexion}
            title={sinConexion ? 'Sin conexión al controlador: usar el pulsador físico' : undefined}
            onClick={() => emergencia()}
            aria-label="Parada de emergencia"
          >
            <span className="estop-label">
              PARADA DE
              <br />
              EMERGENCIA
            </span>
            <span className="estop-btn" aria-hidden="true">
              <Square size={22} fill="white" />
            </span>
          </button>
        </header>

        <div className="page">
          <Outlet />
        </div>
      </div>

      {confirmSalir && (
        <div className="modal-bg" onClick={() => setConfirmSalir(false)}>
          <div
            className="modal neutral"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-salir"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="titulo-salir">Cerrar sesión</h3>
            <p>¿Querés cerrar la sesión de {usuario?.nombre}? Para volver a operar vas a tener que ingresar de nuevo.</p>
            {estado !== 'REPOSO' && estado !== 'SIN CONEXIÓN' && (
              // Cerrar sesión solo borra el token: el controlador sigue con lo que estaba.
              <p className="aviso-ctrl warn">
                El equipo no está en reposo ({estado}). Cerrar sesión no lo apaga ni detiene el grabado.
              </p>
            )}
            <div className="modal-actions">
              <button className="ghost" type="button" autoFocus onClick={() => setConfirmSalir(false)}>
                Cancelar
              </button>
              <button className="primary" type="button" onClick={cerrarSesion}>
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
