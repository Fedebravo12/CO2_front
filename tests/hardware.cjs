const { build } = require('esbuild')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'hardware-test-'))
const output = path.join(temporary, 'bundle.cjs')

;(async () => {
  await build({ entryPoints: ['src/components/HardwareManual.tsx'], bundle: true, platform: 'node', format: 'cjs', outfile: output, plugins: [{ name: 'fixture', setup(b) {
    b.onResolve({ filter: /^react$/ }, () => ({ path: 'hooks', namespace: 'fixture' }))
    b.onResolve({ filter: /^react-router-dom$/ }, () => ({ path: 'router', namespace: 'fixture' }))
    b.onResolve({ filter: /api\/hardware$/ }, () => ({ path: 'hardware', namespace: 'fixture' }))
    b.onResolve({ filter: /api\/control$/ }, () => ({ path: 'control', namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: {
      hooks: 'export const useState = (...a) => globalThis.hooks.useState(...a); export const useRef = () => ({current:Date.now()}); export const useEffect = () => {}',
      router: 'export const Link = "a"',
      hardware: 'export const hardwareApi = { comando: (...a) => globalThis.command(...a) }',
      control: 'export const control = { comando: (...a) => globalThis.systemCommand(...a) }',
    }[a.path] }))
    b.onResolve({ filter: /^react\// }, a => ({ path: require.resolve(a.path), external: true }))
  } }] })
  const { HardwareManual } = require(output)
  let states = [], index = 0, commands = []
  global.hooks = { useState(initial) { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], v => { states[i] = typeof v === 'function' ? v(states[i]) : v }] } }
  global.command = async (...args) => { commands.push(args); return { id: 'cmd-1', estado: 'RECIBIDO' } }
  global.systemCommand = async (...args) => { commands.push(args) }
  const nodes = t => !t || typeof t !== 'object' ? [] : Array.isArray(t) ? t.flatMap(nodes) : [t, ...nodes(t.props?.children)]
  const button = (tree, text) => nodes(tree).find(n => n.type === 'button' && n.props.children === text)
  const render = (props = {}) => { index = 0; return HardwareManual(props) }
  render()
  states[0] = { revision_aplicada: 'rev1', revision_deseada: 'rev1', cola: 0, capacidad_cola: 32,
    emergencia: false, aplicando: false, resultados: [], componentes: {
      'Shutter izquierdo': { tipo: 'SHUTTER_GPIO', estado: 'Vigente', calidad: 'OK',
        operaciones: { armar: {}, abrir: {}, cerrar: {} }, valores: { salida_apertura: false, realimentacion: false } },
      'Shutter derecho': { tipo: 'SHUTTER_GPIO', estado: 'Eliminado', operaciones: { abrir: {} } },
    } }
  let tree = render()
  assert.equal(button(tree, 'Armar').props.disabled, false)
  assert.equal(nodes(tree).filter(n => n.type === 'button' && n.props.children === 'Abrir').length, 1)
  await button(tree, 'Armar').props.onClick()
  assert.deepEqual(commands[0], ['Shutter izquierdo', 'armar', {}, 'rev1'])
  tree = render()
  assert.equal(button(tree, 'Abrir').props.disabled, true, 'HTTP acceptance must not permit another order')
  assert.ok(nodes(tree).some(n => n.props?.role === 'status'))
  await button(tree, 'Detener todos los componentes').props.onClick()
  assert.deepEqual(commands[1], ['emergencia'], 'stop remains available while command is pending')
  tree = render({ soloLectura: true })
  assert.ok(!button(tree, 'Abrir'))
  assert.ok(!button(tree, 'Detener todos los componentes'))
  states[0].emergencia = true
  tree = render()
  assert.equal(button(tree, 'Abrir').props.disabled, true)
  assert.equal(button(tree, 'Rearmar después del apagado').props.disabled, false)
  states[1] = 'Sin conexión'
  tree = render()
  assert.equal(button(tree, 'Rearmar después del apagado').props.disabled, true)
  assert.ok(nodes(tree).some(n => n.props?.role === 'alert'))
  assert.ok(nodes(tree).some(n => n.type === 'dd' && n.props.children === '—'))
  console.log('PASS: named instances, disabled components, correlated pending command, stop priority, read-only telemetry and disconnected state')
})().finally(() => fs.rmSync(temporary, { recursive: true, force: true }))
