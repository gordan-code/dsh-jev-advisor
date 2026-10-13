import assert from 'node:assert/strict'
import { test } from 'node:test'

import * as host from '../src/index.js'

const endpoint = 'https://user:password@example.test/v1/systemone'
const request = { state: 'unit test', model: 'jev-test', questions: {} }

function response(status, text, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'test',
    headers: new Headers(headers),
    text: async () => text,
  }
}

async function withFetch(value, callback) {
  const original = globalThis.fetch
  globalThis.fetch = value
  try {
    return await callback()
  } finally {
    globalThis.fetch = original
  }
}

test('callJev is exported and sends the caller signal to fetch', async () => {
  const controller = new AbortController()
  let seenSignal
  await withFetch(async (_url, options) => {
    seenSignal = options.signal
    return response(200, '{"answers":{}}')
  }, async () => {
    const result = await host.callJev({ endpoint, apiKey: 'unit-test-key', timeoutMs: 1000, body: request, signal: controller.signal })
    assert.deepEqual(result, { answers: {} })
  })
  assert.equal(seenSignal.aborted, false)
})

test('callJev converts caller cancellation into jev/cancelled', async () => {
  const controller = new AbortController()
  await withFetch((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })
  }), async () => {
    const pending = host.callJev({ endpoint, apiKey: 'unit-test-key', timeoutMs: 5000, body: request, signal: controller.signal })
    setTimeout(() => controller.abort(), 5)
    await assert.rejects(pending, (error) => error?.code === 'jev/cancelled')
  })
})

test('callJev timeout covers retry backoff and aborts the in-flight request', async () => {
  let attempts = 0
  let released = 0
  await withFetch(async (_url, options) => {
    attempts++
    options.signal.addEventListener('abort', () => { released++ }, { once: true })
    return response(429, 'retry body', { 'retry-after': '5' })
  }, async () => {
    await assert.rejects(
      host.callJev({ endpoint, apiKey: 'unit-test-key', timeoutMs: 20, body: request }),
      (error) => error?.code === 'jev/timeout',
    )
  })
  assert.equal(attempts, 1)
  assert.equal(released, 1)
})

test('429 and 529 bodies are released and only those statuses retry twice', async () => {
  let attempts = 0
  let released = 0
  await withFetch(async () => {
    attempts++
    if (attempts < 3) {
      const result = response(attempts === 1 ? 429 : 529, 'discard me', { 'retry-after': '0' })
      result.body = { cancel: async () => { released++ } }
      return result
    }
    return response(200, '{"answers":{}}')
  }, async () => {
    assert.deepEqual(await host.callJev({ endpoint, apiKey: 'unit-test-key', timeoutMs: 1000, body: request }), { answers: {} })
  })
  assert.equal(attempts, 3)
  assert.equal(released, 2)
})

test('HTTP error details and endpoint credentials are not included in the thrown message', async () => {
  const secret = 'upstream-private-error-and-endpoint-password'
  await withFetch(async () => response(500, secret), async () => {
    await assert.rejects(
      host.callJev({ endpoint, apiKey: 'unit-test-key', timeoutMs: 1000, body: request }),
      (error) => error?.code === 'jev/http-error'
        && !error.message.includes(secret)
        && !error.message.includes('password'),
    )
  })
})

test('response bodies larger than 1 MiB fail closed as jev/bad-response', async () => {
  const tooLarge = 'x'.repeat(1024 * 1024 + 1)
  await withFetch(async () => response(200, tooLarge), async () => {
    await assert.rejects(
      host.callJev({ endpoint, apiKey: 'unit-test-key', timeoutMs: 1000, body: request }),
      (error) => error?.code === 'jev/bad-response',
    )
  })
})

test('a real ReadableStream is limited by UTF-8 bytes, not JavaScript characters', async () => {
  const bytes = new TextEncoder().encode(`${'😀'.repeat(300_000)}`)
  let cancelled = 0
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
    },
    cancel() { cancelled++ },
  })
  await withFetch(async () => ({ ok: true, status: 200, statusText: 'OK', headers: new Headers(), body }), async () => {
    await assert.rejects(
      host.callJev({ endpoint, apiKey: 'unit-test-key', timeoutMs: 1000, body: request }),
      (error) => error?.code === 'jev/bad-response',
    )
  })
  assert.equal(cancelled, 1)
})

test('a response-body cancel that never settles still obeys the total timeout', async () => {
  const bytes = new Uint8Array(1024 * 1024 + 1)
  let cancelStarted = 0
  const body = new ReadableStream({
    start(controller) { controller.enqueue(bytes) },
    cancel() {
      cancelStarted++
      return new Promise(() => {})
    },
  })
  await withFetch(async () => ({ ok: true, status: 200, statusText: 'OK', headers: new Headers(), body }), async () => {
    const pending = host.callJev({ endpoint, apiKey: 'unit-test-key', timeoutMs: 20, body: request })
    const outcome = await Promise.race([
      pending.then(() => ({ kind: 'value' }), (error) => ({ kind: 'error', error })),
      new Promise((resolve) => setTimeout(() => resolve({ kind: 'hung' }), 150)),
    ])
    assert.equal(outcome.kind, 'error')
    assert.equal(outcome.error.code, 'jev/timeout')
    assert.equal(cancelStarted, 1)
  })
})

test('a slow ReadableStream is cancelled when response reading times out', async () => {
  let cancelStarted = 0
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"answers":')) },
    cancel() { cancelStarted++ },
  })
  await withFetch(async () => ({ ok: true, status: 200, statusText: 'OK', headers: new Headers(), body }), async () => {
    await assert.rejects(
      host.callJev({ endpoint, apiKey: 'unit-test-key', timeoutMs: 20, body: request }),
      (error) => error?.code === 'jev/timeout',
    )
  })
  assert.equal(cancelStarted, 1)
})

test('evaluation pool deduplicates in-flight work while cancellation stays subscriber-local', async () => {
  const pool = host.createEvaluationPool()
  const firstController = new AbortController()
  const secondController = new AbortController()
  let calls = 0
  let sharedSignal
  let finish
  const factory = (signal) => {
    calls++
    sharedSignal = signal
    return new Promise((resolve) => { finish = resolve })
  }
  const first = pool.run('same', factory, firstController.signal)
  const second = pool.run('same', factory, secondController.signal)
  firstController.abort()
  await assert.rejects(first, (error) => error?.code === 'jev/cancelled')
  assert.equal(calls, 1)
  assert.equal(sharedSignal.aborted, false)
  finish({ answer: 42 })
  assert.deepEqual(await second, { value: { answer: 42 }, reused: true })
  pool.dispose()
})

test('evaluation pool removes an aborted last subscriber before a replacement run', async () => {
  const pool = host.createEvaluationPool()
  const firstController = new AbortController()
  const secondController = new AbortController()
  const signals = []
  const finishes = []
  let calls = 0
  const factory = (signal) => {
    calls++
    signals.push(signal)
    return new Promise((resolve) => finishes.push(resolve))
  }
  const first = pool.run('same', factory, firstController.signal)
  firstController.abort()
  await assert.rejects(first, (error) => error?.code === 'jev/cancelled')
  const second = pool.run('same', factory, secondController.signal)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls, 2)
  assert.equal(signals[0].aborted, true)
  finishes[1]('fresh')
  assert.deepEqual(await second, { value: 'fresh', reused: false })
  pool.dispose()
})

test('evaluation pool optionally caches successes with a bounded TTL', async () => {
  const pool = host.createEvaluationPool({ ttlMs: 25, maxEntries: 2 })
  let calls = 0
  const factory = async () => ({ call: ++calls })
  assert.deepEqual(await pool.run('one', factory), { value: { call: 1 }, reused: false })
  assert.deepEqual(await pool.run('one', factory), { value: { call: 1 }, reused: true })
  await new Promise((resolve) => setTimeout(resolve, 35))
  assert.deepEqual(await pool.run('one', factory), { value: { call: 2 }, reused: false })
  pool.dispose()
})

test('evaluation pool defaults to in-flight deduplication without completed-result caching', async () => {
  const pool = host.createEvaluationPool()
  let calls = 0
  const factory = async () => ({ call: ++calls })
  assert.deepEqual(await pool.run('same', factory), { value: { call: 1 }, reused: false })
  assert.deepEqual(await pool.run('same', factory), { value: { call: 2 }, reused: false })
  pool.dispose()
})

test('evaluation pool keeps independent keys independent and does not cache failures', async () => {
  const pool = host.createEvaluationPool()
  let calls = 0
  const factory = async (signal) => {
    const call = ++calls
    return { call, aborted: signal.aborted }
  }
  const [left, right] = await Promise.all([pool.run('left', factory), pool.run('right', factory)])
  assert.deepEqual(left, { value: { call: 1, aborted: false }, reused: false })
  assert.deepEqual(right, { value: { call: 2, aborted: false }, reused: false })

  let failures = 0
  const failing = async () => {
    failures++
    if (failures === 1) throw new Error('expected test failure')
    return 'recovered'
  }
  await assert.rejects(pool.run('failed', failing), /expected test failure/)
  assert.deepEqual(await pool.run('failed', failing), { value: 'recovered', reused: false })
  pool.dispose()
})

test('evaluation pool dispose cancels subscribers and clears cached values', async () => {
  const pool = host.createEvaluationPool({ ttlMs: 1000 })
  assert.deepEqual(await pool.run('cached', async () => 'cached'), { value: 'cached', reused: false })
  const controller = new AbortController()
  let sharedSignal
  const pending = pool.run('pending', (signal) => {
    sharedSignal = signal
    return new Promise(() => {})
  }, controller.signal)
  pool.dispose()
  await assert.rejects(pending, (error) => error?.code === 'jev/cancelled')
  assert.equal(sharedSignal.aborted, true)
  let calls = 0
  assert.deepEqual(await pool.run('cached', async () => ({ call: ++calls })), { value: { call: 1 }, reused: false })
  pool.dispose()
})
