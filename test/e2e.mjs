/**
 * Manual/browser-shaped end-to-end check against an already running DSH Web
 * host. The host URL/token are intentionally supplied by the caller so this
 * test never assumes a port and never writes `test/last-request.json`.
 *
 *   DSH_E2E_BASE=http://127.0.0.1:PORT/?token=TOKEN npm run test:e2e
 *   DSH_E2E_DUMP=$RUNNER_TEMP/jev-request.json npm run test:e2e
 *
 * For an optional real wrong-key assertion, provide a second isolated host:
 *   DSH_E2E_BADKEY_BASE=http://127.0.0.1:PORT/?token=TOKEN npm run test:e2e
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function targetFrom(input, tokenInput) {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new Error('set DSH_E2E_BASE to a running tokenized DSH Web URL (or pass it as argv[2])')
  }
  const parsed = new URL(input)
  const token = tokenInput ?? parsed.searchParams.get('token')
  if (typeof token !== 'string' || token === '') throw new Error('the DSH Web URL must include ?token=... or DSH_E2E_TOKEN')
  return { base: parsed.origin, token }
}

async function connect(target) {
  const first = await fetch(`${target.base}/?token=${encodeURIComponent(target.token)}`, { redirect: 'manual', headers: { origin: target.base } })
  assert.ok(first.status >= 200 && first.status < 400, `host root returned ${String(first.status)}`)
  const cookie = (first.headers.getSetCookie?.() ?? []).map((entry) => entry.split(';', 1)[0]).filter(Boolean).join('; ')
  const post = async (path, payload) => {
    const response = await fetch(`${target.base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: target.base, ...(cookie === '' ? {} : { cookie }) },
      body: JSON.stringify(payload),
    })
    const text = await response.text()
    let value
    try { value = text === '' ? undefined : JSON.parse(text) } catch { value = undefined }
    return { response, value, text }
  }
  return { post }
}

const primaryInput = process.env.DSH_E2E_BASE ?? process.argv[2]
const primaryToken = process.env.DSH_E2E_TOKEN ?? process.argv[3]
const primary = targetFrom(primaryInput, primaryToken)
const client = await connect(primary)

const status = await client.post('/dsh-jev-advisor/api/status', {})
assert.equal(status.response.status, 200, status.text)
assert.equal(status.value.ok, true, status.text)
assert.equal(typeof status.value.value.hasKey, 'boolean')
assert.equal(new URL(status.value.value.endpoint).hostname, '127.0.0.1')
console.log('status:', JSON.stringify(status.value.value))

const testConnection = await client.post('/dsh-jev-advisor/api/test', {})
assert.equal(testConnection.response.status, 200, testConnection.text)
assert.equal(testConnection.value.ok, true, testConnection.text)
assert.equal(testConnection.value.value.model, 'jev-mock-1.0.0', 'the local mock answered the connectivity probe')
console.log('test:', JSON.stringify(testConnection.value.value))

const questions = [
  { id: 'mode', question: 'Which mode should I use?', header: 'Choose Mode', options: [
    { label: 'Fast (Recommended)', description: 'Fewer checks.' },
    { label: 'Thorough', description: 'More verification.' },
  ] },
  { id: 'checks', question: 'Which checks should run?', multiSelect: true, options: [
    { label: 'lint' }, { label: 'typecheck' }, { label: 'tests' },
  ] },
]
const binding = {
  requestId: 'e2e-request-1',
  sessionId: 'session-unknown',
  interactionKey: 'e2e-interaction-1',
  questions,
}
const advise = await client.post('/dsh-jev-advisor/api/advise', binding)
assert.equal(advise.response.status, 200, advise.text)
assert.equal(advise.value.ok, true, advise.text)
assert.deepEqual(advise.value.value.binding, binding, 'the Host echoes requestId/sessionId/interactionKey/questions')
console.log('advise model:', advise.value.value.model, 'usage:', JSON.stringify(advise.value.value.usage))

const [choice, multi] = advise.value.value.advice
assert.equal(choice.kind, 'choice')
assert.equal(choice.pick.label, 'Fast (Recommended)', 'the answer maps back onto the original option label')
assert.equal(choice.noneOfTheAbove, false)
assert.equal(choice.confidence, 0.7)
assert.equal(choice.probabilities.length, 2)
console.log('choice advice:', JSON.stringify(choice))

assert.equal(multi.kind, 'noul-set')
assert.deepEqual(multi.picks.map((pick) => pick.label), ['lint', 'tests'], 'options above 0.5 are selected')
console.log('multi advice:', JSON.stringify(multi))

const dumpPath = process.env.DSH_E2E_DUMP ?? process.argv[4]
if (dumpPath !== undefined && dumpPath !== '') {
  const sent = JSON.parse(readFileSync(dumpPath, 'utf8'))
  assert.equal(sent.model, 'jev-latest')
  assert.equal(sent.state.context, '(no conversation context provided)')
  assert.equal(sent.state.decisions.length, 2)
  assert.deepEqual(Object.keys(sent.questions), ['decision_0', 'decision_1_opt_0', 'decision_1_opt_1', 'decision_1_opt_2'])
  assert.equal(sent.questions.decision_0.type, 'choice')
  assert.deepEqual(Object.keys(sent.questions.decision_0.criteria), ['opt_0', 'opt_1', '__none_of_the_above__'])
  assert.equal(sent.questions.decision_1_opt_1.type, 'noul')
  console.log('sent request questions:', Object.keys(sent.questions).join(', '))
} else {
  console.log('sent request: in-memory mock record not supplied (set DSH_E2E_DUMP to assert the wire body)')
}

// Do not call this a bad-key test unless the caller points us at a separate
// scratch host configured with a genuinely wrong key. The real host suite
// always exercises both this 502 path and the missing-key 409 path.
if (process.env.DSH_E2E_BADKEY_BASE !== undefined) {
  const badTarget = targetFrom(process.env.DSH_E2E_BADKEY_BASE, process.env.DSH_E2E_BADKEY_TOKEN)
  const badClient = await connect(badTarget)
  const badKey = await badClient.post('/dsh-jev-advisor/api/advise', { ...binding, requestId: 'e2e-bad-key', questions: [questions[0]] })
  assert.equal(badKey.response.status, 502, badKey.text)
  assert.equal(badKey.value.ok, false, badKey.text)
  assert.equal(badKey.value.error.code, 'jev/http-error', badKey.text)
  assert.match(badKey.value.error.message, /401/)
  console.log('badKey: upstream 401 surfaced as HTTP 502')
} else {
  console.log('badKey: skipped (provide DSH_E2E_BADKEY_BASE for an isolated wrong-key host)')
}

console.log('e2e: all assertions passed')
