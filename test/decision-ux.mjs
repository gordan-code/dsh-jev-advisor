import assert from 'node:assert/strict'
import { test } from 'node:test'

let registration
globalThis.window = { __ModuleLoader__: { load(value) { registration = value } } }
await import('../src/client.js?decision-ux')

const React = { createElement() { return null } }
const internals = registration.factory(() => React).internals

const choiceQuestion = {
	id: 'mode',
	question: 'Which mode?',
	multiSelect: false,
	options: [{ label: 'Fast' }, { label: 'Careful' }],
}

function choiceAdvice({ pick = 0.5, other = 0.4, none = 0, confidence = 0.99, answered = true, noneOfTheAbove = false } = {}) {
	return {
		questionId: 'mode', kind: 'choice', supported: true, answered,
		pick: noneOfTheAbove ? undefined : { index: 0, label: 'Fast', probability: pick },
		noneOfTheAbove, noneProbability: none, confidence,
		probabilities: [{ index: 0, label: 'Fast', probability: pick }, { index: 1, label: 'Careful', probability: other }],
	}
}

test('single-choice divergence hint uses the ten-point probability boundary, not confidence', () => {
	assert.equal(internals.decisionHintOf(choiceQuestion, choiceAdvice({ pick: 0.55, other: 0.45, confidence: 1 })).kind, 'choice-close')
	assert.equal(internals.decisionHintOf(choiceQuestion, choiceAdvice({ pick: 0.549999, other: 0.450001 })).kind, 'choice-close')
	assert.equal(internals.decisionHintOf(choiceQuestion, choiceAdvice({ pick: 0.550001, other: 0.449999 })), undefined)
	assert.equal(internals.decisionHintOf(choiceQuestion, choiceAdvice({ pick: 0.45, other: 0.15, none: 0.4 })).kind, 'choice-close')
	assert.equal(internals.decisionHintOf(choiceQuestion, choiceAdvice({ pick: 0.1, other: 0.7, none: 0.2 })).kind, 'choice-other-higher')
})

test('divergence hint refuses none, unanswered, or malformed conclusions', () => {
	assert.equal(internals.decisionHintOf(choiceQuestion, choiceAdvice({ noneOfTheAbove: true })), undefined)
	assert.equal(internals.decisionHintOf(choiceQuestion, choiceAdvice({ answered: false })), undefined)
	assert.equal(internals.decisionHintOf(choiceQuestion, choiceAdvice({ none: Number.NaN })), undefined)
	assert.equal(internals.decisionHintOf(choiceQuestion, choiceAdvice({ confidence: Number.NaN })), undefined)
})

test('multi-choice hint reports every inclusive forty-five-to-fifty-five option', () => {
	const question = { ...choiceQuestion, multiSelect: true }
	const advice = {
		questionId: 'mode', kind: 'noul-set', supported: true, answered: true,
		picks: [{ index: 0, label: 'Fast', probability: 0.9 }, { index: 1, label: 'Careful', probability: 0.51 }],
		probabilities: [
			{ index: 0, label: 'Fast', probability: 0.9 },
			{ index: 1, label: 'Careful', probability: 0.51 },
		],
	}
	assert.deepEqual(internals.decisionHintOf(question, advice), { kind: 'multi-close', indexes: [1] })
	assert.equal(internals.decisionHintOf(question, { ...advice, probabilities: advice.probabilities.map((row) => ({ ...row, probability: 0.56 })) }), undefined)
})

test('copy text requires the same complete adoptable answer gate and preserves all original text', () => {
	const advice = [choiceAdvice({ pick: 0.8, other: 0.2 })]
	const text = internals.buildCopyText([{
		...choiceQuestion,
		question: 'Pick a mode',
		options: [{ label: 'Fast', description: 'finish quickly' }, { label: 'Careful', description: 'change less' }],
	}], advice)
	assert.match(text, /Pick a mode/)
	assert.match(text, /Fast.*finish quickly/)
	assert.doesNotMatch(text, /Careful.*change less/)
	assert.equal(internals.buildCopyText([choiceQuestion, { ...choiceQuestion, id: 'other' }], advice), undefined)
	assert.equal(internals.buildCopyText([choiceQuestion], [choiceAdvice({ noneOfTheAbove: true })]), undefined)
})

test('decision preference is trimmed and bounded to five hundred UTF-16 code units', () => {
	assert.equal(internals.normalizeDecisionPreference('  stable  '), 'stable')
	assert.equal(internals.normalizeDecisionPreference('   '), '')
	assert.equal(internals.normalizeDecisionPreference('x'.repeat(501)).length, 500)
	assert.equal(internals.normalizeDecisionPreference(undefined), '')
})
