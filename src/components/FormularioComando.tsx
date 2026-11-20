import { useId, useState } from 'react'
import type { TipoArgumento, ValorArgumento } from '../api/hardware'

interface Props {
  argumentos: Record<string, TipoArgumento>
  /** Modo envío: el botón entrega los valores tipados (o {} sin argumentos). */
  onEnviar?: (valores: Record<string, ValorArgumento>) => void
  /**
   * Modo edición: sin botón; cada cambio entrega los argumentos válidos hasta el momento
   * (uno vacío o inválido se omite, y el back lo rechaza al guardar con su ubicación).
   */
  onChange?: (valores: Record<string, ValorArgumento>) => void
  /** Valores con los que arranca el formulario (modo edición). */
  valoresIniciales?: Record<string, ValorArgumento>
  deshabilitado?: boolean
  etiqueta?: string
}

/** «duracion_ms» → «Duración (ms)», «mover_a» → «Mover a»: nombres de la ficha para mostrar. */
const ACENTOS: Record<string, string> = { duracion: 'duración', posicion: 'posición', rotacion: 'rotación' }
export function nombreLegible(clave: string): string {
  const unidad = clave.match(/_(ms|mm|s|um)$/)?.[1]
  const palabras = (unidad ? clave.slice(0, -unidad.length - 1) : clave).split('_').map(p => ACENTOS[p] ?? p)
  const texto = palabras.join(' ')
  return texto.charAt(0).toUpperCase() + texto.slice(1) + (unidad ? ` (${unidad})` : '')
}

const textoInicial = (v: ValorArgumento | undefined): string | boolean =>
  typeof v === 'boolean' ? v : typeof v === 'number' ? String(v) : ''

/** Convierte lo tipeado a valores tipados; en `estricto` un campo inválido corta y devuelve el error. */
function convertir(
  argumentos: Record<string, TipoArgumento>,
  valores: Record<string, string | boolean>,
  estricto: boolean,
): { salida: Record<string, ValorArgumento>; error?: string } {
  const salida: Record<string, ValorArgumento> = {}
  for (const [nombre, tipo] of Object.entries(argumentos)) {
    const v = valores[nombre]
    if (tipo === 'booleano') { salida[nombre] = v === true; continue }
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
    if (!Number.isFinite(n) || (tipo === 'entero' && !Number.isInteger(n))) {
      if (estricto) return { salida, error: `Ingrese un valor ${tipo === 'entero' ? 'entero' : 'numérico'} válido en «${nombre}».` }
      continue
    }
    salida[nombre] = n
  }
  return { salida }
}

/** Un campo por argumento de la ficha; el botón envía los valores tipados (o los reporta con `onChange`). */
export function FormularioComando({
  argumentos, onEnviar, onChange, valoresIniciales = {}, deshabilitado = false, etiqueta = 'Enviar',
}: Props) {
  const [valores, setValores] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(Object.keys(valoresIniciales).map(k => [k, textoInicial(valoresIniciales[k])])))
  const base = useId()
  const [error, setError] = useState('')
  const enviar = () => {
    const { salida, error: e } = convertir(argumentos, valores, true)
    if (e) { setError(e); return }
    setError('')
    onEnviar?.(salida)
  }
  const cambiar = (nombre: string, valor: string | boolean) => {
    const siguientes = { ...valores, [nombre]: valor }
    setValores(siguientes)
    onChange?.(convertir(argumentos, siguientes, false).salida)
  }
  // Sin contenedor propio en la grilla: cada argumento es un campo más del formulario que lo contiene.
  return <div className="form-cmd">
    {Object.entries(argumentos).map(([nombre, tipo]) => tipo === 'booleano'
      ? <label key={nombre} className="field form-check" htmlFor={`${base}-${nombre}`}>
        <input id={`${base}-${nombre}`} type="checkbox" checked={valores[nombre] === true}
          onChange={e => cambiar(nombre, e.target.checked)} />{nombreLegible(nombre)}</label>
      : <div key={nombre} className="field">
        <label htmlFor={`${base}-${nombre}`}>{nombreLegible(nombre)}</label>
        <input id={`${base}-${nombre}`} type="number" step={tipo === 'entero' ? 1 : 'any'}
          value={typeof valores[nombre] === 'string' ? valores[nombre] as string : ''}
          onChange={e => cambiar(nombre, e.target.value)} />
      </div>)}
    {error && <small role="alert" className="login-error">{error}</small>}
    {!onChange && <button type="button" className="ghost" disabled={deshabilitado} onClick={enviar}>{etiqueta}</button>}
  </div>
}
