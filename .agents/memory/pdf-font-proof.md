---
name: PDF embedded-font verification
description: Chromium variable-font Type 3 output needs a different embedding check
---
Do not treat an empty PyMuPDF extract_font result as proof of missing fonts.
Chromium can encode Inter variable fonts as embedded Type 3 CharProcs.

**Why:** The report PDFs had correctly embedded Inter glyphs but the initial
standalone-font-file check falsely reported missing fonts.

**How to apply:** Use Poppler pdffonts embedding flags for Type 3 and normal
fonts, alongside text extraction and rasterised Arabic pages. A font table
does not replace the user's visual review of Arabic quality.
