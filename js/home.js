(() => {
  // V0.4.4 styles. Using a new filename also avoids stale GitHub/browser CSS caches.
  if (!document.querySelector('link[data-phantom-v044="home"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/v044.css";
    link.dataset.phantomV044 = "home";
    document.head.appendChild(link);
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
          <strong id="registered-commanders-count">00</strong>
          <small>REGISTRATION OPENING SOON</small>
        </article>

        <article class="status-card">
          <span class="status-label">EXPEDITION FLEET CARRIERS</span>
          <strong>02</strong>
          <small>PHARMACY + MARIGOLD'S REACH</small>
        </article>
      </div>

      <div class="status-actions">
        <button class="button primary join-expedition-trigger" type="button">JOIN EXPEDITION</button>
        <span>Registration will open here before departure.</span>
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
  // JOIN EXPEDITION PREVIEW
  // -------------------------------------------------------------------
  if (!document.getElementById("join-expedition-dialog")) {
    const dialog = document.createElement("dialog");
    dialog.id = "join-expedition-dialog";
    dialog.className = "join-expedition-dialog";
    dialog.innerHTML = `
      <form method="dialog">
        <button class="dialog-close" value="cancel" aria-label="Close">×</button>
        <div class="section-index">REGISTRATION TERMINAL // PREVIEW</div>
        <h2>JOIN PHANTOM SEEKER</h2>
        <p>
          Registration is not online yet. When it opens, submitting the form will add a commander
          directly to the expedition manifest. <strong>No approval queue.</strong>
        </p>

        <div class="join-preview-fields" aria-label="Planned registration fields">
          <label>CMDR NAME <input disabled placeholder="CMDR Example"></label>
          <label>EDSM COMMANDER NAME <input disabled placeholder="EDSM name"></label>
          <label>PRIMARY SHIP <input disabled placeholder="Krait Phantom"></label>
          <label>PREFERRED ROLE
            <select disabled>
              <option>Deep Scout</option>
              <option>Archaeological Surveyor</option>
              <option>Biological Surveyor</option>
              <option>Cartographer</option>
              <option>Carrier Support</option>
            </select>
          </label>
        </div>

        <div class="join-notice">
          Personal Fleet Carriers are not part of the registration form.
          Expedition carrier operations are handled exclusively by
          <strong>USS Frank's Pharmacy</strong> and <strong>VVV Marigold's Reach</strong>.
        </div>

        <button class="button primary join-disabled" type="button" disabled>REGISTRATION OPENING SOON</button>
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
      if (event.target === dialog) dialog.close();
    });
  }

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
