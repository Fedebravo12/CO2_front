const { build } = require(process.cwd() + '/node_modules/esbuild')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetria-test-'))
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
  global.localStorage = { getItem: () => 'C' }
  const now = new Date()
  const sample = { ts: now.toISOString(), hz: 1, variables: { POTENCIA_LASER: 14, TENSION_AT: 18, TEMPERATURA_AGUA: 20, CAUDAL_REFRIGERANTE: 2.6, POSICION_MOTOR: 10 }, extra: { frecuencia_hz: 2, sensor_sombra_mw: .12 }, condiciones: { AT_ENCENDIDA: true, FIBRA_ALINEADA: true, REFRIGERACION_OK: true }, actuadores: { laser: true, shutter_abierto: true, shutter_armado: true, refrigeracion: true }, ejecucion: { progreso: .4, duracion_pulso_ms: 400 } }
  global.fixture = { now, controlador: sample, controladorVivo: true, historialTelemetria: [{ ...sample, ts: new Date(+now - 5000).toISOString() }, sample] }
  let html = renderToStaticMarkup(React.createElement(Telemetria))
  assert.equal((html.match(/aria-label="Ampliar/g) || []).length, 9)
  assert.ok(html.includes('10.000'))
  assert.ok(html.includes('aria-valuenow="40"'))
  assert.ok(!html.includes('En vivo ·'))
  assert.ok(!html.includes('NaN'))
  const paths = [...html.matchAll(/<path d="([^"]*)" fill="none" stroke="var/g)].map(m => m[1])
  assert.equal(paths.length, 7)
  paths.forEach(p => assert.equal((p.match(/M/g) || []).length, 2, 'gap must split curve'))
  assert.ok(html.includes('tc-pro'))
  assert.ok(html.includes('aria-pressed="true" title="Ocultar tendencias'))
  global.localStorage = { getItem: () => null }
  html = renderToStaticMarkup(React.createElement(Telemetria))
  assert.ok(html.includes('tc-simple'))
  assert.ok(html.includes('aria-pressed="false" title="Mostrar tendencias'))
  assert.equal((html.match(/aria-label="Ampliar/g) || []).length, 9)
  assert.ok(!html.includes('tc-plot'))
  assert.ok(html.includes('Tendencia'))
  assert.ok(html.includes('aria-valuenow="40"'))
  // Teléfono: sin tendencias en las tarjetas ni selector, aunque estén activadas.
  global.localStorage = { getItem: () => 'C' }
  global.window = { matchMedia: () => ({ matches: true }) }
  html = renderToStaticMarkup(React.createElement(Telemetria))
  assert.ok(html.includes('tc-simple'))
  assert.ok(!html.includes('tc-plot'))
  assert.ok(!html.includes('tc-view-toggle'))
  assert.ok(html.includes('400'))
  delete global.window
  global.localStorage = { getItem: () => { throw new Error('Storage blocked') } }
  assert.ok(renderToStaticMarkup(React.createElement(Telemetria)).includes('tc-simple'))
  global.localStorage = { getItem: () => 'C' }
  global.fixture.controladorVivo = false
  html = renderToStaticMarkup(React.createElement(Telemetria))
  assert.ok(html.includes('Sin datos desde'))
  assert.ok(!html.includes('aria-valuenow'))
  assert.equal((html.match(/tc-dot/g) || []).length, 0)
  global.fixture = { ...global.fixture, controlador: null, historialTelemetria: [] }
  html = renderToStaticMarkup(React.createElement(Telemetria))
  assert.ok(html.includes('Sin muestras'))
  assert.ok(!html.includes('NaN'))
  console.log('PASS: nine cards, unit conversion, progress, gap segmentation, stale and empty states, trend toggle states, mobile without trends and storage fallback')
})().finally(() => fs.rmSync(temporary, { recursive: true, force: true }))
