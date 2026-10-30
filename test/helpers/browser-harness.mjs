import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const FIXTURE = resolve(ROOT, 'test/fixtures/browser.html')
// 本地红绿循环可指定源文件；默认仍覆盖发布前由主 agent 构建的 lib。
const CLIENT = process.env.DSH_CLIENT_SOURCE === 'src' ? resolve(ROOT, 'src/client.js') : resolve(ROOT, 'lib/client.js')
const REACT = resolve(ROOT, 'node_modules/react/umd/react.development.js')
const REACT_DOM = resolve(ROOT, 'node_modules/react-dom/umd/react-dom.development.js')

const json = (value) => JSON.stringify(value)

function validQuestion(question) {
	return question !== null && typeof question === 'object' && Array.isArray(question.options)
}

/**
 * Start the only HTTP origin used by the browser tests.
 *
 * The browser fixture is intentionally served by this tiny host instead of a
 * test framework server: the same process is the fake DSH host boundary, so a
 * test can inspect the exact POST body that the real client sent and control
 * out-of-order responses without replacing fetch inside the page.
 */
export async function createBrowserHarness() {
	const api = {
		status: {
			hasKey: true,
			endpoint: 'http://127.0.0.1:1/v1/systemone',
			model: 'jev-latest',
			requireConfirmation: false,
			redactSensitive: true,
		},
		advise: 'auto',
		adviceOverride: null,
		prepare: 'auto',
		statusDelay: null,
		statusMode: 'auto',
		testMode: 'auto',
		recordWaiters: [],
		requestLog: [],
		adviseRecords: [],
		prepareRecords: [],
		waiters: [],
		config: {
			initialValue: {
				apiKey: 'sk-fixture',
				endpoint: 'http://127.0.0.1:1/v1/systemone',
				model: 'jev-latest',
				enabled: true,
				autoAdvise: true,
				includeTranscript: true,
				requireConfirmation: false,
				redactSensitive: true,
				transcriptMessages: 12,
				timeoutMs: 30000,
			},
		},
	}
	const openResponses = new Set()

	const takeWaiter = (record) => {
		for (let index = 0; index < api.waiters.length; index += 1) {
			const waiter = api.waiters[index]
			if (waiter.predicate(record)) {
				api.waiters.splice(index, 1)
				waiter.resolve(record)
				return
			}
		}
	}

	const makeAdvice = (questions) => {
		const advice = []
		for (const question of Array.isArray(questions) ? questions : []) {
			if (!validQuestion(question) || question.options.length === 0) continue
			const labels = question.options.map((option) => String(option.label))
			const firstProbability = labels.length === 1 ? 1 : 0.8
			if (question.multiSelect === true) {
				const remainder = labels.length === 1 ? 0 : 0.2 / (labels.length - 1)
				const probabilities = labels.map((label, index) => ({
					index,
					label,
					probability: index === 0 ? firstProbability : remainder,
				}))
				advice.push({
					questionId: String(question.id),
					kind: 'noul-set',
					supported: true,
					answered: true,
					picks: probabilities.filter((row) => row.probability >= 0.5),
					probabilities,
				})
				continue
			}
			const remainder = labels.length === 1 ? 0 : 0.2 / (labels.length - 1)
			const probabilities = labels.map((label, index) => ({
				index,
				label,
				probability: index === 0 ? firstProbability : remainder,
			}))
			advice.push({
				questionId: String(question.id),
				kind: 'choice',
				supported: true,
				answered: true,
				pick: { ...probabilities[0] },
				noneOfTheAbove: false,
				noneProbability: 0,
				confidence: 0.8,
				probabilities,
			})
		}
		return advice
	}

	const privacyFor = (record) => ({
		includedTranscript: true,
		contextChars: 18,
		redactions: 1,
		truncated: false,
		requestBytes: Buffer.byteLength(JSON.stringify({ fixture: true, questions: record.body.questions })),
	})

	const responseFor = (record) => ({
		ok: true,
		value: {
			binding: {
				requestId: record.body.requestId,
				sessionId: record.body.sessionId,
				interactionKey: record.body.interactionKey,
				questions: record.body.questions,
				...(Object.hasOwn(record.body, 'decisionPreference') ? { decisionPreference: record.body.decisionPreference } : {}),
				...(Object.hasOwn(record.body, 'comparePerspectives') ? { comparePerspectives: record.body.comparePerspectives } : {}),
				...(Object.hasOwn(record.body, 'perspectives') ? { perspectives: record.body.perspectives } : {}),
				...(Object.hasOwn(record.body, 'approval') ? { approval: record.body.approval } : {}),
			},
			model: 'jev-fixture-1.0',
			request: { fixture: true, questions: record.body.questions },
			response: { fixture: true },
			privacy: privacyFor(record),
			reused: typeof record.body.previewToken === 'string',
			usage: { input_tokens: 31, output_tokens: 7 },
			advice: typeof api.adviceOverride === 'function' ? api.adviceOverride(record.body.questions) : makeAdvice(record.body.questions),
		},
	})

	const prepareResponseFor = (record) => {
		const request = { fixture: true, questions: record.body.questions }
		return {
			ok: true,
			value: {
				binding: {
					requestId: record.body.requestId,
					sessionId: record.body.sessionId,
					interactionKey: record.body.interactionKey,
					questions: record.body.questions,
					...(Object.hasOwn(record.body, 'decisionPreference') ? { decisionPreference: record.body.decisionPreference } : {}),
					...(Object.hasOwn(record.body, 'comparePerspectives') ? { comparePerspectives: record.body.comparePerspectives } : {}),
					...(Object.hasOwn(record.body, 'perspectives') ? { perspectives: record.body.perspectives } : {}),
					...(Object.hasOwn(record.body, 'approval') ? { approval: record.body.approval } : {}),
				},
				previewToken: `preview-${String(record.body.requestId)}`,
				request,
				privacy: privacyFor(record),
				expiresAt: '2099-01-01T00:00:00.000Z',
			},
		}
	}

	const send = (res, statusCode, body) => {
		if (res.writableEnded || res.destroyed) return
		openResponses.delete(res)
		try {
			res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
			res.end(json(body))
		} catch {
			// The browser is allowed to abort the stale request during a session
			// switch. Resolving that record must remain harmless to the test host.
		}
	}

	const readBody = async (req) => {
		const chunks = []
		for await (const chunk of req) chunks.push(chunk)
		const text = Buffer.concat(chunks).toString('utf8')
		try {
			return text === '' ? {} : JSON.parse(text)
		} catch {
			return undefined
		}
	}

	const server = createServer(async (req, res) => {
		const url = new URL(req.url ?? '/', 'http://127.0.0.1')
		if (req.method === 'GET' && url.pathname === '/') {
			res.writeHead(302, { location: '/fixture/browser.html' })
			res.end()
			return
		}
		if (req.method === 'GET' && url.pathname === '/fixture/browser.html') {
			res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
			res.end(await readFile(FIXTURE))
			return
		}
		if (req.method === 'GET' && url.pathname === '/vendor/react.development.js') {
			res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' })
			res.end(await readFile(REACT))
			return
		}
		if (req.method === 'GET' && url.pathname === '/vendor/react-dom.development.js') {
			res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' })
			res.end(await readFile(REACT_DOM))
			return
		}
		if (req.method === 'GET' && url.pathname === '/lib/client.js') {
			res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' })
			res.end(await readFile(CLIENT))
			return
		}

		if (req.method !== 'POST' || !url.pathname.startsWith('/dsh-jev-advisor/api/')) {
			send(res, 404, { ok: false, error: { message: 'fixture route not found' } })
			return
		}
		const method = url.pathname.slice('/dsh-jev-advisor/api/'.length)
		const body = await readBody(req)
		const record = { method, body, receivedAt: Date.now(), responseClosed: false, closeWaiters: [] }
		res.once('close', () => {
			record.responseClosed = true
			for (const resolveClose of record.closeWaiters.splice(0)) resolveClose()
		})
		api.requestLog.push(record)
		for (const waiter of [...api.recordWaiters]) {
			if (waiter.method !== method) continue
			api.recordWaiters.splice(api.recordWaiters.indexOf(waiter), 1)
			waiter.resolve(record)
		}
		if ((method === 'status' && api.statusMode === 'manual') || (method === 'test' && api.testMode === 'manual')) {
			record.response = res
			openResponses.add(res)
			return
		}
		if (method === 'status') {
			if (api.statusDelay !== null) await api.statusDelay
			send(res, 200, { ok: true, value: { ...api.status } })
			return
		}
		if (method === 'test') {
			send(res, 200, { ok: true, value: { model: 'jev-fixture-1.0' } })
			return
		}
		if (method === 'prepare') {
			api.prepareRecords.push(record)
			takeWaiter(record)
			if (api.prepare === 'auto') {
				send(res, 200, prepareResponseFor(record))
				return
			}
			if (api.prepare === 'error') {
				send(res, 502, { ok: false, error: { message: 'fixture prepare failed' } })
				return
			}
			if (api.prepare === 'missing-binding') {
				const response = prepareResponseFor(record)
				delete response.value.binding
				send(res, 200, response)
				return
			}
			if (api.prepare === 'manual') {
				record.response = res
				openResponses.add(res)
				return
			}
			send(res, 500, { ok: false, error: { message: `unknown fixture prepare mode ${String(api.prepare)}` } })
			return
		}
		if (method !== 'advise') {
			send(res, 404, { ok: false, error: { message: 'unknown fixture method' } })
			return
		}

		api.adviseRecords.push(record)
		takeWaiter(record)
		if (api.advise === 'auto') {
			send(res, 200, responseFor(record))
			return
		}
		if (api.advise === 'error') {
			send(res, 502, { ok: false, error: { message: 'fixture advise failed' } })
			return
		}
		if (api.advise === 'missing-binding') {
			const response = responseFor(record)
			delete response.value.binding
			send(res, 200, response)
			return
		}
		if (api.advise === 'invalid') {
			send(res, 200, { ok: true, value: { model: 'bad', request: {}, response: {}, advice: [{ questionId: 'bad', supported: true }] } })
			return
		}
		// `manual` leaves the response open until resolveAdvise is called. This
		// is what makes the late-response tests deterministic without sleeps.
		if (api.advise === 'manual') {
			record.response = res
			openResponses.add(res)
			return
		}
		send(res, 500, { ok: false, error: { message: `unknown advise mode ${String(api.advise)}` } })
	})

	await new Promise((resolveServer) => server.listen(0, '127.0.0.1', resolveServer))
	const address = server.address()
	const origin = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`
	api.status.endpoint = `${origin}/v1/systemone`
	api.config.initialValue.endpoint = api.status.endpoint

	const harness = {
		origin,
		api,
		setAdviseMode(mode) {
			api.advise = mode
		},
		setAdviceOverride(value) {
			api.adviceOverride = typeof value === 'function' ? value : null
		},
		setPrepareMode(mode) {
			api.prepare = mode
		},
		setStatus(value) {
			Object.assign(api.status, value)
		},
		setStatusMode(mode) { api.statusMode = mode },
		setTestMode(mode) { api.testMode = mode },
		waitForRequest(method) {
			const existing = api.requestLog.find((record) => record.method === method)
			if (existing) return Promise.resolve(existing)
			return new Promise((resolve, reject) => api.recordWaiters.push({ method, resolve, reject }))
		},
		resolveRequest(record, value) {
			if (record.responseClosed) return
			send(record.response, 200, { ok: true, value })
			record.response = undefined
		},
		setConfig(options = {}) {
			Object.assign(api.config, options)
		},
		getRecords(method) {
			return api.requestLog.filter((record) => record.method === method)
		},
		waitForAdvise(predicate = () => true) {
			const existing = api.adviseRecords.find(predicate)
			if (existing !== undefined) return Promise.resolve(existing)
			return new Promise((resolveRecord, rejectRecord) => {
				api.waiters.push({ predicate, resolve: resolveRecord, reject: rejectRecord })
			})
		},
		waitForPrepare(predicate = () => true) {
			const existing = api.prepareRecords.find(predicate)
			if (existing !== undefined) return Promise.resolve(existing)
			return new Promise((resolveRecord, rejectRecord) => {
				api.waiters.push({ predicate, resolve: resolveRecord, reject: rejectRecord })
			})
		},
		waitForResponseClose(record) {
			if (record.responseClosed === true) return Promise.resolve()
			return new Promise((resolveClose) => record.closeWaiters.push(resolveClose))
		},
		resolveAdvise(record, body = responseFor(record), statusCode = 200) {
			if (record.response === undefined) {
				if (record.responseClosed === true) return
				throw new Error('advise record is not waiting for a manual response')
			}
			send(record.response, statusCode, body)
			record.response = undefined
		},
		resolvePrepare(record, body = prepareResponseFor(record), statusCode = 200) {
			if (record.response === undefined) throw new Error('prepare record is not waiting for a manual response')
			send(record.response, statusCode, body)
			record.response = undefined
		},
		responseFor,
		async close() {
			for (const res of openResponses) {
				try { res.destroy() } catch { /* best effort during test cleanup */ }
			}
			openResponses.clear()
			for (const waiter of api.waiters.splice(0)) waiter.reject(new Error('browser harness closed'))
			for (const waiter of api.recordWaiters.splice(0)) waiter.reject(new Error('browser harness closed'))
			await new Promise((resolveServer) => server.close(() => resolveServer()))
		},
	}
	return harness
}
