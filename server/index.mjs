#!/usr/bin/env node
/**
 * Zero-dep stdio MCP server for unslopifymy.ai
 * JSON-RPC 2.0 over stdin/stdout. Node 18+ (global fetch).
 */

const BASE_URL = (process.env.UNSLOPIFY_BASE_URL || "https://unslopifymy.ai").replace(/\/$/, "");
const API_KEY = process.env.UNSLOPIFY_API_KEY || "";

const STYLES = ["neutral", "email", "readme", "changelog", "blog"];

const SERVER_INFO = {
  name: "unslopifymy",
  version: "1.0.0",
};

/** @type {Record<string, object>} */
const TOOLS = {
  unslop: {
    name: "unslop",
    description:
      "Rewrite text to remove AI slop via POST /v1/unslop. Requires UNSLOPIFY_API_KEY (usk_…). Body: text (required), style (neutral|email|readme|changelog|blog), optional tone. Returns UnslopResult.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Draft text to rewrite" },
        style: {
          type: "string",
          enum: STYLES,
          description: "Rewrite style (default: neutral)",
        },
        tone: {
          type: "string",
          description: "Optional short tone hint (max ~120 chars)",
        },
      },
      required: ["text"],
    },
  },
  unslop_x402_challenge: {
    name: "unslop_x402_challenge",
    description:
      "POST /v1/unslop/x402 WITHOUT completing payment. Returns status, body, and PAYMENT-REQUIRED header so an x402-capable client can pay on Base (eip155:8453, ~$0.02). Does not fake crypto payments; completing payment is out of band.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Draft text to rewrite" },
        style: {
          type: "string",
          enum: STYLES,
          description: "Rewrite style (default: neutral)",
        },
        tone: {
          type: "string",
          description: "Optional short tone hint (max ~120 chars)",
        },
      },
      required: ["text"],
    },
  },
  get_meta: {
    name: "get_meta",
    description:
      "GET /v1/meta — public. Returns UnslopMeta: name, packs, styles, x402, max_words, etc.",
    inputSchema: { type: "object", properties: {} },
  },
  get_packs: {
    name: "get_packs",
    description:
      "GET /v1/packs — public. Returns available one-time word packs (UnslopPack list).",
    inputSchema: { type: "object", properties: {} },
  },
  get_me: {
    name: "get_me",
    description:
      "GET /v1/me — trial snapshot without a key; with UNSLOPIFY_API_KEY returns account balance. UnslopAccount shape.",
    inputSchema: { type: "object", properties: {} },
  },
  list_account_packs: {
    name: "list_account_packs",
    description:
      "GET /v1/account/packs — auth required (usk_). Lists purchased packs. Optional limit/offset.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Page size" },
        offset: { type: "integer", description: "Page offset" },
      },
    },
  },
  list_account_jobs: {
    name: "list_account_jobs",
    description:
      "GET /v1/account/jobs — auth required (usk_). Lists recent unslop jobs. Optional limit/offset.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Page size" },
        offset: { type: "integer", description: "Page offset" },
      },
    },
  },
  list_keys: {
    name: "list_keys",
    description:
      "GET /v1/keys — auth required. Lists API keys for the account. Surfaces auth errors clearly.",
    inputSchema: { type: "object", properties: {} },
  },
  get_keys_me: {
    name: "get_keys_me",
    description:
      "GET /v1/keys/me — auth required. Info about the presented API key.",
    inputSchema: { type: "object", properties: {} },
  },
  create_key: {
    name: "create_key",
    description:
      "POST /v1/keys — issue a key. With usk_ auth: issues another key. Or pass {email, session_id} after Stripe checkout to claim. Key is returned once to the caller; never log it to stderr.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Email used at Stripe checkout (claim flow)" },
        session_id: {
          type: "string",
          description: "Stripe Checkout session_id (claim flow)",
        },
      },
    },
  },
  revoke_key: {
    name: "revoke_key",
    description:
      "POST /v1/keys/:id/revoke — revoke a specific key by id. Auth required.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Key id to revoke" },
      },
      required: ["id"],
    },
  },
  revoke_keys: {
    name: "revoke_keys",
    description:
      "POST /v1/keys/revoke — revokes the presented API key (from env) or pass-through body fields the API accepts.",
    inputSchema: {
      type: "object",
      properties: {
        body: {
          type: "object",
          description: "Optional JSON body to forward (defaults to {})",
        },
      },
    },
  },
  demo_status: {
    name: "demo_status",
    description:
      "[DEMO] GET /v1/demo/status — public trial quota snapshot. Prefer paid unslop with API key for real use.",
    inputSchema: { type: "object", properties: {} },
  },
  demo_unslop: {
    name: "demo_unslop",
    description:
      "[DEMO] POST /v1/demo — trial rewrite without a key. Prefer unslop (paid) or unslop_x402_challenge. Not primary for agents.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Draft text to rewrite" },
        style: {
          type: "string",
          enum: STYLES,
          description: "Rewrite style (default: neutral)",
        },
      },
      required: ["text"],
    },
  },
};

function authHeaders(requireKey = false) {
  const headers = { Accept: "application/json" };
  if (API_KEY) {
    headers.Authorization = `Bearer ${API_KEY}`;
    headers["X-Api-Key"] = API_KEY;
  } else if (requireKey) {
    return null;
  }
  return headers;
}

function missingKeyResult() {
  return {
    ok: false,
    status: 401,
    body: {
      error: "UNSLOPIFY_API_KEY is not set. Set a usk_… key in plugin env.",
      code: "missing_api_key",
      buy: "https://unslopifymy.ai",
      agents: {
        api_key: "Authorization: Bearer usk_… or X-Api-Key: usk_…",
        x402: { path: "/v1/unslop/x402", price: "$0.02", network: "eip155:8453" },
      },
    },
  };
}

async function readBody(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function apiFetch(path, { method = "GET", body, requireKey = false, includePaymentHeader = false } = {}) {
  const headers = authHeaders(requireKey);
  if (headers === null) return missingKeyResult();

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: { error: err.message || "Network error", code: "network_error" },
    };
  }

  const parsed = await readBody(res);
  const result = {
    ok: res.ok,
    status: res.status,
    body: parsed,
  };

  if (includePaymentHeader) {
    const paymentRequired =
      res.headers.get("PAYMENT-REQUIRED") ||
      res.headers.get("payment-required") ||
      null;
    result.headers = {
      "PAYMENT-REQUIRED": paymentRequired,
      "access-control-expose-headers":
        res.headers.get("access-control-expose-headers") || null,
    };
  }

  return result;
}

function buildUnslopBody(args) {
  const body = { text: args.text };
  if (args.style) body.style = args.style;
  if (args.tone) body.tone = args.tone;
  return body;
}

function qs(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function callTool(name, args = {}) {
  switch (name) {
    case "unslop":
      if (!API_KEY) return missingKeyResult();
      return apiFetch("/v1/unslop", {
        method: "POST",
        body: buildUnslopBody(args),
        requireKey: true,
      });

    case "unslop_x402_challenge":
      // Intentionally no API key — challenge for x402 clients
      {
        const headers = { Accept: "application/json", "Content-Type": "application/json" };
        let res;
        try {
          res = await fetch(`${BASE_URL}/v1/unslop/x402`, {
            method: "POST",
            headers,
            body: JSON.stringify(buildUnslopBody(args)),
          });
        } catch (err) {
          return {
            ok: false,
            status: 0,
            body: { error: err.message || "Network error", code: "network_error" },
          };
        }
        const parsed = await readBody(res);
        return {
          ok: res.ok,
          status: res.status,
          body: parsed,
          headers: {
            "PAYMENT-REQUIRED":
              res.headers.get("PAYMENT-REQUIRED") ||
              res.headers.get("payment-required") ||
              null,
          },
          note:
            res.status === 402
              ? "Payment required. Pass PAYMENT-REQUIRED to an x402 client; do not fake payment. Completing x402 is out of band."
              : undefined,
        };
      }

    case "get_meta":
      return apiFetch("/v1/meta");

    case "get_packs":
      return apiFetch("/v1/packs");

    case "get_me":
      return apiFetch("/v1/me");

    case "list_account_packs":
      return apiFetch(`/v1/account/packs${qs({ limit: args.limit, offset: args.offset })}`, {
        requireKey: true,
      });

    case "list_account_jobs":
      return apiFetch(`/v1/account/jobs${qs({ limit: args.limit, offset: args.offset })}`, {
        requireKey: true,
      });

    case "list_keys":
      return apiFetch("/v1/keys", { requireKey: true });

    case "get_keys_me":
      return apiFetch("/v1/keys/me", { requireKey: true });

    case "create_key": {
      const body = {};
      if (args.email) body.email = args.email;
      if (args.session_id) body.session_id = args.session_id;
      // With key: issue another; without: claim after Stripe needs email+session_id
      const requireKey = !(args.email && args.session_id);
      if (requireKey && !API_KEY) {
        return {
          ok: false,
          status: 401,
          body: {
            error:
              "Provide UNSLOPIFY_API_KEY to issue another key, or pass email + session_id to claim after Stripe checkout.",
            code: "missing_api_key_or_claim",
          },
        };
      }
      return apiFetch("/v1/keys", {
        method: "POST",
        body,
        requireKey,
      });
    }

    case "revoke_key": {
      if (!args.id) {
        return { ok: false, status: 400, body: { error: "id is required", code: "invalid_request" } };
      }
      const id = encodeURIComponent(String(args.id));
      return apiFetch(`/v1/keys/${id}/revoke`, { method: "POST", body: {}, requireKey: true });
    }

    case "revoke_keys":
      return apiFetch("/v1/keys/revoke", {
        method: "POST",
        body: args.body && typeof args.body === "object" ? args.body : {},
        requireKey: true,
      });

    case "demo_status":
      return apiFetch("/v1/demo/status");

    case "demo_unslop":
      return apiFetch("/v1/demo", {
        method: "POST",
        body: { text: args.text, ...(args.style ? { style: args.style } : {}) },
      });

    default:
      return { ok: false, status: 404, body: { error: `Unknown tool: ${name}`, code: "unknown_tool" } };
  }
}

function toolResultContent(result) {
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    isError: result && result.ok === false,
  };
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function replyError(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  send({ jsonrpc: "2.0", id, error: err });
}

async function handleMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  const { id, method, params } = msg;

  // Notifications (no id) — ignore silently except known ones
  if (id === undefined || id === null) {
    if (method === "notifications/initialized" || method === "initialized") return;
    return;
  }

  try {
    switch (method) {
      case "initialize":
        reply(id, {
          protocolVersion: (params && params.protocolVersion) || "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        });
        break;

      case "ping":
        reply(id, {});
        break;

      case "tools/list":
        reply(id, { tools: Object.values(TOOLS) });
        break;

      case "tools/call": {
        const name = params?.name;
        const args = params?.arguments || {};
        if (!name || !TOOLS[name]) {
          replyError(id, -32601, `Unknown tool: ${name}`);
          break;
        }
        const result = await callTool(name, args);
        reply(id, toolResultContent(result));
        break;
      }

      default:
        replyError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    replyError(id, -32603, err.message || "Internal error");
  }
}

// Line-delimited JSON-RPC over stdin
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      // Ignore malformed lines
      continue;
    }
    handleMessage(msg);
  }
});

process.stdin.on("end", () => process.exit(0));

// Keep process alive; do not write secrets to stderr
process.stderr.write(`unslopifymy MCP listening (base=${BASE_URL}, key=${API_KEY ? "set" : "unset"})\n`);
