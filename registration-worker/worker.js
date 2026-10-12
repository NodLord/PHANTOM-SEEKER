const ALLOWED_ROLES = new Set([
  "Deep Scout",
  "Archaeological Surveyor",
  "Biological Surveyor",
  "Cartographer",
  "Carrier Support"
]);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
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

async function checkEdsm(name) {
  const edsmName = cleanText(name, 64);
  if (!edsmName) return { status: "not_provided", msgnum: null };

  const url = new URL("https://www.edsm.net/api-commander-v1/get-ranks");
  url.searchParams.set("commanderName", edsmName);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "accept": "application/json",
        "user-agent": "Phantom-Seeker-Registration/0.4.32"
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

async function manifest(env) {
  const countRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM commanders").first();
  const { results } = await env.DB.prepare(`
    SELECT cmdr_name, edsm_name, edsm_status, primary_ship, preferred_role, registered_at
    FROM commanders
    ORDER BY registered_at ASC, id ASC
    LIMIT 1000
  `).all();

  return {
    count: Number(countRow?.count || 0),
    commanders: (results || []).map(row => ({
      cmdrName: row.cmdr_name,
      edsmName: row.edsm_name || "",
      edsmStatus: row.edsm_status || "not_provided",
      primaryShip: row.primary_ship,
      preferredRole: row.preferred_role,
      registeredAt: row.registered_at
    }))
  };
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
      return json({ ok: true, service: "phantom-seeker-registration", version: "0.4.32" }, 200, corsHeaders);
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
      const name = cleanText(url.searchParams.get("name"), 64);
      if (!name) return json({ error: "missing_edsm_name" }, 400, corsHeaders);
      const result = await checkEdsm(name);
      return json({ name, ...result }, 200, corsHeaders);
    }

    if (url.pathname === "/api/register" && request.method === "POST") {
      const origin = request.headers.get("Origin") || "";
      if (origin && !allowedOrigins(env).includes(origin)) {
        return json({ error: "origin_not_allowed" }, 403, corsHeaders);
      }

      let body;
      try { body = await request.json(); }
      catch { return json({ error: "invalid_json", message: "Invalid registration payload." }, 400, corsHeaders); }

      // Honeypot. A browser user never sees this field.
      if (cleanText(body?.contact, 100)) {
        return json({ ok: true, count: (await manifest(env)).count }, 200, corsHeaders);
      }

      const cmdrName = cleanCommanderName(body?.cmdrName);
      const edsmName = cleanText(body?.edsmName, 64);
      const primaryShip = cleanText(body?.primaryShip, 80);
      const preferredRole = cleanText(body?.preferredRole, 64);

      if (!validateCommanderName(cmdrName)) {
        return json({ error: "invalid_cmdr_name", message: "CMDR name is missing or contains unsupported characters." }, 400, corsHeaders);
      }
      if (primaryShip.length < 2) {
        return json({ error: "invalid_primary_ship", message: "Primary ship is required." }, 400, corsHeaders);
      }
      if (!ALLOWED_ROLES.has(preferredRole)) {
        return json({ error: "invalid_preferred_role", message: "Preferred role is not recognized." }, 400, corsHeaders);
      }

      const edsm = await checkEdsm(edsmName);
      const key = commanderKey(cmdrName);

      try {
        const result = await env.DB.prepare(`
          INSERT INTO commanders
          (cmdr_key, cmdr_name, edsm_name, edsm_status, primary_ship, preferred_role, registered_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(cmdr_key) DO NOTHING
        `).bind(
          key,
          cmdrName,
          edsmName || null,
          edsm.status,
          primaryShip,
          preferredRole
        ).run();

        if (!Number(result?.meta?.changes || 0)) {
          const existing = await env.DB.prepare(
            "SELECT cmdr_name FROM commanders WHERE cmdr_key = ? LIMIT 1"
          ).bind(key).first();
          return json({
            error: "commander_already_registered",
            message: `${existing?.cmdr_name || cmdrName} is already in the expedition manifest.`
          }, 409, corsHeaders);
        }

        const current = await manifest(env);
        return json({
          ok: true,
          count: current.count,
          commander: {
            cmdrName,
            edsmName,
            edsmStatus: edsm.status,
            primaryShip,
            preferredRole
          }
        }, 201, corsHeaders);
      } catch (error) {
        console.error("registration error", error);
        return json({ error: "registration_failed" }, 503, corsHeaders);
      }
    }

    return json({ error: "not_found" }, 404, corsHeaders);
  }
};
