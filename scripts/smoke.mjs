import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = join(root, "server", "index.mjs");

const child = spawn(process.execPath, [serverPath], {
  cwd: root,
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env },
});

let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (c) => { stdout += c; });
child.stderr.on("data", (c) => { stderr += c; });

let nextId = 1;
const pending = new Map();

function send(method, params) {
  const id = nextId++;
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      pending.delete(id);
      reject(new Error("timeout waiting for id=" + id + " method=" + method));
    }, 20000);
    pending.set(id, { resolve, reject, t, method });
  });
}

function drainLines() {
  let idx;
  while ((idx = stdout.indexOf("\n")) >= 0) {
    const line = stdout.slice(0, idx).trim();
    stdout = stdout.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { console.error("non-json stdout:", line); continue; }
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve, reject, t } = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(t);
      if (msg.error) reject(Object.assign(new Error(msg.error.message), { rpc: msg.error }));
      else resolve(msg.result);
    }
  }
}

child.stdout.on("data", () => drainLines());

function fail(msg) {
  console.error("FAIL:", msg);
  if (stderr) console.error("stderr:", stderr.slice(0, 2000));
  try { child.kill("SIGTERM"); } catch {}
  process.exit(1);
}

try {
  const init = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke", version: "1.0.0" },
  });
  console.log("initialize:", init.serverInfo?.name, init.serverInfo?.version);
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  const listed = await send("tools/list", {});
  const names = (listed.tools || []).map((t) => t.name).sort();
  console.log("tools/list (%d):", names.length, names.join(", "));
  const required = [
    "unslop","unslop_x402_challenge","get_meta","get_packs","get_me",
    "list_account_packs","list_account_jobs","list_keys","get_keys_me",
    "create_key","revoke_key","revoke_keys","demo_status","demo_unslop"
  ];
  for (const n of required) { if (!names.includes(n)) fail("missing tool: " + n); }
  const metaCall = await send("tools/call", { name: "get_meta", arguments: {} });
  const meta = JSON.parse(metaCall.content?.[0]?.text || "");
  console.log("get_meta status:", meta.status, "ok:", meta.ok);
  if (!meta.ok || !meta.body?.styles) fail("get_meta did not return styles");
  console.log("styles:", meta.body.styles.join("|"));
  const demoCall = await send("tools/call", { name: "demo_status", arguments: {} });
  const demo = JSON.parse(demoCall.content?.[0]?.text || "{}");
  console.log("demo_status status:", demo.status, "ok:", demo.ok);
  if (!demo.ok) fail("demo_status failed");
  console.log("PASS");
  child.kill("SIGTERM");
  process.exit(0);
} catch (err) {
  fail(err.message || String(err));
}
