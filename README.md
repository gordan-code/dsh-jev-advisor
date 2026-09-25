# dsh-jev-advisor

English | [中文](docs/README.zh.md)

**Jev gives *you* a second opinion — not the model.**

Every other Jev plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) hands
Jev to the agent. This one hands it to the human. When the model asks you a multiple-choice
question, `dsh-jev-advisor` turns it into a structured [TypeSafe](https://docs.typesafe.ai) request
and floats the recommendation beside the options — the full probability spread, Jev's confidence,
the exact JSON that crossed the wire, and one click to adopt it.

![The advice card appearing beside a question](https://raw.githubusercontent.com/gordan-code/dsh-jev-advisor/main/docs/demo.gif)

| | |
| --- | --- |
| **Install** | `dsh plugin --profile <p> add github:gordan-code/dsh-jev-advisor` |
| **Setup** | paste an API key in **Settings → Jev**. That is the entire configuration. |
| **Surfaces** | `shell.overlay` + `settings.section` — it never replaces the question card |
| **Model changes** | none: no prompt edits, no tool the model has to remember to call |
| **Tests** | request building · client wiring · live round trip against a mock endpoint |
| **License** | MIT |

## What this is — and is not

**Is:** a decision aid for the human, at the one moment a coding agent actually asks for input.

**Is not:** an agent-loop gate. If you want Jev to restrict which tools are visible, assess a call
before it runs, or route between models, use [@buberlo/dsh-jev](https://github.com/buberlo/dsh-jev) —
it does that thoroughly, with shadow/enforce modes and benchmarks, and this plugin deliberately does
not compete with it. Different table, different side of it.

The trade is deliberate. An agent-loop gate has to be configured — providers, thresholds, tool
categories, failure rules — and it only pays off once you have tuned it. This plugin has one moving
part you have to supply (an API key) and it does something useful on the first question you are
asked. That is the whole product.

## What you actually see

You ask the agent to do something. It stops and asks you to choose. Instead of guessing, you get:

- **the recommended option**, badged, with the probability Jev assigned to it;
- **the rest of the distribution**, so you can see whether it was 80/20 or 51/49;
- **Jev's confidence** in its own answer;
- **the exact request and response** behind the scenes, in a collapsible JSON block — nothing about
  the recommendation is hidden from you;
- **one button** that submits Jev's pick as if you had clicked it.

Nothing is auto-applied. If you disagree, ignore the card and answer normally — the shipped question
card is untouched and still works exactly as before.

## Install

Publishing to npm is **not required** — `dsh plugin` forwards to pnpm, so any spec pnpm can install
works. Pick one; **do not mix them**, because two installs of the same package mount the loader entry
and the API routes twice and fail the whole plugin tree.

### Straight from the repository

```bash
dsh plugin --profile <your-profile> add github:gordan-code/dsh-jev-advisor
# or the full form:
dsh plugin --profile <your-profile> add git+https://github.com/gordan-code/dsh-jev-advisor.git
```

This needs no build step on your machine because the repository **commits `lib/`**. pnpm only runs a
`prepare` script for a git dependency, and blocks it until you allowlist the package in the profile's
`pnpm-workspace.yaml`; shipping the built files avoids that entirely. `npm test` runs
`scripts/build.mjs --check`, which fails when `lib/` drifts from `src/`.

### From a local checkout

```bash
dsh plugin --profile <your-profile> add /absolute/path/to/dsh-jev-advisor
```

`link:` installs skip the build too — run `node scripts/build.mjs` after editing `src/`.

### From npm

Not published yet. The name is reserved and free.

```bash
dsh plugin --profile <your-profile> add dsh-jev-advisor
```

Then restart the host and open **Settings → Jev** to paste your API key.

### Update / uninstall

```bash
dsh plugin --profile <your-profile> remove dsh-jev-advisor
dsh plugin --profile <your-profile> add github:gordan-code/dsh-jev-advisor
```

A git install tracks the ref you asked for, so updating means re-running `add` (or `pnpm update`
inside the profile directory). There is no semver range unless you write
`github:gordan-code/dsh-jev-advisor#semver:^0.1.0`.

## Configure

**Settings → Jev**

| Field | Default | Meaning |
| --- | --- | --- |
| API key | *(empty)* | TypeSafe key from <https://console.typesafe.ai/keys>. Declared `role('secret')` in the `Config`, so it persists in your profile's Cordis patch as a redacted secret and is never sent back to the browser. |
| Endpoint | `https://api.typesafe.ai/v1/systemone` | Evaluation endpoint. |
| Model | `jev-latest` | Jev model or alias (`jev-1.13.0`, `jev-preview`, …). |
| Enable Jev advice | on | Master switch. |
| Send the recent conversation as the state | on | Whether the transcript tail is attached as `state.context`. |
| Context messages | `12` | How many trailing transcript messages to include. |
| Timeout (ms) | `30000` | Per-request timeout. |

**Test connection** sends one trivial `noul` question and reports the model that answered, so you can
verify a freshly pasted key without waiting for a real question.

The same values can be seeded from the cordis row's `config` (see `cordis.patch.yml`); the user
settings section always resolves above it, so composition config is the right place only for what a
deployment must pin — an endpoint in a headless profile, for example.

## How it works

| Half | File | Responsibility |
| --- | --- | --- |
| Host | `lib/index.js` | The `Config` schema (the settings source of truth), session transcript read, outbound TypeSafe call, three loopback-only JSON routes. |
| Browser | `lib/client.js` | The floating advice card and the Settings → Jev section. |

The two halves talk over same-origin `fetch` to the host's own webserver:

| Route | Purpose |
| --- | --- |
| `POST /dsh-jev-advisor/api/status` | `{ enabled, hasKey, endpoint, model, … }` — connection facts without the key. |
| `POST /dsh-jev-advisor/api/test` | One trivial evaluation, for the *Test connection* button. |
| `POST /dsh-jev-advisor/api/advise` | Build the structured request for a pending question batch, call Jev, map the answer back onto option labels. |

All three reject anything that is not a same-origin request addressed to a loopback authority, and
defer to `ctx.connection.requestRejection` when the Connection service is mounted.

### Why a floating card and not a modified question card?

`conversation.composer` is a **chain** slot: it elects exactly one entry, and the shipped question
composer always wins for a pending question. Replacing it would mean reimplementing the whole
question UI and breaking every question shape this plugin does not model. `shell.overlay` is the
documented additive seat for a frame-wide surface, so the advice card renders *beside* the shipped
composer and reads the same pending interaction from `useSessionPendingInteraction`.

## Decisions worth knowing

**Multi-select questions** fan out into one `noul` question per option ("should this option be
selected?"), because Jev has no multi-label primitive. Options at or above `0.5` are the recommended
selection.

**A "none of the above" option is always offered to Jev** for single-choice questions. If it picks
that, the card says so and offers no adopt button — you write the answer yourself, because Jev has
told you the option list is wrong, not which option is right.

**Adoption is all-or-nothing.** Submitting an answer batch answers *every* question in it. If Jev has
no decisive answer for one of them — or a question has no options at all — the button stays disabled
and the card says so, rather than silently submitting an empty answer for the rest.

## Development

```bash
npm ci                     # react + schemastery, for the two test suites only
node scripts/build.mjs     # src/*.js -> lib/*.js (+ type stubs)
npm test                   # lib/ freshness, request building, client wiring
npm run check:pack         # the DSH packaging gate (see below)
npm pack --dry-run         # confirm the published file list
```

`.github/workflows/ci.yml` runs `npm ci`, `npm test`, and `check:pack` on Node 20 and 22.

Two gates exist because this package can be broken in ways a unit test cannot see:

- **`npm test` starts with `scripts/build.mjs --check`.** `lib/` is committed (a git install runs no
  build), so a `src/` edit without a rebuild would ship stale code. The check compares the two
  byte for byte.
- **`check:pack` asserts the DSH-specific packaging invariants.** `lib/client.js` and
  `cordis.patch.yml` both fail *silently* when missing: the first means the plugin installs and no UI
  ever appears, the second means `dsh plugin add` never appends the bundle and the plugin is never
  mounted at all. The gate checks they exist, that `files` actually covers them, and that every entry
  point `package.json` advertises resolves.

`test/e2e.mjs` drives a running host against `test/mock-typesafe.mjs`, which stands in for the
TypeSafe endpoint so the outbound leg can be exercised without a real key:

```bash
node test/mock-typesafe.mjs 43221 &            # mock evaluation endpoint
dsh --profile <scratch> --port 43219 --no-open # host with the plugin installed
node test/e2e.mjs <launch-token>               # status + test + advise round trip
```

The plugin is plain JavaScript: the host half is Node ESM, the browser half is already in the
`__ModuleLoader__.load({ id, factory })` lazy-CJS form the DSH client module system expects. There is
nothing to transpile, so `lib/` is a straight copy of `src/` — and it is **committed**, because a git
install runs no build.

For the browser half, only the platform seed modules may be `require`d (`react`,
`react/jsx-runtime`, `react-dom`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-store`,
`@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-primitives`,
`@deepseek-ai/dsh-client-ui-dockkit`). Cross-plugin collaboration goes through cordis services
(`ctx.slots`, `ctx.locale`, `ctx.settingsScope`) or the host HTTP bridge — never through another
plugin's internals.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Card never appears | No pending question, Jev advice is off, or the host route is unreachable. Check `/dsh-jev-advisor/api/status` returns `{"ok":true,...}`. |
| `no Jev API key is configured` | Save a key in Settings → Jev. |
| `Jev responded 401` | The key is invalid or revoked. |
| `Jev responded 422` | A malformed request — please report it with the JSON shown in the card. |
| `Jev responded 429 / 529` | Rate limited or overloaded; the plugin retries twice with backoff, then gives up. |
| Settings section missing | The client bundle did not load. Confirm `dsh.client` is present in `node_modules/dsh-jev-advisor/package.json` and that `lib/client.js` shipped. |
| `duplicate loader entry id` at boot | The package is mounted twice — two installs, or an aggregate bundle mounting it too. Remove one. |

## Known limitations

- **Requires a DSH whose settings service projects `Config` forms (0.1.7-rc.1 or newer).** DSH removed
  the `settings.register` / settings-namespace API this plugin was originally written against, and
  with it the `settingsScope` client service. On 0.1.5-rc.2 and earlier the host half would call a
  method that no longer exists and the browser half would never resolve `configForms`, so the plugin
  does not load at all. There is no dual-API fallback — DSH is a fast-moving developer preview.
- The card floats at the top right and can overlap a wide right sidebar; dismiss it with `✕`.
- With more than one session holding a pending question at once, the card follows the current
  session and falls back to the first pending interaction.
- Plan-review questions are advised like any other option-bearing question; the card never replaces
  the approve/refuse buttons.
- The API key round-trips to the host process, which is what performs the HTTPS call. It is never
  returned to the browser, but it is stored in plain text in your profile's Cordis patch — protect
  that file as you would any credential.
- Jev is charged per input token. The transcript tail is capped at ~24k characters per request.
- No retry beyond the two documented overload codes (`429`, `529`).

## Prior art, and why this package is not called `dsh-jev`

`dsh-jev` is taken on npm (`zhangxaochen/dsh-jev`, v0.2.0) and at least five GitHub repositories
share the name, so this one is namespaced `dsh-jev-advisor` — and every identifier it owns
(settings entry id, API route prefix, locale namespace, loader entry id) is namespaced to match. It
can therefore sit beside those plugins without a duplicate-entry boot failure.

The Jev plugins already out there are worth your attention:

| Project | What it does |
| --- | --- |
| [Devin-AXIS/jev-dsh-decision](https://github.com/Devin-AXIS/jev-dsh-decision) | Structured decision engine for agent harnesses; DSH-native plus OpenCode/Codex through iPolloWork |
| [buberlo/dsh-jev](https://github.com/buberlo/dsh-jev) | Jev bound to the agent loop: tool preselection, per-call assessment, model and skill routing |
| [noetion/dsh-jev](https://github.com/noetion/dsh-jev) | A `jev_ask` tool for noul, choice and score answers |

They put Jev inside the agent's decision-making. This one puts it in yours. If you want both, they do
not conflict — that is what the namespacing above is for.

Jev is a product of TypeSafe AI. This project is not affiliated with or endorsed by TypeSafe AI,
DeepSeek, or any of the projects listed above.

## License

MIT
