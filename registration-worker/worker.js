const ALLOWED_ROLES = [
  "Deep Scout",
  "Archaeological Surveyor",
  "Biological Surveyor",
  "Cartographer",
  "Carrier Support",
  "Rescue & Recovery",
  "BenRick Incident Coordinator"
];
const ALLOWED_ROLE_SET = new Set(ALLOWED_ROLES);
const MAX_ROLES = 3;
const MAX_JSON_BYTES = 8192;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      ...headers
    }
  });
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "https://nodlord.github.io")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);
}

function cors(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = allowedOrigins(env);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "vary": "Origin",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400"
  };
}

function validPublicOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  return Boolean(origin && allowedOrigins(env).includes(origin));
}

function cleanText(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanCommanderName(value) {
  return cleanText(value, 64).replace(/^CMDR\s+/i, "").trim();
}

function commanderKey(value) {
  return cleanCommanderName(value).toLocaleLowerCase("en-US");
}

function validateCommanderName(name) {
  if (name.length < 2 || name.length > 64) return false;
  return /^[\p{L}\p{N} ._'\-]+$/u.test(name);
}

function normalizeRoles(value, legacyRole = "") {
  const raw = Array.isArray(value) ? value : (value ? [value] : (legacyRole ? [legacyRole] : []));
  const roles = [];
  for (const entry of raw) {
    const role = cleanText(entry, 64);
    if (!role || roles.includes(role)) continue;
    roles.push(role);
  }
  if (!roles.length || roles.length > MAX_ROLES) return null;
  if (roles.some(role => !ALLOWED_ROLE_SET.has(role))) return null;
  return roles;
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(length) && length > MAX_JSON_BYTES) {
    const error = new Error("payload_too_large");
    error.status = 413;
    throw error;
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) {
    const error = new Error("payload_too_large");
    error.status = 413;
    throw error;
  }
  try { return JSON.parse(text || "{}"); }
  catch {
    const error = new Error("invalid_json");
    error.status = 400;
    throw error;
  }
}

async function rateLimit(env, request, scope) {
  const limiter = scope === "edsm" ? env.EDSM_RATE_LIMITER : env.WRITE_RATE_LIMITER;
  if (!limiter?.limit) return true;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const { success } = await limiter.limit({ key: `${scope}:${ip}` });
  return Boolean(success);
}

async function checkEdsm(name) {
  const edsmName = cleanText(name, 64);
  if (!edsmName) return { status: "not_provided", msgnum: null };

  const url = new URL("https://www.edsm.net/api-commander-v1/get-ranks");
  url.searchParams.set("commanderName", edsmName);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "accept": "application/json",
        "user-agent": "Phantom-Seeker-Registration/0.4.32.1"
      },
      cf: { cacheTtl: 0, cacheEverything: false }
    });
    if (!response.ok) return { status: "unavailable", msgnum: null };
    const data = await response.json();
    const code = Number(data?.msgnum);
    if (code === 100) return { status: "confirmed", msgnum: 100 };
    if (code === 207) return { status: "private_or_no_ranks", msgnum: 207 };
    if (code === 203) return { status: "not_found", msgnum: 203 };
    return { status: "unavailable", msgnum: Number.isFinite(code) ? code : null };
  } catch {
    return { status: "unavailable", msgnum: null };
  }
}

function randomManagementKey() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let raw = "";
  for (const byte of bytes) raw += alphabet[byte & 31];
  return `PSK-${raw.match(/.{1,4}/g).join("-")}`;
}

async function hashManagementKey(value) {
  const bytes = new TextEncoder().encode(String(value || "").trim().toUpperCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

async function getRoles(env, commanderId) {
  const { results } = await env.DB.prepare(`
    SELECT role FROM commander_roles
    WHERE commander_id = ?
    ORDER BY position ASC, role ASC
  `).bind(commanderId).all();
  return (results || []).map(row => row.role).filter(role => ALLOWED_ROLE_SET.has(role)).slice(0, MAX_ROLES);
}

async function manifest(env) {
  const countRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM commanders").first();
  const { results } = await env.DB.prepare(`
    SELECT c.id, c.cmdr_name, c.edsm_name, c.edsm_status, c.primary_ship, c.preferred_role,
           cr.role, cr.position
    FROM commanders c
    LEFT JOIN commander_roles cr ON cr.commander_id = c.id
    ORDER BY c.registered_at ASC, c.id ASC, cr.position ASC
    LIMIT 3000
  `).all();

  const map = new Map();
  for (const row of results || []) {
    if (!map.has(row.id)) {
      map.set(row.id, {
        cmdrName: row.cmdr_name,
        edsmName: row.edsm_name || "",
        edsmStatus: row.edsm_status || "not_provided",
        primaryShip: row.primary_ship,
        roles: []
      });
    }
    if (row.role && ALLOWED_ROLE_SET.has(row.role)) map.get(row.id).roles.push(row.role);
  }

  for (const commander of map.values()) {
    if (!commander.roles.length) {
      const legacy = results?.find(row => row.cmdr_name === commander.cmdrName)?.preferred_role;
      if (legacy && ALLOWED_ROLE_SET.has(legacy)) commander.roles = [legacy];
    }
    commander.roles = commander.roles.slice(0, MAX_ROLES);
    commander.preferredRole = commander.roles[0] || "";
  }

  return {
    count: Number(countRow?.count || 0),
    commanders: Array.from(map.values())
  };
}

async function loadManagedCommander(env, cmdrName, managementKey) {
  const key = commanderKey(cmdrName);
  const row = await env.DB.prepare(`
    SELECT id, cmdr_name, edsm_name, edsm_status, primary_ship, preferred_role
    FROM commanders WHERE cmdr_key = ? LIMIT 1
  `).bind(key).first();
  if (!row) return { error: "commander_not_found", status: 404 };

  const secret = await env.DB.prepare(
    "SELECT token_hash FROM registration_secrets WHERE commander_id = ? LIMIT 1"
  ).bind(row.id).first();
  if (!secret?.token_hash) return { error: "management_key_missing", status: 409 };

  const suppliedHash = await hashManagementKey(managementKey);
  if (suppliedHash !== secret.token_hash) return { error: "invalid_management_key", status: 403 };

  const roles = await getRoles(env, row.id);
  return {
    commander: {
      id: row.id,
      cmdrName: row.cmdr_name,
      edsmName: row.edsm_name || "",
      edsmStatus: row.edsm_status || "not_provided",
      primaryShip: row.primary_ship,
      roles: roles.length ? roles : [row.preferred_role].filter(Boolean)
    }
  };
}

async function saveRoles(env, commanderId, roles) {
  const statements = [env.DB.prepare("DELETE FROM commander_roles WHERE commander_id = ?").bind(commanderId)];
  roles.forEach((role, position) => {
    statements.push(env.DB.prepare(
      "INSERT INTO commander_roles (commander_id, role, position) VALUES (?, ?, ?)"
    ).bind(commanderId, role, position));
  });
  return env.DB.batch(statements);
}

function publicWriteRejected(request, env, corsHeaders) {
  if (!validPublicOrigin(request, env)) return json({ error: "origin_not_allowed" }, 403, corsHeaders);
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = cors(request, env);

    if (request.method === "OPTIONS") {
      const origin = request.headers.get("Origin") || "";
      if (origin && !allowedOrigins(env).includes(origin)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, service: "phantom-seeker-registration", version: "0.4.32.1" }, 200, corsHeaders);
    }

    if (url.pathname === "/api/manifest" && request.method === "GET") {
      try {
        return json(await manifest(env), 200, corsHeaders);
      } catch (error) {
        console.error("manifest error", error);
        return json({ error: "manifest_unavailable" }, 503, corsHeaders);
      }
    }

    if (url.pathname === "/api/edsm-check" && request.method === "GET") {
      if (!(await rateLimit(env, request, "edsm"))) return json({ error: "rate_limited" }, 429, corsHeaders);
      const name = cleanText(url.searchParams.get("name"), 64);
      if (!name) return json({ error: "missing_edsm_name" }, 400, corsHeaders);
      const result = await checkEdsm(name);
      return json({ name, ...result }, 200, corsHeaders);
    }

    if (url.pathname === "/api/register" && request.method === "POST") {
      const rejected = publicWriteRejected(request, env, corsHeaders);
      if (rejected) return rejected;
      if (!(await rateLimit(env, request, "write"))) return json({ error: "rate_limited", message: "Too many registration requests. Try again shortly." }, 429, corsHeaders);

      let body;
      try { body = await readJson(request); }
      catch (error) { return json({ error: error.message, message: "Invalid registration payload." }, error.status || 400, corsHeaders); }

      if (cleanText(body?.contact, 100)) {
        return json({ ok: true, count: (await manifest(env)).count }, 200, corsHeaders);
      }

      const cmdrName = cleanCommanderName(body?.cmdrName);
      const edsmName = cleanText(body?.edsmName, 64);
      const primaryShip = cleanText(body?.primaryShip, 80);
      const roles = normalizeRoles(body?.roles, body?.preferredRole);

      if (!validateCommanderName(cmdrName)) {
        return json({ error: "invalid_cmdr_name", message: "CMDR name is missing or contains unsupported characters." }, 400, corsHeaders);
      }
      if (primaryShip.length < 2) {
        return json({ error: "invalid_primary_ship", message: "Primary ship is required." }, 400, corsHeaders);
      }
      if (!roles) {
        return json({ error: "invalid_roles", message: "Select between one and three recognized expedition roles." }, 400, corsHeaders);
      }

      const key = commanderKey(cmdrName);
      const existing = await env.DB.prepare("SELECT cmdr_name FROM commanders WHERE cmdr_key = ? LIMIT 1").bind(key).first();
      if (existing) {
        return json({ error: "commander_already_registered", message: `${existing.cmdr_name || cmdrName} is already in the expedition manifest.` }, 409, corsHeaders);
      }

      const edsm = await checkEdsm(edsmName);
      const managementKey = randomManagementKey();
      const tokenHash = await hashManagementKey(managementKey);

      try {
        await env.DB.prepare(`
          INSERT INTO commanders
          (cmdr_key, cmdr_name, edsm_name, edsm_status, primary_ship, preferred_role, registered_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(key, cmdrName, edsmName || null, edsm.status, primaryShip, roles[0]).run();

        const commander = await env.DB.prepare("SELECT id FROM commanders WHERE cmdr_key = ? LIMIT 1").bind(key).first();
        if (!commander?.id) throw new Error("commander_insert_lookup_failed");

        const statements = roles.map((role, position) => env.DB.prepare(
          "INSERT INTO commander_roles (commander_id, role, position) VALUES (?, ?, ?)"
        ).bind(commander.id, role, position));
        statements.push(env.DB.prepare(
          "INSERT INTO registration_secrets (commander_id, token_hash, created_at) VALUES (?, ?, datetime('now'))"
        ).bind(commander.id, tokenHash));
        await env.DB.batch(statements);

        const current = await manifest(env);
        return json({
          ok: true,
          count: current.count,
          managementKey,
          commander: { cmdrName, edsmName, edsmStatus: edsm.status, primaryShip, roles, preferredRole: roles[0] }
        }, 201, corsHeaders);
      } catch (error) {
        console.error("registration error", error);
        await env.DB.prepare("DELETE FROM commanders WHERE cmdr_key = ?").bind(key).run().catch(() => {});
        return json({ error: "registration_failed" }, 503, corsHeaders);
      }
    }

    if (url.pathname === "/api/manage/load" && request.method === "POST") {
      const rejected = publicWriteRejected(request, env, corsHeaders);
      if (rejected) return rejected;
      if (!(await rateLimit(env, request, "write"))) return json({ error: "rate_limited" }, 429, corsHeaders);
      let body;
      try { body = await readJson(request); }
      catch (error) { return json({ error: error.message }, error.status || 400, corsHeaders); }
      const cmdrName = cleanCommanderName(body?.cmdrName);
      const managementKey = cleanText(body?.managementKey, 64);
      if (!validateCommanderName(cmdrName) || !managementKey) return json({ error: "missing_management_credentials" }, 400, corsHeaders);
      const result = await loadManagedCommander(env, cmdrName, managementKey);
      if (result.error) return json({ error: result.error }, result.status, corsHeaders);
      return json({ ok: true, commander: result.commander }, 200, corsHeaders);
    }

    if (url.pathname === "/api/manage/update" && request.method === "POST") {
      const rejected = publicWriteRejected(request, env, corsHeaders);
      if (rejected) return rejected;
      if (!(await rateLimit(env, request, "write"))) return json({ error: "rate_limited" }, 429, corsHeaders);
      let body;
      try { body = await readJson(request); }
      catch (error) { return json({ error: error.message }, error.status || 400, corsHeaders); }

      const cmdrName = cleanCommanderName(body?.cmdrName);
      const managementKey = cleanText(body?.managementKey, 64);
      const primaryShip = cleanText(body?.primaryShip, 80);
      const edsmName = cleanText(body?.edsmName, 64);
      const roles = normalizeRoles(body?.roles, body?.preferredRole);
      if (!validateCommanderName(cmdrName) || !managementKey) return json({ error: "missing_management_credentials" }, 400, corsHeaders);
      if (primaryShip.length < 2) return json({ error: "invalid_primary_ship", message: "Primary ship is required." }, 400, corsHeaders);
      if (!roles) return json({ error: "invalid_roles", message: "Select between one and three recognized expedition roles." }, 400, corsHeaders);

      const loaded = await loadManagedCommander(env, cmdrName, managementKey);
      if (loaded.error) return json({ error: loaded.error }, loaded.status, corsHeaders);
      const edsm = await checkEdsm(edsmName);

      try {
        await env.DB.prepare(`
          UPDATE commanders
          SET edsm_name = ?, edsm_status = ?, primary_ship = ?, preferred_role = ?
          WHERE id = ?
        `).bind(edsmName || null, edsm.status, primaryShip, roles[0], loaded.commander.id).run();
        await saveRoles(env, loaded.commander.id, roles);
        const current = await manifest(env);
        return json({
          ok: true,
          count: current.count,
          commander: { cmdrName: loaded.commander.cmdrName, edsmName, edsmStatus: edsm.status, primaryShip, roles, preferredRole: roles[0] }
        }, 200, corsHeaders);
      } catch (error) {
        console.error("management update error", error);
        return json({ error: "update_failed" }, 503, corsHeaders);
      }
    }

    if (url.pathname === "/api/manage/cancel" && request.method === "POST") {
      const rejected = publicWriteRejected(request, env, corsHeaders);
      if (rejected) return rejected;
      if (!(await rateLimit(env, request, "write"))) return json({ error: "rate_limited" }, 429, corsHeaders);
      let body;
      try { body = await readJson(request); }
      catch (error) { return json({ error: error.message }, error.status || 400, corsHeaders); }

      const cmdrName = cleanCommanderName(body?.cmdrName);
      const managementKey = cleanText(body?.managementKey, 64);
      if (!validateCommanderName(cmdrName) || !managementKey) return json({ error: "missing_management_credentials" }, 400, corsHeaders);
      const loaded = await loadManagedCommander(env, cmdrName, managementKey);
      if (loaded.error) return json({ error: loaded.error }, loaded.status, corsHeaders);

      try {
        await env.DB.batch([
          env.DB.prepare("DELETE FROM commander_roles WHERE commander_id = ?").bind(loaded.commander.id),
          env.DB.prepare("DELETE FROM registration_secrets WHERE commander_id = ?").bind(loaded.commander.id),
          env.DB.prepare("DELETE FROM commanders WHERE id = ?").bind(loaded.commander.id)
        ]);
        const current = await manifest(env);
        return json({ ok: true, count: current.count, cancelled: loaded.commander.cmdrName }, 200, corsHeaders);
      } catch (error) {
        console.error("management cancel error", error);
        return json({ error: "cancel_failed" }, 503, corsHeaders);
      }
    }

    return json({ error: "not_found" }, 404, corsHeaders);
  }
};
