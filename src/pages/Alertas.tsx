import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Alerta } from '../mock/types'

export function Alertas() {
  const [rows, setRows] = useState<Alerta[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.listarAlertas().then(setRows).catch((e: Error) => setError(e.message))
  }, [])

  // El reconocimiento queda asentado en el backend con quién y cuándo; acá se
  // recarga la lista para mostrar el estado real y no uno optimista.
  const reconocer = async (id: string) => {
    try {
      setRows(await api.reconocerAlerta(id))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <h1 className="page-title">Alertas / Eventos</h1>
      <section className="panel">
        <div className="panel-head">
          <h3>HISTORIAL DE ALARMAS Y EMERGENCIAS</h3>
          <span className="pill">{rows.filter((a) => !a.reconocida).length} sin reconocer</span>
        </div>
        {error && <p className="login-error" style={{ margin: '0 0 12px' }}>{error}</p>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>FECHA</th>
                <th>SEVERIDAD</th>
                <th>ORIGEN</th>
                <th>MENSAJE</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const tone = a.severidad === 'critical' ? 'danger' : a.severidad === 'warning' ? 'warn' : 'info'
                return (
                  <tr key={a.id}>
                    <td className="mono">{a.fecha}</td>
                    <td>
                      <span className={`st ${tone}`}>{a.severidad}</span>
                    </td>
                    <td>{a.origen}</td>
                    <td>{a.mensaje}</td>
                    <td>
                      {a.reconocida ? (
                        <span style={{ color: 'var(--dim)' }}>Reconocida</span>
                      ) : (
                        <button className="ghost" type="button" onClick={() => reconocer(a.id)}>
                          Reconocer
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
