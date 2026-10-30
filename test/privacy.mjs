import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import * as product from '../src/index.js'
import { ACCEPTED_KEY, createMockTypeSafeServer } from './mock-typesafe.mjs'

const questions = [{ id: 'mode', question: 'Choose?', multiSelect: false, options: [{ label: 'A' }, { label: 'B' }] }]
const binding = { requestId: 'privacy-1', sessionId: 'session-1', interactionKey: 'interaction-1', questions }

test('默认脱敏上下文和题目中的常见凭证，但保留原始答案映射', () => {
  assert.equal(typeof product.prepareJevRequest, 'function')
  const raw = [{ ...questions[0], options: [{ label: 'api_key=very-secret-value' }, { label: 'B' }] }]
  const prepared = product.prepareJevRequest({ questions: raw, transcript: 'Authorization: Bearer example-secret-token\npassword=hunter2', model: 'jev-latest' })
  const wire = JSON.stringify(prepared.body)
  assert.doesNotMatch(wire, /very-secret-value|example-secret-token|hunter2/)
  assert.ok(prepared.privacy.redactions >= 3)
  assert.equal(prepared.plan[0].options[0].label, 'api_key=very-secret-value')
  assert.equal(raw[0].options[0].label, 'api_key=very-secret-value')
  assert.equal(prepared.privacy.requestBytes, Buffer.byteLength(wire))
})

test('脱敏可关闭，不会声称已识别所有敏感信息', () => {
  assert.equal(typeof product.prepareJevRequest, 'function')
  const prepared = product.prepareJevRequest({ questions, transcript: 'password=hunter2', model: 'jev-latest', redactSensitive: false })
  assert.match(JSON.stringify(prepared.body), /hunter2/)
  assert.equal(prepared.privacy.redactions, 0)
})

test('临时偏好独立进入评估上下文，并提示按偏好权衡而不改变选项', () => {
  const prepared = product.prepareJevRequest({ questions, transcript: '', decisionPreference: ' 优先稳定，尽量少改代码 ' })
  assert.equal(prepared.body.state.decisionPreference, '优先稳定，尽量少改代码')
  assert.match(prepared.body.questions.decision_0.instructions, /decisionPreference/)
  assert.equal(prepared.body.state.context, '(no conversation context provided)')
  assert.equal(prepared.plan[0].options[0].label, 'A')
  const unchanged = product.prepareJevRequest({ questions, transcript: '', decisionPreference: '   ' })
  assert.equal(Object.hasOwn(unchanged.body.state, 'decisionPreference'), false)
})

test('偏好中的凭证也先脱敏，并计入完整请求预算', () => {
  const prepared = product.prepareJevRequest({ questions, decisionPreference: 'prefer password=temporary-secret', transcript: '' })
  assert.doesNotMatch(JSON.stringify(prepared.body), /temporary-secret/)
  assert.equal(prepared.privacy.redactions, 1)
  assert.equal(prepared.privacy.requestBytes, Buffer.byteLength(JSON.stringify(prepared.body)))
})

test('完整预算优先缩减会话文本，不静默截断用户显式偏好', () => {
  const decisionPreference = '稳'.repeat(500)
  const prepared = product.prepareJevRequest({ questions, decisionPreference, transcript: '对话'.repeat(10000), maxBytes: 4096 })
  assert.equal(prepared.body.state.decisionPreference, decisionPreference)
  assert.equal(prepared.privacy.truncated, true)
  assert.ok(prepared.privacy.requestBytes <= 4096)
})

test('UTF-8 完整请求预算优先减少上下文，不改变题目选项', () => {
  assert.equal(typeof product.prepareJevRequest, 'function')
  const prepared = product.prepareJevRequest({ questions, transcript: '😀中文'.repeat(12000), model: 'jev-latest', maxBytes: 4096 })
  assert.ok(prepared.privacy.requestBytes <= 4096)
  assert.equal(prepared.privacy.truncated, true)
  assert.equal(prepared.body.state.decisions[0].question, 'Choose?')
  assert.equal(prepared.body.state.decisions[0].options[0].label, 'A')
  assert.doesNotMatch(prepared.body.state.context, /[\uD800-\uDBFF]$/)
})

test('题目本身超出预算时拒绝，而非截断或调用上游', () => {
  assert.equal(typeof product.prepareJevRequest, 'function')
  assert.throws(() => product.prepareJevRequest({ questions: [{ ...questions[0], question: '题'.repeat(40000) }], transcript: '', model: 'jev-latest' }), { code: 'jev/request-too-large' })
})

async function fixture(t, config = {}) {
  const upstream = await createMockTypeSafeServer()
  const routes = new Map()
  const cleanups = []
  const settings = { apiKey: ACCEPTED_KEY, endpoint: upstream.url, ...config }
  let transcript = ''
  let events = []
  product.apply({
    get: (name) => name === 'sessions' ? { get: () => ({
      deriveMessages: () => [{ role: 'user', content: transcript }],
      snapshotEvents: () => events,
    }) } : undefined,
    inject: () => {},
    effect: (callback) => { const cleanup = callback(); if (typeof cleanup === 'function') cleanups.push(cleanup) },
    webServer: { register: ({ path, handler }) => { routes.set(path, handler); return () => {} } },
  }, settings)
  const server = createServer((request, response) => {
    const handler = routes.get(request.url)
    if (handler) void handler(request, response)
    else { response.statusCode = 404; response.end('{}') }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    for (const cleanup of cleanups.reverse()) cleanup()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    await upstream.close()
  })
  const origin = `http://127.0.0.1:${server.address().port}`
  return { upstream, settings, setTranscript: (value) => { transcript = value }, setEvents: (value) => { events = value }, async post(route, body) {
    const response = await fetch(`${origin}/dsh-jev-advisor/api/${route}`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: response.status, body: await response.json() }
  } }
}

test('预览不发上游；确认发送的正文必须与预览快照相同', async (t) => {
  const f = await fixture(t, { requireConfirmation: true })
  const preview = await f.post('prepare', binding)
  assert.equal(preview.status, 200)
  assert.deepEqual(preview.body.value.binding, binding)
  assert.equal(f.upstream.requests.length, 0)
  assert.equal((await f.post('advise', binding)).status, 409)
  const sent = await f.post('advise', { ...binding, previewToken: preview.body.value.previewToken })
  assert.equal(sent.status, 200)
  assert.deepEqual(f.upstream.requests[0].body, preview.body.value.request)
  assert.deepEqual(sent.body.value.binding, binding)
  assert.equal(sent.body.value.privacy.requestBytes, preview.body.value.privacy.requestBytes)
})

test('布局配置变化不使已有宿主预览失效，也不进入 Jev 请求', async t => {
  const f = await fixture(t, { requireConfirmation: true })
  const preview = await f.post('prepare', binding)
  f.settings.cardDock = 'right'
  f.settings.cardCollapsed = true
  const sent = await f.post('advise', { ...binding, previewToken: preview.body.value.previewToken })
  assert.equal(sent.status, 200)
  assert.deepEqual(f.upstream.requests[0].body, preview.body.value.request)
  assert.doesNotMatch(JSON.stringify(f.upstream.requests[0].body), /cardDock|cardCollapsed/)
  assert.equal(f.upstream.requests.length, 1)
})

test('自动模式保留偏好绑定；关闭会话上下文也发送显式偏好', async (t) => {
  const f = await fixture(t, { includeTranscript: false })
  f.setTranscript('this transcript must not be sent')
  const request = { ...binding, decisionPreference: '优先稳定' }
  const sent = await f.post('advise', request)
  assert.equal(sent.status, 200)
  assert.deepEqual(sent.body.value.binding, request)
  assert.equal(f.upstream.requests[0].body.state.decisionPreference, '优先稳定')
  assert.doesNotMatch(JSON.stringify(f.upstream.requests[0].body), /transcript must not/)
})

test('预览绑定临时偏好，修改或移除偏好后必须重新预览', async (t) => {
  const f = await fixture(t, { requireConfirmation: true })
  const request = { ...binding, decisionPreference: '尽快完成' }
  const preview = await f.post('prepare', request)
  assert.equal(preview.status, 200)
  assert.deepEqual(preview.body.value.binding, request)
  const previewToken = preview.body.value.previewToken
  assert.equal((await f.post('advise', { ...request, decisionPreference: '优先稳定', previewToken })).status, 409)
  assert.equal((await f.post('advise', { ...binding, previewToken })).status, 409)
  assert.equal(f.upstream.requests.length, 0)
  assert.equal((await f.post('advise', { ...request, previewToken })).status, 200)
  assert.deepEqual(f.upstream.requests[0].body, preview.body.value.request)
})

test('无效或超长偏好在准备和评估前拒绝，不产生上游调用', async (t) => {
  const f = await fixture(t)
  for (const decisionPreference of [null, 42, {}, [], 'x'.repeat(501), '😀'.repeat(251)]) {
    for (const route of ['prepare', 'advise']) {
      const result = await f.post(route, { ...binding, decisionPreference })
      assert.equal(result.status, 400)
      assert.equal(result.body.error.code, 'jev/bad-request')
    }
  }
  assert.equal(f.upstream.requests.length, 0)
})

test('更换会话、问题或设置后不能借旧预览发送', async (t) => {
  const f = await fixture(t, { requireConfirmation: true })
  const preview = await f.post('prepare', binding)
  assert.equal(preview.status, 200)
  const previewToken = preview.body.value.previewToken
  assert.equal((await f.post('advise', { ...binding, sessionId: 'other', previewToken })).status, 409)
  assert.equal((await f.post('advise', { ...binding, questions: [{ ...questions[0], question: 'changed' }], previewToken })).status, 409)
  f.settings.includeTranscript = false
  assert.equal((await f.post('advise', { ...binding, previewToken })).status, 409)
  assert.equal(f.upstream.requests.length, 0)
})

test('会话继续变化时，确认仍发送用户已经预览的脱敏快照', async (t) => {
  const f = await fixture(t, { requireConfirmation: true })
  f.setTranscript('first password=hunter2')
  const preview = await f.post('prepare', binding)
  assert.doesNotMatch(JSON.stringify(preview.body.value.request), /hunter2/)
  f.setTranscript('a new conversation message that was not previewed')
  const sent = await f.post('advise', { ...binding, previewToken: preview.body.value.previewToken })
  assert.equal(sent.status, 200)
  assert.deepEqual(f.upstream.requests[0].body, preview.body.value.request)
  assert.doesNotMatch(JSON.stringify(f.upstream.requests[0].body), /a new conversation/)
})

test('上下文达到截断边界时，先脱敏再截断，不能泄漏凭证后缀', async (t) => {
  const f = await fixture(t)
  f.setTranscript(`${'x'.repeat(1000)}\npassword=${'S'.repeat(300)} ${'y'.repeat(23900)}`)
  const sent = await f.post('advise', binding)
  assert.equal(sent.status, 200)
  assert.ok(sent.body.value.privacy.redactions >= 1)
  assert.doesNotMatch(JSON.stringify(f.upstream.requests[0].body), /S{20}/)
  assert.ok(Array.from(f.upstream.requests[0].body.state.context).length <= 24001)
})

test('无选项题也不能绕过确认要求或预览身份校验', async (t) => {
  const f = await fixture(t, { requireConfirmation: true })
  const preview = await f.post('prepare', binding)
  const unsupported = { ...binding, questions: [{ id: 'text', question: 'Explain?' }] }
  assert.equal((await f.post('advise', unsupported)).status, 409)
  assert.equal((await f.post('advise', { ...unsupported, previewToken: preview.body.value.previewToken })).status, 409)
  assert.equal(f.upstream.requests.length, 0)
})

test('预览过期或被容量淘汰后不能发送', async (t) => {
  const f = await fixture(t, { requireConfirmation: true })
  const first = await f.post('prepare', binding)
  for (let index = 0; index < 32; index++) await f.post('prepare', { ...binding, requestId: `capacity-${index}` })
  assert.equal((await f.post('advise', { ...binding, previewToken: first.body.value.previewToken })).status, 409)
  const current = await f.post('prepare', binding)
  const originalNow = Date.now
  Date.now = () => current.body.value.expiresAt + 1
  try { assert.equal((await f.post('advise', { ...binding, previewToken: current.body.value.previewToken })).status, 409) }
  finally { Date.now = originalNow }
  assert.equal(f.upstream.requests.length, 0)
})

test('兼容模式仍自动评估并返回发送范围、大小和实际用量', async (t) => {
  const f = await fixture(t)
  const result = await f.post('advise', binding)
  assert.equal(result.status, 200)
  assert.equal(result.body.value.privacy.includedTranscript, false)
  assert.equal(result.body.value.privacy.requestBytes, Buffer.byteLength(JSON.stringify(f.upstream.requests[0].body)))
  assert.deepEqual(result.body.value.usage, { input_tokens: 100, output_tokens: 10 })
})

test('状态接口不回显 endpoint URL 的用户名和密码', async (t) => {
  const f = await fixture(t, { endpoint: 'https://user:private-password@example.test/v1/systemone' })
  const status = await f.post('status', {})
  assert.equal(status.status, 200)
  assert.equal(status.body.value.endpoint, 'https://example.test/v1/systemone')
  assert.doesNotMatch(JSON.stringify(status.body), /private-password|user:/)
})

function directRoutes() {
  const routes = new Map()
  const cleanups = []
  product.apply({ get: () => undefined, inject: () => {},
    effect: (callback) => { const cleanup = callback(); if (typeof cleanup === 'function') cleanups.push(cleanup) },
    webServer: { register: ({ path, handler }) => { routes.set(path, handler); return () => {} } },
  }, { apiKey: ACCEPTED_KEY })
  return { close: () => cleanups.reverse().forEach((cleanup) => cleanup()), start(body) {
    const request = Readable.from([Buffer.from(JSON.stringify(body))])
    Object.assign(request, { method: 'POST', headers: { host: 'localhost:1234', 'content-type': 'application/json' }, socket: { remoteAddress: '127.0.0.1' } })
    const response = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false, setHeader() {}, end(value) { this.value = JSON.parse(value); this.writableEnded = true } })
    return { response, promise: routes.get('/dsh-jev-advisor/api/advise')(request, response) }
  } }
}

test('同交互的并发评估共用一次上游调用，但分别回显各自请求 ID', async () => {
  const originalFetch = globalThis.fetch
  const f = directRoutes()
  let calls = 0
  let finish
  globalThis.fetch = async () => { calls++; return new Promise((resolve) => { finish = resolve }) }
  try {
    const a = f.start(binding)
    const b = f.start({ ...binding, requestId: 'privacy-2' })
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(calls, 1)
    finish(new Response(JSON.stringify({ answers: { decision_0: { type: 'choice', choice: 'opt_0', probabilities: { opt_0: 0.8, opt_1: 0.1, __none_of_the_above__: 0.1 } } } })))
    await Promise.all([a.promise, b.promise])
    assert.equal(a.response.value.value.binding.requestId, 'privacy-1')
    assert.equal(b.response.value.value.binding.requestId, 'privacy-2')
    assert.equal(b.response.value.value.reused, true)
  } finally { f.close(); globalThis.fetch = originalFetch }
})

test('浏览器断连后宿主向仍在等待的上游传播取消', async () => {
  const originalFetch = globalThis.fetch
  const f = directRoutes()
  let sharedSignal
  globalThis.fetch = (_url, options) => { sharedSignal = options.signal; return new Promise(() => {}) }
  try {
    const pending = f.start(binding)
    await new Promise((resolve) => setImmediate(resolve))
    pending.response.destroyed = true
    pending.response.emit('close')
    await pending.promise
    assert.equal(sharedSignal.aborted, true)
    assert.equal(pending.response.value, undefined)
  } finally { f.close(); globalThis.fetch = originalFetch }
})

test('越权审批关联的 tool/call 参数进入 state.approval 并执行凭证脱敏与绑定校验', async (t) => {
  const f = await fixture(t, { requireConfirmation: true })
  f.setEvents([
    { type: 'tool/call', data: { callId: 'call-99', name: 'bash', arguments: '{"cmd":"curl https://admin:supersecret@example.com"}' } },
  ])
  const approvalReq = {
    ...binding,
    approval: { toolName: 'bash', callId: 'call-99', reason: 'token=my-secret-token' },
    comparePerspectives: true,
    questions: [{
      id: 'approval',
      question: 'Allow bash?',
      approval: true,
      multiSelect: false,
      options: [{ label: 'allow-once' }, { label: 'reject' }],
    }],
  }
  const preview = await f.post('prepare', approvalReq)
  assert.equal(preview.status, 200)
  assert.deepEqual(preview.body.value.binding, approvalReq)
  const wire = JSON.stringify(preview.body.value.request)
  assert.doesNotMatch(wire, /supersecret|my-secret-token/)
  assert.equal(preview.body.value.request.state.approval.toolName, 'bash')
  assert.match(preview.body.value.request.state.approval.arguments, /\[REDACTED\]/)
  assert.ok(preview.body.value.request.questions.decision_0_risk)
  assert.ok(preview.body.value.request.questions.decision_0_perspective_stable)
})

