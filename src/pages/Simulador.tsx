import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Play, Power, RotateCcw, Snowflake, Zap } from 'lucide-react'
import type { Accion, TelemetriaControlador } from '../api/control'
import { api } from '../api/client'
import { fmt } from '../components/Meters'
import { useSystem } from '../context/SystemContext'
import type { Ensayo } from '../mock/types'

type Ejecucion = NonNullable<TelemetriaControlador['ejecucion']>

export function Simulador() {
  const { controlador: t, controladorVivo: vivo, programas, programa, setProgramaId, enviar, iniciarPrograma } = useSystem()
  const [ocupado, setOcupado] = useState(false)
  const [preparacion, setPreparacion] = useState('')
  const [ultima, setUltima] = useState<Ejecucion | null>(null)
  const [resultado, setResultado] = useState<Ensayo | null>(null)
  const actual = useRef({ t, vivo })
  actual.current = { t, vivo }
  const montado = useRef(true)
  useEffect(() => { montado.current = true; return () => { montado.current = false } }, [])

  useEffect(() => {
    if (t?.ejecucion) {
      setUltima(t.ejecucion)
      setResultado(null)
    }
  }, [t])

  const registroFinal = !t?.ejecucion ? ultima?.registro : null
  useEffect(() => {
    if (!registroFinal) return
    let cancelado = false
    let timer: ReturnType<typeof setTimeout>
    let intentos = 0
    const consultar = async () => {
      const ensayo = await api.obtenerEnsayo(registroFinal).catch(() => null)
      if (cancelado) return
      if (ensayo && ensayo.estado !== 'En curso') setResultado(ensayo)
      else if (++intentos < 15) timer = setTimeout(consultar, 1000)
    }
    consultar()
    return () => { cancelado = true; clearTimeout(timer) }
  }, [registroFinal])

  const a = vivo ? t?.actuadores : undefined
  const v = vivo ? t?.variables : undefined
  const grabando = vivo && t?.estado === 'GRABANDO'
  const emergencia = vivo && t?.estado === 'EMERGENCIA'
  const ejecucion = t?.ejecucion ?? ultima
  const pulso = Number(resultado?.cantidadMarcas ?? ejecucion?.pulso ?? 0)
  const total = ejecucion?.pulsos ?? programa?.pulsosEstimados ?? 0
  const progreso = resultado?.estado === 'Completado' ? 100 : total > 0 ? Math.min(100, pulso / total * 100) : 0
  const emitiendo = Boolean(a?.laser && a.shutter_abierto && t?.ejecucion?.modo !== 'PRUEBA')
  const posicion = v?.POSICION_MOTOR ?? 0
  const carrera = Math.max(programa?.distanciaMm ?? 10, ejecucion?.distancia_mm ?? 0, 1)
  const carro = 680 + Math.min(1, posicion / carrera) * 160
  const bloqueado = !vivo || ocupado || grabando || emergencia
  const fase = !vivo ? 'Sin conexión' : emergencia ? 'Parada de emergencia' : grabando
    ? t?.ejecucion?.modo === 'PRUEBA' ? 'Pre-grabado · emisión inhibida' : emitiendo ? 'Pulso · exposición de la fibra' : 'Desplazamiento entre marcas'
    : resultado ? `Ensayo ${resultado.estado.toLowerCase()}` : a?.laser ? 'Equipo listo para grabar' : preparacion || 'Prepará el equipo para comenzar'

  const preparar = async () => {
    setOcupado(true)
    const pasos: [Accion, string, (t: TelemetriaControlador) => boolean][] = [
      ['encender_refrigeracion', 'Estabilizando refrigeración…', t => t.condiciones.REFRIGERACION_OK],
      ['habilitar_at', 'Elevando alta tensión…', t => t.condiciones.AT_ENCENDIDA],
      ['alinear_fibra', 'Alineando la fibra…', t => t.condiciones.FIBRA_ALINEADA],
      ['armar_shutter', 'Armando shutter…', t => t.estado === 'LISTO'],
      ['encender_laser', 'Encendiendo láser…', t => t.actuadores.laser],
    ]
    try {
      for (const [accion, texto, listo] of pasos) {
        if (!montado.current || !actual.current.vivo || actual.current.t?.estado === 'EMERGENCIA') throw new Error('Preparación detenida.')
        setPreparacion(texto)
        if (!await enviar(accion)) throw new Error('El controlador rechazó la preparación.')
        const limite = Date.now() + 30000
        while (true) {
          const { t, vivo } = actual.current
          if (!montado.current || !vivo || t?.estado === 'EMERGENCIA') throw new Error('Preparación detenida.')
          if (t && listo(t)) break
          if (Date.now() > limite) throw new Error('No se confirmó la condición. Revisá el equipo.')
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
      setPreparacion('Preparación completa')
    } catch (error) {
      if (montado.current) setPreparacion((error as Error).message)
    } finally {
      if (montado.current) setOcupado(false)
    }
  }

  const iniciar = async (modo: 'REAL' | 'PRUEBA') => {
    setOcupado(true)
    if (await iniciarPrograma(modo)) { setUltima(null); setResultado(null); setPreparacion('') }
    setOcupado(false)
  }
  const rearmar = async () => {
    setOcupado(true)
    if (await enviar('inyectar_falla', { falla: 'ninguna' })) await enviar('rearmar')
    setOcupado(false)
  }

  return (
    <div className="lab-page">
      <header className="lab-heading">
        <div><span className="lab-eyebrow">LABORATORIO CO₂ / VISTA EN VIVO</span><h1>El ensayo, a la vista.</h1><p>Seguí la emisión, el movimiento y las marcas sobre la fibra mientras corre tu programa.</p></div>
        <span className={`lab-live ${vivo ? 'on' : ''}`}><i />{vivo ? 'Telemetría conectada' : 'Sin datos actuales'}</span>
      </header>

      <div className="lab-grid">
        <section className={`lab-scene ${emergencia ? 'emergency' : ''} ${!vivo ? 'offline' : ''}`} aria-label="Laboratorio simulado en tiempo real" data-emitiendo={emitiendo}>
          <div className="lab-scene-head"><span>01 / ARREGLO DE GRABADO</span><b className={emitiendo ? 'exposure' : ''}>{fase}</b></div>
          <svg viewBox="0 0 1000 490" role="img" aria-label={`Esquema del laboratorio. ${fase}. Posición ${fmt(posicion)} milímetros. ${pulso} de ${total} pulsos.`}>
            <defs>
              <pattern id="lab-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M 25 0 L 0 0 0 25" fill="none" stroke="#243140" strokeWidth=".6" /></pattern>
              <linearGradient id="lab-tube"><stop stopColor="#182c38" /><stop offset=".5" stopColor="#263b47" /><stop offset="1" stopColor="#14232d" /></linearGradient>
              <filter id="lab-glow"><feGaussianBlur stdDeviation="4" /></filter>
            </defs>
            <rect width="1000" height="490" fill="url(#lab-grid)" opacity=".5" />
            <text x="44" y="47" className="lab-svg-caption">VISTA ESQUEMÁTICA · SIN ESCALA FÍSICA</text>
            <path d="M155 345 V260 H205 V215 M185 345 V285 H245 V215" className={`lab-water ${a?.refrigeracion ? 'flowing' : ''}`} />
            <g className="lab-equipment"><rect x="55" y="115" width="330" height="115" rx="14" /><rect x="78" y="147" width="255" height="50" rx="25" fill="url(#lab-tube)" /><path d="M95 172 H320" className={`lab-discharge ${a?.laser ? 'on' : ''}`} /><rect x="345" y="155" width="40" height="35" rx="5" /></g>
            <text x="78" y="137" className="lab-svg-label">TUBO LÁSER CO₂</text><text x="80" y="218" className="lab-svg-value">{v ? `${fmt(v.POTENCIA_LASER, 1)} W` : '—'} · {a?.laser ? 'ENCENDIDO' : 'APAGADO'}</text>
            <path d="M385 172 H560" className={`lab-beam ${a?.laser ? 'on' : ''}`} />
            <path d="M385 172 H560" className={`lab-beam-glow ${a?.laser ? 'on' : ''}`} filter="url(#lab-glow)" />
            <path d="M543 155 L577 189" stroke="#9bb4c7" strokeWidth="7" /><text x="610" y="168" className="lab-svg-label">ESPEJO</text>
            <path d="M560 175 V230" className={`lab-beam ${a?.laser ? 'on' : ''}`} />
            <g className="lab-shutter" style={{ transform: `rotate(${a?.shutter_abierto ? -75 : 0}deg)` }}><rect x="535" y="223" width="50" height="10" rx="3" fill={a?.shutter_armado ? '#f5c542' : '#64788b'} /><circle cx="535" cy="228" r="6" fill="#9bb4c7" /></g>
            <text x="610" y="226" className="lab-svg-label">SHUTTER</text><text x="610" y="247" className="lab-svg-value">{!vivo ? 'SIN DATOS' : a?.shutter_abierto ? 'ABIERTO' : a?.shutter_armado ? 'ARMADO · CERRADO' : 'DESARMADO'}</text>
            <path d="M560 236 V313" className={`lab-beam ${emitiendo ? 'on' : ''}`} />
            <path d="M560 236 V313" className={`lab-beam-glow ${emitiendo ? 'on' : ''}`} filter="url(#lab-glow)" />
            <path d="M335 315 H920" stroke="#7296aa" strokeWidth="4" /><path d="M360 315 H880" stroke="#d7eaf0" strokeWidth="1.5" />
            <rect x="335" y="302" width="30" height="26" rx="4" fill="#334958" /><text x="342" y="284" className="lab-svg-label">FIBRA ÓPTICA</text>
            <circle cx="560" cy="315" r={emitiendo ? 14 : 5} fill={emitiendo ? '#ff9957' : '#304b5d'} className={emitiendo ? 'lab-spot' : ''} />
            <path d="M675 348 H930 M690 355 H915" stroke="#334958" strokeWidth="6" />
            <g className="lab-carriage" style={{ transform: `translateX(${carro - 680}px)` }}><rect x="680" y="335" width="64" height="29" rx="5" fill="#294954" stroke="#2ad4c4" /><path d="M712 335 V315" stroke="#2ad4c4" strokeWidth="4" /><circle cx="712" cy="315" r="6" fill="#2ad4c4" /></g>
            <text x="685" y="397" className="lab-svg-label">DESPLAZADOR LINEAL</text><text x="685" y="419" className="lab-svg-value">{v ? `${fmt(posicion, 2)} mm` : '—'}</text>
            <g className="lab-equipment"><rect x="55" y="345" width="225" height="100" rx="12" /></g><circle cx="100" cy="392" r="23" fill="none" stroke={a?.refrigeracion ? '#2ad4c4' : '#425568'} strokeWidth="2" /><g className={a?.refrigeracion && vivo ? 'lab-fan spinning' : 'lab-fan'}><path d="M100 372 V412 M80 392 H120 M86 378 L114 406 M86 406 L114 378" stroke="#2ad4c4" strokeWidth="3" /></g>
            <text x="140" y="374" className="lab-svg-label">REFRIGERACIÓN</text><text x="140" y="397" className="lab-svg-value">{v ? `${fmt(v.TEMPERATURA_AGUA, 1)} °C` : '—'}</text><text x="140" y="420" className="lab-svg-value">{v ? `${fmt(v.CAUDAL_REFRIGERANTE, 1)} L/min` : '—'}</text>
            <g className="lab-equipment"><rect x="340" y="370" width="270" height="75" rx="12" /></g><circle cx="368" cy="399" r="7" fill={t?.condiciones.FIBRA_ALINEADA && vivo ? '#3ee089' : '#f5c542'} /><text x="389" y="398" className="lab-svg-label">SENSOR DE SOMBRA</text><text x="389" y="424" className="lab-svg-value">{vivo && t ? `${fmt(t.extra.sensor_sombra_mw)} mW · ${t.condiciones.FIBRA_ALINEADA ? 'ALINEADA' : a?.alineando ? 'ALINEANDO' : 'SIN ALINEAR'}` : 'SIN DATOS'}</text>
            <text x="78" y="92" className="lab-svg-value">ALTA TENSIÓN {v ? `${fmt(v.TENSION_AT, 1)} kV` : '—'}</text>
          </svg>
          <div className="lab-legend"><span><i className="beam" />Emisión láser</span><span><i className="water" />Refrigeración</span><span><i className="fiber" />Fibra y desplazamiento</span><small>Estado recibido del controlador</small></div>
        </section>

        <aside className="lab-console">
          <span className="lab-eyebrow">02 / CONTROL DEL ENSAYO</span><h2>Tu programa</h2>
          <label htmlFor="lab-programa">Programa de grabado</label><select id="lab-programa" value={programa?.id ?? ''} disabled={grabando || ocupado} onChange={e => setProgramaId(e.target.value)}>{!programa && <option value="">Sin programas</option>}{programas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
          <div className="lab-recipe"><div><span>Período</span><b>{programa ? fmt(programa.desplazamientoUm, 0) : '—'} <small>µm</small></b></div><div><span>Pulso</span><b>{programa?.duracionPulsoMs ?? '—'} <small>ms</small></b></div><div><span>Potencia objetivo</span><b>{programa ? fmt(programa.potenciaObjetivoMw, 1) : '—'} <small>mW</small></b></div><div><span>Pulsos estimados</span><b>{programa?.pulsosEstimados ?? '—'}</b></div></div>
          <button className="ghost lab-action" disabled={bloqueado || t?.falla !== 'ninguna' || a?.laser} onClick={preparar}><Zap size={16} />{ocupado ? 'Preparando…' : 'Preparar simulador'}<ArrowRight size={16} /></button>
          <p className="lab-help">Enciende refrigeración, alta tensión, alinea la fibra y arma el láser en orden.</p>
          <button className="primary lab-action" disabled={bloqueado || !programa || t?.estado !== 'LISTO' || !a?.laser} onClick={() => iniciar('REAL')}><Play size={16} />Ejecutar programa</button>
          <button className="ghost lab-action" disabled={bloqueado || !programa || t?.estado !== 'LISTO' || !a?.laser} onClick={() => iniciar('PRUEBA')}>Pre-grabado sin emisión</button>
          {grabando && <button className="ghost lab-action" onClick={() => enviar('abortar')}>Abortar al terminar el pulso</button>}
          {emergencia ? <button className="ghost lab-action" disabled={!vivo || ocupado} onClick={rearmar}><RotateCcw size={16} />Quitar falla y rearmar</button> : <button className="ghost lab-action" disabled={bloqueado} onClick={() => enviar('apagar')}><Power size={16} />Apagar equipo</button>}
          {preparacion && <p className="lab-help" role="status">{preparacion}</p>}
          <div className="lab-faults"><h3>Probar una falla</h3><p>Observá cómo responde el equipo y se interrumpe el ensayo.</p><button className="ghost" disabled={!vivo || ocupado || emergencia} onClick={() => enviar('inyectar_falla', { falla: 'caudal' })}>Pérdida de caudal</button><button className="ghost" disabled={!vivo || ocupado || emergencia} onClick={() => enviar('inyectar_falla', { falla: 'sobretemperatura' })}>Sobretemperatura</button>{vivo && t?.falla !== 'ninguna' && <button className="ghost" disabled={ocupado} onClick={() => enviar('inyectar_falla', { falla: 'ninguna' })}>Quitar falla</button>}</div>
          <Link className="lab-guided" to="/nuevo-ensayo">Ir al procedimiento de 9 pasos <ArrowRight size={14} /></Link>
        </aside>

        <section className="lab-run" aria-label="Avance del ensayo">
          <div className="lab-run-head"><div><span className="lab-eyebrow">03 / FORMACIÓN DE LA RED</span><h2>{ejecucion?.programa ?? 'Esperando un ensayo'}</h2></div><div className="lab-pulse-count" data-testid="lab-pulsos">{pulso}<span> / {total || '—'} pulsos</span></div></div>
          <div className="lab-progress" role="progressbar" aria-label="Progreso del ensayo" aria-valuenow={Math.round(progreso)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${progreso}%` }} /></div>
          <div className={`lab-grating ${ejecucion?.modo === 'PRUEBA' ? 'trial' : ''}`} aria-label={ejecucion?.modo === 'PRUEBA' ? 'Pasos de pre-grabado, sin marcas físicas' : `${pulso} marcas registradas`}>
            <div className="lab-grating-fiber" />{Array.from({ length: Math.min(total || 18, 120) }, (_, i) => { const numero = Math.ceil((i + 1) * (total || 18) / Math.min(total || 18, 120)); return <i key={i} className={numero <= pulso ? 'done' : ''} title={`${ejecucion?.modo === 'PRUEBA' ? 'Paso' : 'Marca'} ${numero}`} /> })}
          </div>
          <div className="lab-run-meta"><span>{ejecucion?.registro ?? 'Sin ensayo activo'}{ejecucion?.modo === 'PRUEBA' ? ' · PRE-GRABADO: no graba marcas' : ''}</span><span>{vivo ? `${fmt(ejecucion?.distancia_mm ?? 0, 2)} mm de avance` : 'Datos detenidos'} · {Math.round(progreso)} %</span></div>
          {resultado && <div className="lab-result"><b>{resultado.estado}</b><span>{resultado.codigoLpg}{resultado.lambda ? ` · Resonancia ${resultado.lambda}` : ''}</span><Link to={`/registro/${resultado.id}`}>Ver ensayo y espectro <ArrowRight size={14} /></Link></div>}
          {t?.mensaje && <p className={`aviso-ctrl ${t.mensaje.nivel}`}>{t.mensaje.texto}</p>}
        </section>
      </div>
      <footer className="lab-note"><Snowflake size={14} />Hardware simulado. Los ensayos y eventos se guardan en la base de datos del sistema.</footer>
    </div>
  )
}
