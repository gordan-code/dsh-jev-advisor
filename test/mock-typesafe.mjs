/**
 * Mock TypeSafe evaluation endpoint.
 *
 * Stands in for `https://api.typesafe.ai/v1/systemone` so the plugin's outbound
 * leg can be exercised without a real API key: it enforces the Bearer header,
 * records the exact request body it received, and answers every typed question
 * with a deterministic distribution.
 *
 *   node test/mock-typesafe.mjs [port] [request-dump-path]
 */

import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const port = Number(process.argv[2] ?? 43221)
const dumpPath = process.argv[3] ?? join(dirname(fileURLToPath(import.meta.url)), 'last-request.json')

/** The key the mock accepts; anything else answers 401 like the real endpoint. */
const ACCEPTED_KEY = 'jev-smoke-test-key'

/** Read a bounded JSON body. */
async function readBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
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
    const even = Number(/(\d+)/.exec(id)?.[1] ?? '0') % 2 === 0
    return { type: 'noul', noul: even ? 0.9 : 0.2 }
  }
  if (question.type === 'score') {
    return { type: 'score', score: 1, legend: { 0: 'low', 1: 'high' }, probabilities: { 0: 0.2, 1: 0.8 }, confidence: 0.6 }
  }
  return undefined
}

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
  if (authorization !== `Bearer ${ACCEPTED_KEY}`) {
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
  writeFileSync(dumpPath, JSON.stringify(body, null, 2), 'utf8')

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

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`mock typesafe: http://127.0.0.1:${String(port)}/v1/systemone (dump -> ${dumpPath})\n`)
})
