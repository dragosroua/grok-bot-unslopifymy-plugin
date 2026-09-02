# unslopifymy Agent Plugin

MCP agent plugin for https://unslopifymy.ai

## Install

1. Add this plugin folder to your agent plugins path.
2. Set UNSLOPIFY_API_KEY in plugin config / env (see mcp.json).
3. Restart the host so node server/index.mjs starts.

Never commit real keys. Keys are shown once at creation.
Optional: UNSLOPIFY_BASE_URL overrides the API host.
Default host is https://unslopifymy.ai.
Needs node >=18 (global fetch). Zero package deps.

## Authentication

Paid calls send the key from UNSLOPIFY_API_KEY as Bearer and X-Api-Key.
Public tools: get_meta, get_packs, demo_status. get_me works without a key for trial.

## Packs vs x402
- Word packs: buy at https://unslopifymy.ai, claim/issue a usk_ key, call unslop.
- x402: call unslop_x402_challenge; pay about USD 0.02 on Base (eip155:8453) using PAYMENT-REQUIRED. This plugin does not complete crypto payments.

## Tools

| Tool | Endpoint | Auth | Notes |
|------|----------|------|-------|
| unslop | POST /v1/unslop | key | Primary rewrite; text, style, tone |
| unslop_x402_challenge | POST /v1/unslop/x402 | none | Returns 402 + PAYMENT-REQUIRED |
| get_meta | GET /v1/meta | public | Styles, packs, x402, max_words |
| get_packs | GET /v1/packs | public | Pack catalog |
| get_me | GET /v1/me | optional | Trial or account snapshot |
| list_account_packs | GET /v1/account/packs | key | limit / offset |
| list_account_jobs | GET /v1/account/jobs | key | limit / offset |
| list_keys | GET /v1/keys | key | List keys |
| get_keys_me | GET /v1/keys/me | key | Current key info |
| create_key | POST /v1/keys | key or claim | Issue key, or email+session_id after Stripe |
| revoke_key | POST /v1/keys/:id/revoke | key | Revoke by id |
| revoke_keys | POST /v1/keys/revoke | key | Revoke presented key |
| demo_status | GET /v1/demo/status | public | DEMO — prefer paid unslop |
| demo_unslop | POST /v1/demo | public | DEMO — not primary for agents |

Styles: neutral | email | readme | changelog | blog (default neutral).

Homepage example uses POST /v1/unslop with JSON body text+style and Bearer usk_ key.
Success (UnslopResult): text, words_in, words_out, words_charged, job_id, model. Charge = max(words_in, words_out).

## Skill

See skills/unslopify/SKILL.md — when to unslop, prefer key/x402 over demo, never invent rewritten text.

## Smoke test

node --check server/index.mjs
node scripts/smoke.mjs

## Security

- Do not commit usk_ secrets.
- create_key returns the secret once to the tool caller; server does not log key material to stderr.
- API errors return structured { ok:false, status, body } tool results; the MCP process stays up.

## License

MIT Copyright (c) 2026 Dragos Roua
