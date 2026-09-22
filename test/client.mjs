/**
 * dsh-jev-advisor client-half test.
 *
 * Loads the browser bundle the way the DSH client module system does (through
 * `window.__ModuleLoader__.load`), mounts it against a stub Cordis context, and
 * renders both contributions with `react-dom/server`. That covers the wiring
 * that a host-only test cannot see: bundle registration, slot registrations,
 * dictionary parity, and the pure advice-mapping helpers behind the
 * "Adopt Jev's answer" button.
 *
 *   node test/client.mjs
 *
 * `react` and `react-dom` must be resolvable (the DSH profile's node_modules
 * carries both).
 */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)

// `react-dom` and the `react` it renders must be the SAME copy, or hooks and
// element identity disagree. Resolve React through react-dom's own resolver
// instead of trusting the top-level layout.
const reactDomServer = require_.resolve('react-dom/server')
const reactDomRequire = createRequire(reactDomServer)
const React = reactDomRequire('react')
const { renderToStaticMarkup } = reactDomRequire('react-dom/server')

/* ------------------------------------------------------------------ *
 * Load the bundle exactly like the client module system does
 * ------------------------------------------------------------------ */

let registration
globalThis.window = {
	__ModuleLoader__: {
		load(value) {
			registration = value
		},
	},
}

await import('../lib/client.js')

assert.equal(registration.id, 'dsh-jev-advisor', 'the bundle registers under its package name')
const exports_ = registration.factory((specifier) => {
	if (specifier === 'react') return React
	throw new Error(`unexpected require("${specifier}") — the client bundle may only use platform seed modules`)
})

assert.deepEqual([...exports_.inject], ['slots', 'locale', 'settingsScope'])
assert.equal(typeof exports_.apply, 'function')
const { internals } = exports_

/* ------------------------------------------------------------------ *
 * Mount against a stub context
 * ------------------------------------------------------------------ */

const registered = []
const dictionaries = []
const bound = []

const ctx = {
	effect(callback) {
		const dispose = callback()
		return typeof dispose === 'function' ? dispose : () => {}
	},
	locale: {
		register(namespace, dicts) {
			dictionaries.push({ namespace, dicts })
			return () => {}
		},
		bind: () => (key) => key,
	},
	slots: {
		inject(key, callback) {
			callback()
		},
		register(options, component) {
			registered.push({ options, component })
			return () => {}
		},
	},
	settingsScope: {
		bind(spec) {
			bound.push(spec)
			return {
				subscribe: () => () => {},
				getSnapshot: () => ({ status: 'ready', value: { enabled: true, endpoint: 'https://api.typesafe.ai/v1/systemone', model: 'jev-latest' }, revision: 1 }),
				set: async () => {},
			}
		},
	},
}

exports_.apply(ctx)

assert.deepEqual(bound, [{ namespace: 'dsh-jev-advisor' }], 'the settings scope is bound once, in the plugin fiber')
assert.deepEqual(dictionaries.map((entry) => entry.namespace), ['dsh-jev-advisor'])

const overlay = registered.find((entry) => entry.options.name === 'shell.overlay')
const section = registered.find((entry) => entry.options.name === 'settings.section')
assert.ok(overlay !== undefined, 'the advice card claims a shell.overlay cell')
assert.equal(overlay.options.id, 'dsh-jev-advisor-card')
assert.equal(typeof overlay.options.inject, 'function')
assert.deepEqual(Object.keys(overlay.options.inject()), ['scope'], 'the card receives the settings scope')

assert.ok(section !== undefined, 'the settings section claims a settings.section cell')
assert.equal(section.options.id, 'jev')
assert.equal(section.options.label(), 'settings.nav', 'the nav label goes through the bound dictionary')
assert.deepEqual(Object.keys(section.options.inject()), ['scope'])

/* ------------------------------------------------------------------ *
 * Dictionary parity
 * ------------------------------------------------------------------ */

const zhKeys = Object.keys(internals.zh).sort()
const enKeys = Object.keys(internals.en).sort()
assert.deepEqual(enKeys, zhKeys, 'the English dictionary carries exactly the Chinese key set')

/* ------------------------------------------------------------------ *
 * Pure advice helpers
 * ------------------------------------------------------------------ */

const { pendingQuestionsOf, buildAnswers, isAdoptable, displayLabel } = internals

assert.equal(displayLabel('Fast (Recommended)'), 'Fast')
assert.equal(displayLabel('Fast'), 'Fast')

const interaction = {
	key: 'question:1',
	sessionId: 'session-a',
	questions: [
		{ id: 'mode', question: 'Which mode?', header: 'Choose', options: [{ label: 'Fast (Recommended)' }, { label: 'Thorough' }] },
	],
}
const narrowed = pendingQuestionsOf(interaction)
assert.equal(narrowed.complete, true)
assert.equal(narrowed.questions.length, 1)
assert.equal(narrowed.questions[0].options.length, 2)

assert.equal(pendingQuestionsOf({ questions: [] }), undefined, 'an empty batch is not judgeable')
assert.equal(
	pendingQuestionsOf({ questions: [{ id: 'x', question: 'free text?' }] }),
	undefined,
	'a question with no options is not judgeable',
)

const mixed = pendingQuestionsOf({
	questions: [
		{ id: 'a', question: 'with options', options: [{ label: 'one' }] },
		{ id: 'b', question: 'without options' },
	],
})
assert.equal(mixed.complete, false, 'a batch with an option-less question is incomplete')
assert.equal(mixed.questions.length, 1)

const choiceAdvice = [
	{
		questionId: 'mode',
		kind: 'choice',
		supported: true,
		answered: true,
		pick: { index: 0, label: 'Fast (Recommended)', probability: 0.8 },
		noneOfTheAbove: false,
		noneProbability: 0.05,
		confidence: 0.81,
		probabilities: [
			{ index: 0, label: 'Fast (Recommended)', probability: 0.8 },
			{ index: 1, label: 'Thorough', probability: 0.15 },
		],
	},
]
assert.deepEqual(buildAnswers(narrowed.questions, choiceAdvice), [{ id: 'mode', selected: ['Fast (Recommended)'] }])
assert.equal(isAdoptable(narrowed.questions, choiceAdvice), true)

const noneAdvice = [{ questionId: 'mode', kind: 'choice', supported: true, answered: true, noneOfTheAbove: true, pick: undefined }]
assert.equal(buildAnswers(narrowed.questions, noneAdvice), undefined, '"none of the above" is not adoptable')

const unanswered = [{ questionId: 'mode', kind: 'choice', supported: true, answered: false, probabilities: [] }]
assert.equal(buildAnswers(narrowed.questions, unanswered), undefined, 'an unanswered question blocks adoption')

const multiQuestions = [{ id: 'checks', question: 'Which?', multiSelect: true, options: [{ label: 'lint' }, { label: 'tests' }] }]
const multiAdvice = [{
	questionId: 'checks',
	kind: 'noul-set',
	supported: true,
	answered: true,
	picks: [{ index: 0, label: 'lint', probability: 0.9 }, { index: 1, label: 'tests', probability: 0.3 }],
}]
assert.deepEqual(buildAnswers(multiQuestions, multiAdvice), [{ id: 'checks', selected: ['lint'] }], 'only options at or above 0.5 are adopted')

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

/** A stand-in for the locale-bound `t`. */
const t = (key, params) => {
	const template = internals.en[key] ?? internals.zh[key] ?? key
	if (params === undefined) return template
	return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
}

const settingsMarkup = renderToStaticMarkup(
	React.createElement(internals.JevSettingsSection, { t, scope: ctx.settingsScope.bind({ namespace: 'dsh-jev-advisor' }), close: () => {} }),
)
assert.match(settingsMarkup, /Jev decision advice/, 'the settings section renders its title')
assert.match(settingsMarkup, /API key/)
assert.match(settingsMarkup, /Not configured/, 'a missing key is reported without reading it back')
assert.match(settingsMarkup, /Test connection/)
assert.match(settingsMarkup, /jev-latest/, 'the model field shows the resolved value')

const emptyOverlay = renderToStaticMarkup(
	React.createElement(internals.JevAdviceOverlay, {
		t,
		scope: ctx.settingsScope.bind({ namespace: 'dsh-jev-advisor' }),
		useSessions: (select) => select({ current: 'session-a' }),
		useSessionPendingInteraction: (select) => select(new Map()),
	}),
)
assert.equal(emptyOverlay, '', 'the card stays out of the way when nothing is pending')

const pendingOverlay = renderToStaticMarkup(
	React.createElement(internals.JevAdviceOverlay, {
		t,
		scope: ctx.settingsScope.bind({ namespace: 'dsh-jev-advisor' }),
		useSessions: (select) => select({ current: 'session-a' }),
		useSessionPendingInteraction: (select) => select(new Map([['session-a', interaction]])),
	}),
)
assert.match(pendingOverlay, /data-dsh-jev-advisor="advice"/, 'the card mounts for a pending option-bearing question')
assert.match(pendingOverlay, /Jev advice/)
assert.match(pendingOverlay, /Dismiss/, 'the card is dismissible')
assert.doesNotMatch(
	pendingOverlay,
	/Adopt Jev/,
	'no adopt button before an answer exists (effects do not run server-side, so the card is still idle)',
)

const approvalOverlay = renderToStaticMarkup(
	React.createElement(internals.JevAdviceOverlay, {
		t,
		scope: ctx.settingsScope.bind({ namespace: 'dsh-jev-advisor' }),
		useSessions: (select) => select({ current: 'session-a' }),
		useSessionPendingInteraction: (select) => select(new Map([['session-a', { key: 'approval:1', sessionId: 'session-a', kind: 'approval' }]])),
	}),
)
assert.equal(approvalOverlay, '', 'an approval interaction is left to its own UI')

/* ------------------------------------------------------------------ *
 * The recommendation body (the pure presentation path)
 * ------------------------------------------------------------------ */

const bodyValue = {
	model: 'jev-1.13.0',
	usage: { input_tokens: 318, output_tokens: 34 },
	request: { state: { context: 'ctx', decisions: [] }, model: 'jev-latest', questions: { mode: { type: 'choice' } } },
	response: { model: 'jev-1.13.0', answers: { mode: { type: 'choice', choice: 'opt_0', confidence: 0.81 } } },
	advice: choiceAdvice,
}
const bodyMarkup = renderToStaticMarkup(
	React.createElement(internals.JevAdviceBody, {
		t,
		questions: narrowed.questions,
		value: bodyValue,
		adoptable: true,
		busy: false,
		adoptError: undefined,
		onAdopt: () => {},
	}),
)
assert.match(bodyMarkup, /Recommended/, 'the recommendation is badged')
assert.match(bodyMarkup, /Fast/, 'the recommended option label is shown')
assert.doesNotMatch(bodyMarkup, /\(Recommended\)/, 'the conventional suffix is stripped from display')
assert.match(bodyMarkup, /80%/, 'the pick probability is shown')
assert.match(bodyMarkup, /Thorough/, 'the rest of the distribution is listed')
assert.match(bodyMarkup, /Confidence: 81%/, "Jev's confidence is shown")
assert.match(bodyMarkup, /Adopt Jev’s answer/, 'the adopt action is offered')
assert.match(bodyMarkup, /Show the structured JSON request and response/, 'the raw JSON is available')
assert.doesNotMatch(bodyMarkup, /no clear advice/, 'an adoptable batch carries no partial warning')

const blockedMarkup = renderToStaticMarkup(
	React.createElement(internals.JevAdviceBody, {
		t,
		questions: narrowed.questions,
		value: { ...bodyValue, advice: noneAdvice },
		adoptable: false,
		busy: false,
		adoptError: undefined,
		onAdopt: () => {},
	}),
)
assert.match(blockedMarkup, /none of the listed options fits/, '"none of the above" is explained')
assert.match(blockedMarkup, /no clear advice/, 'a non-adoptable batch says so')
assert.match(blockedMarkup, /disabled/, 'the adopt button is disabled rather than hidden')

const multiMarkup = renderToStaticMarkup(
	React.createElement(internals.JevAdviceBody, {
		t,
		questions: multiQuestions,
		value: { ...bodyValue, advice: multiAdvice },
		adoptable: true,
		busy: false,
		adoptError: undefined,
		onAdopt: () => {},
	}),
)
assert.match(multiMarkup, /multi-select/)
assert.match(multiMarkup, /lint/)
assert.match(multiMarkup, /90%/)

const busyMarkup = renderToStaticMarkup(
	React.createElement(internals.JevAdviceBody, {
		t,
		questions: narrowed.questions,
		value: bodyValue,
		adoptable: true,
		busy: true,
		adoptError: 'boom',
		onAdopt: () => {},
	}),
)
assert.match(busyMarkup, /Submitting…/)
assert.match(busyMarkup, /Adopt failed: boom/)

process.stdout.write('dsh-jev-advisor client: all assertions passed\n')
