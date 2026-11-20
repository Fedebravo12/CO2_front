const { build } = require('esbuild')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'confirmacion-test-'))
const output = path.join(temporary, 'bundle.cjs')

// Ejecuta el componente con hooks simulados; no sustituye una prueba de foco en navegador.
;(async () => {
  await build({ entryPoints: ['src/components/Confirmacion.tsx'], bundle: true, platform: 'node', format: 'cjs', outfile: output, plugins: [{ name: 'fixture', setup(b) {
    b.onResolve({ filter: /context\/SystemContext$/ }, () => ({ path: 'system', namespace: 'fixture' }))
    b.onResolve({ filter: /^react$/ }, () => ({ path: 'hooks', namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: {
      system: 'export const useSystem = () => globalThis.fixture',
      hooks: ['useState', 'useRef', 'useEffect', 'useId'].map(h => `export const ${h} = (...a) => globalThis.hooks.${h}(...a)`).join('\n'),
    }[a.path] }))
    b.onResolve({ filter: /^react\// }, a => ({ path: require.resolve(a.path), external: true }))
  } }] })
  const { Confirmacion } = require(output)

  // Hooks mínimos: estado y refs persistentes por posición; efectos con dependencias y limpieza.
  let slots, effects, index
  const reset = () => { slots = []; effects = []; index = 0 }
  global.hooks = {
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = v }] },
    useRef(initial) { const i = index++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i] },
    useId() { return ':r0:' },
    useEffect(fn, deps) {
      const i = index++, prev = effects[i]
      if (prev && deps && deps.every((d, k) => Object.is(d, prev.deps[k]))) return
      prev?.cleanup?.()
      effects[i] = { deps, cleanup: fn() }
    },
  }
  const listeners = new Set()
  global.document = {
    activeElement: null,
    addEventListener: (_, f) => listeners.add(f),
    removeEventListener: (_, f) => listeners.delete(f),
  }
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)]
  const find = (tree, pred) => nodes(tree).find(pred)
  const boton = (tree, text) => find(tree, n => n.type === 'button' && n.props.children === text)

  let cancelaciones = 0, confirmaciones = 0
  const props = () => ({ titulo: 'Eliminar programa', confirmar: 'Eliminar', children: 'texto',
    onCancelar: () => { cancelaciones++ }, onConfirmar: async () => { confirmaciones++ } })
  const render = () => { index = 0; return Confirmacion(props()) }

  reset()
  global.fixture = { estado: 'REPOSO' }
  let tree = render()
  const dialogo = find(tree, n => n.props?.role === 'alertdialog')
  assert.ok(dialogo, 'es un alertdialog')
  assert.equal(dialogo.props['aria-modal'], undefined, 'no se declara modal: la cabecera sigue operable')
  assert.equal(find(tree, n => n.props?.className === 'modal-bg').type, 'div')
  assert.equal(boton(tree, 'Cancelar').props.autoFocus, true, 'el foco arranca en Cancelar')
  assert.match(boton(tree, 'Eliminar').props.className, /peligro/)

  listeners.forEach(f => f({ key: 'Enter' }))
  assert.equal(cancelaciones, 0)
  listeners.forEach(f => f({ key: 'Escape' }))
  assert.equal(cancelaciones, 1, 'Escape cancela desde cualquier lugar del documento')

  await boton(tree, 'Eliminar').props.onClick()
  assert.equal(confirmaciones, 1)

  // Pasa a emergencia: se cancela sola, una vez.
  global.fixture = { estado: 'GRABANDO' }
  render()
  global.fixture = { estado: 'EMERGENCIA' }
  render()
  assert.equal(cancelaciones, 2, 'la emergencia cancela la confirmación')
  render()
  assert.equal(cancelaciones, 2, 'no vuelve a cancelar mientras sigue en emergencia')

  // Abierta durante una emergencia (p. ej. cerrar sesión): no se cancela por eso.
  reset()
  cancelaciones = 0
  global.fixture = { estado: 'EMERGENCIA' }
  tree = render()
  render()
  assert.equal(cancelaciones, 0, 'abierta ya en emergencia, sigue abierta')
  index = 0
  assert.doesNotMatch(boton(Confirmacion({ ...props(), tono: 'neutral' }), 'Eliminar').props.className, /peligro/, 'tono neutral sin rojo')

  console.log('PASS: alertdialog no modal, foco en Cancelar, Escape cancela, confirma, se cancela al pasar a emergencia')
})().finally(() => fs.rmSync(temporary, { recursive: true, force: true }))
