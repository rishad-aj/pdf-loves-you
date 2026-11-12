# PDF Loves You

**Live site:** https://rishad-aj.github.io/pdf-loves-you/

PDF Loves You is a complete, free PDF toolkit that runs entirely in your browser. It has **23 tools** covering everyday PDF jobs — merging, splitting, compressing, converting, editing, signing and protecting — with **no accounts, uploads, watermarks, ads or download limits**.

The interface is an original design inspired by the clean, glassy look of modern web utilities such as instadrop. The code, copy and artwork in this folder are original and are not copied from iLovePDF, Adobe or any other service.

---

## Quick start

### Option 1 — just open the page

Double-click **`index.html`**.

The whole app is plain HTML, CSS and JavaScript. Chrome and Edge can run it directly from disk, including PDF previews, the editors and downloads. No installation, build step or internet connection is required for the normal tools.

### Option 2 — run the tiny local server (recommended)

Double-click **`start.bat`**, or run:

```bash
node server.js
```

Then open **http://127.0.0.1:5173**.

`server.js` is a dependency-free static file server. It binds to `127.0.0.1` only, serves files from this folder, and never accepts uploads. Use this option if your browser is strict about `file://` pages or if you want the most consistent experience across browsers.

Node.js is only needed for the local server. All PDF processing still happens in the browser.

---

## The 23 tools

### Organize

| Tool | What it does |
| --- | --- |
| **Merge PDF** | Combine several PDFs in any order. Reorder files before merging. |
| **Split PDF** | Split by ranges, fixed intervals or individual pages, with optional ZIP output. |
| **Organize PDF** | Reorder, rotate and delete pages with a thumbnail grid. |
| **Rotate PDF** | Rotate all or selected pages by 90°, 180° or 270°. |
| **Extract pages** | Pull out selected pages as one PDF, or one PDF per page in a ZIP. |

### Optimize

| Tool | What it does |
| --- | --- |
| **Compress PDF** | Lossless rebuild, or rasterise to 150/120/96 DPI JPEG for stronger savings. |
| **Repair PDF** | Rebuild the document structure; if that fails, re-render every page into a clean PDF. |
| **OCR PDF** | Recognise text in scans and produce a searchable PDF or a plain text file. |

### Convert

| Tool | What it does |
| --- | --- |
| **PDF to JPG** | Export pages as JPG images, individually or as a ZIP. |
| **JPG to PDF** | Turn JPG/PNG images into a PDF, one image per page. |
| **PDF to Word** | Rebuild the text and basic layout as a `.docx` file. |
| **PDF to Excel** | Turn positioned text into a spreadsheet, with table detection. |
| **PDF to PowerPoint** | Render pages and place them on slides in a `.pptx` deck. |
| **PDF to Text** | Extract selectable text as a `.txt` file. |

### Edit

| Tool | What it does |
| --- | --- |
| **Page numbers** | Stamp page numbers in any corner, with custom format, size, colour and page range. |
| **Watermark PDF** | Add a text or logo watermark, tiled or positioned, with adjustable opacity and rotation. |
| **Crop PDF** | Set a CropBox visually to hide margins on every page. |
| **Redact PDF** | Black out areas and flatten pages so the hidden content is actually removed. |
| **Sign PDF** | Draw or upload a signature and place it on any page. |
| **Add text to PDF** | Place real, selectable text labels on a page. |

### Security

| Tool | What it does |
| --- | --- |
| **Protect PDF** | Add an open password and permission flags with AES-256 or AES-128 encryption. |
| **Unlock PDF** | Remove a password or restrictions from a PDF you own. |
| **Convert to PDF/A** | Add PDF/A identifiers, XMP metadata and an sRGB output intent (1b, 2b, 2u, 3b, 3u). |

---

## Privacy

- Files are read with the browser's `File` API and processed in memory.
- Nothing is uploaded to a server. There is no backend, storage bucket, analytics or account system.
- The local server only serves the app's own static files.
- The only online request is the first OCR run, which downloads the Tesseract.js engine and language data from jsDelivr. After that, OCR data is cached by the browser. All other tools work offline once the page has loaded.

---

## What is under the hood

| Component | Version | Purpose |
| --- | --- | --- |
| [PDF.js](https://mozilla.github.io/pdf.js/) | 3.11.174 | Rendering, previews, text extraction, page geometry |
| [@cantoo/pdf-lib](https://github.com/cantoo-scribe/pdf-lib) | 2.11.1 | PDF creation/editing, AES encryption, PDF/A conversion |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | ZIP downloads |
| [docx](https://docx.js.org/) | 9.15.3 | Word output |
| [SheetJS](https://sheetjs.com/) | 0.18.5 | Excel output |
| [PptxGenJS](https://gitbrent.github.io/PptxGenJS/) | 4.0.1 | PowerPoint output |
| [Tesseract.js](https://tesseract.projectnaptha.com/) | 5.x | OCR (loaded on demand) |
| [Inter](https://rsms.me/inter/) | local woff2 | UI typeface |

All libraries except Tesseract.js are vendored inside `vendor/`, so the app does not depend on a CDN for normal use. See **[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)** for licenses and attribution.

---

## Known limitations

These are honest trade-offs of doing everything locally in a browser:

- **Word, Excel and PowerPoint output is a reconstruction, not a pixel-perfect round-trip.** Complex layouts, columns, charts, embedded fonts and floating objects may look different. PDF to PowerPoint renders each page as an image.
- **PDF to Excel** uses text positions and simple table detection. Scans need OCR first.
- **PDF/A conversion** adds the required identifier, XMP metadata and sRGB output intent, but full conformance also depends on the source fonts and content. Validate archival output with [veraPDF](https://verapdf.org/) before relying on it.
- **Encryption permissions are advisory.** PDF readers are expected to honour printing/copying/editing flags, but a determined user with an owner password or a permissive tool can bypass them. The open password itself is real AES encryption.
- **Redaction flattens every page to an image.** That is deliberate: it removes the underlying text instead of merely covering it. The output is not searchable.
- **Crop changes the CropBox.** Content outside the visible area is hidden, not deleted from the file. Use Redact if the content must be destroyed.
- **Unlock** creates a fresh unencrypted copy. Bookmarks, form fields and attachments may not survive.
- **OCR** produces an invisible text layer for Latin characters. For non-Latin languages, use the plain-text output. The first run needs internet access.
- **Compress** returns the original file when rebuilding or rasterising would not make it smaller.
- **Sign** places a signature image. It is not a certificate-based digital signature and does not provide cryptographic proof of identity.
- **Very large files** are limited by available browser memory. Close other tabs if a job runs out of memory.
- **Cross-browser `file://` support varies.** Chrome and Edge work well; for Firefox/Safari or the most predictable behaviour, use `start.bat`/`server.js`.

---

## Project layout

```text
pdf/
├─ index.html                 App shell, icon sprite, marketing page
├─ css/styles.css             Full light/dark theme and responsive layout
├─ js/
│  ├─ app.js                  Router, workspace, options, results, theme
│  ├─ helpers.js              Shared PDF.js/pdf-lib utilities and PageView
│  └─ tools/
│     ├─ organize.js          Merge, split, organize, rotate, extract
│     ├─ convert.js           Image/Office/text conversions + OCR
│     ├─ edit.js              Page numbers, watermark, crop, redact, sign, text
│     └─ security.js          Compress, repair, protect, unlock, PDF/A
├─ vendor/                    PDF.js, pdf-lib, JSZip, docx, SheetJS, PptxGenJS
├─ assets/inter.woff2         Local Inter font
├─ server.js                  Dependency-free localhost static server
├─ start.bat                  Windows launcher for server.js
├─ README.md                  This file
└─ THIRD_PARTY_NOTICES.md     Licenses and attribution
```

The project has **no runtime dependencies** — all third-party libraries are already vendored. There is no `node_modules` folder, package install or build step. `server.js` uses only Node's built-in modules.

---

## Development notes

- There is no build step. Edit the files and refresh the page.
- Tools register themselves with `PD.registerTool({ id, name, options, mount, run, ... })`.
- Interactive editors use `PD.PageView` from `js/helpers.js`.
- PDF.js documents are tracked in `PD.openDocs` and released when files change or a job finishes.
- For `file://` use, the PDF.js worker is embedded as a Blob URL by `vendor/pdf.worker.blob.js`.

---

## Credits and license

Original code, copy and artwork: free for personal and commercial use.

Third-party libraries retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Disclaimer

PDF Loves You is an independent project. It is **not affiliated with, endorsed by, or connected to iLovePDF, Adobe, instadrop, or any other brand**. Product names and trademarks belong to their respective owners. The visual style is an original interpretation of current web-utility design, not a copy of another service's assets.

Only process documents you own or have permission to modify. Features such as Unlock PDF are intended for recovering your own files, not for bypassing someone else's protection.
