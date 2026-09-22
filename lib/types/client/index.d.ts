/**
 * dsh-jev-advisor — browser half.
 *
 * This bundle is loaded by the DSH client module system, not imported by other
 * packages, so the declaration only names the Cordis plugin surface.
 */
import type { Context } from '@deepseek-ai/cordis'

/** Client services this plugin consumes. */
export declare const inject: readonly string[]
/** Register the dictionaries, the advice overlay, and the settings section. */
export declare function apply(ctx: Context): void
