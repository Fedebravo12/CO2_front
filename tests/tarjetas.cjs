// Tarjetas ocultas del dashboard: mínimo visible y reaparición ante una condición anormal.
const { build } = require(process.cwd() + '/node_modules/esbuild')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tarjetas-test-'))
const output = path.join(temporary, 'bundle.cjs')
;(async () => {
  await build({ entryPoints: ['src/pages/Telemetria.tsx'], bundle: true, platform: 'node', format: 'cjs', outfile: output, loader: { '.css': 'empty' }, plugins: [{ name: 'fixture', setup(b) {
    b.onResolve({ filter: /context\/SystemContext$/ }, () => ({ path: 'system', namespace: 'fixture' }))
    b.onResolve({ filter: /api\/client$/ }, () => ({ path: 'api', namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path === 'system' ? 'export const useSystem = () => globalThis.fixture' : 'export const api = { listarUmbrales: async () => [] }' }))
    b.onResolve({ filter: /^react($|\/)|^react-dom($|\/)/ }, a => ({ path: require.resolve(a.path, { paths: [process.cwd()] }), external: true }))
  } }] })
  const React = require(process.cwd() + '/node_modules/react')
  const { renderToStaticMarkup } = require(process.cwd() + '/node_modules/react-dom/server')
  const { Telemetria } = require(output)
  const assert = require('node:assert/strict')
  global.document = { getElementById: () => null }
  const guardado = (ocultas) => ({ getItem: k => k === 'co2.telemetria.ocultas' ? JSON.stringify(ocultas) : null, setItem() {} })
  const now = new Date()
  const sample = (alineada) => ({ ts: now.toISOString(), hz: 1, variables: { POTENCIA_LASER: 14, TENSION_AT: 18, TEMPERATURA_AGUA: 20, CAUDAL_REFRIGERANTE: 2.6, POSICION_MOTOR: 10 }, extra: { frecuencia_hz: 2, sensor_sombra_mw: .12 }, condiciones: { AT_ENCENDIDA: true, FIBRA_ALINEADA: alineada, REFRIGERACION_OK: true }, actuadores: { laser: true, shutter_abierto: true, shutter_armado: true, refrigeracion: true }, ejecucion: { progreso: .4, duracion_pulso_ms: 400 } })
  const render = (alineada) => {
    global.fixture = { now, controlador: sample(alineada), controladorVivo: true, historialTelemetria: [sample(alineada)] }
    return renderToStaticMarkup(React.createElement(Telemetria))
  }
  const tarjetas = html => [...html.matchAll(/data-canal="([^"]+)"/g)].map(m => m[1])

  // Ocultas en condición normal: no aparecen; con 6 tarjetas la grilla es 3 × 2.
  global.localStorage = guardado(['pulso', 'caudal', 'sombra'])
  let html = render(true)
  assert.deepEqual(tarjetas(html), ['pot', 'shutter', 'hv', 'temp', 'pos', 'prog'])
  assert.ok(html.includes('--tc-cols:3;--tc-rows:2'))

  // Sensor de sombra oculto pero «No alineada» (advertencia): vuelve marcado como oculto.
  html = render(false)
  assert.ok(tarjetas(html).includes('sombra'))
  assert.ok(html.includes('tc-forzada'))
  assert.ok(html.includes('tarjeta oculta, visible por la condición anormal'))

  // Lo guardado que deja menos de dos visibles se descarta: se ven las nueve.
  global.localStorage = guardado(['pot', 'pulso', 'shutter', 'hv', 'sombra', 'temp', 'caudal', 'pos'])
  assert.equal(tarjetas(render(true)).length, 9)

  // Ids desconocidos o datos rotos no rompen el dashboard.
  global.localStorage = guardado(['no-existe', 'pulso'])
  html = render(true)
  assert.equal(tarjetas(html).length, 8)
  assert.ok(html.includes('--tc-cols:3;--tc-rows:3'))

  // Con tres visibles la grilla sigue en 3 × 2: tamaño estándar y segunda fila vacía.
  global.localStorage = guardado(['pot', 'pulso', 'shutter', 'hv', 'sombra', 'caudal'])
  html = render(true)
  assert.deepEqual(tarjetas(html), ['temp', 'pos', 'prog'])
  assert.ok(html.includes('--tc-cols:3;--tc-rows:2'))
  global.localStorage = { getItem: () => '{roto', setItem() {} }
  assert.equal(tarjetas(render(true)).length, 9)

  // Orden guardado: se respeta, se ignoran ids desconocidos y los canales que
  // faltan se agregan al final en su orden original.
  const conOrden = (orden, ocultas = []) => ({ getItem: k => k === 'co2.telemetria.orden' ? JSON.stringify(orden) : k === 'co2.telemetria.ocultas' ? JSON.stringify(ocultas) : null, setItem() {} })
  global.localStorage = conOrden(['prog', 'no-existe', 'temp', 'pot'])
  assert.deepEqual(tarjetas(render(true)), ['prog', 'temp', 'pot', 'pulso', 'shutter', 'hv', 'sombra', 'caudal', 'pos'])
  // Orden y ocultas se combinan.
  global.localStorage = conOrden(['prog', 'temp', 'pot'], ['temp'])
  assert.deepEqual(tarjetas(render(true)).slice(0, 3), ['prog', 'pot', 'pulso'])
  global.localStorage = { getItem: k => k === 'co2.telemetria.orden' ? 'roto' : null, setItem() {} }
  assert.deepEqual(tarjetas(render(true)), ['pot', 'pulso', 'shutter', 'hv', 'sombra', 'temp', 'caudal', 'pos', 'prog'])
  console.log('tarjetas: ok')
})().catch(error => { console.error(error); process.exit(1) })
