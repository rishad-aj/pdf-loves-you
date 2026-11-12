/* ============================================================
   PDF Loves You — shared helpers and engine plumbing
   ============================================================ */
(function () {
  "use strict";

  const PD = (window.PD = window.PD || {});
  const PDFLib = window.PDFLib || {};
  const { PDFDocument, StandardFonts, rgb, degrees, PDFName, PDFString } = PDFLib;

  PD.PDFDocument = PDFDocument;
  PD.StandardFonts = StandardFonts;
  PD.rgb = rgb;
  PD.degrees = degrees;

  PD.tools = [];
  PD.toolMap = {};

  PD.registerTool = function (tool) {
    if (!tool || !tool.id) throw new Error("Tool needs an id");
    PD.tools.push(tool);
    PD.toolMap[tool.id] = tool;
  };

  /* ---------- pdf.js ---------- */
  const pdfjsLib = window.pdfjsLib;
  const baseHref = (function () {
    try { return new URL("./", document.baseURI).href; } catch (e) { return ""; }
  })();

  if (pdfjsLib) {
    if (location.protocol === "file:" && window.__PDFJS_WORKER_URL__) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = window.__PDFJS_WORKER_URL__;
    } else {
      pdfjsLib.GlobalWorkerOptions.workerSrc = baseHref + "vendor/pdf.worker.min.js";
    }
  }

  PD.pdfjs = async function (bytes, password) {
    if (!pdfjsLib) throw new Error("The PDF rendering engine did not load.");
    const params = {
      data: new Uint8Array(bytes),
      cMapUrl: baseHref + "vendor/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: baseHref + "vendor/standard_fonts/",
      useSystemFonts: true,
      isEvalSupported: false
    };
    if (password !== undefined) params.password = password;
    const doc = await pdfjsLib.getDocument(params).promise;
    PD.openDocs.add(doc);
    const originalDestroy = doc.destroy.bind(doc);
    doc.destroy = function () {
      PD.openDocs.delete(doc);
      return originalDestroy();
    };
    return doc;
  };

  /* Track open PDF.js documents so the UI can release them promptly. */
  PD.openDocs = PD.openDocs || new Set();
  PD.destroyAllDocs = async function () {
    const docs = Array.from(PD.openDocs);
    PD.openDocs.clear();
    await Promise.all(
      docs.map((doc) => {
        try {
          const result = doc.destroy();
          return result && result.catch ? result.catch(() => {}) : result;
        } catch (e) {
          return Promise.resolve();
        }
      })
    );
  };

  /* ---------- tiny utilities ---------- */
  PD.tick = () => new Promise((r) => setTimeout(r, 0));
  PD.uid = () => Math.random().toString(36).slice(2, 9);
  PD.clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  PD.fmtNum = (n, d = 1) => {
    const v = Number(n);
    if (!isFinite(v)) return "0";
    return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toString();
  };
  PD.esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  PD.uidName = () => "pdf-loves-you-" + Date.now().toString(36) + "-" + PD.uid();

  PD.size = function (bytes) {
    if (bytes == null) return "0 B";
    let n = typeof bytes === "number" ? bytes : bytes.size != null ? bytes.size : bytes.length || 0;
    if (!n) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    const v = n / Math.pow(1024, i);
    return (i === 0 ? v.toFixed(0) : v.toFixed(v >= 10 ? 1 : 2)) + " " + units[i];
  };

  PD.ext = (name) => {
    const s = String(name || "");
    const i = s.lastIndexOf(".");
    return i > 0 ? s.slice(i + 1).toLowerCase() : "";
  };
  PD.base = (name) => String(name || "document").replace(/\.[^.]+$/, "") || "document";
  PD.safe = (name) =>
    String(name || "file")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "file";
  PD.withExt = (name, ext) => {
    const b = PD.base(name);
    return PD.safe(b) + (ext ? "." + ext.replace(/^\./, "") : "");
  };

  PD.color = function (hex) {
    const s = String(hex || "#000000").replace("#", "");
    const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
    const n = parseInt(full, 16);
    if (!isFinite(n)) return rgb(0, 0, 0);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  };

  /* ---------- page ranges ---------- */
  PD.ranges = function (input, count, fallbackAll = true) {
    const str = String(input == null ? "" : input).trim();
    if (!str) {
      if (!fallbackAll) return [];
      return Array.from({ length: count }, (_, i) => i);
    }
    const out = new Set();
    for (const raw of str.split(/[,;\s]+/)) {
      if (!raw) continue;
      const m = raw.match(/^(\d+)(?:\s*-\s*(\d+)?)?$/);
      if (!m) throw new Error('Could not read "' + raw + '". Use page numbers or ranges like 1-3, 5, 8-.');
      let a = parseInt(m[1], 10);
      let b = m[2] ? parseInt(m[2], 10) : raw.includes("-") ? count : a;
      if (!a || !b) throw new Error("Page numbers start at 1.");
      if (a > b) {
        const t = a;
        a = b;
        b = t;
      }
      if (a < 1 || b > count) {
        throw new Error("Page " + (a > count ? a : b) + " does not exist — this document has " + count + " page" + (count === 1 ? "" : "s") + ".");
      }
      for (let i = a; i <= b; i++) out.add(i - 1);
    }
    if (!out.size) throw new Error("No pages selected.");
    return Array.from(out).sort((x, y) => x - y);
  };

  PD.rangeText = function (indices) {
    const arr = indices.slice().sort((a, b) => a - b);
    const parts = [];
    let start = null;
    let prev = null;
    for (const i of arr) {
      if (start === null) {
        start = prev = i;
        continue;
      }
      if (i === prev + 1) {
        prev = i;
        continue;
      }
      parts.push(start === prev ? String(start + 1) : start + 1 + "-" + (prev + 1));
      start = prev = i;
    }
    if (start !== null) parts.push(start === prev ? String(start + 1) : start + 1 + "-" + (prev + 1));
    return parts.join(", ");
  };

  /* ---------- pdf-lib wrappers ---------- */
  PD.create = () => PDFDocument.create();
  PD.load = (bytes, opts) =>
    PDFDocument.load(bytes, Object.assign({ updateMetadata: false, throwOnInvalidObject: false }, opts || {}));
  PD.save = (doc, opts) => doc.save(Object.assign({ useObjectStreams: true, addDefaultPage: false }, opts || {}));
  PD.pdfBlob = async function (doc, opts) {
    const bytes = await PD.save(doc, opts);
    return new Blob([bytes], { type: "application/pdf" });
  };
  PD.bytesToBlob = (bytes, type) => new Blob([bytes], { type: type || "application/octet-stream" });
  PD.dataURLBytes = function (dataURL) {
    const base64 = String(dataURL).split(",")[1] || "";
    const bin = atob(base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  PD.pageCount = async function (bytes) {
    try {
      const doc = await PD.load(bytes, { ignoreEncryption: true });
      return { pages: doc.getPageCount(), encrypted: doc.isEncrypted };
    } catch (e) {
      return { pages: null, encrypted: false };
    }
  };

  PD.copyPage = async function (out, src, index) {
    const [page] = await out.copyPages(src, [index]);
    return out.addPage(page);
  };

  /* ---------- downloads / zip ---------- */
  PD.dl = function (blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = PD.safe(name || "download");
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  PD.uniqueName = function (name, used) {
    const set = used || new Set();
    let candidate = PD.safe(name);
    if (!set.has(candidate)) {
      set.add(candidate);
      return candidate;
    }
    const ext = PD.ext(candidate);
    const base = ext ? candidate.slice(0, -(ext.length + 1)) : candidate;
    let i = 2;
    while (set.has(base + " (" + i + ")" + (ext ? "." + ext : ""))) i++;
    candidate = base + " (" + i + ")" + (ext ? "." + ext : "");
    set.add(candidate);
    return candidate;
  };

  PD.zip = async function (items, opts) {
    if (!window.JSZip) throw new Error("The ZIP engine did not load.");
    const zip = new JSZip();
    const used = new Set();
    for (const it of items) {
      const name = PD.uniqueName(it.name, used);
      zip.file(name, it.blob);
    }
    return zip.generateAsync(
      Object.assign({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }, opts || {})
    );
  };

  PD.ensureExt = (name, ext) => {
    const e = PD.ext(name);
    return e ? name : name + "." + ext;
  };

  /* ---------- canvas ---------- */
  PD.canvasBlob = function (canvas, type, quality) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Could not encode this page as an image."))),
          type || "image/jpeg",
          quality == null ? 0.85 : quality
        );
      } catch (e) {
        reject(e);
      }
    });
  };

  PD.renderPage = async function (page, scale, format, quality) {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext("2d", { alpha: format !== "image/jpeg" });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await PD.canvasBlob(canvas, format || "image/png", quality);
    return { canvas, blob, width: canvas.width, height: canvas.height };
  };

  PD.thumb = async function (pdfDoc, pageNumber, maxWidth) {
    const page = await pdfDoc.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1.4, (maxWidth || 150) / base.width);
    return PD.renderPage(page, scale, "image/jpeg", 0.72);
  };

  PD.loadImage = function (src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That image could not be opened."));
      img.src = src;
    });
  };

  PD.normalizeImage = async function (blob, opts) {
    const options = Object.assign({ maxDim: 6000, quality: 0.92, background: "#ffffff" }, opts || {});
    let source;
    let width;
    let height;
    try {
      source = await createImageBitmap(blob, { imageOrientation: "from-image" });
      width = source.width;
      height = source.height;
    } catch (e) {
      const url = URL.createObjectURL(blob);
      try {
        source = await PD.loadImage(url);
        width = source.naturalWidth || source.width;
        height = source.naturalHeight || source.height;
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    }
    const ratio = Math.min(1, options.maxDim / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    if (source.close) source.close();
    const out = await PD.canvasBlob(canvas, "image/jpeg", options.quality);
    return { blob: out, width: canvas.width, height: canvas.height, dataURL: canvas.toDataURL("image/jpeg", options.quality) };
  };

  /* ---------- page view (editor canvas) ---------- */
  PD.PageView = class {
    constructor(host) {
      this.host = host;
      this.doc = null;
      this.pageNo = 1;
      this.seq = 0;
      this.canvas = null;
      this.wrap = null;
      this.layer = null;
      this.viewport = null;
    }

    async open(bytes, password) {
      this.doc = await PD.pdfjs(bytes, password);
      return this;
    }

    get pages() {
      return this.doc ? this.doc.numPages : 0;
    }

    async show(n, opts) {
      if (!this.doc) throw new Error("No document loaded.");
      const options = Object.assign({ maxWidth: 720, scaleCap: 2 }, opts || {});
      const pageNo = PD.clamp(n || 1, 1, this.pages);
      const seq = ++this.seq;
      const hostWidth = this.host.clientWidth || options.maxWidth;
      const avail = Math.max(260, Math.min(options.maxWidth, hostWidth - 44));
      this.pageNo = pageNo;

      this.host.innerHTML = '<div class="page-loading"><span class="spinner"></span><span>Rendering page…</span></div>';
      const page = await this.doc.getPage(pageNo);
      if (seq !== this.seq) return this;
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(options.scaleCap, Math.max(0.35, avail / base.width));
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (seq !== this.seq) return this;

      const wrap = document.createElement("div");
      wrap.className = "page-wrap";
      wrap.style.maxWidth = Math.round(viewport.width) + "px";
      wrap.appendChild(canvas);
      const layer = document.createElement("div");
      layer.className = "page-layer";
      wrap.appendChild(layer);
      this.host.innerHTML = "";
      this.host.appendChild(wrap);

      this.page = page;
      this.canvas = canvas;
      this.wrap = wrap;
      this.layer = layer;
      this.viewport = viewport;
      this.scale = scale;
      this.width = viewport.width;
      this.height = viewport.height;
      return this;
    }

    point(e) {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: PD.clamp((e.clientX - r.left) / r.width, 0, 1),
        y: PD.clamp((e.clientY - r.top) / r.height, 0, 1)
      };
    }

    toPdf(x, y) {
      const p = this.viewport.convertToPdfPoint(x * this.width, y * this.height);
      return { x: p[0], y: p[1] };
    }
  };

  /* ---------- misc ---------- */
  PD.friendlyError = function (err) {
    let msg = String((err && err.message) || err || "Something went wrong.");
    if (/encrypted/i.test(msg)) {
      return "This PDF is password-protected. Open “Unlock PDF” first to make an unprotected copy, then try this tool again.";
    }
    if (/incorrect password|password/i.test(msg) && /pdf/i.test(msg)) {
      return "The password is incorrect. Check it and try again.";
    }
    if (/no password given/i.test(msg)) {
      return "This PDF needs a password. Use “Unlock PDF” and enter the password first.";
    }
    if (/invalid pdf|failed to parse|structure|parse document/i.test(msg)) {
      return "This file could not be read as a PDF. If it is damaged, try “Repair PDF” first.";
    }
    if (/image/i.test(msg) && /could not|failed|unsupported/i.test(msg)) {
      return "One of the images could not be decoded. Try JPG or PNG instead.";
    }
    if (/out of memory|allocation/i.test(msg)) {
      return "The file is too large for your browser's memory. Try a smaller file or close other tabs.";
    }
    return msg;
  };

  PD.confirmLeave = function (message) {
    if (!window.__PD_DIRTY__) return true;
    return window.confirm(message || "Discard the current work?");
  };
})();
