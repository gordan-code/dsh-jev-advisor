window.__ModuleLoader__.load({
	id: 'dsh-jev-advisor',
	factory: (require) => {
		var module = { exports: {} }
		var exports = module.exports
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

		const React = require('react')
		const h = React.createElement

		/** Dictionary namespace owned by this plugin. */
		const NS = 'dsh-jev-advisor'
		/** Profile entry id the Host projects this plugin's Config form under. */
		const SETTINGS_NAMESPACE = 'dsh-jev-advisor'
		/** Loopback-only JSON bridge mounted by the host half. */
		const API = '/dsh-jev-advisor/api'

		/* ------------------------------------------------------------------ *
		 * Copy
		 * ------------------------------------------------------------------ */

		const zh = {
			'panel.title': 'Jev 建议',
			'panel.subtitle': 'TypeSafe System One 对这道选择题的判断',
			'panel.loading': '正在询问 Jev…',
			'panel.ask': '询问 Jev',
			'panel.manualHint': '当前为按需模式，点击后才进入评估流程；实际发送可能产生 API 用量。',
			'panel.preferenceApplyIdle': '保存本次偏好',
			'panel.preferenceNext': '偏好将在你点击“询问 Jev”后使用。',
			'panel.preparing': '正在准备本地预览…',
			'panel.loadingAutoWithTranscript': '自动请求 Jev，将携带最近会话',
			'panel.loadingAutoWithoutTranscript': '自动请求 Jev，将不携带最近会话',
			'panel.disabled': 'Jev 建议已在「设置 → Jev」中关闭。',
			'panel.regionBlocked': 'Jev 服务在你当前所在的地区不可用（451 地区限制）。重试无效；需要从受支持的地区访问，或改用其他评估服务。',
			'panel.noKey': '还没有配置 Jev API Key。请在「设置 → Jev」里填写并保存。',
			'panel.retry': '重试',
			'panel.dismiss': '关闭',
			'panel.recommend': '推荐',
			'panel.confidence': '置信度',
			'panel.otherOptions': '其他选项',
			'panel.noneOfTheAbove': 'Jev 认为以上选项都不合适，需要你自行填写答案。',
			'panel.adopt': '采纳 Jev 建议',
			'panel.adopting': '提交中…',
			'panel.partial': '本批次里还有问题没有得到 Jev 的明确建议，请手动选择后再提交。',
			'panel.unanswered': 'Jev 返回的答案不完整或格式异常，请重试或手动作答。',
			'panel.json': '查看结构化 JSON 请求与响应',
			'panel.request': '请求（发送给 Jev）',
			'panel.response': '响应（Jev 返回）',
			'panel.model': '模型',
			'panel.multiSelect': '多选',
			'panel.adoptFailed': '采纳失败：{message}',
			'panel.question': '问题 {index}',
			'panel.confirm': '确认发送',
			'panel.preview': '发送前预览（不会请求 Jev）',
			'panel.context': '发送上下文：{summary}',
			'panel.usage': '用量：输入 {input} · 输出 {output}',
			'panel.reused': '复用并发评估',
			'panel.bytes': '{bytes} 字节',
			'panel.open': '重新打开 Jev 建议',
			'panel.collapse': '折叠',
			'panel.expand': '展开',
			'panel.dockLeft': '停靠左侧',
			'panel.dockRight': '停靠右侧',
			'panel.dockHelp': '浮层只使用公开槽位信息，不读取宿主私有 DOM；默认停靠左侧以避开右栏。',
			'panel.layoutSaveFailed': '布局未能保存到当前配置，仅在本次打开期间保留；再次调整可重试。',
			'panel.transcriptIncluded': '已包含对话上下文',
			'panel.transcriptOmitted': '未包含对话上下文',
			'panel.chars': '{count} 字符',
			'panel.redactions': '{count} 处脱敏',
			'panel.truncated': '已截断',
			'panel.probabilityClose': '推荐与其他选项的概率接近，请结合实际判断。',
			'panel.probabilityOtherHigher': '其他选项的概率高于推荐项，请结合实际判断。',
			'panel.multiProbabilityClose': '这些选项的概率接近一半，请结合实际判断：{options}',
			'panel.copy': '复制建议',
			'panel.copied': '已复制',
			'panel.copyFailed': '复制失败：{message}',
			'panel.preferenceLabel': '临时决策偏好（仅本次交互）',
			'panel.preferencePlaceholder': '告诉 Jev 这次更看重什么（最多 500 字符）',
			'panel.preferenceApply': '应用并重新评估',
			'panel.preferenceApplied': '将产生新评估。',
			'panel.preferenceStable': '优先稳定',
			'panel.preferenceFast': '尽快完成',
			'panel.preferenceMinimal': '尽量少改代码',
			'panel.comparePerspectives': '单次请求多视角取舍对比（按问题自适应 / 可自定义 1~5 个视角）',
			'panel.perspectivesTitle': '多视角取舍对比',
			'panel.perspectivesConsistent': '{count} 个视角一致推荐该项',
			'panel.perspective.stable': '优先稳定',
			'panel.perspective.fast': '尽快完成',
			'panel.perspective.minimal': '尽量少改代码',
			'panel.perspective.security': '安全与最小影响',
			'panel.perspective.progress': '推进当前任务',
			'panel.perspective.completeness': '方案完备与边界覆盖',
			'panel.perspective.ux': '用户体验与交互清晰',
			'panel.perspective.extensibility': '长期可扩展性',
			'panel.perspectivesEditorTitle': '当前对比视角（1~5 个，按问题类型自动匹配，可增删）',
			'panel.perspectiveQuickAdd': '快捷添加：',
			'panel.perspectiveCustomPlaceholder': '输入自定义视角（如：零外部依赖）',
			'panel.perspectiveAdd': '添加视角',
			'panel.perspectiveApply': '按所选视角重新对比',
			'panel.perspectiveApplyIdle': '保存所选视角',
			'panel.perspectiveRemove': '移除视角 {label}',
			'panel.riskScore.0': '风险评估：低风险 (0/2)',
			'panel.riskScore.1': '风险评估：中风险 (1/2)',
			'panel.riskScore.2': '风险评估：高风险 (2/2)',
			'panel.planScore.0': '计划完整度：存在明显缺口或风险 (0/2)',
			'panel.planScore.1': '计划完整度：基本可行但有待完善 (1/2)',
			'panel.planScore.2': '计划完整度：完备可行 (2/2)',
			'panel.adoptAllowOnce': '采纳：允许本次执行',
			'panel.adoptReject': '采纳：拒绝执行',
			'panel.adoptPlanDismiss': '采纳：要求修改计划',
			'panel.countdownHeld': '已暂停限时自动跳过',
			'panel.countdownActive': '限时提问倒计时中（发起评估或聚焦卡片将自动保持）',
			'panel.takeTime': '暂停倒计时',

			'settings.nav': 'Jev',
			'settings.title': 'Jev 决策建议',
			'settings.description':
				'当模型用 ask_user_question 交给你一道选择题时，dsh-jev-advisor 会把它转成 TypeSafe（Jev / System One）的结构化请求，并把 Jev 的推荐显示在选项旁边，可一键采纳。',
			'settings.apiKey': 'API Key',
			'settings.apiKeySet': '已保存（出于安全不会回显；输入新值可覆盖）',
			'settings.apiKeyUnset': '未配置',
			'settings.apiKeyPlaceholder': 'sk-...',
			'settings.endpoint': '接口地址',
			'settings.model': '模型',
			'settings.enabled': '启用 Jev 建议',
			'settings.autoAdvise': '自动获取 Jev 建议',
			'settings.autoAdviseHint': '默认关闭（升级用户也适用）。关闭时需点击“询问 Jev”；开启后，出现可评估的问题会自动进入评估流程，仍遵守发送前确认设置，实际发送可能产生 API 用量。修改后请保存。',
			'settings.diagnostics': '本地健康检查',
			'settings.diagnosticsHint': '仅检查本地信息，不调用 Jev；版本声明匹配不等于所有功能已验证。无法读取时显示未知。',
			'settings.pluginVersion': '插件版本',
			'settings.dshVersion': 'DSH 版本',
			'settings.declaredDsh': '声明支持的 DSH',
			'settings.declarationMatch': '版本声明检查',
			'settings.match': '匹配声明',
			'settings.mismatch': '不在声明范围内，请检查插件更新',
			'settings.unknown': '未知',
			'settings.yes': '是',
			'settings.no': '否',
			'settings.hasKey': '已配置 Key',
			'settings.diagnosticUnavailable': '本地状态暂不可用，请确认宿主已更新并尝试重新打开设置。',
			'settings.copyDiagnostics': '复制脱敏诊断',
			'settings.diagnosticCopied': '已复制诊断',
			'settings.diagnosticCopyFailed': '诊断复制失败，请检查剪贴板权限后重试。',
			'settings.testHint': '“测试连接”会向当前已保存的端点发送一次评估请求，可能产生 API 用量；本地健康检查不会。',
			'settings.includeTranscript': '把最近的对话作为 state 一起发送',
			'settings.requireConfirmation': '发送前要求确认',
			'settings.redactSensitive': '发送前遮盖常见凭证',
			'settings.redactSensitiveHint': '不能识别所有敏感信息',
			'settings.comparePerspectives': '默认开启单次请求「多视角取舍对比」（自动按问题匹配或使用下方自定义视角）',
			'settings.customPerspectives': '默认对比视角（可选，逗号分隔 1~5 个；留空则按问题类型自动匹配）',
			'settings.customPerspectivesPlaceholder': '例如：安全与最小影响, 尽量少改代码, 尽快完成',
			'settings.transcriptMessages': '上下文消息条数',
			'settings.timeoutMs': '超时（毫秒）',
			'settings.save': '保存',
			'settings.saving': '保存中…',
			'settings.saved': '已保存',
			'settings.rejected': '宿主拒绝了保存，设置可能已在其他窗口修改。当前修改已保留，请重试。',
			'settings.blankKey': '空白 Key 不会清除已存凭据。若要清除，请使用“清除 Key”。',
			'settings.test': '测试连接',
			'settings.testing': '测试中…',
			'settings.testOk': '连接正常，模型 {model}',
			'settings.clearKey': '清除 Key',
			'settings.unsaved': '有未保存的修改',
			'settings.unavailable': '设置服务不可用，当前使用插件组合配置。',
			'settings.help': 'Key 在 console.typesafe.ai/keys 获取；接口默认 https://api.typesafe.ai/v1/systemone。',
		}

		const en = {
			'panel.title': 'Jev advice',
			'panel.subtitle': 'What TypeSafe System One makes of this choice',
			'panel.loading': 'Asking Jev…',
			'panel.ask': 'Ask Jev',
			'panel.manualHint': 'On-demand mode: evaluation starts only after you click. Sending may incur API usage.',
			'panel.preferenceApplyIdle': 'Save preference for this question',
			'panel.preferenceNext': 'Used when you click “Ask Jev”.',
			'panel.preparing': 'Preparing local preview…',
			'panel.loadingAutoWithTranscript': 'Automatically requesting Jev with recent conversation',
			'panel.loadingAutoWithoutTranscript': 'Automatically requesting Jev without recent conversation',
			'panel.disabled': 'Jev advice is switched off in Settings → Jev.',
			'panel.regionBlocked': 'Jev is unavailable in your region (451 Unavailable For Legal Reasons). Retrying will not help; use a supported region or a different evaluation service.',
			'panel.noKey': 'No Jev API key yet. Add one in Settings → Jev.',
			'panel.retry': 'Retry',
			'panel.dismiss': 'Dismiss',
			'panel.recommend': 'Recommended',
			'panel.confidence': 'Confidence',
			'panel.otherOptions': 'Other options',
			'panel.noneOfTheAbove': 'Jev thinks none of the listed options fits — answer this one yourself.',
			'panel.adopt': 'Adopt Jev’s answer',
			'panel.adopting': 'Submitting…',
			'panel.partial': 'Jev has no clear advice for every question in this batch; please choose manually.',
			'panel.unanswered': 'Jev returned an incomplete or invalid answer; retry or answer manually.',
			'panel.json': 'Show the structured JSON request and response',
			'panel.request': 'Request (sent to Jev)',
			'panel.response': 'Response (from Jev)',
			'panel.model': 'Model',
			'panel.multiSelect': 'multi-select',
			'panel.adoptFailed': 'Adopt failed: {message}',
			'panel.question': 'Question {index}',
			'panel.confirm': 'Confirm and send',
			'panel.preview': 'Preview before sending (does not call Jev)',
			'panel.context': 'Context sent: {summary}',
			'panel.usage': 'Usage: input {input} · output {output}',
			'panel.reused': 'Shared concurrent evaluation',
			'panel.bytes': '{bytes} bytes',
			'panel.open': 'Open Jev advice',
			'panel.collapse': 'Collapse',
			'panel.expand': 'Expand',
			'panel.dockLeft': 'Dock left',
			'panel.dockRight': 'Dock right',
			'panel.dockHelp': 'This overlay uses public slot information only and never reads private host DOM; it docks left by default to avoid the right rail.',
			'panel.layoutSaveFailed': 'Layout could not be saved to this profile; kept for this mount only. Adjust it again to retry.',
			'panel.transcriptIncluded': 'Transcript included',
			'panel.transcriptOmitted': 'Transcript omitted',
			'panel.chars': '{count} chars',
			'panel.redactions': '{count} redactions',
			'panel.truncated': 'truncated',
			'panel.probabilityClose': 'The recommendation is close to another option; use your judgment.',
			'panel.probabilityOtherHigher': 'Another option has a higher probability than the recommendation; use your judgment.',
			'panel.multiProbabilityClose': 'These options are close to 50%; use your judgment: {options}',
			'panel.copy': 'Copy suggestion',
			'panel.copied': 'Copied',
			'panel.copyFailed': 'Copy failed: {message}',
			'panel.preferenceLabel': 'Temporary decision preference (this interaction only)',
			'panel.preferencePlaceholder': 'Tell Jev what matters this time (up to 500 characters)',
			'panel.preferenceApply': 'Apply and re-evaluate',
			'panel.preferenceApplied': 'This will create a new evaluation.',
			'panel.preferenceStable': 'Prefer stability',
			'panel.preferenceFast': 'Finish quickly',
			'panel.preferenceMinimal': 'Change as little code as possible',
			'panel.comparePerspectives': 'Compare trade-off perspectives in one request (adaptive / 1–5 customizable)',
			'panel.perspectivesTitle': 'Trade-off perspectives',
			'panel.perspectivesConsistent': 'All {count} perspectives agree on this option',
			'panel.perspective.stable': 'Prefer stability',
			'panel.perspective.fast': 'Finish quickly',
			'panel.perspective.minimal': 'Minimal code changes',
			'panel.perspective.security': 'Security & blast radius',
			'panel.perspective.progress': 'Unblock task progress',
			'panel.perspective.completeness': 'Completeness & edge cases',
			'panel.perspective.ux': 'User experience & clarity',
			'panel.perspective.extensibility': 'Long-term extensibility',
			'panel.perspectivesEditorTitle': 'Active perspectives (1–5, auto-matched to question, customizable)',
			'panel.perspectiveQuickAdd': 'Quick add:',
			'panel.perspectiveCustomPlaceholder': 'Custom perspective (e.g. Zero new deps)',
			'panel.perspectiveAdd': 'Add perspective',
			'panel.perspectiveApply': 'Compare selected perspectives',
			'panel.perspectiveApplyIdle': 'Save selected perspectives',
			'panel.perspectiveRemove': 'Remove perspective {label}',
			'panel.riskScore.0': 'Risk rating: Low risk (0/2)',
			'panel.riskScore.1': 'Risk rating: Medium risk (1/2)',
			'panel.riskScore.2': 'Risk rating: High risk (2/2)',
			'panel.planScore.0': 'Plan readiness: Major gaps or risks (0/2)',
			'panel.planScore.1': 'Plan readiness: Acceptable with caveats (1/2)',
			'panel.planScore.2': 'Plan readiness: Complete and sound (2/2)',
			'panel.adoptAllowOnce': 'Adopt: Allow once',
			'panel.adoptReject': 'Adopt: Reject',
			'panel.adoptPlanDismiss': 'Adopt: Request changes',
			'panel.countdownHeld': 'Auto-skip timer paused',
			'panel.countdownActive': 'Timed question active (evaluating or focusing this card holds the timer)',
			'panel.takeTime': 'Pause timer',

			'settings.nav': 'Jev',
			'settings.title': 'Jev decision advice',
			'settings.description':
				'When the model hands you a multiple choice through ask_user_question, dsh-jev-advisor turns it into a structured TypeSafe (Jev / System One) request and shows Jev’s recommendation beside the options, ready to adopt in one click.',
			'settings.apiKey': 'API key',
			'settings.apiKeySet': 'Stored (never echoed back; type a new value to replace it)',
			'settings.apiKeyUnset': 'Not configured',
			'settings.apiKeyPlaceholder': 'sk-...',
			'settings.endpoint': 'Endpoint',
			'settings.model': 'Model',
			'settings.enabled': 'Enable Jev advice',
			'settings.autoAdvise': 'Automatically get Jev advice',
			'settings.autoAdviseHint': 'Off by default, including upgrades. When off, click “Ask Jev”; when on, eligible questions start evaluation automatically. Confirmation settings still apply; sending may incur API usage. Save to apply.',
			'settings.diagnostics': 'Local health check',
			'settings.diagnosticsHint': 'Local information only; never calls Jev. Matching a version declaration is not a guarantee of every feature. Unavailable information is unknown.',
			'settings.pluginVersion': 'Plugin version',
			'settings.dshVersion': 'DSH version',
			'settings.declaredDsh': 'Declared DSH support',
			'settings.declarationMatch': 'Version declaration check',
			'settings.match': 'Matches declaration',
			'settings.mismatch': 'Outside declared support; check for a plugin update',
			'settings.unknown': 'Unknown',
			'settings.yes': 'Yes',
			'settings.no': 'No',
			'settings.hasKey': 'Key configured',
			'settings.diagnosticUnavailable': 'Local status is unavailable. Check that the host is updated and reopen Settings.',
			'settings.copyDiagnostics': 'Copy sanitized diagnostics',
			'settings.diagnosticCopied': 'Diagnostics copied',
			'settings.diagnosticCopyFailed': 'Could not copy diagnostics. Check clipboard permission and retry.',
			'settings.testHint': '“Test connection” sends one evaluation to the saved endpoint and may incur API usage. The local health check does not.',
			'settings.includeTranscript': 'Send the recent conversation as the state',
			'settings.requireConfirmation': 'Require confirmation before sending',
			'settings.redactSensitive': 'Mask common credentials before sending',
			'settings.redactSensitiveHint': 'Not all sensitive information can be detected',
			'settings.comparePerspectives': 'Compare trade-off perspectives by default in a single request (question-adaptive or custom below)',
			'settings.customPerspectives': 'Default trade-off perspectives (optional, comma-separated 1–5; leave blank for question-adaptive defaults)',
			'settings.customPerspectivesPlaceholder': 'e.g. Security & blast radius, Minimal code changes, Finish quickly',
			'settings.transcriptMessages': 'Context messages',
			'settings.timeoutMs': 'Timeout (ms)',
			'settings.save': 'Save',
			'settings.saving': 'Saving…',
			'settings.saved': 'Saved',
			'settings.rejected': 'The host rejected the write; settings may have changed in another window. Your edits are kept; try again.',
			'settings.blankKey': 'A blank key does not remove stored credentials. Use Clear key to remove them.',
			'settings.test': 'Test connection',
			'settings.testing': 'Testing…',
			'settings.testOk': 'Reachable, model {model}',
			'settings.clearKey': 'Clear key',
			'settings.unsaved': 'Unsaved changes',
			'settings.unavailable': 'The settings service is unavailable; the composition config is in effect.',
			'settings.help': 'Get a key at console.typesafe.ai/keys; the endpoint defaults to https://api.typesafe.ai/v1/systemone.',
		}

		/* ------------------------------------------------------------------ *
		 * Shared helpers
		 * ------------------------------------------------------------------ */

		/**
		 * Subscribe to one snapshot store without tearing.
		 *
		 * `subscribe`/`getSnapshot` are captured per store into stable closures,
		 * so a component never resubscribes just because it re-rendered. The
		 * third argument is the server snapshot: this plugin only ever renders in
		 * the browser, but passing it keeps the component renderable outside one
		 * (and is what `test/client.mjs` relies on).
		 */
		function useStoreSnapshot(store) {
			const subscribe = React.useCallback((callback) => store.subscribe(callback), [store])
			const getSnapshot = React.useCallback(() => store.getSnapshot(), [store])
			return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
		}

		/** A selector hook that is safe to call even when its source is absent. */
		const absentSelector = () => undefined

		/**
		 * 读取当前 Session 的标识。
		 *
		 * `ctx.uiSession.adapter.current` 是可观察源本身（`{ getSnapshot, subscribe }`），
		 * 不是某个快照对象——DSH 自己的调用点也是 `current.getSnapshot().key`
		 * （`@deepseek-ai/dsh-client-ui-sidebar-right`）。早期版本把注入值当成
		 * 快照直接读 `.key`，于是永远拿到 `undefined`，卡片再也判定不出主会话。
		 */
		function mainSessionIdOf(source) {
			if (source === undefined || source === null) return undefined
			// 已经是快照对象时直接取 key；否则按可观察源取快照。
			const direct = source.key
			if (typeof direct === 'string' && direct !== '') return direct
			if (typeof source.getSnapshot !== 'function') return undefined
			let snapshot
			try {
				snapshot = source.getSnapshot()
			} catch {
				return undefined
			}
			return typeof snapshot?.key === 'string' && snapshot.key !== '' ? snapshot.key : undefined
		}

		/** POST one JSON payload to the host bridge and unwrap its envelope. */
		async function callApi(method, payload, signal) {
			// 一次序列化同时用于发送及绑定校验，避免等待响应时局部对象变化。
			const requestBody = JSON.stringify(payload ?? {})
			const sent = JSON.parse(requestBody)
			let response
			try {
				response = await fetch(`${API}/${method}`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: requestBody,
					signal,
				})
			} catch (error) {
				if (error instanceof Error && error.name === 'AbortError') throw error
				throw new Error(`cannot reach the dsh-jev-advisor host bridge: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
			}
			let body
			try {
				body = await response.json()
			} catch {
				body = undefined
			}
			if (!isRecord(body)) throw new Error(`the dsh-jev-advisor host bridge answered ${String(response.status)} without a JSON object`)
			if (!response.ok || body.ok !== true) {
				const error = new Error(body.error?.message ?? `the dsh-jev-advisor host bridge answered ${String(response.status)}`)
				if (typeof body.error?.code === 'string') error.code = body.error.code
				throw error
			}
			if (!isRecord(body.value) || (method === 'advise' && (!Array.isArray(body.value.advice) || !body.value.advice.every(validAdvice)
				|| (body.value.privacy !== undefined && !validPrivacy(body.value.privacy))
				|| (body.value.reused !== undefined && typeof body.value.reused !== 'boolean')))) {
				throw new Error('the dsh-jev-advisor host bridge returned an invalid result')
			}
			if (method === 'prepare' || method === 'advise') {
				const binding = body.value.binding
				if (binding === undefined || binding === null) {
					const error = new Error('the dsh-jev-advisor host bridge is out of date; restart the DSH host process, then refresh the browser (reloading the page alone is not enough)')
					error.retryable = false
					throw error
				}
				if (isRecord(binding) && typeof sent.decisionPreference === 'string' && sent.decisionPreference !== ''
					&& !Object.hasOwn(binding, 'decisionPreference')) {
					const error = new Error('the dsh-jev-advisor host bridge is out of date and does not echo decision preferences; restart the DSH host process, then refresh the browser')
					error.retryable = false
					throw error
				}
				const expectedCompare = sent.comparePerspectives === true ? true : undefined
				const detail = {
					bindingType: binding === null ? 'null' : typeof binding,
					reqIdMatch: isRecord(binding) ? binding.requestId === sent.requestId : 'n/a',
					sessionMatch: isRecord(binding) ? binding.sessionId === sent.sessionId : 'n/a',
					keyMatch: isRecord(binding) ? binding.interactionKey === sent.interactionKey : 'n/a',
					questionsMatch: isRecord(binding) ? sameJson(binding.questions, sent.questions) : 'n/a',
					decisionPreferenceMatch: isRecord(binding) ? sameJson(binding.decisionPreference, sent.decisionPreference) : 'n/a',
					comparePerspectivesMatch: isRecord(binding) ? sameJson(binding.comparePerspectives, expectedCompare) : 'n/a',
					perspectivesMatch: isRecord(binding) ? sameJson(binding.perspectives, sent.perspectives) : 'n/a',
					approvalMatch: isRecord(binding) ? sameJson(binding.approval, sent.approval) : 'n/a',
				}
				if (!isRecord(binding) || binding.requestId !== sent.requestId || binding.sessionId !== sent.sessionId
					|| binding.interactionKey !== sent.interactionKey || !sameJson(binding.questions, sent.questions)
					|| !sameJson(binding.decisionPreference, sent.decisionPreference)
					|| !sameJson(binding.comparePerspectives, expectedCompare)
					|| !sameJson(binding.perspectives, sent.perspectives)
					|| !sameJson(binding.approval, sent.approval)) {
					throw new Error(`the dsh-jev-advisor host bridge returned a different request ${JSON.stringify(detail)}`)
				}
			}
			if (method === 'prepare' && (Object.hasOwn(body.value, 'advice') || typeof body.value.previewToken !== 'string' || body.value.previewToken.trim() === ''
				|| !isRecord(body.value.request) || !validPrivacy(body.value.privacy, true)
				|| (typeof body.value.expiresAt !== 'string' && !(typeof body.value.expiresAt === 'number' && Number.isFinite(body.value.expiresAt))))) {
				throw new Error('the dsh-jev-advisor host bridge returned an invalid preparation result')
			}
			return body.value
		}

		/** Strip the conventional recommendation suffix without changing the answer value. */
		function displayLabel(label) {
			return label.replace(/\s*\((?:recommended|推荐)\)\s*$/iu, '').trim() || label
		}

		/** 桥接响应在提交前仍需进行独立的类型及概率校验。 */
		function isRecord(value) {
			return typeof value === 'object' && value !== null && !Array.isArray(value)
		}

		/** JSON 对象键无序、数组有序；不能把字符串化后的键顺序当成身份。 */
		function sameJson(left, right) {
			if (left === right) return true
			if (Array.isArray(left) || Array.isArray(right)) {
				return Array.isArray(left) && Array.isArray(right) && left.length === right.length
					&& left.every((item, index) => sameJson(item, right[index]))
			}
			if (!isRecord(left) || !isRecord(right)) return false
			const keys = Object.keys(left)
			return keys.length === Object.keys(right).length
				&& keys.every((key) => Object.hasOwn(right, key) && sameJson(left[key], right[key]))
		}

		function isProbability(value) {
			return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
		}

		/** 展示与采纳共用的桥接结构边界，防止嵌套异常数据进入 React。 */
		function validAdvice(entry) {
			if (!isRecord(entry) || typeof entry.questionId !== 'string' || typeof entry.supported !== 'boolean') return false
			if (!entry.supported) return true
			if (!['choice', 'noul-set'].includes(entry.kind) || typeof entry.answered !== 'boolean' || !Array.isArray(entry.probabilities)) return false
			const validRow = (row) => isRecord(row) && Number.isInteger(row.index) && row.index >= 0 && typeof row.label === 'string' && isProbability(row.probability)
			const validScore = (score) => isRecord(score) && Number.isInteger(score.score) && score.score >= 0 && score.score <= 2 && (score.confidence === undefined || isProbability(score.confidence))
			const validPerspective = (item) => isRecord(item) && typeof item.id === 'string' && item.id.trim() !== ''
				&& (item.label === undefined || typeof item.label === 'string')
				&& typeof item.noneOfTheAbove === 'boolean' && isProbability(item.noneProbability)
				&& (item.noneOfTheAbove ? item.pick === undefined : validRow(item.pick))
				&& (item.confidence === undefined || isProbability(item.confidence))
			if (!entry.probabilities.every(validRow) || (entry.confidence !== undefined && !isProbability(entry.confidence))) return false
			if (entry.riskScore !== undefined && !validScore(entry.riskScore)) return false
			if (entry.planScore !== undefined && !validScore(entry.planScore)) return false
			if (entry.perspectives !== undefined && (!Array.isArray(entry.perspectives) || !entry.perspectives.every(validPerspective))) return false
			if (!entry.answered) return true
			if (entry.kind === 'choice') return typeof entry.noneOfTheAbove === 'boolean' && isProbability(entry.noneProbability)
				&& (entry.noneOfTheAbove ? entry.pick === undefined : validRow(entry.pick))
			return Array.isArray(entry.picks) && entry.picks.every(validRow)
		}

		/** 只为结构完整的已回答结果生成分歧提示，不把 confidence 当作正确率。 */
		function decisionHintOf(question, entry) {
			if (!isRecord(question) || !isRecord(entry) || entry.supported !== true || entry.answered !== true
				|| !Array.isArray(question.options) || question.options.length === 0 || !Array.isArray(entry.probabilities)
				|| entry.probabilities.length !== question.options.length
				|| (entry.confidence !== undefined && !isProbability(entry.confidence))) return undefined
			if (!question.options.every((option) => isRecord(option) && typeof option.label === 'string' && option.label.trim() !== '')
				|| new Set(question.options.map((option) => option.label)).size !== question.options.length) return undefined
			const rows = entry.probabilities
			const validRows = rows.every((row, index) => isRecord(row) && row.index === index
				&& typeof row.label === 'string' && row.label === question.options[index]?.label && isProbability(row.probability))
			if (!validRows) return undefined
			const mass = rows.reduce((sum, row) => sum + row.probability, 0)
			if (entry.kind === 'choice') {
				if (question.multiSelect === true || entry.noneOfTheAbove !== false || !isProbability(entry.noneProbability)
					|| !isRecord(entry.pick) || !Number.isInteger(entry.pick.index) || entry.pick.index < 0
					|| entry.pick.index >= rows.length || entry.pick.label !== rows[entry.pick.index].label
					|| !isProbability(entry.pick.probability) || entry.pick.probability !== rows[entry.pick.index].probability
					|| Math.abs(mass + entry.noneProbability - 1) > 0.010000001) return undefined
				const strongestOther = Math.max(entry.noneProbability, ...rows.filter((row) => row.index !== entry.pick.index).map((row) => row.probability))
				const difference = entry.pick.probability - strongestOther
				if (strongestOther > entry.pick.probability + 0.000000001) {
					return { kind: 'choice-other-higher', index: entry.pick.index, strongestProbability: strongestOther, difference }
				}
				if (difference <= 0.100000001) {
					return { kind: 'choice-close', index: entry.pick.index, strongestProbability: strongestOther, difference }
				}
				return undefined
			}
			if (entry.kind !== 'noul-set' || question.multiSelect !== true || !Array.isArray(entry.picks)
				|| !entry.picks.every((pick) => isRecord(pick) && Number.isInteger(pick.index) && pick.index >= 0 && pick.index < rows.length
					&& pick.label === rows[pick.index].label && isProbability(pick.probability) && pick.probability === rows[pick.index].probability && pick.probability >= 0.5)
				|| new Set(entry.picks.map((pick) => pick.index)).size !== entry.picks.length) return undefined
			const indexes = rows.filter((row) => row.probability >= 0.45 - 0.000000001 && row.probability <= 0.55 + 0.000000001).map((row) => row.index)
			return indexes.length === 0 ? undefined : { kind: 'multi-close', indexes }
		}

		/** 复制只接受与采纳相同的完整答案边界，防止复制伪造的部分结果。 */
		function buildCopyText(questions, advice) {
			const answers = buildAnswers(questions, advice)
			if (answers === undefined) return undefined
			if (!Array.isArray(questions) || questions.length === 0) return undefined
			const byId = new Map(Array.isArray(advice) ? advice.map((entry) => [entry.questionId, entry]) : [])
			const lines = []
			for (const [index, question] of questions.entries()) {
				if (!isRecord(question) || typeof question.question !== 'string' || !Array.isArray(question.options) || question.options.length === 0
					|| !question.options.every((option) => isRecord(option) && typeof option.label === 'string' && option.label.trim() !== '')) return undefined
				lines.push(`${String(index + 1)}. ${question.question}`)
				if (typeof question.header === 'string' && question.header !== '') lines.push(`   ${question.header}`)
				if (typeof question.detail === 'string' && question.detail !== '') lines.push(`   ${question.detail}`)
				const selected = new Set(answers[index]?.selected ?? [])
				const selectedOptions = question.options.filter((option) => selected.has(option.label))
				if (selectedOptions.length === 0 || !byId.has(question.id)) return undefined
				selectedOptions.forEach((option, optionIndex) => {
					const description = typeof option.description === 'string' && option.description !== '' ? ` — ${option.description}` : ''
					lines.push(`   ${String(optionIndex + 1)}. ${option.label}${description}`)
				})
			}
			return lines.join('\n')
		}

		/** 偏好只在显式应用时进入请求，按 UTF-16 code units 限制长度。 */
		function normalizeDecisionPreference(value) {
			return typeof value === 'string' ? value.trim().slice(0, 500) : ''
		}

		const PERSPECTIVE_PRESETS = [
			{ id: 'stable', prompt: 'prioritize stability, safety, and reliability' },
			{ id: 'fast', prompt: 'prioritize speed of completion and minimal delay' },
			{ id: 'minimal', prompt: 'prioritize minimal code or state changes' },
			{ id: 'security', prompt: 'prioritize security boundaries, least privilege, and minimal blast radius' },
			{ id: 'progress', prompt: 'prioritize unblocking the current task and workflow momentum' },
			{ id: 'completeness', prompt: 'prioritize architectural completeness, edge cases, and rollback safety' },
			{ id: 'ux', prompt: 'prioritize user experience, clarity, and intuitive interaction' },
			{ id: 'extensibility', prompt: 'prioritize long-term maintainability and extensibility' },
		]
		const PRESET_PERSPECTIVE_IDS = new Set(PERSPECTIVE_PRESETS.map((item) => item.id))

		function presetPerspective(id, t) {
			const preset = PERSPECTIVE_PRESETS.find((item) => item.id === id)
			const key = `panel.perspective.${id}`
			const translated = typeof t === 'function' ? t(key) : id
			const label = typeof translated === 'string' && translated !== '' && translated !== key ? translated : id
			return { id, label, prompt: preset ? preset.prompt : label }
		}

		function perspectiveLabelOf(item, t) {
			if (isRecord(item) && typeof item.id === 'string' && PRESET_PERSPECTIVE_IDS.has(item.id) && typeof t === 'function') {
				const key = `panel.perspective.${item.id}`
				const translated = t(key)
				if (typeof translated === 'string' && translated !== '' && translated !== key) return translated
			}
			if (isRecord(item) && typeof item.label === 'string' && item.label.trim() !== '') return item.label.trim()
			return isRecord(item) && typeof item.id === 'string' ? item.id : ''
		}

		function parseCustomPerspectives(raw) {
			if (typeof raw !== 'string' || raw.trim() === '') return []
			const seen = new Set()
			const result = []
			for (const part of raw.split(/[,，;；\n]+/)) {
				const label = part.trim().slice(0, 80)
				if (label === '' || seen.has(label)) continue
				seen.add(label)
				result.push({ id: `custom_${String(result.length)}`, label, prompt: label })
				if (result.length >= 5) break
			}
			return result
		}

		/** 根据当前问题类型（越权审批、Plan Review、UI/UX、高危操作、架构或通用工程）自动匹配 2~4 个最契合的对比视角。 */
		function defaultPerspectivesFor(normalized, customPerspectives, t) {
			const custom = parseCustomPerspectives(customPerspectives)
			if (custom.length > 0) return custom
			const questions = Array.isArray(normalized?.questions) ? normalized.questions : []
			if (normalized?.kind === 'approval' || questions.some((q) => q?.approval === true)) {
				return [presetPerspective('security', t), presetPerspective('progress', t)]
			}
			if (questions.some((q) => q?.planReview === true)) {
				return [presetPerspective('completeness', t), presetPerspective('minimal', t), presetPerspective('fast', t)]
			}
			const combinedText = questions.map((q) => `${q?.header ?? ''} ${q?.question ?? ''} ${q?.detail ?? ''}`).join(' ')
			if (/\b(?:ui|ux|css|style|layout|design|button|modal|dialog|panel)\b|界面|交互|样式|视觉|体验|设计|布局|弹窗/i.test(combinedText)) {
				return [presetPerspective('ux', t), presetPerspective('minimal', t)]
			}
			if (/\b(?:rm|delete|drop|remove|prod|production|secret|token|auth|permission|credential|migration)\b|删除|生产|权限|密钥|迁移|破坏|高危/i.test(combinedText)) {
				return [presetPerspective('security', t), presetPerspective('stable', t)]
			}
			if (/\b(?:architecture|schema|interface|api|plugin|sdk|refactor|module)\b|架构|接口|重构|扩展|模块|抽象/i.test(combinedText)) {
				return [presetPerspective('stable', t), presetPerspective('extensibility', t), presetPerspective('minimal', t), presetPerspective('fast', t)]
			}
			return [presetPerspective('stable', t), presetPerspective('fast', t), presetPerspective('minimal', t)]
		}

		/** 校验宿主返回的隐私及请求大小元数据，避免异常值污染展示。 */
		function validPrivacy(value, required = false) {
			if (!isRecord(value)) return false
			const fields = ['includedTranscript', 'contextChars', 'redactions', 'truncated', 'requestBytes']
			if (required && fields.some((field) => !Object.hasOwn(value, field))) return false
			return (value.includedTranscript === undefined || typeof value.includedTranscript === 'boolean')
				&& (value.contextChars === undefined || (Number.isFinite(value.contextChars) && value.contextChars >= 0))
				&& (value.redactions === undefined || (Number.isFinite(value.redactions) && value.redactions >= 0))
				&& (value.truncated === undefined || typeof value.truncated === 'boolean')
				&& (value.requestBytes === undefined || (Number.isFinite(value.requestBytes) && value.requestBytes >= 0))
		}

		/**
		 * Narrow one pending interaction into the question batch Jev can judge.
		 *
		 * Returns `undefined` for anything that is not an answerable question
		 * batch — approvals, free-text-only prompts — so the panel stays out of
		 * the way. `complete` reports whether EVERY question in the batch is
		 * option-bearing: answering a batch means answering all of it, so an
		 * incomplete batch must stay manual.
		 *
		 * @returns `{ questions, complete }`, or `undefined` when nothing is judgeable.
		 */
		const closedInteractionSnapshot = { closed: true, channel: 'none' }
		function interactionSnapshotOf(interaction) {
			try { return interaction?.getSnapshot?.() } catch { return closedInteractionSnapshot }
		}

		function interactionAllowsAdvice(interaction) {
			if (!interaction || interaction.review !== undefined) return false
			if (interaction.kind === 'approval') {
				return interaction.answerable !== false
					&& typeof interaction.toolName === 'string'
					&& interaction.toolName.trim() !== ''
					&& typeof interaction.answer === 'function'
			}
			if (typeof interaction.getSnapshot !== 'function') return true
			const snapshot = interactionSnapshotOf(interaction)
			return snapshot?.closed === false && (snapshot.channel === 'waterfall' || snapshot.channel === 'rpc')
		}

		function pendingQuestionsOf(interaction) {
			if (interaction === undefined || interaction === null) return undefined
			if (!interactionAllowsAdvice(interaction)) return undefined
			if (interaction.kind === 'approval') {
				const toolName = interaction.toolName.trim()
				const reason = typeof interaction.reason === 'string' && interaction.reason.trim() !== '' ? interaction.reason.trim() : undefined
				const callId = typeof interaction.callId === 'string' && interaction.callId.trim() !== '' ? interaction.callId.trim() : undefined
				const approval = { toolName }
				if (callId !== undefined) approval.callId = callId
				if (reason !== undefined) approval.reason = reason
				return {
					kind: 'approval',
					approval,
					complete: true,
					questions: [{
						id: 'approval',
						question: reason !== undefined ? `Approve tool "${toolName}"? (${reason})` : `Approve execution of tool "${toolName}"?`,
						header: `Tool approval: ${toolName}`,
						detail: reason,
						multiSelect: false,
						approval: true,
						options: [
							{ label: 'allow-once', description: 'Allow this tool invocation once' },
							{ label: 'reject', description: 'Reject this tool invocation' },
						],
					}],
				}
			}
			const raw = interaction.questions
			if (!Array.isArray(raw) || raw.length === 0) return undefined
			const questions = []
			const ids = new Set()
			for (const question of raw) {
				if (!isRecord(question)) continue
				if (typeof question.id !== 'string' || question.id.trim() === '' || typeof question.question !== 'string' || ids.has(question.id)) continue
				ids.add(question.id)
				const options = []
				for (const option of Array.isArray(question.options) ? question.options : []) {
					if (typeof option !== 'object' || option === null) continue
					if (typeof option.label !== 'string' || option.label.trim() === '') continue
					options.push({
						label: option.label,
						description: typeof option.description === 'string' ? option.description : undefined,
					})
				}
				if (options.length === 0 || options.length !== question.options.length || new Set(options.map((option) => option.label)).size !== options.length) continue
				const normalizedQuestion = {
					id: question.id,
					question: question.question,
					header: typeof question.header === 'string' ? question.header : undefined,
					detail: typeof question.detail === 'string' ? question.detail : undefined,
					multiSelect: question.multiSelect === true,
					options,
				}
				if (interaction.kind === 'plan-review' || (raw.length === 1 && question.intent?.kind === 'plan-review')) {
					normalizedQuestion.planReview = true
				}
				questions.push(normalizedQuestion)
			}
			if (questions.length === 0) return undefined
			return { questions, complete: questions.length === raw.length }
		}

		/** 当前 Session 的交互优先；没有交互时才回退到可判断的后台问题。 */
		function pendingInteractionOf(snapshot, sessionId) {
			if (!(snapshot instanceof Map)) return undefined
			const current = snapshot.get(sessionId)?.pendingInteraction
			if (current !== undefined && current !== null) return current
			for (const status of snapshot.values()) {
				const interaction = status?.pendingInteraction
				if (pendingQuestionsOf(interaction) !== undefined) return interaction
			}
			return undefined
		}

		/** 先验证整个草稿，再以一次有修订号的原子变更提交，避免部分保存。 */
		async function applySettingsDraft(scope, draft, revision) {
			const snapshot = scope.getSnapshot()
			if (snapshot?.status !== 'ready' || snapshot.writable === false || typeof scope.mutate !== 'function') {
				throw new Error('settings are unavailable or read-only; a writable ConfigFormController is required')
			}
			const ops = []
			for (const [field, raw] of Object.entries(draft)) {
				let value = raw
				if (['apiKey', 'endpoint', 'model'].includes(field)) {
					if (typeof raw !== 'string') throw new Error(`${field} must be a string`)
					value = raw.trim()
					if (field === 'apiKey' && value === '') continue
					if (value === '') throw new Error(`${field} must not be empty`)
					if (field === 'endpoint') {
						let url
						try { url = new URL(value) } catch { throw new Error('endpoint must be an HTTP(S) URL') }
						if (!['http:', 'https:'].includes(url.protocol)) throw new Error('endpoint must be an HTTP(S) URL')
					}
				} else if (['transcriptMessages', 'timeoutMs'].includes(field)) {
					if ((typeof raw !== 'number' && typeof raw !== 'string') || (typeof raw === 'string' && raw.trim() === '')) throw new Error(`${field} must be an integer`)
					value = Number(raw)
					const [min, max] = field === 'transcriptMessages' ? [0, 100] : [1000, 180000]
					if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${field} must be an integer between ${min} and ${max}`)
				} else if (['enabled', 'autoAdvise', 'includeTranscript', 'requireConfirmation', 'redactSensitive', 'comparePerspectives'].includes(field)) {
					if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`)
				} else if (field === 'customPerspectives') {
					if (typeof raw !== 'string') throw new Error('customPerspectives must be a string')
					value = raw.trim().slice(0, 300)
				} else throw new Error('unknown settings field')
				ops.push({ op: 'set', path: [field], value })
			}
			if (ops.length === 0) {
				if (Object.hasOwn(draft, 'apiKey')) {
					const error = new Error('a blank key does not remove stored credentials')
					error.code = 'settings/blank-key'
					throw error
				}
				return
			}
			if (await scope.mutate(ops, revision) !== true) {
				const error = new Error('settings write was rejected by the host')
					error.code = 'settings/write-rejected'
				throw error
			}
		}

		/**
		 * Turn Jev's advice into the exact answer batch the pending question waits
		 * for. All-or-nothing on purpose: submitting a batch means answering every
		 * question in it, so a partially advised batch must stay manual.
		 *
		 * @returns the answer batch, or `undefined` when it cannot be adopted.
		 */
		function buildAnswers(questions, advice) {
			if (!Array.isArray(questions) || questions.length === 0 || !Array.isArray(advice) || !advice.every(isRecord)) return undefined
			const byId = new Map(advice.map((entry) => [entry.questionId, entry]))
			if (byId.size !== advice.length || byId.size !== questions.length) return undefined
			const ids = new Set()
			const answers = []
			for (const question of questions) {
				if (!isRecord(question) || typeof question.id !== 'string' || question.id.trim() === '' || ids.has(question.id)) return undefined
				ids.add(question.id)
				if (!Array.isArray(question.options) || question.options.length === 0 || !question.options.every((option) => isRecord(option) && typeof option.label === 'string' && option.label.trim() !== '')) return undefined
				if (new Set(question.options.map((option) => option.label)).size !== question.options.length) return undefined
				const entry = byId.get(question.id)
				if (entry === undefined || entry.supported !== true || entry.answered !== true) return undefined
				if (entry.confidence !== undefined && !isProbability(entry.confidence)) return undefined
				const distribution = entry.probabilities
				if (!Array.isArray(distribution) || distribution.length !== question.options.length || !distribution.every((row, index) =>
					isRecord(row) && row.index === index && row.label === question.options[index].label && isProbability(row.probability),
				)) return undefined
				const validPick = (pick) => isRecord(pick) && Number.isInteger(pick.index) && pick.index >= 0 && pick.index < distribution.length
					&& pick.label === distribution[pick.index].label && isProbability(pick.probability) && pick.probability === distribution[pick.index].probability
				if (entry.kind === 'choice') {
					if (question.multiSelect === true || entry.noneOfTheAbove !== false || !validPick(entry.pick) || !isProbability(entry.noneProbability)) return undefined
					if (entry.pick.probability <= 0 || Math.abs(distribution.reduce((sum, row) => sum + row.probability, entry.noneProbability) - 1) > 0.010000001) return undefined
					answers.push({ id: question.id, selected: [entry.pick.label] })
					continue
				}
				if (entry.kind === 'noul-set') {
					const picks = entry.picks
					if (question.multiSelect !== true || !Array.isArray(picks) || picks.length === 0 || !picks.every((pick) => validPick(pick) && pick.probability >= 0.5)) return undefined
					if (new Set(picks.map((pick) => pick.index)).size !== picks.length || picks.length !== distribution.filter((row) => row.probability >= 0.5).length) return undefined
					answers.push({ id: question.id, selected: picks.map((pick) => pick.label) })
					continue
				}
				return undefined
			}
			return answers
		}

		/** Whether every question in the batch carries a decisive Jev answer. */
		function isAdoptable(questions, advice) {
			return buildAnswers(questions, advice) !== undefined
		}

		/** Whether a single-question plan-review interaction can be adopted by dismissing ("Request changes") when Jev selects noneOfTheAbove. */
		function isPlanDismissable(questions, advice, interaction) {
			if (typeof interaction?.dismiss !== 'function') return false
			if (!Array.isArray(questions) || questions.length !== 1 || questions[0]?.planReview !== true) return false
			if (!Array.isArray(advice) || advice.length !== 1) return false
			const entry = advice[0]
			if (!isRecord(entry) || entry.questionId !== questions[0].id || entry.supported !== true || entry.answered !== true) return false
			if (entry.kind !== 'choice' || entry.noneOfTheAbove !== true || entry.pick !== undefined || !isProbability(entry.noneProbability) || entry.noneProbability <= 0) return false
			if (entry.confidence !== undefined && !isProbability(entry.confidence)) return false
			const distribution = entry.probabilities
			if (!Array.isArray(distribution) || distribution.length !== questions[0].options?.length || !distribution.every((row, index) =>
				isRecord(row) && row.index === index && row.label === questions[0].options[index]?.label && isProbability(row.probability),
			)) return false
			return Math.abs(distribution.reduce((sum, row) => sum + row.probability, entry.noneProbability) - 1) <= 0.010000001
		}

		/* ------------------------------------------------------------------ *
		 * Styles
		 * ------------------------------------------------------------------ */

		const color = {
			text: 'var(--dsw-alias-label-primary)',
			muted: 'var(--dsw-alias-label-tertiary)',
			secondary: 'var(--dsw-alias-label-secondary)',
			border: 'var(--dsw-alias-border-l2)',
			surface: 'var(--dsw-alias-bg-layer-2)',
			input: 'var(--dsw-specific-input-major)',
			accent: 'var(--dsw-alias-state-business-primary)',
			recommendation: '#2563eb',
			error: 'var(--dsw-alias-state-error-primary)',
			success: 'var(--dsw-alias-state-success-primary)',
			hover: 'var(--dsw-alias-interactive-bg-hover)',
		}

		const S = {
			card: {
				position: 'fixed',
				left: '12px',
				right: 'auto',
				top: '68px',
				width: '360px',
				maxWidth: 'calc(100vw - 24px)',
				maxHeight: 'min(72vh, 640px)',
				overflowY: 'auto',
				display: 'flex',
				flexDirection: 'column',
				gap: '10px',
				padding: '14px 16px',
				borderRadius: '14px',
				border: `1px solid ${color.border}`,
				background: color.surface,
				boxShadow: 'var(--dsw-elevation-panel)',
				color: color.text,
				fontSize: '13px',
				lineHeight: '18px',
				boxSizing: 'border-box',
				minWidth: 0,
			},
			reopen: {
				position: 'fixed',
				left: '12px',
				right: 'auto',
				bottom: '16px',
				maxWidth: 'calc(100vw - 24px)',
				zIndex: 1,
			},
			header: { display: 'flex', alignItems: 'flex-start', gap: '8px', minWidth: 0 },
			title: { fontSize: '13px', fontWeight: 600, flex: '1 1 auto', minWidth: 0, overflowWrap: 'anywhere' },
			subtitle: { color: color.muted, fontSize: '11px', lineHeight: '15px' },
			iconButton: {
				border: 'none',
				background: 'transparent',
				color: color.muted,
				cursor: 'pointer',
				fontSize: '14px',
				lineHeight: '14px',
				padding: '2px 4px',
				borderRadius: '6px',
			},
			section: { display: 'flex', flexDirection: 'column', gap: '6px' },
			question: { color: color.secondary, fontSize: '12px' },
			pick: { display: 'flex', alignItems: 'baseline', gap: '6px', fontWeight: 600 },
			recommendation: { color: color.recommendation, fontWeight: 700 },
			probability: { color: color.recommendation, fontWeight: 600 },
			badge: {
				borderRadius: '999px',
				padding: '1px 7px',
				fontSize: '10px',
				fontWeight: 600,
				background: color.accent,
				color: 'var(--dsw-alias-label-primary-inverted)',
			},
			bar: { height: '5px', borderRadius: '999px', background: color.input, overflow: 'hidden' },
			barFill: { height: '100%', borderRadius: '999px', background: color.accent },
			distribution: { display: 'flex', flexDirection: 'column', gap: '3px', color: color.muted, fontSize: '11px' },
			row: { display: 'flex', justifyContent: 'space-between', gap: '8px', minWidth: 0, overflowWrap: 'anywhere' },
			actions: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
			primary: {
				border: 'none',
				borderRadius: '8px',
				padding: '6px 12px',
				fontSize: '12px',
				fontWeight: 600,
				cursor: 'pointer',
				background: 'var(--dsw-alias-button-primary-fill)',
				color: 'var(--dsw-alias-label-primary-inverted)',
			},
			secondary: {
				border: `1px solid ${color.border}`,
				borderRadius: '8px',
				padding: '6px 12px',
				fontSize: '12px',
				cursor: 'pointer',
				background: 'transparent',
				color: color.text,
			},
			note: { color: color.muted, fontSize: '11px', lineHeight: '16px' },
			error: { color: color.error, fontSize: '11px', lineHeight: '16px' },
			success: { color: color.success, fontSize: '11px', lineHeight: '16px' },
			pre: {
				margin: 0,
				padding: '8px',
				borderRadius: '8px',
				background: color.input,
				color: color.secondary,
				fontSize: '10px',
				lineHeight: '14px',
				maxHeight: '220px',
				overflow: 'auto',
				whiteSpace: 'pre-wrap',
				wordBreak: 'break-word',
				maxWidth: '100%',
				boxSizing: 'border-box',
			},
			details: { color: color.muted, fontSize: '11px' },
			field: { display: 'flex', flexDirection: 'column', gap: '4px' },
			label: { color: color.secondary, fontSize: '12px' },
			input: {
				width: '100%',
				boxSizing: 'border-box',
				border: `1px solid ${color.border}`,
				borderRadius: '8px',
				padding: '6px 9px',
				fontSize: '12px',
				background: color.input,
				color: color.text,
			},
			checkboxRow: { display: 'flex', alignItems: 'center', gap: '7px', color: color.secondary, fontSize: '12px' },
			grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: '10px', minWidth: 0 },
			sectionTitle: { fontSize: '14px', fontWeight: 600, margin: 0 },
			divider: { height: '1px', background: color.border, margin: '2px 0' },
		}

		const LAYOUT_STORAGE_KEY = 'dsh-jev-advisor:layout:v1'

		/** 把宿主公开的槽位停靠提示转换为有限的左右选择，不触碰私有 DOM。 */
		function initialDockOf(props) {
			const placement = props?.placement
			const candidate = props?.dock ?? props?.dockSide ?? placement?.side ?? placement?.dock ?? placement
			return candidate === 'right' ? 'right' : 'left'
		}

		/** 读取布局记忆；损坏、拒绝访问或非浏览器环境都安全回退。 */
		function readLayoutPreference() {
			try {
				if (typeof window === 'undefined' || window.localStorage === undefined) return undefined
				const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY)
				if (typeof raw !== 'string' || raw === '') return undefined
				const value = JSON.parse(raw)
				if (!isRecord(value)) return undefined
				const layout = {}
				if (value.dock === 'left' || value.dock === 'right') layout.dock = value.dock
				if (typeof value.collapsed === 'boolean') layout.collapsed = value.collapsed
				return Object.keys(layout).length === 0 ? undefined : layout
			} catch {
				return undefined
			}
		}

		/** 宿主保存过的布局优先；空 dock 表示尚未迁移。 */
		function profileLayoutOf(snapshot) {
			const value = snapshot?.status === 'ready' ? snapshot.value : undefined
			if (value?.cardDock !== 'left' && value?.cardDock !== 'right') return undefined
			return { dock: value.cardDock, collapsed: value.cardCollapsed === true }
		}

		/** 初次渲染优先 profile，其次兼容旧浏览器记忆。 */
		function initialLayoutOf(props) {
			const stored = profileLayoutOf(props?.scope?.getSnapshot()) ?? readLayoutPreference()
			return {
				dock: stored?.dock ?? initialDockOf(props),
				collapsed: stored?.collapsed === true,
			}
		}

		/** 只比较可见的非布局配置；这不能证明隐藏 Key 没有变化。 */
		function sameAdviceSettings(left, right) {
			const withoutLayout = value => {
				if (!isRecord(value)) return value
				const { cardDock, cardCollapsed, ...rest } = value
				return Object.keys(rest).length === 0 ? undefined : rest
			}
			return left?.status === right?.status && left?.writable === right?.writable
				&& ['value', 'base', 'user'].every(field => sameJson(withoutLayout(left?.[field]), withoutLayout(right?.[field])))
		}

		/** 保存自己的 JSON 快照，不依赖宿主深层对象是否复用或可变。 */
		function ownedSettingsSnapshot(snapshot) {
			if (snapshot === undefined || snapshot === null) return snapshot
			const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
			return { status: snapshot.status, writable: snapshot.writable, revision: snapshot.revision,
				value: clone(snapshot.value), base: clone(snapshot.base), user: clone(snapshot.user) }
		}

		/** 布局写入串行合并；只修改两个字段，失败不回退当前窗口布局。 */
		function createLayoutController(scope, props) {
			const legacy = readLayoutPreference()
			let snapshot = { layout: initialLayoutOf({ ...props, scope }), failed: false, saving: false }
			const listeners = new Set()
			const verifiedRevisions = new Map()
			let lifetime, pending, running, migrationAttempted = false
			const publish = (layout, failed = false) => {
				const saving = Boolean(running || pending)
				if (sameJson(snapshot.layout, layout) && snapshot.failed === failed && snapshot.saving === saving) return
				snapshot = { layout, failed, saving }
				for (const listener of listeners) listener()
			}
			const matchesWrite = (value, job) => job?.before && Number.isSafeInteger(job.before.revision)
				&& value?.revision === job.before.revision + 1 && sameAdviceSettings(value, job.before)
				&& sameJson(profileLayoutOf(value), job.layout)
			const writable = value => value?.status === 'ready' && value.writable !== false && typeof scope.mutate === 'function'
			const clearLegacy = () => {
				try { window.localStorage?.removeItem(LAYOUT_STORAGE_KEY) } catch { /* 拒绝存储不影响 profile。 */ }
			}
			const sync = () => {
				if (!lifetime) return
				const hostSnapshot = scope.getSnapshot()
				const saved = profileLayoutOf(hostSnapshot)
				if (!running && !pending && saved && !snapshot.failed) publish(saved)
				if (!saved && legacy && !migrationAttempted && writable(hostSnapshot)) {
					migrationAttempted = true
					pending = snapshot.layout
					void drain()
				}
			}
			const drain = async () => {
				if (!lifetime || running || !pending) return
				const owner = lifetime
				const job = running = { layout: pending }
				pending = undefined
				let accepted = false
				try {
					for (let attempt = 0; attempt < 2; attempt++) {
						const before = ownedSettingsSnapshot(scope.getSnapshot())
						if (!writable(before)) break
						if (sameJson(profileLayoutOf(before), job.layout)) { accepted = true; break }
						job.before = before
						publish(snapshot.layout)
						accepted = await scope.mutate([
							{ op: 'set', path: ['cardDock'], value: job.layout.dock },
							{ op: 'set', path: ['cardCollapsed'], value: job.layout.collapsed },
						], before.revision) === true
						if (accepted && Number.isSafeInteger(before.revision)) {
							// CAS 接受才证明该修订来自只写布局的本地操作。
							verifiedRevisions.set(before.revision + 1, { before, layout: job.layout })
							while (verifiedRevisions.size > 8) verifiedRevisions.delete(verifiedRevisions.keys().next().value)
						}
						if (lifetime !== owner) break
						// 新动作覆盖旧任务；只有观察到修订冲突才有限重试。
						if (accepted || pending || scope.getSnapshot()?.revision === before.revision) break
					}
				} catch { /* 网络失败由布局提示呈现，不重发付费请求。 */ }
				if (running === job) running = undefined
				if (lifetime !== owner) {
					// 不通知旧组件；新生命周期等旧 CAS 结束后再处理自己的队列。
					if (lifetime) { sync(); void drain() }
					return
				}
				if (accepted) clearLegacy()
				if (!pending) publish(snapshot.layout, !accepted)
				void drain()
			}
			return {
				getSnapshot: () => snapshot,
				subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
				classifySettings(value, observedRevision) {
					const revision = value?.revision
					const from = observedRevision === undefined || observedRevision === revision ? revision - 1 : observedRevision
					if (!Number.isSafeInteger(revision) || !Number.isSafeInteger(from) || from >= revision || revision - from > 8) return 'external'
					let cursor = value, provenance = 'owned'
					// React 可合并多条镜像通知；每一条被跳过的修订都必须有本地 CAS 证明。
					while (cursor.revision > from) {
						const verified = verifiedRevisions.get(cursor.revision)
						if (matchesWrite(cursor, verified)) { cursor = verified.before; continue }
						if (cursor === value && matchesWrite(cursor, running)) {
							provenance = 'pending'
							cursor = running.before
							continue
						}
						return 'external'
					}
					return provenance
				},
				start() {
					const owner = lifetime = {}
					migrationAttempted = false
					const unsubscribe = scope.subscribe(sync)
					sync()
					void drain()
					return () => {
						if (lifetime !== owner) return
						lifetime = undefined
						pending = undefined
						unsubscribe()
					}
				},
				update(patch) {
					if (!lifetime) return
					const next = {
						dock: patch.dock === 'right' ? 'right' : patch.dock === 'left' ? 'left' : snapshot.layout.dock,
						collapsed: typeof patch.collapsed === 'boolean' ? patch.collapsed : snapshot.layout.collapsed,
					}
					publish(next)
					pending = next
					void drain()
				},
			}
		}

		/** 仅布局变化不作重新评估；隐藏 Key 的纯修订更新仍会使旧结果失效。 */
		function adviceSettingsIdentity(snapshot, previous, provenance = 'external') {
			const observed = snapshot
			snapshot = ownedSettingsSnapshot(snapshot)
			const before = previous?.snapshot
			const layoutChanged = before?.value?.cardDock !== snapshot?.value?.cardDock || before?.value?.cardCollapsed !== snapshot?.value?.cardCollapsed
			const visibleSame = sameAdviceSettings(before, snapshot)
			const changedKey = previous ? previous.key + 1 : 0
			if (previous && previous.revision === snapshot?.revision && visibleSame && !layoutChanged) {
				return { observed, snapshot, revision: snapshot?.revision, provenance,
					key: previous.pending && provenance === 'external' ? changedKey : previous.key,
					pending: previous.pending === true && provenance === 'pending' }
			}
			const layoutOnly = before && layoutChanged && visibleSame && provenance !== 'external'
			return { observed, snapshot, revision: snapshot?.revision, provenance,
				key: layoutOnly ? previous.key : changedKey, pending: Boolean(layoutOnly && provenance === 'pending') }
		}

		/** 只展示宿主返回的隐私元数据，不把上下文正文带回卡片。 */
		function privacySummary(privacy, t) {
			if (!isRecord(privacy)) return undefined
			const parts = []
			parts.push(privacy.includedTranscript === true ? t('panel.transcriptIncluded') : t('panel.transcriptOmitted'))
			if (Number.isFinite(privacy.contextChars)) parts.push(t('panel.chars', { count: String(privacy.contextChars) }))
			if (Number.isFinite(privacy.redactions)) parts.push(t('panel.redactions', { count: String(privacy.redactions) }))
			if (privacy.truncated === true) parts.push(t('panel.truncated'))
			return parts.join(' · ')
		}

		/** usage 只接受非负整数 token 计数，缺失或异常字段时不伪造价格或估算值。 */
		function usageSummary(usage) {
			if (!isRecord(usage)) return undefined
			const tokenCount = (value) => Number.isInteger(value) && value >= 0 ? value : undefined
			const input = tokenCount(usage.input_tokens)
			const output = tokenCount(usage.output_tokens)
			if (input === undefined && output === undefined) return undefined
			return { input, output }
		}

		/* ------------------------------------------------------------------ *
		 * Advice panel — a frame-wide floating surface (shell.overlay)
		 * ------------------------------------------------------------------ */

		/**
		 * Floating advice card.
		 *
		 * It never replaces the shipped question composer: the composer chain
		 * elects exactly one entry, so this plugin renders beside it in the
		 * additive `shell.overlay` layer instead, reading the same pending
		 * interaction the composer renders from.
		 */
		function JevAdviceOverlay(props) {
			const { t, scope } = props
			const useSessionStatus = props.useSessionStatus ?? absentSelector
			// shell.overlay 是根槽位，宿主不会替自定义 props 订阅主会话。
			const subscribeMain = React.useCallback(listener => typeof props.mainSession?.subscribe === 'function' ? props.mainSession.subscribe(listener) : () => {}, [props.mainSession])
			const readMain = React.useCallback(() => mainSessionIdOf(props.mainSession), [props.mainSession])
			const mainSessionId = React.useSyncExternalStore(subscribeMain, readMain, readMain)
			const preferredSessionId = props.sessionId ?? mainSessionId
			const interaction = useSessionStatus((snapshot) => pendingInteractionOf(snapshot, preferredSessionId))
			const subscribeInteraction = React.useCallback(listener => typeof interaction?.subscribe === 'function' ? interaction.subscribe(listener) : () => {}, [interaction])
			const readInteraction = React.useCallback(() => interactionSnapshotOf(interaction), [interaction])
			const interactionSnapshot = React.useSyncExternalStore(subscribeInteraction, readInteraction, readInteraction)

			const normalized = pendingQuestionsOf(interaction)
			const questions = normalized === undefined ? undefined : normalized.questions
			const complete = normalized !== undefined && normalized.complete
			const sessionId = interaction === undefined || interaction === null ? undefined : interaction.sessionId
			const interactionKey = interaction === undefined || interaction === null ? undefined : interaction.key
			const identity = questions === undefined ? '' : JSON.stringify([sessionId, interactionKey, interaction.questions ?? normalized.approval])

			const settingsSnapshot = useStoreSnapshot(scope)
			const settingsValue = settingsSnapshot !== undefined && settingsSnapshot.status === 'ready' ? settingsSnapshot.value : undefined

			const enabled = settingsSnapshot?.status === 'ready' && settingsValue?.enabled !== false
			const includeTranscript = settingsValue?.includeTranscript !== false
			const requireConfirmation = settingsValue?.requireConfirmation === true
			const autoAdvise = settingsValue?.autoAdvise === true
			const defaultComparePerspectives = settingsValue?.comparePerspectives === true
			const manualRequest = React.useRef({ scope: undefined, started: false, generation: 0 })
			const [result, setState] = React.useState({ status: 'idle' })
			const [dismissed, setDismissed] = React.useState(undefined)
			const [submission, setSubmission] = React.useState({ status: 'idle' })
			const [attempt, setAttempt] = React.useState(0)
			const layoutController = React.useMemo(() => createLayoutController(scope, props), [scope])
			React.useEffect(() => layoutController.start(), [layoutController])
			const layoutState = useStoreSnapshot(layoutController)
			const { layout } = layoutState
			const [, setPreferenceRevision] = React.useState(0)
			const [copyState, setCopyState] = React.useState({ status: 'idle' })
			const latest = React.useRef(undefined)
			const submitting = React.useRef(new Set())
			const confirming = React.useRef(new Set())
			const requestController = React.useRef(undefined)
			const closedLoading = React.useRef(false)
			const copyNonce = React.useRef(0)
			const copying = React.useRef(new Set())
			const preferenceRef = React.useRef({ identity: undefined, draft: '', applied: '', compareOverride: undefined, perspectivesDraft: undefined, perspectivesApplied: undefined, customInput: '' })
			const dismissedRef = React.useRef(dismissed)
			const settingsIdentity = React.useRef(undefined)
			const settingsProvenance = layoutController.classifySettings(settingsSnapshot, settingsIdentity.current?.revision)
			if (settingsIdentity.current?.observed !== settingsSnapshot || settingsIdentity.current?.revision !== settingsSnapshot?.revision || settingsIdentity.current?.provenance !== settingsProvenance) {
				settingsIdentity.current = adviceSettingsIdentity(settingsSnapshot, settingsIdentity.current, settingsProvenance)
			}
			dismissedRef.current = dismissed
			const defaultPerspectives = React.useMemo(
				() => defaultPerspectivesFor(normalized, settingsValue?.customPerspectives, t),
				[identity, settingsValue?.customPerspectives, t],
			)
			// 在 render 阶段按交互身份真正清空草稿和已应用偏好，避免 A→B→A
			// 又复活旧值；事件处理器也只会写入当前 identity 的槽位。
			if (preferenceRef.current.identity !== identity) {
				preferenceRef.current = { identity, draft: '', applied: '', compareOverride: undefined, perspectivesDraft: undefined, perspectivesApplied: undefined, customInput: '' }
			}
			const currentDraftPreference = preferenceRef.current.draft
			const currentAppliedPreference = preferenceRef.current.applied
			const comparePerspectives = preferenceRef.current.compareOverride ?? defaultComparePerspectives
			const currentDraftPerspectives = preferenceRef.current.perspectivesDraft ?? defaultPerspectives
			const currentAppliedPerspectives = preferenceRef.current.perspectivesApplied ?? defaultPerspectives
			const customPerspectiveInput = preferenceRef.current.customInput ?? ''
			const collapsed = layout.collapsed === true
			const dock = layout.dock === 'right' ? 'right' : 'left'
			const requestScope = JSON.stringify([identity, enabled, autoAdvise, settingsIdentity.current.key])
			if (manualRequest.current.scope !== requestScope) manualRequest.current = { scope: requestScope, started: false, generation: manualRequest.current.generation + 1 }
			const authorized = autoAdvise || manualRequest.current.started
			const requestKey = JSON.stringify([
				identity,
				attempt,
				enabled,
				requireConfirmation,
				settingsIdentity.current.key,
				currentAppliedPreference,
				authorized,
				manualRequest.current.generation,
				comparePerspectives,
				comparePerspectives ? currentAppliedPerspectives : null,
			])
			latest.current = { requestKey, identity, interaction, active: enabled && !settingsIdentity.current.pending && dismissed !== identity }
			React.useEffect(() => {
				latest.current.active = enabled && !settingsIdentity.current.pending && dismissedRef.current !== latest.current.identity
				return () => {
					latest.current.active = false
					copyNonce.current += 1
				}
			}, [])
			// 在新交互的首次 render 就隐藏旧结果，不等待被动 effect 清理。
			const state = result.requestKey === requestKey && !settingsIdentity.current.pending ? result : { status: questions === undefined || !authorized ? 'idle' : 'loading' }
			const busy = submitting.current.has(identity)
			const adoptError = submission.identity === identity ? submission.error : undefined

			React.useEffect(() => {
				if (questions === undefined || !enabled || !authorized || dismissedRef.current === identity) {
					return undefined
				}
				try { interaction?.takeTime?.() } catch { /* 倒计时冻结失败不阻断建议请求。 */ }
				const controller = new AbortController()
				requestController.current = { requestKey, controller }
				setState({ status: 'loading', requestKey })
				const payload = { requestId: globalThis.crypto.randomUUID(), sessionId, interactionKey, questions }
				if (currentAppliedPreference !== '') payload.decisionPreference = currentAppliedPreference
				if (comparePerspectives) {
					payload.comparePerspectives = true
					payload.perspectives = currentAppliedPerspectives
				}
				if (normalized?.approval !== undefined) payload.approval = normalized.approval
				const method = requireConfirmation ? 'prepare' : 'advise'
				callApi(method, payload, controller.signal).then(
					(value) => {
						if (controller.signal.aborted || latest.current.requestKey !== requestKey) return
						setState(requireConfirmation
							? { status: 'preview', requestKey, value }
							: { status: 'ready', requestKey, value })
					},
					(error) => {
						if (controller.signal.aborted || latest.current.requestKey !== requestKey) return
						if (error instanceof Error && error.name === 'AbortError') return
						setState({ status: 'error', phase: method, requestKey, retryable: error?.retryable !== false, code: error?.code, message: error instanceof Error ? error.message : String(error) })
					},
				)
				return () => {
					controller.abort()
					const current = requestController.current
					// 确认发送可能已经替换了 prepare controller；同一 requestKey
					// 的 effect 清理也必须中止这条实际仍在网络中的请求。
					if (current?.requestKey === requestKey) {
						if (current.controller !== controller) current.controller.abort()
						requestController.current = undefined
					}
				}
			}, [requestKey])

			React.useEffect(() => {
				closedLoading.current = false
				copyNonce.current += 1
				setCopyState({ status: 'idle' })
			}, [identity])

			if (interaction === undefined || interaction === null || questions === undefined || !enabled) return null
			if (dismissed === identity) {
				const reopenStyle = dock === 'right' ? { ...S.reopen, left: 'auto', right: '12px' } : S.reopen
				return h(
					'div',
					{ style: reopenStyle, 'data-dsh-jev-advisor': 'reopen', 'data-dock': dock },
					h('button', { type: 'button', style: S.secondary, onClick: () => {
						setDismissed(undefined)
						if (closedLoading.current || result.requestKey !== requestKey) {
							closedLoading.current = false
							setAttempt((value) => value + 1)
						}
					} }, t('panel.open')),
				)
			}

			const close = () => {
				if (state.status === 'loading' || state.status === 'sending') {
					manualRequest.current.started = false
					closedLoading.current = true
					requestController.current?.controller?.abort()
					setState({ status: 'idle', requestKey })
				}
				setDismissed(identity)
			}
			const updateLayout = patch => layoutController.update(patch)
			// 在 React 再渲染前同步撤销旧闭包，覆盖快速双击和陈旧按钮。
			const ask = () => {
				if (!latest.current?.active || latest.current.identity !== identity || latest.current.requestKey !== requestKey
					|| !interactionAllowsAdvice(latest.current.interaction) || manualRequest.current.started) return
				manualRequest.current.started = true
				latest.current = { ...latest.current, requestKey: `stale:${requestKey}` }
				setAttempt(value => value + 1)
			}
			const applyPreference = () => {
				const next = normalizeDecisionPreference(currentDraftPreference)
				if (next === currentAppliedPreference || latest.current?.identity !== identity || latest.current?.requestKey !== requestKey || latest.current?.active !== true) return
				// 先让旧预览、采纳和复制闭包失效，再等待 React 提交新的 requestKey。
				requestController.current?.controller?.abort()
				copyNonce.current += 1
				if (latest.current !== undefined) latest.current = { ...latest.current, requestKey: `stale:${requestKey}` }
				// 即使偏好值绕回旧字符串，也必须生成单调的新评估身份。
				setAttempt((value) => value + 1)
				preferenceRef.current = { ...preferenceRef.current, identity, draft: currentDraftPreference, applied: next }
				setPreferenceRevision((value) => value + 1)
			}
			const updateDraftPreference = (value) => {
				if (latest.current?.identity !== identity || latest.current?.requestKey !== requestKey || latest.current?.active !== true) return
				preferenceRef.current = { ...preferenceRef.current, identity, draft: String(value), applied: preferenceRef.current.applied }
				setPreferenceRevision((revision) => revision + 1)
			}
			const toggleComparePerspectives = (checked) => {
				if (latest.current?.identity !== identity || latest.current?.requestKey !== requestKey || latest.current?.active !== true) return
				const next = Boolean(checked)
				if (next === comparePerspectives) return
				requestController.current?.controller?.abort()
				copyNonce.current += 1
				if (latest.current !== undefined) latest.current = { ...latest.current, requestKey: `stale:${requestKey}` }
				setAttempt((value) => value + 1)
				preferenceRef.current = {
					...preferenceRef.current,
					identity,
					compareOverride: next,
					perspectivesApplied: currentDraftPerspectives,
				}
				setPreferenceRevision((revision) => revision + 1)
			}
			const addDraftPerspective = (candidate) => {
				if (latest.current?.identity !== identity || latest.current?.requestKey !== requestKey || latest.current?.active !== true) return
				if (currentDraftPerspectives.length >= 5) return
				const candidateLabel = perspectiveLabelOf(candidate, t)
				if (candidateLabel === '' || currentDraftPerspectives.some((item) => item.id === candidate.id || perspectiveLabelOf(item, t) === candidateLabel)) return
				preferenceRef.current = {
					...preferenceRef.current,
					identity,
					perspectivesDraft: [...currentDraftPerspectives, candidate],
				}
				setPreferenceRevision((revision) => revision + 1)
			}
			const removeDraftPerspective = (target) => {
				if (latest.current?.identity !== identity || latest.current?.requestKey !== requestKey || latest.current?.active !== true) return
				if (currentDraftPerspectives.length <= 1) return
				const targetLabel = perspectiveLabelOf(target, t)
				const next = currentDraftPerspectives.filter((item) => !(item.id === target.id && perspectiveLabelOf(item, t) === targetLabel))
				if (next.length === 0 || next.length === currentDraftPerspectives.length) return
				preferenceRef.current = {
					...preferenceRef.current,
					identity,
					perspectivesDraft: next,
				}
				setPreferenceRevision((revision) => revision + 1)
			}
			const updateCustomPerspectiveInput = (value) => {
				if (latest.current?.identity !== identity || latest.current?.requestKey !== requestKey || latest.current?.active !== true) return
				preferenceRef.current = { ...preferenceRef.current, identity, customInput: String(value).slice(0, 80) }
				setPreferenceRevision((revision) => revision + 1)
			}
			const addCustomDraftPerspective = () => {
				if (latest.current?.identity !== identity || latest.current?.requestKey !== requestKey || latest.current?.active !== true) return
				if (currentDraftPerspectives.length >= 5) return
				const label = customPerspectiveInput.trim().slice(0, 80)
				if (label === '' || currentDraftPerspectives.some((item) => perspectiveLabelOf(item, t) === label)) return
				const usedIds = new Set(currentDraftPerspectives.map((item) => item.id))
				let idx = currentDraftPerspectives.length
				while (usedIds.has(`custom_${String(idx)}`)) idx += 1
				preferenceRef.current = {
					...preferenceRef.current,
					identity,
					customInput: '',
					perspectivesDraft: [...currentDraftPerspectives, { id: `custom_${String(idx)}`, label, prompt: label }],
				}
				setPreferenceRevision((revision) => revision + 1)
			}
			const applyPerspectives = () => {
				if (latest.current?.identity !== identity || latest.current?.requestKey !== requestKey || latest.current?.active !== true) return
				if (sameJson(currentDraftPerspectives, currentAppliedPerspectives)) return
				requestController.current?.controller?.abort()
				copyNonce.current += 1
				if (latest.current !== undefined) latest.current = { ...latest.current, requestKey: `stale:${requestKey}` }
				setAttempt((value) => value + 1)
				preferenceRef.current = {
					...preferenceRef.current,
					identity,
					perspectivesDraft: currentDraftPerspectives,
					perspectivesApplied: currentDraftPerspectives,
				}
				setPreferenceRevision((revision) => revision + 1)
			}
			const copyAnswers = async () => {
				if (!adoptable || !latest.current.active || !interactionAllowsAdvice(latest.current.interaction) || latest.current.requestKey !== requestKey || copying.current.has(requestKey)) return
				const text = buildCopyText(questions, advice)
				if (text === undefined) return
				// 同步锁覆盖 React 尚未渲染禁用按钮前的重复事件；不同请求互不占锁。
				copying.current.add(requestKey)
				const nonce = ++copyNonce.current
				setCopyState({ status: 'copying', identity, requestKey })
				try {
					const writeText = globalThis.navigator?.clipboard?.writeText
					if (typeof writeText !== 'function') throw new Error('Clipboard API is unavailable')
					await writeText.call(globalThis.navigator.clipboard, text)
					if (nonce === copyNonce.current && latest.current.identity === identity && latest.current.requestKey === requestKey) {
						setCopyState({ status: 'success', identity, requestKey })
					}
				} catch (error) {
					if (nonce !== copyNonce.current || latest.current.identity !== identity || latest.current.requestKey !== requestKey) return
					setCopyState({ status: 'error', identity, requestKey, message: error instanceof Error ? error.message : String(error) })
				} finally {
					copying.current.delete(requestKey)
				}
			}
			const retry = () => {
				if (!latest.current?.active || latest.current.requestKey !== requestKey || latest.current.identity !== identity
					|| !interactionAllowsAdvice(latest.current.interaction)) return
				if (state.phase === 'advise' && state.code !== 'jev/preview-invalid' && state.prepared !== undefined) {
					void confirmSend(state.prepared)
					return
				}
				latest.current = { ...latest.current, requestKey: `stale:${requestKey}` }
				setAttempt((value) => value + 1)
			}

			const advice = state.status === 'ready' ? state.value.advice : undefined
			const answerAdoptable = complete && typeof sessionId === 'string' && sessionId !== '' && typeof interactionKey === 'string' && interactionKey !== ''
				&& typeof interaction.answer === 'function' && advice !== undefined && isAdoptable(questions, advice)
			const planDismissable = complete && typeof sessionId === 'string' && sessionId !== '' && typeof interactionKey === 'string' && interactionKey !== ''
				&& advice !== undefined && !answerAdoptable && isPlanDismissable(questions, advice, interaction)
			const adoptable = answerAdoptable || planDismissable

			const confirmSend = async (prepared = state.value) => {
				if (!requireConfirmation || !isRecord(prepared) || !isRecord(prepared.binding) || typeof prepared.previewToken !== 'string'
					|| (state.status !== 'preview' && state.status !== 'error') || confirming.current.has(identity)
					|| !latest.current.active || !interactionAllowsAdvice(latest.current.interaction) || latest.current.requestKey !== requestKey) return
				confirming.current.add(identity)
				const payload = { ...prepared.binding, previewToken: prepared.previewToken }
				const controller = new AbortController()
				requestController.current = { requestKey, controller }
				setState({ status: 'sending', requestKey, prepared, value: prepared })
				try {
					const value = await callApi('advise', payload, controller.signal)
					if (!controller.signal.aborted && latest.current.requestKey === requestKey) setState({ status: 'ready', requestKey, value })
				} catch (error) {
					if (controller.signal.aborted || latest.current.requestKey !== requestKey || error?.name === 'AbortError') return
					setState({ status: 'error', phase: 'advise', requestKey, prepared, retryable: error?.retryable !== false, code: error?.code, message: error instanceof Error ? error.message : String(error) })
				} finally {
					confirming.current.delete(identity)
				}
			}

			const adopt = async () => {
				if (!adoptable || !latest.current.active || !interactionAllowsAdvice(latest.current.interaction) || latest.current.requestKey !== requestKey || submitting.current.has(identity)) return
				const isDismiss = !answerAdoptable && planDismissable
				const answers = isDismiss ? undefined : buildAnswers(questions, advice)
				if (!isDismiss && answers === undefined) return
				// 同步锁覆盖双击及 React 尚未重新渲染的时间窗口。
				submitting.current.add(identity)
				setSubmission({ status: 'busy', identity })
				try {
					if (isDismiss) {
						await latest.current.interaction.dismiss()
					} else if (normalized?.kind === 'approval') {
						const picked = answers[0]?.selected?.[0]
						const outcome = picked === 'allow-once' ? 'allowed-once' : picked === 'reject' ? 'rejected' : undefined
						if (outcome === undefined) throw new Error('invalid approval outcome')
						await latest.current.interaction.answer(outcome)
					} else {
						await latest.current.interaction.answer({ answers })
					}
					if (latest.current.active && latest.current.identity === identity) setSubmission({ status: 'submitted', identity })
				} catch (error) {
					submitting.current.delete(identity)
					if (latest.current.active && latest.current.identity === identity) setSubmission({ status: 'error', identity, error: error instanceof Error ? error.message : String(error) })
				}
			}

			const onFocusCapture = (event) => {
				if (event?.relatedTarget && typeof event?.currentTarget?.contains === 'function' && event.currentTarget.contains(event.relatedTarget)) return
				try { latest.current?.interaction?.holdFocus?.() } catch { /* ignore */ }
			}
			const onBlurCapture = (event) => {
				if (event?.relatedTarget && typeof event?.currentTarget?.contains === 'function' && event.currentTarget.contains(event.relatedTarget)) return
				if (state.status === 'loading' || state.status === 'sending') return
				try { latest.current?.interaction?.releaseFocus?.() } catch { /* ignore */ }
			}

			const children = []

			children.push(
				h(
					'div',
					{ key: 'header', style: S.header },
					h(
						'div',
						{ style: { flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: '2px' } },
						h('div', { style: S.title }, t('panel.title')),
						h('div', { style: S.subtitle }, state.status === 'ready' && state.value.model !== undefined ? `${t('panel.subtitle')} · ${String(state.value.model)}` : t('panel.subtitle')),
					),
					h('button', { type: 'button', style: S.iconButton, title: dock === 'left' ? t('panel.dockRight') : t('panel.dockLeft'), 'aria-label': dock === 'left' ? t('panel.dockRight') : t('panel.dockLeft'), onClick: () => updateLayout({ dock: dock === 'left' ? 'right' : 'left' }) }, dock === 'left' ? '⇥' : '⇤'),
					h('button', { type: 'button', style: S.iconButton, title: collapsed ? t('panel.expand') : t('panel.collapse'), 'aria-label': collapsed ? t('panel.expand') : t('panel.collapse'), onClick: () => updateLayout({ collapsed: !collapsed }) }, collapsed ? '▸' : '▾'),
					h(
						'button',
						{ type: 'button', style: S.iconButton, title: t('panel.dismiss'), onClick: close },
						'✕',
					),
				),
			)

			if (!collapsed) children.push(h('div', { key: 'dock-help', style: S.note }, t('panel.dockHelp')))
			if (layoutState.failed) children.push(h('div', { key: 'layout-error', style: S.error, role: 'status' }, t('panel.layoutSaveFailed')))
			if (!collapsed && isRecord(interactionSnapshot?.countdown)) {
				const running = interactionSnapshot.countdown.running === true
				children.push(h(
					'div',
					{ key: 'countdown', style: S.actions, 'data-dsh-jev-advisor': 'countdown' },
					h('span', { style: S.note }, t(running ? 'panel.countdownActive' : 'panel.countdownHeld')),
					running && typeof interaction.takeTime === 'function'
						? h('button', { type: 'button', style: S.secondary, onClick: () => { try { interaction.takeTime() } catch {} } }, t('panel.takeTime'))
						: null,
				))
			}

			if (!collapsed) {
				const preferenceChanged = normalizeDecisionPreference(currentDraftPreference) !== currentAppliedPreference
				const perspectivesChanged = comparePerspectives && !sameJson(currentDraftPerspectives, currentAppliedPerspectives)
				children.push(h(
					'div',
					{ key: 'decision-preference', style: S.section, 'data-dsh-jev-advisor': 'decision-preference' },
					h('label', { style: S.field },
						h('span', { style: S.label }, t('panel.preferenceLabel')),
						h('textarea', {
							style: S.input,
							value: currentDraftPreference,
							maxLength: 500,
							rows: 3,
							placeholder: t('panel.preferencePlaceholder'),
							onChange: (event) => updateDraftPreference(event.target.value),
						}),
					),
					h('div', { style: S.actions },
						h('button', { type: 'button', style: S.secondary, onClick: () => updateDraftPreference(t('panel.preferenceStable')) }, t('panel.preferenceStable')),
						h('button', { type: 'button', style: S.secondary, onClick: () => updateDraftPreference(t('panel.preferenceFast')) }, t('panel.preferenceFast')),
						h('button', { type: 'button', style: S.secondary, onClick: () => updateDraftPreference(t('panel.preferenceMinimal')) }, t('panel.preferenceMinimal')),
					),
					h('div', { style: S.actions },
						h('button', { type: 'button', style: { ...S.primary, opacity: preferenceChanged ? 1 : 0.5 }, disabled: !preferenceChanged, onClick: applyPreference }, t(authorized ? 'panel.preferenceApply' : 'panel.preferenceApplyIdle')),
						preferenceChanged ? h('span', { style: S.note }, t(authorized ? 'panel.preferenceApplied' : 'panel.preferenceNext')) : null,
					),
					h('label', { style: S.checkboxRow },
						h('input', {
							type: 'checkbox',
							checked: comparePerspectives,
							onChange: (event) => toggleComparePerspectives(event.target.checked),
						}),
						t('panel.comparePerspectives'),
					),
					comparePerspectives
						? h('div', { style: S.section, 'data-dsh-jev-advisor': 'perspectives-editor' },
							h('div', { style: S.note }, t('panel.perspectivesEditorTitle')),
							h('div', { style: S.actions, 'data-dsh-jev-advisor': 'perspectives-active' },
								...currentDraftPerspectives.map((item) => {
									const label = perspectiveLabelOf(item, t)
									return h('span', {
										key: `active-${String(item.id)}-${label}`,
										style: { ...S.secondary, display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'default' },
									},
										h('span', null, label),
										currentDraftPerspectives.length > 1
											? h('button', {
												type: 'button',
												style: { ...S.iconButton, fontSize: '11px', padding: '0 2px' },
												title: t('panel.perspectiveRemove', { label }),
												'aria-label': t('panel.perspectiveRemove', { label }),
												onClick: () => removeDraftPerspective(item),
											}, '×')
											: null,
									)
								}),
							),
							currentDraftPerspectives.length < 5
								? h('div', { style: S.actions, 'data-dsh-jev-advisor': 'perspectives-presets' },
									h('span', { style: S.note }, t('panel.perspectiveQuickAdd')),
									...PERSPECTIVE_PRESETS
										.map((preset) => presetPerspective(preset.id, t))
										.filter((candidate) => !currentDraftPerspectives.some((active) => active.id === candidate.id || perspectiveLabelOf(active, t) === candidate.label))
										.map((candidate) => h('button', {
											key: `preset-${candidate.id}`,
											type: 'button',
											style: { ...S.secondary, padding: '2px 7px', fontSize: '11px' },
											onClick: () => addDraftPerspective(candidate),
										}, `+ ${candidate.label}`)),
								)
								: null,
							currentDraftPerspectives.length < 5
								? h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
									h('input', {
										type: 'text',
										style: { ...S.input, flex: '1 1 auto' },
										value: customPerspectiveInput,
										maxLength: 80,
										placeholder: t('panel.perspectiveCustomPlaceholder'),
										onChange: (event) => updateCustomPerspectiveInput(event.target.value),
										onKeyDown: (event) => {
											if (event.key === 'Enter') {
												event.preventDefault()
												addCustomDraftPerspective()
											}
										},
									}),
									h('button', {
										type: 'button',
										style: S.secondary,
										disabled: customPerspectiveInput.trim() === '',
										onClick: addCustomDraftPerspective,
									}, t('panel.perspectiveAdd')),
								)
								: null,
							perspectivesChanged
								? h('div', { style: S.actions },
									h('button', { type: 'button', style: S.primary, onClick: applyPerspectives }, t(authorized ? 'panel.perspectiveApply' : 'panel.perspectiveApplyIdle')),
									h('span', { style: S.note }, t(authorized ? 'panel.preferenceApplied' : 'panel.preferenceNext')),
								)
								: null,
						)
						: null,
				))
			}

			if (!collapsed && state.status === 'loading') {
				const loadingKey = requireConfirmation
					? 'panel.preparing'
					: !autoAdvise ? 'panel.loading' : includeTranscript ? 'panel.loadingAutoWithTranscript' : 'panel.loadingAutoWithoutTranscript'
				children.push(h('div', { key: 'loading', style: S.note }, t(loadingKey)))
			}

			if (!collapsed && state.status === 'idle') children.push(h('div', { key: 'manual', style: S.section },
				h('div', { style: S.note }, t('panel.manualHint')),
				h('button', { type: 'button', style: S.primary, onClick: ask, disabled: settingsIdentity.current.pending }, t('panel.ask')),
			))

			if (!collapsed && state.status === 'error') {
				const message = state.message
				const noKey = /api key/i.test(message)
				// 451 是地区限制：重试不会有任何作用，必须给出可操作的说明。
				const blocked = /451|unavailable for legal reasons/i.test(message)
				children.push(h('div', { key: 'error', style: S.error }, noKey ? t('panel.noKey') : message))
				if (blocked) children.push(h('div', { key: 'region', style: S.note }, t('panel.regionBlocked')))
				if (/disabled/i.test(message)) children.push(h('div', { key: 'disabled', style: S.note }, t('panel.disabled')))
				if (state.retryable !== false && !blocked) children.push(
					h(
						'div',
						{ key: 'retry', style: S.actions },
						h(
							'button',
							{ type: 'button', style: S.secondary, onClick: retry },
							t('panel.retry'),
						),
					),
				)
			}

			if (!collapsed && (state.status === 'preview' || state.status === 'sending' || (state.status === 'error' && state.phase === 'advise' && state.prepared !== undefined))) {
				const prepared = state.value ?? state.prepared
				children.push(h(JevPrepareBody, {
					key: 'preview',
					t,
					value: prepared,
					busy: state.status === 'sending',
					error: state.status === 'error' && state.phase === 'advise' ? state.message : undefined,
					onConfirm: () => { void confirmSend(prepared) },
				}))
			}

			if (!collapsed && state.status === 'ready' && advice !== undefined) {
				children.push(
					h(JevAdviceBody, {
						key: 'body',
						t,
						questions,
						value: state.value,
						adoptable,
						busy,
						adoptError,
						copyState: copyState.identity === identity && copyState.requestKey === requestKey ? copyState : { status: 'idle' },
						onCopy: () => { void copyAnswers() },
						onAdopt: () => {
							void adopt()
						},
					}),
				)
			}

			const cardStyle = dock === 'right' ? { ...S.card, left: 'auto', right: '12px' } : S.card
			return h('div', {
				style: cardStyle,
				'data-dsh-jev-advisor': 'advice',
				'data-dock': dock,
				'data-collapsed': collapsed ? 'true' : 'false',
				onFocusCapture,
				onBlurCapture,
			}, ...children)
		}

		/** 确认模式只展示宿主准备好的精确 JSON，确认前绝不触发 advise。 */
		function JevPrepareBody(props) {
			const { t, value, busy, error, onConfirm } = props
			if (!isRecord(value)) return null
			const summary = privacySummary(value.privacy, t)
			const requestBytes = Number.isFinite(value.privacy?.requestBytes) ? value.privacy.requestBytes : undefined
			return h(
				'div',
				{ style: S.section, 'data-dsh-jev-advisor': 'preview' },
				h('div', { style: S.note }, t('panel.preview')),
				summary === undefined ? null : h('div', { style: S.note, 'data-dsh-jev-advisor': 'privacy', 'data-privacy': JSON.stringify(value.privacy) }, t('panel.context', { summary })),
				requestBytes === undefined ? null : h('div', { style: S.note }, t('panel.bytes', { bytes: String(requestBytes) })),
				h('pre', { style: S.pre, 'data-dsh-jev-advisor': 'preview-json' }, JSON.stringify(value.request, null, 2)),
				error === undefined ? null : h('div', { style: S.error }, error),
				h('div', { style: S.actions }, h(
					'button',
					{ type: 'button', style: { ...S.primary, opacity: busy ? 0.5 : 1 }, disabled: busy, onClick: onConfirm },
					busy ? t('panel.adopting') : t('panel.confirm'),
				)),
			)
		}

		/**
		 * The advice itself: one block per question, the recommendation, the rest
		 * of the distribution, Jev's confidence, the adopt button, and the exact
		 * JSON that crossed the wire.
		 *
		 * Pure and hook-free on purpose — the overlay owns the fetch and the
		 * pending-question lifecycle, while this owns presentation, which keeps
		 * the recommendation path directly renderable in `test/client.mjs`.
		 */
		function JevAdviceBody(props) {
			const { t, questions, value, adoptable, busy, adoptError, copyState, onCopy, onAdopt } = props
			const advice = value.advice ?? []
			const multiQuestion = questions.length > 1
			const children = []
			const summary = privacySummary(value.privacy, t)
			const usage = usageSummary(value.usage)
			const requestBytes = Number.isFinite(value.privacy?.requestBytes) ? value.privacy.requestBytes : undefined
			if (summary !== undefined) children.push(h('div', { key: 'privacy', style: S.note, 'data-dsh-jev-advisor': 'privacy', 'data-privacy': JSON.stringify(value.privacy) }, t('panel.context', { summary })))
			if (requestBytes !== undefined) children.push(h('div', { key: 'bytes', style: S.note }, t('panel.bytes', { bytes: String(requestBytes) })))
			if (usage !== undefined) children.push(h('div', { key: 'usage', style: S.note, 'data-dsh-jev-advisor': 'usage' }, t('panel.usage', {
				input: usage.input === undefined ? '—' : String(usage.input),
				output: usage.output === undefined ? '—' : String(usage.output),
			})))
			if (value.reused === true) children.push(h('div', { key: 'reused', style: S.note }, t('panel.reused')))

			advice.forEach((entry, index) => {
				if (entry.supported !== true) return
				const question = questions[index]
				if (question === undefined) return
				const rows = []
				rows.push(
					h(
						'div',
						{ key: 'q', style: S.question },
						multiQuestion
							? `${t('panel.question', { index: index + 1 })}: ${displayLabel(question.header ?? question.question)}`
							: displayLabel(question.header ?? question.question),
					),
				)

				if (entry.answered !== true) {
					rows.push(h('div', { key: 'unanswered', style: S.note }, t('panel.unanswered')))
				} else if (entry.kind === 'choice') {
					if (entry.noneOfTheAbove === true || entry.pick === undefined) {
						rows.push(h('div', { key: 'none', style: S.note }, t('panel.noneOfTheAbove')))
					} else {
						rows.push(
							h(
								'div',
								{ key: 'pick', style: S.pick },
								h('span', { style: S.badge }, t('panel.recommend')),
								h('span', { style: S.recommendation }, displayLabel(entry.pick.label)),
							),
						)
						rows.push(
							h(
								'div',
								{ key: 'bar', style: S.bar },
								h('div', { style: { ...S.barFill, width: `${String(Math.round(entry.pick.probability * 100))}%` } }),
							),
						)
						const others = (entry.probabilities ?? []).filter((row) => row.index !== entry.pick.index)
						if (others.length > 0) {
							rows.push(
								h(
									'div',
									{ key: 'dist', style: S.distribution },
									h('div', null, t('panel.otherOptions')),
									...others.map((row) =>
										h(
											'div',
											{ key: `row-${String(row.index)}`, style: S.row },
											h('span', null, displayLabel(row.label)),
											h('span', { style: S.probability }, `${String(Math.round(row.probability * 100))}%`),
										),
									),
								),
							)
						}
						if (typeof entry.confidence === 'number') {
							rows.push(h('div', { key: 'conf', style: S.note }, `${t('panel.confidence')}: ${String(Math.round(entry.confidence * 100))}%`))
						}
						const hint = decisionHintOf(question, entry)
						if (hint?.kind === 'choice-close') rows.push(h('div', { key: 'hint', style: S.note }, t('panel.probabilityClose')))
						if (hint?.kind === 'choice-other-higher') rows.push(h('div', { key: 'hint', style: S.note }, t('panel.probabilityOtherHigher')))
					}
					if (isRecord(entry.riskScore) && Number.isInteger(entry.riskScore.score) && entry.riskScore.score >= 0 && entry.riskScore.score <= 2) {
						rows.push(h('div', { key: 'risk-score', style: S.note, 'data-dsh-jev-advisor': 'risk-score' }, t(`panel.riskScore.${String(entry.riskScore.score)}`)))
					}
					if (isRecord(entry.planScore) && Number.isInteger(entry.planScore.score) && entry.planScore.score >= 0 && entry.planScore.score <= 2) {
						rows.push(h('div', { key: 'plan-score', style: S.note, 'data-dsh-jev-advisor': 'plan-score' }, t(`panel.planScore.${String(entry.planScore.score)}`)))
					}
					if (Array.isArray(entry.perspectives) && entry.perspectives.length > 0) {
						const allConsistent = entry.noneOfTheAbove === false && entry.pick !== undefined
							&& entry.perspectives.every((item) => item.noneOfTheAbove === false && item.pick?.index === entry.pick.index)
						rows.push(
							h(
								'div',
								{ key: 'perspectives', style: S.distribution, 'data-dsh-jev-advisor': 'perspectives' },
								h('div', null, t('panel.perspectivesTitle')),
								allConsistent
									? h('div', { key: 'consistent', style: S.note }, t('panel.perspectivesConsistent', { count: String(entry.perspectives.length) }))
									: entry.perspectives.map((item) =>
										h(
											'div',
											{ key: `perspective-${String(item.id)}`, style: S.row },
											h('span', null, perspectiveLabelOf(item, t)),
											h('span', { style: S.probability }, item.noneOfTheAbove || !item.pick ? '—' : `${displayLabel(item.pick.label)} (${String(Math.round(item.pick.probability * 100))}%)`),
										),
									),
							),
						)
					}
				}

				if (entry.kind === 'noul-set') {
					const picks = Array.isArray(entry.picks) ? entry.picks : []
					rows.push(
						h(
							'div',
							{ key: 'multi', style: S.distribution },
							h('div', null, t('panel.multiSelect')),
							...picks.map((pick) =>
								h(
									'div',
									{ key: `pick-${String(pick.index)}`, style: S.row },
									h('span', { style: S.recommendation }, displayLabel(pick.label)),
									h('span', { style: S.probability }, `${String(Math.round(pick.probability * 100))}%`),
								),
							),
						),
					)
					const hint = decisionHintOf(question, entry)
					if (hint?.kind === 'multi-close') {
						const labels = hint.indexes.map((hintIndex) => displayLabel(entry.probabilities[hintIndex]?.label ?? '')).filter(Boolean).join(', ')
						rows.push(h('div', { key: 'hint', style: S.note }, t('panel.multiProbabilityClose', { options: labels })))
					}
				}

				children.push(h('div', { key: `q-${entry.questionId}`, style: S.section }, ...rows))
			})

			if (!adoptable) {
				children.push(h('div', { key: 'partial', style: S.note }, t('panel.partial')))
			}

			const adoptLabelKey = questions.length === 1 && questions[0]?.approval === true
				? (advice[0]?.pick?.label === 'reject' ? 'panel.adoptReject' : 'panel.adoptAllowOnce')
				: (questions.length === 1 && questions[0]?.planReview === true && advice[0]?.noneOfTheAbove === true
					? 'panel.adoptPlanDismiss'
					: 'panel.adopt')

			children.push(
				h(
					'div',
					{ key: 'actions', style: S.actions },
					h(
						'button',
						{ type: 'button', style: { ...S.secondary, opacity: adoptable && copyState?.status !== 'copying' ? 1 : 0.5 }, disabled: !adoptable || copyState?.status === 'copying', onClick: onCopy },
						copyState?.status === 'success' ? t('panel.copied') : t('panel.copy'),
					),
					h(
						'button',
						{
							type: 'button',
							style: { ...S.primary, opacity: adoptable && !busy ? 1 : 0.5, cursor: adoptable && !busy ? 'pointer' : 'default' },
							disabled: !adoptable || busy,
							onClick: onAdopt,
						},
						busy ? t('panel.adopting') : t(adoptLabelKey),
					),
				),
			)

			if (copyState?.status === 'error') children.push(h('div', { key: 'copy-error', style: S.error }, t('panel.copyFailed', { message: copyState.message })))

			if (adoptError !== undefined) {
				children.push(h('div', { key: 'adopt-error', style: S.error }, t('panel.adoptFailed', { message: adoptError })))
			}

			children.push(
				h(
					'details',
					{ key: 'json', style: S.details },
					h('summary', { style: { cursor: 'pointer' } }, t('panel.json')),
					h(
						'div',
						{ style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' } },
						h('div', null, t('panel.request')),
						h('pre', { style: S.pre }, JSON.stringify(value.request, null, 2)),
						h('div', null, t('panel.response')),
						h('pre', { style: S.pre }, JSON.stringify(value.response, null, 2)),
					),
				),
			)

			return h('div', { style: S.section }, ...children)
		}

		/* ------------------------------------------------------------------ *
		 * Settings section — Settings → Jev
		 * ------------------------------------------------------------------ */

		/** One labelled form row. */
		function Field(props) {
			return h(
				'label',
				{ style: S.field },
				h('span', { style: S.label }, props.label),
				props.children,
				props.hint === undefined ? null : h('span', { style: S.note }, props.hint),
			)
		}

		/** 浏览器端再次做白名单投影，复制不包含原始状态、端点或异常文本。 */
		function publicDiagnostics(value) {
			const source = isRecord(value) ? value : {}
			const version = value => typeof value === 'string' && value.length <= 100
				&& /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/.test(value) ? value : null
			const pluginVersion = version(source.pluginVersion), dshVersion = version(source.dshVersion)
			const versions = typeof source.declaredDsh === 'string' && source.declaredDsh.length <= 512 ? source.declaredDsh.split('||').map(value => version(value.trim())) : []
			const declaredDsh = versions.length && versions.every(Boolean) ? versions.join(' || ') : null
			const declarationMatch = dshVersion === null || declaredDsh === null ? 'unknown'
				: versions.some(value => value.split('+')[0] === dshVersion.split('+')[0]) ? 'match' : 'mismatch'
			const report = { pluginVersion, dshVersion, declaredDsh, declarationMatch }
			for (const field of ['enabled', 'autoAdvise', 'hasKey', 'requireConfirmation', 'redactSensitive', 'includeTranscript']) report[field] = typeof source[field] === 'boolean' ? source[field] : null
			return report
		}

		/** 仅复制当前报告；卸载、报告变化和并发点击均不能误报复制成功。 */
		function JevDiagnostics({ t, diagnostics }) {
			const report = publicDiagnostics(diagnostics)
			const text = JSON.stringify(report, null, 2)
			const lifetime = React.useRef({ active: true, busy: false, text, generation: 0 })
			if (lifetime.current.text !== text) {
				lifetime.current.text = text
				lifetime.current.generation += 1
			}
			const generation = lifetime.current.generation
			const [copy, setCopy] = React.useState(undefined)
			React.useEffect(() => {
				lifetime.current.active = true
				return () => { lifetime.current.active = false }
			}, [])
			const copyReport = async () => {
				const current = lifetime.current
				if (!current.active || current.busy || current.generation !== generation) return
				current.busy = true
				try {
					if (typeof globalThis.navigator?.clipboard?.writeText !== 'function') throw new Error('clipboard unavailable')
					await globalThis.navigator.clipboard.writeText(text)
					if (current.active && current.generation === generation) setCopy({ generation, ok: true })
				} catch {
					if (current.active && current.generation === generation) setCopy({ generation, ok: false })
				} finally { current.busy = false }
			}
			return h('section', { style: S.section, 'data-dsh-jev-advisor': 'diagnostics' },
				h('h3', { style: S.sectionTitle }, t('settings.diagnostics')),
				h('p', { style: S.note }, t('settings.diagnosticsHint')),
				diagnostics === undefined ? h('p', { style: S.note, role: 'status' }, t('settings.diagnosticUnavailable')) : null,
				...Object.entries(report).map(([field, value]) => h('div', { key: field, style: S.note }, `${t(`settings.${field}`)}: ${value === null ? t('settings.unknown') : typeof value === 'boolean' ? t(value ? 'settings.yes' : 'settings.no') : field === 'declarationMatch' ? t(`settings.${value}`) : value}`)),
				h('button', { type: 'button', style: S.secondary, onClick: () => { void copyReport() } }, t('settings.copyDiagnostics')),
				copy?.generation === generation ? h('span', { role: 'status', style: copy.ok ? S.success : S.error }, t(copy.ok ? 'settings.diagnosticCopied' : 'settings.diagnosticCopyFailed')) : null,
			)
		}

		/** Settings → Jev: connection fields, key storage, and a connectivity probe. */
		function JevSettingsSection(props) {
			const { t, scope } = props
			const snapshot = useStoreSnapshot(scope)
			const value = snapshot !== undefined && snapshot.status === 'ready' ? snapshot.value : undefined
			const writable = snapshot?.status === 'ready' && snapshot.writable !== false && typeof scope.mutate === 'function'

			const [draft, setDraft] = React.useState({})
			const [busy, setBusy] = React.useState(undefined)
			const [message, setMessage] = React.useState(undefined)
			const [status, setStatus] = React.useState(undefined)
			const lifetime = React.useMemo(() => ({ active: true, operation: undefined, status: undefined }), [scope])
			const latestLifetime = React.useRef(lifetime)
			latestLifetime.current = lifetime
			const live = () => lifetime.active && latestLifetime.current === lifetime

			React.useEffect(() => {
				lifetime.active = true
				return () => {
					lifetime.active = false
					lifetime.status?.abort()
					lifetime.status = undefined
					lifetime.operation?.controller.abort()
					lifetime.operation = undefined
				}
			}, [lifetime])

			const refreshStatus = React.useCallback(async () => {
				if (!live()) return
				lifetime.status?.abort()
				const controller = new AbortController()
				lifetime.status = controller
				try {
					const next = await callApi('status', undefined, controller.signal)
					if (live() && lifetime.status === controller) setStatus(next)
				} catch {
					if (live() && lifetime.status === controller) setStatus(undefined)
				} finally {
					if (lifetime.status === controller) lifetime.status = undefined
				}
			}, [lifetime])

			React.useEffect(() => {
				void refreshStatus()
			}, [refreshStatus, snapshot === undefined ? undefined : snapshot.revision])

			const read = (key, fallback) => (draft[key] !== undefined ? draft[key] : value === undefined || value[key] === undefined ? fallback : value[key])
			const set = (key, next) => {
				if (!live()) return
				setDraft((current) => ({ ...current, [key]: next }))
				setMessage(undefined)
			}
			const dirty = Object.keys(draft).length > 0
			// React 提交前也互斥；异步写入不能撤回，但卸载后的续作必须失效。
			const begin = (kind) => {
				if (!live() || lifetime.operation !== undefined) return undefined
				const current = scope.getSnapshot()
				if (kind !== 'test' && (current?.status !== 'ready' || current.writable === false || typeof scope.mutate !== 'function')) return undefined
				const operation = { controller: new AbortController() }
				lifetime.operation = operation
				setBusy(kind)
				setMessage(undefined)
				return operation
			}
			const currentOperation = (operation) => live() && lifetime.operation === operation
			const finish = (operation) => {
				if (!currentOperation(operation)) return
				lifetime.operation = undefined
				setBusy(undefined)
			}

			const save = async () => {
				const operation = begin('save')
				if (operation === undefined) return
				try {
					await applySettingsDraft(scope, draft, snapshot?.revision)
					if (!currentOperation(operation)) return
					// 保存期间继续输入的值不能被旧提交完成事件清掉。
					setDraft((current) => Object.fromEntries(Object.entries(current).filter(([key, raw]) => !Object.hasOwn(draft, key) || raw !== draft[key])))
					await refreshStatus()
					if (currentOperation(operation)) setMessage({ kind: 'ok', text: t('settings.saved') })
				} catch (error) {
					if (currentOperation(operation)) setMessage({ kind: 'error', text: error?.code === 'settings/write-rejected' ? t('settings.rejected') : error?.code === 'settings/blank-key' ? t('settings.blankKey') : error instanceof Error ? error.message : String(error) })
				} finally {
					finish(operation)
				}
			}

			const clearKey = async () => {
				const operation = begin('clear')
				if (operation === undefined) return
				try {
					if (await scope.mutate([{ op: 'set', path: ['apiKey'], value: '' }], snapshot?.revision) !== true) throw new Error(t('settings.rejected'))
					if (!currentOperation(operation)) return
					setDraft((current) => {
						if (current.apiKey !== draft.apiKey) return current
						const next = { ...current }
						delete next.apiKey
						return next
					})
					await refreshStatus()
					if (currentOperation(operation)) setMessage({ kind: 'ok', text: t('settings.saved') })
				} catch (error) {
					if (currentOperation(operation)) setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) })
				} finally {
					finish(operation)
				}
			}

			const test = async () => {
				const operation = begin('test')
				if (operation === undefined) return
				try {
					const result = await callApi('test', undefined, operation.controller.signal)
					if (currentOperation(operation)) setMessage({ kind: 'ok', text: t('settings.testOk', { model: String(result.model) }) })
				} catch (error) {
					if (currentOperation(operation)) setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) })
				} finally {
					finish(operation)
				}
			}

			const hasKey = status !== undefined && status.hasKey === true
			const keyHint = hasKey ? t('settings.apiKeySet') : t('settings.apiKeyUnset')

			return h(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '560px', color: color.text } },
				h('h2', { style: S.sectionTitle }, t('settings.title')),
				h('p', { style: { ...S.note, margin: 0 } }, t('settings.description')),
				snapshot !== undefined && snapshot.status === 'unavailable' ? h('p', { style: S.error }, t('settings.unavailable')) : null,
				h('div', { style: S.divider }),
				h(
					Field,
					{ label: t('settings.apiKey'), hint: keyHint },
					h('div', { style: { display: 'flex', gap: '8px' } },
						h('input', {
							type: 'password',
							autoComplete: 'off',
							spellCheck: false,
							placeholder: hasKey ? '••••••••' : t('settings.apiKeyPlaceholder'),
							style: S.input,
							value: draft.apiKey ?? '',
							onChange: (event) => set('apiKey', event.target.value),
						}),
						h(
							'button',
							{ type: 'button', style: S.secondary, disabled: !writable || busy !== undefined, onClick: () => { void clearKey() } },
							t('settings.clearKey'),
						),
					),
				),
				h(
					Field,
					{ label: t('settings.endpoint') },
					h('input', {
						type: 'text',
						spellCheck: false,
						style: S.input,
						value: String(read('endpoint', 'https://api.typesafe.ai/v1/systemone')),
						onChange: (event) => set('endpoint', event.target.value),
					}),
				),
				h(
					'div',
					{ style: S.grid },
					h(
						Field,
						{ label: t('settings.model') },
						h('input', {
							type: 'text',
							spellCheck: false,
							style: S.input,
							value: String(read('model', 'jev-latest')),
							onChange: (event) => set('model', event.target.value),
						}),
					),
					h(
						Field,
						{ label: t('settings.timeoutMs') },
						h('input', {
							type: 'number',
							min: 1000,
							max: 180000,
							step: 1000,
							style: S.input,
							value: String(read('timeoutMs', 30000)),
							onChange: (event) => set('timeoutMs', event.target.value),
						}),
					),
				),
				h(
					'label',
					{ style: S.checkboxRow },
					h('input', {
						type: 'checkbox',
						checked: read('enabled', true) !== false,
						onChange: (event) => set('enabled', event.target.checked),
					}),
					t('settings.enabled'),
				),
				h('label', { style: S.checkboxRow },
					h('input', { type: 'checkbox', checked: read('autoAdvise', false) === true, onChange: event => set('autoAdvise', event.target.checked) }),
					t('settings.autoAdvise'),
				),
				h('p', { style: { ...S.note, margin: 0 } }, t('settings.autoAdviseHint')),
				h(
					'label',
					{ style: S.checkboxRow },
					h('input', {
						type: 'checkbox',
						checked: read('includeTranscript', true) !== false,
						onChange: (event) => set('includeTranscript', event.target.checked),
					}),
					t('settings.includeTranscript'),
				),
				h(
					'label',
					{ style: S.checkboxRow },
					h('input', {
						type: 'checkbox',
						checked: read('requireConfirmation', false) === true,
						onChange: (event) => set('requireConfirmation', event.target.checked),
					}),
					t('settings.requireConfirmation'),
				),
				h(
					'label',
					{ style: S.checkboxRow },
					h('input', {
						type: 'checkbox',
						checked: read('redactSensitive', true) === true,
						onChange: (event) => set('redactSensitive', event.target.checked),
					}),
					h('span', null, t('settings.redactSensitive')),
					h('span', { style: S.note }, t('settings.redactSensitiveHint')),
				),
				h(
					'label',
					{ style: S.checkboxRow },
					h('input', {
						type: 'checkbox',
						checked: read('comparePerspectives', false) === true,
						onChange: (event) => set('comparePerspectives', event.target.checked),
					}),
					t('settings.comparePerspectives'),
				),
				h(
					Field,
					{ label: t('settings.customPerspectives') },
					h('input', {
						type: 'text',
						style: S.input,
						placeholder: t('settings.customPerspectivesPlaceholder'),
						value: String(read('customPerspectives', '')),
						onChange: (event) => set('customPerspectives', event.target.value),
					}),
				),
				h(
					Field,
					{ label: t('settings.transcriptMessages') },
					h('input', {
						type: 'number',
						min: 0,
						max: 100,
						step: 1,
						style: { ...S.input, maxWidth: '140px' },
						value: String(read('transcriptMessages', 12)),
						onChange: (event) => set('transcriptMessages', event.target.value),
					}),
				),
				h('div', { style: S.divider }),
				h(
					'div',
					{ style: S.actions },
					h(
						'button',
						{ type: 'button', style: { ...S.primary, opacity: dirty && writable && busy === undefined ? 1 : 0.5 }, disabled: !dirty || !writable || busy !== undefined, onClick: () => { void save() } },
						busy === 'save' ? t('settings.saving') : t('settings.save'),
					),
					h(
						'button',
						{ type: 'button', style: S.secondary, disabled: busy !== undefined, onClick: () => { void test() } },
						busy === 'test' ? t('settings.testing') : t('settings.test'),
					),
					dirty ? h('span', { style: S.note }, t('settings.unsaved')) : null,
				),
				message === undefined ? null : h('div', { style: message.kind === 'ok' ? S.success : S.error }, message.text),
				h('p', { style: { ...S.note, margin: 0 } }, t('settings.testHint')),
				h(JevDiagnostics, { t, diagnostics: status?.diagnostics }),
				h('p', { style: { ...S.note, margin: 0 } }, t('settings.help')),
			)
		}

		/* ------------------------------------------------------------------ *
		 * Plugin body
		 * ------------------------------------------------------------------ */

		/** Client services this plugin consumes. */
		const inject = ['slots', 'locale', 'configForms', 'uiSession']

		/**
		 * Register the dictionaries, the frame-wide advice overlay, and the
		 * settings section.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-jev-advisor: dictionaries')

			// `SETTINGS_NAMESPACE` is the plugin's profile entry id, which is also
			// the key the Host settings service projects this plugin's `Config`
			// form under. `configForms.get` returns a ConfigFormController with the
			// same read/write face the deprecated `settingsScope.bind` had.
			const scope = ctx.configForms.get(SETTINGS_NAMESPACE)
			const mainSession = ctx.uiSession.adapter.current

			ctx.slots.inject('shell.overlay', () =>
				ctx.slots.register(
					{
						name: 'shell.overlay',
						id: 'dsh-jev-advisor-card',
						order: 60,
						locale: NS,
						inject: () => ({ scope, mainSession }),
					},
					JevAdviceOverlay,
				),
			)

			ctx.slots.inject('settings.section', () =>
				ctx.slots.register(
					{
						name: 'settings.section',
						id: 'jev',
						order: 30,
						label: () => ctx.locale.bind(NS)('settings.nav'),
						locale: NS,
						inject: () => ({ scope }),
					},
					JevSettingsSection,
				),
			)
		}

		exports.apply = apply
		exports.inject = inject
		/**
		 * Internal helpers exposed for `test/client.mjs` only. Not a public API:
		 * nothing outside this package should read or call them.
		 */
		exports.internals = {
			publicDiagnostics,
			JevDiagnostics,
			callApi,
			pendingQuestionsOf,
			pendingInteractionOf,
			applySettingsDraft,
			buildAnswers,
			isAdoptable,
			decisionHintOf,
			buildCopyText,
			normalizeDecisionPreference,
			defaultPerspectivesFor,
			parseCustomPerspectives,
			perspectiveLabelOf,
			readLayoutPreference,
			initialLayoutOf,
			createLayoutController,
			adviceSettingsIdentity,
			displayLabel,
			JevAdviceOverlay,
			JevPrepareBody,
			JevAdviceBody,
			JevSettingsSection,
			usageSummary,
			zh,
			en,
		}
		return module.exports
	},
})
