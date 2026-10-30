import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { chromium } from 'playwright'
import { createBrowserHarness } from './helpers/browser-harness.mjs'

let browser

test('按需缺省在重渲染、偏好保存和会话切换时不请求，显式双击只评估一次', async t => {
  await withBrowser(t, async ({ page, harness }) => {
    await page.evaluate(() => window.__fixture.setConfig({ autoAdvise: undefined }))
    await mountOverlay(page, [question('manual', 'manual-one', 'Manual')], 'manual')
    const ask = page.getByRole('button', { name: 'Ask Jev', exact: true })
    await ask.waitFor()
    assert.equal(harness.getRecords('prepare').length, 0)
    assert.equal(harness.getRecords('advise').length, 0)
    await page.getByPlaceholder(/Tell Jev/).fill('优先稳定')
    await page.getByRole('button', { name: 'Save preference for this question' }).click()
    assert.equal(harness.getRecords('advise').length, 0)
    await ask.evaluate(button => { button.click(); button.click() })
    await page.getByRole('button', { name: 'Adopt Jev’s answer', exact: true }).waitFor()
    assert.equal(harness.getRecords('advise').length, 1)
    assert.equal(harness.getRecords('advise')[0].body.decisionPreference, '优先稳定')
    await page.evaluate(() => window.__fixture.setConfig({ model: 'changed' }))
    await ask.waitFor()
    assert.equal(harness.getRecords('advise').length, 1)
    await mountOverlay(page, [question('manual', 'manual-two', 'Next')], 'manual')
    await ask.waitFor()
    assert.equal(harness.getRecords('advise').length, 1)
    await page.evaluate(() => { window.__fixture.unmountOverlay(); window.__fixture.mountOverlay() })
    await ask.waitFor()
    assert.equal(harness.getRecords('advise').length, 1)
  })
})

test('按需与确认组合：先点击准备，再确认发送；关闭已完成卡片重开不重复调用', async t => {
  await withBrowser(t, async ({ page, harness }) => {
    await page.evaluate(() => window.__fixture.setConfig({ autoAdvise: false, requireConfirmation: true }))
    await mountOverlay(page, [question('confirm', 'manual-confirm', 'Confirm')], 'confirm')
    await page.getByRole('button', { name: 'Ask Jev', exact: true }).waitFor()
    assert.equal(harness.getRecords('prepare').length, 0)
    await page.getByRole('button', { name: 'Ask Jev', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm and send', exact: true }).waitFor()
    assert.equal(harness.getRecords('prepare').length, 1)
    assert.equal(harness.getRecords('advise').length, 0)
    await page.getByRole('button', { name: 'Confirm and send', exact: true }).click()
    await page.getByRole('button', { name: 'Adopt Jev’s answer', exact: true }).waitFor()
    await page.getByTitle('Dismiss', { exact: true }).click()
    await page.getByRole('button', { name: 'Open Jev advice' }).click()
    await page.getByRole('button', { name: 'Adopt Jev’s answer', exact: true }).waitFor()
    assert.equal(harness.getRecords('prepare').length, 1)
    assert.equal(harness.getRecords('advise').length, 1)
  })
})

test('设置开关说明可见且原子保存，诊断只复制白名单且不付费探测', async t => {
  await withBrowser(t, async ({ page, harness }) => {
    harness.setStatus({ diagnostics: { pluginVersion: '0.1.7', dshVersion: '0.2.1-rc.3', declaredDsh: '0.2.1-rc.3', declarationMatch: 'match', enabled: true, autoAdvise: false, hasKey: true, apiKey: 'private-key', endpoint: 'https://user:secret@private', sessionId: 'private-session' } })
    await page.evaluate(() => {
      window.__fixture.setConfig({ autoAdvise: false })
      window.__fixture.mountSettings()
      window.__diagnosticCopies = []
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__diagnosticCopies.push(text) } } })
    })
    const section = page.locator('[data-dsh-jev-advisor="diagnostics"]')
    await section.getByText('DSH version: 0.2.1-rc.3', { exact: true }).waitFor()
    assert.ok(await page.getByText(/Off by default, including upgrades/).isVisible())
    const checkbox = page.getByLabel('Automatically get Jev advice', { exact: true })
    assert.equal(await checkbox.isChecked(), false)
    await checkbox.check()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByText('Saved', { exact: true }).waitFor()
    assert.equal(await page.evaluate(() => window.__fixture.getConfig().autoAdvise), true)
    const calls = await page.evaluate(() => window.__fixture.getScopeCalls())
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].ops, [{ op: 'set', path: ['autoAdvise'], value: true }])
    await section.getByRole('button', { name: 'Copy sanitized diagnostics' }).click()
    await section.getByText('Diagnostics copied', { exact: true }).waitFor()
    const copies = await page.evaluate(() => window.__diagnosticCopies)
    assert.equal(copies.length, 1)
    assert.equal(/private|secret|apiKey|endpoint|sessionId/.test(copies[0]), false)
    assert.equal(harness.getRecords('test').length, 0)
    assert.equal(harness.getRecords('advise').length, 0)
  })
})

before(async () => {
	// The cached Playwright Chromium is used headlessly. No user browser, page,
	// profile, or desktop surface is touched by this suite.
	browser = await chromium.launch({ headless: true })
})

test('按需布局变化不请求，失败后仅显式重试；取消加载后重开仍等待点击', async t => {
  await withBrowser(t, async ({ page, harness }) => {
    await page.evaluate(() => window.__fixture.setConfig({ autoAdvise: false }))
    await mountOverlay(page, [question('s', 'manual-layout', 'Layout')], 's')
    const card = page.locator('[data-dsh-jev-advisor="advice"]')
    await card.getByRole('button', { name: 'Ask Jev', exact: true }).waitFor()
    await card.getByRole('button', { name: 'Dock right' }).click()
    await page.waitForFunction(() => window.__fixture.getConfig().cardDock === 'right')
    assert.equal(harness.getRecords('advise').length, 0)
    harness.setAdviseMode('error')
    await card.getByRole('button', { name: 'Ask Jev', exact: true }).click()
    await card.getByRole('button', { name: 'Retry', exact: true }).waitFor()
    harness.setAdviseMode('auto')
    await card.getByRole('button', { name: 'Retry', exact: true }).click()
    await card.getByText('Layout fast', { exact: true }).waitFor()
    await card.getByRole('button', { name: 'Dock left' }).click()
    await page.waitForFunction(() => window.__fixture.getConfig().cardDock === 'left')
    await card.getByText('Layout fast', { exact: true }).waitFor()
    assert.equal(harness.getRecords('advise').length, 2)
    harness.setAdviseMode('manual')
    await mountOverlay(page, [question('s', 'manual-cancel', 'Cancel')], 's')
    await card.getByRole('button', { name: 'Ask Jev', exact: true }).click()
    const request = await harness.waitForAdvise(r => r.body.interactionKey === 'manual-cancel')
    await card.getByTitle('Dismiss', { exact: true }).click()
    await harness.waitForResponseClose(request)
    await page.getByRole('button', { name: 'Open Jev advice' }).click()
    await card.getByRole('button', { name: 'Ask Jev', exact: true }).waitFor()
    assert.equal(harness.getRecords('advise').length, 3)
  })
})

test('切回按需取消自动请求，迟到响应不恢复；再次开启自动仅请求当前问题', async t => {
  await withBrowser(t, async ({ page, harness }) => {
    harness.setAdviseMode('manual')
    await mountOverlay(page, [question('s', 'mode-switch', 'Switch')], 's')
    const first = await harness.waitForAdvise()
    await page.evaluate(() => window.__fixture.setConfig({ autoAdvise: false }))
    await page.getByRole('button', { name: 'Ask Jev', exact: true }).waitFor()
    await harness.waitForResponseClose(first)
    assert.equal(harness.getRecords('advise').length, 1)
    harness.setAdviseMode('auto')
    await page.evaluate(() => window.__fixture.setConfig({ autoAdvise: true }))
    await page.getByRole('button', { name: 'Adopt Jev’s answer', exact: true }).waitFor()
    assert.equal(harness.getRecords('advise').length, 2)
  })
})

test('诊断缺失显示未知，复制拒绝不泄露异常，卸载后迟到复制不更新新面板', async t => {
  await withBrowser(t, async ({ page, harness }) => {
    await page.evaluate(() => {
      window.__fixture.mountSettings()
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw Error('private-key') } } })
    })
    let section = page.locator('[data-dsh-jev-advisor="diagnostics"]')
    await section.getByText('DSH version: Unknown', { exact: true }).waitFor()
    await section.getByRole('button', { name: 'Copy sanitized diagnostics' }).click()
    await section.getByText(/Could not copy diagnostics/).waitFor()
    assert.equal(await section.getByText('private-key').count(), 0)
    await page.evaluate(() => {
      navigator.clipboard.writeText = () => new Promise(resolve => { window.__finishDiagnosticCopy = resolve })
    })
    await section.getByRole('button', { name: 'Copy sanitized diagnostics' }).click()
    await page.evaluate(() => { window.__fixture.unmountSettings(); window.__fixture.mountSettings(); window.__finishDiagnosticCopy() })
    section = page.locator('[data-dsh-jev-advisor="diagnostics"]')
    await section.getByRole('button', { name: 'Copy sanitized diagnostics' }).waitFor()
    assert.equal(await section.getByText('Diagnostics copied', { exact: true }).count(), 0)
    assert.equal(harness.getRecords('test').length, 0)
  })
})

after(async () => {
	if (browser !== undefined) await browser.close()
})

const question = (sessionId, interactionKey, label, extra = {}) => ({
	sessionId,
	interactionKey,
	question: `${label} question`,
	options: [`${label} fast`, `${label} careful`],
	...extra,
})

async function withBrowser(t, run) {
	const harness = await createBrowserHarness()
	let context
	let page
	const foreignRequests = []
	const consoleErrors = []
	try {
		context = await browser.newContext({ serviceWorkers: 'block' })
		await context.route('**/*', async (route) => {
			const requestUrl = new URL(route.request().url())
			if (requestUrl.origin !== harness.origin) {
				foreignRequests.push(requestUrl.href)
				await route.abort()
				return
			}
			await route.continue()
		})
		page = await context.newPage()
		page.on('console', (message) => {
			if (message.type() === 'error') consoleErrors.push(message.text())
		})
		await page.goto(`${harness.origin}/fixture/browser.html`, { waitUntil: 'load' })
		await page.waitForFunction(() => window.__fixture?.ready === true)
		await run({ page, harness })
		assert.deepEqual(await page.evaluate(() => Object.keys(window).filter((key) => /^__jev/.test(key) && key !== '__jevRegistration')), [], 'production rendering does not retain conversation diagnostics on window')
		assert.deepEqual(foreignRequests, [], 'the fixture made no non-origin network request')
		assert.deepEqual(consoleErrors.filter((message) => !/Failed to load resource/i.test(message)), [], 'the real React render emitted no browser errors')
	} finally {
		// Always unmount before closing the page so pending React effects get a
		// chance to abort their host requests; the harness then closes any manual
		// HTTP responses that a test intentionally left open.
		if (page !== undefined) {
			await page.evaluate(() => {
				window.__fixture?.unmountOverlay()
				window.__fixture?.unmountSettings()
			}).catch(() => {})
		}
		await context?.close()
		await harness.close()
	}
}

async function mountOverlay(page, specs, mainSession) {
	await page.evaluate(({ nextSpecs, key }) => {
		window.__fixture.setMainSession(key)
		window.__fixture.setSessions(nextSpecs)
		window.__fixture.mountOverlay()
	}, { nextSpecs: specs, key: mainSession })
}

async function awaitOverlayCommit(page, previousCommit = 0) {
	await page.waitForFunction((previous) => window.__fixture.commits.overlay > previous, previousCommit)
}

async function awaitSettingsCommit(page, previousCommit = 0) {
	await page.waitForFunction((previous) => window.__fixture.commits.settings > previous, previousCommit)
}

test('session selection prefers main session, rejects stale responses, and adopts only the current question', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		harness.setAdviseMode('manual')
		await mountOverlay(page, [
			question('session-a', 'interaction-a', 'A'),
			question('session-b', 'interaction-b', 'B'),
		], 'session-a')
		const requestA = await harness.waitForAdvise((record) => record.body.sessionId === 'session-a')

		const previousCommit = await page.evaluate(() => window.__fixture.commits.overlay)
		await page.evaluate(() => window.__fixture.setMainSession('session-b'))
		await awaitOverlayCommit(page, previousCommit)
		const requestB = await harness.waitForAdvise((record) => record.body.sessionId === 'session-b')
		assert.equal(requestB.body.interactionKey, 'interaction-b')

		await harness.resolveAdvise(requestB)
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByText('B fast', { exact: true }).waitFor({ state: 'visible' })
		assert.equal(await card.getByText('A fast', { exact: true }).count(), 0, 'the current card is not the previous session')

		await harness.waitForResponseClose(requestA)
		assert.equal(requestA.responseClosed, true, 'switching sessions aborts the old HTTP request')
		// A closed old request cannot replace the card for B. The helper treats
		// resolving a response that the browser already closed as a harmless no-op.
		await harness.resolveAdvise(requestA)
		await card.getByText('B fast', { exact: true }).waitFor({ state: 'visible' })
		assert.equal(await card.getByText('A fast', { exact: true }).count(), 0)

		await card.getByRole('button', { name: /Adopt Jev/ }).click()
		await page.waitForFunction(() => window.__fixture.getAnswerCalls().length === 1)
		assert.deepEqual(await page.evaluate(() => window.__fixture.getAnswerCalls()), [{
			sessionId: 'session-b',
			interactionKey: 'interaction-b',
			payload: { answers: [{ id: 'mode', selected: ['B fast'] }] },
		}])
	})
})

test('an approval in the current session suppresses fallback cards from another session', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		harness.setAdviseMode('manual')
		await mountOverlay(page, [
			{ sessionId: 'session-a', interactionKey: 'approval-a', kind: 'approval' },
			question('session-b', 'interaction-b', 'B'),
		], 'session-a')
		await page.waitForFunction(() => window.__fixture.commits.overlay >= 1)
		assert.equal(harness.getRecords('advise').length, 0, 'approval does not create a Jev request')
		assert.equal(await page.locator('[data-dsh-jev-advisor="advice"]').count(), 0)

		// Once the current session has no pending interaction at all, the host's
		// first answerable background question is a legitimate fallback.
		harness.setAdviseMode('auto')
		await page.evaluate(() => window.__fixture.setSessions([
			{ sessionId: 'session-b', interactionKey: 'interaction-b-2', question: 'B fallback', options: ['B fallback fast', 'B fallback careful'] },
		]))
		await harness.waitForAdvise((record) => record.body.sessionId === 'session-b')
		await page.locator('[data-dsh-jev-advisor="advice"]').getByText('B fallback fast', { exact: true }).waitFor({ state: 'visible' })
		assert.equal(harness.getRecords('advise').length, 1)

		await page.evaluate(() => window.__fixture.setMainSession('session-b'))
		await page.locator('[data-dsh-jev-advisor="advice"]').getByText('B fallback fast', { exact: true }).waitFor({ state: 'visible' })
	})
})

test('dismiss aborts the active card and retry recovers a failed host request', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		harness.setAdviseMode('manual')
		await mountOverlay(page, [question('session-a', 'interaction-a', 'A')], 'session-a')
		const request = await harness.waitForAdvise()
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByText('Automatically requesting Jev with recent conversation', { exact: true }).waitFor({ state: 'visible' })
		await card.locator('button[title="Dismiss"]').click()
		await card.waitFor({ state: 'detached' })
		assert.equal(await page.locator('[data-dsh-jev-advisor="reopen"]').count(), 1, 'closing leaves a small reopen entry')
		await harness.resolveAdvise(request)
		assert.equal(await page.locator('[data-dsh-jev-advisor="advice"]').count(), 0, 'closing prevents a late response from reopening the card')

		// A new interaction is not dismissed, and a one-shot bridge failure gets
		// a visible retry action rather than a permanently dead card.
		harness.setAdviseMode('error')
		await page.evaluate(() => window.__fixture.setSessions([{
			sessionId: 'session-a', interactionKey: 'interaction-a-2', question: 'A retry', options: ['Retry fast', 'Retry careful'],
		}]))
		const failedCard = page.locator('[data-dsh-jev-advisor="advice"]')
		await failedCard.getByText('fixture advise failed').waitFor({ state: 'visible' })
		harness.setAdviseMode('auto')
		await failedCard.getByRole('button', { name: 'Retry' }).click()
		await failedCard.getByText('Retry fast', { exact: true }).waitFor({ state: 'visible' })
	})
})

test('a ready result can be collapsed and reopened without another advise request', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		harness.setAdviseMode('auto')
		await mountOverlay(page, [question('session-a', 'interaction-ready', 'Ready')], 'session-a')
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByText('Ready fast', { exact: true }).waitFor({ state: 'visible' })
		assert.equal(harness.getRecords('advise').length, 1)
		await card.getByRole('button', { name: 'Collapse' }).click()
		await card.getByText('Ready fast', { exact: true }).waitFor({ state: 'hidden' })
		assert.equal(await card.getAttribute('data-collapsed'), 'true')
		await card.getByRole('button', { name: 'Expand' }).click()
		await card.getByText('Ready fast', { exact: true }).waitFor({ state: 'visible' })
		await card.locator('button[title="Dismiss"]').click()
		await card.waitFor({ state: 'detached' })
		await page.locator('[data-dsh-jev-advisor="reopen"]').getByRole('button', { name: 'Open Jev advice' }).click()
		await card.getByText('Ready fast', { exact: true }).waitFor({ state: 'visible' })
		assert.equal(harness.getRecords('advise').length, 1, 'reopening a ready result does not refetch')

		// A settings revision while the ready card is closed invalidates the old
		// result; reopening must start one fresh request rather than stay loading
		// behind the small entry with no effect request.
		await card.locator('button[title="Dismiss"]').click()
		await card.waitFor({ state: 'detached' })
		await page.evaluate(() => window.__fixture.setConfig({ model: 'jev-revision-2' }))
		await page.locator('[data-dsh-jev-advisor="reopen"]').getByRole('button', { name: 'Open Jev advice' }).click()
		const refreshed = await harness.waitForAdvise((record) => record.body.requestId !== harness.getRecords('advise')[0].body.requestId)
		assert.notEqual(refreshed.body.requestId, harness.getRecords('advise')[0].body.requestId)
		await card.getByText('Ready fast', { exact: true }).waitFor({ state: 'visible' })
	})
})

test('closing a loading card aborts it and reopening starts a fresh request', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		harness.setAdviseMode('manual')
		await mountOverlay(page, [question('session-a', 'interaction-loading', 'Loading')], 'session-a')
		const first = await harness.waitForAdvise()
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.locator('button[title="Dismiss"]').click()
		await card.waitFor({ state: 'detached' })
		await page.locator('[data-dsh-jev-advisor="reopen"]').getByRole('button', { name: 'Open Jev advice' }).click()
		const second = await harness.waitForAdvise((record) => record !== first)
		assert.notEqual(second.body.requestId, first.body.requestId)
		assert.equal(harness.getRecords('advise').length, 2)
		await harness.resolveAdvise(second)
		await card.getByText('Loading fast', { exact: true }).waitFor({ state: 'visible' })
		await harness.resolveAdvise(first)
	})
})

test('the card stays within a 375px viewport and shows privacy metadata and actual usage', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		await page.setViewportSize({ width: 375, height: 640 })
		harness.setAdviseMode('auto')
		await mountOverlay(page, [question('session-a', 'interaction-narrow', 'Narrow', { options: ['a very long option label that should wrap safely', 'another option'] })], 'session-a')
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByText('a very long option label that should wrap safely', { exact: true }).waitFor({ state: 'visible' })
		const box = await card.boundingBox()
		assert.ok(box !== null)
		assert.ok(box.x >= 0 && box.x + box.width <= 375, `card overflowed viewport: ${JSON.stringify(box)}`)
		assert.equal(await card.getByText(/Context sent: Transcript included/).count(), 1)
		const requestBytes = harness.responseFor(harness.getRecords('advise')[0]).value.privacy.requestBytes
		assert.equal(await card.getByText(`${String(requestBytes)} bytes`, { exact: true }).count(), 1)
		assert.equal(await card.getByText('Usage: input 31 · output 7', { exact: true }).count(), 1)
	})
})

test('missing host binding shows restart guidance and is not retryable', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		harness.setAdviseMode('missing-binding')
		await mountOverlay(page, [question('session-a', 'interaction-a', 'A')], 'session-a')
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByText(/out of date; restart the DSH host process/i).waitFor({ state: 'visible' })
		assert.equal(await card.getByRole('button', { name: 'Retry' }).count(), 0)
	})
})

test('adopt sends the exact answer batch and a rejected answer can be retried', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		harness.setAdviseMode('auto')
		await mountOverlay(page, [question('session-a', 'interaction-a', 'A', { answerPlan: ['reject', 'resolve'] })], 'session-a')
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByText('A fast', { exact: true }).waitFor({ state: 'visible' })
		const adopt = card.getByRole('button', { name: /Adopt Jev/ })
		await adopt.click()
		await card.getByText('Adopt failed: fixture answer failed').waitFor({ state: 'visible' })
		assert.equal((await page.evaluate(() => window.__fixture.getAnswerCalls())).length, 1)
		await adopt.click()
		await page.waitForFunction(() => window.__fixture.getAnswerCalls().length === 2)
		assert.deepEqual((await page.evaluate(() => window.__fixture.getAnswerCalls())).map((entry) => entry.payload), [
			{ answers: [{ id: 'mode', selected: ['A fast'] }] },
			{ answers: [{ id: 'mode', selected: ['A fast'] }] },
		])
	})
})

test('confirmation mode prepares an exact preview before advise and reuses its binding token', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		await page.evaluate(() => window.__fixture.setConfig({ requireConfirmation: true }))
		harness.setPrepareMode('manual')
		harness.setAdviseMode('auto')
		await mountOverlay(page, [question('session-a', 'interaction-confirm', 'Confirm')], 'session-a')
		const prepared = await harness.waitForPrepare()
		assert.deepEqual(Object.keys(prepared.body).sort(), ['interactionKey', 'questions', 'requestId', 'sessionId'].sort(), 'prepare carries only the binding fields')
		assert.equal(harness.getRecords('advise').length, 0, 'prepare does not call advise before confirmation')
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByText('Preparing local preview…', { exact: true }).waitFor({ state: 'visible' })
		await harness.resolvePrepare(prepared)
		await card.locator('[data-dsh-jev-advisor="preview-json"]').waitFor({ state: 'visible' })
		assert.match(await card.locator('[data-dsh-jev-advisor="preview-json"]').textContent(), /"fixture": true/)
		await card.getByRole('button', { name: 'Confirm and send' }).click()
		const advised = await harness.waitForAdvise()
		assert.equal(advised.body.requestId, prepared.body.requestId)
		assert.equal(advised.body.sessionId, prepared.body.sessionId)
		assert.equal(advised.body.interactionKey, prepared.body.interactionKey)
		assert.deepEqual(advised.body.questions, prepared.body.questions)
		assert.equal(typeof advised.body.previewToken, 'string')
		assert.equal(advised.body.previewToken, `preview-${prepared.body.requestId}`)
		await card.getByText('Confirm fast', { exact: true }).waitFor({ state: 'visible' })
		assert.equal(await card.getByText('Usage: input 31 · output 7', { exact: true }).count(), 1)
		assert.equal(await card.getByText('Shared concurrent evaluation', { exact: true }).count(), 1)
	})
})

test('confirmation send aborts its advise request on a session switch', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		await page.evaluate(() => window.__fixture.setConfig({ requireConfirmation: true }))
		harness.setPrepareMode('auto')
		harness.setAdviseMode('manual')
		await mountOverlay(page, [question('session-a', 'interaction-confirm-a', 'Confirm A')], 'session-a')
		await harness.waitForPrepare((record) => record.body.sessionId === 'session-a')
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByRole('button', { name: 'Confirm and send' }).click()
		const oldAdvise = await harness.waitForAdvise((record) => record.body.sessionId === 'session-a')
		const previousCommit = await page.evaluate(() => window.__fixture.commits.overlay)
		await page.evaluate(() => {
			window.__fixture.setMainSession('session-b')
			window.__fixture.setSessions([{ sessionId: 'session-b', interactionKey: 'interaction-confirm-b', question: 'Confirm B', options: ['Confirm B fast', 'Confirm B careful'] }])
		})
		await awaitOverlayCommit(page, previousCommit)
		await harness.waitForResponseClose(oldAdvise)
		await harness.waitForPrepare((record) => record.body.sessionId === 'session-b')
		await card.locator('[data-dsh-jev-advisor="preview-json"]').waitFor({ state: 'visible' })
		assert.match(await card.locator('[data-dsh-jev-advisor="preview-json"]').textContent(), /Confirm B fast/)
		assert.doesNotMatch(await card.locator('[data-dsh-jev-advisor="preview-json"]').textContent(), /Confirm A fast/)
	})
})

test('confirmation send aborts its advise request when the overlay unmounts', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		await page.evaluate(() => window.__fixture.setConfig({ requireConfirmation: true }))
		harness.setPrepareMode('auto')
		harness.setAdviseMode('manual')
		await mountOverlay(page, [question('session-a', 'interaction-confirm-unmount', 'Unmount confirm')], 'session-a')
		await harness.waitForPrepare()
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByRole('button', { name: 'Confirm and send' }).click()
		const advise = await harness.waitForAdvise()
		await page.evaluate(() => window.__fixture.unmountOverlay())
		await harness.waitForResponseClose(advise)
		assert.equal(advise.responseClosed, true)
		assert.equal(await page.locator('[data-dsh-jev-advisor="advice"]').count(), 0)
	})
})

test('settings save validates the full draft and commits one atomic mutate', async (t) => {
	await withBrowser(t, async ({ page }) => {
		await page.evaluate(() => window.__fixture.mountSettings())
		const settings = page.locator('#settings-root')
		await settings.getByRole('heading', { name: 'Jev decision advice' }).waitFor({ state: 'visible' })
		await settings.getByLabel('Endpoint').fill('https://fixture.example/v1')
		await settings.getByLabel('Model').fill('jev-browser')
		await settings.getByLabel('Timeout (ms)').fill('45000')
		await settings.getByLabel('Context messages').fill('7')
		await settings.getByLabel('Enable Jev advice').uncheck()
		await settings.getByLabel('Require confirmation before sending').check()
		await settings.getByLabel('Mask common credentials before sending').uncheck()
		assert.equal(await settings.getByText('Not all sensitive information can be detected', { exact: true }).count(), 1)
		await settings.getByRole('button', { name: 'Save' }).click()
		await settings.getByText('Saved', { exact: true }).waitFor({ state: 'visible' })

		const calls = await page.evaluate(() => window.__fixture.getScopeCalls())
		assert.equal(calls.length, 1)
		assert.equal(calls[0].method, 'mutate')
		assert.equal(calls[0].expectedRevision, 1)
		assert.deepEqual(calls[0].ops, [
			{ op: 'set', path: ['endpoint'], value: 'https://fixture.example/v1' },
			{ op: 'set', path: ['model'], value: 'jev-browser' },
			{ op: 'set', path: ['timeoutMs'], value: 45000 },
			{ op: 'set', path: ['transcriptMessages'], value: 7 },
			{ op: 'set', path: ['enabled'], value: false },
			{ op: 'set', path: ['requireConfirmation'], value: true },
			{ op: 'set', path: ['redactSensitive'], value: false },
		])
		assert.deepEqual(await page.evaluate(() => window.__fixture.getConfig()), {
			apiKey: 'sk-fixture', endpoint: 'https://fixture.example/v1', model: 'jev-browser', enabled: false,
			autoAdvise: true, includeTranscript: true, requireConfirmation: true, redactSensitive: false, transcriptMessages: 7, timeoutMs: 45000,
			cardDock: '', cardCollapsed: false,
		})
	})
})

test('settings write rejection keeps the draft, invalid numbers do not write, and clear-key checks false', async (t) => {
	await withBrowser(t, async ({ page }) => {
		await page.evaluate(() => window.__fixture.mountSettings())
		const settings = page.locator('#settings-root')
		await settings.getByText('Stored').waitFor({ state: 'visible' })

		await page.evaluate(() => window.__fixture.setMutateFailure(true))
		await settings.getByLabel('Model').fill('draft-model')
		await settings.getByRole('button', { name: 'Save' }).click()
		await settings.getByText(/host rejected the write/i).waitFor({ state: 'visible' })
		assert.equal(await settings.getByLabel('Model').inputValue(), 'draft-model')
		assert.equal(await settings.getByText('Saved', { exact: true }).count(), 0)
		const rejectedCalls = await page.evaluate(() => window.__fixture.getScopeCalls())
		assert.equal(rejectedCalls.length, 1)

		await page.evaluate(() => window.__fixture.setMutateFailure(false))
		// Chromium's number input rejects alphabetic text before React sees it;
		// an out-of-range integer exercises the same product-side invalid-number
		// validation while still going through a real DOM input event.
		await settings.getByLabel('Timeout (ms)').fill('999999')
		await settings.getByRole('button', { name: 'Save' }).click()
		await settings.getByText(/must be an integer between/i).waitFor({ state: 'visible' })
		assert.equal((await page.evaluate(() => window.__fixture.getScopeCalls())).length, 1, 'invalid input did not invoke another mutate')
		assert.equal(await settings.getByLabel('Timeout (ms)').inputValue(), '999999')

		await page.evaluate(() => window.__fixture.setMutateFailure(true))
		await settings.getByRole('button', { name: 'Clear key' }).click()
		await settings.getByText(/host rejected the write/i).waitFor({ state: 'visible' })
		assert.equal((await page.evaluate(() => window.__fixture.getScopeCalls())).at(-1).method, 'mutate')
		assert.equal(await settings.getByText('Stored').count(), 1, 'a false clear does not claim the key was cleared')
	})
})

test('saving only a blank key explains clear-key semantics instead of claiming success', async (t) => {
	await withBrowser(t, async ({ page }) => {
		await page.evaluate(() => window.__fixture.mountSettings())
		const settings = page.locator('#settings-root')
		await settings.getByText('Stored', { exact: true }).waitFor({ state: 'visible' })
		await settings.locator('input[type="password"]').fill('  ')
		await settings.getByRole('button', { name: 'Save', exact: true }).click()
		await settings.getByText('A blank key does not remove stored credentials. Use Clear key to remove them.', { exact: true }).waitFor({ state: 'visible' })
		assert.equal(await settings.getByText('Saved', { exact: true }).count(), 0)
		assert.equal(await settings.locator('input[type="password"]').inputValue(), '  ')
		assert.equal((await page.evaluate(() => window.__fixture.getScopeCalls())).length, 0)
		assert.equal((await page.evaluate(() => window.__fixture.getConfig())).apiKey, 'sk-fixture')
	})
})

test('async settings save preserves newer input and a stale revision never overwrites external settings', async (t) => {
	await withBrowser(t, async ({ page }) => {
		await page.evaluate(() => { window.__fixture.deferWrites(true); window.__fixture.mountSettings() })
		const settings = page.locator('#settings-root')
		await settings.getByLabel('Model').fill('submitted-model')
		await settings.getByRole('button', { name: 'Save', exact: true }).click()
		await settings.getByLabel('Model').fill('newer-model')
		assert.equal(await settings.getByRole('button', { name: 'Clear key' }).isDisabled(), true)
		await page.evaluate(() => window.__fixture.finishWrite())
		await settings.getByText('Saved', { exact: true }).waitFor({ state: 'visible' })
		assert.equal(await settings.getByLabel('Model').inputValue(), 'newer-model')
		await settings.getByRole('button', { name: 'Save', exact: true }).click()
		await page.evaluate(() => { window.__fixture.setConfig({ model: 'external-model' }); window.__fixture.finishWrite() })
		await settings.getByText(/host rejected the write/i).waitFor({ state: 'visible' })
		assert.equal(await settings.getByLabel('Model').inputValue(), 'newer-model')
		assert.equal((await page.evaluate(() => window.__fixture.getConfig())).model, 'external-model')
	})
})

test('async clear key preserves a new key draft and commits only the revision-bound clear', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		await page.evaluate(() => { window.__fixture.deferWrites(true); window.__fixture.mountSettings() })
		const settings = page.locator('#settings-root')
		await settings.getByText('Stored', { exact: true }).waitFor({ state: 'visible' })
		await settings.locator('input[type="password"]').fill('old-fixture-draft')
		await settings.getByRole('button', { name: 'Clear key' }).click()
		await settings.locator('input[type="password"]').fill('new-fixture-draft')
		harness.setStatus({ hasKey: false })
		await page.evaluate(() => window.__fixture.finishWrite())
		await settings.getByText('Saved', { exact: true }).waitFor({ state: 'visible' })
		assert.equal(await settings.locator('input[type="password"]').inputValue(), 'new-fixture-draft')
		assert.equal((await page.evaluate(() => window.__fixture.getConfig())).apiKey, '')
		const [clear] = await page.evaluate(() => window.__fixture.getScopeCalls())
		assert.deepEqual(clear, { method: 'mutate', expectedRevision: 1, ops: [{ op: 'set', path: ['apiKey'], value: '' }] })
		await settings.getByRole('button', { name: 'Clear key' }).click()
		await page.evaluate(() => { window.__fixture.setConfig({ apiKey: 'external-fixture-key' }); window.__fixture.finishWrite() })
		await settings.getByText(/host rejected the write/i).waitFor({ state: 'visible' })
		assert.equal((await page.evaluate(() => window.__fixture.getConfig())).apiKey, 'external-fixture-key', 'stale clear cannot erase an externally updated key')
	})
})

test('unmount during an async settings save does not request a status refresh on completion', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		await page.evaluate(() => { window.__fixture.deferWrites(true); window.__fixture.mountSettings() })
		const settings = page.locator('#settings-root')
		await settings.getByText('Stored', { exact: true }).waitFor({ state: 'visible' })
		await settings.getByLabel('Model').fill('submitted-model')
		await settings.getByRole('button', { name: 'Save', exact: true }).click()
		const count = harness.getRecords('status').length
		await page.evaluate(async () => {
			window.__fixture.unmountSettings()
			window.__fixture.finishWrite()
			await new Promise((resolve) => setTimeout(resolve, 0))
		})
		assert.equal(harness.getRecords('status').length, count)
		assert.equal(await settings.textContent(), '')
	})
})

for (const method of ['status', 'test']) test(`settings unmount aborts the real browser ${method} request`, { timeout: 15_000 }, async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		if (method === 'status') harness.setStatusMode('manual')
		else harness.setTestMode('manual')
		await page.evaluate(() => window.__fixture.mountSettings())
		if (method === 'test') await page.locator('#settings-root').getByRole('button', { name: 'Test connection' }).click()
		const request = await harness.waitForRequest(method)
		await page.evaluate(() => window.__fixture.unmountSettings())
		await harness.waitForResponseClose(request)
		assert.equal(request.responseClosed, true)
		assert.equal(await page.locator('#settings-root').textContent(), '')
	})
})

test('loading or unavailable settings are not writable, and unmount aborts pending effects', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		await page.evaluate(() => {
			window.__fixture.setScopeStatus('loading', true)
			window.__fixture.mountSettings()
		})
		const settings = page.locator('#settings-root')
		assert.equal(await settings.getByRole('button', { name: 'Save' }).isDisabled(), true)
		assert.equal(await settings.getByRole('button', { name: 'Clear key' }).isDisabled(), true)
		assert.equal((await page.evaluate(() => window.__fixture.getScopeCalls())).length, 0)
		await page.evaluate(() => window.__fixture.setScopeStatus('unavailable', false))
		await settings.getByText(/settings service is unavailable/i).waitFor({ state: 'visible' })
		assert.equal(await settings.getByRole('button', { name: 'Save' }).isDisabled(), true)

		harness.setAdviseMode('manual')
		await page.evaluate(() => {
			window.__fixture.setScopeStatus('ready', true)
			window.__fixture.setMainSession('session-a')
			window.__fixture.setSessions([{ sessionId: 'session-a', interactionKey: 'interaction-a', question: 'Unmount', options: ['Unmount fast', 'Unmount careful'] }])
			window.__fixture.mountOverlay()
		})
		const request = await harness.waitForAdvise()
		await page.evaluate(() => window.__fixture.unmountOverlay())
		await harness.resolveAdvise(request)
		assert.equal(await page.locator('[data-dsh-jev-advisor="advice"]').count(), 0)
		assert.equal((await page.evaluate(() => window.__fixture.getAnswerCalls())).length, 0)
	})
})

test('divergent probabilities are a judgment hint and do not change adoption permission', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		harness.setAdviceOverride((questions) => questions.map((item) => ({
			questionId: item.id,
			kind: 'choice',
			supported: true,
			answered: true,
			pick: { index: 0, label: item.options[0].label, probability: 0.55 },
			noneOfTheAbove: false,
			noneProbability: 0,
			confidence: 0.99,
			probabilities: [
				{ index: 0, label: item.options[0].label, probability: 0.55 },
				{ index: 1, label: item.options[1].label, probability: 0.45 },
			],
		})))
		harness.setAdviseMode('auto')
		await mountOverlay(page, [question('session-a', 'interaction-close', 'Close')], 'session-a')
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByText('The recommendation is close to another option; use your judgment.', { exact: true }).waitFor({ state: 'visible' })
		assert.equal(await card.getByRole('button', { name: /Adopt Jev/ }).isDisabled(), false)

		harness.setAdviceOverride((questions) => questions.map((item) => ({
			questionId: item.id,
			kind: 'choice',
			supported: true,
			answered: true,
			pick: { index: 0, label: item.options[0].label, probability: 0.1 },
			noneOfTheAbove: false,
			noneProbability: 0.2,
			probabilities: [
				{ index: 0, label: item.options[0].label, probability: 0.1 },
				{ index: 1, label: item.options[1].label, probability: 0.7 },
			],
		})))
		await page.evaluate(() => window.__fixture.setSessions([{ sessionId: 'session-a', interactionKey: 'interaction-reversed', question: 'Reversed', options: ['Reversed fast', 'Reversed careful'] }]))
		const reversed = page.locator('[data-dsh-jev-advisor="advice"]')
		await reversed.getByText('Another option has a higher probability than the recommendation; use your judgment.', { exact: true }).waitFor({ state: 'visible' })
		assert.equal(await reversed.getByRole('button', { name: /Strongly/ }).count(), 0)
	})
})

test('recommended options are bold blue and probability numbers are blue without emphasizing alternatives', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		harness.setAdviseMode('auto')
		await mountOverlay(page, [{
			sessionId: 'session-a', interactionKey: 'interaction-highlight',
			questions: [
				{ id: 'single', question: 'Single question', options: ['Single selected', 'Single alternative'] },
				{ id: 'multi', question: 'Multi question', options: ['Multi selected', 'Multi alternative'], multiSelect: true },
			],
		}], 'session-a')
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByText('Multi selected', { exact: true }).waitFor({ state: 'visible' })
		for (const label of ['Single selected', 'Multi selected']) {
			const style = await card.getByText(label, { exact: true }).evaluate((node) => ({ color: getComputedStyle(node).color, weight: Number(getComputedStyle(node).fontWeight) }))
			assert.equal(style.color, 'rgb(37, 99, 235)', `${label} is visibly blue`)
			assert.ok(style.weight >= 700, `${label} is bold`)
		}
		for (const value of ['20%', '80%']) {
			assert.equal(await card.getByText(value, { exact: true }).evaluate((node) => getComputedStyle(node).color), 'rgb(37, 99, 235)', `${value} is blue, not black`)
		}
		assert.ok(await card.getByText('Single alternative', { exact: true }).evaluate((node) => Number(getComputedStyle(node).fontWeight) < 700))
		assert.equal((await page.evaluate(() => window.__fixture.getAnswerCalls())).length, 0)
	})
})

test('ready advice copies only the original question and selected option text without submitting', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		await page.evaluate(() => {
			const writes = []
			Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText(value) { writes.push(value); return Promise.resolve() } } })
			window.__clipboardWrites = writes
		})
		harness.setAdviseMode('auto')
		await mountOverlay(page, [{
			sessionId: 'session-a', interactionKey: 'interaction-copy',
			questions: [
				{ id: 'first', question: 'First question', options: ['First selected', 'First unselected'] },
				{ id: 'second', question: 'Second question', options: ['Second selected', 'Second unselected'], multiSelect: true },
			],
		}], 'session-a')
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByText('First selected', { exact: true }).waitFor({ state: 'visible' })
		const copy = card.getByRole('button', { name: 'Copy suggestion' })
		assert.equal(await copy.isDisabled(), false)
		await copy.click()
		await card.getByRole('button', { name: 'Copied' }).waitFor({ state: 'visible' })
		const copied = await page.evaluate(() => window.__clipboardWrites.at(-1))
		assert.match(copied, /First question/)
		assert.match(copied, /First selected/)
		assert.doesNotMatch(copied, /First unselected/)
		assert.match(copied, /Second question/)
		assert.match(copied, /Second selected/)
		assert.doesNotMatch(copied, /Second unselected/)
		assert.equal((await page.evaluate(() => window.__fixture.getAnswerCalls())).length, 0)
	})
})

test('clipboard rejection is visible and never reports success or submits', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText() { return Promise.reject(new Error('clipboard denied')) } },
		}))
		harness.setAdviseMode('auto')
		await mountOverlay(page, [question('session-a', 'interaction-copy-fail', 'Copy fail')], 'session-a')
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByText('Copy fail fast', { exact: true }).waitFor({ state: 'visible' })
		await card.getByRole('button', { name: 'Copy suggestion' }).click()
		await card.getByText('Copy failed: clipboard denied', { exact: true }).waitFor({ state: 'visible' })
		assert.equal(await card.getByRole('button', { name: 'Copied' }).count(), 0)
		assert.equal((await page.evaluate(() => window.__fixture.getAnswerCalls())).length, 0)
	})
})

test('a delayed clipboard promise cannot mark a replacement interaction as copied', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		await page.evaluate(() => {
			const pending = []
			Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText() { return new Promise((resolve) => pending.push(resolve)) } } })
			window.__clipboardPending = pending
		})
		harness.setAdviseMode('auto')
		await mountOverlay(page, [question('session-a', 'interaction-copy-stale-a', 'Copy A')], 'session-a')
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByText('Copy A fast', { exact: true }).waitFor({ state: 'visible' })
		await card.getByRole('button', { name: 'Copy suggestion' }).click()
		await page.waitForFunction(() => window.__clipboardPending.length === 1)
		await page.evaluate(() => window.__fixture.setSessions([{ sessionId: 'session-a', interactionKey: 'interaction-copy-stale-b', question: 'Copy B', options: ['Copy B fast', 'Copy B careful'] }]))
		await card.getByText('Copy B fast', { exact: true }).waitFor({ state: 'visible' })
		await page.evaluate(() => window.__clipboardPending.shift()())
		await page.waitForTimeout(0)
		assert.equal(await card.getByRole('button', { name: 'Copied' }).count(), 0)
		assert.equal(await card.getByRole('button', { name: 'Copy suggestion' }).count(), 1)
	})
})

test('temporary preference applies once, is echoed, cancels the old request, and clears on a new interaction', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		harness.setAdviseMode('manual')
		await mountOverlay(page, [question('session-a', 'interaction-pref-a', 'Preference A')], 'session-a')
		const first = await harness.waitForAdvise()
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		const preference = card.locator('[data-dsh-jev-advisor="decision-preference"]')
		await preference.locator('textarea').fill('  Prefer stability this time  ')
		assert.equal(harness.getRecords('advise').length, 1, 'typing does not request a new evaluation')
		await preference.getByRole('button', { name: 'Apply and re-evaluate' }).click()
		await harness.waitForResponseClose(first)
		const second = await harness.waitForAdvise((record) => record !== first)
		assert.equal(second.body.decisionPreference, 'Prefer stability this time')
		await harness.resolveAdvise(second)
		await card.getByText('Preference A fast', { exact: true }).waitFor({ state: 'visible' })
		assert.equal(await preference.locator('textarea').inputValue(), '  Prefer stability this time  ')

		await page.evaluate(() => window.__fixture.setSessions([{ sessionId: 'session-a', interactionKey: 'interaction-pref-b', question: 'Preference B', options: ['Preference B fast', 'Preference B careful'] }]))
		const third = await harness.waitForAdvise((record) => record !== first && record !== second)
		assert.equal(Object.hasOwn(third.body, 'decisionPreference'), false)
		await harness.resolveAdvise(third)
		await card.getByText('Preference B fast', { exact: true }).waitFor({ state: 'visible' })
		const preferenceB = card.locator('[data-dsh-jev-advisor="decision-preference"] textarea')
		assert.equal(await preferenceB.inputValue(), '')
		await preferenceB.fill('B draft only')
		assert.equal(harness.getRecords('advise').length, 3, 'a new interaction draft does not revive or send the previous preference')

		await page.evaluate(() => window.__fixture.setSessions([{ sessionId: 'session-a', interactionKey: 'interaction-pref-a', question: 'Preference A again', options: ['Preference A again fast', 'Preference A again careful'] }]))
		const fourth = await harness.waitForAdvise((record) => record !== first && record !== second && record !== third)
		assert.equal(Object.hasOwn(fourth.body, 'decisionPreference'), false, 'returning to an old interaction does not restore its previous preference')
		await harness.resolveAdvise(fourth)
		await card.getByText('Preference A again fast', { exact: true }).waitFor({ state: 'visible' })
		assert.equal(await card.locator('[data-dsh-jev-advisor="decision-preference"] textarea').inputValue(), '')
	})
})

test('temporary preference in confirmation mode re-prepares instead of advising directly', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		await page.evaluate(() => window.__fixture.setConfig({ requireConfirmation: true }))
		harness.setPrepareMode('manual')
		harness.setAdviseMode('manual')
		await mountOverlay(page, [question('session-a', 'interaction-pref-confirm', 'Preference confirm')], 'session-a')
		const first = await harness.waitForPrepare()
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		const preference = card.locator('[data-dsh-jev-advisor="decision-preference"]')
		await preference.locator('textarea').fill('Finish quickly')
		await preference.getByRole('button', { name: 'Apply and re-evaluate' }).click()
		await harness.waitForResponseClose(first)
		const second = await harness.waitForPrepare((record) => record !== first)
		assert.equal(second.body.decisionPreference, 'Finish quickly')
		assert.equal(harness.getRecords('advise').length, 0)
	})
})

test('布局保存到 profile，重载后恢复且不再发起额外评估', async (t) => {
	await withBrowser(t, async ({ page, harness }) => {
		harness.setAdviseMode('auto')
		await mountOverlay(page, [question('session-a', 'interaction-layout', 'Layout')], 'session-a')
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByText('Layout fast', { exact: true }).waitFor({ state: 'visible' })
		await card.getByRole('button', { name: 'Dock right' }).click()
		await card.getByRole('button', { name: 'Collapse' }).click()
		await page.waitForFunction(() => window.__fixture.getConfig().cardDock === 'right' && window.__fixture.getConfig().cardCollapsed === true)
		const saved = await page.evaluate(() => window.__fixture.getConfig())
		assert.equal(harness.getRecords('advise').length, 1, '改变停靠与折叠不能重新计费')
		assert.equal(await page.evaluate(() => localStorage.getItem('dsh-jev-advisor:layout:v1')), null)
		await page.reload({ waitUntil: 'load' })
		await page.waitForFunction(() => window.__fixture?.ready === true)
		await page.evaluate(value => window.__fixture.setConfig(value), saved)
		await mountOverlay(page, [question('session-a', 'interaction-layout-reload', 'Layout reload')], 'session-a')
		const reloaded = page.locator('[data-dsh-jev-advisor="advice"]')
		await reloaded.getByText('Layout reload fast', { exact: true }).waitFor({ state: 'hidden' })
		assert.equal(await reloaded.getAttribute('data-dock'), 'right')
		assert.equal(await reloaded.getAttribute('data-collapsed'), 'true')

		await page.evaluate(() => Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('storage denied') } }))
		await page.evaluate(() => window.__fixture.setSessions([{ sessionId: 'session-a', interactionKey: 'interaction-layout-storage-denied', question: 'Storage denied', options: ['Storage fast', 'Storage careful'] }]))
		await reloaded.waitFor({ state: 'visible' })
		assert.equal(await reloaded.getAttribute('data-dock'), 'right')
	})
})

test('profile 布局跨浏览器端口恢复，临时决策偏好不进入 profile', async (t) => {
	let saved, firstOrigin
	await withBrowser(t, async ({ page, harness }) => {
		firstOrigin = harness.origin
		await mountOverlay(page, [question('a', 'port-one', 'Port one')], 'a')
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByText('Port one fast', { exact: true }).waitFor()
		await card.locator('textarea').fill('This preference stays temporary')
		await card.getByRole('button', { name: 'Dock right' }).click()
		await card.getByRole('button', { name: 'Collapse' }).click()
		await page.waitForFunction(() => window.__fixture.getConfig().cardCollapsed === true)
		saved = await page.evaluate(() => window.__fixture.getConfig())
		assert.doesNotMatch(JSON.stringify(saved), /This preference|decisionPreference|port-one/)
	})
	await withBrowser(t, async ({ page, harness }) => {
		assert.notEqual(harness.origin, firstOrigin)
		await page.evaluate(value => window.__fixture.setConfig(value), saved)
		await mountOverlay(page, [question('b', 'port-two', 'Port two')], 'b')
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.waitFor()
		assert.equal(await card.getAttribute('data-dock'), 'right')
		assert.equal(await card.getAttribute('data-collapsed'), 'true')
		await card.getByRole('button', { name: 'Expand' }).click()
		assert.equal(await card.locator('textarea').inputValue(), '')
	})
})

test('异步问题仅通道切换也刷新 UI：waterfall 转 rpc 可采纳，关闭后不可提交', async t => {
	await withBrowser(t, async ({ page, harness }) => {
		await mountOverlay(page, [question('s', 'async-question', 'Async')], 's')
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByText('Async fast', { exact: true }).waitFor()
		await page.evaluate(() => window.__fixture.setInteractionState('async-question', { channel: 'rpc', state: 'continued' }))
		assert.equal(harness.getRecords('advise').length, 1)
		await card.getByRole('button', { name: /Adopt Jev/ }).click()
		assert.equal((await page.evaluate(() => window.__fixture.getAnswerCalls())).length, 1)
		await page.evaluate(() => window.__fixture.setInteractionState('async-question', { channel: 'none', closed: true }))
		await card.waitFor({ state: 'hidden' })
		assert.equal(harness.getRecords('advise').length, 1)
	})
})

test('已移除通道取消旧请求，重新可回答时只显示新的建议', async t => {
	await withBrowser(t, async ({ page, harness }) => {
		harness.setAdviseMode('manual')
		await mountOverlay(page, [question('s', 'async-wait', 'Waiting')], 's')
		const first = await harness.waitForAdvise()
		await page.evaluate(() => window.__fixture.setInteractionState('async-wait', { channel: 'none' }))
		await harness.waitForResponseClose(first)
		assert.equal(await page.locator('[data-dsh-jev-advisor="advice"]').count(), 0)
		await page.evaluate(() => window.__fixture.setInteractionState('async-wait', { channel: 'rpc', state: 'continued' }))
		const second = await harness.waitForAdvise(record => record !== first)
		await harness.resolveAdvise(second)
		await page.getByText('Waiting fast', { exact: true }).waitFor()
	})
})

test('停用再启用只挂载一张卡片，旧请求与旧预览不会复活', async t => {
	await withBrowser(t, async ({ page, harness }) => {
		harness.setAdviseMode('manual')
		await mountOverlay(page, [question('s', 'toggle-question', 'Toggle')], 's')
		const old = await harness.waitForAdvise()
		await page.evaluate(() => { window.__fixture.unmountOverlay(); window.__fixture.mountOverlay() })
		await harness.waitForResponseClose(old)
		const next = await harness.waitForAdvise(record => record !== old)
		await harness.resolveAdvise(next)
		await page.getByText('Toggle fast', { exact: true }).waitFor()
		assert.equal(await page.locator('[data-dsh-jev-advisor="advice"]').count(), 1)
		assert.equal((await page.evaluate(() => window.__fixture.getAnswerCalls())).length, 0)
	})
})

test('布局写入被拒绝时显示提示，保留本次布局且仍可采纳', async t => {
	await withBrowser(t, async ({ page, harness }) => {
		await mountOverlay(page, [question('s', 'layout-refusal', 'Refusal')], 's')
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByText('Refusal fast', { exact: true }).waitFor()
		await page.evaluate(() => window.__fixture.setMutateFailure(true))
		await card.getByRole('button', { name: 'Dock right' }).click()
		await card.getByText(/Layout could not be saved/).waitFor()
		assert.equal(await card.getAttribute('data-dock'), 'right')
		assert.equal(harness.getRecords('advise').length, 1)
		assert.equal(await card.getByRole('button', { name: /Adopt Jev/ }).isDisabled(), false)
		assert.equal((await page.evaluate(() => window.__fixture.getScopeCalls())).length, 1)
		await page.evaluate(() => window.__fixture.setMutateFailure(false))
		await card.getByRole('button', { name: 'Collapse' }).click()
		await page.waitForFunction(() => window.__fixture.getConfig().cardCollapsed === true)
		assert.equal(await card.getByText(/Layout could not be saved/).count(), 0)
	})
})

test('预览中的布局保存不替换令牌、不发评估，卸载后重新准备', async t => {
	await withBrowser(t, async ({ page, harness }) => {
		await page.evaluate(() => window.__fixture.setConfig({ requireConfirmation: true }))
		await mountOverlay(page, [question('s', 'preview-layout', 'Preview layout')], 's')
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByRole('button', { name: 'Confirm and send' }).waitFor()
		const before = await harness.waitForPrepare()
		await card.getByRole('button', { name: 'Dock right' }).click()
		await page.waitForFunction(() => window.__fixture.getConfig().cardDock === 'right')
		assert.equal(harness.getRecords('prepare').length, 1)
		assert.equal(harness.getRecords('advise').length, 0)
		await page.evaluate(() => { window.__fixture.unmountOverlay(); window.__fixture.mountOverlay() })
		await harness.waitForPrepare(record => record !== before)
		await card.getByRole('button', { name: 'Confirm and send' }).click()
		const sent = await harness.waitForAdvise()
		assert.equal(sent.body.previewToken, `preview-${harness.getRecords('prepare').at(-1).body.requestId}`)
	})
})

test('异步清 Key 卸载后完成不能刷新旧页或清掉新挂载的草稿', async t => {
	await withBrowser(t, async ({ page, harness }) => {
		await page.evaluate(() => { window.__fixture.deferWrites(true); window.__fixture.mountSettings() })
		const settings = page.locator('#settings-root')
		await settings.getByText('Stored', { exact: true }).waitFor()
		await settings.getByRole('button', { name: 'Clear key' }).click()
		await page.evaluate(() => { window.__fixture.unmountSettings(); window.__fixture.mountSettings() })
		await settings.getByText('Stored', { exact: true }).waitFor()
		await settings.getByLabel('API key').fill('new-fixture-draft')
		const before = harness.getRecords('status').length
		await page.evaluate(() => window.__fixture.finishWrite(false))
		await settings.getByLabel('API key').inputValue().then(value => assert.equal(value, 'new-fixture-draft'))
		assert.equal(harness.getRecords('status').length, before)
	})
})

test('布局镜像先到而 CAS 回执未到时隐藏旧建议，接受后恢复且不重新评估', async t => {
	await withBrowser(t, async ({ page, harness }) => {
		await mountOverlay(page, [question('s', 'layout-ack', 'Ack')], 's')
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByText('Ack fast', { exact: true }).waitFor()
		await page.evaluate(() => window.__fixture.deferWrites(true))
		await card.getByRole('button', { name: 'Dock right' }).click()
		await page.evaluate(() => window.__fixture.commitWriteBeforeAck())
		await card.getByText('Ack fast', { exact: true }).waitFor({ state: 'hidden' })
		assert.equal(await card.getByRole('button', { name: /Adopt Jev/ }).count(), 0)
		await page.evaluate(() => window.__fixture.finishWrite())
		await card.getByText('Ack fast', { exact: true }).waitFor()
		assert.equal(harness.getRecords('advise').length, 1)
	})
})

test('来源不明的布局修订仍使旧建议失效，不能误判隐藏 Key 与布局的混合写入', async t => {
	await withBrowser(t, async ({ page, harness }) => {
		await mountOverlay(page, [question('s', 'external-layout', 'External')], 's')
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByText('External fast', { exact: true }).waitFor()
		harness.setAdviseMode('manual')
		await page.evaluate(() => window.__fixture.setConfig({ cardDock: 'right' }))
		const next = await harness.waitForAdvise(record => record !== harness.getRecords('advise')[0])
		assert.equal(await card.getByRole('button', { name: /Adopt Jev/ }).count(), 0)
		await harness.resolveAdvise(next)
		await card.getByText('External fast', { exact: true }).waitFor()
		assert.equal(harness.getRecords('advise').length, 2)
	})
})

test('四大新增卖点浏览器端闭环：越权审批采纳、限时提问防超时、多视角取舍对比与 Plan Review 要求修改', { timeout: 30_000 }, async t => {
	await withBrowser(t, async ({ page, harness }) => {
		harness.setAdviseMode('auto')
		harness.setAdviceOverride((questions) => questions.map((item) => ({
			questionId: item.id,
			kind: 'choice',
			supported: true,
			answered: true,
			pick: item.planReview ? undefined : { index: 1, label: item.options[1]?.label ?? item.options[0].label, probability: 0.85 },
			noneOfTheAbove: Boolean(item.planReview),
			noneProbability: item.planReview ? 0.85 : 0.05,
			confidence: 0.9,
			...(item.approval ? { riskScore: { score: 2, confidence: 0.9 } } : {}),
			...(item.planReview ? { planScore: { score: 0, confidence: 0.85 } } : {}),
			perspectives: [
				{ id: 'stable', pick: { index: 0, label: item.options[0].label, probability: 0.8 }, noneOfTheAbove: false, noneProbability: 0.1 },
				{ id: 'fast', pick: { index: 1, label: item.options[1]?.label ?? item.options[0].label, probability: 0.9 }, noneOfTheAbove: false, noneProbability: 0.05 },
				{ id: 'minimal', pick: { index: 0, label: item.options[0].label, probability: 0.75 }, noneOfTheAbove: false, noneProbability: 0.1 },
			],
			probabilities: item.options.map((opt, idx) => ({
				index: idx,
				label: opt.label,
				probability: item.planReview ? 0.15 : idx === 1 ? 0.85 : 0.1,
			})),
		})))

		await mountOverlay(page, [{
			sessionId: 's',
			interactionKey: 'approval-1',
			kind: 'approval',
			toolName: 'bash',
			callId: 'call-9',
			reason: 'Run privileged script',
		}], 's')
		const card = page.locator('[data-dsh-jev-advisor="advice"]')
		await card.getByText('Risk rating: High risk (2/2)').waitFor()
		await card.getByText('Trade-off perspectives', { exact: true }).waitFor()
		await card.getByLabel('Compare trade-off perspectives in one request (adaptive / 1–5 customizable)').check()
		await harness.waitForAdvise(record => record.body.comparePerspectives === true)
		const editor = card.locator('[data-dsh-jev-advisor="perspectives-editor"]')
		await editor.waitFor()
		assert.deepEqual(
			await editor.locator('[data-dsh-jev-advisor="perspectives-active"] > span > span').allTextContents(),
			['Security & blast radius', 'Unblock task progress'],
			'approval question adapts to 2 security/progress perspectives instead of 3 hardcoded code perspectives',
		)
		await editor.getByPlaceholder('Custom perspective (e.g. Zero new deps)').fill('Audit trail compliance')
		await editor.getByRole('button', { name: 'Add perspective' }).click()
		// 显式阻挡新请求到达 mock，稳定重现点击完成但宿主尚未收到请求的窗口。
		let releaseRequest
		const requestGate = new Promise(resolve => { releaseRequest = resolve })
		await page.route(`${harness.origin}/dsh-jev-advisor/api/advise`, async route => {
			await requestGate
			await route.fallback()
		})
		try {
			const previousRequests = new Set(harness.getRecords('advise'))
			await editor.getByRole('button', { name: 'Compare selected perspectives' }).click()
			assert.equal(harness.getRecords('advise').length, previousRequests.size, '请求闸门放行前只存在旧请求')
			releaseRequest()
			const compared = await harness.waitForAdvise(record => !previousRequests.has(record))
			assert.equal(compared.body.interactionKey, 'approval-1')
			assert.deepEqual(
				compared.body.perspectives.map((item) => item.label),
				['Security & blast radius', 'Unblock task progress', 'Audit trail compliance'],
			)
		} finally {
			releaseRequest()
		}
		await card.getByRole('button', { name: 'Adopt: Reject' }).click()
		const approvalCalls = await page.evaluate(() => window.__fixture.getAnswerCalls())
		assert.deepEqual(approvalCalls.at(-1), { sessionId: 's', interactionKey: 'approval-1', payload: 'rejected' })

		await page.evaluate(() => window.__fixture.setSessions([{
			sessionId: 's',
			interactionKey: 'plan-1',
			kind: 'plan-review',
			timed: true,
			questions: [{
				id: 'plan',
				question: 'Approve deployment plan?',
				detail: '# Plan\n1. Drop production table',
				intent: { kind: 'plan-review', approve: 'Approve' },
				options: ['Approve'],
			}],
		}]))
		await card.getByText('Auto-skip timer paused').waitFor()
		await card.getByText('Plan readiness: Major gaps or risks (0/2)').waitFor()
		await card.getByRole('button', { name: 'Adopt: Request changes' }).click()
		const timerCalls = await page.evaluate(() => window.__fixture.getTimerCalls())
		const planCalls = await page.evaluate(() => window.__fixture.getAnswerCalls())
		assert.ok(timerCalls.some((c) => c.interactionKey === 'plan-1' && c.action === 'takeTime'))
		assert.deepEqual(planCalls.at(-1), { sessionId: 's', interactionKey: 'plan-1', dismissed: true })
	})
})
