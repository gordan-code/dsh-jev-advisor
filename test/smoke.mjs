/**
 * dsh-jev-advisor smoke test.
 *
 * Exercises the pure host logic — request construction and answer mapping —
 * against a canned Jev response, so a change to the prompt shape or the
 * mapping is caught without a network round trip or a live DSH boot.
 *
 *   node test/smoke.mjs
 */

import assert from 'node:assert/strict'
import { buildJevRequest, mapAdvice, JevSettings } from '../lib/index.js'

const questions = [
  {
    id: 'mode',
    question: 'Which mode should I use?',
    header: 'Choose Mode',
    options: [
      { label: 'Fast (Recommended)', description: 'Fewer checks, quicker result.' },
      { label: 'Thorough', description: 'More verification, slower.' },
    ],
    multiSelect: false,
  },
]

const built = buildJevRequest(questions, '[user] Ship the plugin today.')

assert.deepEqual(Object.keys(built.questions), ['mode'], 'one choice question per single-choice decision')
assert.equal(built.questions.mode.type, 'choice')
assert.deepEqual(Object.keys(built.questions.mode.criteria), ['opt_0', 'opt_1', '__none_of_the_above__'])
assert.match(built.questions.mode.criteria.opt_0, /^Fast —/, 'the recommendation suffix is stripped from the rubric')
assert.equal(built.state.decisions[0].options[0].label, 'Fast (Recommended)', 'the answer value keeps the original label')
assert.match(built.questions.mode.instructions, /decisions\[0\]\.options/)

const choiceAdvice = mapAdvice(built.plan, {
  model: 'jev-1.13.0',
  answers: {
    mode: { type: 'choice', choice: 'opt_0', probabilities: { opt_0: 0.88, opt_1: 0.12, __none_of_the_above__: 0 }, confidence: 0.81 },
  },
  usage: { input_tokens: 1, output_tokens: 1 },
})

assert.equal(choiceAdvice.length, 1)
assert.equal(choiceAdvice[0].pick.label, 'Fast (Recommended)')
assert.equal(choiceAdvice[0].pick.index, 0)
assert.equal(choiceAdvice[0].confidence, 0.81)
assert.equal(choiceAdvice[0].noneOfTheAbove, false)
assert.equal(choiceAdvice[0].probabilities.length, 2, 'the synthetic option is not part of the distribution')

const noneAdvice = mapAdvice(built.plan, {
  answers: { mode: { type: 'choice', choice: '__none_of_the_above__', probabilities: { opt_0: 0.2, opt_1: 0.2, __none_of_the_above__: 0.6 }, confidence: 0.4 } },
})
assert.equal(noneAdvice[0].noneOfTheAbove, true)
assert.equal(noneAdvice[0].pick, undefined, 'a "none of the above" answer has no adoptable option')

const multiQuestions = [
  {
    id: 'checks',
    question: 'Which checks should run?',
    multiSelect: true,
    options: [{ label: 'lint' }, { label: 'typecheck' }, { label: 'tests' }],
  },
]
const multiBuilt = buildJevRequest(multiQuestions, '')
assert.deepEqual(Object.keys(multiBuilt.questions), ['opt_0', 'opt_1', 'opt_2'], 'multi-select fans out into one noul per option')
assert.equal(multiBuilt.questions.opt_1.type, 'noul')
assert.match(multiBuilt.questions.opt_1.instructions, /decisions\[0\]\.options\[1\]/)

const multiAdvice = mapAdvice(multiBuilt.plan, {
  answers: {
    opt_0: { type: 'noul', noul: 0.91 },
    opt_1: { type: 'noul', noul: 0.78 },
    opt_2: { type: 'noul', noul: 0.31 },
  },
})
assert.deepEqual(multiAdvice[0].picks.map((pick) => pick.label), ['lint', 'typecheck'], 'only options above the threshold are picked')
assert.equal(multiAdvice[0].probabilities.length, 3)

assert.throws(() => JevSettings({ apiKey: 42 }), 'the settings schema rejects a non-string key')
assert.equal(JevSettings({}).apiKey, '', 'the key defaults to empty rather than undefined')
assert.equal(JevSettings({}).endpoint, 'https://api.typesafe.ai/v1/systemone')
assert.equal(JevSettings({ endpoint: 'https://example.test/v1/systemone' }).endpoint, 'https://example.test/v1/systemone')

process.stdout.write('dsh-jev-advisor smoke: all assertions passed\n')
