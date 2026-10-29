import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { test } from 'node:test'
import { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import * as product from '../lib/index.js'

import { ACCEPTED_KEY, createMockTypeSafeServer } from './mock-typesafe.mjs'
import { expectJson, removeHarnessDirectory, startHost } from './helpers/host-harness.mjs'

const questions = [
  {
    id: 'mode',
    question: 'Which mode should I use?',
    header: 'Choose Mode',
    options: [
      { label: 'Fast (Recommended)', description: 'Fewer checks.' },
      { label: 'Thorough', description: 'More verification.' },
    ],
  },
  {
    id: 'checks',
    question: 'Which checks should run?',
    multiSelect: true,
    options: [
      { label: 'lint' },
      { label: 'typecheck' },
      { label: 'tests' },
    ],
  },
]

const binding = {
  requestId: 'request-real-host-1',
  sessionId: 'session-real-host-1',
  interactionKey: 'interaction-real-host-1',
  questions,
  decisionPreference: '优先稳定，尽量少改代码',
}

const HOST_ROUTE_SUFFIXES = ['/status', '/test', '/prepare', '/advise']

/**
 * 创建不依赖 Desktop UI 的最小宿主：直接调用真实 product.apply，记录
 * webServer.register 返回的卸载器，并让每次挂载拥有独立的路由表。
 */
function createProductMount() {
  const routes = new Map()
  const registrations = []
  const effects = []
  let destroyed = false
  const settings = { apiKey: ACCEPTED_KEY, includeTranscript: false, requireConfirmation: false }
  const ctx = {
    get: () => undefined,
    inject: () => {},
    effect(callback) {
      const cleanup = callback()
      if (typeof cleanup === 'function') effects.push(cleanup)
      return cleanup
    },
    webServer: {
      register({ path, handler }) {
        assert.equal(routes.has(path), false, `duplicate route registration: ${path}`)
        const registration = { path, handler, unregisterCalls: 0 }
        registrations.push(registration)
        routes.set(path, registration)
        return () => {
          registration.unregisterCalls += 1
          assert.equal(routes.get(path), registration, `route ${path} was replaced before cleanup`)
          routes.delete(path)
        }
      },
    },
  }
  product.apply(ctx, settings)
  return {
    routes,
    registrations,
    destroy() {
      if (destroyed) return
      destroyed = true
      for (const cleanup of effects.reverse()) cleanup()
    },
  }
}

/** 让真实 HTTP handler 在测试中使用 Node 请求/响应形状，而不启动第二个进程。 */
async function invokeProductRoute(route, body) {
  const request = Readable.from([Buffer.from(JSON.stringify(body))])
  Object.assign(request, {
    method: 'POST',
    headers: { host: 'localhost:1234', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
  })
  const response = Object.assign(new EventEmitter(), {
    destroyed: false,
    writableEnded: false,
    headers: {},
    setHeader(name, value) { this.headers[name] = value },
    end(value) {
      this.value = JSON.parse(value)
      this.writableEnded = true
    },
  })
  await route(request, response)
  return response
}

test('real DSH Web host mounts Jev routes with isolated config and strict loopback policy', { timeout: 180_000 }, async () => {
  const mock = await createMockTypeSafeServer({ port: 0 })
  try {
    const host = await startHost({ mock, apiKey: ACCEPTED_KEY, requireConfirmation: true })
    try {
      // The CLI must bind its own loopback listener and expose a tokenized URL;
      // the harness obtains the browser cookie from that real root response.
      assert.match(host.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/)
      assert.match(host.token ?? '', /^[A-Za-z0-9_-]+$/)

      const getStatus = await expectJson(host, '/dsh-jev-advisor/api/status', { method: 'GET' }, 200)
      assert.equal(getStatus.ok, true)
      assert.equal(getStatus.value.hasKey, true)
      assert.equal(getStatus.value.endpoint, mock.url)
      assert.equal(getStatus.value.model, 'jev-latest')
      assert.equal(getStatus.value.requireConfirmation, true)
      assert.equal(getStatus.value.redactSensitive, true)
      assert.equal(getStatus.value.autoAdvise, false)
      assert.equal(getStatus.value.diagnostics.autoAdvise, false)
      if (process.env.DSH_TEST_VERSION === '0.2.1-rc.3') {
        assert.equal(getStatus.value.diagnostics.dshVersion, '0.2.1-rc.3', '诊断必须识别真实 rc.3 宿主解析表')
        assert.equal(getStatus.value.diagnostics.declarationMatch, 'match')
      }
      assert.equal(mock.requests.length, 0, '本地状态与诊断不调用 Jev')

      const postStatus = await expectJson(host, '/dsh-jev-advisor/api/status', {
        method: 'POST',
        body: {},
      }, 200)
      assert.deepEqual(postStatus, getStatus, 'status POST and GET expose the same live Config projection')

      const getTest = await host.request('/dsh-jev-advisor/api/test', { method: 'GET' })
      assert.equal(getTest.response.status, 405)
      assert.equal(getTest.value.error.code, 'jev/method-not-allowed')

      const nonJson = await host.request('/dsh-jev-advisor/api/test', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: '{}',
      })
      assert.equal(nonJson.response.status, 415)
      assert.equal(nonJson.value.error.code, 'jev/unsupported-media-type')

      const testConnection = await expectJson(host, '/dsh-jev-advisor/api/test', {
        method: 'POST',
        body: {},
      }, 200)
      assert.equal(testConnection.ok, true)
      assert.equal(testConnection.value.model, 'jev-mock-1.0.0')

      const getAdvise = await host.request('/dsh-jev-advisor/api/advise', { method: 'GET' })
      assert.equal(getAdvise.response.status, 405)
      assert.equal(getAdvise.value.error.code, 'jev/method-not-allowed')

      const wrongOrigin = await host.request('/dsh-jev-advisor/api/status', {
        method: 'GET',
        origin: host.origin.replace('127.0.0.1', '127.0.0.2'),
      })
      assert.equal(wrongOrigin.response.status, 403)
      assert.equal(wrongOrigin.value.error.code, 'jev/forbidden')

      const preview = await expectJson(host, '/dsh-jev-advisor/api/prepare', { method: 'POST', body: binding }, 200)
      assert.deepEqual(preview.value.binding, binding)
      assert.equal(mock.requests.length, 1, '本地预览不得调用评估端点')
      const withoutConfirmation = await host.request('/dsh-jev-advisor/api/advise', { method: 'POST', body: binding })
      assert.equal(withoutConfirmation.response.status, 409)
      assert.equal(withoutConfirmation.value.error.code, 'jev/confirmation-required')

      const advised = await expectJson(host, '/dsh-jev-advisor/api/advise', {
        method: 'POST',
        body: { ...binding, previewToken: preview.value.previewToken },
      }, 200)
      assert.equal(advised.ok, true)
      assert.deepEqual(advised.value.binding, binding, 'Host echoes the browser binding exactly')
      assert.equal(advised.value.model, 'jev-mock-1.0.0')
      assert.equal(advised.value.advice[0].pick.label, 'Fast (Recommended)')
      assert.deepEqual(advised.value.advice[1].picks.map((pick) => pick.label), ['lint', 'tests'])

      assert.equal(mock.requests.length, 2, 'only /test and /advise reached the local TypeSafe double')
      assert.deepEqual(mock.requests[1].body, preview.value.request, '确认发送使用预览的精确快照')
      assert.equal(mock.requests[1].body.state.decisionPreference, binding.decisionPreference)
      assert.equal(advised.value.privacy.requestBytes, Buffer.byteLength(JSON.stringify(mock.requests[1].body)))
      assert.equal(mock.requests[0].body.model, 'jev-latest')
      assert.equal(mock.requests[1].body.state.context, '(no conversation context provided)')
      assert.deepEqual(Object.keys(mock.requests[1].body.questions), [
        'decision_0',
        'decision_1_opt_0',
        'decision_1_opt_1',
        'decision_1_opt_2',
      ])

      const malformed = await host.request('/dsh-jev-advisor/api/advise', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      })
      assert.equal(malformed.response.status, 400)
      assert.equal(malformed.value.error.code, 'jev/bad-request')
    } finally {
      await host.stop()
    }

    // A fresh scratch profile with a genuinely wrong key must reach the
    // upstream mock and surface its 401 as the plugin's 502 HTTP error.
    const badKeyHost = await startHost({ mock, apiKey: 'jev-actually-wrong-key' })
    try {
      const badStatus = await expectJson(badKeyHost, '/dsh-jev-advisor/api/status', { method: 'GET' }, 200)
      assert.equal(badStatus.value.hasKey, true)
      const badKey = await badKeyHost.request('/dsh-jev-advisor/api/advise', {
        method: 'POST',
        body: { ...binding, requestId: 'request-bad-key', questions: [questions[0]] },
      })
      assert.equal(badKey.response.status, 502)
      assert.equal(badKey.value.ok, false)
      assert.equal(badKey.value.error.code, 'jev/http-error')
      assert.match(badKey.value.error.message, /401/)
    } finally {
      await badKeyHost.stop()
    }

    // A missing key remains a distinct, local configuration error (409), so a
    // test cannot accidentally pass while still using the accepted mock key.
    const missingKeyHost = await startHost({ mock })
    try {
      const missingStatus = await expectJson(missingKeyHost, '/dsh-jev-advisor/api/status', { method: 'GET' }, 200)
      assert.equal(missingStatus.value.hasKey, false)
      const missingKey = await missingKeyHost.request('/dsh-jev-advisor/api/test', {
        method: 'POST',
        body: {},
      })
      assert.equal(missingKey.response.status, 409)
      assert.equal(missingKey.value.ok, false)
      assert.equal(missingKey.value.error.code, 'jev/missing-key')
    } finally {
      await missingKeyHost.stop()
    }
  } finally {
    await mock.close()
  }
})

test('real DSH settings Remote persists volatile card layout across a process restart without invalidating a preview', { timeout: 240_000 }, async () => {
  const mock = await createMockTypeSafeServer({ port: 0 })
  let host
  let retainedHome
  let retainedPluginLink
  try {
    // keepHome 是有意设置的：下一次 startHost 会复用同一个随机 DSH_HOME，
    // 从而证明 profile 持久化，而不是重新创建测试夹具。
    host = await startHost({ mock, apiKey: ACCEPTED_KEY, requireConfirmation: true, keepHome: true })
    retainedHome = host.home
    retainedPluginLink = host.pluginLink
    const described = await host.settingsDescribe()
    const namespace = described.namespaces.find((row) => row.ns === 'dsh-jev-advisor')
    assert.ok(namespace, 'settings Remote serves the installed plugin namespace')
    assert.equal(namespace.value.cardDock, '')
    assert.equal(namespace.value.cardCollapsed, false)
    assert.equal(namespace.value.autoAdvise, false, '升级缺省采用按需')

    const binding = {
      requestId: 'layout-restart-request', sessionId: 'layout-restart-session', interactionKey: 'layout-restart-question',
      questions: [{ id: 'mode', question: 'Layout restart?', options: [{ label: 'Fast' }, { label: 'Thorough' }] }],
    }
    const prepared = await expectJson(host, '/dsh-jev-advisor/api/prepare', { method: 'POST', body: binding }, 200)
    const updated = await host.settingsMutate('dsh-jev-advisor', [
      { op: 'set', path: ['cardDock'], value: 'right' },
      { op: 'set', path: ['cardCollapsed'], value: true },
    ], namespace.revision)
    assert.equal(updated.value.cardDock, 'right')
    assert.equal(updated.revision, namespace.revision + 1, '成功 CAS 写入只推进本 namespace 的一条修订')
    assert.equal(updated.value.cardCollapsed, true)
    assert.equal(updated.user.cardDock, 'right')
    assert.equal(updated.user.cardCollapsed, true)

    // 预览指纹有意排除 volatile 布局字段；settings Remote 变更后原 token 仍应有效。
    const advised = await expectJson(host, '/dsh-jev-advisor/api/advise', {
      method: 'POST', body: { ...binding, previewToken: prepared.value.previewToken },
    }, 200)
    assert.equal(advised.ok, true)
    assert.equal(advised.value.advice[0].pick.label, 'Fast')
    assert.equal(mock.requests.length, 1, 'only the confirmed advise reached the mock upstream')

    const optedIn = await host.settingsMutate('dsh-jev-advisor', [
      { op: 'set', path: ['autoAdvise'], value: true },
    ], updated.revision)
    assert.equal(optedIn.value.autoAdvise, true)
    const optedStatus = await expectJson(host, '/dsh-jev-advisor/api/status', { method: 'GET' }, 200)
    assert.equal(optedStatus.value.autoAdvise, true)
    assert.equal(optedStatus.value.diagnostics.autoAdvise, true)
    assert.equal(mock.requests.length, 1, '设置写入与健康检查不请求上游')

    // 这里是真实的进程重启，不伪称热重载；重新启动同一个 DSH_HOME/profile，
    // 必须读到已持久化的布局视图。
    await host.stop()
    host = undefined
    host = await startHost({ home: retainedHome, mock, apiKey: ACCEPTED_KEY, requireConfirmation: true })
    const restored = await host.settingsDescribe()
    const restoredNamespace = restored.namespaces.find((row) => row.ns === 'dsh-jev-advisor')
    assert.ok(restoredNamespace)
    assert.equal(restoredNamespace.value.cardDock, 'right')
    assert.equal(restoredNamespace.value.cardCollapsed, true)
    assert.equal(restoredNamespace.user.cardDock, 'right')
    assert.equal(restoredNamespace.user.cardCollapsed, true)
    assert.equal(restoredNamespace.value.autoAdvise, true, '明确开启的自动模式跨重启保留')
    const status = await expectJson(host, '/dsh-jev-advisor/api/status', { method: 'GET' }, 200)
    assert.equal(status.value.model, 'jev-latest')
    assert.equal(status.value.autoAdvise, true)
  } finally {
    if (host !== undefined) await host.stop().catch(() => {})
    if (retainedHome !== undefined) await removeHarnessDirectory(retainedHome, retainedPluginLink === undefined ? [] : [retainedPluginLink]).catch(() => {})
    await mock.close()
  }
})

test('real product.apply effect cleanup unregisters routes, invalidates previews, and cancels in-flight evaluations', { timeout: 30_000 }, async () => {
  const expectedPaths = HOST_ROUTE_SUFFIXES.map((suffix) => `/dsh-jev-advisor/api${suffix}`).sort()
  const originalFetch = globalThis.fetch
  const first = createProductMount()
  let second
  let fetchStartedResolve
  const fetchStarted = new Promise((resolve) => { fetchStartedResolve = resolve })
  let upstreamSignal
  let pendingEvaluation
  try {
    // 首次挂载必须只注册四条公开路由，且预览由真实 host apply 创建。
    assert.deepEqual([...first.routes.keys()].sort(), expectedPaths)
    assert.equal(first.registrations.length, 4)
    const prepared = await invokeProductRoute(first.routes.get('/dsh-jev-advisor/api/prepare').handler, binding)
    assert.equal(prepared.statusCode, 200)
    assert.equal(typeof prepared.value.value.previewToken, 'string')

    // 让评估停在真实 transport 的 fetch 上，随后由 effect 清理取消它。
    globalThis.fetch = (_url, options) => {
      upstreamSignal = options.signal
      fetchStartedResolve()
      return new Promise(() => {})
    }
    pendingEvaluation = invokeProductRoute(first.routes.get('/dsh-jev-advisor/api/advise').handler, {
      ...binding,
      requestId: 'cleanup-in-flight',
    })
    await fetchStarted

    first.destroy()
    assert.equal(first.routes.size, 0, 'unmount removes all four route registrations')
    assert.deepEqual(first.registrations.map((entry) => entry.unregisterCalls), [1, 1, 1, 1])
    assert.equal(upstreamSignal?.aborted, true, 'unmount aborts the shared in-flight evaluation')
    const cancelled = await pendingEvaluation
    assert.equal(cancelled.statusCode, 499)
    assert.equal(cancelled.value.error.code, 'jev/cancelled')

    // 第二次挂载得到全新的 pool/map：旧 token 不可跨生命周期复用，且不会重复注册路由。
    second = createProductMount()
    assert.deepEqual([...second.routes.keys()].sort(), expectedPaths)
    assert.equal(new Set(second.routes.keys()).size, 4)
    assert.equal(second.registrations.length, 4)
    const stale = await invokeProductRoute(second.routes.get('/dsh-jev-advisor/api/advise').handler, {
      ...binding,
      previewToken: prepared.value.value.previewToken,
    })
    assert.equal(stale.statusCode, 409)
    assert.equal(stale.value.error.code, 'jev/preview-invalid')

    second.destroy()
    assert.equal(second.routes.size, 0, 'the remounted host also unregisters all four routes')
    assert.deepEqual(second.registrations.map((entry) => entry.unregisterCalls), [1, 1, 1, 1])
  } finally {
    globalThis.fetch = originalFetch
    first.destroy()
    second?.destroy()
  }
})

test('failed startHost always removes a keepHome fixture when the child exits before binding', { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-jev-failed-start-'))
  const profile = join(home, 'profiles', 'scratch')
  const pluginLink = join(profile, 'node_modules', 'dsh-jev-advisor')
  const fakeCli = join(home, 'fake-dsh-cli.js')
  const previousCli = process.env.DSH_TEST_CLI
  const previousVersion = process.env.DSH_TEST_VERSION
  try {
    // 复用模式要求 profile 已存在；伪 CLI 只用于让真实 spawn 尽早失败，
    // 不启动 Desktop，也不需要真实插件依赖或网络服务。
    await mkdir(pluginLink, { recursive: true })
    await writeFile(join(profile, 'package.json'), '{}\n', 'utf8')
    await writeFile(fakeCli, 'process.stderr.write("intentional harness startup failure\\n"); process.exit(23)\n', 'utf8')
    process.env.DSH_TEST_CLI = fakeCli
    delete process.env.DSH_TEST_VERSION

    await assert.rejects(
      startHost({ home, keepHome: true, mock: { url: 'http://127.0.0.1:1' } }),
      (error) => {
        assert.match(error.message, /exited before binding/)
        assert.match(error.message, /exit=23/)
        return true
      },
    )
    assert.equal(existsSync(home), false, 'failed startup removes the keepHome fixture because no host was returned')
  } finally {
    if (previousCli === undefined) delete process.env.DSH_TEST_CLI
    else process.env.DSH_TEST_CLI = previousCli
    if (previousVersion === undefined) delete process.env.DSH_TEST_VERSION
    else process.env.DSH_TEST_VERSION = previousVersion
    // 启动异常前若夹具尚未被 helper 回收，测试自身仍只清理随机 Temp 根。
    if (existsSync(home)) await removeHarnessDirectory(home, [pluginLink]).catch(() => {})
  }
})
