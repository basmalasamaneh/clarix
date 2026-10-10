# Phase 10 — changed and added user-facing messages

All strings live in `artifacts/clarix/src/lib/phase10-i18n.ts` (deep-merged over earlier bundles; original files untouched). EN and AR changed together.

## Changed (plainer: what happened + what to do)
| Key | Old (EN) | New (EN) |
|---|---|---|
| errors.generic | The request could not be completed. Try again in a moment. | Something went wrong on our side. Nothing was changed. Try again in a moment. |
| errors.network | Clarix could not reach the server. Check your connection. | Clarix cannot reach the server. Check your internet connection, then try again. |
| errors.codes.csrf_invalid / invalid_csrf | Your session security token expired. Reload and try again. | Your page was open for too long. Reload the page, then try again. |
| errors.codes.invalid_request / validation_error | The request was not valid. Check the fields and try again. | Some information is missing or not valid. Check the highlighted fields and try again. |
| errors.codes.not_member | You are not a member of that factory. | ...Ask its factory manager to invite you. |
| errors.codes.factory_not_found | That factory is not available to you. | ...Choose another factory from the top bar. |
| states.sessionErrorBody | The server did not respond as expected. Your data is safe; nothing was changed. | Clarix could not load your account just now. Your data is safe and nothing was changed. Try again. |
| pages.overview.emptyBody | Once a file has been imported, checked and approved... | Nothing has been approved yet. Start with Data imports: upload a CSV file, check it, and approve it. ... |
| pages.runs.emptyBody | Runs appear after an import is approved... | No runs yet. Start with Data imports: ... Then pick two runs to compare. |
| pages.comparison.emptyBody | Comparisons need two runs from approved data... | Choose two runs on the Production runs page to compare them. ... |
| pages.quality.emptyBody | When imported files contain duplicates... | No problems to review. When an imported file has duplicates... |
| tour.s1Body..s3Body, s2Title | (3-step tour about factory/role/language) | Shortened; step 2 now "Import, check, compare". |

## Added
- `errors.codes.too_many_rows`: “This file exceeds 100,000 rows. Split it into smaller files, then upload again.” / “يتجاوز هذا الملف 100,000 صف. قسّمه إلى ملفات أصغر ثم أعد رفعه.”
- Final correction to `errors.generic` and `errors.status.500`: “Something went wrong on our side. Reload to check the latest state before trying again.” / “حدث خطأ من جهتنا. أعد التحميل للتحقق من الحالة الحالية قبل المحاولة مجددًا.” This deliberately avoids promising that a failed response means no change was committed.
- errors.status.404, 413, 500, 502, 503 (friendly; previously fell back to generic).
- states.crashTitle / crashBody / crashAction / crashCode (500 screen, replaces hardcoded English boundary fallback; never shows error message or stack).
- states.forbiddenCode, states.notFoundCode (403/404 screens show "Error 403/404" localised).
- tour.s4Title / s4Body, common.dismiss (close button label).
- nav.help, nav.helpSection, help.* (Help page).

## i18n audit limitations
- `pnpm --filter @workspace/clarix run check:i18n` (also runs before `build`) fails on EN/AR key parity gaps and on literal `t('a.b')` / `i18nKey="a.b"` keys missing in either language. Plural suffixes (`_one`, `_few`...) are normalised to the base key.
- Dynamic keys (template literals such as ``t(`nav.${p}`)``, variables, keys built from API codes) are NOT verified.
- Hardcoded-string detection is a regex over JSX text nodes and is report-only. It misses strings in attributes (aria-label, placeholder, title) and in JS string literals; it flags false positives (e.g. generics). Current report: brand name "Clarix" (intentional), and the default ErrorBoundary fallback in error-boundary.tsx (now unused: both boundaries pass the localised CrashScreen).
- Server-sent free text is not translated; only known error codes/statuses map to keys.
