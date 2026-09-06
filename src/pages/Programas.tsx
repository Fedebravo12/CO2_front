import { useEffect, useState } from 'react'
import { PROGRAMAS } from '../mock/data'
import { api } from '../mock/api'
import type { Programa } from '../mock/types'
import { useSystem } from '../context/SystemContext'
import { fmt } from '../components/Meters'

export function Programas() {
  const { rol, setProgramaId } = useSystem()
  const [rows, setRows] = useState<Programa[]>(PROGRAMAS)
  const [sel, setSel] = useState<Programa>(PROGRAMAS[0])
  const canEdit = rol === 'Administrador' || rol === 'Investigador'

  useEffect(() => {
    api.listarProgramas().then(setRows)
  }, [])

  return (
    <>
      <h1 className="page-title">Programas de grabado</h1>
      <div className="cards-2">
        <section className="panel">
          <div className="panel-head">
            <h3>BIBLIOTECA</h3>
            {canEdit && (
              <button className="primary" type="button">
                + Nuevo programa
              </button>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>NOMBRE</th>
                  <th>POTENCIA</th>
                  <th>PULSO</th>
                  <th>ΔX</th>
                  <th>PULSOS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className={sel.id === p.id ? 'sel' : ''} onClick={() => setSel(p)}>
                    <td>{p.nombre}</td>
                    <td className="mono">{fmt(p.potenciaObjetivoMw)} mW</td>
                    <td className="mono">{p.duracionPulsoMs} ms</td>
                    <td className="mono">{p.desplazamientoUm} µm</td>
                    <td className="mono">{p.pulsosEstimados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!canEdit && (
            <p style={{ color: 'var(--muted)', marginTop: 12 }}>
              El rol Operador no puede crear ni editar programas (RN011 / RF006).
            </p>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>DETALLE · {sel.nombre}</h3>
            <button className="ghost" type="button" onClick={() => setProgramaId(sel.id)}>
              Usar en próximo ensayo
            </button>
          </div>
          <div className="kv">
            <div>
              <span>Potencia objetivo</span>
              <b>{fmt(sel.potenciaObjetivoMw)} mW</b>
            </div>
            <div>
              <span>Duración de pulso</span>
              <b>{sel.duracionPulsoMs} ms</b>
            </div>
            <div>
              <span>Desplazamiento por pulso</span>
              <b>{sel.desplazamientoUm} µm</b>
            </div>
            <div>
              <span>Criterio de finalización</span>
              <b>{sel.criterioFin}</b>
            </div>
            <div>
              <span>Distancia total</span>
              <b>{fmt(sel.distanciaMm)} mm</b>
            </div>
            <div>
              <span>Pulsos estimados</span>
              <b>{sel.pulsosEstimados}</b>
            </div>
            <div>
              <span>Última actualización</span>
              <b>{sel.actualizado}</b>
            </div>
            <div>
              <span>Creado por</span>
              <b>{sel.creadoPor}</b>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
