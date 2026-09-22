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
		/** Settings namespace owned by the host half. */
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
			'panel.disabled': 'Jev 建议已在「设置 → Jev」中关闭。',
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
			'panel.json': '查看结构化 JSON 请求与响应',
			'panel.request': '请求（发送给 Jev）',
			'panel.response': '响应（Jev 返回）',
			'panel.model': '模型',
			'panel.multiSelect': '多选',
			'panel.adoptFailed': '采纳失败：{message}',
			'panel.question': '问题 {index}',

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
			'settings.includeTranscript': '把最近的对话作为 state 一起发送',
			'settings.transcriptMessages': '上下文消息条数',
			'settings.timeoutMs': '超时（毫秒）',
			'settings.save': '保存',
			'settings.saving': '保存中…',
			'settings.saved': '已保存',
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
			'panel.disabled': 'Jev advice is switched off in Settings → Jev.',
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
			'panel.json': 'Show the structured JSON request and response',
			'panel.request': 'Request (sent to Jev)',
			'panel.response': 'Response (from Jev)',
			'panel.model': 'Model',
			'panel.multiSelect': 'multi-select',
			'panel.adoptFailed': 'Adopt failed: {message}',
			'panel.question': 'Question {index}',

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
			'settings.includeTranscript': 'Send the recent conversation as the state',
			'settings.transcriptMessages': 'Context messages',
			'settings.timeoutMs': 'Timeout (ms)',
			'settings.save': 'Save',
			'settings.saving': 'Saving…',
			'settings.saved': 'Saved',
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

		/** POST one JSON payload to the host bridge and unwrap its envelope. */
		async function callApi(method, payload, signal) {
			let response
			try {
				response = await fetch(`${API}/${method}`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(payload ?? {}),
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
			if (body === undefined || typeof body !== 'object') throw new Error(`the dsh-jev-advisor host bridge answered ${String(response.status)} without JSON`)
			if (body.ok !== true) throw new Error(body.error?.message ?? `the dsh-jev-advisor host bridge answered ${String(response.status)}`)
			return body.value
		}

		/** Strip the conventional recommendation suffix without changing the answer value. */
		function displayLabel(label) {
			return label.replace(/\s*\((?:recommended|推荐)\)\s*$/iu, '').trim() || label
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
		function pendingQuestionsOf(interaction) {
			if (interaction === undefined || interaction === null) return undefined
			const raw = interaction.questions
			if (!Array.isArray(raw) || raw.length === 0) return undefined
			const questions = []
			let total = 0
			for (const question of raw) {
				if (typeof question !== 'object' || question === null) continue
				if (typeof question.id !== 'string' || typeof question.question !== 'string') continue
				total += 1
				const options = []
				for (const option of Array.isArray(question.options) ? question.options : []) {
					if (typeof option !== 'object' || option === null) continue
					if (typeof option.label !== 'string' || option.label.trim() === '') continue
					options.push({
						label: option.label,
						description: typeof option.description === 'string' ? option.description : undefined,
					})
				}
				if (options.length === 0) continue
				questions.push({
					id: question.id,
					question: question.question,
					header: typeof question.header === 'string' ? question.header : undefined,
					detail: typeof question.detail === 'string' ? question.detail : undefined,
					multiSelect: question.multiSelect === true,
					options,
				})
			}
			if (questions.length === 0) return undefined
			return { questions, complete: questions.length === total }
		}

		/**
		 * Turn Jev's advice into the exact answer batch the pending question waits
		 * for. All-or-nothing on purpose: submitting a batch means answering every
		 * question in it, so a partially advised batch must stay manual.
		 *
		 * @returns the answer batch, or `undefined` when it cannot be adopted.
		 */
		function buildAnswers(questions, advice) {
			if (!Array.isArray(advice)) return undefined
			const byId = new Map(advice.map((entry) => [entry.questionId, entry]))
			const answers = []
			for (const question of questions) {
				const entry = byId.get(question.id)
				if (entry === undefined || entry.supported !== true || entry.answered !== true) return undefined
				if (entry.kind === 'choice') {
					if (entry.noneOfTheAbove === true || entry.pick === undefined) return undefined
					answers.push({ id: question.id, selected: [entry.pick.label] })
					continue
				}
				if (entry.kind === 'noul-set') {
					const picks = Array.isArray(entry.picks) ? entry.picks.filter((pick) => pick.probability >= 0.5) : []
					if (picks.length === 0) return undefined
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
			error: 'var(--dsw-alias-state-error-primary)',
			success: 'var(--dsw-alias-state-success-primary)',
			hover: 'var(--dsw-alias-interactive-bg-hover)',
		}

		const S = {
			card: {
				position: 'absolute',
				right: '20px',
				top: '68px',
				width: '360px',
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
			},
			header: { display: 'flex', alignItems: 'flex-start', gap: '8px' },
			title: { fontSize: '13px', fontWeight: 600, flex: '1 1 auto' },
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
			row: { display: 'flex', justifyContent: 'space-between', gap: '8px' },
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
			grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
			sectionTitle: { fontSize: '14px', fontWeight: 600, margin: 0 },
			divider: { height: '1px', background: color.border, margin: '2px 0' },
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
			const useSessions = props.useSessions ?? absentSelector
			const useSessionPendingInteraction = props.useSessionPendingInteraction ?? absentSelector

			const currentSessionId = useSessions((snapshot) => (snapshot === undefined || snapshot === null ? undefined : snapshot.current))
			const interaction = useSessionPendingInteraction((snapshot) => {
				if (snapshot === undefined || typeof snapshot.get !== 'function') return undefined
				if (currentSessionId !== undefined) {
					const hit = snapshot.get(currentSessionId)
					if (hit !== undefined) return hit
				}
				for (const value of snapshot.values()) return value
				return undefined
			})

			const normalized = React.useMemo(() => pendingQuestionsOf(interaction), [interaction])
			const questions = normalized === undefined ? undefined : normalized.questions
			const complete = normalized !== undefined && normalized.complete
			const signature = questions === undefined ? '' : JSON.stringify(questions)
			const sessionId = interaction === undefined || interaction === null ? undefined : interaction.sessionId
			const interactionKey = interaction === undefined || interaction === null ? undefined : interaction.key

			const settingsSnapshot = useStoreSnapshot(scope)
			const settingsValue = settingsSnapshot !== undefined && settingsSnapshot.status === 'ready' ? settingsSnapshot.value : undefined

			const [state, setState] = React.useState({ status: 'idle' })
			const [dismissed, setDismissed] = React.useState(undefined)
			const [busy, setBusy] = React.useState(false)
			const [adoptError, setAdoptError] = React.useState(undefined)
			const [attempt, setAttempt] = React.useState(0)

			React.useEffect(() => {
				if (questions === undefined) {
					setState({ status: 'idle' })
					return undefined
				}
				const controller = new AbortController()
				setState({ status: 'loading' })
				callApi('advise', { sessionId, questions }, controller.signal).then(
					(value) => {
						if (!controller.signal.aborted) setState({ status: 'ready', value })
					},
					(error) => {
						if (controller.signal.aborted) return
						if (error instanceof Error && error.name === 'AbortError') return
						setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
					},
				)
				return () => {
					controller.abort()
				}
			}, [signature, sessionId, attempt])

			if (interaction === undefined || interaction === null || questions === undefined) return null
			if (dismissed !== undefined && dismissed === interactionKey) return null

			const close = () => {
				setDismissed(interactionKey)
			}

			const advice = state.status === 'ready' ? state.value.advice : undefined
			const adoptable = complete && advice !== undefined && isAdoptable(questions, advice)

			const adopt = async () => {
				const answers = buildAnswers(questions, advice)
				if (answers === undefined) return
				setBusy(true)
				setAdoptError(undefined)
				try {
					await interaction.answer({ answers })
				} catch (error) {
					setAdoptError(error instanceof Error ? error.message : String(error))
				} finally {
					setBusy(false)
				}
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
					h(
						'button',
						{ type: 'button', style: S.iconButton, title: t('panel.dismiss'), onClick: close },
						'✕',
					),
				),
			)

			if (state.status === 'loading') {
				children.push(h('div', { key: 'loading', style: S.note }, t('panel.loading')))
			}

			if (state.status === 'error') {
				const message = state.message
				const noKey = /api key/i.test(message)
				children.push(h('div', { key: 'error', style: S.error }, noKey ? t('panel.noKey') : message))
				if (/disabled/i.test(message)) children.push(h('div', { key: 'disabled', style: S.note }, t('panel.disabled')))
				children.push(
					h(
						'div',
						{ key: 'retry', style: S.actions },
						h(
							'button',
							{ type: 'button', style: S.secondary, onClick: () => setAttempt((value) => value + 1) },
							t('panel.retry'),
						),
					),
				)
			}

			if (state.status === 'ready' && advice !== undefined) {
				children.push(
					h(JevAdviceBody, {
						key: 'body',
						t,
						questions,
						value: state.value,
						adoptable,
						busy,
						adoptError,
						onAdopt: () => {
							void adopt()
						},
					}),
				)
			}

			if (settingsValue !== undefined && settingsValue.enabled === false && state.status === 'idle') {
				children.push(h('div', { key: 'off', style: S.note }, t('panel.disabled')))
			}

			return h('div', { style: S.card, 'data-dsh-jev-advisor': 'advice' }, ...children)
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
			const { t, questions, value, adoptable, busy, adoptError, onAdopt } = props
			const advice = value.advice ?? []
			const multiQuestion = questions.length > 1
			const children = []

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

				if (entry.kind === 'choice') {
					if (entry.noneOfTheAbove === true || entry.pick === undefined) {
						rows.push(h('div', { key: 'none', style: S.note }, t('panel.noneOfTheAbove')))
					} else {
						rows.push(
							h(
								'div',
								{ key: 'pick', style: S.pick },
								h('span', { style: S.badge }, t('panel.recommend')),
								h('span', null, displayLabel(entry.pick.label)),
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
											h('span', null, `${String(Math.round(row.probability * 100))}%`),
										),
									),
								),
							)
						}
						if (typeof entry.confidence === 'number') {
							rows.push(h('div', { key: 'conf', style: S.note }, `${t('panel.confidence')}: ${String(Math.round(entry.confidence * 100))}%`))
						}
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
									h('span', null, displayLabel(pick.label)),
									h('span', null, `${String(Math.round(pick.probability * 100))}%`),
								),
							),
						),
					)
				}

				children.push(h('div', { key: `q-${entry.questionId}`, style: S.section }, ...rows))
			})

			if (!adoptable) {
				children.push(h('div', { key: 'partial', style: S.note }, t('panel.partial')))
			}

			children.push(
				h(
					'div',
					{ key: 'actions', style: S.actions },
					h(
						'button',
						{
							type: 'button',
							style: { ...S.primary, opacity: adoptable && !busy ? 1 : 0.5, cursor: adoptable && !busy ? 'pointer' : 'default' },
							disabled: !adoptable || busy,
							onClick: onAdopt,
						},
						busy ? t('panel.adopting') : t('panel.adopt'),
					),
				),
			)

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

		/** Settings → Jev: connection fields, key storage, and a connectivity probe. */
		function JevSettingsSection(props) {
			const { t, scope } = props
			const snapshot = useStoreSnapshot(scope)
			const value = snapshot !== undefined && snapshot.status === 'ready' ? snapshot.value : undefined

			const [draft, setDraft] = React.useState({})
			const [busy, setBusy] = React.useState(undefined)
			const [message, setMessage] = React.useState(undefined)
			const [status, setStatus] = React.useState(undefined)

			const refreshStatus = React.useCallback(async () => {
				try {
					const next = await callApi('status')
					setStatus(next)
				} catch {
					setStatus(undefined)
				}
			}, [])

			React.useEffect(() => {
				void refreshStatus()
			}, [refreshStatus, snapshot === undefined ? undefined : snapshot.revision])

			const read = (key, fallback) => (draft[key] !== undefined ? draft[key] : value === undefined || value[key] === undefined ? fallback : value[key])
			const set = (key, next) => {
				setDraft((current) => ({ ...current, [key]: next }))
				setMessage(undefined)
			}
			const dirty = Object.keys(draft).length > 0

			const save = async () => {
				setBusy('save')
				setMessage(undefined)
				try {
					for (const [key, raw] of Object.entries(draft)) {
						if (key === 'apiKey') {
							if (String(raw).trim() !== '') await scope.set('apiKey', String(raw).trim())
							continue
						}
						if (key === 'transcriptMessages' || key === 'timeoutMs') {
							const parsed = Number(raw)
							if (!Number.isFinite(parsed)) throw new Error(`${key} must be a number`)
							await scope.set(key, Math.round(parsed))
							continue
						}
						await scope.set(key, raw)
					}
					setDraft({})
					await refreshStatus()
					setMessage({ kind: 'ok', text: t('settings.saved') })
				} catch (error) {
					setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) })
				} finally {
					setBusy(undefined)
				}
			}

			const clearKey = async () => {
				setBusy('clear')
				setMessage(undefined)
				try {
					await scope.set('apiKey', '')
					setDraft((current) => {
						const next = { ...current }
						delete next.apiKey
						return next
					})
					await refreshStatus()
					setMessage({ kind: 'ok', text: t('settings.saved') })
				} catch (error) {
					setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) })
				} finally {
					setBusy(undefined)
				}
			}

			const test = async () => {
				setBusy('test')
				setMessage(undefined)
				try {
					const result = await callApi('test')
					setMessage({ kind: 'ok', text: t('settings.testOk', { model: String(result.model) }) })
				} catch (error) {
					setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) })
				} finally {
					setBusy(undefined)
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
							{ type: 'button', style: S.secondary, disabled: busy !== undefined, onClick: () => { void clearKey() } },
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
						{ type: 'button', style: { ...S.primary, opacity: dirty && busy === undefined ? 1 : 0.5 }, disabled: !dirty || busy !== undefined, onClick: () => { void save() } },
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
				h('p', { style: { ...S.note, margin: 0 } }, t('settings.help')),
			)
		}

		/* ------------------------------------------------------------------ *
		 * Plugin body
		 * ------------------------------------------------------------------ */

		/** Client services this plugin consumes. */
		const inject = ['slots', 'locale', 'settingsScope']

		/**
		 * Register the dictionaries, the frame-wide advice overlay, and the
		 * settings section.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-jev-advisor: dictionaries')

			const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE })

			ctx.slots.inject('shell.overlay', () =>
				ctx.slots.register(
					{
						name: 'shell.overlay',
						id: 'dsh-jev-advisor-card',
						order: 60,
						locale: NS,
						inject: () => ({ scope }),
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
			pendingQuestionsOf,
			buildAnswers,
			isAdoptable,
			displayLabel,
			JevAdviceOverlay,
			JevAdviceBody,
			JevSettingsSection,
			zh,
			en,
		}
		return module.exports
	},
})
