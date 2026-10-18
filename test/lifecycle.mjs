import assert from 'node:assert/strict'
import { test } from 'node:test'

// 确定性 hook 调度器：执行组件自身的 effect 和事件，不依赖 DOM 或真实网络。
// 宿主槽位及浏览器布局的集成验证仍由独立的端到端测试负责。
let registration
globalThis.window = { __ModuleLoader__: { load: (value) => { registration = value } } }
await import(process.env.DSH_CLIENT_SOURCE === 'src' ? '../src/client.js' : '../lib/client.js')

function harness(t) {
  const slots = []
  let cursor = 0
  let effects = []
  let interaction
  let tree
  const sameDeps = (a, b) => a !== undefined && b !== undefined && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat() } }),
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [slots[index].value, (value) => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value }]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
    useMemo(callback, deps) {
      const index = cursor++
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { value: callback(), deps }
      return slots[index].value
    },
    useCallback(callback, deps) { return React.useMemo(() => callback, deps) },
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    useEffect(callback, deps) {
      const index = cursor++
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) effects.push(() => {
        slots[index]?.cleanup?.()
        slots[index] = { deps, cleanup: callback() }
      })
    },
  }
  const internals = registration.factory(() => React).internals
  const originalFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = (url, options) => new Promise((resolve) => {
    requests.push({ url, options, respond: (value) => {
      const payload = JSON.parse(options.body)
      const binding = { requestId: payload.requestId, sessionId: payload.sessionId, interactionKey: payload.interactionKey, questions: payload.questions }
      const result = value !== null && typeof value === 'object' && !Array.isArray(value) ? { binding, ...value } : value
      resolve({ ok: true, status: 200, json: async () => ({ ok: true, value: result }) })
    } })
  })
  t.after(() => {
    for (const slot of slots) slot?.cleanup?.()
    globalThis.fetch = originalFetch
  })
  const snapshot = { status: 'ready', revision: 1, value: { enabled: true } }
  const props = {
    t: (key) => key,
    scope: { subscribe: () => () => {}, getSnapshot: () => snapshot },
    useSessionStatus: (select) => select(new Map([['session', { pendingInteraction: interaction }]])),
  }
  function render(flushEffects = true) {
    cursor = 0
    effects = []
    tree = internals.JevAdviceOverlay(props)
    if (flushEffects) for (const effect of effects) effect()
    return tree
  }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return undefined
    if (predicate(node)) return node
    for (const child of node.props.children ?? []) {
      const result = find(child, predicate)
      if (result) return result
    }
  }
  return {
    internals, requests, snapshot, render,
	  unmount() { for (const slot of slots) slot?.cleanup?.() },
    setInteraction(value) { interaction = value },
    body: () => find(tree, (node) => node.type === internals.JevAdviceBody)?.props,
    error: () => find(tree, (node) => node.props.key === 'error')?.props.children.join(''),
    canRetry: () => Boolean(find(tree, (node) => node.type === 'button' && node.props.children.includes('panel.retry'))),
    close: () => find(tree, (node) => node.type === 'button' && node.props.title === 'panel.dismiss').props.onClick(),
    async settle() { await new Promise((resolve) => setImmediate(resolve)); render() },
  }
}

const questions = [{ id: 'mode', question: 'Which mode?', options: [{ label: 'A' }, { label: 'B' }], multiSelect: false }]
const value = { advice: [{
  questionId: 'mode', kind: 'choice', supported: true, answered: true,
  pick: { index: 0, label: 'A', probability: 0.8 }, noneOfTheAbove: false, noneProbability: 0,
  probabilities: [{ index: 0, label: 'A', probability: 0.8 }, { index: 1, label: 'B', probability: 0.2 }],
}] }
const interaction = (key, answer = async () => {}, sessionId = 'session-a') => ({ key, sessionId, questions, answer })

test('已卸载浮层捕获的采纳事件与已关闭通道都不能提交', async t => {
	const h = harness(t)
	let submissions = 0
	let snapshot = { closed: false, channel: 'waterfall' }
	const current = { ...interaction('live', async () => { submissions++ }), getSnapshot: () => snapshot }
	h.setInteraction(current); h.render(); h.requests[0].respond(value); await h.settle()
	const adopt = h.body().onAdopt
	snapshot = { closed: true, channel: 'none' }
	await adopt()
	assert.equal(submissions, 0)
	snapshot = { closed: false, channel: 'rpc' }
	h.unmount()
	await adopt()
	assert.equal(submissions, 0)
})

test('a new interaction with identical questions triggers a new evaluation', async (t) => {
  const h = harness(t)
  h.setInteraction(interaction('one')); h.render()
  h.requests[0].respond(value); await h.settle()
  assert.equal(h.body().adoptable, true)
  h.setInteraction(interaction('two')); h.render()
  assert.equal(h.requests.length, 2)
  assert.equal(h.requests[0].options.signal.aborted, true)
  assert.equal(h.body(), undefined)
})

test('old advice disappears during render, before effect cleanup', async (t) => {
  const h = harness(t)
  h.setInteraction(interaction('one')); h.render()
  h.requests[0].respond(value); await h.settle()
  h.setInteraction(interaction('two')); h.render(false)
  assert.equal(h.body(), undefined)
})

test('late responses from a replaced interaction do not replace current advice', async (t) => {
  const h = harness(t)
  h.setInteraction(interaction('one')); h.render()
  h.setInteraction(interaction('two')); h.render()
  assert.equal(h.requests.length, 2)
  h.requests[1].respond(value); await h.settle()
  h.requests[0].respond({ ...value, model: 'stale' }); await h.settle()
  assert.notEqual(h.body().value.model, 'stale')
})

test('an event handler captured from an old interaction cannot submit', async (t) => {
  const h = harness(t)
  let submissions = 0
  h.setInteraction(interaction('one', async () => { submissions++ })); h.render()
  h.requests[0].respond(value); await h.settle()
  const adopt = h.body().onAdopt
  h.setInteraction(interaction('two')); h.render(false)
  adopt(); await h.settle()
  assert.equal(submissions, 0)
})

test('double clicks submit at most once, including before a rerender', async (t) => {
  const h = harness(t)
  let submissions = 0
  let finish
  h.setInteraction(interaction('one', () => { submissions++; return new Promise((resolve) => { finish = resolve }) })); h.render()
  h.requests[0].respond(value); await h.settle()
  const adopt = h.body().onAdopt
  adopt(); adopt()
  assert.equal(submissions, 1)
  finish(); await h.settle()
  h.body().onAdopt(); await h.settle()
  assert.equal(submissions, 1)
})

test('复制中的同步双击只写一次剪贴板，完成后可以再次复制', async (t) => {
  const h = harness(t)
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  let copies = 0
  let finish
  let submissions = 0
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: {
    writeText: () => { copies++; return new Promise((resolve) => { finish = resolve }) },
  } } })
  t.after(() => {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
    else delete globalThis.navigator
  })
  h.setInteraction(interaction('copy-lock', async () => { submissions++ })); h.render()
  h.requests[0].respond(value); await h.settle()
  const copy = h.body().onCopy
  copy(); copy()
  assert.equal(copies, 1)
  finish(); await h.settle()
  h.body().onCopy()
  assert.equal(copies, 2)
  finish(); await h.settle()
  assert.equal(submissions, 0)
  assert.equal(h.requests.length, 1)
})

test('a partial batch cannot submit through its event handler', async (t) => {
  const h = harness(t)
  let submissions = 0
  h.setInteraction({ ...interaction('one', async () => { submissions++ }), questions: [...questions, { id: 'text', question: 'Explain?' }] }); h.render()
  h.requests[0].respond(value); await h.settle()
  assert.equal(h.body().adoptable, false)
  h.body().onAdopt(); await h.settle()
  assert.equal(submissions, 0)
})

test('dismissal is scoped to session and question contents, not just interaction key', (t) => {
  const h = harness(t)
  h.setInteraction(interaction('one')); h.render(); h.close()
  assert.equal(h.render().props['data-dsh-jev-advisor'], 'reopen')
  h.setInteraction(interaction('one', undefined, 'session-b'))
  assert.notEqual(h.render(), null)
})

test('disabled settings do not fetch or expose adoptable old advice', async (t) => {
  const h = harness(t)
  h.snapshot.value.enabled = false
  h.setInteraction(interaction('one')); assert.equal(h.render(), null)
  assert.equal(h.requests.length, 0)
})

test('invalid input entries make a question batch incomplete', (t) => {
  const h = harness(t)
  assert.equal(h.internals.pendingQuestionsOf({ questions: [...questions, null] }).complete, false)
  assert.equal(h.internals.pendingQuestionsOf({ questions: [...questions, { question: 'missing id' }] }).complete, false)
  assert.equal(h.internals.pendingQuestionsOf({ questions: [...questions, questions[0]] }).complete, false)
})

test('client adoption rejects foreign labels and invalid probability values', (t) => {
  const h = harness(t)
  const bad = structuredClone(value.advice)
  bad[0].pick.label = 'not-an-option'
  assert.equal(h.internals.buildAnswers(questions, bad), undefined)
  bad[0].pick.label = 'A'; bad[0].pick.probability = 1.5
  assert.equal(h.internals.buildAnswers(questions, bad), undefined)
})

test('saving configuration cannot unlock a submitted interaction', async (t) => {
  const h = harness(t)
  let submissions = 0
  h.setInteraction(interaction('one', async () => { submissions++ })); h.render()
  h.requests[0].respond(value); await h.settle()
  h.body().onAdopt(); await h.settle()
  h.snapshot.revision++
  h.render(); h.requests[1].respond(value); await h.settle()
  h.body().onAdopt(); await h.settle()
  assert.equal(submissions, 1)
})

test('switching between two in-flight submissions cannot resubmit either interaction', async (t) => {
  const h = harness(t)
  let submissions = 0
  const answer = () => { submissions++; return new Promise(() => {}) }
  const first = interaction('one', answer)
  h.setInteraction(first); h.render(); h.requests[0].respond(value); await h.settle(); h.body().onAdopt()
  h.setInteraction(interaction('two', answer)); h.render(); h.requests[1].respond(value); await h.settle(); h.body().onAdopt()
  h.setInteraction(first); h.render(); h.requests[2].respond(value); await h.settle(); h.body().onAdopt()
  assert.equal(submissions, 2)
})

test('failed adoption can be retried without letting an old failure affect a new interaction', async (t) => {
  const h = harness(t)
  let calls = 0
  h.setInteraction(interaction('one', async () => { if (++calls === 1) throw new Error('retryable') })); h.render()
  h.requests[0].respond(value); await h.settle()
  h.body().onAdopt(); await h.settle()
  assert.equal(h.body().adoptError, 'retryable')
  h.body().onAdopt(); await h.settle()
  assert.equal(calls, 2)
  let reject
  h.setInteraction(interaction('two', () => new Promise((_resolve, fail) => { reject = fail }))); h.render()
  h.requests[1].respond(value); await h.settle(); h.body().onAdopt()
  h.setInteraction(interaction('three')); h.render()
  h.requests[2].respond(value); await h.settle()
  reject(new Error('stale failure')); await h.settle()
  assert.equal(h.body().adoptError, undefined)
  assert.equal(h.body().busy, false)
})

for (const invalid of [undefined, null, [], { advice: null }, { advice: {} }, { advice: [null] }]) {
  test(`malformed bridge result ${JSON.stringify(invalid)} is an error, not a render crash`, async (t) => {
    const h = harness(t)
    h.setInteraction(interaction('one')); h.render(); h.requests[0].respond(invalid)
    await h.settle()
    assert.equal(h.body(), undefined)
  })
}

test('a batch with duplicate option labels stays manual', (t) => {
  const h = harness(t)
  const ambiguous = { ...questions[0], options: [{ label: 'A' }, { label: 'A' }] }
  assert.equal(h.internals.pendingQuestionsOf({ questions: [ambiguous] }), undefined)
  assert.equal(h.internals.buildAnswers([ambiguous], value.advice), undefined)
})

test('client rejects a zero-mass choice distribution', (t) => {
  const h = harness(t)
  const advice = structuredClone(value.advice)
  advice[0].pick.probability = 0
  advice[0].probabilities.forEach((row) => { row.probability = 0 })
  assert.equal(h.internals.buildAnswers(questions, advice), undefined)
})

test('malformed nested advice is rejected before the presentation component renders', async (t) => {
  const h = harness(t)
  const invalid = structuredClone(value)
  invalid.advice[0].probabilities = {}
  h.setInteraction(interaction('one')); h.render(); h.requests[0].respond(invalid); await h.settle()
  assert.equal(h.body(), undefined)
})

test('replaying an old response payload into a new request is rejected', async (t) => {
  const h = harness(t)
  h.setInteraction(interaction('one')); h.render(); h.requests[0].respond(value); await h.settle()
  const oldPayload = h.body().value
  h.setInteraction(interaction('two')); h.render(); h.requests[1].respond(oldPayload); await h.settle()
  assert.equal(h.body(), undefined)
})

test('equivalent echoed questions with reordered object keys remain adoptable', async (t) => {
  const h = harness(t)
  h.setInteraction(interaction('one')); h.render()
  const binding = JSON.parse(h.requests[0].options.body)
  const reorder = (item) => Array.isArray(item) ? item.map(reorder)
    : item !== null && typeof item === 'object' ? Object.fromEntries(Object.entries(item).reverse().map(([key, child]) => [key, reorder(child)])) : item
  h.requests[0].respond({ ...value, binding: reorder(binding) })
  await h.settle()
  assert.equal(h.error(), undefined)
  assert.equal(h.body()?.adoptable, true)
})

test('binding checks use the exact sent JSON snapshot, not mutable local question objects', async (t) => {
  const h = harness(t)
  const stringify = JSON.stringify
  let mutated = false
  JSON.stringify = (item, ...args) => {
    const text = stringify(item, ...args)
    if (!mutated && item?.requestId && Array.isArray(item.questions)) {
      mutated = true
      item.questions[0].question = 'Changed after serialization'
    }
    return text
  }
  t.after(() => { JSON.stringify = stringify })
  h.setInteraction(interaction('one')); h.render()
  JSON.stringify = stringify
  assert.equal(mutated, true)
  const sentQuestions = h.requests[0].options.body
  // 网络中的正文不变，校验应比较发送时的快照而非后来被修改的对象。
  const next = { ...value, binding: JSON.parse(sentQuestions) }
  h.requests[0].respond(next); await h.settle()
  assert.equal(h.body()?.adoptable, true)
})

test('an old host response without binding explains restart instead of suggesting another evaluation', async (t) => {
  const h = harness(t)
  h.setInteraction(interaction('one')); h.render()
  h.requests[0].respond({ ...value, binding: undefined }); await h.settle()
  assert.equal(h.body(), undefined)
  assert.match(h.error(), /restart.*DSH.*refresh/i)
  assert.equal(h.canRetry(), false)
})

test('semantically changed echoed questions are still rejected', async (t) => {
  const h = harness(t)
  h.setInteraction(interaction('one')); h.render()
  const binding = JSON.parse(h.requests[0].options.body)
  binding.questions[0].question = 'A different question'
  h.requests[0].respond({ ...value, binding }); await h.settle()
  assert.equal(h.body(), undefined)
  assert.match(h.error(), /different request/)
})

test('reordering options is a semantic change and remains rejected', async (t) => {
  const h = harness(t)
  h.setInteraction(interaction('one')); h.render()
  const binding = JSON.parse(h.requests[0].options.body)
  binding.questions[0].options.reverse()
  h.requests[0].respond({ ...value, binding }); await h.settle()
  assert.equal(h.body(), undefined)
  assert.match(h.error(), /different request/)
})

test('a host that drops a non-empty decision preference is a non-retryable compatibility error', async (t) => {
	const h = harness(t)
	const payload = { requestId: 'preference-request', sessionId: 'session-a', interactionKey: 'interaction-a', questions, decisionPreference: 'Prefer stability' }
	const pending = h.internals.callApi('advise', payload)
	await new Promise((resolve) => setImmediate(resolve))
	h.requests[0].respond({ ...value, binding: {
		requestId: payload.requestId,
		sessionId: payload.sessionId,
		interactionKey: payload.interactionKey,
		questions: payload.questions,
	} })
	await assert.rejects(pending, (error) => {
		assert.equal(error.retryable, false)
		assert.match(error.message, /does not echo decision preferences/i)
		return true
	})
})

test('a host that changes a non-empty decision preference is rejected as a different request', async (t) => {
	const h = harness(t)
	const payload = { requestId: 'preference-request-2', sessionId: 'session-a', interactionKey: 'interaction-a', questions, decisionPreference: 'Prefer stability' }
	const pending = h.internals.callApi('advise', payload)
	await new Promise((resolve) => setImmediate(resolve))
	h.requests[0].respond({ ...value, binding: {
		requestId: payload.requestId,
		sessionId: payload.sessionId,
		interactionKey: payload.interactionKey,
		questions: payload.questions,
		decisionPreference: 'Finish quickly',
	} })
	await assert.rejects(pending, /different request/)
})
