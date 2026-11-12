/* ============================================================
   Optimise & security tools — compress, repair, protect,
   unlock and PDF/A conversion
   ============================================================ */
(function () {
  "use strict";
  const PD = window.PD;

  function toast(msg, type) {
    if (window.PDUI && window.PDUI.toast) window.PDUI.toast(msg, type);
  }

  function bytesBlob(bytes) {
    return new Blob([bytes], { type: "application/pdf" });
  }

  function savingsText(before, after) {
    if (!before) return "";
    if (after >= before) return "The result is " + PD.size(after) + ", which is no smaller than the original.";
    const pct = Math.max(1, Math.round((1 - after / before) * 100));
    return PD.size(before) + " → " + PD.size(after) + " (" + pct + "% smaller).";
  }

  function copyMetadata(src, out) {
    const map = [
      ["getTitle", "setTitle"],
      ["getAuthor", "setAuthor"],
      ["getSubject", "setSubject"],
      ["getKeywords", "setKeywords"],
      ["getCreator", "setCreator"],
      ["getProducer", "setProducer"]
    ];
    for (const [get, set] of map) {
      try {
        const value = src[get]();
        if (value) out[set](value);
      } catch (e) {
        /* metadata is optional */
      }
    }
  }

  /* ------------------------------------------------------------
     COMPRESS
     ------------------------------------------------------------ */
  const COMPRESS_PRESETS = {
    light: { dpi: 150, quality: 0.78, label: "light" },
    balanced: { dpi: 120, quality: 0.68, label: "balanced" },
    strong: { dpi: 96, quality: 0.55, label: "strong" }
  };

  PD.registerTool({
    id: "compress",
    name: "Compress PDF",
    desc: "Shrink PDFs losslessly, or flatten them to compact images.",
    cat: "optimize",
    icon: "compress",
    accept: ".pdf",
    multiple: false,
    tag: "PDF",
    options: [
      {
        key: "level",
        label: "Compression level",
        type: "select",
        value: "lossless",
        choices: [
          { value: "lossless", label: "Lossless — keep text and quality" },
          { value: "light", label: "Light — 150 DPI images" },
          { value: "balanced", label: "Balanced — 120 DPI images" },
          { value: "strong", label: "Strong — 96 DPI images" }
        ],
        help: "Lossless rebuilds the file and keeps text selectable. The image levels rasterise every page."
      },
      {
        type: "note",
        text: "Lossless savings depend on how the PDF was made; already-optimised files may stay the same size.",
        showIf: { key: "level", in: ["lossless"] }
      },
      {
        type: "note",
        warn: true,
        text: "Image levels turn every page into a JPEG. Text stops being selectable and very fine line art may soften.",
        showIf: { key: "level", notIn: ["lossless"] }
      }
    ],
    async run(ctx) {
      const file = ctx.files[0];
      const inputSize = file.bytes.length;
      const level = ctx.opts.level || "lossless";

      if (level === "lossless") {
        ctx.progress(0.15, "Reading the document…");
        const doc = await PD.load(file.bytes);
        ctx.progress(0.55, "Rebuilding the file structure…");
        await PD.tick();
        const bytes = await PD.save(doc, { useObjectStreams: true });
        ctx.progress(0.95, "Saving…");
        if (bytes.length >= inputSize) {
          return {
            name: PD.base(file.name) + "-compressed.pdf",
            blob: bytesBlob(file.bytes),
            note: "This PDF is already well optimised. The original was kept because rebuilding it produced no saving."
          };
        }
        return {
          name: PD.base(file.name) + "-compressed.pdf",
          blob: bytesBlob(bytes),
          note: savingsText(inputSize, bytes.length) + " Text and vectors were preserved."
        };
      }

      const preset = COMPRESS_PRESETS[level] || COMPRESS_PRESETS.balanced;
      const pdf = await PD.pdfjs(file.bytes);
      const out = await PD.create();
      const scale = preset.dpi / 72;
      const total = pdf.numPages;

      for (let p = 1; p <= total; p++) {
        const page = await pdf.getPage(p);
        ctx.progress(0.05 + ((p - 1) / total) * 0.85, "Compressing page " + p + " of " + total + "…");
        const vp = page.getViewport({ scale: 1 });
        const shot = await PD.renderPage(page, scale, "image/jpeg", preset.quality);
        const img = await out.embedJpg(await shot.blob.arrayBuffer());
        const outPage = out.addPage([vp.width, vp.height]);
        outPage.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
        shot.canvas.width = 0;
        shot.canvas.height = 0;
        try { page.cleanup(); } catch (e) {}
        await PD.tick();
      }

      ctx.progress(0.94, "Saving compressed PDF…");
      const bytes = await PD.save(out);
      if (bytes.length >= inputSize) {
        return {
          name: PD.base(file.name) + "-compressed.pdf",
          blob: bytesBlob(file.bytes),
          note: "The image version was larger than the original, so the original file was returned. Rasterising works best on image-heavy or scanned PDFs."
        };
      }
      return {
        name: PD.base(file.name) + "-compressed.pdf",
        blob: bytesBlob(bytes),
        note: savingsText(inputSize, bytes.length) + " Rendered at " + preset.dpi + " DPI as JPEG images."
      };
    }
  });

  /* ------------------------------------------------------------
     REPAIR
     ------------------------------------------------------------ */
  PD.registerTool({
    id: "repair",
    name: "Repair PDF",
    desc: "Rebuild a damaged or stubborn PDF into a clean, openable file.",
    cat: "optimize",
    icon: "repair",
    accept: ".pdf",
    multiple: false,
    tag: "PDF",
    options: [
      {
        key: "password",
        label: "Password",
        type: "text",
        value: "",
        placeholder: "Only if the file asks for one",
        help: "Leave blank for normal or owner-restricted files."
      },
      { type: "note", text: "PDF Loves You first rebuilds the document structure. If that isn't possible, every page is re-rendered into a clean PDF (text then becomes an image)." }
    ],
    async run(ctx) {
      const file = ctx.files[0];
      const password = String(ctx.opts.password || "");
      let pages = 0;

      const rebuild = async () => {
        const src = await PD.load(file.bytes, { password: password, throwOnInvalidObject: false });
        const out = await PD.create();
        const indices = src.getPageIndices();
        ctx.progress(0.35, "Copying pages into a fresh document…");
        const copied = await out.copyPages(src, indices);
        copied.forEach((page) => out.addPage(page));
        copyMetadata(src, out);
        pages = indices.length;
        ctx.progress(0.75, "Writing repaired file…");
        return PD.pdfBlob(out);
      };

      const flatten = async () => {
        const pdf = await PD.pdfjs(file.bytes, password);
        const out = await PD.create();
        pages = pdf.numPages;
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          ctx.progress(0.1 + ((p - 1) / pdf.numPages) * 0.82, "Recovering page " + p + " of " + pdf.numPages + "…");
          const vp = page.getViewport({ scale: 1 });
          const shot = await PD.renderPage(page, 2, "image/jpeg", 0.86);
          const img = await out.embedJpg(await shot.blob.arrayBuffer());
          const outPage = out.addPage([vp.width, vp.height]);
          outPage.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
          shot.canvas.width = 0;
          shot.canvas.height = 0;
          try { page.cleanup(); } catch (e) {}
          await PD.tick();
        }
        ctx.progress(0.94, "Saving recovered file…");
        return PD.pdfBlob(out);
      };

      try {
        const blob = await rebuild();
        // Make sure the result can actually be opened again.
        ctx.progress(0.9, "Verifying the repair…");
        const check = await PD.load(new Uint8Array(await blob.arrayBuffer()), { throwOnInvalidObject: false });
        if (check.getPageCount() !== pages) throw new Error("Page count changed during repair.");
        ctx.progress(1, "Done");
        return {
          name: PD.base(file.name) + "-repaired.pdf",
          blob,
          note: "Rebuilt the document structure and preserved all " + pages + " page" + (pages === 1 ? "" : "s") + ", including selectable text."
        };
      } catch (firstError) {
        if (!password && /encrypted|password/i.test(String(firstError && firstError.message))) {
          throw new Error("This PDF is password-protected. Enter its password above, or use Unlock PDF first.");
        }
        try {
          const blob = await flatten();
          return {
            name: PD.base(file.name) + "-repaired.pdf",
            blob,
            note: "The structure could not be rebuilt, so all " + pages + " page" + (pages === 1 ? "" : "s") + " were re-rendered into a clean PDF. Text is no longer selectable."
          };
        } catch (secondError) {
          throw new Error("This PDF is too damaged to recover in the browser. " + PD.friendlyError(secondError));
        }
      }
    }
  });

  /* ------------------------------------------------------------
     PROTECT
     ------------------------------------------------------------ */
  const PERMISSIONS = [
    { key: "permPrint", label: "Printing", value: true, text: "Allow printing" },
    { key: "permCopy", label: "Copying", value: false, text: "Allow copying text and images" },
    { key: "permModify", label: "Editing", value: false, text: "Allow editing the content" },
    { key: "permAnnotate", label: "Comments", value: false, text: "Allow comments and annotations" },
    { key: "permForms", label: "Forms", value: true, text: "Allow filling in form fields" },
    { key: "permAccess", label: "Accessibility", value: true, text: "Allow screen-reader access" },
    { key: "permAssemble", label: "Assembly", value: false, text: "Allow inserting, rotating or deleting pages" }
  ];

  PD.registerTool({
    id: "protect",
    name: "Protect PDF",
    desc: "Add a password and control printing, copying and editing.",
    cat: "security",
    icon: "lock",
    accept: ".pdf",
    multiple: false,
    tag: "PDF",
    options: [
      {
        key: "userPassword",
        label: "Password to open",
        type: "text",
        value: "",
        placeholder: "e.g. a strong passphrase",
        help: "Leave blank to keep the file openable without a password but still restrict actions."
      },
      { key: "confirmPassword", label: "Confirm password", type: "text", value: "", placeholder: "Repeat the password" },
      {
        key: "ownerPassword",
        label: "Owner password",
        type: "text",
        value: "",
        placeholder: "Optional — for changing permissions",
        help: "If left blank, the open password is also used as the owner password."
      },
      {
        key: "algorithm",
        label: "Encryption",
        type: "select",
        value: "AES-256",
        choices: [
          { value: "AES-256", label: "AES-256 — recommended" },
          { value: "AES-128", label: "AES-128 — older viewers" }
        ]
      },
      { type: "note", text: "Permissions", info: true },
      ...PERMISSIONS,
      {
        type: "note",
        warn: true,
        text: "Permissions are enforced by PDF readers, not by cryptography. Anyone with an owner password (or a tool that ignores restrictions) can remove them."
      }
    ],
    async run(ctx) {
      const user = String(ctx.opts.userPassword || "");
      const confirm = String(ctx.opts.confirmPassword || "");
      const owner = String(ctx.opts.ownerPassword || "") || user;
      if (!user && !owner) throw new Error("Enter a password to protect the file with.");
      if (user && user !== confirm) throw new Error("The two passwords do not match. Check them and try again.");
      if (user && user.length < 4) throw new Error("Use a password with at least 4 characters. A longer passphrase is safer.");

      const doc = await PD.load(ctx.files[0].bytes);
      if (doc.isEncrypted) {
        throw new Error("This PDF is already protected. Use Unlock PDF first if you want to replace its password.");
      }
      const permissions = {
        printing: ctx.opts.permPrint ? "highResolution" : false,
        copying: !!ctx.opts.permCopy,
        modifying: !!ctx.opts.permModify,
        annotating: !!ctx.opts.permAnnotate,
        fillingForms: !!ctx.opts.permForms,
        contentAccessibility: !!ctx.opts.permAccess,
        documentAssembly: !!ctx.opts.permAssemble
      };
      const algorithm = ctx.opts.algorithm === "AES-128" ? "AES-128" : "AES-256";
      ctx.progress(0.45, "Encrypting with " + algorithm + "…");
      doc.encrypt({ userPassword: user, ownerPassword: owner, permissions, algorithm });
      ctx.progress(0.8, "Saving protected PDF…");
      await PD.tick();
      const blob = await PD.pdfBlob(doc);
      return {
        name: PD.base(ctx.files[0].name) + "-protected.pdf",
        blob,
        note:
          (user ? "A password is now required to open this file. " : "The file opens without a password, but actions are restricted. ") +
          "Encrypted with " + algorithm + "."
      };
    }
  });

  /* ------------------------------------------------------------
     UNLOCK
     ------------------------------------------------------------ */
  PD.registerTool({
    id: "unlock",
    name: "Unlock PDF",
    desc: "Remove a password or restrictions from a PDF you own.",
    cat: "security",
    icon: "unlock",
    accept: ".pdf",
    multiple: false,
    tag: "PDF",
    options: [
      {
        key: "password",
        label: "Current password",
        type: "text",
        value: "",
        placeholder: "Leave blank if none is required",
        help: "This is used only on your device to open the file."
      },
      { type: "note", warn: true, text: "Only unlock documents you own or have permission to modify." },
      { type: "note", text: "The result is a new, unencrypted PDF. Bookmarks, form fields and attachments may not be preserved." }
    ],
    async run(ctx) {
      const file = ctx.files[0];
      const password = String(ctx.opts.password || "");
      const before = await PD.pageCount(file.bytes);
      const wasEncrypted = !!before.encrypted;
      let src;
      try {
        src = await PD.load(file.bytes, { password: password });
      } catch (e) {
        const msg = String((e && e.message) || "");
        if (/password|encrypted/i.test(msg)) {
          throw new Error(password ? "That password did not work. Check it and try again." : "This PDF needs a password. Enter it above and try again.");
        }
        throw e;
      }
      const count = src.getPageCount();
      ctx.progress(0.4, "Decrypting " + count + " page" + (count === 1 ? "" : "s") + "…");
      const out = await PD.create();
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((page) => out.addPage(page));
      copyMetadata(src, out);
      ctx.progress(0.8, "Writing unlocked PDF…");
      const blob = await PD.pdfBlob(out);
      return {
        name: PD.base(file.name) + "-unlocked.pdf",
        blob,
        note:
          (wasEncrypted ? "Password and restrictions removed. " : "This file was not encrypted. ") +
          count + " page" + (count === 1 ? "" : "s") + " copied into a clean PDF."
      };
    }
  });

  /* ------------------------------------------------------------
     PDF/A
     ------------------------------------------------------------ */
  PD.registerTool({
    id: "pdfa",
    name: "Convert to PDF/A",
    desc: "Create an archival PDF/A copy with embedded colour metadata.",
    cat: "security",
    icon: "pdfa",
    accept: ".pdf",
    multiple: false,
    tag: "PDF/A",
    options: [
      {
        key: "conformance",
        label: "Conformance level",
        type: "select",
        value: "2B",
        choices: [
          { value: "2B", label: "PDF/A-2b — standard archival" },
          { value: "1B", label: "PDF/A-1b — strictest compatibility" },
          { value: "3B", label: "PDF/A-3b — allows attachments" },
          { value: "2U", label: "PDF/A-2u — Unicode text" },
          { value: "3U", label: "PDF/A-3u — Unicode + attachments" }
        ]
      },
      { type: "note", text: "This adds the PDF/A identifier, XMP metadata and an sRGB output intent. Full compliance also depends on the original fonts and content, so validate with veraPDF for legal archiving." }
    ],
    async run(ctx) {
      const level = String(ctx.opts.conformance || "2B");
      const doc = await PD.load(ctx.files[0].bytes);
      ctx.progress(0.45, "Adding archival metadata…");
      doc.convertToPDFA({ conformance: level });
      await PD.tick();
      ctx.progress(0.8, "Saving PDF/A…");
      // PDF/A-1 (ISO 19005-1, based on PDF 1.4) forbids object and
      // cross-reference streams, so those files must be saved the old way.
      const blob = await PD.pdfBlob(doc, { useObjectStreams: level !== "1B" });
      return {
        name: PD.base(ctx.files[0].name) + "-pdfa-" + level.toLowerCase() + ".pdf",
        blob,
        note: "Converted to PDF/A-" + level.charAt(0) + level.charAt(1).toLowerCase() + ". Validate the result with veraPDF before submitting it to an archive."
      };
    }
  });
})();
