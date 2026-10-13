import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const qualitySteps = Object.freeze(['build', 'test', 'test:browser', 'check:pack', 'test:host', 'test:install']
  .map((script) => Object.freeze({ script })))

function runStep({ script }) {
  const npmCli = process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  const env = { ...process.env }
  // 发布闸门必须运行 lib/，不能继承开发中的源码测试开关。
  delete env.DSH_CLIENT_SOURCE
  process.stdout.write(`\n[quality] ${script}\n`)
  const result = spawnSync(process.execPath, [npmCli, ...(script === 'test' ? ['test'] : ['run', script])], {
    cwd: root, env, stdio: 'inherit', windowsHide: true,
  })
  if (result.error || result.status !== 0) {
    const error = new Error(`质量闸门失败：${script} (${result.error?.message ?? result.signal ?? result.status})`)
    error.exitCode = result.status || 1
    throw error
  }
}

export async function runQuality(run = runStep) {
  for (const step of qualitySteps) await run(step)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runQuality()
    process.stdout.write('\n[quality] 全部通过；未发布、未提交，仅使用隔离测试 profile。\n')
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = error.exitCode ?? 1
  }
}
