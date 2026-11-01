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
