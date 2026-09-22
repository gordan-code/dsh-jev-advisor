/**
 * dsh-jev-advisor build.
 *
 * The plugin is authored as plain, dependency-light JavaScript: the host half
 * is ordinary Node ESM and the browser half is already written in the
 * `__ModuleLoader__.load({ id, factory })` lazy-CJS form the DSH client module
 * system expects. There is therefore nothing to transpile — "building" means
 * publishing `src/` into the two entry files `package.json` names, plus the
 * type stubs that let a TypeScript consumer import the package.
 *
 * `lib/` is COMMITTED on purpose. `dsh plugin add github:<owner>/dsh-jev-advisor`
 * installs the repository as-is, and pnpm only runs a `prepare` script for a
 * git dependency — a script it blocks until the user allowlists it in
 * `pnpm-workspace.yaml`. Shipping the built files means a git install needs no
 * lifecycle script at all. `--check` is what keeps the committed copy honest:
 * it fails when `lib/` no longer matches `src/`.
 *
 *   node scripts/build.mjs           # write lib/
 *   node scripts/build.mjs --check   # verify lib/ is up to date (no writes)
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const checkOnly = process.argv.includes('--check')

/** `[source, destination]` pairs published into the package. */
const ENTRIES = [
  ['src/index.js', 'lib/index.js'],
  ['src/client.js', 'lib/client.js'],
]

const HOST_TYPES = `/**
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
/** Composition-level defaults for the plugin row's \`config\`. */
export declare const Config: Schema<{
  apiKey: string
  endpoint: string
  model: string
  enabled: boolean
  includeTranscript: boolean
  transcriptMessages: number
  timeoutMs: number
}>
/** User-facing settings schema registered under the \`dsh-jev-advisor\` namespace. */
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

/** Build the \`state\`, typed \`questions\` map, and answer-mapping plan for one batch. */
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
`

const CLIENT_TYPES = `/**
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
`

/** Every artifact this build owns, as `[absolute path, expected content]`. */
async function plannedArtifacts() {
  const planned = []
  for (const [from, to] of ENTRIES) {
    planned.push([join(root, to), await readFile(join(root, from), 'utf8')])
  }
  planned.push([join(root, 'lib/types/index.d.ts'), HOST_TYPES])
  planned.push([join(root, 'lib/types/client/index.d.ts'), CLIENT_TYPES])
  return planned
}

if (checkOnly) {
  const stale = []
  for (const [path, expected] of await plannedArtifacts()) {
    let actual
    try {
      actual = await readFile(path, 'utf8')
    } catch {
      stale.push(`${path.slice(root.length + 1)} is missing`)
      continue
    }
    if (actual !== expected) stale.push(`${path.slice(root.length + 1)} does not match its source`)
  }
  if (stale.length > 0) {
    process.stderr.write(`dsh-jev-advisor: lib/ is out of date — run \`node scripts/build.mjs\`\n  ${stale.join('\n  ')}\n`)
    process.exit(1)
  }
  process.stdout.write('dsh-jev-advisor: lib/ matches src/\n')
} else {
  for (const [path, content] of await plannedArtifacts()) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content, 'utf8')
  }
  process.stdout.write(`dsh-jev-advisor: built ${String(ENTRIES.length)} entries and 2 type stubs\n`)
}
