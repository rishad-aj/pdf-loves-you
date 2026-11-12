/* ============================================================
   Convert tools — PDF⇄images, Word, Excel, PowerPoint, text, OCR
   ============================================================ */
(function () {
  "use strict";
  const PD = window.PD;
  const A4 = [595.28, 841.89];
  const LETTER = [612, 792];

  /* ---------- shared text extraction ---------- */
  async function pageLines(page) {
    const content = await page.getTextContent();
    const items = content.items.filter((it) => it && typeof it.str === "string" && it.str.trim().length);
    const lines = [];
    for (const it of items) {
      const tr = it.transform || [1, 0, 0, 1, 0, 0];
      const x = tr[4];
      const y = tr[5];
      const h = Math.abs(it.height || tr[3] || 10) || 10;
      let line = lines.find((l) => Math.abs(l.y - y) <= Math.max(2, h * 0.4));
      if (!line) {
        line = { y, h, items: [] };
        lines.push(line);
      }
      line.items.push({ x, y, w: it.width || 0, str: it.str, h });
      line.h = Math.max(line.h, h);
    }
    lines.sort((a, b) => b.y - a.y);
    for (const line of lines) {
      line.items.sort((a, b) => a.x - b.x);
      let text = "";
      let prevEnd = null;
      for (const it of line.items) {
        if (prevEnd !== null) {
          const gap = it.x - prevEnd;
          if (gap > Math.max(1.1, line.h * 0.14) && !/\s$/.test(text) && !/^\s/.test(it.str)) text += " ";
        }
        text += it.str;
        prevEnd = it.x + (it.w || 0);
      }
      line.text = text.replace(/\s+/g, " ").trim();
    }
    return lines.filter((l) => l.text);
  }

  function parsePagesInput(value, count) {
    return PD.ranges(value, count);
  }

  function progressSteps(ctx, total, label) {
    return (i) => {
      ctx.progress((i + 1) / total, label ? label(i + 1, total) : "Working…");
    };
  }

  /* ------------------------------------------------------------
     PDF → JPG / PNG
     ------------------------------------------------------------ */
  PD.registerTool({
    id: "pdf-to-jpg",
    name: "PDF to JPG",
    desc: "Turn every page into a high-quality image, or a ZIP of images.",
    cat: "convert",
    icon: "image",
    accept: ".pdf",
    multiple: false,
    tag: "PDF",
    options: [
      {
        key: "format",
        label: "Image format",
        type: "select",
        value: "image/jpeg",
        choices: [
          { value: "image/jpeg", label: "JPG — smaller files" },
          { value: "image/png", label: "PNG — lossless" }
        ]
      },
      {
        key: "dpi",
        label: "Resolution",
        type: "select",
        value: "150",
        choices: [
          { value: "72", label: "72 DPI — screen" },
          { value: "150", label: "150 DPI — recommended" },
          { value: "300", label: "300 DPI — print" }
        ]
      },
      {
        key: "quality",
        label: "JPG quality",
        type: "range",
        value: 88,
        min: 40,
        max: 100,
        step: 1,
        suffix: "%",
        showIf: { key: "format", in: ["image/jpeg"] }
      },
      { key: "pages", label: "Pages", type: "text", value: "", placeholder: "All pages — or e.g. 1-3, 7", help: "Leave blank to export every page." }
    ],
    async run(ctx) {
      const file = ctx.files[0];
      const doc = await PD.pdfjs(file.bytes);
      const count = doc.numPages;
      const indices = PD.ranges(ctx.opts.pages, count);
      const dpi = Math.min(4, Math.max(0.5, (Number(ctx.opts.dpi) || 150) / 72));
      const type = ctx.opts.format === "image/png" ? "image/png" : "image/jpeg";
      const quality = Math.max(0.4, Math.min(1, (Number(ctx.opts.quality) || 88) / 100));
      const ext = type === "image/png" ? "png" : "jpg";
      const base = PD.base(file.name);
      const files = [];
      const used = new Set();

      for (let i = 0; i < indices.length; i++) {
        const page = await doc.getPage(indices[i] + 1);
        ctx.progress(((i + 0.35) / indices.length) * 0.9, "Rendering page " + (indices[i] + 1) + "…");
        const shot = await PD.renderPage(page, dpi, type, quality);
        const name = indices.length === 1 ? base + "." + ext : base + "-page-" + String(indices[i] + 1).padStart(3, "0") + "." + ext;
        files.push({ name: PD.uniqueName(name, used), blob: shot.blob });
        shot.canvas.width = 0;
        shot.canvas.height = 0;
        try { page.cleanup(); } catch (e) {}
        await PD.tick();
      }
      ctx.progress(1, "Done");
      if (files.length === 1) {
        return {
          name: files[0].name,
          blob: files[0].blob,
          previewUrl: URL.createObjectURL(files[0].blob),
          note: "Rendered at " + ctx.opts.dpi + " DPI."
        };
      }
      return {
        files,
        zipName: base + "-images.zip",
        note: files.length + " images at " + ctx.opts.dpi + " DPI, packed into a ZIP."
      };
    }
  });

  /* ------------------------------------------------------------
     JPG → PDF
     ------------------------------------------------------------ */
  PD.registerTool({
    id: "jpg-to-pdf",
    name: "JPG to PDF",
    desc: "Combine photos and scans into a single, tidy PDF.",
    cat: "convert",
    icon: "images",
    accept: "image/*",
    multiple: true,
    tag: "IMG",
    options: [
      {
        key: "pageSize",
        label: "Page size",
        type: "select",
        value: "fit",
        choices: [
          { value: "fit", label: "Fit page to image" },
          { value: "a4", label: "A4" },
          { value: "letter", label: "US Letter" }
        ]
      },
      {
        key: "orientation",
        label: "Orientation",
        type: "select",
        value: "auto",
        choices: [
          { value: "auto", label: "Automatic" },
          { value: "portrait", label: "Portrait" },
          { value: "landscape", label: "Landscape" }
        ],
        showIf: { key: "pageSize", in: ["a4", "letter"] }
      },
      {
        key: "margin",
        label: "Margin",
        type: "select",
        value: "0",
        choices: [
          { value: "0", label: "None" },
          { value: "18", label: "Small (0.25 in)" },
          { value: "36", label: "Medium (0.5 in)" },
          { value: "54", label: "Large (0.75 in)" }
        ]
      },
      {
        key: "note",
        type: "note",
        text: "Images are converted to JPEG and embedded at full resolution. Order follows the file list — use the arrows to reorder."
      }
    ],
    async run(ctx) {
      const out = await PD.create();
      const margin = Number(ctx.opts.margin) || 0;
      for (let i = 0; i < ctx.files.length; i++) {
        const f = ctx.files[i];
        ctx.progress((i / ctx.files.length) * 0.9, "Preparing " + f.name + "…");
        const img = await PD.normalizeImage(f.file, { maxDim: 6000, quality: 0.92 });
        const embedded = await out.embedJpg(await img.blob.arrayBuffer());
        let pageW;
        let pageH;
        if (ctx.opts.pageSize === "fit") {
          const k = Math.min(1, 842 / Math.max(img.width, img.height));
          pageW = img.width * k + margin * 2;
          pageH = img.height * k + margin * 2;
        } else {
          const base = ctx.opts.pageSize === "letter" ? LETTER : A4;
          const landscape = ctx.opts.orientation === "landscape" || (ctx.opts.orientation === "auto" && img.width > img.height);
          pageW = landscape ? base[1] : base[0];
          pageH = landscape ? base[0] : base[1];
        }
        const page = out.addPage([pageW, pageH]);
        const availW = Math.max(1, pageW - margin * 2);
        const availH = Math.max(1, pageH - margin * 2);
        const scale = Math.min(availW / img.width, availH / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        page.drawImage(embedded, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
        await PD.tick();
      }
      ctx.progress(0.95, "Saving PDF…");
      return {
        name: PD.base(ctx.files[0].name) + (ctx.files.length > 1 ? "-images.pdf" : ".pdf"),
        blob: await PD.pdfBlob(out),
        note: ctx.files.length + " image" + (ctx.files.length === 1 ? "" : "s") + " turned into " + out.getPageCount() + " page" + (out.getPageCount() === 1 ? "" : "s") + "."
      };
    }
  });

  /* ------------------------------------------------------------
     PDF → WORD
     ------------------------------------------------------------ */
  PD.registerTool({
    id: "pdf-to-word",
    name: "PDF to Word",
    desc: "Rebuild a PDF's text as an editable .docx document.",
    cat: "convert",
    icon: "word",
    accept: ".pdf",
    multiple: false,
    tag: "DOCX",
    options: [
      {
        key: "pageBreaks",
        label: "Layout",
        type: "checkbox",
        value: true,
        text: "Start each PDF page on a new Word page"
      },
      { type: "note", text: "Best for text-based PDFs. Complex columns, charts and scans are not reproduced — use OCR for scans." }
    ],
    async run(ctx) {
      if (!window.docx) throw new Error("The Word engine did not load.");
      const doc = await PD.pdfjs(ctx.files[0].bytes);
      const children = [];
      let totalLines = 0;
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const lines = await pageLines(page);
        totalLines += lines.length;
        if (p > 1 && ctx.opts.pageBreaks) {
          children.push(new docx.Paragraph({ children: [new docx.PageBreak()], spacing: { after: 0 } }));
        }
        for (const line of lines) {
          children.push(
            new docx.Paragraph({
              children: [new docx.TextRun({ text: line.text, size: Math.max(16, Math.min(48, Math.round(line.h * 2))) })],
              spacing: { after: 30, line: 240 }
            })
          );
        }
        ctx.progress((p / doc.numPages) * 0.85, "Extracting text from page " + p + "…");
        await PD.tick();
      }
      if (!totalLines) {
        throw new Error("No selectable text was found. This PDF is probably a scan — try the OCR tool instead.");
      }
      if (!children.length) children.push(new docx.Paragraph({ children: [new docx.TextRun({ text: " " })] }));
      const document = new docx.Document({
        creator: "PDF Loves You",
        title: PD.base(ctx.files[0].name),
        description: "Converted with PDF Loves You (client-side)",
        sections: [
          {
            properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
            children
          }
        ]
      });
      ctx.progress(0.92, "Packing Word document…");
      const blob = await docx.Packer.toBlob(document);
      return {
        name: PD.base(ctx.files[0].name) + ".docx",
        blob,
        note: "Editable text document with " + totalLines + " paragraphs. Original fonts and images are not carried over."
      };
    }
  });

  /* ------------------------------------------------------------
     PDF → EXCEL
     ------------------------------------------------------------ */
  PD.registerTool({
    id: "pdf-to-excel",
    name: "PDF to Excel",
    desc: "Extract rows and tables into a real spreadsheet (.xlsx).",
    cat: "convert",
    icon: "excel",
    accept: ".pdf",
    multiple: false,
    tag: "XLSX",
    options: [
      {
        key: "perPage",
        label: "Sheets",
        type: "select",
        value: "page",
        choices: [
          { value: "page", label: "One sheet per PDF page" },
          { value: "one", label: "Everything on one sheet" }
        ]
      },
      { type: "note", text: "Columns are inferred from text positions. Multi-line cells and merged tables may need a little tidying." }
    ],
    async run(ctx) {
      if (!window.XLSX) throw new Error("The spreadsheet engine did not load.");
      const doc = await PD.pdfjs(ctx.files[0].bytes);
      const wb = XLSX.utils.book_new();
      const base = PD.base(ctx.files[0].name);
      let anything = false;

      const rowsForPage = async (page) => {
        const lines = await pageLines(page);
        const raw = [];
        const xs = [];
        for (const line of lines) {
          const cells = [];
          let current = null;
          for (const it of line.items) {
            if (!current || it.x - current.end > Math.max(9, line.h * 0.8)) {
              current = { x: it.x, end: it.x + (it.w || 0), text: it.str };
              cells.push(current);
              xs.push(it.x);
            } else {
              const needsSpace = current.text && !/\s$/.test(current.text) && !/^\s/.test(it.str);
              current.text += (needsSpace ? " " : "") + it.str;
              current.end = Math.max(current.end, it.x + (it.w || 0));
            }
          }
          if (cells.length) raw.push(cells);
        }
        if (!raw.length) return [];
        xs.sort((a, b) => a - b);
        const cols = [];
        for (const x of xs) {
          const last = cols[cols.length - 1];
          if (last && x - last.lastX < 22) {
            last.lastX = Math.max(last.lastX, x);
            last.sum += x;
            last.n++;
          } else {
            cols.push({ lastX: x, sum: x, n: 1 });
          }
        }
        const centers = cols.map((c) => c.sum / c.n);
        return raw.map((cells) => {
          const row = new Array(centers.length).fill("");
          for (const cell of cells) {
            let best = 0;
            let bestDist = Infinity;
            centers.forEach((cx, i) => {
              const d = Math.abs(cx - cell.x);
              if (d < bestDist) {
                bestDist = d;
                best = i;
              }
            });
            row[best] = row[best] ? row[best] + " " + cell.text : cell.text;
          }
          return row;
        });
      };

      if (ctx.opts.perPage === "one") {
        const all = [];
        for (let p = 1; p <= doc.numPages; p++) {
          const page = await doc.getPage(p);
          const rows = await rowsForPage(page);
          if (rows.length) {
            all.push(["Page " + p]);
            all.push(...rows);
            all.push([]);
            anything = true;
          }
          ctx.progress((p / doc.numPages) * 0.9, "Reading page " + p + "…");
          await PD.tick();
        }
        if (all.length) {
          const ws = XLSX.utils.aoa_to_sheet(all);
          ws["!cols"] = Array.from({ length: Math.max(1, Math.max(...all.map((r) => r.length))) }, () => ({ wch: 22 }));
          XLSX.utils.book_append_sheet(wb, ws, "PDF data");
        }
      } else {
        for (let p = 1; p <= doc.numPages; p++) {
          const page = await doc.getPage(p);
          const rows = await rowsForPage(page);
          if (rows.length) {
            anything = true;
            let name = "Page " + p;
            if (p <= 60) {
              const ws = XLSX.utils.aoa_to_sheet(rows);
              const width = Math.max(...rows.map((r) => r.length));
              ws["!cols"] = Array.from({ length: width }, (_, i) => {
                let max = 8;
                rows.forEach((r) => { if (r[i]) max = Math.max(max, Math.min(60, String(r[i]).length + 2)); });
                return { wch: max };
              });
              XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
            } else {
              const ws = XLSX.utils.aoa_to_sheet([["Page " + p], ...rows]);
              XLSX.utils.book_append_sheet(wb, ws, ("P" + p).slice(0, 31));
            }
          }
          ctx.progress((p / doc.numPages) * 0.9, "Reading page " + p + "…");
          await PD.tick();
        }
        if (!wb.SheetNames.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["No text found"]]), "Sheet1");
      }

      ctx.progress(0.95, "Writing spreadsheet…");
      const array = XLSX.write(wb, { bookType: "xlsx", type: "array", compression: true });
      return {
        name: base + ".xlsx",
        blob: new Blob([array], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        note: anything ? "Text reconstructed into " + wb.SheetNames.length + " sheet" + (wb.SheetNames.length === 1 ? "" : "s") + "." : "No selectable text was found — the PDF may be a scan."
      };
    }
  });

  /* ------------------------------------------------------------
     PDF → POWERPOINT
     ------------------------------------------------------------ */
  PD.registerTool({
    id: "pdf-to-ppt",
    name: "PDF to PowerPoint",
    desc: "Turn each PDF page into a slide in a .pptx deck.",
    cat: "convert",
    icon: "ppt",
    accept: ".pdf",
    multiple: false,
    tag: "PPTX",
    options: [
      {
        key: "layout",
        label: "Slide size",
        type: "select",
        value: "16x9",
        choices: [
          { value: "16x9", label: "Widescreen (16:9)" },
          { value: "4x3", label: "Classic (4:3)" }
        ]
      },
      { key: "quality", label: "Image quality", type: "range", value: 85, min: 50, max: 100, step: 1, suffix: "%" }
    ],
    async run(ctx) {
      if (!window.PptxGenJS) throw new Error("The PowerPoint engine did not load.");
      const doc = await PD.pdfjs(ctx.files[0].bytes);
      const pptx = new PptxGenJS();
      const wide = ctx.opts.layout !== "4x3";
      pptx.layout = wide ? "LAYOUT_16x9" : "LAYOUT_4x3";
      pptx.author = "PDF Loves You";
      pptx.company = "PDF Loves You";
      pptx.title = PD.base(ctx.files[0].name);
      const slideW = 10;
      const slideH = wide ? 5.625 : 7.5;
      const q = Math.max(0.5, Math.min(1, (Number(ctx.opts.quality) || 85) / 100));

      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const shot = await PD.renderPage(page, Math.min(2, 1440 / page.getViewport({ scale: 1 }).width), "image/jpeg", q);
        const data = shot.canvas.toDataURL("image/jpeg", q);
        const ar = shot.width / shot.height;
        let w = slideW;
        let h = slideW / ar;
        if (h > slideH) {
          h = slideH;
          w = slideH * ar;
        }
        const slide = pptx.addSlide();
        slide.background = { color: "FFFFFF" };
        slide.addImage({ data, x: (slideW - w) / 2, y: (slideH - h) / 2, w, h });
        ctx.progress((p / doc.numPages) * 0.9, "Rendering slide " + p + " of " + doc.numPages + "…");
        await PD.tick();
      }
      ctx.progress(0.95, "Packing presentation…");
      let out = await pptx.write({ outputType: "blob" });
      if (!(out instanceof Blob)) out = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
      return {
        name: PD.base(ctx.files[0].name) + ".pptx",
        blob: out,
        note: doc.numPages + " slides created. Each page is a full-slide image, so text is not editable in PowerPoint."
      };
    }
  });

  /* ------------------------------------------------------------
     PDF → TEXT
     ------------------------------------------------------------ */
  PD.registerTool({
    id: "pdf-to-text",
    name: "PDF to Text",
    desc: "Extract clean, readable plain text from any text-based PDF.",
    cat: "convert",
    icon: "doc",
    accept: ".pdf",
    multiple: false,
    tag: "TXT",
    options: [
      { key: "pages", label: "Pages", type: "text", value: "", placeholder: "All pages — or e.g. 1-5" },
      { key: "markers", label: "Page markers", type: "checkbox", value: true, text: "Insert “— Page N —” between pages" }
    ],
    async run(ctx) {
      const doc = await PD.pdfjs(ctx.files[0].bytes);
      const indices = PD.ranges(ctx.opts.pages, doc.numPages);
      const parts = [];
      for (let i = 0; i < indices.length; i++) {
        const page = await doc.getPage(indices[i] + 1);
        const lines = await pageLines(page);
        if (ctx.opts.markers) parts.push("\n— Page " + (indices[i] + 1) + " —\n");
        parts.push(lines.map((l) => l.text).join("\n"));
        ctx.progress((i + 1) / indices.length, "Reading page " + (indices[i] + 1) + "…");
        await PD.tick();
      }
      const text = parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      if (!text) throw new Error("No selectable text was found. This PDF is probably a scan — try OCR instead.");
      return {
        name: PD.base(ctx.files[0].name) + ".txt",
        blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
        note: text.split(/\s+/).length.toLocaleString() + " words extracted from " + indices.length + " page" + (indices.length === 1 ? "" : "s") + "."
      };
    }
  });

  /* ------------------------------------------------------------
     OCR
     ------------------------------------------------------------ */
  let tessLoader = null;

  /* Tesseract.js v5 returns a nested block/paragraph/line/word tree.
     Older versions exposed `data.words` directly; support both so the
     invisible text layer keeps working. */
  function tesseractWords(data) {
    if (!data) return [];
    if (Array.isArray(data.words)) return data.words;
    const out = [];
    for (const block of data.blocks || []) {
      for (const para of block.paragraphs || []) {
        for (const line of para.lines || []) {
          for (const word of line.words || []) out.push(word);
        }
      }
    }
    return out;
  }

  function loadTesseract() {    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tessLoader) return tessLoader;
    tessLoader = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      s.async = true;
      s.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error("The OCR engine failed to initialise.")));
      s.onerror = () => reject(new Error("The OCR engine needs an internet connection the first time. Connect once, then it is cached."));
      document.head.appendChild(s);
    });
    return tessLoader;
  }

  PD.registerTool({
    id: "ocr",
    name: "OCR PDF",
    desc: "Make scanned documents searchable, or pull out their text.",
    cat: "optimize",
    icon: "ocr",
    accept: ".pdf",
    multiple: false,
    tag: "OCR",
    options: [
      {
        key: "lang",
        label: "Language",
        type: "select",
        value: "eng",
        choices: [
          { value: "eng", label: "English" },
          { value: "spa", label: "Spanish" },
          { value: "fra", label: "French" },
          { value: "deu", label: "German" },
          { value: "por", label: "Portuguese" },
          { value: "ita", label: "Italian" },
          { value: "nld", label: "Dutch" },
          { value: "tur", label: "Turkish" },
          { value: "pol", label: "Polish" },
          { value: "rus", label: "Russian" },
          { value: "ara", label: "Arabic" },
          { value: "hin", label: "Hindi" },
          { value: "chi_sim", label: "Chinese (simplified)" },
          { value: "jpn", label: "Japanese" }
        ]
      },
      {
        key: "output",
        label: "Output",
        type: "select",
        value: "pdf",
        choices: [
          { value: "pdf", label: "Searchable PDF (image + hidden text)" },
          { value: "txt", label: "Plain text (.txt)" }
        ]
      },
      { key: "pages", label: "Pages", type: "text", value: "", placeholder: "All pages — or e.g. 1-10", help: "OCR is slow; try a few pages first." },
      { type: "note", text: "The first run downloads the OCR engine and language data (about 10–20 MB). Recognition then happens locally.", info: true }
    ],
    async run(ctx) {
      const Tesseract = await loadTesseract();
      const file = ctx.files[0];
      const doc = await PD.pdfjs(file.bytes);
      const indices = PD.ranges(ctx.opts.pages, doc.numPages);
      if (indices.length > 150) throw new Error("Please OCR 150 pages or fewer at a time.");
      const lang = ctx.opts.lang || "eng";
      ctx.progress(0.01, "Loading OCR engine…");
      const worker = await Tesseract.createWorker(lang, 1, {
        logger: (m) => {
          if (m && m.progress != null) {
            ctx.progress(0.02 + (m.progress * 0.9), (m.status || "Recognising text") + "…");
          }
        }
      });

      try {
        const results = [];
        const wantsPdf = ctx.opts.output !== "txt";
        for (let i = 0; i < indices.length; i++) {
          const page = await doc.getPage(indices[i] + 1);
          const shot = await PD.renderPage(page, 2, "image/jpeg", 0.9);
          ctx.progress(0.05 + (i / indices.length) * 0.85, "Recognising page " + (indices[i] + 1) + "…");
          const res = await worker.recognize(shot.canvas);
          results.push({
            page: indices[i] + 1,
            text: (res.data && res.data.text) || "",
            words: wantsPdf ? tesseractWords(res.data) : [],
            blob: wantsPdf ? shot.blob : null,
            vp: wantsPdf ? page.getViewport({ scale: 1 }) : null
          });
          // The canvas is no longer needed — release it page by page so large
          // documents do not hold hundreds of full-resolution bitmaps in memory.
          shot.canvas.width = 0;
          shot.canvas.height = 0;
          try { page.cleanup(); } catch (e) {}
          await PD.tick();
        }

        if (!wantsPdf) {
          const text = results
            .map((r) => "\n— Page " + r.page + " —\n" + (r.text || ""))
            .join("\n")
            .trim();
          return {
            name: PD.base(file.name) + "-ocr.txt",
            blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
            note: "Recognised " + results.length + " page" + (results.length === 1 ? "" : "s") + " in “" + lang + "”."
          };
        }

        const out = await PD.create();
        const font = await out.embedFont(PD.StandardFonts.Helvetica);
        let dropped = 0;
        for (const r of results) {
          const w = r.vp.width;
          const h = r.vp.height;
          const page = out.addPage([w, h]);
          const img = await out.embedJpg(await r.blob.arrayBuffer());
          page.drawImage(img, { x: 0, y: 0, width: w, height: h });
          const words = r.words;
          for (const word of words) {
            if (!word.text || !word.bbox) continue;
            const safe = String(word.text).replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "");
            if (!safe.trim()) { dropped++; continue; }
            const bx = word.bbox;
            const size = Math.max(4, ((bx.y1 - bx.y0) / 2) * 0.92);
            const x = bx.x0 / 2;
            const y = h - bx.y1 / 2;
            try {
              page.drawText(safe, { x, y, size, font, color: PD.rgb(0, 0, 0), opacity: 0 });
            } catch (e) {
              dropped++;
            }
          }
          ctx.progress(0.9 + ((results.indexOf(r) + 1) / results.length) * 0.08, "Building searchable PDF…");
          await PD.tick();
        }
        return {
          name: PD.base(file.name) + "-ocr.pdf",
          blob: await PD.pdfBlob(out),
          note:
            "Searchable PDF with an invisible text layer (" + results.length + " pages)." +
            (dropped ? " Some non-Latin characters could not be embedded; use the text output for those languages." : "")
        };
      } finally {
        try { await worker.terminate(); } catch (e) {}
      }
    }
  });
})();
