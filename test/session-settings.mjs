import assert from 'node:assert/strict'
import { test } from 'node:test'

let registration
globalThis.window = { __ModuleLoader__: { load: (value) => { registration = value } } }
await import('../lib/client.js')
const { internals } = registration.factory(() => ({}))
const question = (sessionId) => ({ sessionId, key: `question:${sessionId}`, questions: [{ id: 'mode', question: 'Which?', options: [{ label: 'A' }, { label: 'B' }] }] })
const status = (interaction) => ({ running: false, pendingInteraction: interaction, completionUnread: false })

test('session selection follows the main binding rather than Map insertion order', () => {
  assert.equal(typeof internals.pendingInteractionOf, 'function')
  const first = question('first')
  const current = question('current')
  assert.equal(internals.pendingInteractionOf(new Map([['first', status(first)], ['current', status(current)]]), 'current'), current)
})

test('a current approval is left to its own UI, not replaced by background advice', () => {
  const current = { sessionId: 'current', key: 'approve:1', kind: 'approval' }
  assert.equal(internals.pendingInteractionOf(new Map([['first', status(question('first'))], ['current', status(current)]]), 'current'), current)
})

test('fallback skips approvals and free-text prompts that cannot be advised', () => {
  const next = question('next')
  assert.equal(internals.pendingInteractionOf(new Map([
    ['approval', status({ kind: 'approval' })],
    ['text', status({ questions: [{ id: 'text', question: 'Explain?' }] })],
    ['next', status(next)],
  ]), 'absent'), next)
  assert.equal(internals.pendingInteractionOf(undefined, undefined), undefined)
})

test('settings writes use one atomic mutation with the observed revision', async () => {
  assert.equal(typeof internals.applySettingsDraft, 'function')
  const writes = []
  const scope = {
    getSnapshot: () => ({ status: 'ready', writable: true }),
    mutate: async (...args) => { writes.push(args); return true },
    set: () => { throw new Error('must not split one save into separate writes') },
  }
	await internals.applySettingsDraft(scope, { model: ' jev-test ', timeoutMs: '1500', enabled: false, requireConfirmation: true, redactSensitive: false }, 'rev-7')
  assert.deepEqual(writes, [[[
    { op: 'set', path: ['model'], value: 'jev-test' },
    { op: 'set', path: ['timeoutMs'], value: 1500 },
    { op: 'set', path: ['enabled'], value: false },
	    { op: 'set', path: ['requireConfirmation'], value: true },
	    { op: 'set', path: ['redactSensitive'], value: false },
  ], 'rev-7']])
})

test('a false settings mutation is a failure rather than a successful save', async () => {
  await assert.rejects(() => internals.applySettingsDraft({
    getSnapshot: () => ({ status: 'ready', writable: true }), mutate: async () => false,
  }, { model: 'jev-test' }, 'rev-7'), /rejected/i)
})

for (const invalid of [{ model: '' }, { endpoint: 'not-a-url' }, { timeoutMs: '999' }, { timeoutMs: 'Infinity' }, { timeoutMs: '' }, { transcriptMessages: '-1' }, { transcriptMessages: '1.5' }, { transcriptMessages: '101' }, { enabled: 'false' }, { requireConfirmation: 'false' }, { redactSensitive: 'true' }]) {
  test(`invalid draft ${JSON.stringify(invalid)} performs no partial writes`, async () => {
    let writes = 0
    await assert.rejects(() => internals.applySettingsDraft({
      getSnapshot: () => ({ status: 'ready', writable: true }), mutate: async () => { writes++; return true },
    }, { model: 'valid-first-field', ...invalid }, 1))
    assert.equal(writes, 0)
  })
}

for (const snapshot of [{ status: 'loading' }, { status: 'unavailable' }, { status: 'ready', writable: false }]) {
  test(`non-writable settings ${JSON.stringify(snapshot)} do not reach the Host`, async () => {
    let writes = 0
    await assert.rejects(() => internals.applySettingsDraft({ getSnapshot: () => snapshot, mutate: async () => { writes++; return true } }, { model: 'jev-test' }, 1))
    assert.equal(writes, 0)
  })
}

test('a blank key is not an accidental credential clear', async () => {
  const writes = []
  await internals.applySettingsDraft({
    getSnapshot: () => ({ status: 'ready', writable: true }), mutate: async (ops) => { writes.push(ops); return true },
  }, { apiKey: '  ', model: 'jev-test' }, 1)
  assert.deepEqual(writes, [[{ op: 'set', path: ['model'], value: 'jev-test' }]])
})

test('prepare responses must echo the exact request binding', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, value: {
      binding: { requestId: 'other', sessionId: 's', interactionKey: 'k', questions: [] },
      previewToken: 'preview', request: {}, privacy: {}, expiresAt: Date.now() + 1000,
    } }),
  })
  try {
    await assert.rejects(() => internals.callApi('prepare', { requestId: 'req', sessionId: 's', interactionKey: 'k', questions: [] }), /different request/i)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('prepare result keeps the preview contract without an advice array', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, value: {
      binding: { requestId: 'req', sessionId: 's', interactionKey: 'k', questions: [] },
      previewToken: 'preview', request: { state: {} }, privacy: { includedTranscript: false, contextChars: 0, redactions: 0, truncated: false, requestBytes: 12 }, expiresAt: Date.now() + 1000,
    } }),
  })
  try {
    const result = await internals.callApi('prepare', { requestId: 'req', sessionId: 's', interactionKey: 'k', questions: [] })
    assert.equal(result.previewToken, 'preview')
    assert.equal(result.advice, undefined)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('usage display ignores negative and fractional token counts', () => {
  assert.deepEqual(internals.usageSummary({ input_tokens: 31, output_tokens: 7 }), { input: 31, output: 7 })
  assert.deepEqual(internals.usageSummary({ input_tokens: -1, output_tokens: 7 }), { input: undefined, output: 7 })
  assert.equal(internals.usageSummary({ input_tokens: -1, output_tokens: 7.5 }), undefined)
  assert.deepEqual(internals.usageSummary({ input_tokens: '31', output_tokens: 7 }), { input: undefined, output: 7 })
})
