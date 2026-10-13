import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { lstat, mkdtemp, readFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'
import { createMockTypeSafeServer, ACCEPTED_KEY } from './mock-typesafe.mjs'
import { PROJECT_ROOT, expectJson, removeHarnessDirectory, startHost } from './helpers/host-harness.mjs'

function npmCli() {
  return process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
}

test('真实 npm 压缩包安装后通过包内 patch 加载宿主与客户端，不链接源码', { timeout: 180_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-jev pack-'))
  let host, mock
  try {
    const packed = spawnSync(process.execPath, [npmCli(), 'pack', '--json', '--ignore-scripts', '--pack-destination', root], {
      cwd: PROJECT_ROOT, encoding: 'utf8', windowsHide: true, timeout: 90_000,
    })
    assert.equal(packed.status, 0, packed.stderr)
    const [metadata] = JSON.parse(packed.stdout)
    assert.equal(metadata.filename, basename(metadata.filename))
    const files = metadata.files.map((item) => item.path)
    for (const path of ['lib/index.js', 'lib/client.js', 'lib/types/index.d.ts', 'lib/types/client/index.d.ts', 'cordis.patch.yml', 'package.json']) assert.ok(files.includes(path), `${path} is shipped`)
    assert.equal(files.some((path) => /^(src|test|node_modules|helloagents)\//.test(path) || /AGENTS\.md$/i.test(path)), false)
    mock = await createMockTypeSafeServer({ port: 0 })
    host = await startHost({ packageTarball: join(root, metadata.filename), mock, apiKey: ACCEPTED_KEY, requireConfirmation: true })
    const installed = host.pluginLink
    assert.equal((await lstat(installed)).isSymbolicLink(), false, 'installed package must be real files, not a source junction')
    assert.equal(await realpath(installed), installed)
    assert.equal(existsSync(join(installed, 'src')), false)
    const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'))
    assert.equal(manifest.version, metadata.version)
    const profile = JSON.parse(await readFile(join(host.profile, 'package.json'), 'utf8'))
    assert.ok(profile.dsh.profile.bundles.includes(manifest.name), 'load the shipped bundle patch, not a test-authored insert')
    const status = await expectJson(host, '/dsh-jev-advisor/api/status', { method: 'GET' }, 200)
    assert.equal(status.value.hasKey, true)
    const binding = {
      requestId: 'installed-request', sessionId: 'installed-session', interactionKey: 'installed-question',
      questions: [{ id: 'mode', question: 'Installed package?', options: [{ label: 'Fast' }, { label: 'Thorough' }] }],
    }
    const prepared = await expectJson(host, '/dsh-jev-advisor/api/prepare', { method: 'POST', body: binding }, 200)
    const advised = await expectJson(host, '/dsh-jev-advisor/api/advise', { method: 'POST', body: { ...binding, previewToken: prepared.value.previewToken } }, 200)
    assert.equal(advised.value.advice[0].pick.label, 'Fast')
    assert.deepEqual(mock.requests[0].body, prepared.value.request)

    // 使用真实宿主提供的浏览器产物，而不是从源码目录读取。
    const page = await host.request('/')
    const bootScript = page.text.match(/<script>globalThis\["__DSH_BOOT__"\] = ([\s\S]*?)<\/script>/)
    assert.ok(bootScript, 'real host exposes its client boot graph')
    const graph = JSON.parse(bootScript[1].replace(/;\s*$/, ''))
    const entry = graph.entries.find((row) => row.id === manifest.name)
    assert.ok(entry, 'the installed client is active in the real boot graph')
    assert.deepEqual(entry.inject, manifest.dsh.client.inject)
    const client = await host.request(`/${entry.url}`)
    assert.equal(client.response.status, 200, client.text.slice(0, 200))
    assert.ok(client.text.includes((await readFile(join(installed, 'lib/client.js'), 'utf8')).trim()), 'served combo contains the installed client artifact')
    let registration
    vm.runInNewContext(client.text, { window: { __ModuleLoader__: { load(value) { registration = value } } } })
    assert.equal(registration.id, manifest.name)
    const exported = registration.factory((name) => { assert.equal(name, 'react'); return {} })
    assert.equal(typeof exported.apply, 'function')
    assert.deepEqual(Array.from(exported.inject).sort(), ['slots', 'locale', 'configForms', 'uiSession'].sort())
  } finally {
    try { await host?.stop() } finally {
      try { await mock?.close() } finally { await removeHarnessDirectory(root) }
    }
  }
  assert.equal(existsSync(root), false, 'temporary tarball directory is removed')
  assert.equal(existsSync(host.home), false, 'temporary installed profile is removed')
  assert.ok(host.child.exitCode !== null || host.child.signalCode !== null, 'scratch host process has exited')
})
