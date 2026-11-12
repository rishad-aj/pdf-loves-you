/* ============================================================
   Organize tools — merge, split, organize, rotate, extract
   ============================================================ */
(function () {
  "use strict";
  const PD = window.PD;

  /* ------------------------------------------------------------
     MERGE
     ------------------------------------------------------------ */
  PD.registerTool({
    id: "merge",
    name: "Merge PDF",
    desc: "Combine several PDFs into one, in the order you choose.",
    cat: "organize",
    icon: "merge",
    accept: ".pdf",
    multiple: true,
    minFiles: 2,
    tag: "PDF",
    options: [
      {
        key: "bookmarks",
        label: "Document title",
        type: "text",
        value: "",
        placeholder: "Optional — e.g. Project files",
        help: "Stored in the PDF metadata only. Leave blank to use the first file's name."
      }
    ],
    async run(ctx) {
      const out = await PD.create();
      let n = 0;
      for (const f of ctx.files) {
        const src = await PD.load(f.bytes);
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
        n++;
        ctx.progress(n / ctx.files.length, "Merging " + f.name + "…");
        await PD.tick();
      }
      if (ctx.opts.bookmarks) out.setTitle(String(ctx.opts.bookmarks));
      const name = PD.withExt(ctx.opts.bookmarks || PD.base(ctx.files[0].name) + "-merged", "pdf");
      return {
        name,
        blob: await PD.pdfBlob(out),
        note: ctx.files.length + " documents combined into " + out.getPageCount() + " pages."
      };
    }
  });

  /* ------------------------------------------------------------
     SPLIT
     ------------------------------------------------------------ */
  PD.registerTool({
    id: "split",
    name: "Split PDF",
    desc: "Cut one PDF into ranges, fixed-size parts, or single pages.",
    cat: "organize",
    icon: "split",
    accept: ".pdf",
    multiple: false,
    tag: "PDF",
    options: [
      {
        key: "mode",
        label: "Split by",
        type: "select",
        value: "ranges",
        choices: [
          { value: "ranges", label: "Page ranges" },
          { value: "every", label: "Every N pages" },
          { value: "each", label: "Every page separately" }
        ]
      },
      {
        key: "ranges",
        label: "Ranges",
        type: "text",
        value: "1-2, 3-4",
        placeholder: "e.g. 1-3, 5, 8-",
        help: "Each comma-separated range becomes its own PDF.",
        showIf: { key: "mode", in: ["ranges"] }
      },
      {
        key: "every",
        label: "Pages per file",
        type: "number",
        value: 2,
        min: 1,
        max: 500,
        showIf: { key: "mode", in: ["every"] }
      },
      {
        key: "note",
        type: "note",
        text: "Multiple output files are packed into a single ZIP download."
      }
    ],
    async run(ctx) {
      const src = await PD.load(ctx.files[0].bytes);
      const count = src.getPageCount();
      const mode = ctx.opts.mode || "ranges";
      const base = PD.base(ctx.files[0].name);

      const build = async (indices) => {
        const doc = await PD.create();
        const pages = await doc.copyPages(src, indices);
        pages.forEach((p) => doc.addPage(p));
        return PD.pdfBlob(doc);
      };

      if (mode === "ranges") {
        const str = String(ctx.opts.ranges || "").trim();
        if (!str) throw new Error("Enter at least one page range.");
        const chunks = [];
        for (const raw of str.split(",")) {
          if (!raw.trim()) continue;
          chunks.push(PD.ranges(raw, count, false));
        }
        if (!chunks.length) throw new Error("Enter at least one page range.");
        if (chunks.length === 1) {
          ctx.progress(0.7, "Building PDF…");
          return {
            name: base + "-split.pdf",
            blob: await build(chunks[0]),
            note: "Extracted " + chunks[0].length + " page" + (chunks[0].length === 1 ? "" : "s") + "."
          };
        }
        const files = [];
        const used = new Set();
        for (let i = 0; i < chunks.length; i++) {
          ctx.progress((i + 0.3) / chunks.length, "Building part " + (i + 1) + " of " + chunks.length + "…");
          files.push({ name: PD.uniqueName(base + "-part-" + String(i + 1).padStart(2, "0") + ".pdf", used), blob: await build(chunks[i]) });
          await PD.tick();
        }
        return { files, zipName: base + "-split.zip", note: chunks.length + " files created." };
      }

      if (mode === "each") {
        const files = [];
        const used = new Set();
        for (let i = 0; i < count; i++) {
          ctx.progress((i + 0.3) / count, "Saving page " + (i + 1) + " of " + count + "…");
          files.push({ name: PD.uniqueName(base + "-page-" + String(i + 1).padStart(2, "0") + ".pdf", used), blob: await build([i]) });
          await PD.tick();
        }
        return { files, zipName: base + "-pages.zip", note: count + " single-page PDFs created." };
      }

      const per = Math.max(1, Math.floor(Number(ctx.opts.every) || 2));
      const files = [];
      const used = new Set();
      let part = 1;
      for (let i = 0; i < count; i += per) {
        const idx = [];
        for (let j = i; j < Math.min(count, i + per); j++) idx.push(j);
        ctx.progress((i + 1) / count, "Building part " + part + "…");
        files.push({ name: PD.uniqueName(base + "-part-" + String(part).padStart(2, "0") + ".pdf", used), blob: await build(idx) });
        part++;
        await PD.tick();
      }
      return { files, zipName: base + "-parts.zip", note: files.length + " files of up to " + per + " pages." };
    }
  });

  /* ------------------------------------------------------------
     ORGANIZE (visual reorder)
     ------------------------------------------------------------ */
  PD.registerTool({
    id: "organize",
    name: "Organize PDF",
    desc: "Reorder, rotate and delete pages with live thumbnails.",
    cat: "organize",
    icon: "organize",
    accept: ".pdf",
    multiple: false,
    tag: "PDF",
    interactive: true,
    options: [
      { type: "note", text: "Drag cards to reorder. Use the arrows on touch screens." },
      {
        key: "removeBlank",
        label: "Cleaning",
        type: "checkbox",
        value: false,
        text: "Also remove pages that are completely blank",
        help: "Blank pages are detected from the rendered page."
      }
    ],
    async mount(ctx, stage) {
      const file = ctx.files[0];
      stage.innerHTML =
        '<div class="editor">' +
        '<div class="editor-bar"><div class="left"><span class="label" id="orgCount">Loading pages…</span></div>' +
        '<div class="right"><button class="btn btn-outline btn-sm" id="orgRotateAll" type="button"><svg class="ic"><use href="#i-rotate-cw"/></svg> Rotate all</button>' +
        '<button class="btn btn-outline btn-sm" id="orgReset" type="button"><svg class="ic"><use href="#i-refresh"/></svg> Reset</button></div></div>' +
        '<div class="org-grid" id="orgGrid"><div class="org-empty"><span class="spinner" style="margin:0 auto 10px"></span>Building page previews…</div></div>' +
        '<p class="org-hint"><svg class="ic"><use href="#i-info"/></svg> The first card becomes page 1 in the finished PDF.</p>' +
        "</div>";

      const grid = stage.querySelector("#orgGrid");
      const countEl = stage.querySelector("#orgCount");
      let pdfDoc;
      try {
        pdfDoc = await PD.pdfjs(file.bytes);
      } catch (e) {
        throw new Error(PD.friendlyError(e));
      }

      const items = Array.from({ length: pdfDoc.numPages }, (_, i) => ({ src: i, rot: 0, id: PD.uid(), el: null, blank: false }));
      ctx.state.items = items;
      ctx.state.pdfDoc = pdfDoc;
      grid.innerHTML = "";

      const renumber = () => {
        const live = grid.querySelectorAll(".org-card");
        live.forEach((el, i) => {
          el.querySelector(".pnum").textContent = i + 1;
          el.dataset.pos = i;
        });
        countEl.textContent = live.length + " page" + (live.length === 1 ? "" : "s") + " · drag to reorder";
        if (!live.length) grid.innerHTML = '<div class="org-empty">All pages removed. Add the file again to start over.</div>';
      };

      const makeCard = (item) => {
        const card = document.createElement("div");
        card.className = "org-card";
        card.draggable = true;
        card.dataset.id = item.id;
        card.innerHTML =
          '<div class="thumb"><span class="pnum"></span><span class="grab" title="Drag to reorder"><svg class="ic"><use href="#i-organize"/></svg></span><div class="loading" style="display:grid;place-items:center;width:100%;height:100%"><span class="spinner" style="width:16px;height:16px;border-width:2px"></span></div></div>' +
          '<div class="org-actions">' +
          '<button class="move-btn" type="button" data-act="left" title="Move left" aria-label="Move page left"><svg class="ic"><use href="#i-arrow-left"/></svg></button>' +
          '<button type="button" data-act="rotl" title="Rotate left" aria-label="Rotate page left"><svg class="ic"><use href="#i-rotate-ccw"/></svg></button>' +
          '<button type="button" data-act="rotr" title="Rotate right" aria-label="Rotate page right"><svg class="ic"><use href="#i-rotate-cw"/></svg></button>' +
          '<button class="move-btn" type="button" data-act="right" title="Move right" aria-label="Move page right"><svg class="ic"><use href="#i-arrow-right"/></svg></button>' +
          '<button class="del" type="button" data-act="del" title="Remove page" aria-label="Remove page"><svg class="ic"><use href="#i-trash"/></svg></button>' +
          "</div>";
        item.el = card;

        card.addEventListener("click", (e) => {
          const btn = e.target.closest("button[data-act]");
          if (!btn) return;
          const act = btn.dataset.act;
          if (act === "rotl") {
            item.rot = (item.rot + 270) % 360;
            applyRotation(card, item.rot);
          } else if (act === "rotr") {
            item.rot = (item.rot + 90) % 360;
            applyRotation(card, item.rot);
          } else if (act === "del") {
            card.remove();
            renumber();
          } else if (act === "left" || act === "right") {
            const prev = act === "left" ? card.previousElementSibling : card.nextElementSibling;
            if (prev) {
              grid.insertBefore(card, act === "left" ? prev : prev.nextSibling);
              renumber();
            }
          }
        });

        card.addEventListener("dragstart", (e) => {
          card.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
          try { e.dataTransfer.setData("text/plain", item.id); } catch (err) {}
        });
        card.addEventListener("dragend", () => {
          card.classList.remove("dragging");
          grid.querySelectorAll(".org-card").forEach((el) => el.classList.remove("over"));
          renumber();
        });
        card.addEventListener("dragover", (e) => {
          e.preventDefault();
          const dragging = grid.querySelector(".dragging");
          if (!dragging || dragging === card) return;
          card.classList.add("over");
          const r = card.getBoundingClientRect();
          const after = e.clientX > r.left + r.width / 2;
          grid.insertBefore(dragging, after ? card.nextSibling : card);
        });
        card.addEventListener("dragleave", () => card.classList.remove("over"));
        return card;
      };

      const applyRotation = (card, rot) => {
        const c = card.querySelector("canvas");
        if (c) c.style.transform = "rotate(" + rot + "deg) scale(" + (rot % 180 === 90 ? 0.72 : 1) + ")";
      };

      grid.innerHTML = "";
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const card = makeCard(item);
        grid.appendChild(card);
        try {
          const shot = await PD.thumb(pdfDoc, i + 1, 150);
          const holder = card.querySelector(".thumb");
          const spinner = holder.querySelector(".loading");
          if (spinner) spinner.remove();
          shot.canvas.style.width = "100%";
          shot.canvas.style.height = "100%";
          shot.canvas.style.objectFit = "contain";
          holder.insertBefore(shot.canvas, holder.querySelector(".grab"));
          item.blank = isBlankCanvas(shot.canvas);
          if (item.blank) card.classList.add("is-blank");
        } catch (e) {
          const spinner = card.querySelector(".loading");
          if (spinner) spinner.innerHTML = '<svg class="ic" style="color:var(--faint)"><use href="#i-file"/></svg>';
        }
        if (i % 3 === 0) {
          ctx.progress((i + 1) / items.length, "Rendering page " + (i + 1) + " of " + items.length + "…");
          await PD.tick();
        }
      }
      renumber();
      ctx.progress(1, "");

      stage.querySelector("#orgRotateAll").addEventListener("click", () => {
        const cards = grid.querySelectorAll(".org-card");
        cards.forEach((card) => {
          const item = items.find((it) => it.el === card);
          if (!item) return;
          item.rot = (item.rot + 90) % 360;
          applyRotation(card, item.rot);
        });
        toast("All pages rotated 90° clockwise.");
      });

      stage.querySelector("#orgReset").addEventListener("click", () => {
        if (!confirm("Reset the page order, rotations and removals?")) return;
        items.forEach((it) => (it.rot = 0));
        items.forEach((it) => {
          if (!it.el) return;
          it.el.style.display = "";
          applyRotation(it.el, 0);
          grid.appendChild(it.el);
        });
        renumber();
      });

      ctx.state.getOrdered = () => {
        return Array.from(grid.querySelectorAll(".org-card"))
          .map((el) => items.find((it) => it.id === el.dataset.id))
          .filter(Boolean);
      };
    },
    async run(ctx) {
      const ordered = ctx.state.getOrdered ? ctx.state.getOrdered() : ctx.state.items || [];
      if (!ordered.length) throw new Error("Keep at least one page in the document.");
      const keep = ctx.opts.removeBlank ? ordered.filter((it) => !it.blank) : ordered;
      const removed = ordered.length - keep.length;
      if (!keep.length) throw new Error("Every remaining page looks blank. Add a page back or turn off blank-page cleaning.");
      ctx.progress(0.35, "Rebuilding document…");
      const src = await PD.load(ctx.files[0].bytes);
      const out = await PD.create();
      const pages = await out.copyPages(src, keep.map((it) => it.src));
      pages.forEach((page, i) => {
        const original = src.getPage(keep[i].src).getRotation().angle;
        page.setRotation(PD.degrees((original + keep[i].rot) % 360));
        out.addPage(page);
      });
      ctx.progress(0.85, "Saving…");
      return {
        name: PD.base(ctx.files[0].name) + "-organized.pdf",
        blob: await PD.pdfBlob(out),
        note: keep.length + " pages reordered into a fresh document." + (removed ? " " + removed + " blank page" + (removed === 1 ? " was" : "s were") + " removed." : "")
      };
    }
  });

  /* ------------------------------------------------------------
     ROTATE
     ------------------------------------------------------------ */
  PD.registerTool({
    id: "rotate",
    name: "Rotate PDF",
    desc: "Turn all or selected pages 90°, 180° or 270°.",
    cat: "organize",
    icon: "rotate",
    accept: ".pdf",
    multiple: false,
    tag: "PDF",
    options: [
      {
        key: "angle",
        label: "Rotate by",
        type: "select",
        value: "90",
        choices: [
          { value: "90", label: "90° clockwise" },
          { value: "180", label: "180° (upside down)" },
          { value: "270", label: "90° anticlockwise" }
        ]
      },
      {
        key: "scope",
        label: "Apply to",
        type: "select",
        value: "all",
        choices: [
          { value: "all", label: "Every page" },
          { value: "range", label: "Selected pages" }
        ]
      },
      {
        key: "range",
        label: "Pages",
        type: "text",
        value: "1",
        placeholder: "e.g. 1, 4-6",
        showIf: { key: "scope", in: ["range"] }
      }
    ],
    async run(ctx) {
      const doc = await PD.load(ctx.files[0].bytes);
      const count = doc.getPageCount();
      const indices = ctx.opts.scope === "range" ? PD.ranges(ctx.opts.range, count) : doc.getPageIndices();
      const delta = Number(ctx.opts.angle) || 90;
      indices.forEach((i, k) => {
        const page = doc.getPage(i);
        page.setRotation(PD.degrees((page.getRotation().angle + delta) % 360));
        if (k % 20 === 0) ctx.progress(k / indices.length, "Rotating pages…");
      });
      ctx.progress(0.85, "Saving…");
      return {
        name: PD.base(ctx.files[0].name) + "-rotated.pdf",
        blob: await PD.pdfBlob(doc),
        note: indices.length + " page" + (indices.length === 1 ? "" : "s") + " rotated " + delta + "°."
      };
    }
  });

  /* ------------------------------------------------------------
     EXTRACT PAGES
     ------------------------------------------------------------ */
  PD.registerTool({
    id: "extract",
    name: "Extract pages",
    desc: "Pull out the pages you need into a new PDF or separate files.",
    cat: "organize",
    icon: "extract",
    accept: ".pdf",
    multiple: false,
    tag: "PDF",
    options: [
      { key: "ranges", label: "Pages to extract", type: "text", value: "1-3", placeholder: "e.g. 1-3, 7, 10-12", help: "Use commas for separate ranges." },
      { key: "separate", label: "Output", type: "checkbox", value: false, text: "Save every selected page as its own PDF" }
    ],
    async run(ctx) {
      const src = await PD.load(ctx.files[0].bytes);
      const count = src.getPageCount();
      const indices = PD.ranges(ctx.opts.ranges, count);
      const base = PD.base(ctx.files[0].name);
      if (!ctx.opts.separate) {
        const out = await PD.create();
        const pages = await out.copyPages(src, indices);
        pages.forEach((p) => out.addPage(p));
        ctx.progress(0.8, "Saving…");
        return { name: base + "-extracted.pdf", blob: await PD.pdfBlob(out), note: indices.length + " of " + count + " pages extracted." };
      }
      const files = [];
      const used = new Set();
      for (let i = 0; i < indices.length; i++) {
        const out = await PD.create();
        const [page] = await out.copyPages(src, [indices[i]]);
        out.addPage(page);
        files.push({
          name: PD.uniqueName(base + "-page-" + String(indices[i] + 1).padStart(2, "0") + ".pdf", used),
          blob: await PD.pdfBlob(out)
        });
        ctx.progress((i + 1) / indices.length, "Extracting page " + (indices[i] + 1) + "…");
        await PD.tick();
      }
      return { files, zipName: base + "-extracted.zip", note: files.length + " single-page PDFs created." };
    }
  });

  function toast(msg) {
    if (window.PDUI && window.PDUI.toast) window.PDUI.toast(msg);
  }

  /* A rendered page is treated as blank when a sampled grid contains no ink. */
  function isBlankCanvas(canvas) {
    try {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx || !canvas.width || !canvas.height) return false;
      const { width, height } = canvas;
      const data = ctx.getImageData(0, 0, width, height).data;
      const step = Math.max(1, Math.floor(Math.min(width, height) / 120));
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const i = (y * width + x) * 4;
          if (data[i] < 244 || data[i + 1] < 244 || data[i + 2] < 244) return false;
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  }
})();
