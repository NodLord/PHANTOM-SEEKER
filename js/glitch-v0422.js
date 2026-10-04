(() => {
  const BOOT_MS = 4000;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const titles = [...document.querySelectorAll(".glitch-title")];

  const clearBurstClasses = title => {
    title.classList.remove("phantom-burst-a", "phantom-burst-b", "phantom-burst-c");
  };

  const triggerBurst = title => {
    if (document.documentElement.classList.contains("phantom-boot-v0420")) return;
    clearBurstClasses(title);
    const variants = ["phantom-burst-a", "phantom-burst-b", "phantom-burst-c"];
    const cls = variants[Math.floor(Math.random() * variants.length)];
    void title.offsetWidth;
    title.classList.add(cls);
    window.setTimeout(() => title.classList.remove(cls), 150);
  };

  const scheduleBurst = title => {
    // V0.4.22: deliberately more frequent than the former 5-7 s cadence.
    const delay = 2600 + Math.random() * 1800;
    window.setTimeout(() => {
      triggerBurst(title);
      scheduleBurst(title);
    }, delay);
  };

  const BLOCK_CLASSES = [
    "phantom-block-grey",
    "phantom-block-black",
    "phantom-block-metal",
    "phantom-block-invert"
  ];

  const clearBlock = bug => {
    bug.classList.remove("phantom-block-active", ...BLOCK_CLASSES);
  };

  const pickBlockMode = () => {
    const r = Math.random();
    if (r < 0.36) return "phantom-block-grey";
    if (r < 0.64) return "phantom-block-black";
    if (r < 0.90) return "phantom-block-metal";
    return "phantom-block-invert"; // rare (~10%)
  };

  const triggerBlock = title => {
    if (document.documentElement.classList.contains("phantom-boot-v0420")) return;
    const bugs = [...title.querySelectorAll(".glitch-bug")];
    if (!bugs.length) return;

    const bug = bugs[Math.floor(Math.random() * bugs.length)];
    bugs.forEach(clearBlock);
    void bug.offsetWidth;

    bug.classList.add(pickBlockMode(), "phantom-block-active");
    window.setTimeout(() => clearBlock(bug), 700);
  };

  const scheduleBlock = title => {
    // Regular enough to be part of the signal language, but not constant.
    const delay = 4200 + Math.random() * 2600;
    window.setTimeout(() => {
      triggerBlock(title);
      scheduleBlock(title);
    }, delay);
  };

  if (reduceMotion) {
    document.documentElement.classList.remove("phantom-boot-v0420");
    return;
  }

  // Preserve the existing 4-second decaying boot sequence from V0.4.20.
  window.setTimeout(() => {
    document.documentElement.classList.remove("phantom-boot-v0420");
    titles.forEach(title => {
      scheduleBurst(title);
      scheduleBlock(title);
    });
  }, BOOT_MS);
})();
