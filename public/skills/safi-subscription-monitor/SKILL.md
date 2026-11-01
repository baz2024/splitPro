---
name: safi-subscription-monitor
description: Finds the paid APIs, SDKs and services a codebase depends on (OpenAI, Anthropic, Vercel, AWS, Supabase, Stripe, Sentry, Twilio, Resend and about 40 more) and reports NEW ones to the user's Safi account so recurring costs get tracked. Use when adding or upgrading a dependency or SDK, when a new API key env var appears in .env.example, when the user asks to "check for new subscriptions" or "what paid services does this repo use", and before opening a pull request.
---

# Safi subscription monitor

This skill keeps the user's Safi app up to date with the paid services their code uses.
It scans dependency manifests and deploy configs, compares them with a baseline of
services already known, and (only with permission) reports the new ones to Safi.

The scanner is one zero-dependency Node script (`scripts/scan.mjs`, Node 18 or newer).
Every step below is a plain shell command, so any coding agent can follow it.

## When to run it

- After adding, removing or upgrading a dependency or SDK.
- When a new `*_API_KEY` style variable is added to `.env.example`.
- When the user asks "check for new subscriptions" or "what paid services does this repo use?".
- Before opening a pull request.

## Commands

Set `SCAN` to wherever the skill is installed. For Claude Code that is usually:

```bash
SCAN=~/.claude/skills/safi-subscription-monitor/scripts/scan.mjs
```

1. Scan the repo (read only, nothing is sent):

   ```bash
   node "$SCAN" .
   ```

2. Get machine-readable output when you need to parse it:

   ```bash
   node "$SCAN" . --json
   ```

3. Report the new services to Safi (needs `SAFI_API_KEY`, see "Asking first"):

   ```bash
   node "$SCAN" . --report
   ```

4. Mark everything currently found as known without reporting:

   ```bash
   node "$SCAN" . --update-baseline
   ```

Options:

- `--baseline <file>`: use another baseline file. Default: `.safi/known-subscriptions.json`.
- Env vars: `SAFI_API_KEY` (required for `--report`), `SAFI_API_URL`
  (default `https://safi.kafoai.com`), `SAFI_AGENT_NAME` (for example `claude-code`,
  `codex`, `cursor`; default `coding-agent`).

## Reading the results

The table has one row per service:

- `STATUS`: `NEW` means it is not in the baseline yet. `known` means it was seen before.
- `SERVICE` and `CATEGORY`: category keys match Safi's "Tech & AI" section
  (`aiApis`, `codingAgents`, `cloudHosting`, `databases`, `devTools`, `domains`,
  `monitoring`, `messagingApis`, `saas`).
- `EVIDENCE`: where it was found, for example `package.json: openai@^4.52.0` or
  `.env.example: RESEND_API_KEY`.

With `--json`, each finding has `fingerprint`, `service`, `vendor`, `category`,
`pricingUrl`, `evidence[]` and `isNew`. After `--report`, a `reported` list shows the
result for each service. `duplicate: true` means Safi already had it; that is fine.

Exit codes: `0` success, `1` at least one report failed, `2` bad usage or missing
`SAFI_API_KEY`.

Summarise for the user: which services are new, what each one likely costs (link the
`pricingUrl`), and that Stripe is usage-based fees rather than a fixed plan.

## Asking first

- **Ask the user before running `--report`**, unless they have already said reporting
  to Safi is OK for this repo or session. Show them the list of NEW services first.
- If `SAFI_API_KEY` is not set, tell the user to create a key in Safi under
  **Account → Coding agents** and export it. Do not ask them to paste the key into chat.
- Never print, log, echo or commit `SAFI_API_KEY`.
- Commit `.safi/known-subscriptions.json` only if the user wants the baseline shared
  with the team.

## Privacy

- The scanner never opens `.env`, `.env.local` or any other env file with real values.
- From `.env.example`, `.env.sample` and `.env.template` it keeps variable **names** only.
- It reads manifests (`package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`,
  `Gemfile`, `Cargo.toml`, `composer.json`), deploy configs (`vercel.json`, `fly.toml`,
  `netlify.toml`, `wrangler.toml`, Dockerfiles, compose files), GitHub Actions `uses:`
  lines and Terraform provider blocks. It skips `node_modules`, `.git`, `dist`, `build`,
  `.next`, `vendor` and test `fixtures` folders, and caps file count and size.
- The only data sent to Safi is what is shown in the table: service name, category,
  evidence lines, repo name (`owner/repo` from the git remote, or the folder name) and the
  agent name.

## Heartbeats (`--heartbeat`)

Add `--heartbeat` (usually together with `--report`) to tell Safi which services this
repo **still** uses:

```bash
node scripts/scan.mjs . --report --heartbeat
```

- It sends every CURRENT finding, new and already known, to `POST /api/agent/v1/seen`
  as `{ fingerprints: [{ fingerprint, service }], detectedIn }`. Only fingerprint,
  service name and repo name are sent; no evidence lines.
- Safi only refreshes services it already knows for this key's user. Unknown ones are
  ignored; new services are still added only through `--report`.
- Safi uses these heartbeats for "unused 30+ days" on the Subscriptions screen: a
  subscription is flagged when no heartbeat, usage cost or "Still using" tap has been
  seen for it in 30 days. Running the scan with `--heartbeat` regularly keeps tools in
  active use from being flagged.
- It needs `SAFI_API_KEY`, the same as `--report`; ask the user first in the same way.

## Reporting your own API spend (`/api/agent/v1/usage`)

An agent that pays for its own model or API calls can report that spend to Safi, and
must respect the monthly cap the user set for its key under **Account → Coding agents**.

Report spend after a run (or once per billing period), not per token:

```bash
curl -sS -X POST "${SAFI_API_URL:-https://safi.kafoai.com}/api/agent/v1/usage" \
  -H "Authorization: Bearer $SAFI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"service":"anthropic","amount":"12.50","currency":"USD","model":"claude-sonnet",
       "periodStart":"2026-11-01T00:00:00Z","periodEnd":"2026-11-16T00:00:00Z",
       "idempotencyKey":"run-2026-11-16-001"}'
```

- Required: `service`, `amount` (a decimal **string** such as `"12.50"`, never a number),
  `currency` (ISO 4217) and `idempotencyKey`. Optional: `model`, `periodStart`,
  `periodEnd` (ISO 8601) and `description`.
- `idempotencyKey` (letters, digits and `. _ : -`, up to 200 characters) must be unique
  per real charge. Retrying with the same key never adds a second cost: Safi answers
  `200` with `"duplicate": true` and the first expense.
- Safi records a one-off expense paid by the key owner, in the project chosen for the
  key (or as personal spend when none is set), dated at `periodEnd` or now.
- A new report returns `201` with `{ expenseId, duplicate, currency, monthToDate, cap,
capRemaining, percent, overCap, shouldPause, projectedToHitCap }`. Amounts are decimal
  strings in `currency`; `cap` and `capRemaining` are `null` when no cap is set.

Check the cap before starting expensive work (same fields, without `expenseId`):

```bash
curl -sS "${SAFI_API_URL:-https://safi.kafoai.com}/api/agent/v1/usage" \
  -H "Authorization: Bearer $SAFI_API_KEY"
```

**When `shouldPause` is `true`, stop making paid calls.** Month-to-date spend (UTC month)
has reached or passed the cap. Tell the user, and resume only when they raise the cap or
the next month starts. When `projectedToHitCap` is `true`, tell the user and prefer
cheaper models. Only spend reported in the cap currency counts toward the cap.
