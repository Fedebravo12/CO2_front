const { build } = require(process.cwd() + '/node_modules/esbuild')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pasos-test-'))
const output = path.join(temporary, 'bundle.cjs')

;(async () => {
  await build({
    stdin: {
      contents: `export * from './src/components/EditorPasos'
export * from './src/components/resumenPasos'
export { FormularioComando } from './src/components/FormularioComando'
export { deProgramaAApi } from './src/api/client'`,
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

  const accion = (componente, comando, argumentos = {}) => ({ tipo: 'ACCION', componente, comando, argumentos })
  const cerca = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`)

  // 1. Ejemplo helicoidal: 200 vueltas con un pulso y dos motores a la vez.
  const helicoidal = [
    accion('laser', 'encender'),
    accion('shutter', 'armar'),
    accion('motor_x', 'referenciar', { posicion: 0 }),
    accion('motor_rotacion', 'referenciar', { posicion: 0 }),
    { tipo: 'BUCLE', repeticiones: 200, pasos: [{ tipo: 'PARALELO', pasos: [
      accion('shutter', 'pulso', { duracion_ms: 400 }),
      accion('motor_x', 'mover', { delta: 0.55, velocidad: 1 }),
      accion('motor_rotacion', 'mover', { delta: 3.6, velocidad: 5 }),
    ] }] },
    accion('laser', 'apagar'),
  ]
  let r = m.resumenPasos(helicoidal)
  assert.equal(r.pulsos, 200)
  cerca(r.recorrido.motor_x, 110)
  cerca(r.recorrido.motor_rotacion, 720)
  assert.equal(r.acciones, 4 + 3 * 200 + 1 + 0)
  // Cada vuelta dura lo que el hijo más largo: el giro de 3,6° a 5 °/s (720 ms).
  assert.equal(r.duracionMinimaMs, 200 * 720)

  // 2. Un PARALELO toma la duración del hijo más largo.
  r = m.resumenPasos([{ tipo: 'PARALELO', pasos: [
    accion('shutter', 'pulso', { duracion_ms: 400 }), { tipo: 'ESPERA', duracion_ms: 900 },
  ] }, { tipo: 'ESPERA', duracion_ms: 100 }])
  assert.equal(r.duracionMinimaMs, 1000)

  // 3. Mismas reglas que el back con mover_a: absoluto no se acumula, y una posición
  //    desconocida no suma recorrido.
  r = m.resumenPasos([
    accion('motor_x', 'mover_a', { posicion: 5, velocidad: 1 }),
    { tipo: 'BUCLE', repeticiones: 3, pasos: [
      accion('motor_x', 'mover', { delta: 2, velocidad: 1 }),
      accion('motor_x', 'mover_a', { posicion: 10, velocidad: 1 }),
    ] },
  ])
  // mover_a inicial: posición desconocida, no suma. Vuelta 1: 2 + |10-7| = 5; luego 5 y 5 (mover_a deja en 10).
  // Desde la 2.ª vuelta la posición de partida es 10: 2 + |10-12| = 4 cada una.
  cerca(r.recorrido.motor_x, 5 + 4 + 4)
  // La duración suma |d|/v de cada movimiento con la misma distancia (1 mm/s).
  assert.equal(r.duracionMinimaMs, (5 + 4 + 4) * 1000)

  // 4. El cuerpo que se guarda tiene la forma de la API: nombre, descripción, procedimiento y árbol.
  const cuerpo = m.deProgramaAApi({ nombre: 'Helicoidal', descripcion: 'd', procedimiento: null, pasos: helicoidal })
  assert.deepEqual(Object.keys(cuerpo).sort(), ['descripcion', 'nombre', 'pasos', 'procedimiento'])
  assert.deepEqual(cuerpo.pasos, helicoidal)
  assert.equal(cuerpo.procedimiento, null)

  // 5. Edición del árbol.
  const componentes = {
    laser: { tipo: 'SALIDA_GPIO', pines: {}, estado: 'Vigente', parametros: {} },
    motor_x: { tipo: 'STEPPER_DRV8825', pines: {}, estado: 'Vigente', parametros: {} },
    viejo: { tipo: 'SALIDA_GPIO', pines: {}, estado: 'Eliminado', parametros: {} },
  }
  const catalogo = {
    SALIDA_GPIO: { pines: [], parametros: {}, campos: {}, operaciones: { encender: {}, apagar: {} } },
    STEPPER_DRV8825: { pines: [], parametros: {}, campos: {}, operaciones: { mover: { delta: 'numero', velocidad: 'numero' }, habilitar: { activo: 'booleano' } } },
  }
  assert.deepEqual(m.tiposPermitidos(1, false), ['ACCION', 'ESPERA', 'BUCLE', 'PARALELO'])
  assert.deepEqual(m.tiposPermitidos(3, false), ['ACCION', 'ESPERA', 'BUCLE', 'PARALELO'])
  assert.deepEqual(m.tiposPermitidos(4, false), ['ACCION', 'ESPERA'], 'no más de 3 niveles de bloque')
  assert.deepEqual(m.tiposPermitidos(2, true), ['ACCION', 'ESPERA'], 'un PARALELO solo admite acción y espera')
  assert.deepEqual(m.nodoNuevo('ACCION', componentes, catalogo), { tipo: 'ACCION', componente: 'laser', comando: 'encender', argumentos: {} })
  assert.deepEqual(m.nodoNuevo('BUCLE', componentes, catalogo), { tipo: 'BUCLE', repeticiones: 1, pasos: [] })
  assert.deepEqual(m.moverPaso([1, 2, 3], 0, 1), [2, 1, 3])
  assert.deepEqual(m.moverPaso([1, 2, 3], 0, -1), [1, 2, 3])
  assert.deepEqual(m.borrarPaso([1, 2, 3], 1), [1, 3])

  // 6. El editor ofrece solo componentes vigentes y los comandos de su ficha.
  const html = renderToStaticMarkup(React.createElement(m.EditorPasos, {
    pasos: [accion('motor_x', 'mover', { delta: 1, velocidad: 2 }), { tipo: 'PARALELO', pasos: [] }],
    componentes, catalogo, onChange: () => {},
  }))
  assert.ok(html.includes('<option value="laser">laser</option>'))
  assert.ok(!html.includes('viejo'))
  assert.ok(html.includes('<option value="habilitar">Habilitar</option>'), 'el comando se muestra con nombre legible y se guarda con su clave')
  assert.ok(html.includes('Delta') && html.includes('Velocidad'))
  // Dentro del PARALELO (paso 2) solo hay acción y espera.
  const paralelo = html.slice(html.indexOf('En paralelo'))
  assert.ok(!/\+ Bucle[\s\S]*\+ Bucle/.test(html) , 'el bucle solo se ofrece en la raíz')
  assert.ok(paralelo.includes('+ Acción') && paralelo.includes('+ Espera'))

  // 7. FormularioComando en modo edición: sin botón de envío y con los valores iniciales.
  const form = renderToStaticMarkup(React.createElement(m.FormularioComando, {
    argumentos: { delta: 'numero' }, valoresIniciales: { delta: 2.5 }, onChange: () => {},
  }))
  assert.ok(!form.includes('<button'))
  assert.ok(form.includes('value="2.5"'))
  console.log('pasos: ok')
})().catch(e => { console.error(e); process.exit(1) })
