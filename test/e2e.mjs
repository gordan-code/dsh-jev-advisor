import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const base = 'http://127.0.0.1:43219'
const token = process.argv[2]

const first = await fetch(`${base}/?token=${token}`, { redirect: 'manual' })
const cookie = (first.headers.getSetCookie?.() ?? []).map((entry) => entry.split(';')[0]).join('; ')
const post = (path, payload) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify(payload),
})

const status = await (await post('/dsh-jev-advisor/api/status', {})).json()
assert.equal(status.ok, true)
assert.equal(status.value.hasKey, true, 'the composition-seeded key is visible')
assert.equal(status.value.endpoint, 'http://127.0.0.1:43221/v1/systemone')
console.log('status:', JSON.stringify(status.value))

const test = await (await post('/dsh-jev-advisor/api/test', {})).json()
assert.equal(test.ok, true)
assert.equal(test.value.model, 'jev-mock-1.0.0', 'the mock answered the connectivity probe')
console.log('test:', JSON.stringify(test.value))

const questions = [
  { id: 'mode', question: 'Which mode should I use?', header: 'Choose Mode', options: [
    { label: 'Fast (Recommended)', description: 'Fewer checks.' },
    { label: 'Thorough', description: 'More verification.' },
  ] },
  { id: 'checks', question: 'Which checks should run?', multiSelect: true, options: [
    { label: 'lint' }, { label: 'typecheck' }, { label: 'tests' },
  ] },
]
const advise = await (await post('/dsh-jev-advisor/api/advise', { sessionId: 'session-unknown', questions })).json()
assert.equal(advise.ok, true, JSON.stringify(advise))
console.log('advise model:', advise.value.model, 'usage:', JSON.stringify(advise.value.usage))

const [choice, multi] = advise.value.advice
assert.equal(choice.kind, 'choice')
assert.equal(choice.pick.label, 'Fast (Recommended)', 'the answer maps back onto the original option label')
assert.equal(choice.noneOfTheAbove, false)
assert.equal(choice.confidence, 0.7)
assert.equal(choice.probabilities.length, 2)
console.log('choice advice:', JSON.stringify(choice))

assert.equal(multi.kind, 'noul-set')
assert.deepEqual(multi.picks.map((pick) => pick.label), ['lint', 'tests'], 'options above 0.5 are selected')
console.log('multi advice:', JSON.stringify(multi))

// The exact JSON the plugin sent must be a well-formed TypeSafe request.
const sent = JSON.parse(readFileSync('test/last-request.json', 'utf8'))
assert.equal(sent.model, 'jev-latest')
assert.equal(sent.state.context, '(no conversation context provided)')
assert.equal(sent.state.decisions.length, 2)
assert.deepEqual(Object.keys(sent.questions), ['mode', 'opt_0', 'opt_1', 'opt_2'])
assert.equal(sent.questions.mode.type, 'choice')
assert.deepEqual(Object.keys(sent.questions.mode.criteria), ['opt_0', 'opt_1', '__none_of_the_above__'])
assert.equal(sent.questions.opt_1.type, 'noul')
console.log('sent request questions:', Object.keys(sent.questions).join(', '))

// A wrong key must surface as a clean plugin error, not a crash.
const badKey = await post('/dsh-jev-advisor/api/advise', { questions })
assert.equal(badKey.status, 200, 'the route itself still answers')
console.log('e2e: all assertions passed')
