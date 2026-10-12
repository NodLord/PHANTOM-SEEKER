(() => {
  // V0.4.32 // REGISTRATION TERMINAL. Existing V0.4.4 layout CSS remains the base.
  if (!document.querySelector('link[data-phantom-v044="home"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/v044.css";
    link.dataset.phantomV044 = "home";
    document.head.appendChild(link);
  }

  if (!document.querySelector('link[data-phantom-v0432="registration"]')) {
    const registrationLink = document.createElement("link");
    registrationLink.rel = "stylesheet";
    registrationLink.href = "css/registration-v0432.css";
    registrationLink.dataset.phantomV0432 = "registration";
    document.head.appendChild(registrationLink);
  }

  // -------------------------------------------------------------------
  // TEXT / LABEL CORRECTIONS
  // -------------------------------------------------------------------
  // Remove leftover vertical labels from the earlier route-map prototype.
  document.querySelector(".compass-dir.up")?.remove();
  document.querySelector(".compass-dir.down")?.remove();

  const routeIndex = document.querySelector("#galactic-route .section-index");
  if (routeIndex) routeIndex.textContent = "01 // GALACTIC ROUTE";

  const routeCanvas = document.getElementById("expedition-route-map");
  if (routeCanvas) routeCanvas.setAttribute("aria-label", "Interactive galactic route map");

  // WP11 nickname has changed everywhere on the static homepage.
  document.querySelectorAll("*").forEach(el => {
    if (el.children.length === 0 && el.textContent.trim() === "THE DEEP DARK") {
      el.textContent = "THE PURPLE SURVEY";
    }
  });

  // -------------------------------------------------------------------
  // EXPEDITION STATUS
  // -------------------------------------------------------------------
  if (!document.getElementById("expedition-status")) {
    const section = document.createElement("section");
    section.id = "expedition-status";
    section.className = "expedition-status section-shell reveal";
    section.innerHTML = `
      <div class="section-index">00.5 // EXPEDITION STATUS</div>

      <div class="status-heading">
        <div>
          <h2>FINAL PREPARATIONS</h2>
          <p>
            Phantom Seeker is in its final preparation phase. The exact departure date is not locked yet,
            but the fleet is expected to leave in approximately one month.
          </p>
        </div>
        <div class="status-signal"><span></span> PRE-DEPARTURE</div>
      </div>

      <div class="status-grid">
        <article class="status-card">
          <span class="status-label">TARGET DEPARTURE</span>
          <strong>~ 1 MONTH</strong>
          <small>FINAL DATE // TBA</small>
        </article>

        <article class="status-card">
          <span class="status-label">TOTAL EXPEDITION ROUTE</span>
          <strong>48,668 LY</strong>
          <small>TEORGE → DERISO</small>
        </article>

        <article class="status-card">
          <span class="status-label">REGISTERED COMMANDERS</span>
          <strong id="registered-commanders-count">--</strong>
          <small id="registered-commanders-state">SYNCING LIVE MANIFEST</small>
        </article>

        <article class="status-card">
          <span class="status-label">EXPEDITION FLEET CARRIERS</span>
          <strong>02</strong>
          <small>PHARMACY + MARIGOLD'S REACH</small>
        </article>
      </div>

      <div class="status-actions">
        <button class="button primary join-expedition-trigger" type="button">JOIN EXPEDITION</button>
        <button class="button manifest-trigger" id="manifest-trigger" type="button">REGISTERED CMDRS // <span id="manifest-button-count">--</span></button>
        <span id="registration-connection-status">CONNECTING REGISTRATION TERMINAL…</span>
      </div>
    `;

    const hero = document.querySelector(".hero");
    hero?.insertAdjacentElement("afterend", section);
  }

  // -------------------------------------------------------------------
  // PARTICIPATION PROTOCOL
  // -------------------------------------------------------------------
  if (!document.getElementById("participation-protocol")) {
    const section = document.createElement("section");
    section.id = "participation-protocol";
    section.className = "participation-protocol section-shell reveal";
    section.innerHTML = `
      <div class="section-index">03 // PARTICIPATION PROTOCOL</div>

      <div class="protocol-heading">
        <div>
          <h2>RULES FOR THE TEMPORARILY ALIVE.</h2>
          <p>
            The expedition is deliberately light on bureaucracy. One operational rule matters;
            the rest is mostly an attempt to stop commanders becoming part of the archaeology.
          </p>
        </div>
      </div>

      <div class="protocol-grid">
        <article>
          <b>01 // FLEETCOMM</b>
          <p>Expedition operations take place in the <strong>Fleetcomm Private Group</strong>.</p>
        </article>

        <article>
          <b>02 // DON'T BE A DICK</b>
          <p>Do not shoot expedition members. Anyone creating additional ghosts may be catalogued as an archaeological site.</p>
        </article>

        <article>
          <b>03 // RECORD EVERYTHING</b>
          <p>Guardian site, Brain Trees, strange signal, suspicious rock: record the system, body, coordinates and screenshots.</p>
        </article>

        <article>
          <b>04 // RESPECT THE DEAD</b>
          <p>At memorial and historical waypoints, read the logs before boosting away like a caffeine-addicted Sidewinder pilot.</p>
        </article>

        <article>
          <b>05 // CARRIER POLICY</b>
          <p>Only <strong>USS Frank's Pharmacy</strong> and <strong>VVV Marigold's Reach</strong> accompany the expedition. Personal Fleet Carriers stay home. Two mobile cities are enough paperwork.</p>
        </article>

        <article>
          <b>06 // PERSONAL EQUIPMENT</b>
          <p><strong>Marlboros. Onionhead. Whiskey. Sleeping pills. Coffee. Spare heatsinks. Space madness medication.</strong></p>
        </article>
      </div>

      <div class="protocol-footer">
        Fleetcomm Private Group rules remain applicable throughout the expedition.
      </div>
    `;

    const routeOverview = document.getElementById("route");
    routeOverview?.insertAdjacentElement("afterend", section);
  }

  // -------------------------------------------------------------------
  // REGISTRATION TERMINAL // LIVE FRONTEND SHELL
  // Network behaviour is isolated in registration-v0432.js.
  // -------------------------------------------------------------------
  if (!document.getElementById("join-expedition-dialog")) {
    const dialog = document.createElement("dialog");
    dialog.id = "join-expedition-dialog";
    dialog.className = "join-expedition-dialog registration-dialog";
    dialog.innerHTML = `
      <form id="join-expedition-form" autocomplete="off">
        <button class="dialog-close" type="button" data-dialog-close="join-expedition-dialog" aria-label="Close registration terminal">×</button>
        <div class="section-index">REGISTRATION TERMINAL // ONLINE</div>
        <h2>JOIN PHANTOM SEEKER</h2>
        <p>
          Registration is direct. Submitting this terminal adds your commander to the expedition manifest immediately.
          <strong>No pending status. No approval queue.</strong>
        </p>

        <div class="join-preview-fields join-live-fields">
          <label>CMDR NAME
            <input id="registration-cmdr-name" name="cmdrName" required maxlength="64" autocomplete="off" placeholder="Frank Leaan">
          </label>

          <label>EDSM COMMANDER NAME <span class="field-optional">OPTIONAL</span>
            <input id="registration-edsm-name" name="edsmName" maxlength="64" autocomplete="off" placeholder="Leave blank if you do not use EDSM">
            <span class="edsm-check-state" id="edsm-check-state">EDSM CHECK // STANDBY</span>
          </label>

          <label>PRIMARY SHIP
            <input id="registration-primary-ship" name="primaryShip" required maxlength="80" autocomplete="off" placeholder="Krait Phantom">
          </label>

          <label>PREFERRED ROLE
            <select id="registration-preferred-role" name="preferredRole" required>
              <option value="Deep Scout">Deep Scout</option>
              <option value="Archaeological Surveyor">Archaeological Surveyor</option>
              <option value="Biological Surveyor">Biological Surveyor</option>
              <option value="Cartographer">Cartographer</option>
              <option value="Carrier Support">Carrier Support</option>
            </select>
          </label>
        </div>

        <label class="registration-honeypot" aria-hidden="true">Leave empty
          <input name="contact" tabindex="-1" autocomplete="off">
        </label>

        <div class="join-notice">
          EDSM is checked only to see whether the supplied commander name is known to EDSM. A missing, private or unavailable EDSM record
          <strong>does not block registration.</strong> Your CMDR name, ship, role and EDSM-link status are public in the expedition manifest.
          Personal Fleet Carriers are not part of registration; expedition carrier operations remain with
          <strong>USS Frank's Pharmacy</strong> and <strong>VVV Marigold's Reach</strong>.
        </div>

        <div class="registration-submit-row">
          <button class="button primary" id="registration-submit" type="submit">REGISTER COMMANDER</button>
          <span class="registration-submit-state" id="registration-submit-state" aria-live="polite">TERMINAL READY</span>
        </div>
      </form>
    `;
    document.body.appendChild(dialog);

    document.querySelectorAll(".join-expedition-trigger").forEach(button => {
      button.addEventListener("click", () => {
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
      });
    });

    dialog.addEventListener("click", event => {
      if (event.target === dialog) dialog.close?.();
    });
  }

  if (!document.getElementById("expedition-manifest-dialog")) {
    const manifestDialog = document.createElement("dialog");
    manifestDialog.id = "expedition-manifest-dialog";
    manifestDialog.className = "join-expedition-dialog manifest-dialog";
    manifestDialog.innerHTML = `
      <div class="manifest-dialog-inner">
        <button class="dialog-close" type="button" data-dialog-close="expedition-manifest-dialog" aria-label="Close expedition manifest">×</button>
        <div class="section-index">EXPEDITION MANIFEST // LIVE</div>
        <div class="manifest-heading-row">
          <div>
            <h2>REGISTERED COMMANDERS</h2>
            <p>Commanders currently registered for Expedition Phantom Seeker.</p>
          </div>
          <strong class="manifest-total" id="manifest-total">--</strong>
        </div>
        <div class="manifest-status" id="manifest-status" aria-live="polite">AWAITING DATA LINK…</div>
        <div class="manifest-list" id="manifest-list"></div>
      </div>
    `;
    document.body.appendChild(manifestDialog);

    document.querySelectorAll(".manifest-trigger").forEach(button => {
      button.addEventListener("click", () => {
        if (typeof manifestDialog.showModal === "function") manifestDialog.showModal();
        else manifestDialog.setAttribute("open", "");
        document.dispatchEvent(new CustomEvent("phantom:manifest-open"));
      });
    });

    manifestDialog.addEventListener("click", event => {
      if (event.target === manifestDialog) manifestDialog.close?.();
    });
  }

  document.querySelectorAll("[data-dialog-close]").forEach(button => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.dialogClose);
      if (target?.close) target.close();
      else target?.removeAttribute("open");
    });
  });

  // -------------------------------------------------------------------
  // Scroll reveal
  // -------------------------------------------------------------------
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    items.forEach(el => el.classList.add("visible"));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -8% 0px" });

  items.forEach(el => {
    if (!el.classList.contains("visible")) observer.observe(el);
  });
})();
