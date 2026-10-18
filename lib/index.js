/**
 * dsh-jev-advisor — Host half.
 *
 * When the model hands the user a multiple-choice question (`ask_user_question`
 * -> `ctx.userQuestions`), the browser half asks this half for a Jev (TypeSafe
 * System One) opinion. This half owns everything that must not live in the
 * browser:
 *
 * - the API key and the other connection settings. There is no private settings
 *   namespace anymore: the plugin's own `Config` IS the settings schema, every
 *   user-facing field is marked `.volatile()`, and the DSH settings service
 *   projects them into an editable form keyed by this plugin's profile entry id
 *   (`dsh-jev-advisor`). Edits persist through the current profile's Cordis
 *   patch. The browser writes through `ctx.configForms`; this half reads the
 *   live values with `config.<field>.get()` at request time;
 * - the session transcript used as Jev's `state`, read from `ctx.sessions`;
 * - the outbound HTTPS call to the TypeSafe evaluation endpoint;
 * - 四条仅限回环的 JSON 路由：status、test、prepare、advise；
 *   浏览器通过同源 fetch 读取本地预览或请求评估。
 *
 * The plugin never answers a question on its own: it only produces advice. The
 * human still presses the button.
 *
 * @module dsh-jev-advisor
 */

import z from '@deepseek-ai/schemastery'
import { isIP } from 'node:net'
import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

/** Plugin identity for cordis rows and diagnostics. */
export const name = 'dsh-jev-advisor'

/**
 * Required host services. `webServer` carries the four routes. The settings
 * service is optional: it is only contacted through `ctx.inject` below to opt
 * the auto-generated form out, so a profile without it still boots and reads
 * the composition config.
 */
export const inject = ['webServer']

/** Route prefix owned by this plugin. Exact routes are matched before prefixes. */
const ROUTE_PREFIX = '/dsh-jev-advisor/api'

/** Default TypeSafe evaluation endpoint and model alias. */
const DEFAULT_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const DEFAULT_MODEL = 'jev-latest'

/** Synthetic Choice option that lets Jev say "none of the listed options fits". */
const NONE_KEY = '__none_of_the_above__'

/** Rough ceiling on the `state` we are willing to send (Jev allows 32k for state + longest question). */
const MAX_STATE_CHARS = 24000

/**
 * The plugin's configuration — and, since DSH dropped the separate settings
 * namespace API, its settings schema too. The settings service projects every
 * `.volatile()` field into an editable form keyed by this plugin's profile
 * entry id; `apply(ctx, config)` receives the live values as `Volatile`
 * wrappers read with `.get()`.
 *
 * `apiKey` carries `role('secret')`, so the settings wire strips it from every
 * read: the browser can write it and learn whether one is stored (via
 * `/dsh-jev-advisor/api/status`), but never reads the value back.
 */
export const Config = z.object({
  apiKey: z.string().role('secret').default('').volatile(),
  endpoint: z.string().default(DEFAULT_ENDPOINT).volatile(),
  model: z.string().default(DEFAULT_MODEL).volatile(),
  enabled: z.boolean().default(true).volatile(),
  includeTranscript: z.boolean().default(true).volatile(),
  requireConfirmation: z.boolean().default(false).volatile(),
  redactSensitive: z.boolean().default(true).volatile(),
  transcriptMessages: z.number().step(1).min(0).max(100).default(12).volatile(),
  timeoutMs: z.number().step(1).min(1000).max(180000).default(30000).volatile(),
  // 空值用于识别尚未从旧版浏览器存储迁移的 profile。
  cardDock: z.union(['', 'left', 'right']).default('').volatile(),
  cardCollapsed: z.boolean().default(false).volatile(),
})

/** Failure with a stable code, surfaced verbatim to the browser half. */
class JevError extends Error {
  constructor(code, message, options) {
    super(message, options)
    this.name = 'JevError'
    this.code = code
  }
}

/* ------------------------------------------------------------------ *
 * Request construction
 * ------------------------------------------------------------------ */

/** JSON 对象，不接受数组或空值。 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 状态接口只展示端点位置，不回显 URL 中的登录凭据。 */
function publicEndpoint(endpoint) {
  try {
    const url = new URL(endpoint)
    url.username = ''
    url.password = ''
    return url.href
  } catch { return '(invalid endpoint)' }
}

/** 概率及置信度必须是 [0, 1] 范围内的有限数字。 */
function isProbability(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

/** 缺省置信度合法；显式提供的置信度必须通过校验。 */
function validConfidence(answer) {
  return !Object.hasOwn(answer, 'confidence') || isProbability(answer.confidence)
}

/** 原始题目 ID 必须唯一，避免响应回映时覆盖同批次的其他题目。 */
function validateQuestionIds(questions) {
  const ids = new Set()
  for (const question of questions) {
    if (!isRecord(question) || typeof question.id !== 'string' || question.id.trim() === '' || ids.has(question.id)) {
      throw new JevError('jev/bad-request', 'question ids must be non-empty and unique within a batch')
    }
    ids.add(question.id)
  }
}

/** 按标签提交答案，因此重复或无效的选项标签不能进入映射。 */
function validateOptions(options) {
  if (!Array.isArray(options) || options.length === 0 || !options.every((option) =>
    isRecord(option) && typeof option.label === 'string' && option.label.trim() !== '',
  ) || new Set(options.map((option) => option.label)).size !== options.length) {
    throw new JevError('jev/bad-request', 'option labels must be non-empty and unique within a question')
  }
}

/** Collapse one option description into the single line a Choice rubric wants. */
function rubricFor(label, description) {
  const text = typeof description === 'string' ? description.trim() : ''
  if (text === '') return label
  return `${label} — ${text}`
}

/** Strip the conventional recommendation suffix without changing the answer value. */
function displayLabel(label) {
  return label.replace(/\s*\((?:recommended|推荐)\)\s*$/iu, '').trim() || label
}

/**
 * Normalize one wire question into the shape both halves agree on.
 * @param value - one `AskUserQuestionRequest.questions` entry.
 * @returns The normalized question, or `undefined` when it has no usable options.
 */
function normalizeQuestion(value) {
  if (typeof value !== 'object' || value === null) return undefined
  const id = typeof value.id === 'string' ? value.id : undefined
  const question = typeof value.question === 'string' ? value.question : undefined
  if (id === undefined || question === undefined) return undefined
  const rawOptions = Array.isArray(value.options) ? value.options : []
  if (rawOptions.length > 0) validateOptions(rawOptions)
  const options = []
  for (const option of rawOptions) {
    if (typeof option !== 'object' || option === null) continue
    if (typeof option.label !== 'string' || option.label.trim() === '') continue
    options.push({
      label: option.label,
      description: typeof option.description === 'string' ? option.description : undefined,
    })
  }
  if (options.length === 0) return undefined
  return {
    id,
    question,
    header: typeof value.header === 'string' ? value.header : undefined,
    detail: typeof value.detail === 'string' ? value.detail : undefined,
    multiSelect: value.multiSelect === true,
    options,
  }
}

/**
 * Build the Jev `state`, the typed `questions` map, and the plan that maps a
 * Jev answer back onto the option the user would click.
 *
 * Single-choice questions become one `choice` question whose criteria carry
 * every option plus a synthetic "none of the above". Multi-select questions
 * become one `noul` question per option, because Jev has no multi-label
 * primitive — this is the documented speculative fan-out.
 *
 * @param questions - normalized pending questions.
 * @param transcript - optional conversation text used as shared context.
 * @returns `{ state, questions, plan }`.
 */
export function buildJevRequest(questions, transcript) {
  validateQuestionIds(questions)
  const state = { context: transcript === '' ? '(no conversation context provided)' : transcript, decisions: [] }
  const jevQuestions = {}
  const plan = []

  questions.forEach((question, decisionIndex) => {
    validateOptions(question.options)
    const decision = {
      id: question.id,
      header: question.header ?? null,
      question: question.question,
      detail: question.detail ?? null,
      multiSelect: question.multiSelect,
      options: question.options.map((option) => ({ label: option.label, description: option.description ?? null })),
    }
    state.decisions.push(decision)

    const where = `decisions[${String(decisionIndex)}]`
    // 评估键只由批次索引生成，不复用用户 ID，避免跨题及特殊属性名冲突。
    const answerKey = `decision_${String(decisionIndex)}`
    if (question.multiSelect) {
      const keys = question.options.map((_, index) => `${answerKey}_opt_${String(index)}`)
      question.options.forEach((option, index) => {
        jevQuestions[keys[index]] = {
          type: 'noul',
          instructions: `Considering \`context\`, should the option \`${where}.options[${String(index)}]\` be selected as part of the best answer to the decision stated in \`${where}.question\`?`,
          criteria: {
            true: `\`${where}.options[${String(index)}]\` belongs in the best answer.`,
            false: `\`${where}.options[${String(index)}]\` does not belong in the best answer.`,
          },
        }
      })
      plan.push({ id: question.id, kind: 'noul-set', options: question.options, keys })
      return
    }

    const keys = question.options.map((_, index) => `opt_${String(index)}`)
    const criteria = {}
    question.options.forEach((option, index) => {
      criteria[keys[index]] = rubricFor(displayLabel(option.label), option.description)
    })
    criteria[NONE_KEY] = 'None of the listed options fits the situation; the decision needs something else.'
    jevQuestions[answerKey] = {
      type: 'choice',
      instructions: `Considering \`context\`, which option in \`${where}.options\` is the best answer to the decision stated in \`${where}.question\`? Weigh what serves the user's goal and the ongoing task best. Choose \`${NONE_KEY}\` only when no listed option fits.`,
      criteria,
    }
    plan.push({ id: question.id, answerKey, kind: 'choice', options: question.options, keys, noneKey: NONE_KEY })
  })

  return { state, questions: jevQuestions, plan }
}

/** 仅处理常见凭证模式，不承诺发现所有个人信息或秘密。 */
function redactCredentials(value, stats) {
  if (typeof value === 'string') {
    const mask = () => { stats.count += 1; return '[REDACTED]' }
    return value
      .replace(/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/g, mask)
      .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, () => `Bearer ${mask()}`)
      .replace(/(\b(?:api[_-]?key|access[_-]?token|password|secret|token)\b["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;&}\]]+)/gi, (_all, prefix) => `${prefix}${mask()}`)
      .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, mask)
      .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, (_all, protocol) => `${protocol}${mask()}@`)
  }
  if (Array.isArray(value)) return value.map((entry) => redactCredentials(entry, stats))
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactCredentials(entry, stats)]))
  return value
}

/** 临时偏好不进入持久配置，限制长度以避免意外扩大请求。 */
function validateDecisionPreference(value) {
  if (value !== undefined && (typeof value !== 'string' || value.length > 500)) {
    throw new JevError('jev/bad-request', 'decisionPreference must be a string of at most 500 characters')
  }
}

/** 先脱敏，再按完整 JSON 的 UTF-8 字节预算缩减上下文；题目不截断。 */
export function prepareJevRequest({ questions, transcript = '', model = DEFAULT_MODEL, redactSensitive = true, maxBytes = 64 * 1024, decisionPreference = '' }) {
  validateDecisionPreference(decisionPreference)
  const built = buildJevRequest(questions, transcript)
  const stats = { count: 0 }
  const body = { state: built.state, model, questions: built.questions }
  const preference = decisionPreference.trim()
  if (preference !== '') {
    body.state.decisionPreference = preference
    for (const question of Object.values(body.questions)) {
      question.instructions += ' Weigh the user-provided `decisionPreference` when comparing options, without changing the available options or answer format.'
    }
  }
  if (redactSensitive) {
    body.state = redactCredentials(body.state, stats)
    body.questions = redactCredentials(body.questions, stats)
  }
  const bytes = () => Buffer.byteLength(JSON.stringify(body), 'utf8')
  let truncated = false
  let includedTranscript = transcript !== ''
  // 先处理完整消息，再截尾；否则截断可能剥掉 password= 或私钥头，泄露剩余片段。
  const context = Array.from(body.state.context)
  if (includedTranscript && context.length > MAX_STATE_CHARS) {
    body.state.context = `…${context.slice(-MAX_STATE_CHARS).join('')}`
    truncated = true
  }
  if (bytes() > maxBytes) {
    const context = Array.from(body.state.context)
    body.state.context = '(no conversation context provided)'
    if (bytes() > maxBytes) throw new JevError('jev/request-too-large', 'the questions or decision preference exceed the 64 KiB request budget; shorten the questions, options or preference')
    let low = 0
    let high = transcript === '' ? 0 : context.length
    while (low < high) {
      const mid = Math.ceil((low + high) / 2)
      body.state.context = `…${context.slice(-mid).join('')}`
      if (bytes() <= maxBytes) low = mid
      else high = mid - 1
    }
    body.state.context = low === 0 ? '(no conversation context provided)' : `…${context.slice(-low).join('')}`
    includedTranscript = low > 0
    truncated = true
  }
  return { body, plan: built.plan, privacy: {
    includedTranscript, contextChars: includedTranscript ? Array.from(body.state.context).length : 0,
    redactions: stats.count, truncated, requestBytes: bytes(),
  } }
}

/* ------------------------------------------------------------------ *
 * Jev transport
 * ------------------------------------------------------------------ */

const RESPONSE_BODY_LIMIT = 1024 * 1024
const DEFAULT_TRANSPORT_TIMEOUT_MS = 30_000
const DEFAULT_POOL_TTL_MS = 0
const DEFAULT_POOL_MAX_ENTRIES = 32

/** Construct an abort-like error for the small abortable helpers below. */
function abortError() {
  const error = new Error('operation aborted')
  error.name = 'AbortError'
  return error
}

/** Race an arbitrary promise with an AbortSignal without requiring fetch semantics. */
function abortable(value, signal) {
  if (signal === undefined || signal === null) return Promise.resolve(value)
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => signal.removeEventListener?.('abort', onAbort)
    const onAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(abortError())
    }
    signal.addEventListener?.('abort', onAbort, { once: true })
    Promise.resolve(value).then((result) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }, (error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    })
  })
}

/** Sleep for a bounded backoff delay, interruptible by the transport signal. */
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    let timer
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
    }
    const onAbort = () => {
      cleanup()
      reject(abortError())
    }
    signal?.addEventListener?.('abort', onAbort, { once: true })
    timer = setTimeout(() => {
      cleanup()
      resolve()
    }, Math.max(0, ms))
  })
}

/** Read a `retry-after` header as milliseconds, or `undefined` when absent/unusable. */
function retryAfterMs(response) {
  const raw = response?.headers?.get?.('retry-after')
  if (raw === null || raw === undefined) return undefined
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 5000)
  return undefined
}

/** Convert a response stream to UTF-8 text while enforcing the byte limit. */
async function readResponseText(response, signal, limit = RESPONSE_BODY_LIMIT) {
  const body = response?.body
  if (body !== null && body !== undefined && typeof body.getReader === 'function') {
    const reader = body.getReader()
    const chunks = []
    let bytes = 0
    let complete = false
    let cancelRequested = false

    // reader.cancel() 可能由异常流实现返回永不完成的 Promise；先附加拒绝处理，
    // 再交给 abortable 受总超时控制，避免清理路径反而把请求永久挂住。
    const cancelReader = () => {
      let pending
      try {
        pending = Promise.resolve(reader.cancel())
      } catch (error) {
        pending = Promise.reject(error)
      }
      pending.catch(() => {})
      return pending
    }

    try {
      for (;;) {
        const result = await abortable(reader.read(), signal)
        if (result.done) {
          complete = true
          break
        }
        const chunk = typeof result.value === 'string'
          ? new TextEncoder().encode(result.value)
          : result.value instanceof Uint8Array
            ? result.value
            : new Uint8Array(result.value)
        bytes += chunk.byteLength
        if (bytes > limit) {
          cancelRequested = true
          try {
            await abortable(cancelReader(), signal)
          } catch (error) {
            if (signal?.aborted) throw error
          }
          throw new JevError('jev/bad-response', 'Jev returned a response body larger than 1 MiB')
        }
        chunks.push(chunk)
      }
    } finally {
      if (!complete && !cancelRequested) {
        cancelRequested = true
        try { await abortable(cancelReader(), signal) } catch { /* 取消本身不应覆盖原始读取错误 */ }
      }
      try { reader.releaseLock() } catch { /* an already-cancelled reader is fine */ }
    }
    const all = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) {
      all.set(chunk, offset)
      offset += chunk.byteLength
    }
    return new TextDecoder().decode(all)
  }

  if (typeof response?.text !== 'function') {
    throw new JevError('jev/bad-response', 'Jev returned a response without a readable body')
  }
  const text = await abortable(Promise.resolve().then(() => response.text()), signal)
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > limit) {
    throw new JevError('jev/bad-response', 'Jev returned a response body larger than 1 MiB')
  }
  return text
}

/** Release a retry response without retaining or exposing its body. */
async function discardResponseBody(response, signal) {
  const body = response?.body
  if (body !== null && body !== undefined && typeof body.cancel === 'function') {
    try {
      await abortable(Promise.resolve().then(() => body.cancel()), signal)
      return
    } catch (error) {
      if (signal?.aborted) throw error
    }
  }
  if (typeof response?.text === 'function') {
    await abortable(Promise.resolve().then(() => response.text()), signal)
  }
}

function transportAbortError(timedOut, callerSignal) {
  if (callerSignal?.aborted) return new JevError('jev/cancelled', 'Jev request was cancelled')
  if (timedOut) return new JevError('jev/timeout', 'Jev request timed out')
  return new JevError('jev/cancelled', 'Jev request was cancelled')
}

/**
 * POST one evaluation to TypeSafe, retrying the two documented overload codes
 * with exponential backoff and honouring `retry-after`.
 *
 * @param options - endpoint, key, timeout, request body, and optional caller signal.
 * @returns The parsed JSON response body.
 * @throws {JevError} with a stable transport error code.
 */
export async function callJev({ endpoint, apiKey, timeoutMs, body, signal }) {
  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new JevError('jev/missing-key', 'no Jev API key is configured; open Settings -> Jev and save one')
  }
  if (signal?.aborted) throw new JevError('jev/cancelled', 'Jev request was cancelled')

  const controller = new AbortController()
  let timedOut = false
  const onCallerAbort = () => controller.abort()
  signal?.addEventListener?.('abort', onCallerAbort, { once: true })
  const duration = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs)
    ? Math.max(0, timeoutMs)
    : DEFAULT_TRANSPORT_TIMEOUT_MS
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, duration)

  try {
    let attempt = 0
    for (;;) {
      let response
      try {
        const request = fetch(endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey.trim()}`,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
        response = await abortable(request, controller.signal)
      } catch (error) {
        if (controller.signal.aborted || signal?.aborted) throw transportAbortError(timedOut, signal)
        throw new JevError('jev/network-error', 'could not reach Jev endpoint')
      }

      if ((response.status === 429 || response.status === 529) && attempt < 2) {
        try {
          await discardResponseBody(response, controller.signal)
          const wait = retryAfterMs(response) ?? 400 * 2 ** attempt
          attempt += 1
          await delay(wait, controller.signal)
        } catch (error) {
          if (controller.signal.aborted || signal?.aborted) throw transportAbortError(timedOut, signal)
          throw error instanceof JevError ? error : new JevError('jev/network-error', 'could not release Jev response')
        }
        continue
      }

      let text
      try {
        text = await readResponseText(response, controller.signal)
      } catch (error) {
        if (controller.signal.aborted || signal?.aborted) throw transportAbortError(timedOut, signal)
        if (error instanceof JevError) throw error
        throw new JevError('jev/bad-response', 'could not read the Jev response')
      }

      if (!response.ok) {
        // Do not echo upstream response text: it can contain credentials or user data.
        throw new JevError('jev/http-error', `Jev responded ${String(response.status)} ${response.statusText ?? ''}`.trim())
      }
      let parsed
      try {
        parsed = text === '' ? undefined : JSON.parse(text)
      } catch {
        parsed = undefined
      }
      if (!isRecord(parsed)) {
        throw new JevError('jev/bad-response', 'Jev returned a body that is not a JSON object')
      }
      return parsed
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener?.('abort', onCallerAbort)
  }
}

/**
 * Deduplicate identical in-flight evaluations and optionally retain successes
 * for a short bounded period. Each caller owns its subscription to the shared
 * upstream operation; cancellation only aborts upstream when the last caller
 * leaves.
 */
export function createEvaluationPool(options = {}) {
  const ttlMs = typeof options.ttlMs === 'number' && Number.isFinite(options.ttlMs) && options.ttlMs > 0
    ? options.ttlMs
    : DEFAULT_POOL_TTL_MS
  const maxEntries = typeof options.maxEntries === 'number' && Number.isFinite(options.maxEntries) && options.maxEntries > 0
    ? Math.floor(options.maxEntries)
    : DEFAULT_POOL_MAX_ENTRIES
  const inflight = new Map()
  const cache = new Map()

  const cancelled = () => new JevError('jev/cancelled', 'Jev evaluation was cancelled')

  const clearSubscriber = (subscriber) => {
    subscriber.signal?.removeEventListener?.('abort', subscriber.onAbort)
  }

  const cancelSubscriber = (entry, subscriber) => {
    if (subscriber.settled) return
    subscriber.settled = true
    clearSubscriber(subscriber)
    entry.subscribers.delete(subscriber)
    subscriber.reject(cancelled())
    if (!entry.settled && entry.subscribers.size === 0) {
      entry.orphaned = true
      if (inflight.get(entry.key) === entry) inflight.delete(entry.key)
      entry.controller.abort()
    }
  }

  const finish = (entry, failed, value) => {
    if (entry.settled) return
    entry.settled = true
    if (inflight.get(entry.key) === entry) inflight.delete(entry.key)
    if (!failed && !entry.orphaned && ttlMs > 0) {
      cache.delete(entry.key)
      cache.set(entry.key, { value, expiresAt: Date.now() + ttlMs })
      while (cache.size > maxEntries) cache.delete(cache.keys().next().value)
    }
    for (const subscriber of entry.subscribers) {
      if (subscriber.settled) continue
      subscriber.settled = true
      clearSubscriber(subscriber)
      if (failed) subscriber.reject(value)
      else subscriber.resolve({ value, reused: subscriber.reused })
    }
    entry.subscribers.clear()
  }

  const run = (key, factory, signal) => {
    if (typeof factory !== 'function') return Promise.reject(new TypeError('evaluation factory must be a function'))
    if (signal?.aborted) return Promise.reject(cancelled())

    const cached = cache.get(key)
    if (cached !== undefined) {
      if (cached.expiresAt > Date.now()) {
        cache.delete(key)
        cache.set(key, cached)
        return Promise.resolve({ value: cached.value, reused: true })
      }
      cache.delete(key)
    }

    let entry = inflight.get(key)
    const reused = entry !== undefined
    if (entry === undefined) {
      entry = {
        key,
        controller: new AbortController(),
        subscribers: new Set(),
        settled: false,
        orphaned: false,
      }
      // Insert before starting the factory so synchronous re-entrancy joins this call.
      inflight.set(key, entry)
      entry.promise = Promise.resolve().then(() => factory(entry.controller.signal)).then(
        (value) => finish(entry, false, value),
        (error) => finish(entry, true, error),
      )
    }

    return new Promise((resolve, reject) => {
      const subscriber = { resolve, reject, signal, reused, settled: false, onAbort: undefined }
      subscriber.onAbort = () => cancelSubscriber(entry, subscriber)
      entry.subscribers.add(subscriber)
      signal?.addEventListener?.('abort', subscriber.onAbort, { once: true })
      if (signal?.aborted) cancelSubscriber(entry, subscriber)
    })
  }

  const dispose = () => {
    cache.clear()
    for (const entry of inflight.values()) {
      entry.orphaned = true
      for (const subscriber of [...entry.subscribers]) cancelSubscriber(entry, subscriber)
      if (inflight.get(entry.key) === entry) inflight.delete(entry.key)
      entry.controller.abort()
    }
  }

  return { run, dispose }
}

/* ------------------------------------------------------------------ *
 * Answer mapping
 * ------------------------------------------------------------------ */

/**
 * Map a Jev response back onto the pending questions.
 * @param plan - the plan returned by {@link buildJevRequest}.
 * @param jevResponse - the raw Jev response.
 * @returns One advice record per pending question.
 */
export function mapAdvice(plan, jevResponse) {
  const answers = isRecord(jevResponse) && isRecord(jevResponse.answers) ? jevResponse.answers : {}
  return plan.map((entry) => {
    const unanswered = {
      questionId: entry.id, kind: entry.kind, supported: true, answered: false,
      probabilities: [], reason: 'Jev returned an incomplete or invalid answer',
    }
    if (entry.kind === 'choice') {
      const answer = answers[entry.answerKey]
      if (!isRecord(answer) || answer.type !== 'choice' || !validConfidence(answer)) {
        return unanswered
      }
      const probabilities = answer.probabilities
      const expectedKeys = [...entry.keys, entry.noneKey]
      if (!isRecord(probabilities) || !expectedKeys.every((key) => Object.hasOwn(probabilities, key) && isProbability(probabilities[key]))) {
        return unanswered
      }
      // 允许累计 1% 的舍入误差，但拒绝全零及明显未归一化的分布。
      if (Math.abs(expectedKeys.reduce((sum, key) => sum + probabilities[key], 0) - 1) > 0.010000001) return unanswered
      const chosenKey = answer.choice
      if (typeof chosenKey !== 'string' || !expectedKeys.includes(chosenKey) || probabilities[chosenKey] <= 0) return unanswered
      const distribution = entry.options.map((option, index) => ({
        index,
        label: option.label,
        probability: probabilities[entry.keys[index]],
      }))
      const noneProbability = probabilities[entry.noneKey]
      const pickIndex = entry.keys.indexOf(chosenKey)
      const pick = pickIndex < 0
        ? undefined
        : { index: pickIndex, label: entry.options[pickIndex].label, probability: distribution[pickIndex].probability }
      return {
        questionId: entry.id,
        kind: 'choice',
        supported: true,
        answered: true,
        pick,
        noneOfTheAbove: chosenKey === entry.noneKey,
        noneProbability,
        confidence: answer.confidence,
        probabilities: distribution,
      }
    }

    if (entry.kind === 'noul-set') {
      if (entry.keys.length === 0 || !entry.keys.every((key) => {
        const answer = answers[key]
        return isRecord(answer) && answer.type === 'noul' && isProbability(answer.noul) && validConfidence(answer)
      })) return { ...unanswered, picks: [] }
      const picks = []
      const distribution = entry.options.map((option, index) => {
        return { index, label: option.label, probability: answers[entry.keys[index]].noul }
      })
      for (const row of distribution) {
        if (row.probability >= 0.5) picks.push(row)
      }
      picks.sort((left, right) => right.probability - left.probability)
      return {
        questionId: entry.id,
        kind: 'noul-set',
        supported: true,
        answered: true,
        picks,
        probabilities: distribution,
      }
    }

    return { questionId: entry.id, kind: entry.kind, supported: false, reason: entry.reason }
  })
}

/* ------------------------------------------------------------------ *
 * Session transcript
 * ------------------------------------------------------------------ */

/** Pull the plain text out of one derived message. */
function messageText(message) {
  if (typeof message !== 'object' || message === null) return ''
  const content = message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const part of content) {
    if (typeof part !== 'object' || part === null) continue
    if (part.type === 'text' && typeof part.text === 'string') parts.push(part.text)
  }
  return parts.join('\n')
}

/**
 * Read the tail of a session's derived model history as plain text.
 *
 * Everything here is best effort: a missing registry, an unknown session, or a
 * throwing derivation all degrade to "no context" rather than failing the
 * request, because advice without context is still useful.
 *
 * @param ctx - host context.
 * @param sessionId - session identity supplied by the browser half.
 * @param limit - maximum number of trailing messages to include.
 * @returns Transcript text, possibly empty.
 */
function readTranscript(ctx, sessionId, limit) {
  if (typeof sessionId !== 'string' || sessionId === '' || limit <= 0) return ''
  const sessions = ctx.get('sessions')
  if (sessions === undefined || typeof sessions.get !== 'function') return ''
  let session
  try {
    session = sessions.get(sessionId)
  } catch {
    return ''
  }
  if (session === undefined || session === null || typeof session.deriveMessages !== 'function') return ''
  let messages
  try {
    messages = session.deriveMessages()
  } catch {
    return ''
  }
  if (!Array.isArray(messages)) return ''
  const lines = []
  for (const message of messages.slice(-limit)) {
    const text = messageText(message).trim()
    if (text === '') continue
    const role = typeof message.role === 'string' ? message.role : 'unknown'
    lines.push(`[${role}] ${text}`)
  }
  return lines.join('\n\n')
}

/* ------------------------------------------------------------------ *
 * HTTP plumbing
 * ------------------------------------------------------------------ */

/** Whether a normalized URL hostname names the local loopback authority. */
function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]' || hostname === '::1') return true
  const parts = hostname.split('.')
  return parts.length === 4 && parts[0] === '127' && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/** 校验真实 TCP 对端，不能用可伪造的 Host 代替连接来源。 */
function isLoopbackPeer(address) {
  if (typeof address !== 'string') return false
  if (isIP(address) === 4) return isLoopbackHostname(address)
  if (isIP(address) !== 6) return false
  const hostname = new URL(`http://[${address}]`).hostname
  if (hostname === '[::1]') return true
  const mapped = /^\[::ffff:([\da-f]+):([\da-f]+)\]$/i.exec(hostname)
  return mapped !== null && (Number.parseInt(mapped[1], 16) >>> 8) === 127
}

/**
 * Decide whether a request may reach this plugin's routes.
 *
 * The routes carry the API key's effects (an outbound call billed to the user),
 * so they accept only same-origin browser requests addressed to a loopback
 * authority. When the Connection service is mounted its own trust fence runs
 * first, so a deployment with extra trusted hosts keeps working.
 *
 * @param ctx - host context.
 * @param request - node HTTP request.
 * @returns true when the request is ours.
 */
function isTrustedRequest(ctx, request) {
  if (!isLoopbackPeer(request.socket?.remoteAddress)) return false
  const connection = ctx.get('connection')
  if (connection !== undefined && typeof connection.requestRejection === 'function') {
    if (connection.requestRejection(request) !== undefined) return false
  }
  const host = request.headers.host
  if (typeof host !== 'string' || host === '') return false
  let hostUrl
  try {
    hostUrl = new URL(`${request.socket?.encrypted === true ? 'https' : 'http'}://${host}`)
  } catch {
    return false
  }
  if (!isLoopbackHostname(hostUrl.hostname)) return false
  const fetchSite = request.headers['sec-fetch-site']
  if (fetchSite !== undefined && fetchSite !== 'same-origin' && fetchSite !== 'none') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    if (typeof origin !== 'string') return false
    const originUrl = new URL(origin)
    return originUrl.origin === hostUrl.origin && originUrl.username === '' && originUrl.password === ''
      && originUrl.pathname === '/' && originUrl.search === '' && originUrl.hash === ''
  } catch {
    return false
  }
}

/** Write one JSON response with the hardening headers the other routes use. */
function writeJson(res, statusCode, value) {
  if (res.destroyed || res.writableEnded) return
  res.statusCode = statusCode
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(JSON.stringify(value))
}

/** Write a failure envelope the browser half understands. */
function writeError(res, error) {
  const code = error instanceof JevError ? error.code : 'jev/internal-error'
  const message = error instanceof Error ? error.message : String(error)
  const statuses = { 'jev/bad-request': 400, 'jev/body-too-large': 413, 'jev/request-too-large': 413, 'jev/missing-key': 409, 'jev/disabled': 409, 'jev/confirmation-required': 409, 'jev/preview-invalid': 409, 'jev/cancelled': 499, 'jev/timeout': 504 }
  writeJson(res, statuses[code] ?? 502, {
    ok: false,
    error: { code, message },
  })
}

/** Read and parse a bounded JSON request body. */
async function readJsonBody(request, limit = 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > limit) throw new JevError('jev/body-too-large', 'request body is too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    const parsed = JSON.parse(text)
    if (!isRecord(parsed)) throw new Error('expected a JSON object')
    return parsed
  } catch {
    throw new JevError('jev/bad-request', 'request body is not valid JSON')
  }
}

/* ------------------------------------------------------------------ *
 * Plugin body
 * ------------------------------------------------------------------ */

/**
 * Mount the plugin.
 *
 * @param ctx - host context.
 * @param config - composition config from the cordis row (see {@link Config}).
 */
export function apply(ctx, config) {
  // Read a Config field that may be a `Volatile` wrapper (`.volatile()`) or a
  // plain value. Volatile fields are read fresh on every call, so a live edit
  // from the settings page takes effect on the next request without a remount.
  const read = (field, fallback) => {
    const value = field !== undefined && field !== null && typeof field.get === 'function' ? field.get() : field
    return value === undefined || value === null ? fallback : value
  }

  // This plugin ships its own Settings -> Jev page, so opt the auto-generated
  // Config form out. The schema above is still the source of editable fields;
  // this only keeps a duplicate form from rendering once an auto client ships.
  ctx.inject(['settings'], (sctx) => {
    sctx.effect(() => sctx.settings.configure({ auto: false }, ctx.fiber), 'dsh-jev-advisor: settings presentation')
  })

  /** Resolve the effective settings from the live volatile Config. */
  const resolved = () => {
    const value = {
      apiKey: read(config?.apiKey, ''),
      endpoint: read(config?.endpoint, DEFAULT_ENDPOINT),
      model: read(config?.model, DEFAULT_MODEL),
      enabled: read(config?.enabled, true),
      includeTranscript: read(config?.includeTranscript, true),
      requireConfirmation: read(config?.requireConfirmation, false),
      redactSensitive: read(config?.redactSensitive, true),
      transcriptMessages: read(config?.transcriptMessages, 12),
      timeoutMs: read(config?.timeoutMs, 30000),
    }
    return {
      apiKey: typeof value.apiKey === 'string' ? value.apiKey : '',
      endpoint: typeof value.endpoint === 'string' && value.endpoint.trim() !== '' ? value.endpoint.trim() : DEFAULT_ENDPOINT,
      model: typeof value.model === 'string' && value.model.trim() !== '' ? value.model.trim() : DEFAULT_MODEL,
      enabled: value.enabled !== false,
      includeTranscript: value.includeTranscript !== false,
      requireConfirmation: value.requireConfirmation === true,
      redactSensitive: value.redactSensitive !== false,
      transcriptMessages: typeof value.transcriptMessages === 'number' ? value.transcriptMessages : 12,
      timeoutMs: typeof value.timeoutMs === 'number' ? value.timeoutMs : 30000,
    }
  }

  const handler = (method, allowGet = false) => async (request, response) => {
    if (!isTrustedRequest(ctx, request)) {
      writeJson(response, 403, { ok: false, error: { code: 'jev/forbidden', message: 'forbidden' } })
      return
    }
    if (request.method !== 'POST' && !(allowGet && request.method === 'GET')) {
      response.setHeader('allow', allowGet ? 'GET, POST' : 'POST')
      writeJson(response, 405, { ok: false, error: { code: 'jev/method-not-allowed', message: 'method not allowed' } })
      return
    }
    // 付费请求只接受 JSON POST，拒绝表单及不触发预检的跨站正文格式。
    const contentType = request.headers['content-type']
    if (request.method === 'POST' && (typeof contentType !== 'string' || contentType.split(';')[0].trim().toLowerCase() !== 'application/json')) {
      writeJson(response, 415, { ok: false, error: { code: 'jev/unsupported-media-type', message: 'content-type must be application/json' } })
      return
    }
    const controller = new AbortController()
    const abort = () => controller.abort()
    const close = () => { if (!response.writableEnded) abort() }
    request.once?.('aborted', abort)
    response.once?.('close', close)
    if (request.aborted || response.destroyed) abort()
    try {
      await method(request, response, controller.signal)
    } catch (error) {
      if (error instanceof JevError) {
        writeError(response, error)
        return
      }
      ctx.logger?.warn?.(`dsh-jev-advisor: ${method.name || 'route'} failed: ${error instanceof Error ? error.message : String(error)}`)
      writeError(response, error)
    } finally {
      request.off?.('aborted', abort)
      response.off?.('close', close)
    }
  }

  /** Report connection facts the settings page needs without exposing the key. */
  const status = handler(async (_request, response) => {
    const settings = resolved()
    writeJson(response, 200, {
      ok: true,
      value: {
        enabled: settings.enabled,
        hasKey: settings.apiKey.trim() !== '',
        endpoint: publicEndpoint(settings.endpoint),
        model: settings.model,
        includeTranscript: settings.includeTranscript,
        requireConfirmation: settings.requireConfirmation,
        redactSensitive: settings.redactSensitive,
        transcriptMessages: settings.transcriptMessages,
        timeoutMs: settings.timeoutMs,
      },
    })
  }, true)

  /** Send one trivial evaluation so the user can verify a freshly pasted key. */
  const test = handler(async (_request, response, signal) => {
    const settings = resolved()
    const jevResponse = await callJev({
      endpoint: settings.endpoint,
      apiKey: settings.apiKey,
      timeoutMs: settings.timeoutMs,
      signal,
      body: {
        state: 'A user pressed "test connection" in the DeepSeek Harness settings page.',
        model: settings.model,
        questions: {
          reachable: { type: 'noul', instructions: 'Is this request being evaluated by Jev?' },
        },
      },
    })
    writeJson(response, 200, {
      ok: true,
      value: {
        model: typeof jevResponse.model === 'string' ? jevResponse.model : settings.model,
        usage: jevResponse.usage ?? null,
      },
    })
  })

  /** 预览与发送共用同一输入校验，保持身份和原始选项映射一致。 */
  const readAdviceRequest = async (request) => {
    const body = await readJsonBody(request)
    validateDecisionPreference(body.decisionPreference)
    const rawQuestions = Array.isArray(body.questions) ? body.questions : []
    let binding = null
    if (body.requestId !== undefined) {
      if (typeof body.requestId !== 'string' || body.requestId.trim() === '' || body.requestId.length > 128
        || typeof body.sessionId !== 'string' || body.sessionId.trim() === ''
        || typeof body.interactionKey !== 'string' || body.interactionKey.trim() === '') {
        throw new JevError('jev/bad-request', 'invalid advice request binding')
      }
      binding = { requestId: body.requestId, sessionId: body.sessionId, interactionKey: body.interactionKey, questions: rawQuestions }
      if (body.decisionPreference !== undefined) binding.decisionPreference = body.decisionPreference
    }
    validateQuestionIds(rawQuestions)
    const questions = []
    for (const raw of rawQuestions) {
      const question = normalizeQuestion(raw)
      if (question === undefined) {
        questions.push({
          id: typeof raw?.id === 'string' ? raw.id : `question-${String(questions.length)}`,
          question: typeof raw?.question === 'string' ? raw.question : '',
          options: [],
          multiSelect: false,
          unsupported: true,
        })
        continue
      }
      questions.push(question)
    }
    if (questions.length === 0) {
      throw new JevError('jev/bad-request', 'no questions were supplied')
    }
    return { body, questions, binding }
  }

  const previews = new Map()
  const evaluations = createEvaluationPool()
  ctx.effect(() => () => previews.clear(), 'dsh-jev-advisor: clear previews')
  ctx.effect(() => () => evaluations.dispose(), 'dsh-jev-advisor: cancel evaluations')
  const fingerprint = (settings) => createHash('sha256').update(JSON.stringify(settings)).digest('hex')
  const buildPrepared = (settings, body, supported) => prepareJevRequest({
    questions: supported, model: settings.model, redactSensitive: settings.redactSensitive,
    decisionPreference: body.decisionPreference,
    transcript: settings.includeTranscript ? readTranscript(ctx, body.sessionId, settings.transcriptMessages) : '',
  })

  /** 仅本地准备并返回精确快照，绝不调用付费评估端点。 */
  const prepare = handler(async (request, response) => {
    const settings = resolved()
    if (!settings.enabled) throw new JevError('jev/disabled', 'Jev advice is disabled in Settings -> Jev')
    const { body, questions, binding } = await readAdviceRequest(request)
    if (binding === null) throw new JevError('jev/bad-request', 'a preview requires a complete request binding')
    const supported = questions.filter((question) => question.unsupported !== true)
    const prepared = buildPrepared(settings, body, supported)
    for (const [key, entry] of previews) if (entry.expiresAt <= Date.now()) previews.delete(key)
    while (previews.size >= 32) previews.delete(previews.keys().next().value)
    const previewToken = randomUUID()
    const expiresAt = Date.now() + 120000
    previews.set(previewToken, { prepared, binding, fingerprint: fingerprint(settings), expiresAt })
    writeJson(response, 200, { ok: true, value: { binding, previewToken, expiresAt, request: prepared.body, privacy: prepared.privacy } })
  })

  /** 确认模式必须使用仍有效的预览；自动模式保持原有调用方式。 */
  const advise = handler(async (request, response, signal) => {
    const { body, questions, binding } = await readAdviceRequest(request)
    const settings = resolved()
    if (!settings.enabled) throw new JevError('jev/disabled', 'Jev advice is disabled in Settings -> Jev')

    const supported = questions.filter((question) => question.unsupported !== true)
    let built
    if (body.previewToken !== undefined) {
      const preview = previews.get(body.previewToken)
      if (preview === undefined || preview.expiresAt <= Date.now() || !isDeepStrictEqual(preview.binding, binding) || preview.fingerprint !== fingerprint(settings)) {
        if (preview?.expiresAt <= Date.now()) previews.delete(body.previewToken)
        throw new JevError('jev/preview-invalid', 'the preview expired or the request/settings changed; retry to preview again')
      }
      built = preview.prepared
    } else if (settings.requireConfirmation) {
      throw new JevError('jev/confirmation-required', 'preview and confirm the request before sending it to Jev')
    }
    if (supported.length === 0) {
      writeJson(response, 200, {
        ok: true,
        value: {
          model: settings.model,
          binding,
          request: null,
          response: null,
          advice: questions.map((question) => ({
            questionId: question.id,
            supported: false,
            reason: 'this question has no options for Jev to choose between',
          })),
        },
      })
      return
    }

    built ??= buildPrepared(settings, body, supported)
    const jevRequest = built.body
    const evaluationKey = createHash('sha256').update(JSON.stringify([
      fingerprint(settings), body.sessionId, body.interactionKey, body.questions, body.decisionPreference, jevRequest,
    ])).digest('hex')
    const evaluation = await evaluations.run(evaluationKey, (sharedSignal) => callJev({
      endpoint: settings.endpoint,
      apiKey: settings.apiKey,
      timeoutMs: settings.timeoutMs,
      signal: sharedSignal,
      body: jevRequest,
    }), signal)
    const jevResponse = evaluation.value
    const advice = mapAdvice(built.plan, jevResponse)
    const byId = new Map(advice.map((entry) => [entry.questionId, entry]))
    writeJson(response, 200, {
      ok: true,
      value: {
        model: typeof jevResponse.model === 'string' ? jevResponse.model : settings.model,
        binding,
        usage: jevResponse.usage ?? null,
        privacy: built.privacy,
        reused: evaluation.reused,
        request: jevRequest,
        response: jevResponse,
        advice: questions.map((question) => byId.get(question.id) ?? {
          questionId: question.id,
          supported: false,
          reason: 'this question has no options for Jev to choose between',
        }),
      },
    })
  })

  const routes = [
    ['/status', status],
    ['/test', test],
    ['/prepare', prepare],
    ['/advise', advise],
  ]
  for (const [suffix, method] of routes) {
    const path = `${ROUTE_PREFIX}${suffix}`
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path, handler: method }), `dsh-jev-advisor: route ${path}`)
  }

  ctx.logger?.info?.('dsh-jev-advisor: mounted (advice panel + Settings -> Jev)')
}
