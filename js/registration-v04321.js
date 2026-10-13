(() => {
  "use strict";

  const config = window.PHANTOM_REGISTRATION_CONFIG || {};
  const rawBase = String(config.apiBase || "").trim();
  const apiBase = rawBase.replace(/\/+$/, "");
  const timeoutMs = Math.max(2500, Number(config.requestTimeoutMs) || 9000);
  const configured = /^https:\/\//i.test(apiBase) && !/REPLACE|YOUR-|example/i.test(apiBase);
  const KEY_STORE = "phantomSeekerRegistrationKeysV1";
  const MAX_ROLES = 3;

  const countEl = document.getElementById("registered-commanders-count");
  const countStateEl = document.getElementById("registered-commanders-state");
  const buttonCountEl = document.getElementById("manifest-button-count");
  const connectionEl = document.getElementById("registration-connection-status");
  const form = document.getElementById("join-expedition-form");
  const submitButton = document.getElementById("registration-submit");
  const submitState = document.getElementById("registration-submit-state");
  const edsmInput = document.getElementById("registration-edsm-name");
  const edsmState = document.getElementById("edsm-check-state");
  const keyPanel = document.getElementById("registration-key-panel");
  const keyValue = document.getElementById("registration-key-value");
  const manifestList = document.getElementById("manifest-list");
  const manifestStatus = document.getElementById("manifest-status");
  const manifestTotal = document.getElementById("manifest-total");

  const manageAccessForm = document.getElementById("manage-registration-access-form");
  const manageEditForm = document.getElementById("manage-registration-edit-form");
  const manageCmdrInput = document.getElementById("manage-cmdr-name");
  const manageKeyInput = document.getElementById("manage-registration-key");
  const manageAccessState = document.getElementById("manage-access-state");
  const manageCurrentCmdr = document.getElementById("manage-current-cmdr");
  const manageEdsmInput = document.getElementById("manage-edsm-name");
  const manageEdsmState = document.getElementById("manage-edsm-state");
  const manageShipInput = document.getElementById("manage-primary-ship");
  const manageEditState = document.getElementById("manage-edit-state");
  const manageSaveButton = document.getElementById("manage-save");
  const manageCancelButton = document.getElementById("manage-cancel");
  const manageLocalHint = document.getElementById("manage-local-key-hint");

  let manifestCache = null;
  let manifestCacheAt = 0;
  let edsmTimer = 0;
  let edsmAbort = null;
  let manageEdsmTimer = 0;
  let manageEdsmAbort = null;
  let activeManagement = null;

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

  function setEdsmState(target, status, customText = "") {
    if (!target) return;
    const [label, mode] = edsmLabel(status);
    target.textContent = customText || label;
    target.dataset.state = mode;
  }

  async function checkEdsmField(input, state, channel = "join") {
    const name = String(input?.value || "").trim();
    if (!name) {
      setEdsmState(state, "not_provided");
      return;
    }
    if (!configured) {
      setEdsmState(state, "unavailable", "EDSM CHECK // REGISTRATION API NOT CONFIGURED");
      return;
    }
    if (channel === "join") {
      edsmAbort?.abort();
      edsmAbort = new AbortController();
    } else {
      manageEdsmAbort?.abort();
      manageEdsmAbort = new AbortController();
    }
    const controller = channel === "join" ? edsmAbort : manageEdsmAbort;
    setEdsmState(state, "neutral", "EDSM CHECK // QUERYING…");
    try {
      const response = await fetch(apiUrl(`/api/edsm-check?name=${encodeURIComponent(name)}`), {
        headers: { "Accept": "application/json" },
        signal: controller.signal
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "edsm_check_failed");
      setEdsmState(state, data.status || "unavailable");
    } catch (err) {
      if (err?.name === "AbortError") return;
      setEdsmState(state, "unavailable");
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
      const roles = Array.isArray(commander.roles) && commander.roles.length
        ? commander.roles.slice(0, MAX_ROLES)
        : [commander.preferredRole].filter(Boolean);
      meta.textContent = `${commander.primaryShip || "SHIP UNSPECIFIED"} // ${roles.length ? roles.join(" // ") : "ROLE UNSPECIFIED"}`;
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
    } catch {
      setCount(null);
      setConnection("REGISTRATION TERMINAL // DATA LINK ERROR", "offline");
      if (manifestStatus) {
        manifestStatus.textContent = "MANIFEST LINK FAILED // RETRY WHEN THE VOID STOPS INTERFERING";
        manifestStatus.dataset.state = "offline";
      }
      return null;
    }
  }

  function roleInputs(groupName) {
    return Array.from(document.querySelectorAll(`input[name="${groupName}"]`));
  }

  function selectedRoles(groupName) {
    return roleInputs(groupName).filter(input => input.checked).map(input => input.value).slice(0, MAX_ROLES);
  }

  function updateRoleGroup(groupName, countId) {
    const inputs = roleInputs(groupName);
    const selected = inputs.filter(input => input.checked);
    const full = selected.length >= MAX_ROLES;
    for (const input of inputs) input.disabled = full && !input.checked;
    const count = document.getElementById(countId);
    if (count) {
      count.textContent = `SELECTED // ${selected.length} OF ${MAX_ROLES}`;
      count.dataset.state = selected.length ? (full ? "full" : "active") : "empty";
    }
    return selected.length;
  }

  function setRoles(groupName, countId, roles) {
    const wanted = new Set(Array.isArray(roles) ? roles : []);
    for (const input of roleInputs(groupName)) {
      input.disabled = false;
      input.checked = wanted.has(input.value);
    }
    updateRoleGroup(groupName, countId);
  }

  for (const [groupName, countId] of [["roles", "join-role-count"], ["manageRoles", "manage-role-count"]]) {
    roleInputs(groupName).forEach(input => input.addEventListener("change", () => updateRoleGroup(groupName, countId)));
    updateRoleGroup(groupName, countId);
  }

  function normalizedCommanderName(name) {
    return String(name || "").replace(/^CMDR\s+/i, "").trim().toLocaleLowerCase("en-US");
  }

  function readKeyStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY_STORE) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch { return {}; }
  }

  function writeKeyStore(store) {
    try { localStorage.setItem(KEY_STORE, JSON.stringify(store)); } catch { /* storage can be blocked */ }
  }

  function saveLocalManagementKey(name, key) {
    if (!name || !key) return;
    const store = readKeyStore();
    store[normalizedCommanderName(name)] = { name: String(name).trim(), key: String(key).trim() };
    writeKeyStore(store);
  }

  function removeLocalManagementKey(name) {
    const store = readKeyStore();
    delete store[normalizedCommanderName(name)];
    writeKeyStore(store);
  }

  function findLocalManagementKey(name) {
    return readKeyStore()[normalizedCommanderName(name)] || null;
  }

  function restoreManageKeyForName() {
    const entry = findLocalManagementKey(manageCmdrInput?.value);
    if (entry?.key && manageKeyInput) {
      manageKeyInput.value = entry.key;
      if (manageLocalHint) {
        manageLocalHint.textContent = "PRIVATE KEY RESTORED FROM THIS BROWSER";
        manageLocalHint.dataset.state = "found";
      }
    } else if (manageLocalHint) {
      manageLocalHint.textContent = "NO SAVED KEY FOUND // PASTE YOUR PRIVATE REGISTRATION KEY";
      manageLocalHint.dataset.state = "manual";
    }
  }

  if (edsmInput) {
    edsmInput.addEventListener("input", () => {
      clearTimeout(edsmTimer);
      setEdsmState(edsmState, edsmInput.value.trim() ? "neutral" : "not_provided", edsmInput.value.trim() ? "EDSM CHECK // WAITING FOR INPUT…" : "");
      edsmTimer = setTimeout(() => checkEdsmField(edsmInput, edsmState, "join"), 700);
    });
    edsmInput.addEventListener("blur", () => {
      clearTimeout(edsmTimer);
      checkEdsmField(edsmInput, edsmState, "join");
    });
  }

  if (manageEdsmInput) {
    manageEdsmInput.addEventListener("input", () => {
      clearTimeout(manageEdsmTimer);
      setEdsmState(manageEdsmState, manageEdsmInput.value.trim() ? "neutral" : "not_provided", manageEdsmInput.value.trim() ? "EDSM CHECK // WAITING FOR INPUT…" : "");
      manageEdsmTimer = setTimeout(() => checkEdsmField(manageEdsmInput, manageEdsmState, "manage"), 700);
    });
    manageEdsmInput.addEventListener("blur", () => {
      clearTimeout(manageEdsmTimer);
      checkEdsmField(manageEdsmInput, manageEdsmState, "manage");
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
      const roles = selectedRoles("roles");
      const payload = {
        cmdrName: String(fields.get("cmdrName") || "").trim(),
        edsmName: String(fields.get("edsmName") || "").trim(),
        primaryShip: String(fields.get("primaryShip") || "").trim(),
        roles,
        preferredRole: roles[0] || "",
        contact: String(fields.get("contact") || "")
      };

      if (!payload.cmdrName || !payload.primaryShip) {
        form.reportValidity?.();
        return;
      }
      if (!roles.length || roles.length > MAX_ROLES) {
        if (submitState) {
          submitState.textContent = "SELECT BETWEEN 1 AND 3 EXPEDITION ROLES";
          submitState.dataset.state = "error";
        }
        return;
      }

      submitButton && (submitButton.disabled = true);
      if (submitState) {
        submitState.textContent = "TRANSMITTING REGISTRATION…";
        submitState.dataset.state = "working";
      }

      try {
        const data = await requestJson("/api/register", { method: "POST", body: JSON.stringify(payload) });
        setCount(data.count);
        setEdsmState(edsmState, data.commander?.edsmStatus || "not_provided");
        if (data.managementKey) {
          saveLocalManagementKey(data.commander?.cmdrName || payload.cmdrName, data.managementKey);
          if (keyValue) keyValue.textContent = data.managementKey;
          if (keyPanel) keyPanel.hidden = false;
        }
        if (submitState) {
          submitState.textContent = `CMDR ${String(data.commander?.cmdrName || payload.cmdrName).toUpperCase()} // REGISTERED`;
          submitState.dataset.state = "success";
        }
        manifestCache = null;
        await refreshManifest(true);
        form.reset();
        setRoles("roles", "join-role-count", []);
        setEdsmState(edsmState, "not_provided");
      } catch (err) {
        if (submitState) {
          if (err?.status === 409) submitState.textContent = "COMMANDER ALREADY PRESENT IN MANIFEST";
          else if (err?.status === 429) submitState.textContent = "RATE LIMIT // WAIT A MOMENT AND RETRY";
          else if (err?.status === 400) submitState.textContent = err?.data?.message || "REGISTRATION DATA REJECTED";
          else submitState.textContent = "TRANSMISSION FAILED // TRY AGAIN";
          submitState.dataset.state = "error";
        }
      } finally {
        submitButton && (submitButton.disabled = false);
      }
    });
  }

  manageCmdrInput?.addEventListener("input", restoreManageKeyForName);
  manageCmdrInput?.addEventListener("blur", restoreManageKeyForName);

  function managementErrorText(err) {
    switch (err?.data?.error || err?.message) {
      case "management_key_missing": return "LEGACY REGISTRATION // ASK EXPEDITION STAFF FOR A MANAGEMENT KEY";
      case "invalid_management_key": return "PRIVATE KEY REJECTED";
      case "commander_not_found": return "COMMANDER NOT FOUND IN MANIFEST";
      case "rate_limited": return "RATE LIMIT // WAIT A MOMENT AND RETRY";
      default: return "SECURE LINK FAILED // CHECK NAME AND KEY";
    }
  }

  if (manageAccessForm) {
    manageAccessForm.addEventListener("submit", async event => {
      event.preventDefault();
      const cmdrName = String(manageCmdrInput?.value || "").trim();
      const managementKey = String(manageKeyInput?.value || "").trim();
      if (!cmdrName || !managementKey) return manageAccessForm.reportValidity?.();
      if (manageAccessState) {
        manageAccessState.textContent = "VERIFYING PRIVATE KEY…";
        manageAccessState.dataset.state = "working";
      }
      try {
        const data = await requestJson("/api/manage/load", {
          method: "POST",
          body: JSON.stringify({ cmdrName, managementKey })
        });
        activeManagement = { cmdrName: data.commander.cmdrName, managementKey };
        saveLocalManagementKey(data.commander.cmdrName, managementKey);
        if (manageCurrentCmdr) manageCurrentCmdr.textContent = data.commander.cmdrName;
        if (manageEdsmInput) manageEdsmInput.value = data.commander.edsmName || "";
        if (manageShipInput) manageShipInput.value = data.commander.primaryShip || "";
        setRoles("manageRoles", "manage-role-count", data.commander.roles || []);
        setEdsmState(manageEdsmState, data.commander.edsmStatus || "not_provided");
        if (manageEditForm) manageEditForm.hidden = false;
        if (manageAccessState) {
          manageAccessState.textContent = "PRIVATE KEY ACCEPTED // REGISTRATION LOADED";
          manageAccessState.dataset.state = "success";
        }
      } catch (err) {
        activeManagement = null;
        if (manageEditForm) manageEditForm.hidden = true;
        if (manageAccessState) {
          manageAccessState.textContent = managementErrorText(err);
          manageAccessState.dataset.state = "error";
        }
      }
    });
  }

  if (manageEditForm) {
    manageEditForm.addEventListener("submit", async event => {
      event.preventDefault();
      if (!activeManagement) return;
      const roles = selectedRoles("manageRoles");
      if (!roles.length || roles.length > MAX_ROLES) {
        if (manageEditState) {
          manageEditState.textContent = "SELECT BETWEEN 1 AND 3 EXPEDITION ROLES";
          manageEditState.dataset.state = "error";
        }
        return;
      }
      const payload = {
        cmdrName: activeManagement.cmdrName,
        managementKey: activeManagement.managementKey,
        edsmName: String(manageEdsmInput?.value || "").trim(),
        primaryShip: String(manageShipInput?.value || "").trim(),
        roles,
        preferredRole: roles[0]
      };
      if (!payload.primaryShip) return manageEditForm.reportValidity?.();
      if (manageSaveButton) manageSaveButton.disabled = true;
      if (manageEditState) {
        manageEditState.textContent = "UPDATING MANIFEST…";
        manageEditState.dataset.state = "working";
      }
      try {
        const data = await requestJson("/api/manage/update", { method: "POST", body: JSON.stringify(payload) });
        setCount(data.count);
        setEdsmState(manageEdsmState, data.commander?.edsmStatus || "not_provided");
        if (manageEditState) {
          manageEditState.textContent = "REGISTRATION UPDATED // MANIFEST SYNCHRONIZED";
          manageEditState.dataset.state = "success";
        }
        manifestCache = null;
        await refreshManifest(true);
      } catch (err) {
        if (manageEditState) {
          manageEditState.textContent = err?.status === 429 ? "RATE LIMIT // WAIT A MOMENT AND RETRY" : (err?.data?.message || "UPDATE FAILED // TRY AGAIN");
          manageEditState.dataset.state = "error";
        }
      } finally {
        if (manageSaveButton) manageSaveButton.disabled = false;
      }
    });
  }

  manageCancelButton?.addEventListener("click", async () => {
    if (!activeManagement) return;
    const confirmed = window.confirm(`Cancel CMDR ${activeManagement.cmdrName}'s Phantom Seeker registration? This removes the commander from the live manifest and frees the name for a new registration.`);
    if (!confirmed) return;
    manageCancelButton.disabled = true;
    if (manageEditState) {
      manageEditState.textContent = "CANCELLING REGISTRATION…";
      manageEditState.dataset.state = "working";
    }
    try {
      const data = await requestJson("/api/manage/cancel", {
        method: "POST",
        body: JSON.stringify(activeManagement)
      });
      setCount(data.count);
      removeLocalManagementKey(activeManagement.cmdrName);
      if (manageEditState) {
        manageEditState.textContent = "REGISTRATION CANCELLED // COMMANDER REMOVED FROM MANIFEST";
        manageEditState.dataset.state = "success";
      }
      activeManagement = null;
      manageEditForm && (manageEditForm.hidden = true);
      manageAccessForm?.reset();
      manifestCache = null;
      await refreshManifest(true);
    } catch (err) {
      if (manageEditState) {
        manageEditState.textContent = managementErrorText(err);
        manageEditState.dataset.state = "error";
      }
    } finally {
      manageCancelButton.disabled = false;
    }
  });

  document.addEventListener("phantom:manifest-open", () => refreshManifest(true));
  document.addEventListener("phantom:management-open", () => {
    const store = readKeyStore();
    const entries = Object.values(store);
    if (entries.length === 1 && manageCmdrInput && !manageCmdrInput.value) {
      manageCmdrInput.value = entries[0].name || "";
      manageKeyInput && (manageKeyInput.value = entries[0].key || "");
      if (manageLocalHint) {
        manageLocalHint.textContent = "PRIVATE KEY RESTORED FROM THIS BROWSER";
        manageLocalHint.dataset.state = "found";
      }
    } else {
      restoreManageKeyForName();
    }
  });

  if (!configured) {
    setCount(null);
    setConnection("REGISTRATION TERMINAL // API NOT CONFIGURED", "offline");
    if (submitButton) submitButton.disabled = false;
    setEdsmState(edsmState, "unavailable", "EDSM CHECK // API NOT CONFIGURED");
  } else {
    refreshManifest(true);
  }
})();
