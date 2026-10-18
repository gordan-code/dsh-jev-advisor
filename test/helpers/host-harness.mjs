import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { lstatSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createMockTypeSafeServer } from '../mock-typesafe.mjs'

const TEST_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
const PROJECT_ROOT = resolve(TEST_DIR, '..')
const require_ = createRequire(import.meta.url)
// 0.2.1-rc.2 的首次 Web profile 启动明显慢于 0.2.0；保留足够余量，
// 但仍在单个真实宿主测试的总超时内快速报告卡死。
const STARTUP_TIMEOUT_MS = 60_000
const STOP_TIMEOUT_MS = 5_000
const MAX_OUTPUT = 2 * 1024 * 1024

/** Resolve the real CLI without falling back to a user's installed profile. */
export function resolveDshCli() {
  const configured = process.env.DSH_TEST_CLI?.trim()
  const cli = configured !== undefined && configured !== '' ? resolve(configured) : (() => {
    try {
      return require_.resolve('@deepseek-ai/dsh/lib/bin.js')
    } catch {
      throw new Error('real DSH CLI unavailable; set DSH_TEST_CLI to the pinned @deepseek-ai/dsh@0.2.0-rc.2/lib/bin.js path')
    }
  })()
  const expectedVersion = process.env.DSH_TEST_VERSION?.trim()
  if (expectedVersion !== undefined && expectedVersion !== '') {
    const manifest = JSON.parse(readFileSync(join(dirname(dirname(cli)), 'package.json'), 'utf8'))
    assert.equal(manifest.version, expectedVersion, `DSH_TEST_CLI version mismatch: expected ${expectedVersion}, got ${String(manifest.version)}`)
  }
  return cli
}

function appendBounded(current, chunk) {
  const next = current + chunk
  return next.length > MAX_OUTPUT ? next.slice(-MAX_OUTPUT) : next
}

function isPathInside(child, parent) {
  const childPath = resolve(child)
  const parentPath = resolve(parent)
  if (childPath === parentPath) return false
  const prefix = parentPath.endsWith('\\') || parentPath.endsWith('/') ? parentPath : `${parentPath}${childPath.includes('\\') ? '\\' : '/'}`
  return childPath.startsWith(prefix)
}

/**
 * Remove only a harness-owned temporary directory. Junctions/symlinks are
 * unlinked first so recursive removal can never traverse into the repository.
 */
export async function removeHarnessDirectory(root, links = []) {
  const tempRoot = await realpath(tmpdir())
  const ownedRoot = resolve(root)
  assert.ok(isPathInside(ownedRoot, tempRoot), `refusing to remove non-temporary harness path: ${ownedRoot}`)
  for (const link of links) {
    const linkPath = resolve(link)
    assert.ok(isPathInside(linkPath, ownedRoot), `refusing to unlink path outside harness root: ${linkPath}`)
    try {
      const stat = lstatSync(linkPath)
      if (stat.isSymbolicLink()) await unlink(linkPath)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  await rm(ownedRoot, { recursive: true, force: true })
}

function yamlString(value) {
  return JSON.stringify(String(value))
}

/** 将 npm ci 已锁定的 peer 闭包打成真实 tarball，不依赖注册表元数据缓存。 */
async function packPeerFixtures(home, projectRoot, npmCli, env) {
  const manifest = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'))
  const lock = JSON.parse(await readFile(join(projectRoot, 'package-lock.json'), 'utf8'))
  const queue = Object.keys(manifest.peerDependencies ?? {})
  const seen = new Set(), directories = []
  while (queue.length) {
    const name = queue.shift()
    if (seen.has(name)) continue
    seen.add(name)
    const directory = join(projectRoot, 'node_modules', name)
    const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
    assert.equal(pkg.name, name)
    assert.equal(pkg.version, lock.packages[`node_modules/${name}`]?.version, `${name} fixture must match package-lock.json; run npm ci`)
    directories.push(directory)
    queue.push(...Object.keys(pkg.dependencies ?? {}))
    queue.push(...Object.keys(pkg.peerDependencies ?? {}).filter((peer) => pkg.peerDependenciesMeta?.[peer]?.optional !== true))
  }
  const destination = join(home, 'peer-tarballs')
  await mkdir(destination)
  const result = spawnSync(process.execPath, [npmCli, 'pack', ...directories, '--json', '--offline', '--ignore-scripts', '--pack-destination', destination], {
    cwd: home, env, encoding: 'utf8', windowsHide: true, timeout: 90_000, maxBuffer: MAX_OUTPUT,
  })
  assert.equal(result.status, 0, `packing locked peer fixtures failed: ${result.error ?? ''}\n${result.stderr}`)
  const packed = JSON.parse(result.stdout)
  assert.equal(packed.length, seen.size)
  return packed.map(({ filename }) => {
    assert.equal(filename, filename.replace(/^.*[\\/]/, ''), 'peer tarball filename must be local')
    return join(destination, filename)
  })
}

async function createProfile(home, { endpoint, apiKey, requireConfirmation = false, redactSensitive = true, projectRoot = PROJECT_ROOT, packageTarball, npmCache, reuse = false }) {
  const profile = join(home, 'profiles', 'scratch')
  const nodeModules = join(profile, 'node_modules')
  const pluginLink = join(nodeModules, 'dsh-jev-advisor')
  if (reuse) {
    await readFile(join(profile, 'package.json'))
    assert.ok(lstatSync(pluginLink), `reused DSH profile is missing the plugin entry: ${pluginLink}`)
    return { profile, pluginLink }
  }
  await mkdir(nodeModules, { recursive: true })
  await writeFile(join(profile, 'package.json'), `${JSON.stringify({
    name: 'dsh-profile-scratch',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', ...(packageTarball ? ['dsh-jev-advisor'] : [])] } },
  }, null, 2)}\n`, 'utf8')
  await writeFile(join(profile, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n', 'utf8')
  const keyLine = apiKey === undefined ? '' : `        apiKey: ${yamlString(apiKey)}\n`
  const patch = [
    '- insert:',
    '    - id: dsh-jev-advisor',
    '      name: dsh-jev-advisor',
    '      config:',
    keyLine.trimEnd(),
    `        endpoint: ${yamlString(endpoint)}`,
    '        model: jev-latest',
    '        enabled: true',
    '        includeTranscript: false',
    `        requireConfirmation: ${requireConfirmation === true}`,
    `        redactSensitive: ${redactSensitive !== false}`,
    '        transcriptMessages: 0',
    '        timeoutMs: 30000',
    '',
  ].filter((line, index) => !(index === 4 && line === '')).join('\n')
  const overrides = [{ id: 'dsh-jev-advisor', config: {
    ...(apiKey === undefined ? {} : { apiKey }), endpoint, model: 'jev-latest', enabled: true,
    includeTranscript: false, requireConfirmation, redactSensitive, transcriptMessages: 0, timeoutMs: 30000,
  } }]
  await writeFile(join(profile, 'cordis.patch.yml'), packageTarball ? JSON.stringify(overrides, null, 2) : patch, 'utf8')
  if (packageTarball !== undefined) {
    // Peer 也来自本地真实 tarball，npm 仍校验 peer 版本；不用 legacy-peer-deps。
    const npmCli = process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
    const env = { ...process.env, npm_config_cache: npmCache ?? join(home, 'npm-cache'), npm_config_registry: 'http://127.0.0.1:1', npm_config_update_notifier: 'false' }
    const peers = await packPeerFixtures(home, projectRoot, npmCli, env)
    const result = spawnSync(process.execPath, [npmCli, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', '--omit=dev', resolve(packageTarball), ...peers], {
      cwd: profile, env, encoding: 'utf8', windowsHide: true, timeout: 90_000, maxBuffer: MAX_OUTPUT,
    })
    assert.equal(result.status, 0, `isolated tarball install failed (locked local peer fixtures): ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`)
    assert.equal(lstatSync(pluginLink).isSymbolicLink(), false, 'tarball installation must not be a link')
    return { profile, pluginLink }
  }
  // A junction keeps the test on the exact working tree under test while all
  // generated profile state remains under the random DSH_HOME temp directory.
  await symlink(projectRoot, pluginLink, process.platform === 'win32' ? 'junction' : 'dir')
  return { profile, pluginLink }
}

function waitForChildExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolveExit) => child.once('exit', resolveExit))
}

async function terminateChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  const stopped = await Promise.race([
    waitForChildExit(child).then(() => true),
    new Promise((resolveStop) => setTimeout(() => resolveStop(false), STOP_TIMEOUT_MS)),
  ])
  if (stopped) return
  if (process.platform === 'win32' && child.pid !== undefined) {
    // The PID is the process we spawned; /T only cleans up its own descendants.
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    child.kill('SIGKILL')
  }
  await Promise.race([
    waitForChildExit(child),
    new Promise((resolveStop) => setTimeout(resolveStop, STOP_TIMEOUT_MS)),
  ])
}

function parseStartupUrl(output) {
  const match = /dsh web:\s+(http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/u.exec(output)
  return match?.[1]
}

async function readJson(response) {
  const text = await response.text()
  let value
  try {
    value = text === '' ? undefined : JSON.parse(text)
  } catch {
    value = undefined
  }
  return { response, text, value }
}

/**
 * Start one real DSH Web host around the current plugin working tree.
 *
 * The returned host owns its process, mock server, DSH_HOME, and temporary
 * profile. Call `stop()` in a finally block.
 */
export async function startHost(options = {}) {
  const cli = resolveDshCli()
  try {
    await readFile(cli)
  } catch {
    throw new Error(`real DSH CLI unavailable at ${cli}; set DSH_TEST_CLI to @deepseek-ai/dsh@0.2.0-rc.2/lib/bin.js`)
  }

  const reusedHome = options.home !== undefined
  const home = reusedHome ? await realpath(resolve(options.home)) : await mkdtemp(join(tmpdir(), 'dsh-jev-host-'))
  if (reusedHome) {
    const tempRoot = await realpath(tmpdir())
    assert.ok(isPathInside(home, tempRoot), `refusing to use non-temporary harness path: ${home}`)
  }
  const mock = options.mock ?? await createMockTypeSafeServer({ port: 0 })
  let profile
  let child
  let stdout = ''
  let stderr = ''
  const cleanupLinks = []
  try {
    profile = await createProfile(home, {
      endpoint: options.endpoint ?? mock.url,
      apiKey: options.apiKey,
      requireConfirmation: options.requireConfirmation,
      redactSensitive: options.redactSensitive,
      projectRoot: options.projectRoot ?? PROJECT_ROOT,
      packageTarball: options.packageTarball,
      npmCache: options.npmCache,
      reuse: reusedHome,
    })
    cleanupLinks.push(profile.pluginLink)
    child = spawn(process.execPath, [
      '--expose-internals',
      cli,
      '--profile', 'scratch',
      '--port', '0',
      '--no-open',
    ], {
      cwd: options.cwd ?? (options.packageTarball ? profile.profile : PROJECT_ROOT),
      env: { ...process.env, DSH_HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => { stdout = appendBounded(stdout, chunk) })
    child.stderr?.on('data', (chunk) => { stderr = appendBounded(stderr, chunk) })

    const startedAt = Date.now()
    let startupUrl
    while (startupUrl === undefined) {
      startupUrl = parseStartupUrl(stdout)
      if (startupUrl !== undefined) break
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`real DSH host exited before binding (exit=${String(child.exitCode)} signal=${String(child.signalCode)})\nstdout:\n${stdout}\nstderr:\n${stderr}`)
      }
      if (Date.now() - startedAt > STARTUP_TIMEOUT_MS) {
        throw new Error(`real DSH host did not bind within ${String(STARTUP_TIMEOUT_MS)}ms\nstdout:\n${stdout}\nstderr:\n${stderr}`)
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100))
    }

    const parsed = new URL(startupUrl)
    const baseUrl = `${parsed.origin}`
    const rootResponse = await fetch(startupUrl, { redirect: 'manual', headers: { origin: baseUrl } })
    await rootResponse.arrayBuffer()
    const cookie = (rootResponse.headers.getSetCookie?.() ?? [])
      .map((entry) => entry.split(';', 1)[0])
      .filter(Boolean)
      .join('; ')

    const host = {
      cli,
      home,
      profile: profile.profile,
      pluginLink: profile.pluginLink,
      mock,
      child,
      baseUrl,
      origin: baseUrl,
      token: parsed.searchParams.get('token'),
      cookie,
      stdout: () => stdout,
      stderr: () => stderr,
      async request(path, requestOptions = {}) {
        const headers = new Headers(requestOptions.headers)
        headers.set('origin', requestOptions.origin ?? baseUrl)
        if (cookie !== '') headers.set('cookie', cookie)
        let body = requestOptions.body
        if (body !== undefined && typeof body !== 'string' && !(body instanceof Uint8Array)) {
          body = JSON.stringify(body)
          if (!headers.has('content-type')) headers.set('content-type', 'application/json')
        }
        return readJson(await fetch(`${baseUrl}${path}`, {
          method: requestOptions.method ?? 'GET',
          headers,
          body,
          redirect: 'manual',
        }))
      },
      /**
       * 调用 ConfigFormController 使用的官方 settings Remote 信封。
       * 辅助器因此可以在真实宿主测试中复用 configForms.mutate 的线路契约，
       * 而不触碰宿主私有 API。
       */
      async settingsDescribe() {
        const result = await this.request('/api/settings/describe', {
          method: 'POST',
          body: {
            type: 'client-request', rpcId: randomUUID(), method: 'settings/describe', payload: { args: {} },
          },
        })
        assert.equal(result.response.status, 200, `settings/describe: expected HTTP 200, got ${String(result.response.status)} body=${result.text}`)
        assert.equal(result.value?.result?.ok, true, `settings/describe failed: ${result.text}`)
        return result.value.result.value
      },
      async settingsMutate(ns, ops, expectedRevision) {
        const result = await this.request('/api/settings/mutate', {
          method: 'POST',
          body: {
            type: 'client-request', rpcId: randomUUID(), method: 'settings/mutate',
            payload: { args: { ns, ops, expectedRevision } },
          },
        })
        assert.equal(result.response.status, 200, `settings/mutate: expected HTTP 200, got ${String(result.response.status)} body=${result.text}`)
        assert.equal(result.value?.result?.ok, true, `settings/mutate failed: ${result.text}`)
        return result.value.result.value
      },
      async stop() {
        await terminateChild(child)
        if (options.mock === undefined) await mock.close()
        if (options.keepHome !== true) await removeHarnessDirectory(home, cleanupLinks)
      },
    }
    return host
  } catch (error) {
    if (child !== undefined) await terminateChild(child)
    if (options.mock === undefined) await mock.close().catch(() => {})
    // 启动失败时调用方拿不到 host.stop()；即使 keepHome 也必须回收失败夹具。
    await removeHarnessDirectory(home, cleanupLinks).catch(() => {})
    throw error
  }
}

/** Run one request and surface diagnostics for an unexpected HTTP envelope. */
export async function expectJson(host, path, options, status) {
  const result = await host.request(path, options)
  assert.equal(result.response.status, status, `${path}: expected HTTP ${String(status)}, got ${String(result.response.status)} body=${result.text}`)
  assert.ok(result.value !== undefined, `${path}: expected JSON body, got ${result.text}`)
  return result.value
}

export { PROJECT_ROOT }
