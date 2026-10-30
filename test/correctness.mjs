import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildJevRequest, mapAdvice } from '../lib/index.js'

const multi = (id, labels = ['A', 'B']) => ({
  id, question: id, multiSelect: true, options: labels.map((label) => ({ label })),
})
const choice = (id = 'mode') => ({ ...multi(id), multiSelect: false })

function choiceResponse(built, overrides = {}) {
  const entry = built.plan[0]
  return { answers: { [entry.answerKey ?? entry.id]: {
    type: 'choice', choice: entry.keys[0],
    probabilities: Object.fromEntries([...entry.keys, entry.noneKey].map((key, index) => [key, index === 0 ? 1 : 0])),
    confidence: 0.8, ...overrides,
  } } }
}

test('two multi-select decisions have independent evaluation keys and answers', () => {
  const built = buildJevRequest([multi('first'), multi('second', ['C', 'D'])], '')
  assert.equal(Object.keys(built.questions).length, 4)
  assert.equal(new Set(built.plan.flatMap((entry) => entry.keys)).size, 4)
  const values = [0.9, 0.1, 0.1, 0.9]
  const answers = Object.fromEntries(built.plan.flatMap((entry) => entry.keys).map((key, index) => [key, { type: 'noul', noul: values[index] }]))
  assert.deepEqual(mapAdvice(built.plan, { answers }).map((entry) => entry.picks.map((pick) => pick.label)), [['A'], ['D']])
})

test('arbitrary input IDs cannot collide with generated evaluator keys', () => {
  const built = buildJevRequest([choice('opt_0'), multi('second'), choice('__proto__'), choice('decision_1_opt_0')], '')
  assert.equal(Object.keys(built.questions).length, 5)
  assert.equal(JSON.parse(JSON.stringify(built.questions)).hasOwnProperty('__proto__'), false)
  for (const entry of built.plan.filter((item) => item.kind === 'choice')) {
    assert.equal(built.questions[entry.answerKey].type, 'choice')
  }
})

test('duplicate or empty decision IDs are rejected before mapping', () => {
  assert.throws(() => buildJevRequest([choice('same'), multi('same')], ''), /id/i)
  assert.throws(() => buildJevRequest([choice('')], ''), /id/i)
})

test('duplicate or malformed option labels are rejected before building requests', () => {
  assert.throws(() => buildJevRequest([multi('checks', ['same', 'same'])], ''), /option/i)
  assert.throws(() => buildJevRequest([{ ...multi('checks'), options: [{ label: '' }] }], ''), /option/i)
})

test('missing multi-select answers block adoption instead of becoming zero', () => {
  const built = buildJevRequest([multi('checks')], '')
  const advice = mapAdvice(built.plan, { answers: { [built.plan[0].keys[0]]: { type: 'noul', noul: 0.9 } } })[0]
  assert.equal(advice.answered, false)
  assert.deepEqual(advice.picks, [])
})

for (const probability of [-0.1, 1.1, NaN, Infinity, '0.9', null]) {
  test(`invalid multi-select probability ${String(probability)} blocks the whole decision`, () => {
    const built = buildJevRequest([multi('checks')], '')
    const answers = Object.fromEntries(built.plan[0].keys.map((key, index) => [key, { type: 'noul', noul: index === 0 ? 0.9 : probability }]))
    const advice = mapAdvice(built.plan, { answers })[0]
    assert.equal(advice.answered, false)
    assert.deepEqual(advice.picks, [])
  })
}

test('all-low multi-select probabilities do not invent a recommended pick', () => {
  const built = buildJevRequest([multi('checks')], '')
  const answers = Object.fromEntries(built.plan[0].keys.map((key) => [key, { type: 'noul', noul: 0.2 }]))
  assert.deepEqual(mapAdvice(built.plan, { answers })[0].picks, [])
})

test('unknown choice IDs and incomplete distributions are not answered', () => {
  const built = buildJevRequest([choice()], '')
  assert.equal(mapAdvice(built.plan, choiceResponse(built, { choice: 'not-an-option' }))[0].answered, false)
  assert.equal(mapAdvice(built.plan, choiceResponse(built, { probabilities: { [built.plan[0].keys[0]]: 1 } }))[0].answered, false)
})

for (const field of ['probability', 'confidence']) {
  for (const value of [-0.1, 1.1, NaN, Infinity, '0.8', null]) {
    test(`invalid choice ${field} ${String(value)} is not adoptable`, () => {
      const built = buildJevRequest([choice()], '')
      const response = choiceResponse(built)
      const answer = Object.values(response.answers)[0]
      if (field === 'probability') answer.probabilities[built.plan[0].keys[0]] = value
      else answer.confidence = value
      assert.equal(mapAdvice(built.plan, response)[0].answered, false)
    })
  }
}

test('invalid response envelopes fail closed without throwing', () => {
  const built = buildJevRequest([choice(), multi('checks')], '')
  for (const response of [undefined, null, [], {}, { answers: [] }]) {
    assert.ok(mapAdvice(built.plan, response).every((entry) => entry.answered === false))
  }
})

test('valid choice probabilities at the boundary and absent confidence remain supported', () => {
  const built = buildJevRequest([choice()], '')
  const response = choiceResponse(built)
  delete Object.values(response.answers)[0].confidence
  assert.equal(mapAdvice(built.plan, response)[0].answered, true)
})

for (const values of [[0, 0, 0], [0.8, 0.8, 0.8], [0.1, 0.1, 0.1], [0, 1, 0]]) {
  test(`invalid choice mass or zero-probability selection ${values.join('/')} is blocked`, () => {
    const built = buildJevRequest([choice()], '')
    const response = choiceResponse(built)
    Object.values(response.answers)[0].probabilities = Object.fromEntries([...built.plan[0].keys, built.plan[0].noneKey].map((key, index) => [key, values[index]]))
    assert.equal(mapAdvice(built.plan, response)[0].answered, false)
  })
}

test('comparePerspectives fans out three perspective choice questions in one request and maps consistent or split picks', () => {
  const built = buildJevRequest([choice('arch')], 'ctx', { comparePerspectives: true })
  assert.ok(built.questions.decision_0)
  assert.ok(built.questions.decision_0_perspective_stable)
  assert.ok(built.questions.decision_0_perspective_fast)
  assert.ok(built.questions.decision_0_perspective_minimal)
  const response = choiceResponse(built)
  response.answers.decision_0_perspective_stable = {
    type: 'choice', choice: 'opt_0',
    probabilities: { opt_0: 0.9, opt_1: 0.05, __none_of_the_above__: 0.05 }, confidence: 0.85,
  }
  response.answers.decision_0_perspective_fast = {
    type: 'choice', choice: 'opt_1',
    probabilities: { opt_0: 0.2, opt_1: 0.75, __none_of_the_above__: 0.05 }, confidence: 0.7,
  }
  response.answers.decision_0_perspective_minimal = {
    type: 'choice', choice: 'opt_0',
    probabilities: { opt_0: 0.8, opt_1: 0.1, __none_of_the_above__: 0.1 }, confidence: 0.75,
  }
  const mapped = mapAdvice(built.plan, response)[0]
  assert.equal(mapped.answered, true)
  assert.equal(Array.isArray(mapped.perspectives), true)
  assert.equal(mapped.perspectives.length, 3)
  assert.deepEqual(mapped.perspectives.map((item) => [item.id, item.pick?.label]), [
    ['stable', 'A'],
    ['fast', 'B'],
    ['minimal', 'A'],
  ])
})

test('custom dynamic perspectives (1 to 5 items) fan out with custom labels and reject invalid perspective counts', () => {
  const built = buildJevRequest([choice('sec')], 'ctx', {
    comparePerspectives: true,
    perspectives: [
      { id: 'security', label: 'Security & blast radius', prompt: 'prioritize security boundaries' },
      'Zero external dependencies',
    ],
  })
  assert.ok(built.questions.decision_0_perspective_security)
  assert.ok(built.questions.decision_0_perspective_p_1)
  assert.equal(Object.keys(built.questions).length, 3)
  const response = choiceResponse(built)
  response.answers.decision_0_perspective_security = {
    type: 'choice', choice: 'opt_1',
    probabilities: { opt_0: 0.1, opt_1: 0.85, __none_of_the_above__: 0.05 }, confidence: 0.9,
  }
  response.answers.decision_0_perspective_p_1 = {
    type: 'choice', choice: 'opt_0',
    probabilities: { opt_0: 0.8, opt_1: 0.1, __none_of_the_above__: 0.1 }, confidence: 0.8,
  }
  const mapped = mapAdvice(built.plan, response)[0]
  assert.deepEqual(mapped.perspectives.map((item) => [item.id, item.label, item.pick?.label]), [
    ['security', 'Security & blast radius', 'B'],
    ['p_1', 'Zero external dependencies', 'A'],
  ])
  assert.throws(
    () => buildJevRequest([choice('sec')], 'ctx', { comparePerspectives: true, perspectives: [] }),
    /1 to 5 items/,
  )
  assert.throws(
    () => buildJevRequest([choice('sec')], 'ctx', { comparePerspectives: true, perspectives: ['1', '2', '3', '4', '5', '6'] }),
    /1 to 5 items/,
  )
})

test('approval and planReview questions attach auxiliary score evaluations without blocking choice mapping', () => {
  const approvalQ = { ...choice('approval'), approval: true, options: [{ label: 'allow-once' }, { label: 'reject' }] }
  const planQ = { ...choice('plan'), planReview: true, detail: 'Step 1\nStep 2', options: [{ label: 'Approve' }] }
  const built = buildJevRequest([approvalQ, planQ], 'ctx')
  assert.equal(built.questions.decision_0_risk?.type, 'score')
  assert.equal(Array.isArray(built.questions.decision_0_risk?.criteria), true)
  assert.equal(built.questions.decision_0_risk?.criteria.length, 3)
  assert.equal(built.questions.decision_0_risk?.legend, undefined)
  assert.equal(built.questions.decision_1_plan_score?.type, 'score')
  assert.equal(Array.isArray(built.questions.decision_1_plan_score?.criteria), true)
  assert.equal(built.questions.decision_1_plan_score?.criteria.length, 3)
  const answers = {
    decision_0: {
      type: 'choice', choice: 'opt_1',
      probabilities: { opt_0: 0.1, opt_1: 0.85, __none_of_the_above__: 0.05 }, confidence: 0.9,
    },
    decision_0_risk: {
      type: 'score', score: 1.75, probabilities: { 0: 0.05, 1: 0.15, 2: 0.8 }, confidence: 0.88,
    },
    decision_1: {
      type: 'choice', choice: '__none_of_the_above__',
      probabilities: { opt_0: 0.2, __none_of_the_above__: 0.8 }, confidence: 0.75,
    },
    decision_1_plan_score: {
      type: 'score', score: 0.2, probabilities: { 0: 0.8, 1: 0.2, 2: 0 }, confidence: 0.72,
    },
  }
  const mapped = mapAdvice(built.plan, { answers })
  assert.equal(mapped[0].pick?.label, 'reject')
  assert.deepEqual(mapped[0].riskScore, { score: 2, confidence: 0.88 })
  assert.equal(mapped[1].noneOfTheAbove, true)
  assert.deepEqual(mapped[1].planScore, { score: 0, confidence: 0.72 })
})

