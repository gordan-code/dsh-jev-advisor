import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { qualitySteps, runQuality } from '../scripts/quality.mjs'

test('浏览器质量任务固定 Playwright 支持的 Ubuntu 24.04，不跟随 latest 漂移', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const lines = workflow.replace(/\r\n/g, '\n').split('\n')
  const start = lines.indexOf('  quality:')
  assert.notEqual(start, -1, 'quality job exists')
  const next = lines.findIndex((line, index) => index > start && /^  \S/.test(line))
  const quality = lines.slice(start + 1, next === -1 ? undefined : next)
  assert.equal(quality.find((line) => line.startsWith('    runs-on:')), '    runs-on: ubuntu-24.04')
  assert.ok(quality.includes('      - run: npx playwright install --with-deps chromium'))
  assert.ok(quality.includes('      - run: npm run quality'))
})

test('0.2.1 声明无上限下限（宿主升级无需跟随发版），并同步锁文件版本', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
  assert.equal(manifest.version, '0.2.1')
  // DSH 只有读到声明才显示「兼容」，所以保留一条 engines.dsh；但它必须是无上限下限，
  // 否则宿主每升一个版本就会变回「不兼容」——正是 0.2.1-rc.4 之后踩到的坑。
  assert.equal(manifest.engines.dsh, '>=0.2.0-rc.2')
  assert.match(manifest.engines.dsh, /^>=\d+\.\d+\.\d+/)
  assert.equal(/[<^~]|\s|\|\|/.test(manifest.engines.dsh.replace(/^>=/, '')), false, '声明不得包含上限、caret、tilde 或并列版本')
  assert.equal(Object.hasOwn(manifest.dsh, 'engines'), false, '只有一处声明，避免两处口径分叉')
  assert.equal(Object.keys(manifest.peerDependencies).some((name) => /^@deepseek-ai\/dsh(?:-|$)/.test(name)), false)
  assert.equal(lock.version, manifest.version)
  assert.equal(lock.packages[''].version, manifest.version)
  assert.deepEqual(lock.packages[''].engines, manifest.engines)
  assert.match(manifest.scripts.test, /test\/layout\.mjs/)
  assert.match(manifest.scripts.test, /test\/pending-state\.mjs/)
  assert.match(manifest.scripts.test, /test\/diagnostics\.mjs/)
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
