# Arabic language and number formatting changes

Scope: wording and display formatting only. No calculation, value, status, fixture or layout logic changed.
Stored snapshot JSON is not modified; older saved template text is normalised only at display time
(`normalizeFixedText` + `splitSignedNumbers`, applied through `<NumText>` to fixed server templates only,
never to raw uploaded cells, identifiers or file names).

Notation: `NBSP` = U+00A0 no-break space, `−` = U+2212 minus sign. `{n}` = server numeric string, unchanged.

Legacy English snapshot sentences also receive display-only agreement:
`1 hours` → `1NBSPhour`, `-2 minute` → `−2NBSPminutes`,
`0.75 hour` → `0.75NBSPhours`. Stored sentences are not rewritten.

## Rule 1 Terminology (run = تشغيلة) and brand

| File | Before | After |
|---|---|---|
| clarix/src/lib/i18n.ts | تلخّص هذه الصفحة أحدث الدفعات وأي | تلخّص هذه الصفحة أحدث التشغيلات وأي |
| clarix/src/lib/i18n.ts | 'الدفعات الجاهزة للمقارنة' | 'التشغيلات الجاهزة للمقارنة' |
| clarix/src/lib/i18n.ts (x2) | 'دفعات الإنتاج' | 'تشغيلات الإنتاج' |
| clarix/src/lib/i18n.ts | 'كل دفعة من عمليات الاستيراد المعتمدة، قابلة للبحث والتصفية.' | 'كل تشغيلة من عمليات الاستيراد المعتمدة، قابلة للبحث والتصفية.' |
| clarix/src/lib/i18n.ts | 'لا توجد دفعات مسجّلة' | 'لا توجد تشغيلات مسجّلة' |
| clarix/src/lib/i18n.ts | 'تظهر الدفعات بعد اعتماد عملية استيراد. ومن هنا ستختار دفعتين للمقارنة.' | 'تظهر التشغيلات بعد اعتماد عملية استيراد. ومن هنا ستختار تشغيلتين للمقارنة.' |
| clarix/src/lib/i18n.ts | 'حالة الجودة بجانب كل دفعة' | 'حالة الجودة بجانب كل تشغيلة' |
| clarix/src/lib/i18n.ts | 'اختيار دفعتين لفتح مقارنة' | 'اختيار تشغيلتين لفتح مقارنة' |
| clarix/src/lib/i18n.ts | 'دفعتان جنبًا إلى جنب، وكل رقم مع مصدره.' | 'تشغيلتان جنبًا إلى جنب، وكل رقم مع مصدره.' |
| clarix/src/lib/i18n.ts | 'تحتاج المقارنة إلى دفعتين من بيانات معتمدة. | 'تحتاج المقارنة إلى تشغيلتين من بيانات معتمدة. |
| clarix/src/lib/i18n.ts | 'نسبة الهدر وزمن تغيير القالب للدفعة A والدفعة B' | 'نسبة الهدر وزمن تغيير القالب للتشغيلة أ والتشغيلة ب' |
| clarix/src/lib/sources-i18n.ts | 'يُعرَّف كل تشغيل بطلبه ومصدره.' | 'تُعرَّف كل تشغيلة بطلبها ومصدرها.' |
| clarix/src/lib/sources-i18n.ts | 'لا يوجد تشغيل يطابق هذا البحث.' | 'لا توجد تشغيلة تطابق هذا البحث.' |
| clarix/src/lib/sources-i18n.ts | 'التشغيل المختار' | 'التشغيلة المختارة' |
| clarix/src/lib/sources-i18n.ts | 'معرّف التشغيل' | 'معرّف التشغيلة' |
| clarix/src/lib/sources-i18n.ts | 'اختر تشغيلًا لعرض هويته.' | 'اختر تشغيلة لعرض هويتها.' |
| clarix/src/lib/sources-i18n.ts | 'اختر تشغيلين' | 'اختر تشغيلتين' |
| clarix/src/lib/sources-i18n.ts | 'اختر التشغيل الأيسر والأيمن. | 'اختر التشغيلة اليسرى واليمنى. |
| clarix/src/lib/sources-i18n.ts | 'التشغيل الأيسر' | 'التشغيلة اليسرى' |
| clarix/src/lib/sources-i18n.ts | 'التشغيل الأيمن' | 'التشغيلة اليمنى' |
| clarix/src/lib/sources-i18n.ts | 'اختر تشغيلين مختلفين.' | 'اختر تشغيلتين مختلفتين.' |
| clarix/src/lib/quality-i18n.ts | يتداخل مع تبديل في التشغيل نفسه. | يتداخل مع تبديل في التشغيلة نفسها. |
| clarix/src/lib/quality-i18n.ts | 'المصدر يعطي إجماليات التشغيل فقط دون صفوف منفردة.' | 'المصدر يعطي إجماليات التشغيلات فقط دون صفوف منفردة.' |
| clarix/src/lib/imports-i18n.ts (x6) | إجماليات التشغيل | إجماليات التشغيلات |
| clarix/src/lib/runs-i18n.ts | title: 'دفعات الإنتاج' | title: 'تشغيلات الإنتاج' |
| clarix/src/lib/runs-i18n.ts | اختر دفعتين بالضبط للمقارنة. | اختر تشغيلتين بالضبط للمقارنة. |
| clarix/src/lib/runs-i18n.ts | 'اختر دفعتين للمقارنة.' | 'اختر تشغيلتين للمقارنة.' |
| clarix/src/lib/runs-i18n.ts | 'اختر دفعة أخرى.' | 'اختر تشغيلة أخرى.' |
| clarix/src/lib/runs-i18n.ts | 'تم اختيار دفعتين. أزل واحدة لاختيار أخرى.' | 'تم اختيار تشغيلتين. أزل واحدة لاختيار أخرى.' |
| clarix/src/lib/runs-i18n.ts | 'جارٍ تحميل الدفعات' | 'جارٍ تحميل التشغيلات' |
| clarix/src/lib/runs-i18n.ts | 'تعذّر تحميل الدفعات' | 'تعذّر تحميل التشغيلات' |
| clarix/src/lib/runs-i18n.ts | 'لا توجد دفعات بعد' | 'لا توجد تشغيلات بعد' |
| clarix/src/lib/runs-i18n.ts | 'تظهر الدفعات بعد اعتماد عملية استيراد. لا تُعرض المصادر المؤرشفة.' | 'تظهر التشغيلات بعد اعتماد عملية استيراد. لا تُعرض المصادر المؤرشفة.' |
| clarix/src/lib/runs-i18n.ts | 'لا توجد دفعات مطابقة' | 'لا توجد تشغيلات مطابقة' |
| clarix/src/lib/runs-i18n.ts | 'مراجع المصدر للدفعات المفتوحة' | 'مراجع المصدر للتشغيلات المفتوحة' |
| clarix/src/lib/runs-i18n.ts | 'دفعتان جنبًا إلى جنب. كل رقم مرتبط بصفوف مصدره.' | 'تشغيلتان جنبًا إلى جنب. كل رقم مرتبط بصفوف مصدره.' |
| clarix/src/lib/runs-i18n.ts | 'العودة إلى الدفعات' | 'العودة إلى التشغيلات' |
| clarix/src/lib/runs-i18n.ts | 'تغيير الدفعات' | 'تغيير التشغيلات' |
| clarix/src/lib/runs-i18n.ts | runA: 'الدفعة أ' | runA: 'التشغيلة أ' |
| clarix/src/lib/runs-i18n.ts | runB: 'الدفعة ب' | runB: 'التشغيلة ب' |
| clarix/src/lib/runs-i18n.ts | توجد تحذيرات في دفعة واحدة على الأقل. | توجد تحذيرات في تشغيلة واحدة على الأقل. |
| clarix/src/lib/runs-i18n.ts | في هذه المجموعة لدفعة واحدة على الأقل، | في هذه المجموعة لتشغيلة واحدة على الأقل، |
| clarix/src/lib/runs-i18n.ts | 'اختر دفعتين للمقارنة', | 'اختر تشغيلتين للمقارنة', |
| clarix/src/lib/runs-i18n.ts | 'اذهب إلى دفعات الإنتاج، واختر دفعتين بالضبط، ثم اضغط قارن.' | 'اذهب إلى تشغيلات الإنتاج، واختر تشغيلتين بالضبط، ثم اضغط قارن.' |
| clarix/src/lib/runs-i18n.ts | 'اختيار الدفعات' | 'اختيار التشغيلات' |
| clarix/src/lib/runs-i18n.ts | 'يحتاج الرابط إلى معرّفين مختلفين لدفعتين. اختر الدفعات مرة أخرى.' | 'يحتاج الرابط إلى معرّفين مختلفين لتشغيلتين. اختر التشغيلات مرة أخرى.' |
| clarix/src/lib/runs-i18n.ts | 'الطرفان يشيران إلى الدفعة نفسها. اختر دفعتين مختلفتين.' | 'الطرفان يشيران إلى التشغيلة نفسها. اختر تشغيلتين مختلفتين.' |
| clarix/src/lib/runs-i18n.ts | 'هذه الدفعات غير متاحة' | 'هذه التشغيلات غير متاحة' |
| clarix/src/lib/runs-i18n.ts | 'دفعة واحدة أو كلتاهما ليست في هذا المصنع، | 'تشغيلة واحدة أو كلتاهما ليست في هذا المصنع، |
| clarix/src/lib/runs-i18n.ts | 'أي دفعة كان فيها هدر أكثر؟' | 'أي تشغيلة كان فيها هدر أكثر؟' |
| clarix/src/lib/source-i18n.ts | forRun: 'الدفعة المختارة' | forRun: 'التشغيلة المختارة' |
| clarix/src/lib/phase10-i18n.ts | ثم اختر تشغيلين للمقارنة. | ثم اختر تشغيلتين للمقارنة. |
| clarix/src/lib/phase10-i18n.ts | 'اختر تشغيلين من صفحة تشغيلات الإنتاج لمقارنتهما. | 'اختر تشغيلتين من صفحة تشغيلات الإنتاج لمقارنتهما. |
| clarix/src/lib/phase10-i18n.ts | ثم قارن بين تشغيلين. | ثم قارن بين تشغيلتين. |
| clarix/src/lib/phase10-i18n.ts | 'اختر تشغيلين من تشغيلات الإنتاج. | 'اختر تشغيلتين من تشغيلات الإنتاج. |
| clarix/src/lib/phase10-i18n.ts | سبّب فرقًا بين تشغيلين. | سبّب فرقًا بين تشغيلتين. |
| clarix/src/lib/overview-i18n.ts | 'أحدث تشغيلين قابلين للمقارنة | 'أحدث تشغيلتين قابلتين للمقارنة |
| clarix/src/lib/overview-i18n.ts | 'قارن هذين التشغيلين' | 'قارن هاتين التشغيلتين' |
| clarix/src/lib/overview-i18n.ts (x2) | تحتاج المقارنة إلى تشغيلين مؤرَّخين | تحتاج المقارنة إلى تشغيلتين مؤرَّختين |
| clarix/src/lib/overview-i18n.ts | 'اختر تشغيلين وشاهد ما تغيّر.' | 'اختر تشغيلتين وشاهد ما تغيّر.' |
| clarix/src/lib/phase14-i18n.ts | runs: 'الدفعات' | runs: 'التشغيلات' |
| clarix/src/lib/phase14-i18n.ts | 'قيم اليوم للدفعات نفسها كما قارنها Clarix. | 'قيم اليوم للتشغيلات نفسها كما قارنها Clarix. |
| clarix/src/lib/phase14-i18n.ts | run: 'دفعة الإنتاج' | run: 'تشغيلة الإنتاج' |
| clarix/src/lib/phase14-i18n.ts | 'تُحفظ الدفعتان وكل رقم | 'تُحفظ التشغيلتان وكل رقم |
| clarix/src/lib/phase14-i18n.ts | run: 'الدفعة', | run: 'التشغيلة', |
| clarix/src/lib/charts-i18n.ts | runA: 'التشغيل أ' | runA: 'التشغيلة أ' |
| clarix/src/lib/charts-i18n.ts | runB: 'التشغيل ب' | runB: 'التشغيلة ب' |
| clarix/src/lib/charts-i18n.ts | vsA: 'التشغيل أ' | vsA: 'التشغيلة أ' |
| clarix/src/lib/charts-i18n.ts | kpiLead: 'التشغيل ب، مع التغيّر عن التشغيل أ.' | kpiLead: 'التشغيلة ب، مع التغيّر عن التشغيلة أ.' |

## Rule 2 Plurals (Arabic CLDR forms for counted units)

| File | Before | After |
|---|---|---|
| clarix/src/lib/runs-i18n.ts |     count_one: '{{count}} دفعة', ⏎     count_other: '{{count}} دفعات', |     count_zero: '{{count}} تشغيلة', ⏎     count_one: 'تشغيلة واحدة', ⏎     count_two: 'تشغيلتان', ⏎     count_few: '{{count}} تشغيلات', ⏎     count_many: '{{count}} تشغيلة', ⏎     count_other: '{{count}} تشغيلة', |
| clarix/src/lib/imports-i18n.ts |     filesCount_other: '{{count}} ملفات', |     filesCount_zero: '{{count}} ملف', ⏎     filesCount_two: 'ملفان', ⏎     filesCount_few: '{{count}} ملفات', ⏎     filesCount_many: '{{count}} ملفًا', ⏎     filesCount_other: '{{count}} ملف', |
| clarix/src/lib/imports-i18n.ts |     replacement_other: 'الاعتماد سيستبدل البيانات الحالية لـ {{count}} طلبات.', |     replacement_two: 'الاعتماد سيستبدل البيانات الحالية لطلبين.', ⏎     replacement_few: 'الاعتماد سيستبدل البيانات الحالية لـ {{count}} طلبات.', ⏎     replacement_many: 'الاعتماد سيستبدل البيانات الحالية لـ {{count}} طلبًا.', ⏎     replacement_other: 'الاعتماد سيستبدل البيانات الحالية لـ {{count}} طلب.', |
| clarix/src/lib/imports-i18n.ts |     replaceConfirm_other: 'أفهم أن {{count}} طلبات ستُستبدل. تُحفظ الصفوف القديمة وتُعلَّم كمستبدلة.', |     replaceConfirm_two: 'أفهم أن طلبين سيُستبدلان. تُحفظ الصفوف القديمة وتُعلَّم كمستبدلة.', ⏎     replaceConfirm_few: 'أفهم أن {{count}} طلبات ستُستبدل. تُحفظ الصفوف القديمة وتُعلَّم كمستبدلة.', ⏎     replaceConfirm_many: 'أفهم أن {{count}} طلبًا سيُستبدل. تُحفظ الصفوف القديمة وتُعلَّم كمستبدلة.', ⏎     replaceConfirm_other: 'أفهم أن {{count}} طلب سيُستبدل. تُحفظ الصفوف القديمة وتُعلَّم كمستبدلة.', |

### Rule 1 — server fixed templates (artifacts/api-server)

| File | Before | After |
|---|---|---|
| api-server/src/metrics/charts.ts | `… · مثل التشغيل أ وفق دقة العرض` | `… · مثل التشغيلة أ وفق دقة العرض` |
| api-server/src/metrics/charts.ts | `… أعلى/أقل من التشغيل أ` | `… أعلى/أقل من التشغيلة أ` |
| api-server/src/metrics/charts.ts | `تبدأ الأعمدة من الصفر وبالمقياس نفسه للتشغيلين أ وب.` | `تبدأ الأعمدة من الصفر وبالمقياس نفسه للتشغيلتين أ وب.` |
| api-server/src/metrics/source-detail.ts | `الفرق = الدفعة ب − الدفعة أ` | `الفرق = التشغيلة ب − التشغيلة أ` |
| api-server/src/snapshots/reconciliation.ts | `لا تتوفر لدى كلاريكس قيمة لهذا الرقم.` | `لا تتوفر لدى Clarix قيمة لهذا الرقم.` |
| api-server/src/snapshots/reconciliation.ts | `تتطابق قيمة كلاريكس مع تقريرك لهذا الرقم.` | `تتطابق قيمة Clarix مع تقريرك لهذا الرقم.` |
| api-server/src/snapshots/reconciliation.ts | `يذكر تقريرك {r} {u}؛ ويحتسب كلاريكس {v} {u}. الفرق (التقرير − كلاريكس): {d} {u}. راجع الصفوف المصدر.` | `يذكر تقريرك {r}NBSP{unit(r)}، ويحتسب Clarix {v}NBSP{unit(v)}. الفرق (التقرير − Clarix): {d}NBSP{unit(d)}. راجع الصفوف المصدر.` |

## Rule 2 — plural-aware units (server templates)

| File | Before | After |
|---|---|---|
| metrics/i18n.ts (summary, AR) | `… بمقدار {v} نقاط مئوية.` (always نقاط) | `… بمقدار {v}NBSP{1: نقطة مئوية · 2: نقطتين مئويتين · 3–10: نقاط مئوية · 11+: نقطة مئوية}.` |
| metrics/i18n.ts (summary, EN) | `{v} percentage points more/less scrap` | `{v}NBSPpercentage point(s) …` (1 → singular) |
| metrics/i18n.ts (changeover answer, AR) | `{d} دقيقة ({h} ساعة)` | `{d}NBSP{دقيقة/دقيقتان/دقائق} ({h}NBSP{ساعة/ساعتان/ساعات})` |
| metrics/i18n.ts (changeover answer, EN) | `{d} minutes ({h} hours)` | `{d}NBSPminute(s) ({h}NBSPhour(s))` |
| metrics/i18n.ts (downtime answer) | `{n} دقيقة` / `{n} minutes` | `{n}NBSP{plural}` |
| metrics/charts.ts (changeText) | `{d} نقطة مئوية` / `{d} دقيقة` (fixed) | `{d}NBSP{plural, nominative}` |
| metrics/charts.ts (caption) | `بمقدار {n} نقطة مئوية/دقيقة` | `بمقدار {n}NBSP{plural, genitive}`; EN `{n}NBSP percentage point(s)/minute(s)` |
| metrics/source-detail.ts (overlap note) | `{n} دقيقة` / `{n} minutes` | `{n}NBSP{plural}` |
| reconciliation.ts (EN sentence) | `{v} kg` / `{v} min` | `{v}NBSPkg` / `{v}NBSPminute(s)` |

Frontend: every rendered number+unit (MetricValue, Source Drawer value/inputs/contributions/alternatives,
chart values/axis/data table/difference, KPI card, reconciliation table/cards, comparison alternatives) now goes
through `<Qty>` = `formatQuantity` (number + NBSP + plural-aware unit). Arabic hours `({h} ساعة)` is now plural-aware.

## Rule 3 — stray KPI value

| Before | After |
|---|---|
| visible line `التشغيل ب · E-02 · 10` (trailing aria-hidden number) | `التشغيلة ب · E-02` + screen-reader sentence `التشغيلة ب، E-02: 10NBSPبالمئة` (EN: `Run B, E-02: 10NBSPpercent`), new key `ch.kpiSr` |
| bar aria-label `{side} {label}: {v} {unit} · …` | `{side}، {label}: {v}NBSP{spoken plural unit} · …` |

## Rule 4 — spacing

One NBSP between every number and its unit, including `%` (`5 %` with NBSP) in tables, cards, charts, captions
and drawers, both languages. Older saved template text gets NBSP at display (`bindUnits`).

## Rule 5 — signs and direction

Signed server numbers render inside `<bdi dir="ltr">` with U+2212 for "-" (`-5` → `−5`, `+120` stays). In sentences
(summary, quick answers, captions, change chips, data-table notes, drawer breakdown/formula/notes, reconciliation
sentences/reasons) signed tokens are isolated at display. No LRM/RLM/isolate control characters are inserted into text,
so copied values contain only sign + digits. Identifiers (`E-02`), dates and spaced operators (`950 − 900`) are not touched.

## Rule 6 — other Arabic review

Plural keys (i18next Arabic categories zero/one/two/few/many/other):

| Key | Before | After |
|---|---|---|
| runs.count | one: `{{count}} دفعة`; other: `{{count}} دفعات` | zero `{{count}} تشغيلة`, one `تشغيلة واحدة`, two `تشغيلتان`, few `{{count}} تشغيلات`, many `{{count}} تشغيلة`, other `{{count}} تشغيلة` |
| imports filesCount | other: `{{count}} ملفات` | zero `{{count}} ملف`, two `ملفان`, few `{{count}} ملفات`, many `{{count}} ملفًا`, other `{{count}} ملف` |
| imports replacement | other: `… لـ {{count}} طلبات.` | two `… لطلبين.`, few `… لـ {{count}} طلبات.`, many `… لـ {{count}} طلبًا.`, other `… لـ {{count}} طلب.` |
| imports replaceConfirm | other: `أفهم أن {{count}} طلبات ستُستبدل…` | two `أفهم أن طلبين سيُستبدلان…`, few `… {{count}} طلبات ستُستبدل…`, many `… {{count}} طلبًا سيُستبدل…`, other `… {{count}} طلب سيُستبدل…` |

## Not changed on purpose

Accessibility-only chart tables are now clipped through a block wrapper rather
than putting `sr-only` on the table itself. A table's minimum content width was
escaping that hiding rule and widening the RTL page. The existing show/hide
control and visible table layout are unchanged.

- `imports-i18n.ts` `run: 'تشغيل الفحص'` and `imports-i18n-fix.ts` `قبل تشغيل الفحص`: here "تشغيل" means "run the check" (verb), not a production run.
- Raw uploaded cells, order/record/event IDs, file names, source names.
- Stored snapshot JSON (normalised only when displayed).

## Uncertain terms (reported, not guessed)

- `إجماليات التشغيل` → `إجماليات التشغيلات` (run totals). Alternative: `إجماليات كل تشغيلة`.
- Directional labels `التشغيلة اليسرى / اليمنى` (source picker): in RTL the visual left/right is mirrored; wording kept as left/right per existing meaning.
- Dual forms keep the digit (`2NBSPنقطتان مئويتان`) so every number stays visible; strict MSA would drop the digit.
- `0` uses the singular form (`0NBSPدقيقة`); some style guides prefer `0 دقائق`.
- `%` now carries an NBSP (`5 %`), per the brief; English convention is usually `5%`.
- `كغ` kept invariant; `تبديل` vs `تغيير القالب` used in quality texts (left as is).
