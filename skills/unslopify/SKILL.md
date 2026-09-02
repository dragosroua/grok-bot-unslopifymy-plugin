---
name: unslopify
description: >-
  Use when cleaning AI-sounding drafts, READMEs, emails, changelogs, or blog
  posts via unslopifymy.ai. Prefer calling MCP tools; never invent rewrites.
---

# Unslopify

Remove AI slop from text through the unslopifymy.ai MCP tools.

## Always call tools

Never invent rewritten text. Call a tool and return its result.

## Prefer paid / agent paths

1. **Primary:** `unslop` with `UNSLOPIFY_API_KEY` (`usk_…`) — `POST /v1/unslop`
2. **Agent crypto:** `unslop_x402_challenge` — returns HTTP 402 + `PAYMENT-REQUIRED` for an x402 client on Base (`eip155:8453`, about $0.02). Completing payment is out of band; do not fake payments.
3. **Demo only (not primary):** `demo_unslop` / `demo_status` — IP trial without a key. Prefer `/v1/unslop` + key or x402 for real agent traffic.

## Styles

Optional `style`: `neutral` (default), `email`, `readme`, `changelog`, `blog`. Optional short `tone` (about 120 chars).

## Discovery and account

- `get_meta` — styles, packs, x402, `max_words`
- `get_packs` — one-time word packs
- `get_me` — trial or account remaining words
- `list_account_packs` / `list_account_jobs` — need API key
- Keys: `list_keys`, `get_keys_me`, `create_key`, `revoke_key`, `revoke_keys` — never invent key values; raw keys are shown once

## Domain shapes

- `UnslopResult` = `{ text, words_in, words_out, words_charged, job_id, model }`
- `UnslopMeta` = `{ name, packs[], styles[], x402, max_words, ... }`
- `UnslopAccount` from `get_me`
- `UnslopPack` = `{ id, words, amount_cents, label }`

Charge is `max(words_in, words_out)`. Cap is `max_words` from meta (typically 8000).
