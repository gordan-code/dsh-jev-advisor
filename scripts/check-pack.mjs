/**
 * dsh-jev-advisor packaging gate.
 *
 * A DSH plugin breaks in two silent ways when packaging drifts, and neither one
 * shows up in a unit test:
 *
 * - `lib/client.js` missing: the package installs, the host half runs, and the
 *   UI simply never appears.
 * - `cordis.patch.yml` missing or not covered by `files`: `dsh plugin add`
 *   reconciles `dsh.profile.bundles` from that declaration, so the plugin
 *   installs as a plain dependency and is never mounted.
 *
 * This asserts the artifacts exist on disk, are actually covered by the `files`
 * allowlist, and that every entry point `package.json` advertises resolves.
 * Deliberately spawn-free so it also runs under a restricted shell.
 *
 *   node scripts/check-pack.mjs
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

/** Artifacts this package must ship, and why each one matters. */
const REQUIRED = [
  ['lib/index.js', 'the host half that `main` names'],
  ['lib/client.js', 'the browser half `exports["./client"]` names — without it the plugin installs and does nothing'],
  ['cordis.patch.yml', 'the `dsh.bundle.patch` that `dsh plugin add` reconciles bundles from'],
  ['README.md', 'the npm package page'],
]

const files = manifest.files ?? []

/** Whether one path is covered by the `files` allowlist (exact entry or glob prefix). */
function covered(path) {
  return files.some((pattern) => pattern === path || path.startsWith(pattern.replace(/\*.*$/s, '')))
}

const problems = []

for (const [path, why] of REQUIRED) {
  if (!existsSync(join(root, path))) problems.push(`${path} is missing on disk (${why})`)
  else if (!covered(path)) problems.push(`${path} exists but is not covered by "files" (${why})`)
}

const entryPoints = [
  ['main', manifest.main],
  ['exports["."].default', manifest.exports?.['.']?.default],
  ['exports["./client"].default', manifest.exports?.['./client']?.default],
]
for (const [field, path] of entryPoints) {
  if (path === undefined) problems.push(`${field} is not declared`)
  else if (!existsSync(join(root, path))) problems.push(`${field} points at ${path}, which does not exist`)
}

const patch = manifest.dsh?.bundle?.patch
if (patch === undefined) {
  problems.push('dsh.bundle.patch is not declared — `dsh plugin add` would install this as a plain dependency')
} else if (!existsSync(join(root, patch))) {
  problems.push(`dsh.bundle.patch points at ${patch}, which does not exist`)
}

if (manifest.dsh?.client?.platform !== 'web') problems.push('dsh.client.platform is not "web"')
if (manifest.dsh?.client?.inject === undefined) problems.push('dsh.client.inject is not declared')

if (problems.length > 0) {
  process.stderr.write(`dsh-jev-advisor: packaging gate failed\n  ${problems.join('\n  ')}\n`)
  process.exit(1)
}

process.stdout.write(`dsh-jev-advisor: packaging gate passed (${String(files.length)} files allowlist entries)\n`)
