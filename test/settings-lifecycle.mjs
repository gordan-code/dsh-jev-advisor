import assert from 'node:assert/strict'
import { test } from 'node:test'

let registration
globalThis.window = { __ModuleLoader__: { load(value) { registration = value } } }
await import(process.env.DSH_CLIENT_SOURCE === 'src' ? '../src/client.js' : '../lib/client.js')

// 确定性运行真实设置组件：延迟写入和网络返回，不以 React 的静默忽略掩盖卸载后更新。
function settingsHarness(t) {
  const slots = []
  let cursor = 0, effects = [], tree, mounted = true, lateUpdates = 0
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat() } }),
    useState(initial) {
      const i = cursor++
      slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [slots[i].value, (next) => {
        if (!mounted) { lateUpdates++; return }
        slots[i].value = typeof next === 'function' ? next(slots[i].value) : next
      }]
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } },
    useMemo(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value },
    useCallback(fn, deps) { return React.useMemo(() => fn, deps) },
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    useEffect(fn, deps) {
      const i = cursor++
      if (!same(slots[i]?.deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() } })
    },
  }
  const internals = registration.factory(() => React).internals
  const originalFetch = globalThis.fetch
  const requests = [], writes = []
  globalThis.fetch = (url, options) => new Promise((resolve) => requests.push({
    url, options, respond(value) { resolve({ ok: true, status: 200, json: async () => ({ ok: true, value }) }) },
  }))
  const snapshot = { status: 'ready', writable: true, revision: 1, value: { model: 'jev-latest', apiKey: 'fixture-only' } }
  const scope = {
    subscribe: () => () => {}, getSnapshot: () => snapshot,
    mutate(...args) { return new Promise((resolve) => writes.push({ method: 'mutate', args, resolve })) },
    set(...args) { return new Promise((resolve) => writes.push({ method: 'set', args, resolve })) },
  }
  const props = { t: (key) => key, scope }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return undefined
    if (predicate(node)) return node
    for (const child of node.props?.children ?? []) { const found = find(child, predicate); if (found) return found }
  }
  function render() {
    cursor = 0; effects = []
    tree = internals.JevSettingsSection(props)
    for (const effect of effects) effect()
  }
  function unmount() {
    if (!mounted) return
    mounted = false
    for (const slot of slots) { slot?.cleanup?.(); if (slot) slot.cleanup = undefined }
  }
  t.after(() => { unmount(); globalThis.fetch = originalFetch })
  const api = {
    props, scope, snapshot, requests, writes, render, unmount,
    lateUpdates: () => lateUpdates,
    button(key) { return find(tree, (n) => n.type === 'button' && n.props.children.includes(`settings.${key}`))?.props },
    input(key) { return find(find(tree, (n) => n.props.label === `settings.${key}`), (n) => n.type === 'input')?.props },
    edit(key, value) { api.input(key).onChange({ target: { value } }); render() },
    message(key) { return Boolean(find(tree, (n) => n.props.children?.includes(`settings.${key}`))) },
    async settle() { await new Promise((resolve) => setImmediate(resolve)); if (mounted) render() },
    async finishStatus(hasKey = true) { requests.at(-1).respond({ hasKey }); await api.settle() },
  }
  render()
  return api
}

test('设置卸载中止状态读取，忽略迟到响应和旧事件', async (t) => {
  const h = settingsHarness(t)
  const testClick = h.button('test').onClick
  const first = h.requests[0]
  h.unmount()
  assert.equal(first.options.signal?.aborted, true)
  first.respond({ hasKey: true }); await h.settle()
  testClick(); await h.settle()
  assert.equal(h.requests.length, 1)
  assert.equal(h.lateUpdates(), 0)
})

test('设置连接测试卸载后中止且不更新界面', async (t) => {
  const h = settingsHarness(t)
  await h.finishStatus()
  h.button('test').onClick()
  const request = h.requests.at(-1)
  assert.match(request.url, /\/test$/)
  h.unmount()
  assert.equal(request.options.signal?.aborted, true)
  request.respond({ model: 'late-fixture' }); await h.settle()
  assert.equal(h.lateUpdates(), 0)
})

test('异步保存使用同步互斥锁，完成前不允许清除或连接测试', async (t) => {
  const h = settingsHarness(t)
  await h.finishStatus()
  h.edit('model', 'submitted')
  const save = h.button('save').onClick, clear = h.button('clearKey').onClick, probe = h.button('test').onClick
  save(); save(); clear(); probe()
  assert.equal(h.writes.length, 1)
  assert.equal(h.requests.length, 1)
  assert.equal(h.writes[0].method, 'mutate')
  h.writes[0].resolve(true); await h.settle(); await h.finishStatus()
  assert.equal(h.message('saved'), true)
})

for (const accepted of [true, false]) test(`保存返回 ${accepted} 时保留保存期间输入的新草稿`, async (t) => {
  const h = settingsHarness(t)
  await h.finishStatus()
  h.edit('model', 'submitted')
  h.button('save').onClick()
  h.edit('model', 'newer-draft')
  h.writes[0].resolve(accepted); await h.settle()
  if (accepted) await h.finishStatus()
  assert.equal(h.input('model').value, 'newer-draft')
  assert.equal(h.message('saved'), accepted)
  assert.equal(h.button('save').disabled, false)
})

test('清除 Key 完成不删除等待期间输入的新 Key，拒绝也保留草稿', async (t) => {
  const h = settingsHarness(t)
  await h.finishStatus()
  h.edit('apiKey', 'old-draft')
  h.button('clearKey').onClick()
  h.edit('apiKey', 'new-fixture-key')
  h.writes[0].resolve(true); await h.settle(); await h.finishStatus(false)
  assert.equal(h.input('apiKey').value, 'new-fixture-key')
  h.button('clearKey').onClick()
  h.writes[1].resolve(false); await h.settle()
  assert.equal(h.input('apiKey').value, 'new-fixture-key')
  assert.equal(h.message('saved'), false)
})

for (const action of ['save', 'clearKey']) test(`${action} 的迟到写入完成不在卸载后刷新状态或更新界面`, async (t) => {
  const h = settingsHarness(t)
  await h.finishStatus()
  h.edit('model', 'submitted')
  h.button(action).onClick()
  h.unmount()
  h.writes[0].resolve(true); await h.settle()
  assert.equal(h.requests.length, 1)
  assert.equal(h.lateUpdates(), 0)
})

test('较旧状态响应不能覆盖新修订的 Key 状态', async (t) => {
  const h = settingsHarness(t)
  const old = h.requests[0]
  h.snapshot.revision++
  h.render()
  await h.finishStatus(false)
  old.respond({ hasKey: true }); await h.settle()
  assert.equal(old.options.signal?.aborted, true)
  assert.equal(h.input('apiKey').placeholder, 'settings.apiKeyPlaceholder')
})

test('旧事件在配置变成只读后不能写入', async (t) => {
  const h = settingsHarness(t)
  await h.finishStatus()
  h.edit('model', 'submitted')
  const clear = h.button('clearKey').onClick, save = h.button('save').onClick
  h.snapshot.writable = false; h.render()
  clear(); save(); await h.settle()
  assert.equal(h.writes.length, 0)
})

test('仅空白 Key 草稿不能显示保存成功或暗示凭据已清除', async (t) => {
  const h = settingsHarness(t)
  await h.finishStatus()
  h.edit('apiKey', '  ')
  h.button('save').onClick(); await h.settle()
  assert.equal(h.writes.length, 0)
  assert.equal(h.requests.length, 1)
  assert.equal(h.input('apiKey').value, '  ')
  assert.equal(h.message('saved'), false)
  assert.equal(h.message('blankKey'), true)
})
