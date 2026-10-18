import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Config } from '../src/index.js'

let registration
globalThis.window = { __ModuleLoader__: { load(value) { registration = value } } }
await import('../src/client.js?layout')
const api = registration.factory(() => ({})).internals

test('宿主布局 schema 限定停靠枚举与布尔值，不接受任意数据', () => {
	assert.equal(Config({}).cardDock.get(), '')
	assert.equal(Config({ cardDock: 'right', cardCollapsed: true }).cardCollapsed.get(), true)
	assert.throws(() => Config({ cardDock: 'elsewhere' }))
	assert.throws(() => Config({ cardCollapsed: 'false' }))
})

function scopeFixture(value = {}) {
	let snapshot = { status: 'ready', writable: true, revision: 1, value: { cardDock: '', cardCollapsed: false, model: 'jev-latest', ...value } }
	const listeners = new Set(), writes = [], pending = []
	let deferred = false
	const scope = {
		getSnapshot: () => snapshot,
		subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
		mutate(ops, revision) {
			writes.push({ ops, revision })
			const commit = () => {
				if (revision !== snapshot.revision || !snapshot.writable) return false
				scope.change(Object.fromEntries(ops.map(op => [op.path[0], op.value])))
				return true
			}
			return deferred ? new Promise(resolve => pending.push({ resolve, commit })) : Promise.resolve(commit())
		},
		change(patch) {
			snapshot = { ...snapshot, revision: snapshot.revision + 1, value: { ...snapshot.value, ...patch } }
			for (const listener of listeners) listener()
		},
		defer() { deferred = true },
		finish(accepted = true) { const write = pending.shift(); assert.ok(write); write.resolve(accepted ? write.commit() : false) },
		writes,
	}
	return scope
}

const flush = () => new Promise(resolve => setImmediate(resolve))
function controller(t, scope, props) {
	assert.equal(typeof api.createLayoutController, 'function', '布局控制器应从 profile 读取并原子保存')
	const result = api.createLayoutController(scope, props)
	t.after(result.start())
	return result
}

test('profile 布局优先于浏览器旧值，新的浏览器端口无需本地存储即可恢复', t => {
	const scope = scopeFixture({ cardDock: 'right', cardCollapsed: true })
	const first = controller(t, scope, { dock: 'left' })
	assert.deepEqual(first.getSnapshot().layout, { dock: 'right', collapsed: true })
	assert.deepEqual(controller(t, scopeFixture(scope.getSnapshot().value)).getSnapshot().layout, first.getSnapshot().layout)
	assert.equal(scope.writes.length, 0)
})

test('布局保存仅写两个非敏感字段，不覆盖模型、Key 或决策偏好', async t => {
	const scope = scopeFixture()
	const c = controller(t, scope)
	c.update({ dock: 'right', apiKey: 'must-not-save', decisionPreference: 'must-not-save' })
	await flush()
	assert.deepEqual(scope.writes[0], { revision: 1, ops: [
		{ op: 'set', path: ['cardDock'], value: 'right' },
		{ op: 'set', path: ['cardCollapsed'], value: false },
	] })
	assert.equal(scope.getSnapshot().value.model, 'jev-latest')
})

test('快速布局更改合并排队，修订号冲突只基于新快照重试且保留其他设置', async t => {
	const scope = scopeFixture()
	scope.defer()
	const c = controller(t, scope)
	c.update({ dock: 'right' })
	c.update({ collapsed: true })
	scope.change({ model: 'new-model' })
	scope.finish()
	await flush()
	assert.equal(scope.writes.length, 2)
	assert.equal(scope.writes[1].revision, 2)
	scope.finish()
	await flush()
	assert.deepEqual(c.getSnapshot().layout, { dock: 'right', collapsed: true })
	assert.equal(scope.getSnapshot().value.model, 'new-model')
	assert.equal(scope.getSnapshot().value.cardCollapsed, true)
})

test('保存被拒绝时保留本次布局并显示失败，不无限重试', async t => {
	const scope = scopeFixture()
	scope.defer()
	const c = controller(t, scope)
	c.update({ dock: 'right' })
	scope.finish(false)
	await flush()
	assert.equal(scope.writes.length, 1)
	assert.equal(c.getSnapshot().layout.dock, 'right')
	assert.equal(c.getSnapshot().failed, true)
})

test('卸载不再发出排队布局写入，也不通知旧组件', async () => {
	const scope = scopeFixture()
	scope.defer()
	assert.equal(typeof api.createLayoutController, 'function')
	const c = api.createLayoutController(scope)
	const stop = c.start()
	c.update({ dock: 'right' })
	c.update({ collapsed: true })
	let notifications = 0
	c.subscribe(() => { notifications++ })
	stop()
	scope.finish()
	await flush()
	assert.equal(scope.writes.length, 1)
	assert.equal(notifications, 0)
})

test('布局修订不使建议失效，但模型更新和仅 Key 轮换仍使建议失效', () => {
	assert.equal(typeof api.adviceSettingsIdentity, 'function')
	const first = { status: 'ready', writable: true, revision: 1, value: { model: 'jev-latest', cardDock: '', cardCollapsed: false } }
	const original = api.adviceSettingsIdentity(first)
	const layout = api.adviceSettingsIdentity({ ...first, revision: 2, value: { ...first.value, cardDock: 'right' } }, original, 'owned')
	assert.equal(layout.key, original.key)
	const keyRotation = api.adviceSettingsIdentity({ ...layout.snapshot, revision: 3 }, layout)
	assert.notEqual(keyRotation.key, layout.key)
	const model = api.adviceSettingsIdentity({ ...keyRotation.snapshot, revision: 4, value: { ...first.value, model: 'jev-next' } }, keyRotation)
	assert.notEqual(model.key, keyRotation.key)
})

test('首次布局覆盖新增 user 层仍是纯布局变化，不能再次请求 Jev', () => {
	const first = { status: 'ready', revision: 1, value: { model: 'jev-latest', cardDock: '', cardCollapsed: false } }
	const original = api.adviceSettingsIdentity(first)
	const next = api.adviceSettingsIdentity({ ...first, revision: 2, user: { cardDock: 'right', cardCollapsed: false }, value: { ...first.value, cardDock: 'right' } }, original, 'owned')
	assert.equal(next.key, original.key)
})

test('来源不明的布局加隐藏 Key 原子修改保守失效，只有确认本地写入才保持身份', () => {
	const first = { status: 'ready', writable: true, revision: 1, value: { model: 'jev-latest', cardDock: '', cardCollapsed: false } }
	const old = api.adviceSettingsIdentity(first)
	const next = { ...first, revision: 2, value: { ...first.value, cardDock: 'right' } }
	assert.notEqual(api.adviceSettingsIdentity(next, old).key, old.key)
	const verifying = api.adviceSettingsIdentity(next, old, 'pending')
	assert.equal(verifying.pending, true)
	assert.equal(verifying.key, old.key)
	const accepted = api.adviceSettingsIdentity(next, verifying, 'owned')
	assert.equal(accepted.pending, false)
	assert.equal(accepted.key, old.key)
	assert.notEqual(api.adviceSettingsIdentity(next, verifying, 'external').key, old.key)
})

test('布局 writer 只有接受了自己 CAS 对应的修订才证明来源', async t => {
	const scope = scopeFixture()
	scope.defer()
	const c = controller(t, scope)
	assert.equal(typeof c.classifySettings, 'function')
	c.update({ dock: 'right' })
	const hypothetical = { ...scope.getSnapshot(), revision: 2, value: { ...scope.getSnapshot().value, cardDock: 'right' } }
	assert.equal(c.classifySettings(hypothetical), 'pending')
	scope.finish()
	await flush()
	assert.equal(c.classifySettings(scope.getSnapshot()), 'owned')
	scope.change({ cardDock: 'left' })
	assert.equal(c.classifySettings(scope.getSnapshot()), 'external')
})

test('React 合并渲染跳过了隐藏凭据修订时，后续本地布局接受也不能掩盖该间隙', async t => {
	const scope = scopeFixture()
	const c = controller(t, scope)
	const observedRevision = scope.getSnapshot().revision
	scope.change({}) // 模拟隐藏 Key 更新：可见值不变，修订推进。
	c.update({ dock: 'right' })
	await flush()
	assert.equal(c.classifySettings(scope.getSnapshot(), observedRevision), 'external')
})

test('配置来源复用了深层 value 对象也不能篡改已捕获的接受证明', async t => {
	const scope = scopeFixture()
	const shared = scope.getSnapshot().value
	scope.defer()
	const c = controller(t, scope)
	const observed = scope.getSnapshot().revision
	c.update({ dock: 'right' })
	shared.model = 'foreign-change-during-write'
	scope.finish()
	await flush()
	assert.equal(c.classifySettings(scope.getSnapshot(), observed), 'external')
})

test('多次本地布局写入被合并渲染时，连续的接受证明仍可避免重复评估', async t => {
	const scope = scopeFixture()
	const c = controller(t, scope)
	const observedRevision = scope.getSnapshot().revision
	c.update({ dock: 'right' })
	await flush()
	c.update({ collapsed: true })
	await flush()
	assert.equal(c.classifySettings(scope.getSnapshot(), observedRevision), 'owned')
})

test('宿主重新连接复用了修订号时，实际配置变化仍生成新的单调身份', () => {
	const first = { status: 'ready', writable: true, revision: 1, value: { model: 'jev-latest', cardDock: '', cardCollapsed: false } }
	const old = api.adviceSettingsIdentity(first)
	const next = api.adviceSettingsIdentity({ ...first, value: { ...first.value, model: 'jev-other' } }, old)
	assert.notEqual(next.key, old.key)
	const restored = api.adviceSettingsIdentity(first, next)
	assert.notEqual(restored.key, old.key)
	assert.notEqual(restored.key, next.key)
})

test('StrictMode 重启 effect 后旧迁移被拒绝，新生命周期仍可完成迁移', async t => {
	const oldWindow = globalThis.window
	const memory = new Map([['dsh-jev-advisor:layout:v1', '{"dock":"right","collapsed":true}']])
	globalThis.window = { localStorage: { getItem: key => memory.get(key), removeItem: key => memory.delete(key) } }
	t.after(() => { globalThis.window = oldWindow })
	const scope = scopeFixture()
	scope.defer()
	const c = api.createLayoutController(scope)
	const firstStop = c.start()
	firstStop()
	const stop = c.start()
	t.after(stop)
	assert.equal(scope.writes.length, 1, '旧迁移仍在等待回执时，新生命周期不并发发送第二次 CAS')
	scope.finish(false)
	await flush()
	assert.equal(scope.writes.length, 2)
	scope.finish()
	await flush()
	assert.equal(scope.getSnapshot().value.cardDock, 'right')
	assert.equal(memory.size, 0)
})

test('设置稍后加载时才迁移旧布局，迁移成功后删除旧键', async t => {
	const oldWindow = globalThis.window
	const memory = new Map([['dsh-jev-advisor:layout:v1', '{"dock":"right","collapsed":true,"apiKey":"discard"}']])
	globalThis.window = { localStorage: { getItem: key => memory.get(key), removeItem: key => memory.delete(key) } }
	t.after(() => { globalThis.window = oldWindow })
	const scope = scopeFixture()
	const read = scope.getSnapshot
	let loading = true
	scope.getSnapshot = () => loading ? { status: 'loading' } : read()
	const c = controller(t, scope)
	assert.equal(scope.writes.length, 0)
	loading = false
	scope.change({})
	await flush()
	assert.deepEqual(c.getSnapshot().layout, { dock: 'right', collapsed: true })
	assert.equal(scope.getSnapshot().value.cardDock, 'right')
	assert.equal(memory.size, 0)
})

test('不同 profile 不共享布局，宿主只读时只保留当前窗口并提示', async t => {
	const saved = controller(t, scopeFixture({ cardDock: 'right', cardCollapsed: true }))
	const otherScope = scopeFixture()
	const originalRead = otherScope.getSnapshot
	otherScope.getSnapshot = () => ({ ...originalRead(), writable: false })
	const other = controller(t, otherScope)
	assert.equal(other.getSnapshot().layout.dock, 'left')
	other.update({ dock: 'right' })
	await flush()
	assert.equal(otherScope.writes.length, 0)
	assert.equal(other.getSnapshot().failed, true)
	assert.deepEqual(saved.getSnapshot().layout, { dock: 'right', collapsed: true })
})

test('一次重试后仍冲突就停止，网络错误也不产生循环写入', async t => {
	for (const transportError of [false, true]) {
		const scope = scopeFixture()
		const writes = []
		scope.mutate = async (_ops, revision) => {
			writes.push(revision)
			if (transportError) throw new Error('offline')
			scope.change({ model: `external-${revision}` })
			return false
		}
		const c = controller(t, scope)
		c.update({ collapsed: true })
		await flush()
		assert.equal(writes.length, transportError ? 1 : 2)
		assert.equal(c.getSnapshot().failed, true)
	}
})
