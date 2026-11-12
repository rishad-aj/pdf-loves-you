/* ============================================================
   Edit tools — page numbers, watermark, crop, redact, sign, text
   ============================================================ */
(function () {
  "use strict";
  const PD = window.PD;

  const POSITIONS = [
    { value: "bottom-center", label: "Bottom center" },
    { value: "bottom-right", label: "Bottom right" },
    { value: "bottom-left", label: "Bottom left" },
    { value: "top-center", label: "Top center" },
    { value: "top-right", label: "Top right" },
    { value: "top-left", label: "Top left" }
  ];

  function navHtml() {
    return (
      '<div class="page-nav">' +
      '<button type="button" data-nav="-1" aria-label="Previous page"><svg class="ic"><use href="#i-arrow-left"/></svg></button>' +
      '<span class="pageno">1 / 1</span>' +
      '<button type="button" data-nav="1" aria-label="Next page"><svg class="ic"><use href="#i-arrow-right"/></svg></button>' +
      "</div>"
    );
  }

  function bindNav(stage, pv, onChange) {
    const prev = stage.querySelector('[data-nav="-1"]');
    const next = stage.querySelector('[data-nav="1"]');
    const label = stage.querySelector(".pageno");
    const update = () => {
      label.textContent = pv.pageNo + " / " + pv.pages;
      prev.disabled = pv.pageNo <= 1;
      next.disabled = pv.pageNo >= pv.pages;
    };
    prev.addEventListener("click", () => onChange(pv.pageNo - 1));
    next.addEventListener("click", () => onChange(pv.pageNo + 1));
    update();
    return update;
  }

  function toast(msg, type) {
    if (window.PDUI && window.PDUI.toast) window.PDUI.toast(msg, type);
  }

  /* ------------------------------------------------------------
     PAGE NUMBERS
     ------------------------------------------------------------ */
  PD.registerTool({
    id: "page-numbers",
    name: "Page numbers",
    desc: "Stamp clean page numbers anywhere on the page.",
    cat: "edit",
    icon: "numbers",
    accept: ".pdf",
    multiple: false,
    tag: "PDF",
    options: [
      { key: "position", label: "Position", type: "select", value: "bottom-center", choices: POSITIONS },
      {
        key: "format",
        label: "Format",
        type: "select",
        value: "n",
        choices: [
          { value: "n", label: "1" },
          { value: "n/N", label: "1 / 10" },
          { value: "pageN", label: "Page 1" },
          { value: "pageNofN", label: "Page 1 of 10" }
        ]
      },
      { key: "start", label: "Start at", type: "number", value: 1, min: 1, max: 99999 },
      { key: "size", label: "Font size", type: "range", value: 11, min: 6, max: 36, step: 1, suffix: "pt" },
      { key: "margin", label: "Margin", type: "range", value: 28, min: 8, max: 90, step: 1, suffix: "pt" },
      { key: "color", label: "Colour", type: "color", value: "#3d3d3d" },
      { key: "pages", label: "Pages", type: "text", value: "", placeholder: "All pages — or e.g. 1-5" }
    ],
    async run(ctx) {
      const doc = await PD.load(ctx.files[0].bytes);
      const font = await doc.embedFont(PD.StandardFonts.Helvetica);
      const count = doc.getPageCount();
      const indices = PD.ranges(ctx.opts.pages, count);
      const format = String(ctx.opts.format || "n");
      const start = Math.max(1, Number(ctx.opts.start) || 1);
      const size = Math.max(6, Number(ctx.opts.size) || 11);
      const margin = Math.max(0, Number(ctx.opts.margin) || 28);
      const color = PD.color(ctx.opts.color || "#3d3d3d");
      const last = start + indices.length - 1;
      let n = start;
      for (const idx of indices) {
        const page = doc.getPage(idx);
        const { width, height } = page.getSize();
        let label;
        if (format === "n/N") label = n + " / " + last;
        else if (format === "pageN") label = "Page " + n;
        else if (format === "pageNofN") label = "Page " + n + " of " + last;
        else label = String(n);
        const tw = font.widthOfTextAtSize(label, size);
        const pos = ctx.opts.position || "bottom-center";
        let x = (width - tw) / 2;
        let y = margin;
        if (pos.endsWith("left")) x = margin;
        if (pos.endsWith("right")) x = width - margin - tw;
        if (pos.startsWith("top")) y = height - margin - size;
        page.drawText(label, { x, y, size, font, color });
        n++;
        ctx.progress((n - start) / indices.length, "Numbering pages…");
      }
      return {
        name: PD.base(ctx.files[0].name) + "-numbered.pdf",
        blob: await PD.pdfBlob(doc),
        note: "Numbers added to " + indices.length + " page" + (indices.length === 1 ? "" : "s") + "."
      };
    }
  });

  /* ------------------------------------------------------------
     WATERMARK
     ------------------------------------------------------------ */
  const WM_POSITIONS = [
    { value: "center", label: "Center" },
    { value: "tiled", label: "Tiled across the page" },
    { value: "top-left", label: "Top left" },
    { value: "top-right", label: "Top right" },
    { value: "bottom-left", label: "Bottom left" },
    { value: "bottom-right", label: "Bottom right" }
  ];

  PD.registerTool({
    id: "watermark",
    name: "Watermark PDF",
    desc: "Stamp text or a logo over every page, with full control.",
    cat: "edit",
    icon: "watermark",
    accept: ".pdf",
    multiple: false,
    tag: "PDF",
    options: [
      {
        key: "kind",
        label: "Watermark type",
        type: "select",
        value: "text",
        choices: [
          { value: "text", label: "Text" },
          { value: "image", label: "Image / logo" }
        ]
      },
      { key: "text", label: "Text", type: "text", value: "CONFIDENTIAL", showIf: { key: "kind", in: ["text"] } },
      { key: "image", label: "Image file", type: "file", accept: "image/png,image/jpeg", showIf: { key: "kind", in: ["image"] }, help: "PNG (with transparency) or JPG." },
      {
        key: "position",
        label: "Position",
        type: "select",
        value: "center",
        choices: WM_POSITIONS
      },
      { key: "opacity", label: "Opacity", type: "range", value: 18, min: 3, max: 100, step: 1, suffix: "%" },
      { key: "size", label: "Size", type: "range", value: 58, min: 8, max: 160, step: 1, suffix: "pt", showIf: { key: "kind", in: ["text"] } },
      { key: "scale", label: "Image width", type: "range", value: 35, min: 5, max: 100, step: 1, suffix: "%", showIf: { key: "kind", in: ["image"] } },
      { key: "angle", label: "Rotation", type: "range", value: 45, min: -90, max: 90, step: 1, suffix: "°", showIf: { key: "position", notIn: ["tiled"] } },
      { key: "color", label: "Colour", type: "color", value: "#f31260", showIf: { key: "kind", in: ["text"] } }
    ],
    async run(ctx) {
      const doc = await PD.load(ctx.files[0].bytes);
      const opacity = Math.max(0.03, Math.min(1, (Number(ctx.opts.opacity) || 18) / 100));
      const angle = Number(ctx.opts.angle) || 0;
      const kind = ctx.opts.kind === "image" ? "image" : "text";
      let font;
      let embedded;
      if (kind === "text") {
        font = await doc.embedFont(PD.StandardFonts.HelveticaBold);
      } else {
        const file = ctx.optionFiles.image;
        if (!file) throw new Error("Choose a PNG or JPG to use as the watermark.");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const isPng = /png$/i.test(file.name) || file.type === "image/png";
        embedded = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      }
      const color = PD.color(ctx.opts.color || "#f31260");
      const size = Math.max(8, Number(ctx.opts.size) || 58);
      const position = ctx.opts.position || "center";
      const text = String(ctx.opts.text || "CONFIDENTIAL");
      const pages = doc.getPages();

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const { width, height } = page.getSize();
        if (kind === "text") {
          const tw = font.widthOfTextAtSize(text, size);
          const th = font.heightAtSize(size);
          if (position === "tiled") {
            const stepX = tw + 70;
            const stepY = th + 90;
            for (let y = 40; y < height; y += stepY) {
              for (let x = -20; x < width + stepX; x += stepX) {
                page.drawText(text, { x, y, size, font, color, opacity });
              }
            }
          } else {
            const pos = positionPoint(position, width, height, tw, th, 40);
            const rad = (angle * Math.PI) / 180;
            const cx = pos.x + tw / 2;
            const cy = pos.y + th / 2;
            const x = cx - (tw / 2) * Math.cos(rad) + (th / 2) * Math.sin(rad);
            const y = cy - (tw / 2) * Math.sin(rad) - (th / 2) * Math.cos(rad);
            page.drawText(text, { x, y, size, font, color, opacity, rotate: PD.degrees(angle) });
          }
        } else {
          const imgW = (width * Math.max(5, Math.min(100, Number(ctx.opts.scale) || 35))) / 100;
          const imgH = (imgW * embedded.height) / embedded.width;
          if (position === "tiled") {
            const stepX = imgW + 40;
            const stepY = imgH + 50;
            for (let y = 20; y < height; y += stepY) {
              for (let x = -10; x < width; x += stepX) {
                page.drawImage(embedded, { x, y, width: imgW, height: imgH, opacity });
              }
            }
          } else {
            const pos = positionPoint(position, width, height, imgW, imgH, 36);
            const rad = (angle * Math.PI) / 180;
            const cx = pos.x + imgW / 2;
            const cy = pos.y + imgH / 2;
            const x = cx - (imgW / 2) * Math.cos(rad) + (imgH / 2) * Math.sin(rad);
            const y = cy - (imgW / 2) * Math.sin(rad) - (imgH / 2) * Math.cos(rad);
            page.drawImage(embedded, { x, y, width: imgW, height: imgH, opacity, rotate: PD.degrees(angle) });
          }
        }
        ctx.progress((i + 1) / pages.length, "Watermarking page " + (i + 1) + "…");
        if (i % 10 === 0) await PD.tick();
      }
      return {
        name: PD.base(ctx.files[0].name) + "-watermarked.pdf",
        blob: await PD.pdfBlob(doc),
        note: kind === "text" ? "Text watermark applied to " + pages.length + " pages." : "Logo watermark applied to " + pages.length + " pages."
      };
    }
  });

  function positionPoint(position, pw, ph, w, h, pad) {
    switch (position) {
      case "top-left":
        return { x: pad, y: ph - pad - h };
      case "top-center":
        return { x: (pw - w) / 2, y: ph - pad - h };
      case "top-right":
        return { x: pw - pad - w, y: ph - pad - h };
      case "bottom-left":
        return { x: pad, y: pad };
      case "bottom-center":
        return { x: (pw - w) / 2, y: pad };
      case "bottom-right":
        return { x: pw - pad - w, y: pad };
      case "middle-left":
        return { x: pad, y: (ph - h) / 2 };
      case "middle-right":
        return { x: pw - pad - w, y: (ph - h) / 2 };
      default:
        return { x: (pw - w) / 2, y: (ph - h) / 2 };
    }
  }

  /* ------------------------------------------------------------
     CROP
     ------------------------------------------------------------ */
  PD.registerTool({
    id: "crop",
    name: "Crop PDF",
    desc: "Trim margins visually and keep only the area you need.",
    cat: "edit",
    icon: "crop",
    accept: ".pdf",
    multiple: false,
    tag: "PDF",
    interactive: true,
    options: [
      { key: "top", label: "Crop from top", type: "range", value: 0, min: 0, max: 40, step: 1, suffix: "%" },
      { key: "right", label: "Crop from right", type: "range", value: 0, min: 0, max: 40, step: 1, suffix: "%" },
      { key: "bottom", label: "Crop from bottom", type: "range", value: 0, min: 0, max: 40, step: 1, suffix: "%" },
      { key: "left", label: "Crop from left", type: "range", value: 0, min: 0, max: 40, step: 1, suffix: "%" },
      { type: "note", text: "The preview shows the visible area. The crop is applied to every page." }
    ],
    async mount(ctx, stage) {
      stage.innerHTML =
        '<div class="editor">' +
        '<div class="editor-bar"><div class="left"><span class="label">Crop preview</span></div><div class="right">' + navHtml() + "</div></div>" +
        '<div class="page-stage" id="cropStage"></div>' +
        '<p class="org-hint"><svg class="ic"><use href="#i-info"/></svg> Adjust the sliders in the options panel to set the margins.</p>' +
        "</div>";
      const host = stage.querySelector("#cropStage");
      const pv = new PD.PageView(host);
      await pv.open(ctx.files[0].bytes);
      ctx.state.pv = pv;
      let pageNo = 1;

      const overlay = () => {
        if (!pv.wrap) return;
        const old = pv.wrap.querySelector(".crop-visual");
        if (old) old.remove();
        const l = PD.clamp(Number(ctx.opts.left) || 0, 0, 44);
        const r = PD.clamp(Number(ctx.opts.right) || 0, 0, 44);
        const t = PD.clamp(Number(ctx.opts.top) || 0, 0, 44);
        const b = PD.clamp(Number(ctx.opts.bottom) || 0, 0, 44);
        const vis = document.createElement("div");
        vis.className = "crop-visual";
        vis.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:2";
        const box = document.createElement("div");
        box.className = "crop-shade";
        box.style.left = l + "%";
        box.style.top = t + "%";
        box.style.width = Math.max(2, 100 - l - r) + "%";
        box.style.height = Math.max(2, 100 - t - b) + "%";
        vis.appendChild(box);
        pv.wrap.appendChild(vis);
      };

      const show = async (n) => {
        await pv.show(n);
        pageNo = pv.pageNo;
        ctx.state.page = pageNo;
        overlay();
        update();
      };
      const update = bindNav(stage, pv, (n) => show(PD.clamp(n, 1, pv.pages)));
      await show(1);
      ctx.state.updateOverlay = overlay;
      ctx.state.page = pageNo;
    },
    onOptionChange(ctx) {
      if (ctx.state.updateOverlay) ctx.state.updateOverlay();
    },
    async run(ctx) {
      const doc = await PD.load(ctx.files[0].bytes);
      const pdfjs = ctx.state.pv ? ctx.state.pv.doc : await PD.pdfjs(ctx.files[0].bytes);
      const l = PD.clamp((Number(ctx.opts.left) || 0) / 100, 0, 0.44);
      const r = PD.clamp((Number(ctx.opts.right) || 0) / 100, 0, 0.44);
      const t = PD.clamp((Number(ctx.opts.top) || 0) / 100, 0, 0.44);
      const b = PD.clamp((Number(ctx.opts.bottom) || 0) / 100, 0, 0.44);
      if (l + r >= 0.98 || t + b >= 0.98) throw new Error("Those margins would remove the whole page. Reduce them a little.");
      const count = doc.getPageCount();
      for (let i = 0; i < count; i++) {
        const jsPage = await pdfjs.getPage(i + 1);
        const vp = jsPage.getViewport({ scale: 1 });
        const p1 = vp.convertToPdfPoint(l * vp.width, t * vp.height);
        const p2 = vp.convertToPdfPoint((1 - r) * vp.width, (1 - b) * vp.height);
        const x = Math.min(p1[0], p2[0]);
        const y = Math.min(p1[1], p2[1]);
        const w = Math.abs(p2[0] - p1[0]);
        const h = Math.abs(p2[1] - p1[1]);
        doc.getPage(i).setCropBox(x, y, w, h);
        ctx.progress((i + 1) / count, "Cropping page " + (i + 1) + "…");
        if (i % 10 === 0) await PD.tick();
      }
      return {
        name: PD.base(ctx.files[0].name) + "-cropped.pdf",
        blob: await PD.pdfBlob(doc),
        note: "The CropBox was set on all " + count + " pages. Content outside it is hidden, not deleted."
      };
    }
  });

  /* ------------------------------------------------------------
     REDACT
     ------------------------------------------------------------ */
  PD.registerTool({
    id: "redact",
    name: "Redact PDF",
    desc: "Black out sensitive content and permanently remove it.",
    cat: "edit",
    icon: "redact",
    accept: ".pdf",
    multiple: false,
    tag: "PDF",
    interactive: true,
    options: [
      { type: "note", warn: true, text: "This flattens every page to an image, so hidden text is genuinely gone. The output is not searchable." },
      { type: "note", text: "Drag a rectangle over anything you want removed. Use the buttons above the page to undo." }
    ],
    async mount(ctx, stage) {
      stage.innerHTML =
        '<div class="editor">' +
        '<div class="editor-bar"><div class="left"><span class="label" id="redactCount">No redactions yet</span></div>' +
        '<div class="right"><button class="btn btn-outline btn-sm" id="redactUndo" type="button"><svg class="ic"><use href="#i-refresh"/></svg> Undo</button>' +
        '<button class="btn btn-outline btn-sm" id="redactClear" type="button"><svg class="ic"><use href="#i-trash"/></svg> Clear page</button>' +
        navHtml() + "</div></div>" +
        '<div class="page-stage" id="redactStage"></div>' +
        '<p class="org-hint"><svg class="ic"><use href="#i-info"/></svg> Draw boxes on the page. The exported PDF will contain no underlying text.</p>' +
        "</div>";
      const host = stage.querySelector("#redactStage");
      const pv = new PD.PageView(host);
      await pv.open(ctx.files[0].bytes);
      ctx.state.pv = pv;
      ctx.state.boxes = {};
      const state = ctx.state;

      const countBoxes = () => Object.values(state.boxes).reduce((n, arr) => n + arr.length, 0);
      const refreshCount = () => {
        const n = countBoxes();
        stage.querySelector("#redactCount").textContent = n ? n + " redaction" + (n === 1 ? "" : "s") + " marked" : "No redactions yet";
      };

      const render = () => {
        if (!pv.layer) return;
        pv.layer.querySelectorAll(".redact-box").forEach((el) => el.remove());
        const boxes = state.boxes[pv.pageNo] || [];
        for (const box of boxes) {
          const el = document.createElement("div");
          el.className = "redact-box";
          el.style.left = box.x * 100 + "%";
          el.style.top = box.y * 100 + "%";
          el.style.width = box.w * 100 + "%";
          el.style.height = box.h * 100 + "%";
          pv.layer.appendChild(el);
        }
        refreshCount();
      };

      const bind = () => {
        const layer = pv.layer;
        if (!layer) return;
        layer.addEventListener("pointerdown", (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          const start = pv.point(e);
          const node = document.createElement("div");
          node.className = "redact-box";
          node.style.left = start.x * 100 + "%";
          node.style.top = start.y * 100 + "%";
          node.style.width = "0%";
          node.style.height = "0%";
          layer.appendChild(node);
          let last = start;
          const move = (ev) => {
            const p = pv.point(ev);
            last = p;
            const x = Math.min(start.x, p.x);
            const y = Math.min(start.y, p.y);
            node.style.left = x * 100 + "%";
            node.style.top = y * 100 + "%";
            node.style.width = Math.abs(p.x - start.x) * 100 + "%";
            node.style.height = Math.abs(p.y - start.y) * 100 + "%";
          };
          const up = () => {
            window.removeEventListener("pointermove", move);
            const x = Math.min(start.x, last.x);
            const y = Math.min(start.y, last.y);
            const w = Math.abs(last.x - start.x);
            const h = Math.abs(last.y - start.y);
            node.remove();
            if (w > 0.006 && h > 0.006) {
              (state.boxes[pv.pageNo] || (state.boxes[pv.pageNo] = [])).push({ x, y, w, h });
            }
            render();
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up, { once: true });
        });
        render();
      };

      const show = async (n) => {
        await pv.show(n);
        bind();
        update();
        ctx.state.page = pv.pageNo;
      };
      const update = bindNav(stage, pv, (n) => show(PD.clamp(n, 1, pv.pages)));
      await show(1);

      stage.querySelector("#redactUndo").addEventListener("click", () => {
        const arr = state.boxes[pv.pageNo];
        if (arr && arr.length) {
          arr.pop();
          render();
          toast("Last redaction removed.");
        } else {
          toast("Nothing to undo on this page.");
        }
      });
      stage.querySelector("#redactClear").addEventListener("click", () => {
        state.boxes[pv.pageNo] = [];
        render();
      });
    },
    async run(ctx) {
      const count = Object.values(ctx.state.boxes || {}).reduce((n, a) => n + a.length, 0);
      if (!count) throw new Error("Draw at least one black box on the page first.");
      const pdfjsDoc = ctx.state.pv ? ctx.state.pv.doc : await PD.pdfjs(ctx.files[0].bytes);
      const out = await PD.create();
      for (let p = 1; p <= pdfjsDoc.numPages; p++) {
        const jsPage = await pdfjsDoc.getPage(p);
        const vp = jsPage.getViewport({ scale: 1 });
        ctx.progress(((p - 1) / pdfjsDoc.numPages) * 0.92, "Flattening page " + p + "…");
        const shot = await PD.renderPage(jsPage, 2, "image/jpeg", 0.88);
        const c = shot.canvas;
        const g = c.getContext("2d");
        g.fillStyle = "#000000";
        for (const box of ctx.state.boxes[p] || []) {
          g.fillRect(box.x * c.width, box.y * c.height, box.w * c.width, box.h * c.height);
        }
        const blob = await PD.canvasBlob(c, "image/jpeg", 0.88);
        const embedded = await out.embedJpg(await blob.arrayBuffer());
        const page = out.addPage([vp.width, vp.height]);
        page.drawImage(embedded, { x: 0, y: 0, width: vp.width, height: vp.height });
        c.width = c.height = 0;
        await PD.tick();
      }
      return {
        name: PD.base(ctx.files[0].name) + "-redacted.pdf",
        blob: await PD.pdfBlob(out),
        note: count + " area" + (count === 1 ? "" : "s") + " permanently removed. All pages were flattened."
      };
    }
  });

  /* ------------------------------------------------------------
     SIGN
     ------------------------------------------------------------ */
  PD.registerTool({
    id: "sign",
    name: "Sign PDF",
    desc: "Draw or upload a signature and place it on any page.",
    cat: "edit",
    icon: "sign",
    accept: ".pdf",
    multiple: false,
    tag: "PDF",
    interactive: true,
    options: [
      { key: "width", label: "Signature size", type: "range", value: 22, min: 8, max: 60, step: 1, suffix: "%", help: "Percentage of the page width." },
      { type: "note", text: "Draw below, then click on the page to place the signature. Click a placed signature to remove it." }
    ],
    async mount(ctx, stage) {
      stage.innerHTML =
        '<div class="editor">' +
        '<div class="sig-panel"><div class="sig-head"><h4>Your signature</h4><div class="tools">' +
        '<button type="button" id="sigUpload">Upload</button><button type="button" id="sigClear">Clear</button>' +
        '<input type="file" id="sigFile" accept="image/png,image/jpeg" class="hidden">' +
        '</div></div>' +
        '<div class="sig-canvas-wrap"><canvas id="sigPad" width="640" height="200"></canvas><div class="sig-placeholder" id="sigHint">Draw your signature here</div></div>' +
        '<p class="sig-note">Use a mouse, finger or stylus. Placed signatures are baked into the PDF — no certificate is added.</p></div>' +
        '<div class="editor-bar"><div class="left"><span class="label" id="signStatus">No signature yet</span></div>' +
        '<div class="right"><button class="btn btn-outline btn-sm" id="signUndo" type="button"><svg class="ic"><use href="#i-refresh"/></svg> Undo</button>' + navHtml() + "</div></div>" +
        '<div class="page-stage" id="signStage"></div>' +
        '<p class="org-hint"><svg class="ic"><use href="#i-info"/></svg> Click the page to place your signature. Click it again to remove it.</p>' +
        "</div>";
      const host = stage.querySelector("#signStage");
      const pv = new PD.PageView(host);
      await pv.open(ctx.files[0].bytes);
      const state = ctx.state;
      state.pv = pv;
      state.placements = [];
      state.sig = null;
      const pad = stage.querySelector("#sigPad");
      const pctx = pad.getContext("2d");
      pctx.lineWidth = 3.2;
      pctx.lineCap = "round";
      pctx.lineJoin = "round";
      pctx.strokeStyle = "#111111";
      let drawing = false;
      let dirty = false;
      let last = null;
      let renderPlacements = null;

      const pos = (e) => {
        const r = pad.getBoundingClientRect();
        return { x: ((e.clientX - r.left) / r.width) * pad.width, y: ((e.clientY - r.top) / r.height) * pad.height };
      };
      pad.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        pad.setPointerCapture(e.pointerId);
        drawing = true;
        last = pos(e);
      });
      pad.addEventListener("pointermove", (e) => {
        if (!drawing) return;
        const p = pos(e);
        pctx.beginPath();
        pctx.moveTo(last.x, last.y);
        pctx.lineTo(p.x, p.y);
        pctx.stroke();
        last = p;
        dirty = true;
        stage.querySelector("#sigHint").style.display = "none";
      });
      pad.addEventListener("pointerup", () => {
        drawing = false;
        if (dirty) captureSig();
      });
      pad.addEventListener("pointercancel", () => (drawing = false));

      const captureSig = () => {
        const box = inkBounds(pad);
        if (!box) return;
        const c = document.createElement("canvas");
        c.width = box.w;
        c.height = box.h;
        c.getContext("2d").drawImage(pad, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
        const dataURL = c.toDataURL("image/png");
        setSig(dataURL, c.width / c.height, "png");
      };

      const setSig = (dataURL, aspect, type) => {
        state.sig = { dataURL, aspect, type, bytes: PD.dataURLBytes(dataURL) };
        stage.querySelector("#signStatus").textContent = "Signature ready — click a page to place it";
        stage.querySelector("#sigHint").style.display = "none";
        if (renderPlacements) renderPlacements();
      };

      renderPlacements = () => {
        if (!pv.layer) return;
        pv.layer.querySelectorAll(".sig-placed").forEach((el) => el.remove());
        const list = state.placements.filter((p) => p.page === pv.pageNo);
        for (const pl of list) {
          const img = document.createElement("img");
          img.src = state.sig.dataURL;
          img.className = "sig-placed";
          img.alt = "Placed signature";
          img.title = "Click to remove";
          img.style.cssText =
            "position:absolute;left:" + pl.x * 100 + "%;top:" + pl.y * 100 + "%;width:" + pl.w * 100 + "%;height:auto;z-index:3;pointer-events:auto";
          img.addEventListener("click", (e) => {
            e.stopPropagation();
            state.placements = state.placements.filter((x) => x !== pl);
            renderPlacements();
            toast("Signature removed.");
          });
          pv.layer.appendChild(img);
        }
      };

      const bind = () => {
        if (!pv.layer) return;
        pv.layer.addEventListener("click", (e) => {
          if (!state.sig) {
            toast("Draw or upload a signature first.", "error");
            return;
          }
          if (e.target.closest(".sig-placed")) return;
          const rel = pv.point(e);
          const w = PD.clamp((Number(ctx.opts.width) || 22) / 100, 0.05, 0.8);
          const hFrac = (w * pv.width) / state.sig.aspect / pv.height;
          const x = PD.clamp(rel.x - w / 2, 0, 1 - w);
          const y = PD.clamp(rel.y - hFrac / 2, 0, 1 - hFrac);
          state.placements.push({ page: pv.pageNo, x, y, w });
          renderPlacements();
          toast("Signature placed on page " + pv.pageNo + ".");
        });
        renderPlacements();
      };

      const show = async (n) => {
        await pv.show(n);
        bind();
        update();
        ctx.state.page = pv.pageNo;
      };
      const update = bindNav(stage, pv, (n) => show(PD.clamp(n, 1, pv.pages)));
      await show(1);

      stage.querySelector("#sigClear").addEventListener("click", () => {
        pctx.clearRect(0, 0, pad.width, pad.height);
        dirty = false;
        state.sig = null;
        state.placements = [];
        stage.querySelector("#signStatus").textContent = "No signature yet";
        stage.querySelector("#sigHint").style.display = "";
        renderPlacements();
      });
      stage.querySelector("#signUndo").addEventListener("click", () => {
        if (state.placements.length) {
          state.placements.pop();
          renderPlacements();
          toast("Last placement removed.");
        }
      });
      stage.querySelector("#sigUpload").addEventListener("click", () => stage.querySelector("#sigFile").click());
      stage.querySelector("#sigFile").addEventListener("change", async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          const url = URL.createObjectURL(file);
          const img = await PD.loadImage(url);
          const max = 1200;
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.round(img.width * k);
          c.height = Math.round(img.height * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          setSig(c.toDataURL("image/png"), c.width / c.height, "png");
          toast("Signature uploaded.");
        } catch (err) {
          toast("That image could not be used.", "error");
        }
        e.target.value = "";
      });
      ctx.state.getPlacements = () => state.placements;
    },
    async run(ctx) {
      const state = ctx.state;
      if (!state.sig) throw new Error("Draw or upload a signature first.");
      if (!state.placements || !state.placements.length) throw new Error("Click on the page to place your signature first.");
      const doc = await PD.load(ctx.files[0].bytes);
      const pdfjsDoc = state.pv ? state.pv.doc : await PD.pdfjs(ctx.files[0].bytes);
      const img = await doc.embedPng(state.sig.bytes);
      const byPage = {};
      for (const pl of state.placements) (byPage[pl.page] || (byPage[pl.page] = [])).push(pl);
      let drawn = 0;
      for (const key of Object.keys(byPage)) {
        const pageNo = Number(key);
        const jsPage = await pdfjsDoc.getPage(pageNo);
        const vp = jsPage.getViewport({ scale: 1 });
        const page = doc.getPage(pageNo - 1);
        for (const pl of byPage[key]) {
          const p1 = vp.convertToPdfPoint(pl.x * vp.width, pl.y * vp.height);
          const p2 = vp.convertToPdfPoint((pl.x + pl.w) * vp.width, (pl.y + (pl.w * vp.width) / state.sig.aspect / vp.height) * vp.height);
          const x = Math.min(p1[0], p2[0]);
          const y = Math.min(p1[1], p2[1]);
          const w = Math.abs(p2[0] - p1[0]);
          const h = Math.abs(p2[1] - p1[1]);
          page.drawImage(img, { x, y, width: w, height: h });
          drawn++;
        }
        ctx.progress(drawn / state.placements.length, "Signing page " + pageNo + "…");
        await PD.tick();
      }
      return {
        name: PD.base(ctx.files[0].name) + "-signed.pdf",
        blob: await PD.pdfBlob(doc),
        note: drawn + " signature" + (drawn === 1 ? "" : "s") + " added."
      };
    }
  });

  function inkBounds(canvas) {
    const ctx = canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    const pad = 6;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(canvas.width - 1, maxX + pad);
    maxY = Math.min(canvas.height - 1, maxY + pad);
    return { x: minX, y: minY, w: Math.max(1, maxX - minX + 1), h: Math.max(1, maxY - minY + 1) };
  }

  /* ------------------------------------------------------------
     ADD TEXT
     ------------------------------------------------------------ */
  PD.registerTool({
    id: "add-text",
    name: "Add text to PDF",
    desc: "Write notes, labels or comments directly onto a page.",
    cat: "edit",
    icon: "text",
    accept: ".pdf",
    multiple: false,
    tag: "PDF",
    interactive: true,
    options: [
      { key: "text", label: "Text to place", type: "text", value: "Approved", placeholder: "Type something…" },
      {
        key: "font",
        label: "Font",
        type: "select",
        value: "helvetica",
        choices: [
          { value: "helvetica", label: "Helvetica" },
          { value: "times", label: "Times" },
          { value: "courier", label: "Courier" }
        ]
      },
      { key: "bold", label: "Style", type: "checkbox", value: false, text: "Bold" },
      { key: "size", label: "Size", type: "range", value: 18, min: 6, max: 96, step: 1, suffix: "pt" },
      { key: "color", label: "Colour", type: "color", value: "#0072f5" },
      { type: "note", text: "Set the text and style, then click anywhere on the page. Click a placed label to remove it." }
    ],
    async mount(ctx, stage) {
      stage.innerHTML =
        '<div class="editor">' +
        '<div class="editor-bar"><div class="left"><span class="label" id="textCount">No labels yet</span></div>' +
        '<div class="right"><button class="btn btn-outline btn-sm" id="textUndo" type="button"><svg class="ic"><use href="#i-refresh"/></svg> Undo</button>' + navHtml() + "</div></div>" +
        '<div class="page-stage" id="textStage"></div>' +
        '<p class="org-hint"><svg class="ic"><use href="#i-info"/></svg> Click the page to drop the current text. Change the text above, then click again to add another.</p>' +
        "</div>";
      const host = stage.querySelector("#textStage");
      const pv = new PD.PageView(host);
      await pv.open(ctx.files[0].bytes);
      const state = ctx.state;
      state.pv = pv;
      state.placements = [];

      const refresh = () => {
        stage.querySelector("#textCount").textContent = state.placements.length
          ? state.placements.length + " label" + (state.placements.length === 1 ? "" : "s") + " placed"
          : "No labels yet";
      };

      const render = () => {
        if (!pv.layer) return;
        pv.layer.querySelectorAll(".text-placed").forEach((el) => el.remove());
        const list = state.placements.filter((p) => p.page === pv.pageNo);
        for (const pl of list) {
          const el = document.createElement("div");
          el.className = "text-placed";
          el.textContent = pl.text;
          el.title = "Click to remove";
          el.style.left = pl.x * 100 + "%";
          el.style.top = pl.y * 100 + "%";
          el.style.fontSize = Math.max(6, pl.size * pv.scale) + "px";
          el.style.color = pl.color;
          el.style.fontWeight = pl.bold ? "700" : "500";
          el.style.fontFamily =
            pl.font === "times" ? "Georgia, 'Times New Roman', serif" : pl.font === "courier" ? "ui-monospace, Menlo, monospace" : "inherit";
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            state.placements = state.placements.filter((x) => x !== pl);
            render();
            refresh();
          });
          pv.layer.appendChild(el);
        }
        refresh();
      };

      const bind = () => {
        if (!pv.layer) return;
        pv.layer.addEventListener("click", (e) => {
          if (e.target.closest(".text-placed")) return;
          const text = String(ctx.opts.text || "").trim();
          if (!text) {
            toast("Type some text in the options first.", "error");
            return;
          }
          const rel = pv.point(e);
          state.placements.push({
            page: pv.pageNo,
            x: rel.x,
            y: rel.y,
            text,
            size: Math.max(6, Number(ctx.opts.size) || 18),
            color: ctx.opts.color || "#0072f5",
            font: ctx.opts.font || "helvetica",
            bold: !!ctx.opts.bold
          });
          render();
          toast("Text placed on page " + pv.pageNo + ".");
        });
        render();
      };

      const show = async (n) => {
        await pv.show(n);
        bind();
        update();
        ctx.state.page = pv.pageNo;
      };
      const update = bindNav(stage, pv, (n) => show(PD.clamp(n, 1, pv.pages)));
      await show(1);

      stage.querySelector("#textUndo").addEventListener("click", () => {
        if (state.placements.length) {
          state.placements.pop();
          render();
          toast("Last label removed.");
        }
      });
    },
    async run(ctx) {
      const state = ctx.state;
      if (!state.placements || !state.placements.length) throw new Error("Place at least one label on the page first.");
      const doc = await PD.load(ctx.files[0].bytes);
      const pdfjsDoc = state.pv ? state.pv.doc : await PD.pdfjs(ctx.files[0].bytes);
      const fontCache = {};
      const getFont = async (font, bold) => {
        const key = font + (bold ? "-bold" : "");
        if (fontCache[key]) return fontCache[key];
        const map = {
          helvetica: bold ? PD.StandardFonts.HelveticaBold : PD.StandardFonts.Helvetica,
          times: bold ? PD.StandardFonts.TimesRomanBold : PD.StandardFonts.TimesRoman,
          courier: bold ? PD.StandardFonts.CourierBold : PD.StandardFonts.Courier
        };
        fontCache[key] = await doc.embedFont(map[font] || map.helvetica);
        return fontCache[key];
      };
      const byPage = {};
      for (const pl of state.placements) (byPage[pl.page] || (byPage[pl.page] = [])).push(pl);
      for (const key of Object.keys(byPage)) {
        const pageNo = Number(key);
        const jsPage = await pdfjsDoc.getPage(pageNo);
        const vp = jsPage.getViewport({ scale: 1 });
        const page = doc.getPage(pageNo - 1);
        for (const pl of byPage[key]) {
          const p = vp.convertToPdfPoint(pl.x * vp.width, pl.y * vp.height);
          const font = await getFont(pl.font, pl.bold);
          page.drawText(pl.text, {
            x: p[0],
            y: p[1] - pl.size * 0.82,
            size: pl.size,
            font,
            color: PD.color(pl.color)
          });
        }
        ctx.progress((pageNo / pdfjsDoc.numPages) * 0.9, "Writing text…");
        await PD.tick();
      }
      return {
        name: PD.base(ctx.files[0].name) + "-text.pdf",
        blob: await PD.pdfBlob(doc),
        note: state.placements.length + " label" + (state.placements.length === 1 ? "" : "s") + " added as real, selectable PDF text."
      };
    }
  });
})();
