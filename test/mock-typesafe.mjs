/**
 * Local TypeSafe evaluation endpoint used by the end-to-end tests.
 *
 * The factory keeps request bodies in memory by default. A dump path is an
 * explicit opt-in for the legacy command-line probe; no test run writes into
 * the repository unless the caller deliberately supplies that path.
 *
 * CLI compatibility:
 *
 *   node test/mock-typesafe.mjs [port] [request-dump-path]
 */

import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** The key the mock accepts; anything else answers 401 like the real endpoint. */
export const ACCEPTED_KEY = 'jev-smoke-test-key'

/** Read a bounded JSON body. */
async function readBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 1024 * 1024) throw new Error('request body too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return text === '' ? {} : JSON.parse(text)
}

/** Answer every question deterministically, with a plausible distribution. */
function answerFor(id, question) {
  if (question.type === 'choice') {
    const keys = Object.keys(question.criteria)
    const probabilities = {}
    keys.forEach((key, index) => {
      probabilities[key] = index === 0 ? 0.8 : Number((0.2 / Math.max(keys.length - 1, 1)).toFixed(4))
    })
    return { type: 'choice', choice: keys[0], probabilities, confidence: 0.7 }
  }
  if (question.type === 'noul') {
    const even = Number(/_opt_(\d+)$/.exec(id)?.[1] ?? '0') % 2 === 0
    return { type: 'noul', noul: even ? 0.9 : 0.2 }
  }
  if (question.type === 'score') {
    return { type: 'score', score: 1, legend: { 0: 'low', 1: 'high' }, probabilities: { 0: 0.2, 1: 0.8 }, confidence: 0.6 }
  }
  return undefined
}

/**
 * Start a deterministic local TypeSafe server.
 *
 * @param {{ port?: number, host?: string, acceptedKey?: string, dumpPath?: string }} options
 * @returns {Promise<{ server: import('node:http').Server, host: string, port: number, url: string, requests: Array<{ headers: import('node:http').IncomingHttpHeaders, body: object }>, close: () => Promise<void> }>}
 */
export function createMockTypeSafeServer(options = {}) {
  const host = options.host ?? '127.0.0.1'
  const port = Number(options.port ?? 0)
  const acceptedKey = options.acceptedKey ?? ACCEPTED_KEY
  const dumpPath = options.dumpPath
  const requests = []

  const server = createServer(async (request, response) => {
    const send = (status, value) => {
      response.statusCode = status
      response.setHeader('content-type', 'application/json; charset=utf-8')
      response.end(JSON.stringify(value))
    }
    if (request.method !== 'POST') {
      send(405, { error: 'method not allowed' })
      return
    }
    const authorization = request.headers.authorization ?? ''
    if (authorization !== `Bearer ${acceptedKey}`) {
      send(401, { error: 'missing or invalid API key' })
      return
    }
    let body
    try {
      body = await readBody(request)
    } catch {
      send(422, { error: 'malformed body' })
      return
    }
    requests.push({ headers: { ...request.headers }, body })
    if (dumpPath !== undefined) writeFileSync(dumpPath, JSON.stringify(body, null, 2), 'utf8')

    // Mirror upstream: a `score` question must carry a `criteria` ARRAY of labels.
    for (const [id, question] of Object.entries(body.questions ?? {})) {
      if (question?.type === 'score' && !Array.isArray(question.criteria)) {
        send(422, {
          detail: [{
            type: 'missing',
            loc: ['body', 'questions', id, 'score', 'criteria'],
            msg: 'Field required',
          }],
        })
        return
      }
    }

    const answers = {}
    for (const [id, question] of Object.entries(body.questions ?? {})) {
      const answer = answerFor(id, question)
      if (answer !== undefined) answers[id] = answer
    }
    send(200, {
      model: 'jev-mock-1.0.0',
      answers,
      usage: { input_tokens: 100, output_tokens: 10 },
    })
  })

  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('mock TypeSafe server did not expose a TCP address'))
        return
      }
      const result = {
        server,
        host,
        port: address.port,
        url: `http://${host}:${String(address.port)}/v1/systemone`,
        requests,
        close: () => new Promise((closeResolve, closeReject) => {
          server.close((error) => error === undefined ? closeResolve() : closeReject(error))
        }),
      }
      resolve(result)
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const requestedPort = Number(process.argv[2] ?? 43221)
  const dumpPath = process.argv[3]
  try {
    const mock = await createMockTypeSafeServer({ port: requestedPort, dumpPath })
    process.stdout.write(`mock typesafe: ${mock.url} (in-memory requests${dumpPath === undefined ? '' : `; dump -> ${dumpPath}`})\n`)
  } catch (error) {
    process.stderr.write(`mock typesafe failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
