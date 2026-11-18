import type { NodoPaso, ResumenPasos } from '../mock/types'

/** Cuentas de un tramo del árbol; se pueden sumar y multiplicar. */
interface Acumulado {
  acciones: number
  pulsos: number
  recorrido: Record<string, number>
  duracionMs: number
}

const vacio = (): Acumulado => ({ acciones: 0, pulsos: 0, recorrido: {}, duracionMs: 0 })
const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Lo que tarda un movimiento: |distancia| / velocidad, en ms (0 sin velocidad válida). */
function tiempoDeMotorMs(distancia: number, args: Record<string, unknown>) {
  const velocidad = numero(args.velocidad)
  return velocidad > 0 ? (Math.abs(distancia) / velocidad) * 1000 : 0
}

function sumar(total: Acumulado, otro: Acumulado, veces = 1) {
  total.acciones += otro.acciones * veces
  total.pulsos += otro.pulsos * veces
  total.duracionMs += otro.duracionMs * veces
  for (const [nombre, valor] of Object.entries(otro.recorrido)) {
    total.recorrido[nombre] = (total.recorrido[nombre] ?? 0) + valor * veces
  }
}

function acumular(pasos: NodoPaso[], posiciones: Record<string, number>): Acumulado {
  const total = vacio()
  for (const paso of pasos) sumar(total, acumularNodo(paso, posiciones))
  return total
}

function acumularNodo(paso: NodoPaso, posiciones: Record<string, number>): Acumulado {
  const parcial = vacio()
  if (paso.tipo === 'ESPERA') {
    parcial.duracionMs = numero(paso.duracion_ms)
  } else if (paso.tipo === 'ACCION') {
    parcial.acciones = 1
    const { comando, argumentos: args, componente: nombre } = paso
    if (comando === 'pulso') {
      parcial.pulsos = 1
      parcial.duracionMs = numero(args.duracion_ms)
    } else if (comando === 'mover') {
      const delta = numero(args.delta)
      parcial.recorrido[nombre] = Math.abs(delta)
      parcial.duracionMs = tiempoDeMotorMs(delta, args)
      if (nombre in posiciones) posiciones[nombre] += delta
    } else if (comando === 'mover_a') {
      const destino = numero(args.posicion)
      if (nombre in posiciones) {
        const distancia = destino - posiciones[nombre]
        parcial.recorrido[nombre] = Math.abs(distancia)
        parcial.duracionMs = tiempoDeMotorMs(distancia, args)
      }
      posiciones[nombre] = destino
    } else if (comando === 'referenciar') {
      posiciones[nombre] = numero(args.posicion)
    }
  } else if (paso.tipo === 'PARALELO') {
    for (const hijo of paso.pasos) {
      const h = acumularNodo(hijo, posiciones)
      parcial.acciones += h.acciones
      parcial.pulsos += h.pulsos
      parcial.duracionMs = Math.max(parcial.duracionMs, h.duracionMs)
      for (const [nombre, valor] of Object.entries(h.recorrido)) {
        parcial.recorrido[nombre] = (parcial.recorrido[nombre] ?? 0) + valor
      }
    }
  } else {
    const repeticiones = Math.max(0, Math.trunc(numero(paso.repeticiones)))
    sumar(parcial, acumular(paso.pasos, posiciones))
    if (repeticiones > 1) {
      // Desde la segunda vuelta el recorrido se repite igual (una posición absoluta termina
      // siempre donde terminó la anterior); la posición avanza el neto de la vuelta.
      const trasPrimera = { ...posiciones }
      sumar(parcial, acumular(paso.pasos, posiciones), repeticiones - 1)
      for (const [nombre, trasSegunda] of Object.entries(posiciones)) {
        const base = nombre in trasPrimera ? trasPrimera[nombre] : trasSegunda
        posiciones[nombre] = base + (trasSegunda - base) * (repeticiones - 1)
      }
    }
  }
  return parcial
}

/**
 * Cuenta lo que hará un programa expandiendo los bucles, con las mismas reglas que
 * `controller.programa.resumen` del back. Sirve para mostrar el resumen mientras se edita;
 * al guardar manda el del back. La duración mínima suma pulsos, esperas y |distancia|/velocidad
 * de cada movimiento (cota inferior: sin aceleración ni demoras de las órdenes).
 */
export function resumenPasos(pasos: NodoPaso[]): ResumenPasos {
  const total = acumular(pasos, {})
  return {
    acciones: total.acciones,
    pulsos: total.pulsos,
    recorrido: total.recorrido,
    duracionMinimaMs: Math.round(total.duracionMs),
  }
}
