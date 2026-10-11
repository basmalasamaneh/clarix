# Phase 19 — frontend string inventory

## Terminology audit (artifacts/clarix/src)
- Scrap: displayed Arabic term is **الهدر**. `grep هالك` over frontend sources: 0 hits; no change needed.
- Run: displayed Arabic term is **تشغيلة / التشغيلات**. No دفعة/batch display strings found. Input synonyms (هالك، تالف، سكراب، دفعة) are parser-side and untouched.
- Brand: always Latin "Clarix". Display normaliser `lib/number-format.ts` already rewrites كلاريكس -> Clarix.
- Refusal: `as.status.unsupported` rendered once (assist-common.tsx shows server message OR fallback, never both), wrapped with `whitespace-pre-wrap` + `overflow-wrap:anywhere`, no truncation.

## New keys (lib/phase19-i18n.ts, EN + AR parity)
| Key | EN | AR |
|---|---|---|
| p19.howTo.label | How to read this page | كيف تقرأ هذه الصفحة |
| p19.howTo.overview | Each tile is one figure... | كل بطاقة رقم واحد... |
| p19.howTo.comparison | Read top to bottom... Difference is Run B minus Run A... | اقرأ من الأعلى إلى الأسفل... |
| p19.howTo.quality | Each row is one problem found during import... | كل صف مشكلة واحدة... |
| as.ask.unavailableHint | AI is not available on this server. Typed questions are off; the example questions above still work. | الذكاء الاصطناعي غير متاح على هذا الخادم... |

## Removed duplicate
- comparison.tsx downtime section: removed second `rc.cmp.separateLine`. Disclaimer now appears once in summary (`text-downtime-separate`) and once in downtime section (`text-downtime-note`).

## Demo mode (item 6) — new keys p19.demo.* (EN + AR) in lib/phase19-i18n.ts
add, title, body, facts1 (synthetic only, two sample sources via normal pipeline), facts2 (no real data copied, no accounts generated), facts3 (suspension keeps data and stops access; no hard delete), confirm, confirmRequired, emailOptional, emailHint, submit, working, done, badge ("DEMO", Latin in both languages), banner.

## Demo synthetic-only safety
- p19.demo.banner reworded (EN/AR): production records are synthetic samples; notes may be user-entered.
- New p19.demo.importsOff (EN/AR): uploads off in demo factory, past imports readable. Imports page hides New import, new-import form and wizard edit controls when active membership.demo (API returns 403 for POST /imports).

## Count grammar
- Count grammar in both number-format.ts copies was corrected by the parent agent from طلب forms to تشغيلة forms (not changed in this frontend pass).
