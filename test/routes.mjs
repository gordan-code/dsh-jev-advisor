import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { apply } from '../lib/index.js'

function host(connection) {
  const routes = new Map()
  apply({
    get: (name) => name === 'connection' ? connection : undefined,
    inject: () => {}, effect: (callback) => callback(),
    webServer: { register: ({ path, handler }) => { routes.set(path, handler); return () => {} } },
  }, {})
  return async (route, { method = 'POST', headers = {}, body = '{}', encrypted = false, remoteAddress = '127.0.0.1' } = {}) => {
    const request = Readable.from([Buffer.from(body)])
    Object.assign(request, { method, headers: { host: 'localhost:43219', 'content-type': 'application/json', ...headers }, socket: { encrypted, remoteAddress } })
    const response = { headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value }, end(value) { this.value = JSON.parse(value) } }
    await routes.get(`/dsh-jev-advisor/api/${route}`)(request, response)
    return response
  }
}

test('same-origin loopback requests work without exposing credentials', async () => {
  const response = await host()('status', { headers: { origin: 'http://localhost:43219', 'sec-fetch-site': 'same-origin' } })
  assert.equal(response.statusCode, 200)
  assert.equal(response.value.value.hasKey, false)
  assert.equal('apiKey' in response.value.value, false)
  assert.equal(response.headers['cache-control'], 'no-store')
})

for (const origin of ['http://localhost:9999', 'https://localhost:43219', 'http://127.0.0.1:43219', 'null', 'garbage', 'http://localhost:43219/extra', 'http://user@localhost:43219']) {
  test(`reject mismatched or invalid Origin ${origin}`, async () => {
    assert.equal((await host()('status', { headers: { origin } })).statusCode, 403)
  })
}

test('HTTPS origin is compared against the encrypted request authority', async () => {
  assert.equal((await host()('status', { encrypted: true, headers: { origin: 'https://localhost:43219' } })).statusCode, 200)
})

for (const site of ['cross-site', 'same-site']) {
  test(`reject Fetch Metadata ${site} even without an Origin`, async () => {
    assert.equal((await host()('status', { headers: { 'sec-fetch-site': site } })).statusCode, 403)
  })
}

test('Connection rejection is never bypassed by a matching loopback Origin', async () => {
  assert.equal((await host({ requestRejection: () => 'rejected' })('status', { headers: { origin: 'http://localhost:43219' } })).statusCode, 403)
})

test('non-loopback Host is rejected', async () => {
  assert.equal((await host()('status', { headers: { host: 'example.test:43219' } })).statusCode, 403)
})

for (const remoteAddress of ['192.0.2.1', '::ffff:192.0.2.1', '2001:db8::1', undefined, 'localhost']) {
  test(`forged loopback Host cannot authorize non-loopback peer ${String(remoteAddress)}`, async () => {
    // 显式空值与默认参数区别开，模拟缺少真实 socket 地址的请求。
    const address = remoteAddress === undefined ? null : remoteAddress
    assert.equal((await host()('test', { remoteAddress: address })).statusCode, 403)
  })
}

for (const remoteAddress of ['127.0.0.1', '127.0.0.2', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '0:0:0:0:0:0:0:1']) {
  test(`real loopback peer ${remoteAddress} remains supported`, async () => {
    assert.equal((await host()('status', { remoteAddress })).statusCode, 200)
  })
}

test('status remains readable via GET for local diagnostics', async () => {
  assert.equal((await host()('status', { method: 'GET' })).statusCode, 200)
})

for (const route of ['test', 'advise']) {
  test(`${route} rejects GET before performing billable work`, async () => {
    const response = await host()(route, { method: 'GET' })
    assert.equal(response.statusCode, 405)
    assert.equal(response.headers.allow, 'POST')
  })
}

for (const contentType of [undefined, 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']) {
  test(`POST rejects non-JSON content type ${String(contentType)}`, async () => {
    const response = await host()('advise', { headers: { 'content-type': contentType } })
    assert.equal(response.statusCode, 415)
  })
}

test('JSON charset parameter is accepted and malformed JSON is a client error', async () => {
  const response = await host()('advise', { headers: { 'content-type': 'application/json; charset=utf-8' }, body: '{' })
  assert.equal(response.statusCode, 400)
  assert.equal(response.value.error.code, 'jev/bad-request')
})

test('an oversized body returns 413 rather than an upstream failure', async () => {
  const response = await host()('advise', { body: ' '.repeat(1024 * 1024 + 1) })
  assert.equal(response.statusCode, 413)
})

for (const body of ['[]', 'null', '{"questions":[]}', '{"questions":[{"id":"same","question":"A"},{"id":"same","question":"B"}]}']) {
  test(`malformed or ambiguous question batches return 400: ${body}`, async () => {
    assert.equal((await host()('advise', { body })).statusCode, 400)
  })
}

test('real loopback HTTP round trip preserves independent decisions and fails closed on bad upstream data', async (t) => {
  let mode = 'valid'
  let sent
  const upstream = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    sent = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    assert.equal(request.headers.authorization, 'Bearer unit-test-only')
    const answers = Object.fromEntries(Object.entries(sent.questions).map(([key, question]) => [key, question.type === 'choice'
      ? { type: 'choice', choice: 'opt_0', probabilities: { opt_0: 0.8, opt_1: 0.1, __none_of_the_above__: 0.1 }, confidence: 0.8 }
      : { type: 'noul', noul: key.endsWith('_opt_0') ? 0.9 : 0.1 }]))
    if (mode === 'partial') delete answers.decision_1_opt_1
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(mode === 'array' ? [] : { model: 'jev-unit-test', answers }))
  })
  const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const close = (server) => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  await listen(upstream)
  t.after(() => close(upstream))
  const routes = new Map()
  apply({
    get: () => undefined, inject: () => {}, effect: (callback) => callback(),
    webServer: { register: ({ path, handler }) => { routes.set(path, handler); return () => {} } },
  }, { apiKey: 'unit-test-only', endpoint: `http://127.0.0.1:${upstream.address().port}/systemone` })
  const bridge = createServer((request, response) => {
    const handler = routes.get(request.url)
    if (handler) void handler(request, response)
    else { response.statusCode = 404; response.end() }
  })
  await listen(bridge)
  t.after(() => close(bridge))
  const origin = `http://127.0.0.1:${bridge.address().port}`
  const probe = await fetch(`${origin}/dsh-jev-advisor/api/test`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}',
  })
  assert.equal(probe.status, 200)
  assert.equal((await probe.json()).value.model, 'jev-unit-test')
  const questions = [
    { id: 'opt_0', question: 'Mode?', options: [{ label: 'A' }, { label: 'B' }] },
    { id: 'first', question: 'Checks?', multiSelect: true, options: [{ label: 'C' }, { label: 'D' }] },
    { id: 'second', question: 'Checks?', multiSelect: true, options: [{ label: 'E' }, { label: 'F' }] },
  ]
  const binding = { requestId: 'roundtrip-1', sessionId: 'session-a', interactionKey: 'interaction-a', questions }
  const post = () => fetch(`${origin}/dsh-jev-advisor/api/advise`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(binding),
  })
  const success = await post()
  assert.equal(success.status, 200)
  const result = await success.json()
  assert.deepEqual(result.value.binding, binding)
  assert.equal(Object.keys(sent.questions).length, 5)
  assert.deepEqual(result.value.advice.map((entry) => entry.pick?.label ?? entry.picks[0]?.label), ['A', 'C', 'E'])
  mode = 'partial'
  assert.equal((await (await post()).json()).value.advice[1].answered, false)
  mode = 'array'
  const invalid = await post()
  assert.equal(invalid.status, 502)
  assert.equal((await invalid.json()).error.code, 'jev/bad-response')
})

test('option-less advice still echoes request binding without calling upstream', async () => {
  const binding = { requestId: 'test-1', sessionId: 'session-a', interactionKey: 'question-a', questions: [{ id: 'text', question: 'Explain?' }] }
  const response = await host()('advise', { body: JSON.stringify(binding) })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.value.value.binding, binding)
})

test('incomplete request binding is rejected as a client error', async () => {
  assert.equal((await host()('advise', { body: JSON.stringify({ requestId: 'test-1', questions: [{ id: 'text', question: 'Explain?' }] }) })).statusCode, 400)
})
