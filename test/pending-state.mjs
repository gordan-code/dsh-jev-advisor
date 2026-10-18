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
