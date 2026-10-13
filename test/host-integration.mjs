import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ACCEPTED_KEY, createMockTypeSafeServer } from './mock-typesafe.mjs'
import { expectJson, startHost } from './helpers/host-harness.mjs'

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
