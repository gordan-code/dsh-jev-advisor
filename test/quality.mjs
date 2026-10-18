import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { qualitySteps, runQuality } from '../scripts/quality.mjs'

test('0.1.6 仅声明两个已验证的 DSH 候选版本，并同步锁文件版本', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
  assert.equal(manifest.version, '0.1.6')
  assert.equal(manifest.engines.dsh, '0.2.0-rc.2 || 0.2.1-rc.2')
  assert.equal(lock.version, manifest.version)
  assert.equal(lock.packages[''].version, manifest.version)
  assert.equal(lock.packages[''].engines.dsh, manifest.engines.dsh)
  assert.match(manifest.scripts.test, /test\/layout\.mjs/)
  assert.match(manifest.scripts.test, /test\/pending-state\.mjs/)
})

test('统一质量闸门按序覆盖构建、基础、浏览器、打包、宿主和真实安装', async () => {
  const visited = []
  await runQuality(async (step) => { visited.push(step.script) })
  assert.deepEqual(visited, ['build', 'test', 'test:browser', 'check:pack', 'test:host', 'test:install'])
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.scripts.quality, 'node scripts/quality.mjs')
  for (const { script } of qualitySteps) assert.equal(typeof manifest.scripts[script], 'string', `${script} is runnable`)
  assert.match(manifest.scripts.test, /test\/settings-lifecycle\.mjs/)
  assert.match(manifest.scripts.test, /test\/quality\.mjs/)
})

for (const failed of ['test:browser', 'test:host', 'test:install']) test(`${failed} 失败时闸门立即失败，不跳过或继续后续步骤`, async () => {
  const visited = []
  const failure = new Error('fixture gate failure')
  await assert.rejects(() => runQuality(async ({ script }) => {
    visited.push(script)
    if (script === failed) throw failure
  }), (error) => error === failure)
  assert.deepEqual(visited, qualitySteps.slice(0, qualitySteps.findIndex((step) => step.script === failed) + 1).map((step) => step.script))
})
