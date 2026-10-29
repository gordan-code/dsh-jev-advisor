/**
 * dsh-jev-advisor — Host half (Cordis plugin).
 *
 * The plugin is authored in JavaScript; this declaration is a hand-written
 * summary of its public surface for TypeScript consumers.
 */
import type { Context } from '@deepseek-ai/cordis'
import type Schema from '@deepseek-ai/schemastery'

/** Plugin identity for cordis rows. */
export declare const name: 'dsh-jev-advisor'
/** Required host services. */
export declare const inject: readonly string[]
/** Configuration — which doubles as the settings schema. Editable fields are marked volatile. */
export declare const Config: Schema<{
  apiKey: string
  endpoint: string
  model: string
  enabled: boolean
  autoAdvise: boolean
  includeTranscript: boolean
  requireConfirmation: boolean
  redactSensitive: boolean
  transcriptMessages: number
  timeoutMs: number
  cardDock: '' | 'left' | 'right'
  cardCollapsed: boolean
}>

/** Local allowlisted diagnostic facts; a declaration match is not a functional guarantee. */
export interface JevDiagnostics {
  pluginVersion: string | null
  dshVersion: string | null
  declaredDsh: string | null
  declarationMatch: 'match' | 'mismatch' | 'unknown'
  enabled: boolean
  autoAdvise: boolean
  hasKey: boolean
  requireConfirmation: boolean
  redactSensitive: boolean
  includeTranscript: boolean
}
export declare function diagnosticsOf(ctx: Pick<Context, 'get'>, settings?: {
  enabled?: boolean; autoAdvise?: boolean; apiKey?: string; requireConfirmation?: boolean
  redactSensitive?: boolean; includeTranscript?: boolean
}): JevDiagnostics

/** One pending question, normalized for Jev. */
export interface JevQuestion {
  id: string
  question: string
  header?: string
  detail?: string
  multiSelect: boolean
  options: { label: string; description?: string }[]
}

/** Build the `state`, typed `questions` map, and answer-mapping plan for one batch. */
export declare function buildJevRequest(
  questions: JevQuestion[],
  transcript: string,
): {
  state: unknown
  questions: Record<string, unknown>
  plan: unknown[]
}

/** Map a Jev response back onto the pending questions. */
export declare function mapAdvice(plan: unknown[], jevResponse: unknown): unknown[]

/** 准备经过凭证脱敏及完整 UTF-8 字节预算限制的请求。 */
export declare function prepareJevRequest(options: {
  questions: JevQuestion[]
  transcript?: string
  model?: string
  redactSensitive?: boolean
  maxBytes?: number
  decisionPreference?: string
}): {
  body: { state: unknown; model: string; questions: Record<string, unknown> }
  plan: unknown[]
  privacy: { includedTranscript: boolean; contextChars: number; redactions: number; truncated: boolean; requestBytes: number }
}

/** 带总超时及取消信号的评估传输。 */
export declare function callJev(options: { endpoint: string; apiKey: string; timeoutMs: number; body: unknown; signal?: AbortSignal }): Promise<Record<string, unknown>>

/** 同一宿主实例内的并发请求共享器。 */
export declare function createEvaluationPool(options?: { ttlMs?: number; maxEntries?: number }): {
  run<T>(key: string, factory: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<{ value: T; reused: boolean }>
  dispose(): void
}

/** Mount the plugin. */
export declare function apply(ctx: Context, config?: Partial<Schema.Type<typeof Config>>): void
