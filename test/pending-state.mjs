import assert from 'node:assert/strict'
import { test } from 'node:test'

let registration
globalThis.window = { __ModuleLoader__: { load(value) { registration = value } } }
await import('../src/client.js?pending-state')
const api = registration.factory(() => ({})).internals
const question = { key: 'question:s:call', sessionId: 's', questions: [{ id: 'mode', question: 'Choose', options: [{ label: 'A' }] }], answer: async () => {} }

for (const snapshot of [{ closed: false, channel: 'none' }, { closed: true, channel: 'waterfall' }]) {
	test(`不可回答的宿主快照不触发建议：${JSON.stringify(snapshot)}`, () => {
		assert.equal(api.pendingQuestionsOf({ ...question, getSnapshot: () => snapshot }), undefined)
	})
}

test('历史回看卡片没有回答通道，不得发送 Jev 请求', () => {
	assert.equal(api.pendingQuestionsOf({ ...question, review: [] }), undefined)
})

test('公开通道从 waterfall 切换到 rpc 后仍可回答，异常快照安全关闭', () => {
	for (const channel of ['waterfall', 'rpc']) assert.ok(api.pendingQuestionsOf({ ...question, getSnapshot: () => ({ closed: false, channel }) }))
	assert.equal(api.pendingQuestionsOf({ ...question, getSnapshot() { throw new Error('disposed') } }), undefined)
})

test('携带 toolName 与 answer 的越权审批可被归一化为二选一决策，已结算或缺失工具名的审批被忽略', () => {
	const approval = {
		key: 'approval:1',
		sessionId: 's',
		kind: 'approval',
		toolName: 'bash',
		callId: 'call-42',
		reason: 'Run rm -rf build/',
		answerable: true,
		answer: async () => {},
	}
	const normalized = api.pendingQuestionsOf(approval)
	assert.ok(normalized)
	assert.equal(normalized.kind, 'approval')
	assert.equal(normalized.complete, true)
	assert.deepEqual(normalized.approval, { toolName: 'bash', callId: 'call-42', reason: 'Run rm -rf build/' })
	assert.equal(normalized.questions[0].approval, true)
	assert.deepEqual(normalized.questions[0].options.map((o) => o.label), ['allow-once', 'reject'])
	assert.equal(api.pendingQuestionsOf({ ...approval, answerable: false }), undefined)
	assert.equal(api.pendingQuestionsOf({ key: 'approval:2', sessionId: 's', kind: 'approval' }), undefined)
})

test('plan-review 交互标记 planReview 以支持计划评分与要求修改采纳', () => {
	const planInteraction = {
		key: 'question:s:plan-1',
		sessionId: 's',
		kind: 'plan-review',
		questions: [{
			id: 'plan',
			question: 'Approve this plan?',
			detail: '# Plan\n1. Do X',
			intent: { kind: 'plan-review', approve: 'Approve' },
			options: [{ label: 'Approve' }],
		}],
		answer: async () => {},
		dismiss: async () => {},
	}
	const normalized = api.pendingQuestionsOf(planInteraction)
	assert.ok(normalized)
	assert.equal(normalized.questions[0].planReview, true)
})

