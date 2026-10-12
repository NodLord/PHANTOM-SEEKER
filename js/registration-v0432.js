(() => {
  "use strict";

  const config = window.PHANTOM_REGISTRATION_CONFIG || {};
  const rawBase = String(config.apiBase || "").trim();
  const apiBase = rawBase.replace(/\/+$/, "");
  const timeoutMs = Math.max(2500, Number(config.requestTimeoutMs) || 9000);
  const configured = /^https:\/\//i.test(apiBase) && !/REPLACE|YOUR-|example/i.test(apiBase);

  const countEl = document.getElementById("registered-commanders-count");
  const countStateEl = document.getElementById("registered-commanders-state");
  const buttonCountEl = document.getElementById("manifest-button-count");
  const connectionEl = document.getElementById("registration-connection-status");
  const form = document.getElementById("join-expedition-form");
  const submitButton = document.getElementById("registration-submit");
  const submitState = document.getElementById("registration-submit-state");
  const edsmInput = document.getElementById("registration-edsm-name");
  const edsmState = document.getElementById("edsm-check-state");
  const manifestList = document.getElementById("manifest-list");
  const manifestStatus = document.getElementById("manifest-status");
  const manifestTotal = document.getElementById("manifest-total");

  let manifestCache = null;
  let manifestCacheAt = 0;
  let edsmTimer = 0;
  let edsmAbort = null;

  function setCount(value) {
    const missing = value === null || value === undefined || value === "";
    const n = !missing && Number.isFinite(Number(value)) ? Number(value) : null;
    const text = n === null ? "--" : String(n).padStart(2, "0");
    if (countEl) countEl.textContent = text;
    if (buttonCountEl) buttonCountEl.textContent = text;
    if (manifestTotal) manifestTotal.textContent = text;
  }

  function setConnection(text, mode = "neutral") {
    if (connectionEl) {
      connectionEl.textContent = text;
      connectionEl.dataset.state = mode;
    }
    if (countStateEl) {
      countStateEl.textContent = mode === "online" ? "LIVE MANIFEST // ONLINE" : text;
      countStateEl.dataset.state = mode;
    }
  }

  function apiUrl(path) {
    return `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;
  }

  async function requestJson(path, options = {}) {
    if (!configured) throw new Error("registration_api_not_configured");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(apiUrl(path), {
        ...options,
        headers: {
          "Accept": "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers || {})
        },
        signal: controller.signal
      });
      let data = null;
      try { data = await response.json(); } catch { data = {}; }
      if (!response.ok) {
        const err = new Error(data?.error || `http_${response.status}`);
        err.status = response.status;
        err.data = data;
        throw err;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function edsmLabel(status) {
    switch (status) {
      case "confirmed": return ["EDSM RECORD FOUND", "found"];
      case "private_or_no_ranks": return ["EDSM RECORD FOUND // PRIVATE OR NO RANKS", "private"];
      case "not_found": return ["NO EDSM RECORD FOUND // REGISTRATION STILL ALLOWED", "missing"];
      case "not_provided": return ["EDSM NOT PROVIDED", "manual"];
      case "unavailable": return ["EDSM CHECK UNAVAILABLE // REGISTRATION STILL ALLOWED", "unavailable"];
      default: return ["EDSM CHECK // STANDBY", "neutral"];
    }
  }

  function setEdsmState(status, customText = "") {
    if (!edsmState) return;
    const [label, mode] = edsmLabel(status);
    edsmState.textContent = customText || label;
    edsmState.dataset.state = mode;
  }

  async function checkEdsm() {
    const name = String(edsmInput?.value || "").trim();
    if (!name) {
      setEdsmState("not_provided");
      return;
    }
    if (!configured) {
      setEdsmState("unavailable", "EDSM CHECK // REGISTRATION API NOT CONFIGURED");
      return;
    }
    edsmAbort?.abort();
    edsmAbort = new AbortController();
    setEdsmState("neutral", "EDSM CHECK // QUERYING…");
    try {
      const response = await fetch(apiUrl(`/api/edsm-check?name=${encodeURIComponent(name)}`), {
        headers: { "Accept": "application/json" },
        signal: edsmAbort.signal
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "edsm_check_failed");
      setEdsmState(data.status || "unavailable");
    } catch (err) {
      if (err?.name === "AbortError") return;
      setEdsmState("unavailable");
    }
  }

  function manifestBadge(status) {
    const [label, mode] = edsmLabel(status);
    const span = document.createElement("span");
    span.className = `manifest-edsm-badge is-${mode}`;
    span.textContent = label.replace(" // REGISTRATION STILL ALLOWED", "");
    return span;
  }

  function renderManifest(data) {
    const commanders = Array.isArray(data?.commanders) ? data.commanders : [];
    setCount(Number(data?.count ?? commanders.length));
    if (!manifestList || !manifestStatus) return;
    manifestList.replaceChildren();

    if (!commanders.length) {
      manifestStatus.textContent = "NO COMMANDERS REGISTERED YET // THE VOID IS TEMPORARILY WINNING";
      manifestStatus.dataset.state = "empty";
      return;
    }

    manifestStatus.textContent = `${commanders.length} COMMANDER${commanders.length === 1 ? "" : "S"} RECEIVED // MANIFEST SYNCHRONIZED`;
    manifestStatus.dataset.state = "online";

    for (const commander of commanders) {
      const row = document.createElement("article");
      row.className = "manifest-row";

      const identity = document.createElement("div");
      identity.className = "manifest-identity";
      const name = document.createElement("strong");
      name.textContent = `CMDR ${commander.cmdrName || "UNKNOWN"}`;
      const meta = document.createElement("span");
      meta.textContent = `${commander.primaryShip || "SHIP UNSPECIFIED"} // ${commander.preferredRole || "ROLE UNSPECIFIED"}`;
      identity.append(name, meta);

      const link = document.createElement("div");
      link.className = "manifest-link-state";
      link.appendChild(manifestBadge(commander.edsmStatus || "not_provided"));
      if (commander.edsmName) {
        const edsmName = document.createElement("small");
        edsmName.textContent = commander.edsmName;
        link.appendChild(edsmName);
      }

      row.append(identity, link);
      manifestList.appendChild(row);
    }
  }

  async function refreshManifest(force = false) {
    if (!configured) {
      setCount(null);
      setConnection("REGISTRATION TERMINAL // API NOT CONFIGURED", "offline");
      if (manifestStatus) {
        manifestStatus.textContent = "DATA LINK OFFLINE // CONFIGURE js/registration-config-v0432.js";
        manifestStatus.dataset.state = "offline";
      }
      return null;
    }

    const now = Date.now();
    if (!force && manifestCache && now - manifestCacheAt < 30000) {
      renderManifest(manifestCache);
      return manifestCache;
    }

    if (manifestStatus) manifestStatus.textContent = "SYNCHRONIZING MANIFEST…";
    try {
      const data = await requestJson("/api/manifest");
      manifestCache = data;
      manifestCacheAt = Date.now();
      renderManifest(data);
      setConnection("REGISTRATION TERMINAL // ONLINE", "online");
      return data;
    } catch (err) {
      setCount(null);
      setConnection("REGISTRATION TERMINAL // DATA LINK ERROR", "offline");
      if (manifestStatus) {
        manifestStatus.textContent = "MANIFEST LINK FAILED // RETRY WHEN THE VOID STOPS INTERFERING";
        manifestStatus.dataset.state = "offline";
      }
      return null;
    }
  }

  if (edsmInput) {
    edsmInput.addEventListener("input", () => {
      clearTimeout(edsmTimer);
      setEdsmState(edsmInput.value.trim() ? "neutral" : "not_provided", edsmInput.value.trim() ? "EDSM CHECK // WAITING FOR INPUT…" : "");
      edsmTimer = setTimeout(checkEdsm, 700);
    });
    edsmInput.addEventListener("blur", () => {
      clearTimeout(edsmTimer);
      checkEdsm();
    });
  }

  if (form) {
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (!configured) {
        if (submitState) {
          submitState.textContent = "TERMINAL OFFLINE // API NOT CONFIGURED";
          submitState.dataset.state = "error";
        }
        return;
      }

      const fields = new FormData(form);
      const payload = {
        cmdrName: String(fields.get("cmdrName") || "").trim(),
        edsmName: String(fields.get("edsmName") || "").trim(),
        primaryShip: String(fields.get("primaryShip") || "").trim(),
        preferredRole: String(fields.get("preferredRole") || "").trim(),
        contact: String(fields.get("contact") || "")
      };

      if (!payload.cmdrName || !payload.primaryShip || !payload.preferredRole) {
        form.reportValidity?.();
        return;
      }

      submitButton && (submitButton.disabled = true);
      if (submitState) {
        submitState.textContent = "TRANSMITTING REGISTRATION…";
        submitState.dataset.state = "working";
      }

      try {
        const data = await requestJson("/api/register", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setCount(data.count);
        setEdsmState(data.commander?.edsmStatus || "not_provided");
        if (submitState) {
          submitState.textContent = `CMDR ${String(data.commander?.cmdrName || payload.cmdrName).toUpperCase()} // REGISTERED`;
          submitState.dataset.state = "success";
        }
        manifestCache = null;
        await refreshManifest(true);
        form.reset();
        setEdsmState("not_provided");
      } catch (err) {
        if (submitState) {
          if (err?.status === 409) submitState.textContent = "COMMANDER ALREADY PRESENT IN MANIFEST";
          else if (err?.status === 400) submitState.textContent = err?.data?.message || "REGISTRATION DATA REJECTED";
          else submitState.textContent = "TRANSMISSION FAILED // TRY AGAIN";
          submitState.dataset.state = "error";
        }
      } finally {
        submitButton && (submitButton.disabled = false);
      }
    });
  }

  document.addEventListener("phantom:manifest-open", () => refreshManifest(true));

  if (!configured) {
    setCount(null);
    setConnection("REGISTRATION TERMINAL // API NOT CONFIGURED", "offline");
    if (submitButton) submitButton.disabled = false;
    setEdsmState("unavailable", "EDSM CHECK // API NOT CONFIGURED");
  } else {
    refreshManifest(true);
  }
})();
