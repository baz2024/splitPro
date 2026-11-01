# Safi subscription monitor

A coding-agent skill that spots the paid APIs and services in a codebase and reports new
ones to [Safi](https://safi.kafoai.com), so recurring tech costs (AI APIs, hosting,
databases, monitoring, email/SMS) show up next to the rest of your subscriptions.

- One zero-dependency Node script (Node 18 or newer).
- Reads manifests and deploy configs only. Never opens `.env` files with real values.
- Reports only when you pass `--report` and set `SAFI_API_KEY`.

## 1. Get a Safi API key

1. Open Safi and go to **Account → Coding agents**.
2. Create a key and give it a name (for example "laptop" or "GitHub Actions").
3. Copy the key (it starts with `safi_`). It is shown only once.
4. Keep it in your shell profile, a password manager or a CI secret. Never commit it.

```bash
export SAFI_API_KEY=safi_your_key_here
```

## 2. Install for Claude Code

```bash
mkdir -p ~/.claude/skills/safi-subscription-monitor/scripts
curl -fsSL https://safi.kafoai.com/skills/safi-subscription-monitor/SKILL.md \
  -o ~/.claude/skills/safi-subscription-monitor/SKILL.md
curl -fsSL https://safi.kafoai.com/skills/safi-subscription-monitor/scripts/scan.mjs \
  -o ~/.claude/skills/safi-subscription-monitor/scripts/scan.mjs
```

Claude Code picks the skill up automatically. Try asking "what paid services does this
repo use?".

## 3. Install for other agents (Codex, Cursor, Copilot, Gemini CLI, ...)

Download the script somewhere stable:

```bash
mkdir -p ~/.safi
curl -fsSL https://safi.kafoai.com/skills/safi-subscription-monitor/scripts/scan.mjs \
  -o ~/.safi/scan.mjs
```

Then add this to the repo's `AGENTS.md` (or `.cursor/rules`, `.github/copilot-instructions.md`):

```markdown
## Paid services (Safi)

After adding or upgrading a dependency/SDK, adding a new API key to `.env.example`, or
before opening a PR, run `node ~/.safi/scan.mjs .` to list paid services.
Rows marked NEW are not in `.safi/known-subscriptions.json` yet.
Ask the user before running `node ~/.safi/scan.mjs . --report`, which sends the NEW ones
to their Safi account using `SAFI_API_KEY`. Never print the key. The scanner never reads
`.env` values.
```

## 4. Usage

```bash
node scan.mjs [repoDir] [--report] [--json] [--baseline <file>] [--update-baseline]
```

- No flags: print a table. Nothing is sent.
- `--json`: machine-readable output.
- `--report`: send NEW services to Safi, then add them to the baseline.
- `--update-baseline`: mark everything found as known.
- `--baseline <file>`: default is `.safi/known-subscriptions.json` in the repo.

Environment variables:

- `SAFI_API_KEY`: required for `--report`.
- `SAFI_API_URL`: default `https://safi.kafoai.com`.
- `SAFI_AGENT_NAME`: shown in Safi as the reporter. Default `coding-agent`.

Exit codes: `0` ok, `1` a report failed, `2` bad usage or missing key.

## 5. GitHub Actions: scan every pull request

Add `SAFI_API_KEY` under **Settings → Secrets and variables → Actions**, then create
`.github/workflows/safi-subscriptions.yml`:

```yaml
name: Safi subscription scan

on:
  pull_request:
    paths:
      - '**/package.json'
      - '**/requirements*.txt'
      - '**/pyproject.toml'
      - '**/go.mod'
      - '**/Gemfile'
      - '**/Cargo.toml'
      - '**/composer.json'
      - '**/.env.example'
      - '**/vercel.json'
      - '**/fly.toml'
      - '**/netlify.toml'
      - '**/wrangler.toml'
      - '**/Dockerfile'
      - '**/*.tf'
      - '.github/workflows/**'

permissions:
  contents: read

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Download scanner
        run: |
          curl -fsSL https://safi.kafoai.com/skills/safi-subscription-monitor/scripts/scan.mjs \
            -o "$RUNNER_TEMP/scan.mjs"
      - name: Scan and report new paid services
        env:
          SAFI_API_KEY: ${{ secrets.SAFI_API_KEY }}
          SAFI_AGENT_NAME: github-actions
        run: |
          if [ -z "$SAFI_API_KEY" ]; then
            node "$RUNNER_TEMP/scan.mjs" .
          else
            node "$RUNNER_TEMP/scan.mjs" . --report
          fi
```

Pull requests from forks do not get secrets, so the job falls back to a read-only scan.
Commit `.safi/known-subscriptions.json` if you want CI to report only services that are
new compared with the main branch. Safi also de-duplicates by fingerprint, so a repeat
report never creates a second item.

## What it detects

44 services across Safi's "Tech & AI" categories, including OpenAI, Anthropic,
Google Gemini/Vertex, Mistral, Cohere, Replicate, Together, Groq, ElevenLabs, Pinecone,
Vercel, AWS, Google Cloud, Azure, Cloudflare, Fly.io, Netlify, Render, Railway, Heroku,
Supabase, Neon, PlanetScale, MongoDB Atlas, Upstash, Firebase, Sentry, Datadog, PostHog,
LogRocket, Twilio, Resend, SendGrid, Postmark, Mailgun, Stripe (usage-based fees),
Algolia, Mapbox, Clerk, Auth0, GitHub Copilot, Cursor, Claude Code and Devin.

Signals come from dependency manifests (npm, Python, Go, Ruby, Rust, PHP), env template
variable names, deploy config files, Dockerfile/compose images, GitHub Actions `uses:`
lines and Terraform providers.
