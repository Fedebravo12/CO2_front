import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, X, Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { CurvaChart } from '../components/CurvaChart'
import type { Ensayo } from '../mock/types'

export function DetalleEnsayo() {
  const { id = '' } = useParams<{ id: string }>()
  const nav = useNavigate()
  const [ensayo, setEnsayo] = useState<Ensayo | null>(null)
  const [curvaCsv, setCurvaCsv] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCargando(true)
    // La curva va aparte: si la red no fue caracterizada todavía, el ensayo se
    // muestra igual y el gráfico avisa que no hay datos.
    Promise.all([api.obtenerEnsayo(id), api.obtenerCurvaCsv(id)])
      .then(([e, c]) => {
        setEnsayo(e)
        setCurvaCsv(c)
        setError(null)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setCargando(false))
  }, [id])
  const [comentarios, setComentarios] = useState<string[]>([])
  const [nuevoComentario, setNuevoComentario] = useState('')
  const [mostrarFormulario, setMostrarFormulario] = useState(false)

  const agregarComentario = () => {
    if (nuevoComentario.trim()) {
      setComentarios([...comentarios, nuevoComentario])
      setNuevoComentario('')
      setMostrarFormulario(false)
    }
  }

  const eliminarComentario = (index: number) => {
    setComentarios(comentarios.filter((_, i) => i !== index))
  }

  const exportar = () => {
    if (ensayo) {
      const csv = api.exportarEnsayosCsv([ensayo])
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `ensayo-${ensayo.id}.csv`
      a.click()
    }
  }

  if (cargando) {
    return <section className="panel"><p style={{ color: 'var(--muted)' }}>Cargando ensayo…</p></section>
  }

  if (!ensayo) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h3>{error ? `No se pudo cargar el ensayo: ${error}` : 'Ensayo no encontrado'}</h3>
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
        <button className="ghost" onClick={exportar} style={{ display: 'flex', gap: 6 }}>
          <Download size={18} /> Exportar
        </button>
      </div>

      <div className="detail-grid">
        <div className="detail-card">
          <h3>GRABADO</h3>
          <div className="info-rows">
            <div className="info-row">
              <span className="label">Lote:</span>
              <span className="value">{ensayo.lote}</span>
            </div>
            <div className="info-row">
              <span className="label">Código:</span>
              <span className="value mono">{ensayo.codigoLpg}</span>
            </div>
            <div className="info-row">
              <span className="label">Fecha:</span>
              <span className="value mono">{ensayo.fecha}</span>
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
          </div>
        </div>

        <div className="detail-card">
          <h3>SETEOS PREVIOS</h3>
          <div className="info-rows">
            <div className="info-row">
              <span className="label">Programa:</span>
              <span className="value">{ensayo.programa}</span>
            </div>
            <div className="info-row">
              <span className="label">Periodo de red:</span>
              <span className="value">{ensayo.periodoRed}</span>
            </div>
            <div className="info-row">
              <span className="label">I SLD:</span>
              <span className="value">{ensayo.iSld}</span>
            </div>
            <div className="info-row">
              <span className="label">Tensión de referencia:</span>
              <span className="value">{ensayo.tensionReferencia}</span>
            </div>
            <div className="info-row">
              <span className="label">Escala vertical OSA:</span>
              <span className="value">{ensayo.escalaVerticalOsa}</span>
            </div>
            <div className="info-row">
              <span className="label">Span:</span>
              <span className="value">{ensayo.span}</span>
            </div>
            <div className="info-row">
              <span className="label">Sensibilidad:</span>
              <span className="value">{ensayo.sensibilidad}</span>
            </div>
            <div className="info-row">
              <span className="label">Resolución:</span>
              <span className="value">{ensayo.resolucion}</span>
            </div>
          </div>
        </div>

        <div className="detail-card">
          <h3>SECCION POST GRABADO</h3>
          <div className="info-rows">
            <div className="info-row">
              <span className="label">Cantidad de marcas:</span>
              <span className="value">{ensayo.cantidadMarcas}</span>
            </div>
            <div className="info-row">
              <span className="label">Longitud LPG:</span>
              <span className="value">{ensayo.longitudLpg}</span>
            </div>
            <div className="info-row">
              <span className="label">λ:</span>
              <span className="value">{ensayo.lambda}</span>
            </div>
            <div className="info-row">
              <span className="label">L:</span>
              <span className="value">{ensayo.l}</span>
            </div>
            <div className="info-row">
              <span className="label">λ secundario:</span>
              <span className="value">{ensayo.lambdaSecundario}</span>
            </div>
            <div className="info-row">
              <span className="label">L secundario:</span>
              <span className="value">{ensayo.lSecundario}</span>
            </div>
          </div>
        </div>

        <div className="detail-card">
          <h3>DATOS DE CURVA</h3>
          <CurvaChart csv={curvaCsv ?? ''} />
        </div>

        <div className="detail-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>COMENTARIOS</h3>
            <button
              className="ghost"
              onClick={() => setMostrarFormulario(!mostrarFormulario)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px' }}
              title="Agregar comentario"
            >
              <Plus size={18} />
            </button>
          </div>

          {comentarios.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {comentarios.map((comentario, index) => (
                <div
                  key={index}
                  style={{
                    padding: 12,
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--text)' }}>{comentario}</p>
                  <button
                    className="ghost"
                    onClick={() => eliminarComentario(index)}
                    style={{ padding: 4, display: 'flex', alignItems: 'center' }}
                    title="Eliminar comentario"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--muted)', marginTop: 16, marginBottom: 16, textAlign: 'center' }}>No hay comentarios aún</p>
          )}

          {mostrarFormulario && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                value={nuevoComentario}
                onChange={(e) => setNuevoComentario(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    agregarComentario()
                  }
                }}
                placeholder="Escribe un comentario..."
                style={{
                  padding: 12,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontFamily: 'inherit',
                  fontSize: 14,
                  minHeight: 80,
                  resize: 'vertical',
                  backgroundColor: 'var(--bg)',
                  color: 'var(--text)',
                }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  className="ghost"
                  onClick={() => {
                    setMostrarFormulario(false)
                    setNuevoComentario('')
                  }}
                >
                  Cancelar
                </button>
                <button
                  className="primary"
                  onClick={agregarComentario}
                  disabled={!nuevoComentario.trim()}
                >
                  Agregar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="detail-card">
          <h3>MARCAS / EVENTOS</h3>
          <p style={{ color: 'var(--muted)', marginTop: 16 }}></p>
        </div>
      </div>
    </section>
  )
}
