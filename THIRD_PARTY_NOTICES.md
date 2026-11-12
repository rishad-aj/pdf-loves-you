# Third-party notices

PDF Loves You's original application code, copy and artwork are independent work. The
project bundles the following third-party software and assets. Each remains the
property of its authors and is used under the license shown.

| Component | Version | License | Source |
| --- | --- | --- | --- |
| PDF.js | 3.11.174 | Apache License 2.0 | https://github.com/mozilla/pdf.js |
| @cantoo/pdf-lib (fork of pdf-lib) | 2.11.1 | MIT | https://github.com/cantoo-scribe/pdf-lib |
| JSZip | 3.10.1 | MIT (or GPLv3) | https://github.com/Stuk/jszip |
| docx | 9.15.3 | MIT | https://github.com/dolanmiu/docx |
| SheetJS Community Edition | 0.18.5 | Apache License 2.0 | https://github.com/SheetJS/sheetjs |
| PptxGenJS | 4.0.1 | MIT | https://github.com/gitbrent/PptxGenJS |
| Tesseract.js | 5.x (loaded on demand) | Apache License 2.0 | https://github.com/naptha/tesseract.js |
| Tesseract OCR / tessdata | 4.x / 5.x (loaded on demand) | Apache License 2.0 | https://github.com/tesseract-ocr |
| Inter typeface | local woff2 | SIL Open Font License 1.1 | https://github.com/rsms/inter |

## Bundled font and CMap resources

PDF.js ships standard-font substitutes and CMap data used when rendering PDFs
that reference non-embedded fonts or CJK encodings:

- `vendor/standard_fonts/` — Foxit PDF standard fonts and Liberation Sans,
  covered by `LICENSE_FOXIT` and `LICENSE_LIBERATION` in that folder.
- `vendor/cmaps/` — Adobe CMap resources, covered by `vendor/cmaps/LICENSE`.

## Notes

- PDF.js is used for rendering, previews, text extraction and page geometry.
- @cantoo/pdf-lib is used for PDF creation, editing, AES encryption and PDF/A
  conversion. It is a fork of the MIT-licensed pdf-lib project by Andrew Dillon.
- Tesseract.js and its language data are **not** bundled. They are downloaded
  from jsDelivr on the first OCR run and then cached by the browser.
- No third-party code, copy or asset in this folder is taken from iLovePDF,
  Adobe, or any other commercial PDF service.

Full license texts are available at the source links above. When redistributing
this project, keep this file with the bundled libraries.
