import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Filter, Play, RotateCcw, Search } from 'lucide-react'
import { api } from '../mock/api'
import { ENSAYOS, PROGRAMAS } from '../mock/data'
import type { Ensayo, FiltrosEnsayo } from '../mock/types'

const EMPTY: FiltrosEnsayo = {
  desde: '',
  hasta: '',
  programa: 'Todos',
  estado: 'Todos',
  resultado: 'Todos',
  operador: 'Todos',
  busqueda: '',
}

export function Registro() {
  const nav = useNavigate()
  const [filtros, setFiltros] = useState<FiltrosEnsayo>(EMPTY)
  const [rows, setRows] = useState<Ensayo[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)

  useEffect(() => {
    api.listarEnsayos(filtros).then((data) => {
      setRows(data)
      setPage(1)
    })
  }, [filtros])

  const pages = Math.max(1, Math.ceil(rows.length / perPage))
  const slice = useMemo(() => rows.slice((page - 1) * perPage, page * perPage), [rows, page, perPage])
  const operadores = ['Todos', ...new Set(ENSAYOS.map((r) => r.operador))]

  const set = (k: keyof FiltrosEnsayo, v: string) => setFiltros((f) => ({ ...f, [k]: v }))

  const exportar = () => {
    const csv = api.exportarEnsayosCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'registro-ensayos.csv'
    a.click()
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>
          <Filter size={14} style={{ marginRight: 6 }} />
          FILTROS
        </h3>
      </div>

      <div className="filters">
        <div className="field">
          <label>Fecha desde</label>
          <input type="date" value={filtros.desde} onChange={(e) => set('desde', e.target.value)} />
        </div>
        <div className="field">
          <label>Fecha hasta</label>
          <input type="date" value={filtros.hasta} onChange={(e) => set('hasta', e.target.value)} />
        </div>
        <div className="field">
          <label>Programa</label>
          <select value={filtros.programa} onChange={(e) => set('programa', e.target.value)}>
            <option>Todos</option>
            {PROGRAMAS.map((p) => (
              <option key={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Estado</label>
          <select value={filtros.estado} onChange={(e) => set('estado', e.target.value)}>
            <option>Todos</option>
            <option>Completado</option>
            <option>Interrumpido</option>
            <option>Error</option>
          </select>
        </div>
        <div className="field">
          <label>Resultado</label>
          <select value={filtros.resultado} onChange={(e) => set('resultado', e.target.value)}>
            <option>Todos</option>
            <option>OK</option>
            <option>—</option>
            <option>Fallo lazo láser</option>
          </select>
        </div>
        <div className="field">
          <label>Operador</label>
          <select value={filtros.operador} onChange={(e) => set('operador', e.target.value)}>
            {operadores.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
        <button className="ghost" type="button" onClick={() => setFiltros(EMPTY)}>
          <RotateCcw size={14} /> Limpiar filtros
        </button>
      </div>

      <div className="toolbar">
        <div className="search">
          <Search size={16} />
          <input
            placeholder="Buscar por ID de ensayo o notas..."
            value={filtros.busqueda}
            onChange={(e) => set('busqueda', e.target.value)}
          />
        </div>
        <button className="ghost" type="button" onClick={exportar}>
          <Download size={16} /> Exportar
        </button>
        <button className="primary" type="button" onClick={() => nav('/nuevo-ensayo')}>
          <Play size={16} /> Nuevo ensayo
        </button>
        <div className="results">
          Resultados: <b>{rows.length} ensayos encontrados</b>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID ENSAYO</th>
              <th>FECHA Y HORA</th>
              <th>PROGRAMA</th>
              <th>OPERADOR</th>
              <th>ESTADO</th>
              <th>RESULTADO</th>
              <th>DURACIÓN</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => {
              const tone = r.estado === 'Completado' ? 'ok' : r.estado === 'Interrumpido' ? 'warn' : 'danger'
              return (
                <tr key={r.id} className={sel === r.id ? 'sel' : ''} onClick={() => setSel(r.id)}>
                  <td className="mono">
                    <i className={`dot ${tone}`} />
                    {r.id}
                  </td>
                  <td className="mono">{r.fecha}</td>
                  <td>{r.programa}</td>
                  <td>{r.operador}</td>
                  <td>
                    <span className={`st ${tone}`}>{r.estado}</span>
                  </td>
                  <td className={r.resultado === 'OK' ? 'ok-txt' : r.resultado === '—' ? '' : 'err-txt'}>
                    {r.resultado}
                  </td>
                  <td className="mono">{r.duracion}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <label>
          Filas por página:{' '}
          <select
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value))
              setPage(1)
            }}
          >
            <option>10</option>
            <option>20</option>
            <option>42</option>
          </select>
        </label>
        <div className="pages">
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} type="button" className={page === i + 1 ? 'on' : ''} onClick={() => setPage(i + 1)}>
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
