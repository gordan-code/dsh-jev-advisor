/**
 * dsh-jev-advisor — Host half.
 *
 * When the model hands the user a multiple-choice question (`ask_user_question`
 * -> `ctx.userQuestions`), the browser half asks this half for a Jev (TypeSafe
 * System One) opinion. This half owns everything that must not live in the
 * browser:
 *
 * - the API key and the other connection settings, through the standard
 *   `ctx.settings` service (namespace `dsh-jev-advisor`), so they persist in the user's
 *   settings document and can be edited from Settings -> Jev;
 * - the session transcript used as Jev's `state`, read from `ctx.sessions`;
 * - the outbound HTTPS call to the TypeSafe evaluation endpoint;
 * - two loopback-only JSON routes, `/dsh-jev-advisor/api/status` and
 *   `/dsh-jev-advisor/api/advise` (plus `/dsh-jev-advisor/api/test`), consumed by the browser
 *   half with a same-origin `fetch`.
 *
 * The plugin never answers a question on its own: it only produces advice. The
 * human still presses the button.
 *
 * @module dsh-jev-advisor
 */

import z from '@deepseek-ai/schemastery'

/** Plugin identity for cordis rows and diagnostics. */
export const name = 'dsh-jev-advisor'

/**
 * Required host services. `webServer` carries the two routes and `settings`
 * would be nice to have but is registered through `ctx.inject` below so a
 * profile without a settings provider still boots (composition config is the
 * fallback).
 */
export const inject = ['webServer']

/** Settings namespace owned by this plugin. */
const SETTINGS_NS = 'dsh-jev-advisor'

/** Route prefix owned by this plugin. Exact routes are matched before prefixes. */
const ROUTE_PREFIX = '/dsh-jev-advisor/api'

/** Default TypeSafe evaluation endpoint and model alias. */
const DEFAULT_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const DEFAULT_MODEL = 'jev-latest'

/** Synthetic Choice option that lets Jev say "none of the listed options fits". */
const NONE_KEY = '__none_of_the_above__'

/** Rough ceiling on the `state` we are willing to send (Jev allows 32k for state + longest question). */
const MAX_STATE_CHARS = 24000

/** Composition-level defaults; the user settings section resolves above them. */
export const Config = z.object({
  apiKey: z.string().role('secret').default(''),
  endpoint: z.string().default(DEFAULT_ENDPOINT),
  model: z.string().default(DEFAULT_MODEL),
  enabled: z.boolean().default(true),
  includeTranscript: z.boolean().default(true),
  transcriptMessages: z.number().step(1).min(0).max(100).default(12),
  timeoutMs: z.number().step(1).min(1000).max(180000).default(30000),
})

/**
 * User-facing settings schema.
 *
 * `apiKey` carries `role('secret')`, so the settings wire strips it from every
 * read: the browser can write it and can learn whether one is stored (through
 * `/dsh-jev-advisor/api/status`), but never reads the value back.
 */
export const JevSettings = z.object({
  apiKey: z.string().role('secret').default(''),
  endpoint: z.string().default(DEFAULT_ENDPOINT),
  model: z.string().default(DEFAULT_MODEL),
  enabled: z.boolean().default(true),
  includeTranscript: z.boolean().default(true),
  transcriptMessages: z.number().step(1).min(0).max(100).default(12),
  timeoutMs: z.number().step(1).min(1000).max(180000).default(30000),
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

/** Coerce an unknown value into a finite number, defaulting to 0. */
function numberOrZero(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
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
  const state = { context: transcript === '' ? '(no conversation context provided)' : transcript, decisions: [] }
  const jevQuestions = {}
  const plan = []

  questions.forEach((question, decisionIndex) => {
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
    if (question.multiSelect) {
      const keys = question.options.map((_, index) => `opt_${String(index)}`)
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
    jevQuestions[question.id] = {
      type: 'choice',
      instructions: `Considering \`context\`, which option in \`${where}.options\` is the best answer to the decision stated in \`${where}.question\`? Weigh what serves the user's goal and the ongoing task best. Choose \`${NONE_KEY}\` only when no listed option fits.`,
      criteria,
    }
    plan.push({ id: question.id, kind: 'choice', options: question.options, keys, noneKey: NONE_KEY })
  })

  return { state, questions: jevQuestions, plan }
}

/* ------------------------------------------------------------------ *
 * Jev transport
 * ------------------------------------------------------------------ */

/** Sleep for a bounded backoff delay. */
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/** Read a `retry-after` header as milliseconds, or `undefined` when absent/unusable. */
function retryAfterMs(response) {
  const raw = response.headers.get('retry-after')
  if (raw === null) return undefined
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 5000)
  return undefined
}

/**
 * POST one evaluation to TypeSafe, retrying the two documented overload codes
 * with exponential backoff and honouring `retry-after`.
 *
 * @param options - endpoint, key, timeout, and the request body.
 * @returns The parsed JSON response body.
 * @throws {JevError} with code `jev/missing-key`, `jev/http-error`, or `jev/bad-response`.
 */
async function callJev({ endpoint, apiKey, timeoutMs, body }) {
  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new JevError('jev/missing-key', 'no Jev API key is configured; open Settings -> Jev and save one')
  }
  let attempt = 0
  for (;;) {
    let response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey.trim()}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new JevError('jev/network-error', `could not reach ${endpoint}: ${reason}`, { cause: error })
    }

    if ((response.status === 429 || response.status === 529) && attempt < 2) {
      const wait = retryAfterMs(response) ?? 400 * 2 ** attempt
      attempt += 1
      await delay(wait)
      continue
    }

    const text = await response.text()
    let parsed
    try {
      parsed = text === '' ? undefined : JSON.parse(text)
    } catch {
      parsed = undefined
    }
    if (!response.ok) {
      const detail = parsed === undefined ? text.slice(0, 400) : JSON.stringify(parsed).slice(0, 400)
      throw new JevError('jev/http-error', `Jev responded ${String(response.status)} ${response.statusText}${detail === '' ? '' : `: ${detail}`}`)
    }
    if (parsed === undefined || typeof parsed !== 'object' || parsed === null) {
      throw new JevError('jev/bad-response', 'Jev returned a body that is not a JSON object')
    }
    return parsed
  }
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
  const answers = typeof jevResponse.answers === 'object' && jevResponse.answers !== null ? jevResponse.answers : {}
  return plan.map((entry) => {
    if (entry.kind === 'choice') {
      const answer = answers[entry.id]
      if (typeof answer !== 'object' || answer === null || answer.type !== 'choice') {
        return { questionId: entry.id, kind: 'choice', supported: true, answered: false, probabilities: [] }
      }
      const probabilities = typeof answer.probabilities === 'object' && answer.probabilities !== null ? answer.probabilities : {}
      const distribution = entry.options.map((option, index) => ({
        index,
        label: option.label,
        probability: numberOrZero(probabilities[entry.keys[index]]),
      }))
      const noneProbability = numberOrZero(probabilities[entry.noneKey])
      const chosenKey = typeof answer.choice === 'string' ? answer.choice : undefined
      const pickIndex = chosenKey === undefined ? -1 : entry.keys.indexOf(chosenKey)
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
        confidence: typeof answer.confidence === 'number' ? answer.confidence : undefined,
        probabilities: distribution,
      }
    }

    if (entry.kind === 'noul-set') {
      const picks = []
      const distribution = entry.options.map((option, index) => {
        const answer = answers[entry.keys[index]]
        const probability = typeof answer === 'object' && answer !== null && answer.type === 'noul' ? numberOrZero(answer.noul) : 0
        return { index, label: option.label, probability }
      })
      for (const row of distribution) {
        if (row.probability >= 0.5) picks.push(row)
      }
      picks.sort((left, right) => right.probability - left.probability)
      return {
        questionId: entry.id,
        kind: 'noul-set',
        supported: true,
        answered: distribution.length > 0,
        picks: picks.length > 0 ? picks : distribution.slice().sort((left, right) => right.probability - left.probability).slice(0, 1),
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
  const joined = lines.join('\n\n')
  return joined.length > MAX_STATE_CHARS ? `…${joined.slice(-MAX_STATE_CHARS)}` : joined
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
  const connection = ctx.get('connection')
  if (connection !== undefined && typeof connection.requestRejection === 'function') {
    if (connection.requestRejection(request) !== undefined) return false
  }
  const host = request.headers.host
  if (typeof host !== 'string' || host === '') return false
  let hostUrl
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (!isLoopbackHostname(hostUrl.hostname)) return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).hostname === hostUrl.hostname
  } catch {
    return false
  }
}

/** Write one JSON response with the hardening headers the other routes use. */
function writeJson(res, statusCode, value) {
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
  writeJson(res, error instanceof JevError && error.code === 'jev/missing-key' ? 409 : 502, {
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
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
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
  const composition = {
    apiKey: typeof config?.apiKey === 'string' ? config.apiKey : '',
    endpoint: typeof config?.endpoint === 'string' ? config.endpoint : DEFAULT_ENDPOINT,
    model: typeof config?.model === 'string' ? config.model : DEFAULT_MODEL,
    enabled: config?.enabled !== false,
    includeTranscript: config?.includeTranscript !== false,
    transcriptMessages: typeof config?.transcriptMessages === 'number' ? config.transcriptMessages : 12,
    timeoutMs: typeof config?.timeoutMs === 'number' ? config.timeoutMs : 30000,
  }

  /** Live settings scope, once a settings provider is mounted. */
  let scope

  ctx.inject(['settings'], (sctx) => {
    // The plain string is deliberate. `@deepseek-ai/dsh-settings` validates it
    // inside `register()` (its `parseSettingsNamespace`), and the branding
    // helper some plugins use for it is NOT exported by the npm-published build
    // of that package — importing it would break this plugin on any host whose
    // dsh-settings comes from the registry rather than the desktop bundle.
    scope = sctx.settings.register(SETTINGS_NS, JevSettings, { base: config ?? {} })
    ctx.logger?.info?.(`dsh-jev-advisor: settings namespace ${SETTINGS_NS} registered`)
  })

  /**
   * Resolve the effective settings.
   *
   * The settings service is the source of truth while it is mounted; the
   * composition config is the fallback, so a profile without a settings
   * provider still runs (with no API key, which surfaces as a clear 409).
   */
  const resolved = () => {
    const fromSettings = scope === undefined ? undefined : scope.get()
    const value = fromSettings === undefined ? composition : { ...composition, ...fromSettings }
    return {
      apiKey: typeof value.apiKey === 'string' ? value.apiKey : '',
      endpoint: typeof value.endpoint === 'string' && value.endpoint.trim() !== '' ? value.endpoint.trim() : DEFAULT_ENDPOINT,
      model: typeof value.model === 'string' && value.model.trim() !== '' ? value.model.trim() : DEFAULT_MODEL,
      enabled: value.enabled !== false,
      includeTranscript: value.includeTranscript !== false,
      transcriptMessages: typeof value.transcriptMessages === 'number' ? value.transcriptMessages : 12,
      timeoutMs: typeof value.timeoutMs === 'number' ? value.timeoutMs : 30000,
    }
  }

  const handler = (method) => async (request, response) => {
    if (!isTrustedRequest(ctx, request)) {
      writeJson(response, 403, { ok: false, error: { code: 'jev/forbidden', message: 'forbidden' } })
      return
    }
    if (request.method !== 'POST' && request.method !== 'GET') {
      writeJson(response, 405, { ok: false, error: { code: 'jev/method-not-allowed', message: 'method not allowed' } })
      return
    }
    try {
      await method(request, response)
    } catch (error) {
      if (error instanceof JevError) {
        writeError(response, error)
        return
      }
      ctx.logger?.warn?.(`dsh-jev-advisor: ${method.name || 'route'} failed: ${error instanceof Error ? error.message : String(error)}`)
      writeError(response, error)
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
        endpoint: settings.endpoint,
        model: settings.model,
        includeTranscript: settings.includeTranscript,
        transcriptMessages: settings.transcriptMessages,
        timeoutMs: settings.timeoutMs,
        settingsMounted: scope !== undefined,
      },
    })
  })

  /** Send one trivial evaluation so the user can verify a freshly pasted key. */
  const test = handler(async (_request, response) => {
    const settings = resolved()
    const jevResponse = await callJev({
      endpoint: settings.endpoint,
      apiKey: settings.apiKey,
      timeoutMs: settings.timeoutMs,
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

  /** Build the structured Jev request for the pending question batch and answer it. */
  const advise = handler(async (request, response) => {
    const settings = resolved()
    if (!settings.enabled) {
      throw new JevError('jev/disabled', 'Jev advice is disabled in Settings -> Jev')
    }
    const body = await readJsonBody(request)
    const rawQuestions = Array.isArray(body.questions) ? body.questions : []
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

    const supported = questions.filter((question) => question.unsupported !== true)
    if (supported.length === 0) {
      writeJson(response, 200, {
        ok: true,
        value: {
          model: settings.model,
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

    const transcript = settings.includeTranscript
      ? readTranscript(ctx, body.sessionId, settings.transcriptMessages)
      : ''
    const built = buildJevRequest(supported, transcript)
    const jevRequest = { state: built.state, model: settings.model, questions: built.questions }
    const jevResponse = await callJev({
      endpoint: settings.endpoint,
      apiKey: settings.apiKey,
      timeoutMs: settings.timeoutMs,
      body: jevRequest,
    })
    const advice = mapAdvice(built.plan, jevResponse)
    const byId = new Map(advice.map((entry) => [entry.questionId, entry]))
    writeJson(response, 200, {
      ok: true,
      value: {
        model: typeof jevResponse.model === 'string' ? jevResponse.model : settings.model,
        usage: jevResponse.usage ?? null,
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
    ['/advise', advise],
  ]
  for (const [suffix, method] of routes) {
    const path = `${ROUTE_PREFIX}${suffix}`
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path, handler: method }), `dsh-jev-advisor: route ${path}`)
  }

  ctx.logger?.info?.('dsh-jev-advisor: mounted (advice panel + Settings -> Jev)')
}
