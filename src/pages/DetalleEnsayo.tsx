import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { ENSAYOS } from '../mock/data'

export function DetalleEnsayo() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const ensayo = ENSAYOS.find((e) => e.id === id)

  if (!ensayo) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h3>Ensayo no encontrado</h3>
        </div>
        <button className="primary" onClick={() => nav('/registro')}>
          Volver al historial
        </button>
      </section>
    )
  }

  const tone = ensayo.estado === 'Completado' ? 'ok' : ensayo.estado === 'Interrumpido' ? 'warn' : 'danger'

  return (
    <section className="detail-page">
      <div className="detail-header">
        <button className="ghost" onClick={() => nav('/registro')} style={{ display: 'flex', gap: 6 }}>
          <ChevronLeft size={18} /> Volver
        </button>
        <h2>{ensayo.id}</h2>
        <div style={{ width: 40 }} />
      </div>

      <div className="detail-grid">
        <div className="detail-card">
          <h3>Información General</h3>
          <div className="info-rows">
            <div className="info-row">
              <span className="label">ID:</span>
              <span className="value mono">{ensayo.id}</span>
            </div>
            <div className="info-row">
              <span className="label">Lote:</span>
              <span className="value">{ensayo.lote}</span>
            </div>
            <div className="info-row">
              <span className="label">Código LPG:</span>
              <span className="value mono">{ensayo.codigoLpg}</span>
            </div>
            <div className="info-row">
              <span className="label">Fecha:</span>
              <span className="value mono">{ensayo.fecha}</span>
            </div>
            <div className="info-row">
              <span className="label">Programa:</span>
              <span className="value">{ensayo.programa}</span>
            </div>
            <div className="info-row">
              <span className="label">Operador:</span>
              <span className="value">{ensayo.operador}</span>
            </div>
            <div className="info-row">
              <span className="label">Estado:</span>
              <span className={`value st ${tone}`}>{ensayo.estado}</span>
            </div>
            <div className="info-row">
              <span className="label">Duración:</span>
              <span className="value mono">{ensayo.duracion}</span>
            </div>
            <div className="info-row">
              <span className="label">Notas:</span>
              <span className="value">{ensayo.notas}</span>
            </div>
          </div>
        </div>

        <div className="detail-card">
          <h3>Datos de Curva (por agregar)</h3>
          <p style={{ color: 'var(--muted)', marginTop: 16 }}>Aquí irá la imagen/gráfico de la curva</p>
        </div>

        <div className="detail-card">
          <h3>Comentarios (por agregar)</h3>
          <p style={{ color: 'var(--muted)', marginTop: 16 }}>Aquí irá la sección de comentarios</p>
        </div>

        <div className="detail-card">
          <h3>Marcas / Eventos (por agregar)</h3>
          <p style={{ color: 'var(--muted)', marginTop: 16 }}>Aquí irán las marcas y eventos del ensayo</p>
        </div>
      </div>
    </section>
  )
}
