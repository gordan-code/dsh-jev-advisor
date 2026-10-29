import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import * as host from '../lib/index.js'

let registration
globalThis.window = { __ModuleLoader__: { load(value) { registration = value } } }
await import('../lib/client.js')
const client = registration.factory(() => ({})).internals
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const context = (version, scope = 'installation') => ({ get: key => key === 'pluginPackages' ? { resolution: { entries: [{ name: '@deepseek-ai/dsh-app-boot', version, scope, packageDir: 'C:/private/user/path' }] } } : undefined })

test('autoAdvise 是缺省 false 的 volatile 布尔配置', () => {
  assert.equal(host.Config({}).autoAdvise?.get(), false)
  assert.equal(host.Config({ autoAdvise: true }).autoAdvise.get(), true)
  assert.throws(() => host.Config({ autoAdvise: 'false' }))
})

test('诊断仅信任 installation 解析表，声明匹配不等于功能保证', () => {
  assert.equal(typeof host.diagnosticsOf, 'function')
  const report = host.diagnosticsOf(context('0.2.1-rc.3'), { enabled: true, autoAdvise: false, apiKey: 'private-key' })
  assert.equal(report.pluginVersion, manifest.version)
  assert.equal(report.dshVersion, '0.2.1-rc.3')
  assert.equal(report.declaredDsh, manifest.engines.dsh)
  assert.equal(report.declarationMatch, 'match')
  assert.equal(report.hasKey, true)
  assert.equal(report.autoAdvise, false)
  assert.equal(host.diagnosticsOf(context('0.2.1-rc.4'), {}).declarationMatch, 'mismatch')
  assert.equal(host.diagnosticsOf(context('0.2.1-rc.3+local'), {}).declarationMatch, 'match', '与 npm semver 精确版本一致，忽略 build metadata')
  for (const ctx of [{}, context('0.2.1-rc.3', 'profile'), context('C:/private'), { get() { throw Error('private-token') } }]) {
    const value = host.diagnosticsOf(ctx, {})
    assert.equal(value.dshVersion, null)
    assert.equal(value.declarationMatch, 'unknown')
  }
  assert.equal(/private-key|private\/user|packageDir/.test(JSON.stringify(report)), false)
})

test('浏览器诊断复制再次投影白名单，旧宿主和异常元数据安全显示未知', () => {
  assert.equal(typeof client.publicDiagnostics, 'function')
  const expected = host.diagnosticsOf(context('0.2.1-rc.3'), { enabled: true, autoAdvise: false, apiKey: 'private-key' })
  const report = client.publicDiagnostics({ ...expected, endpoint: 'https://user:password@private/path?token=secret', apiKey: 'secret', sessionId: 'secret', extra: { token: 'secret' } })
  assert.deepEqual(report, expected)
  assert.equal(/secret|private|password|endpoint|sessionId/.test(JSON.stringify(report)), false)
  assert.equal(client.publicDiagnostics(undefined).declarationMatch, 'unknown')
  assert.equal(client.publicDiagnostics({ pluginVersion: 'secret', dshVersion: 'C:/private', declaredDsh: 'secret', declarationMatch: 'match' }).declarationMatch, 'unknown')
})

test('设置写入接受 autoAdvise 布尔，拒绝字符串，不拆分原子写入', async () => {
  const writes = []
  const scope = { getSnapshot: () => ({ status: 'ready', writable: true }), mutate: async (...args) => { writes.push(args); return true } }
  await client.applySettingsDraft(scope, { autoAdvise: true }, 7)
  assert.deepEqual(writes, [[[{ op: 'set', path: ['autoAdvise'], value: true }], 7]])
  await assert.rejects(() => client.applySettingsDraft(scope, { autoAdvise: 'true' }, 7))
  assert.equal(writes.length, 1)
})

test('中英文用户说明与 UI 文案包含默认按需、开关和本地诊断', async () => {
  for (const path of ['../README.md', '../docs/README.zh.md']) {
    const content = await readFile(new URL(path, import.meta.url), 'utf8')
    assert.match(content, /autoAdvise=false/)
    assert.match(content, /0\.2\.1-rc\.3/)
    assert.match(content, /Local health check|本地健康检查/)
  }
  for (const copy of [client.zh, client.en]) {
    assert.ok(copy['settings.autoAdviseHint'])
    assert.ok(copy['settings.testHint'])
    assert.ok(copy['settings.diagnosticsHint'])
  }
})
