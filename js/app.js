/* ============================================================
   PDF Loves You — application shell, router, workspace and results
   ============================================================ */
(function () {
  "use strict";
  const PD = window.PD;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const THEME_KEY = "pdf-loves-you-theme";
  const BASE_TITLE = document.title;

  const RUN_LABELS = {
    merge: "Merge PDFs",
    split: "Split PDF",
    organize: "Save organized PDF",
    rotate: "Rotate PDF",
    extract: "Extract pages",
    "pdf-to-jpg": "Convert to JPG",
    "jpg-to-pdf": "Convert to PDF",
    "pdf-to-word": "Convert to Word",
    "pdf-to-excel": "Convert to Excel",
    "pdf-to-ppt": "Convert to PowerPoint",
    "pdf-to-text": "Extract text",
    ocr: "Run OCR",
    "page-numbers": "Add page numbers",
    watermark: "Add watermark",
    crop: "Crop PDF",
    redact: "Apply redactions",
    sign: "Sign PDF",
    "add-text": "Add text",
    compress: "Compress PDF",
    repair: "Repair PDF",
    protect: "Protect PDF",
    unlock: "Unlock PDF",
    pdfa: "Convert to PDF/A"
  };

  const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tif", "tiff", "avif"];

  const state = {
    open: false,
    tool: null,
    toolId: null,
    files: [],
    opts: {},
    optionFiles: {},
    ctx: null,
    toolState: {},
    optionEls: {},
    resultHost: null,
    results: null,
    running: false,
    reading: false,
    mounting: false,
    mountError: null,
    mountSeq: 0,
    runSeq: 0,
    readSeq: 0,
    previewSeq: 0,
    previewUrl: null,
    resultUrls: new Set(),
    progressTimer: 0,
    lastFocus: null,
    fileInput: null
  };

  const el = {};

  /* ============================================================
     BOOT
     ============================================================ */
  function init() {
    el.grid = $("#toolsGrid");
    el.tabs = $$(".cat-tab");
    el.ws = $("#workspace");
    el.wsName = $("#wsName");
    el.wsDesc = $("#wsDesc");
    el.wsIcon = $("#wsIcon");
    el.wsStage = $("#wsStage");
    el.wsOptions = $("#wsOptions");
    el.wsRun = $("#wsRun");
    el.wsBack = $("#wsBack");
    el.wsClose = $("#wsClose");
    el.progress = $("#wsProgress");
    el.progressBar = $("#wsProgressBar");
    el.toasts = $("#toasts");
    el.navbar = $("#siteNav");
    el.sideNav = $("#sideNav");
    el.sideOverlay = $("#sideOverlay");
    el.hamburger = $("#hamburger");

    if (!PD || !PD.tools || !PD.tools.length) {
      el.grid.innerHTML = '<p class="org-empty">The PDF engines did not load. Check that the vendor folder is next to index.html.</p>';
      return;
    }

    renderTools();
    bindCategoryTabs();
    bindTheme();
    bindNav();
    bindReveal();
    bindWorkspace();
    createFileInput();
    setYear();

    const year = $("#year");
    if (year) year.textContent = String(new Date().getFullYear());

    route();
  }

  function setYear() {
    try { $("#year").textContent = new Date().getFullYear(); } catch (e) {}
  }

  /* ============================================================
     TOOL GRID + ROUTING
     ============================================================ */
  function renderTools() {
    el.grid.innerHTML = PD.tools
      .map(
        (tool) =>
          '<a class="tool-card c-' +
          PD.esc(tool.cat) +
          '" href="#' +
          PD.esc(tool.id) +
          '" data-tool="' +
          PD.esc(tool.id) +
          '" aria-label="' +
          PD.esc(tool.name + " — " + tool.desc) +
          '">' +
          '<span class="tool-ico"><svg class="ic" aria-hidden="true"><use href="#i-' +
          PD.esc(tool.icon) +
          '"/></svg></span>' +
          '<span class="tool-body"><span class="tool-name">' +
          PD.esc(tool.name) +
          '</span><span class="tool-desc">' +
          PD.esc(tool.desc) +
          '</span></span>' +
          '<span class="tool-tag">' +
          PD.esc(tool.tag || "PDF") +
          "</span></a>"
      )
      .join("");

    const count = $("#toolCount");
    if (count) count.textContent = String(PD.tools.length);

    el.grid.addEventListener("click", (e) => {
      const card = e.target.closest("[data-tool]");
      if (!card) return;
      e.preventDefault();
      goTool(card.dataset.tool);
    });
  }

  function bindCategoryTabs() {
    el.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        el.tabs.forEach((b) => b.classList.toggle("active", b === tab));
        const cat = tab.dataset.cat || "all";
        $$(".tool-card", el.grid).forEach((card) => {
          const tool = PD.toolMap[card.dataset.tool];
          card.hidden = !!tool && cat !== "all" && tool.cat !== cat;
        });
      });
    });

    document.addEventListener("click", (e) => {
      const link = e.target.closest("[data-tool-link]");
      if (!link) return;
      e.preventDefault();
      const id = link.dataset.toolLink;
      if (PD.toolMap[id]) goTool(id);
    });
  }

  function toolFromHash() {
    const id = String(location.hash || "").replace(/^#\/?/, "");
    return PD.toolMap[id] ? id : null;
  }

  function goTool(id, replace) {
    if (!PD.toolMap[id]) return;
    closeDrawer();
    const hash = "#" + id;
    if (location.hash !== hash) {
      try {
        history[replace ? "replaceState" : "pushState"](null, "", hash);
      } catch (e) {
        location.hash = id;
      }
    }
    openTool(id);
  }

  function route() {
    const id = toolFromHash();
    if (id) openTool(id);
    else closeTool();
  }

  window.addEventListener("hashchange", route);
  window.addEventListener("popstate", route);

  /* ============================================================
     THEME
     ============================================================ */
  function storedTheme() {
    try { return localStorage.getItem(THEME_KEY) || "system"; } catch (e) { return "system"; }
  }

  function resolvedTheme(choice) {
    if (choice === "light" || choice === "dark") return choice;
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch (e) {
      return "light";
    }
  }

  function applyTheme(choice, persist) {
    const mode = choice === "light" || choice === "dark" ? choice : "system";
    const resolved = resolvedTheme(mode);
    document.documentElement.dataset.theme = resolved;
    if (persist !== false) {
      try { localStorage.setItem(THEME_KEY, mode); } catch (e) {}
    }
    $$("[data-theme-choice]").forEach((b) => {
      const active = b.dataset.themeChoice === mode;
      b.classList.toggle("active", active);
      if (b.getAttribute("role") === "menuitem") b.setAttribute("aria-checked", String(active));
    });
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "dark" ? "#161616" : "#0072f5");
  }

  function bindTheme() {
    applyTheme(storedTheme(), false);

    const dd = $("#themeDD");
    const btn = $("#themeBtn");
    if (btn && dd) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = dd.classList.toggle("open");
        btn.setAttribute("aria-expanded", String(open));
      });
      document.addEventListener("click", (e) => {
        if (dd.contains(e.target)) return;
        dd.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && dd.classList.contains("open")) {
          dd.classList.remove("open");
          btn.setAttribute("aria-expanded", "false");
          btn.focus();
        }
      });
    }

    $$("[data-theme-choice]").forEach((choice) => {
      choice.addEventListener("click", () => {
        applyTheme(choice.dataset.themeChoice, true);
        if (dd) {
          dd.classList.remove("open");
          if (btn) btn.setAttribute("aria-expanded", "false");
        }
      });
    });

    try {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => {
        if (storedTheme() === "system") applyTheme("system", false);
      };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else if (mq.addListener) mq.addListener(onChange);
    } catch (e) {}
  }

  /* ============================================================
     NAVBAR / DRAWER / REVEAL
     ============================================================ */
  function bindNav() {
    const onScroll = () => {
      if (el.navbar) el.navbar.classList.toggle("scrolled", window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    if (el.hamburger) el.hamburger.addEventListener("click", () => setDrawer(!isDrawerOpen()));
    if (el.sideOverlay) el.sideOverlay.addEventListener("click", () => setDrawer(false));
    $$(".side-link").forEach((link) => link.addEventListener("click", () => setDrawer(false)));
  }

  function isDrawerOpen() {
    return !!(el.sideNav && el.sideNav.classList.contains("open"));
  }

  function setDrawer(open) {
    if (!el.sideNav) return;
    el.sideNav.classList.toggle("open", open);
    el.sideNav.setAttribute("aria-hidden", String(!open));
    document.body.classList.toggle("drawer-open", open);
    if (el.sideOverlay) el.sideOverlay.classList.toggle("show", open);
    if (el.hamburger) {
      el.hamburger.classList.toggle("open", open);
      el.hamburger.setAttribute("aria-expanded", String(open));
      el.hamburger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }
  }

  function closeDrawer() {
    if (isDrawerOpen()) setDrawer(false);
  }

  function bindReveal() {
    const nodes = $$(".reveal");
    if (!("IntersectionObserver" in window)) {
      nodes.forEach((n) => n.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -30px" }
    );
    nodes.forEach((n) => io.observe(n));
  }

  /* ============================================================
     TOASTS
     ============================================================ */
  function toast(msg, type) {
    if (!el.toasts) return;
    const text = String(msg);
    const existing = Array.from(el.toasts.children).find((n) => n.dataset.msg === text);
    if (existing) return;
    while (el.toasts.children.length >= 4) el.toasts.firstElementChild.remove();
    const node = document.createElement("div");
    node.className = "toast" + (type === "error" ? " error" : "");
    node.dataset.msg = text;
    node.setAttribute("role", type === "error" ? "alert" : "status");
    node.innerHTML =
      '<svg class="ic" aria-hidden="true"><use href="#' +
      (type === "error" ? "i-warning" : "i-check") +
      '"/></svg><span></span>';
    node.querySelector("span").textContent = text;
    el.toasts.appendChild(node);
    setTimeout(() => {
      node.style.opacity = "0";
      node.style.transform = "translateY(6px)";
      node.style.transition = "opacity .2s ease, transform .2s ease";
      setTimeout(() => node.remove(), 220);
    }, 3600);
  }

  window.PDUI = {
    toast,
    openTool: goTool,
    close: requestClose,
    get tool() { return state.tool; }
  };

  /* ============================================================
     WORKSPACE OPEN / CLOSE
     ============================================================ */
  function bindWorkspace() {
    el.wsClose.addEventListener("click", requestClose);
    el.wsBack.addEventListener("click", requestClose);
    el.wsRun.addEventListener("click", runTool);

    el.wsStage.addEventListener("dragover", (e) => {
      if (!state.open || !hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      el.wsStage.classList.add("is-dragover");
    });
    el.wsStage.addEventListener("dragleave", (e) => {
      if (e.target === el.wsStage || !el.wsStage.contains(e.relatedTarget)) el.wsStage.classList.remove("is-dragover");
    });
    el.wsStage.addEventListener("drop", (e) => {
      if (!state.open) return;
      e.preventDefault();
      el.wsStage.classList.remove("is-dragover");
      if (state.running) {
        toast("Wait for the current task to finish first.", "error");
        return;
      }
      if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
    });

    window.addEventListener("dragover", (e) => {
      if (state.open && hasFiles(e)) e.preventDefault();
    });
    window.addEventListener("drop", (e) => {
      if (!state.open) return;
      e.preventDefault();
      if (!el.wsStage.contains(e.target)) {
        el.wsStage.classList.remove("is-dragover");
        toast("Drop files inside the workspace to add them.", "error");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (isDrawerOpen()) {
          setDrawer(false);
          return;
        }
        if (state.open) requestClose();
        return;
      }
      if (e.key !== "Tab" || !state.open) return;
      const list = $$(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        el.ws
      ).filter((node) => node.offsetParent !== null);
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  function hasFiles(e) {
    try {
      return !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf("Files") !== -1);
    } catch (err) {
      return false;
    }
  }

  function openTool(id) {
    const tool = PD.toolMap[id];
    if (!tool) return;
    if (state.open && state.toolId === id) return;
    if (state.running) {
      toast("Wait for the current task to finish before switching tools.", "error");
      return;
    }

    const wasOpen = state.open;
    if (!wasOpen) state.lastFocus = document.activeElement;
    teardownTool();

    state.open = true;
    state.tool = tool;
    state.toolId = id;
    state.files = [];
    state.opts = defaultOptions(tool);
    state.optionFiles = {};
    state.toolState = {};
    state.ctx = {
      files: state.files,
      opts: state.opts,
      optionFiles: state.optionFiles,
      progress,
      state: state.toolState
    };
    state.mounting = false;
    state.mountError = null;
    state.reading = false;

    el.wsName.textContent = tool.name;
    el.wsDesc.textContent = tool.desc;
    el.wsIcon.className = "ws-ico c-" + tool.cat;
    el.wsIcon.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-' + PD.esc(tool.icon) + '"/></svg>';
    document.title = tool.name + " — PDF Loves You";
    if (state.fileInput) {
      state.fileInput.accept = tool.accept || "";
      state.fileInput.multiple = !!tool.multiple;
    }

    if (!wasOpen) {
      document.body.classList.add("ws-open");
      el.ws.hidden = false;
    }
    el.ws.scrollTop = 0;
    el.progress.hidden = true;
    el.progressBar.style.width = "0%";

    renderOptions();
    renderStage();
    updateRun();

    setTimeout(() => {
      if (!state.open) return;
      try { el.wsClose.focus({ preventScroll: true }); } catch (e) {}
    }, 20);
  }

  function teardownTool() {
    state.mountSeq++;
    state.runSeq++;
    state.readSeq++;
    state.previewSeq++;
    state.running = false;
    state.reading = false;
    state.mounting = false;
    state.mountError = null;
    state.results = null;
    state.resultHost = null;
    state.toolState = {};
    clearTimeout(state.progressTimer);
    revokePreview();
    revokeResultUrls();
    if (PD.destroyAllDocs) PD.destroyAllDocs();
    if (el.wsStage) el.wsStage.innerHTML = "";
    if (el.wsOptions) el.wsOptions.innerHTML = "";
    if (el.progress) el.progress.hidden = true;
    if (el.progressBar) el.progressBar.style.width = "0%";
    state.optionEls = {};
    state.files = [];
    state.opts = {};
    state.optionFiles = {};
    state.ctx = null;
    state.tool = null;
    state.toolId = null;
  }

  function requestClose() {
    if (!state.open) return;
    if (state.running) {
      toast("A task is still running. Give it a moment to finish.", "error");
      return;
    }
    closeTool();
    if (toolFromHash()) {
      try {
        history.replaceState(null, "", location.pathname + location.search + "#tools");
      } catch (e) {
        location.hash = "#tools";
      }
    }
  }

  function closeTool() {
    if (!state.open) return;
    const previous = state.lastFocus;
    teardownTool();
    state.open = false;
    document.body.classList.remove("ws-open");
    el.ws.hidden = true;
    document.title = BASE_TITLE;
    closeDrawer();
    try {
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
      else if (el.grid) el.grid.focus({ preventScroll: true });
    } catch (e) {}
  }

  /* ============================================================
     DEFAULTS + OPTIONS
     ============================================================ */
  function defaultFor(option) {
    if (option.value !== undefined) return option.value;
    if (option.type === "checkbox") return false;
    if (option.type === "number" || option.type === "range") return Number(option.min) || 0;
    if (option.type === "select" && option.choices && option.choices.length) return option.choices[0].value;
    return "";
  }

  function defaultOptions(tool) {
    const out = {};
    (tool.options || []).forEach((option) => {
      if (!option.key || option.type === "note" || option.type === "file") return;
      out[option.key] = defaultFor(option);
    });
    return out;
  }

  function makeCtx() {
    if (!state.ctx) return null;
    state.ctx.files = state.files;
    state.ctx.opts = state.opts;
    state.ctx.optionFiles = state.optionFiles;
    state.ctx.progress = progress;
    state.ctx.state = state.toolState;
    return state.ctx;
  }

  function renderOptions() {
    el.wsOptions.innerHTML = "";
    state.optionEls = {};
    const options = state.tool.options || [];
    if (!options.length) {
      const note = document.createElement("div");
      note.className = "opt-note";
      note.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-info"/></svg><span>This tool works with its default settings. Add a file and press the button.</span>';
      el.wsOptions.appendChild(note);
      return;
    }

    options.forEach((option) => {
      const wrap = document.createElement("div");
      wrap.className = "opt";
      wrap.dataset.key = option.key || "";
      wrap.__option = option;
      wrap.hidden = !showIfMatches(option.showIf);
      const entry = { wrap, option, input: null, valueEl: null, statusEl: null };
      if (option.key) state.optionEls[option.key] = entry;

      if (option.type === "note") {
        wrap.innerHTML =
          '<div class="opt-note' +
          (option.warn ? " warn" : "") +
          '"><svg class="ic" aria-hidden="true"><use href="#' +
          (option.warn ? "i-warning" : "i-info") +
          '"/></svg><span>' +
          PD.esc(option.text || "") +
          "</span></div>";
        el.wsOptions.appendChild(wrap);
        return;
      }

      if (option.type === "checkbox") {
        const check = document.createElement("label");
        check.className = "check";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = !!state.opts[option.key];
        input.setAttribute("aria-label", option.label || option.text || option.key);
        const text = document.createElement("span");
        if (option.label) {
          const strong = document.createElement("strong");
          strong.textContent = option.label;
          text.appendChild(strong);
        }
        text.appendChild(document.createTextNode(option.text || ""));
        check.appendChild(input);
        check.appendChild(text);
        wrap.appendChild(check);
        entry.input = input;
        const handle = () => {
          state.opts[option.key] = input.checked;
          optionChanged(option, input.checked);
        };
        input.addEventListener("change", handle);
        el.wsOptions.appendChild(wrap);
        appendHelp(wrap, option);
        return;
      }

      if (option.label) {
        const label = document.createElement("div");
        label.className = "opt-label";
        const name = document.createElement("span");
        name.textContent = option.label;
        label.appendChild(name);
        if (option.type === "range") {
          const value = document.createElement("span");
          value.className = "val";
          value.textContent = PD.fmtNum(state.opts[option.key], 1) + (option.suffix || "");
          label.appendChild(value);
          entry.valueEl = value;
        }
        wrap.appendChild(label);
      }

      let input;
      if (option.type === "select") {
        input = document.createElement("select");
        input.className = "select";
        (option.choices || []).forEach((choice) => {
          const opt = document.createElement("option");
          opt.value = choice.value;
          opt.textContent = choice.label;
          input.appendChild(opt);
        });
        input.value = String(state.opts[option.key]);
      } else if (option.type === "range") {
        input = document.createElement("input");
        input.type = "range";
        input.min = option.min != null ? option.min : 0;
        input.max = option.max != null ? option.max : 100;
        input.step = option.step != null ? option.step : 1;
        input.value = state.opts[option.key];
      } else if (option.type === "number") {
        input = document.createElement("input");
        input.className = "input";
        input.type = "number";
        if (option.min != null) input.min = option.min;
        if (option.max != null) input.max = option.max;
        if (option.step != null) input.step = option.step;
        input.value = state.opts[option.key];
      } else if (option.type === "color") {
        input = document.createElement("input");
        input.type = "color";
        input.value = state.opts[option.key] || "#000000";
      } else if (option.type === "file") {
        input = document.createElement("input");
        input.type = "file";
        if (option.accept) input.accept = option.accept;
      } else {
        input = document.createElement("input");
        input.className = "input";
        input.type = "text";
        input.placeholder = option.placeholder || "";
        input.value = state.opts[option.key] != null ? state.opts[option.key] : "";
      }
      input.setAttribute("aria-label", option.label || option.key);
      if (option.type === "text" && option.placeholder) input.placeholder = option.placeholder;
      entry.input = input;

      if (option.type === "file") {
        const status = document.createElement("div");
        status.className = "opt-help";
        status.textContent = "No file chosen.";
        entry.statusEl = status;
        input.addEventListener("change", () => {
          const file = input.files && input.files[0];
          if (!file) {
            delete state.optionFiles[option.key];
            status.textContent = "No file chosen.";
            invalidateResults();
            return;
          }
          state.optionFiles[option.key] = file;
          status.textContent = file.name + " · " + PD.size(file.size);
          optionChanged(option, file, true);
        });
        wrap.appendChild(input);
        wrap.appendChild(status);
      } else {
        wrap.appendChild(input);
      }

      const readValue = () => {
        if (option.type === "checkbox") return input.checked;
        if (option.type === "number" || option.type === "range") {
          const n = Number(input.value);
          return isFinite(n) ? n : 0;
        }
        return input.value;
      };
      const handle = () => {
        const value = readValue();
        state.opts[option.key] = value;
        if (entry.valueEl) entry.valueEl.textContent = PD.fmtNum(value, 1) + (option.suffix || "");
        optionChanged(option, value);
      };
      const live = option.type === "range" || option.type === "text" || option.type === "number";
      input.addEventListener(live ? "input" : "change", handle);

      el.wsOptions.appendChild(wrap);
      appendHelp(wrap, option);
    });

    updateOptionVisibility();
  }

  function appendHelp(wrap, option) {
    if (!option.help) return;
    const help = document.createElement("div");
    help.className = "opt-help";
    help.textContent = option.help;
    wrap.appendChild(help);
  }

  function showIfMatches(rule) {
    if (!rule || !rule.key) return true;
    const raw = state.opts[rule.key];
    const value = String(raw);
    if (Array.isArray(rule.in)) return rule.in.map(String).indexOf(value) !== -1;
    if (Array.isArray(rule.notIn)) return rule.notIn.map(String).indexOf(value) === -1;
    return true;
  }

  function updateOptionVisibility() {
    $$(".opt", el.wsOptions).forEach((wrap) => {
      wrap.hidden = !showIfMatches(wrap.__option && wrap.__option.showIf);
    });
  }

  function optionChanged(option, value, isFile) {
    updateOptionVisibility();
    invalidateResults();
    if (state.tool && typeof state.tool.onOptionChange === "function") {
      try {
        state.tool.onOptionChange(makeCtx(), option.key, isFile ? value : value);
      } catch (e) {
        /* a preview failing should not break the options panel */
      }
    }
  }

  function disableOptions(disabled) {
    $$("input, select, button", el.wsOptions).forEach((node) => {
      node.disabled = disabled;
    });
  }

  /* ============================================================
     FILE INPUT / STAGE
     ============================================================ */
  function createFileInput() {
    const input = document.createElement("input");
    input.type = "file";
    input.className = "hidden";
    input.setAttribute("aria-hidden", "true");
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      if (input.files && input.files.length) addFiles(input.files);
      input.value = "";
    });
    state.fileInput = input;
  }

  function pickFiles() {
    if (!state.fileInput || !state.tool || state.running) return;
    state.fileInput.accept = state.tool.accept || "";
    state.fileInput.multiple = !!state.tool.multiple;
    state.fileInput.click();
  }

  function acceptsFile(file, accept) {
    if (!accept || accept === "*") return true;
    const name = String(file.name || "").toLowerCase();
    const type = String(file.type || "").toLowerCase();
    return String(accept)
      .split(",")
      .some((raw) => {
        const rule = raw.trim().toLowerCase();
        if (!rule) return false;
        if (rule.startsWith(".")) return name.endsWith(rule);
        if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
        return type === rule;
      });
  }

  function formatAccept(accept) {
    if (!accept || accept === "*") return "Any file";
    return String(accept)
      .split(",")
      .map((raw) => {
        const rule = raw.trim().toLowerCase();
        if (rule === ".pdf") return "PDF";
        if (rule === "image/*") return "JPG · PNG · WEBP · GIF";
        if (rule.startsWith(".")) return rule.slice(1).toUpperCase();
        if (rule.startsWith("image/")) return rule.slice(6).toUpperCase();
        return rule.toUpperCase();
      })
      .join(" · ");
  }

  function badgeFor(name) {
    const ext = PD.ext(name);
    const label = ext ? ext.toUpperCase().slice(0, 4) : "FILE";
    let cls = "pdf";
    if (IMAGE_EXT.indexOf(ext) !== -1) cls = "img";
    else if (ext === "doc" || ext === "docx") cls = "doc";
    else if (ext === "xls" || ext === "xlsx" || ext === "csv") cls = "xls";
    else if (ext === "ppt" || ext === "pptx") cls = "ppt";
    else if (ext === "txt") cls = "txt";
    else if (ext === "zip") cls = "zip";
    return { label, cls };
  }

  function fileMeta(file) {
    const bits = [PD.size(file.size)];
    if (file.pages != null) bits.push(file.pages + " page" + (file.pages === 1 ? "" : "s"));
    if (file.encrypted) bits.push("password-protected");
    return bits.join(" · ");
  }

  async function addFiles(list) {
    if (!state.open || !state.tool) return;
    if (state.running) {
      toast("Wait for the current task to finish first.", "error");
      return;
    }
    if (state.reading) {
      toast("Still reading the previous file — try again in a moment.");
      return;
    }
    const incoming = Array.from(list || []).filter(Boolean);
    if (!incoming.length) return;

    const accepted = [];
    const rejected = [];
    incoming.forEach((file) => {
      if (acceptsFile(file, state.tool.accept)) accepted.push(file);
      else rejected.push(file);
    });
    if (rejected.length) {
      toast(rejected.length + " file" + (rejected.length === 1 ? " was" : "s were") + " skipped — use " + formatAccept(state.tool.accept) + ".", "error");
    }
    if (!accepted.length) return;

    const toolId = state.toolId;
    const chosen = state.tool.multiple ? accepted : accepted.slice(0, 1);
    if (!state.tool.multiple && accepted.length > 1) {
      toast("This tool takes one file at a time — the first was used.");
    }

    const seq = ++state.readSeq;
    state.reading = true;
    updateRun();
    const prepared = [];
    try {
      for (const file of chosen) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let pages = null;
        let encrypted = false;
        if (PD.ext(file.name) === "pdf" || file.type === "application/pdf") {
          const info = await PD.pageCount(bytes);
          pages = info.pages;
          encrypted = info.encrypted;
        }
        if (seq !== state.readSeq || toolId !== state.toolId) return;
        prepared.push({ file, name: file.name, size: file.size, bytes, pages, encrypted });
      }
    } catch (e) {
      if (seq === state.readSeq) toast("One of those files could not be read: " + PD.friendlyError(e), "error");
      return;
    } finally {
      if (seq === state.readSeq) {
        state.reading = false;
        updateRun();
      }
    }
    if (seq !== state.readSeq || toolId !== state.toolId) return;

    if (state.tool.multiple) state.files = state.files.concat(prepared);
    else state.files = prepared;

    refreshStage();
    if (prepared.some((p) => p.encrypted)) {
      toast("One file is password-protected. Use Unlock PDF first, then retry this tool.", "error");
    } else {
      toast(prepared.length + " file" + (prepared.length === 1 ? "" : "s") + " added.");
    }
  }

  function refreshStage() {
    state.mountSeq++;
    state.previewSeq++;
    state.mounting = false;
    state.mountError = null;
    state.resultHost = null;
    state.results = null;
    state.toolState = {};
    if (state.ctx) state.ctx.state = state.toolState;
    revokePreview();
    revokeResultUrls();
    if (PD.destroyAllDocs) PD.destroyAllDocs();
    renderStage();
  }

  function buildDropzone() {
    const dz = document.createElement("div");
    dz.className = "dropzone";
    dz.tabIndex = 0;
    dz.setAttribute("role", "button");
    dz.setAttribute("aria-label", "Choose " + (state.tool.multiple ? "files" : "a file"));
    const isPdf = /\.pdf/i.test(state.tool.accept || "");
    const icon = isPdf ? "upload" : "images";
    const title = state.tool.multiple ? "Drop your files here" : isPdf ? "Drop your PDF here" : "Drop your image here";
    const desc = state.tool.multiple
      ? "Add two or more files — you can reorder them before running the tool."
      : state.tool.interactive
        ? "You'll get a live preview of the first page before anything is saved."
        : "Everything is read straight into this tab. Nothing is uploaded anywhere.";
    dz.innerHTML =
      '<span class="dropz-icon"><svg class="ic" aria-hidden="true"><use href="#i-' +
      icon +
      '"/></svg></span>' +
      "<h3>" +
      PD.esc(title) +
      "</h3><p>" +
      PD.esc(desc) +
      '</p><button class="btn btn-primary btn-sm" type="button">' +
      (state.tool.multiple ? "Choose files" : "Choose file") +
      '</button><p class="dz-formats">' +
      PD.esc(formatAccept(state.tool.accept)) +
      '</p><p class="dropz-privacy"><svg class="ic" aria-hidden="true"><use href="#i-shield"/></svg> Local only · no uploads · no limits</p>';
    dz.addEventListener("click", pickFiles);
    dz.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pickFiles();
      }
    });
    return dz;
  }

  function buildFilesCard() {
    const tool = state.tool;
    const card = document.createElement("div");
    card.className = "files-card";
    const head = document.createElement("div");
    head.className = "files-head";
    const total = state.files.reduce((n, f) => n + f.size, 0);
    head.innerHTML =
      "<h3>" +
      (state.files.length === 1 ? "Your file" : "Your files") +
      '<span class="count">' +
      state.files.length +
      " · " +
      PD.size(total) +
      "</span></h3>";
    const actions = document.createElement("div");
    actions.className = "head-actions";
    const add = document.createElement("button");
    add.className = "btn btn-outline btn-sm";
    add.type = "button";
    add.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-' + (tool.multiple ? "plus" : "refresh") + '"/></svg> ' + (tool.multiple ? "Add more" : "Replace");
    add.addEventListener("click", pickFiles);
    actions.appendChild(add);
    if (state.files.length > 1) {
      const clear = document.createElement("button");
      clear.className = "btn btn-outline btn-sm";
      clear.type = "button";
      clear.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-trash"/></svg> Clear';
      clear.addEventListener("click", () => {
        if (state.running) return;
        state.files = [];
        refreshStage();
      });
      actions.appendChild(clear);
    }
    head.appendChild(actions);
    card.appendChild(head);

    const list = document.createElement("div");
    list.className = "files-list";
    state.files.forEach((file, index) => {
      const row = document.createElement("div");
      row.className = "file-row";
      const badge = badgeFor(file.name);
      const type = document.createElement("span");
      type.className = "file-type " + badge.cls;
      type.textContent = badge.label;
      const info = document.createElement("span");
      info.className = "file-info";
      info.innerHTML = '<span class="file-name"></span><span class="file-meta"></span>';
      info.querySelector(".file-name").textContent = file.name;
      info.querySelector(".file-meta").textContent = fileMeta(file);
      const acts = document.createElement("span");
      acts.className = "file-actions";

      if (tool.multiple && state.files.length > 1) {
        const up = iconButton("arrow-up", "Move up", () => {
          if (state.running || index === 0) return;
          const copy = state.files.slice();
          const tmp = copy[index - 1];
          copy[index - 1] = copy[index];
          copy[index] = tmp;
          state.files = copy;
          refreshStage();
        });
        up.classList.add("reorder");
        up.disabled = index === 0;
        const down = iconButton("arrow-down", "Move down", () => {
          if (state.running || index === state.files.length - 1) return;
          const copy = state.files.slice();
          const tmp = copy[index + 1];
          copy[index + 1] = copy[index];
          copy[index] = tmp;
          state.files = copy;
          refreshStage();
        });
        down.classList.add("reorder");
        down.disabled = index === state.files.length - 1;
        acts.appendChild(up);
        acts.appendChild(down);
      }

      const remove = iconButton("x", "Remove file", () => {
        if (state.running) return;
        state.files = state.files.filter((_, i) => i !== index);
        refreshStage();
      });
      remove.classList.add("danger");
      acts.appendChild(remove);

      row.appendChild(type);
      row.appendChild(info);
      row.appendChild(acts);
      list.appendChild(row);
    });
    card.appendChild(list);

    if (tool.multiple && state.files.length > 1) {
      const hint = document.createElement("p");
      hint.className = "files-hint";
      hint.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-info"/></svg> Order matters. Use the arrows to move a file up or down.';
      card.appendChild(hint);
    }
    return card;
  }

  function iconButton(icon, label, onClick) {
    const button = document.createElement("button");
    button.className = "icon-btn";
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-' + icon + '"/></svg>';
    button.addEventListener("click", onClick);
    return button;
  }

  function renderStage() {
    const tool = state.tool;
    if (!tool) return;
    el.wsStage.innerHTML = "";
    state.resultHost = null;

    if (!state.files.length) {
      el.wsStage.appendChild(buildDropzone());
      updateRun();
      return;
    }

    const stack = document.createElement("div");
    stack.className = "stage-stack";
    stack.appendChild(buildFilesCard());

    if (tool.interactive) {
      const editor = document.createElement("div");
      editor.className = "tool-editor";
      stack.appendChild(editor);
      const resultHost = document.createElement("div");
      resultHost.className = "result-host";
      stack.appendChild(resultHost);
      state.resultHost = resultHost;
      el.wsStage.appendChild(stack);
      mountEditor(editor);
    } else {
      const preview = document.createElement("div");
      preview.className = "preview-card";
      stack.appendChild(preview);
      const resultHost = document.createElement("div");
      resultHost.className = "result-host";
      stack.appendChild(resultHost);
      state.resultHost = resultHost;
      el.wsStage.appendChild(stack);
      renderFilePreview(preview);
    }
    updateRun();
  }

  function renderFilePreview(host) {
    const file = state.files[0];
    if (!file) return;
    const seq = ++state.previewSeq;
    const ext = PD.ext(file.name);
    const isPdf = ext === "pdf" || file.file.type === "application/pdf";
    const isImage = !isPdf && (IMAGE_EXT.indexOf(ext) !== -1 || String(file.file.type || "").startsWith("image/"));

    host.innerHTML =
      '<div class="preview-head"><h3>Preview</h3><span class="preview-meta">' +
      PD.esc(file.name) +
      " · " +
      PD.size(file.size) +
      '</span></div><div class="preview-body"><span class="spinner"></span></div>';
    const body = host.querySelector(".preview-body");

    if (isPdf) {
      (async () => {
        try {
          const doc = await PD.pdfjs(file.bytes);
          if (seq !== state.previewSeq) {
            try { await doc.destroy(); } catch (e) {}
            return;
          }
          const shot = await PD.thumb(doc, 1, 440);
          if (seq !== state.previewSeq) return;
          body.innerHTML = "";
          shot.canvas.className = "preview-canvas";
          body.appendChild(shot.canvas);
          body.insertAdjacentHTML(
            "beforeend",
            '<span class="preview-page">Page 1 of ' + (file.pages || doc.numPages) + "</span>"
          );
        } catch (e) {
          if (seq !== state.previewSeq) return;
          body.innerHTML =
            '<div class="preview-fallback"><svg class="ic" aria-hidden="true"><use href="#i-file"/></svg><span>Preview unavailable' +
            (file.encrypted ? " — this PDF is password-protected." : ".") +
            "</span></div>";
        }
      })();
      return;
    }

    if (isImage) {
      try {
        const url = URL.createObjectURL(file.file);
        if (seq !== state.previewSeq) {
          URL.revokeObjectURL(url);
          return;
        }
        state.previewUrl = url;
        body.innerHTML = "";
        const img = document.createElement("img");
        img.src = url;
        img.alt = file.name;
        body.appendChild(img);
      } catch (e) {
        body.innerHTML = '<div class="preview-fallback"><svg class="ic" aria-hidden="true"><use href="#i-image"/></svg><span>Preview unavailable.</span></div>';
      }
      return;
    }

    body.innerHTML =
      '<div class="preview-fallback"><svg class="ic" aria-hidden="true"><use href="#i-' +
      (badgeFor(file.name).cls === "xls" ? "excel" : badgeFor(file.name).cls === "doc" ? "word" : "file") +
      '"/></svg><span>Ready to process.</span></div>';
  }

  async function mountEditor(host) {
    const seq = ++state.mountSeq;
    state.mounting = true;
    state.mountError = null;
    state.toolState = {};
    if (state.ctx) state.ctx.state = state.toolState;
    updateRun();
    try {
      await state.tool.mount(makeCtx(), host);
      if (seq !== state.mountSeq) return;
    } catch (e) {
      if (seq !== state.mountSeq) return;
      state.mountError = PD.friendlyError(e);
      host.innerHTML =
        '<div class="alert" role="alert"><svg class="ic" aria-hidden="true"><use href="#i-warning"/></svg><div><strong>Preview failed</strong>' +
        PD.esc(state.mountError) +
        "</div></div>";
    } finally {
      if (seq === state.mountSeq) {
        state.mounting = false;
        updateRun();
        hideProgress(350);
      }
    }
  }

  /* ============================================================
     RUN + PROGRESS
     ============================================================ */
  function progress(fraction, label) {
    if (fraction == null) return;
    const value = PD.clamp(Number(fraction) || 0, 0, 1);
    el.progress.hidden = false;
    el.progressBar.style.width = (value * 100).toFixed(1) + "%";
    if (state.running && label) setRunLabel(label);
    if (value >= 1 && !state.running) hideProgress(500);
  }

  function hideProgress(delay) {
    clearTimeout(state.progressTimer);
    state.progressTimer = setTimeout(() => {
      if (state.running) return;
      el.progress.hidden = true;
      el.progressBar.style.width = "0%";
    }, delay == null ? 0 : delay);
  }

  function setRunLabel(text) {
    const span = el.wsRun.querySelector("#wsRunText");
    if (span) span.textContent = text;
  }

  function actionLabel(tool) {
    return RUN_LABELS[tool.id] || "Run " + tool.name;
  }

  function updateRun() {
    if (!el.wsRun) return;
    let label;
    let disabled;
    if (state.running) {
      label = "Working…";
      disabled = true;
    } else if (!state.files.length) {
      label = state.tool && state.tool.multiple ? "Choose files first" : "Choose a file first";
      disabled = true;
    } else if (state.reading) {
      label = "Reading files…";
      disabled = true;
    } else if (state.mounting) {
      label = "Preparing preview…";
      disabled = true;
    } else if (state.mountError) {
      label = "Preview failed — remove the file";
      disabled = true;
    } else if (state.tool && state.tool.minFiles && state.files.length < state.tool.minFiles) {
      const need = state.tool.minFiles - state.files.length;
      label = "Add " + need + " more file" + (need === 1 ? "" : "s");
      disabled = true;
    } else {
      label = actionLabel(state.tool);
      if (state.files.length > 1) label += " (" + state.files.length + ")";
      disabled = false;
    }
    el.wsRun.disabled = disabled;
    el.wsRun.innerHTML =
      (state.running ? '<span class="spinner" aria-hidden="true"></span>' : '<svg class="ic" aria-hidden="true"><use href="#i-download"/></svg>') +
      '<span id="wsRunText">' +
      PD.esc(label) +
      "</span>";
  }

  async function runTool() {
    if (!state.open || !state.tool || state.running || state.reading || state.mounting || state.mountError) return;
    if (!state.files.length) {
      toast("Choose a file first.", "error");
      return;
    }
    if (state.tool.minFiles && state.files.length < state.tool.minFiles) {
      const need = state.tool.minFiles - state.files.length;
      toast("Add " + need + " more file" + (need === 1 ? "" : "s") + " first.", "error");
      return;
    }
    const tool = state.tool;
    const runId = ++state.runSeq;
    clearResult();
    state.running = true;
    disableOptions(true);
    updateRun();
    el.progress.hidden = false;
    el.progressBar.style.width = "0%";
    const docsBefore = new Set((PD.openDocs && Array.from(PD.openDocs)) || []);
    const ctx = makeCtx();

    try {
      const result = await tool.run(ctx);
      if (runId !== state.runSeq || !state.open || state.tool !== tool) return;
      renderResult(result);
      toast("Done — your file" + (state.results && state.results.files.length > 1 ? "s are" : " is") + " ready.");
    } catch (e) {
      if (runId !== state.runSeq || !state.open) return;
      showRunError(PD.friendlyError(e));
      toast(PD.friendlyError(e), "error");
    } finally {
      if (runId === state.runSeq) {
        state.running = false;
        disableOptions(false);
        updateRun();
        el.progressBar.style.width = "100%";
        hideProgress(800);
        cleanupDocsSince(docsBefore);
      }
    }
  }

  function cleanupDocsSince(before) {
    if (!PD.openDocs) return;
    Array.from(PD.openDocs).forEach((doc) => {
      if (before.has(doc)) return;
      try {
        const result = doc.destroy();
        if (result && result.catch) result.catch(() => {});
      } catch (e) {}
    });
  }

  /* ============================================================
     RESULTS
     ============================================================ */
  function clearResult() {
    if (state.resultHost) state.resultHost.innerHTML = "";
    state.results = null;
    revokeResultUrls();
  }

  function invalidateResults() {
    if (state.results || (state.resultHost && state.resultHost.innerHTML)) clearResult();
  }

  function showRunError(message) {
    if (!state.resultHost) return;
    state.results = null;
    state.resultHost.innerHTML =
      '<div class="alert" role="alert"><svg class="ic" aria-hidden="true"><use href="#i-warning"/></svg><div><strong>Couldn’t finish that</strong>' +
      PD.esc(message) +
      "</div></div>";
    try { state.resultHost.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) {}
  }

  function resultFiles(result) {
    if (!result) return [];
    if (Array.isArray(result.files)) return result.files.filter((file) => file && file.blob);
    if (result.blob) return [{ name: result.name || "download", blob: result.blob }];
    if (result instanceof Blob) return [{ name: "download", blob: result }];
    return [];
  }

  function renderResult(result) {
    clearResult();
    const files = resultFiles(result);
    if (!files.length) throw new Error("The tool finished without producing a downloadable file.");
    const zipName = result && result.zipName ? result.zipName : PD.base(files[0].name) + "-files.zip";
    const note = (result && result.note) || "";
    state.results = { files, note, zipName };

    if (!state.resultHost) {
      state.resultHost = document.createElement("div");
      state.resultHost.className = "result-host";
      el.wsStage.appendChild(state.resultHost);
    }

    const card = document.createElement("div");
    card.className = "result-card";
    card.setAttribute("role", "status");

    const shown = files.slice(0, 60);
    let rows = "";
    shown.forEach((file, i) => {
      const badge = badgeFor(file.name);
      rows +=
        '<div class="result-file"><span class="file-type ' +
        badge.cls +
        '">' +
        PD.esc(badge.label) +
        '</span><span class="file-info"><span class="file-name">' +
        PD.esc(file.name) +
        '</span><span class="file-meta">' +
        PD.size(file.blob.size) +
        '</span></span><button class="icon-btn" type="button" data-download="' +
        i +
        '" title="Download ' +
        PD.esc(file.name) +
        '" aria-label="Download ' +
        PD.esc(file.name) +
        '"><svg class="ic" aria-hidden="true"><use href="#i-download"/></svg></button></div>';
    });

    const more =
      files.length > shown.length
        ? '<p class="result-note">Showing ' + shown.length + " of " + files.length + " files. The ZIP download includes all of them.</p>"
        : "";

    card.innerHTML =
      '<div class="result-head"><span class="result-check"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg></span><div><h3>' +
      (files.length === 1 ? "Your file is ready" : files.length + " files are ready") +
      "</h3><p>" +
      PD.esc(files.length === 1 ? files[0].name : "All packed up and ready to download.") +
      '</p></div></div><div class="result-files">' +
      rows +
      "</div>" +
      (files.length === 1 ? '<div class="result-thumb" hidden></div>' : "") +
      '<div class="result-actions">' +
      (files.length === 1
        ? '<button class="btn btn-primary" type="button" data-download="0"><svg class="ic" aria-hidden="true"><use href="#i-download"/></svg> Download file</button>'
        : '<button class="btn btn-primary" type="button" data-zip><svg class="ic" aria-hidden="true"><use href="#i-download"/></svg> Download all (.zip)</button>') +
      '<button class="btn btn-outline" type="button" data-again><svg class="ic" aria-hidden="true"><use href="#i-refresh"/></svg> Start over</button>' +
      '<button class="btn btn-outline" type="button" data-back><svg class="ic" aria-hidden="true"><use href="#i-arrow-left"/></svg> All tools</button>' +
      "</div>" +
      (note ? '<p class="result-note">' + PD.esc(note) + "</p>" : "") +
      more;

    state.resultHost.appendChild(card);

    card.addEventListener("click", async (e) => {
      const download = e.target.closest("[data-download]");
      if (download) {
        const index = Number(download.dataset.download);
        const file = state.results && state.results.files[index];
        if (file) {
          PD.dl(file.blob, file.name);
          toast("Download started.");
        }
        return;
      }
      if (e.target.closest("[data-zip]")) {
        await downloadZip(e.target.closest("[data-zip]"), card);
        return;
      }
      if (e.target.closest("[data-again]")) {
        startOver();
        return;
      }
      if (e.target.closest("[data-back]")) requestClose();
    });

    if (files.length === 1) {
      const slot = card.querySelector(".result-thumb");
      attachResultPreview(slot, files[0], result && result.previewUrl, state.results);
    }

    try { card.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) {}
  }

  function attachResultPreview(slot, file, previewUrl, token) {
    if (!slot || !file) return;
    const ext = PD.ext(file.name);
    const isPdf = ext === "pdf" || file.blob.type === "application/pdf";
    const isImage = IMAGE_EXT.indexOf(ext) !== -1 || String(file.blob.type || "").startsWith("image/");
    if (!isPdf && !isImage) {
      slot.remove();
      return;
    }
    slot.hidden = false;
    slot.innerHTML = '<span class="spinner"></span>';

    if (isImage) {
      let url = previewUrl;
      if (!url) {
        try { url = URL.createObjectURL(file.blob); } catch (e) { slot.remove(); return; }
      }
      state.resultUrls.add(url);
      slot.innerHTML = "";
      const img = document.createElement("img");
      img.src = url;
      img.alt = file.name;
      slot.appendChild(img);
      return;
    }

    setTimeout(async () => {
      if (state.results !== token) return;
      try {
        const doc = await PD.pdfjs(new Uint8Array(await file.blob.arrayBuffer()));
        if (state.results !== token) {
          try { await doc.destroy(); } catch (e) {}
          return;
        }
        const shot = await PD.thumb(doc, 1, 360);
        try { await doc.destroy(); } catch (e) {}
        if (state.results !== token) return;
        slot.innerHTML = "";
        shot.canvas.className = "preview-canvas";
        slot.appendChild(shot.canvas);
      } catch (e) {
        slot.innerHTML = '<span class="result-note">Preview unavailable.</span>';
      }
    }, 60);
  }

  async function downloadZip(button, card) {
    if (!state.results) return;
    if (button.dataset.busy === "1") return;
    const items = state.results.files.map((file) => ({ name: file.name, blob: file.blob }));
    const zipName = state.results.zipName;
    button.dataset.busy = "1";
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span> Packing ZIP…';
    try {
      const blob = await PD.zip(items);
      PD.dl(blob, zipName);
      toast("ZIP download started.");
    } catch (e) {
      toast("Could not create the ZIP: " + PD.friendlyError(e), "error");
    } finally {
      button.dataset.busy = "";
      if (button.isConnected) {
        button.innerHTML = original;
        button.disabled = false;
      }
    }
  }

  function startOver() {
    if (state.running) {
      toast("Wait for the current task to finish first.", "error");
      return;
    }
    state.mountSeq++;
    state.previewSeq++;
    state.mounting = false;
    state.mountError = null;
    state.files = [];
    state.results = null;
    state.resultHost = null;
    state.toolState = {};
    if (state.ctx) state.ctx.state = state.toolState;
    revokePreview();
    revokeResultUrls();
    if (PD.destroyAllDocs) PD.destroyAllDocs();
    el.wsStage.innerHTML = "";
    el.progress.hidden = true;
    el.progressBar.style.width = "0%";
    renderStage();
    updateRun();
    toast("Cleared. Add a new file when you’re ready.");
  }

  function revokePreview() {
    if (!state.previewUrl) return;
    try { URL.revokeObjectURL(state.previewUrl); } catch (e) {}
    state.previewUrl = null;
  }

  function revokeResultUrls() {
    state.resultUrls.forEach((url) => {
      try { URL.revokeObjectURL(url); } catch (e) {}
    });
    state.resultUrls.clear();
  }

  /* ============================================================
     START
     ============================================================ */
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
