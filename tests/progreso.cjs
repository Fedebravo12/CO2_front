const { build } = require(process.cwd() + '/node_modules/esbuild')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'progreso-test-'))
const output = path.join(temporary, 'bundle.cjs')

// El progreso que publica el back (`Maquina._ejecucion_publicada`): acciones sobre el total,
// pulsos hechos, ubicación y duración del último pulso. Lo ausente se ve como «—», nunca NaN.
;(async () => {
  await build({
    stdin: {
      contents: `export * from './src/procedimientos/interprete'
export * from './src/components/ProgresoEjecucion'`,
      resolveDir: process.cwd(), loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, loader: { '.css': 'empty' },
    plugins: [{ name: 'react', setup(b) {
      b.onResolve({ filter: /^react($|\/)|^react-dom($|\/)/ }, a => ({ path: require.resolve(a.path, { paths: [process.cwd()] }), external: true }))
    } }],
  })
  const React = require(process.cwd() + '/node_modules/react')
  const { renderToStaticMarkup } = require(process.cwd() + '/node_modules/react-dom/server')
  const m = require(output)

  const ejecucion = {
    registro: 'ENS-2026-00001', programa: 'Helicoidal', modo: 'REAL',
    acciones: 25, total: 100, pulsos: 1, ubicacion: 'Paso 3.1 · iteración 2 de 50', ultimo_pulso_ms: 400.4,
  }

  // 1. Fracción: acciones sobre el total; sin total válido no se inventa.
  assert.equal(m.progresoEjecucion(ejecucion), 0.25)
  assert.equal(m.progresoEjecucion(null), null)
  assert.equal(m.progresoEjecucion({ ...ejecucion, total: 0 }), null)
  assert.equal(m.progresoEjecucion({ ...ejecucion, total: undefined }), null)
  assert.equal(m.progresoEjecucion({ ...ejecucion, acciones: undefined }), null)
  // Telemetría vieja (pulso/progreso/distancia_mm): nada de NaN.
  assert.equal(m.progresoEjecucion({ registro: 'x', programa: 'p', modo: 'REAL', pulso: 3, pulsos: 10, progreso: 0.3 }), null)

  // 2. Lo que muestra Nuevo ensayo.
  let html = renderToStaticMarkup(React.createElement(m.ProgresoEjecucion, { ejecucion }))
  assert.ok(html.includes('25/100 acciones'), html)
  assert.ok(html.includes('1 pulsos'), html)
  assert.ok(html.includes('Paso 3.1 · iteración 2 de 50'), html)
  assert.ok(html.includes('400,4 ms'), html)
  assert.ok(html.includes('aria-valuenow="25"'), html)
  assert.ok(!html.includes('NaN') && !html.includes('undefined'), html)
  html = renderToStaticMarkup(React.createElement(m.ProgresoEjecucion, {
    ejecucion: { registro: 'x', programa: 'P', modo: 'REAL', pulso: 3, pulsos: 10, progreso: 0.3, distancia_mm: 1 },
  }))
  assert.ok(!html.includes('NaN') && !html.includes('undefined'), html)
  assert.ok(!html.includes('aria-valuenow'), html)
  assert.ok(html.includes('—'), html)

  // 3. Hechos del procedimiento guiado: «Primer pulso ejecutado correctamente» puede cumplirse.
  const t = { estado: 'GRABANDO', condiciones: {}, variables: {}, senales: {}, actuadores: {}, extra: {}, ejecucion }
  const programa = { nombre: 'Helicoidal', resumen: { acciones: 100, pulsos: 50, recorrido: {}, duracionMinimaMs: 1000 } }
  const f = m.fuentesDe({ t, programa, ensayo: null })
  assert.equal(f['ejecucion.pulsos'], 1)
  assert.equal(f['ejecucion.acciones'], 25)
  assert.equal(f['ejecucion.total'], 100)
  assert.equal(f['ejecucion.progreso'], 0.25)
  assert.equal(f['ejecucion.ubicacion'], 'Paso 3.1 · iteración 2 de 50')
  assert.equal(f['ejecucion.ultimo_pulso_ms'], 400.4)
  const primerPulso = { alguna: [{ fuente: 'ejecucion.pulsos', op: '>=', valor: 1 }, { fuente: 'ensayo.terminado', op: 'es_verdadero' }] }
  assert.equal(m.evaluar(primerPulso, f), true)
  const antes = m.fuentesDe({ t: { ...t, ejecucion: { ...ejecucion, pulsos: 0 } }, programa, ensayo: null })
  assert.equal(m.evaluar(primerPulso, antes), false)
  assert.equal(m.textoCon('{ejecucion.pulsos} / {programa.pulsos} pulsos', f), '1 / 50 pulsos')
  // Sin total, el progreso queda ausente (no NaN) y el texto muestra «—».
  const sinTotal = m.fuentesDe({ t: { ...t, ejecucion: { ...ejecucion, total: 0 } }, programa, ensayo: null })
  assert.equal(sinTotal['ejecucion.progreso'], undefined)
  assert.equal(m.textoCon('{ejecucion.progreso:2}', sinTotal), '—')

  console.log('progreso: ok')
})().catch(e => { console.error(e); process.exit(1) }).finally(() => fs.rmSync(temporary, { recursive: true, force: true }))
