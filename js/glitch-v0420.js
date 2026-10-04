(() => {
  const BOOT_MS = 4000;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const titles = [...document.querySelectorAll(".glitch-title")];

  // The existing empty <i> nodes become invisible text-inversion windows.
  for (const title of titles) {
    const text = title.dataset.text || title.textContent.trim();
    title.querySelectorAll(".glitch-bug").forEach(bug => {
      bug.dataset.text = text;
    });
  }

  const clearBurstClasses = title => {
    title.classList.remove("phantom-burst-a", "phantom-burst-b", "phantom-burst-c");
  };

  const triggerBurst = title => {
    if (document.documentElement.classList.contains("phantom-boot-v0420")) return;
    clearBurstClasses(title);
    const variants = ["phantom-burst-a", "phantom-burst-b", "phantom-burst-c"];
    const cls = variants[Math.floor(Math.random() * variants.length)];
    // Force a fresh animation even if the same random variant repeats.
    void title.offsetWidth;
    title.classList.add(cls);
    window.setTimeout(() => title.classList.remove(cls), 150);
  };

  const scheduleBurst = title => {
    const delay = 5000 + Math.random() * 2000;
    window.setTimeout(() => {
      triggerBurst(title);
      scheduleBurst(title);
    }, delay);
  };

  const triggerInversion = title => {
    if (document.documentElement.classList.contains("phantom-boot-v0420")) return;
    const bugs = [...title.querySelectorAll(".glitch-bug")];
    if (!bugs.length) return;
    const bug = bugs[Math.floor(Math.random() * bugs.length)];
    bug.classList.remove("phantom-invert-active");
    void bug.offsetWidth;
    bug.classList.add("phantom-invert-active");
    window.setTimeout(() => bug.classList.remove("phantom-invert-active"), 620);
  };

  const scheduleInversion = title => {
    // V0.4.15 blocks fired every ~2 seconds. This is deliberately rare.
    const delay = 18000 + Math.random() * 12000;
    window.setTimeout(() => {
      triggerInversion(title);
      scheduleInversion(title);
    }, delay);
  };

  if (reduceMotion) {
    document.documentElement.classList.remove("phantom-boot-v0420");
    return;
  }

  // Let the CSS acquisition animation run once, then permanently stabilize.
  window.setTimeout(() => {
    document.documentElement.classList.remove("phantom-boot-v0420");
    titles.forEach(title => {
      scheduleBurst(title);
      scheduleInversion(title);
    });
  }, BOOT_MS);
})();
