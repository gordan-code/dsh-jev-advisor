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
/** Composition-level defaults for the plugin row's `config`. */
export declare const Config: Schema<{
  apiKey: string
  endpoint: string
  model: string
  enabled: boolean
  includeTranscript: boolean
  transcriptMessages: number
  timeoutMs: number
}>
/** User-facing settings schema registered under the `dsh-jev-advisor` namespace. */
export declare const JevSettings: Schema<{
  apiKey: string
  endpoint: string
  model: string
  enabled: boolean
  includeTranscript: boolean
  transcriptMessages: number
  timeoutMs: number
}>

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

/** Mount the plugin. */
export declare function apply(ctx: Context, config?: Partial<Schema.Type<typeof Config>>): void
