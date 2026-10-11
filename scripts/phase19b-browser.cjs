require("./isolated-browser-guard.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require(path.resolve("scripts/node_modules/playwright-core"));

const base = process.env.CLARIX_TEST_BASE_URL;
const password = process.env.SEED_TEST_PASSWORD;
const out = path.resolve("generated-artifacts/phase19b");
const runId = (process.env.PHASE19B_RUN_ID || "all").replace(/[^a-z0-9_-]/gi, "_");
const evidenceFile = path.join(out, `browser-evidence-${runId}.json`);
const axePath = path.resolve("generated-artifacts/phase19/browser/axe.min.js");
const evidence = {
  status: "RUNNING", runId, setup: [], batches: [], failures: [], omissions: [],
  policy: {
    batchKey: "one page × one language × one theme",
    widths: [360, 768, 1280], maxAttempts: 3,
    freshChromiumProcessPerAttempt: true, axeWidths: [360, 1280],
    stateInjectionsAreDiagnosticOnly: true,
  },
};
const pages = [
  ["overview", "/", "page-overview", "manager"],
  ["imports", "/imports", "page-imports", "manager"],
  ["runs", "/runs", "page-runs", "manager"],
  ["comparison", "/comparison", "page-comparison", "manager"],
  ["quality", "/quality", "page-quality", "manager"],
  ["snapshots", "/snapshots", "page-snapshots", "manager"],
  ["sources", "/settings", "section-source-admin", "manager"],
  ["settings", "/settings", "section-factory-settings", "manager"],
  ["account", "/account", "text-account-title", "manager"],
  ["members", "/members", "text-members-title", "manager"],
  ["help", "/help", "page-help", "manager"],
  ["platform", "/platform", "page-platform", "admin"],
  ["login", "/login", "text-login-title", "guest"],
  ["snapshot-detail", null, "page-snapshot-detail", "manager"],
];

const save = async () => {
  await fs.mkdir(out, { recursive: true });
  const tmp = evidenceFile + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(evidence, null, 2));
  await fs.rename(tmp, evidenceFile);
};
const cleanError = e => String(e?.message || e).split("\n")[0]
  .replace(/https?:\/\/\S+/g, "[url]").replace(/(password|token|secret)=\S+/gi, "$1=[redacted]");
const timeout = (promise, ms, label) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  promise.then(resolve, reject).finally(() => clearTimeout(timer));
});
const session = async ctx => (await (await ctx.request.get(base + "/api/auth/session")).json());
const login = async (page, email) => {
  await page.goto(base + "/login");
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("button-login").click();
};
const stable = async page => page.evaluate(async () => {
  await document.fonts.ready;
  const finite = document.getAnimations().filter(a => a.playState === "running" &&
    a.effect?.getTiming().iterations !== Infinity);
  await Promise.all(finite.map(a => a.finished.catch(() => {})));
});
const redact = async page => page.addStyleTag({ content: `
  input[type="password"], input[autocomplete="one-time-code"], input[inputmode="numeric"] {
    filter: blur(18px) !important; color: transparent !important;
  }` });
const shot = async (page, filename) => {
  await redact(page);
  await page.screenshot({ path: path.join(out, filename), fullPage: true });
};
const prefs = async (ctx, lang, theme) => {
  const s = await session(ctx);
  const r = await ctx.request.patch(base + "/api/preferences", {
    headers: { "X-CSRF-Token": s.csrfToken }, data: { language: lang, theme, tourCompleted: true },
  });
  if (r.status() !== 200) throw new Error(`preference save HTTP ${r.status()}`);
};
async function setup() {
  if (!password) throw new Error("SEED_TEST_PASSWORD unavailable");
  await fs.access(axePath);
  let browser, adminCtx, managerCtx;
  try {
    browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", headless: true, args: ["--no-sandbox"] });
    adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    admin.setDefaultTimeout(12000);
    await login(admin, "platform.admin@clarix.test");
    await admin.getByTestId("page-platform").waitFor();
    await admin.getByTestId("button-add-demo-factory").click();
    await admin.getByTestId("dialog-create-demo").waitFor();
    await admin.getByTestId("input-demo-name").fill("Phase 19b Synthetic Demo");
    await admin.getByTestId("input-demo-email").fill("p19b-manager@example.test");
    await admin.getByTestId("checkbox-demo-confirm").check();
    await admin.getByTestId("button-submit-demo").click();
    await admin.getByTestId("dialog-platform-link").waitFor();
    const invitePath = await admin.getByTestId("input-platform-link").inputValue();
    if (!invitePath.startsWith(base + "/invite/")) throw new Error("synthetic demo invite link not issued");
    const listing = await (await adminCtx.request.get(base + "/api/platform/factories")).json();
    const demo = (listing.items || []).find(x => x.name === "DEMO — Phase 19b Synthetic Demo");
    if (!demo) throw new Error("synthetic demo missing from isolated platform list");
    evidence.setup.push({ step: "synthetic-demo-created", result: "PASS" });
    await admin.getByTestId("button-close-platform-link").click();

    managerCtx = await browser.newContext();
    const manager = await managerCtx.newPage();
    manager.setDefaultTimeout(12000);
    await manager.goto(invitePath);
    await manager.getByTestId("text-invite-title").waitFor();
    await manager.getByTestId("input-invite-name").fill("P19b Demo Manager");
    await manager.getByTestId("input-invite-password").fill(password);
    await manager.getByTestId("input-invite-confirm").fill(password);
    await manager.getByTestId("button-accept-invite").click();
    await manager.getByTestId("page-overview").waitFor();
    const ms = await session(managerCtx);
    if (!ms.memberships?.some(m => m.factoryId === demo.id && m.role === "factory_manager"))
      throw new Error("synthetic manager membership not established");
    const imports = await (await managerCtx.request.get(base + "/api/imports")).json();
    const runs = await (await managerCtx.request.get(base + "/api/runs")).json();
    if ((imports.items || []).length !== 2 || (runs.items || []).length !== 4)
      throw new Error(`isolated synthetic fixture mismatch: imports=${(imports.items || []).length}, runs=${(runs.items || []).length}`);
    evidence.setup.push({ step: "safe-isolated-demo-fixtures-verified", result: "PASS", imports: 2, runs: 4 });

    let snapshots = await (await managerCtx.request.get(base + "/api/snapshots")).json();
    let snapshotId = snapshots.items?.[0]?.id;
    if (!snapshotId) {
      const [a, b] = runs.items;
      if (!a?.id || !b?.id) throw new Error("cannot create synthetic snapshot: two real demo runs missing");
      const s = await session(managerCtx);
      const r = await managerCtx.request.post(base + "/api/snapshots", {
        headers: { "X-CSRF-Token": s.csrfToken },
        data: { a: a.id, b: b.id, title: "Phase 19b Synthetic Audit Snapshot", note: "" },
      });
      if (r.status() !== 201) throw new Error(`synthetic snapshot creation HTTP ${r.status()}`);
      const body = await r.json();
      snapshotId = body.snapshot?.id;
      if (!snapshotId) throw new Error("snapshot creation response omitted snapshot id");
    }
    snapshots = await (await managerCtx.request.get(base + "/api/snapshots/" + snapshotId)).json();
    if (!snapshots.snapshot?.id) throw new Error("real isolated snapshot detail could not be read");
    evidence.setup.push({ step: "real-synthetic-snapshot-ready", result: "PASS", snapshotId });
    evidence.snapshotId = snapshotId;
    const managerState = await managerCtx.storageState();
    const adminState = await adminCtx.storageState();
    await save();
    return { snapshotId, managerState, adminState };
  } finally {
    await managerCtx?.close().catch(() => {});
    await adminCtx?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

async function verifySnapshotActionHierarchy() {
  const reconcileFile = path.resolve("artifacts/clarix/src/components/snapshots/reconcile.tsx");
  const reportFile = path.resolve("artifacts/clarix/src/components/snapshots/report-export.tsx");
  const [reconcile, report] = await Promise.all([
    fs.readFile(reconcileFile, "utf8"), fs.readFile(reportFile, "utf8"),
  ]);
  // Parse each JSX opening element by locating its test id and nearest Button
  // boundary. Do not use [^>]*: valid handler arrows (=>) contain a >.
  const buttonProps = (source, testId) => {
    const marker = `data-testid="${testId}"`;
    const at = source.indexOf(marker);
    if (at < 0) return null;
    const start = source.lastIndexOf("<Button", at);
    const end = source.indexOf(">", at);
    if (start < 0 || end < at || at - start > 2000) return null;
    return source.slice(start, end + 1);
  };
  const add = buttonProps(reconcile, "button-open-add-reconciliation");
  const download = buttonProps(report, "button-download-pdf");
  const addIsOutline = !!add && /\bvariant="outline"/.test(add);
  const downloadIsPrimary = !!download && /\bonClick=\{start\}/.test(download) &&
    !/\bvariant="(?:outline|secondary|ghost)"/.test(download);
  if (!addIsOutline || !downloadIsPrimary)
    throw new Error(`snapshot action hierarchy source assertion failed: addOutline=${addIsOutline}, downloadPrimary=${downloadIsPrimary}`);
  evidence.setup.push({ step: "snapshot-primary-action-hierarchy-ready", result: "PASS",
    details: "JSX opening-element assertion: Add reconciliation outline; Download PDF primary." });
  await save();
}

async function collectViewport(page, batch, attempt, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(base + batch.route);
  await page.getByTestId(batch.ready).waitFor({ timeout: 15000 });
  if (batch.credential === "manager" && batch.name !== "snapshot-detail")
    await page.getByTestId("banner-demo").waitFor({ timeout: 10000 });
  await stable(page);
  await page.addStyleTag({ content: `
    *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; scroll-behavior: auto !important; }
  ` });
  const dom = await page.evaluate(() => {
    const root = document.documentElement, body = document.body, vv = window.visualViewport;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { lang: root.lang, dir: root.dir, darkClass: root.classList.contains("dark"),
        themeColor: getComputedStyle(root).getPropertyValue("--background").trim(),
        scrollWidth: root.scrollWidth, bodyScrollWidth: body?.scrollWidth ?? null },
      zoom: { devicePixelRatio, visualViewportScale: vv?.scale ?? null,
        visualViewportWidth: vv?.width ?? null, rootCssZoom: getComputedStyle(root).zoom },
    };
  });
  const cell = { width, actual: dom, overflow: dom.document.scrollWidth > width + 1 ||
      (dom.document.bodyScrollWidth ?? width) > width + 1 };
  if (dom.viewport.width !== width || dom.document.lang.slice(0, 2) !== batch.language ||
      dom.document.dir !== (batch.language === "ar" ? "rtl" : "ltr") ||
      dom.document.darkClass !== (batch.theme === "dark"))
    cell.environmentMismatch = true;
  if (width === 360 || width === 1280) {
    await page.addScriptTag({ path: axePath });
    cell.axeViolations = await page.evaluate(async () => {
      const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
      return r.violations.map(v => ({
        id: v.id, impact: v.impact, help: v.help, description: v.description,
        nodes: v.nodes.map(n => ({ target: n.target, html: n.html, summary: n.failureSummary })),
      }));
    });
    cell.axeSeriousCritical = cell.axeViolations
      .filter(v => ["serious", "critical"].includes(v.impact))
      .map(v => ({ id: v.id, impact: v.impact, selectors: v.nodes.map(n => n.target), nodes: v.nodes }));
    cell.contrast = cell.axeViolations.filter(v => v.id === "color-contrast")
      .map(v => ({ selectors: v.nodes.map(n => n.target), failures: v.nodes.map(n => n.failureSummary) }));
  }
  const filename = `${runId}-${batch.name}-${batch.language}-${batch.theme}-w${width}-try${attempt}.png`;
  await shot(page, filename);
  cell.screenshot = filename;
  return cell;
}

async function injectedSourceStates(browser, batch, state) {
  const results = [];
  for (const kind of ["loading", "error", "empty"]) {
    const ctx = await browser.newContext({ storageState: state });
    try {
      await prefs(ctx, batch.language, batch.theme);
      const page = await ctx.newPage();
      page.setDefaultTimeout(10000);
      let seen = false;
      await page.route("**/api/data-sources**", async route => {
        seen = true;
        if (kind === "loading") {
          await new Promise(r => setTimeout(r, 1200));
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], total: 0, page: 1 }) });
        }
        if (kind === "error")
          return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "injected diagnostic error" }) });
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], total: 0, page: 1 }) });
      });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(base + "/settings");
      await page.getByTestId("section-source-admin").waitFor();
      if (kind === "loading") await page.locator('[data-testid="section-source-admin"] [aria-busy="true"]').waitFor({ timeout: 8000 });
      else await page.getByTestId(kind === "error" ? "button-retry-admin-sources" : "state-admin-sources-empty").waitFor({ timeout: 8000 });
      if (!seen) throw new Error("source response interception was not reached");
      await stable(page);
      const filename = `${runId}-INJECTED-${kind}-sources-${batch.language}-${batch.theme}.png`;
      await shot(page, filename);
      results.push({ state: kind, label: `INJECTED ONLY — ${kind} — not acceptance evidence`, result: "PASS", screenshot: filename });
    } catch (e) {
      results.push({ state: kind, label: `INJECTED ONLY — ${kind}`, result: "FAIL", error: cleanError(e) });
    } finally { await ctx.close().catch(() => {}); }
  }
  return results;
}

async function injectedSnapshotStates(browser, batch, state) {
  const results = [];
  for (const kind of ["loading", "error"]) {
    const ctx = await browser.newContext({ storageState: state });
    try {
      await prefs(ctx, batch.language, batch.theme);
      const page = await ctx.newPage();
      page.setDefaultTimeout(10000);
      const pattern = `**/api/snapshots/${evidence.snapshotId}`;
      let seen = false;
      await page.route(pattern, async route => {
        seen = true;
        if (kind === "loading") {
          await new Promise(r => setTimeout(r, 1200));
          return route.continue();
        }
        return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "injected diagnostic error" }) });
      });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(base + `/snapshots/${evidence.snapshotId}`);
      const expected = kind === "loading" ? "state-snapshot-loading" : "state-snapshot-error";
      await page.getByTestId(expected).waitFor({ timeout: 9000 });
      if (!seen) throw new Error("snapshot response interception was not reached");
      await stable(page);
      const filename = `${runId}-INJECTED-${kind}-snapshot-detail-${batch.language}-${batch.theme}.png`;
      await shot(page, filename);
      results.push({ state: kind, label: `INJECTED ONLY — ${kind} — not acceptance evidence`, result: "PASS", screenshot: filename });
    } catch (e) {
      results.push({ state: kind, label: `INJECTED ONLY — ${kind}`, result: "FAIL", error: cleanError(e) });
    } finally { await ctx.close().catch(() => {}); }
  }
  const ctx = await browser.newContext({ storageState: state });
  try {
    await prefs(ctx, batch.language, batch.theme);
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(base + "/snapshots/not-a-real-snapshot-id");
    await page.getByTestId("state-snapshot-not-found").waitFor({ timeout: 9000 });
    results.push({ state: "not-found", label: "REAL invalid-id route; not a mocked fixture", result: "PASS" });
  } catch (e) { results.push({ state: "not-found", label: "REAL invalid-id route", result: "FAIL", error: cleanError(e) }); }
  finally { await ctx.close().catch(() => {}); }
  return results;
}

async function realMetricSourceDrawerZoom(states) {
  const result = { kind: "REAL FIXTURE source drawer + genuine CDP page scale", status: "RUNNING" };
  let browser, ctx;
  try {
    browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", headless: true, args: ["--no-sandbox"] });
    ctx = await browser.newContext({ storageState: states.managerState });
    await prefs(ctx, "en", "light");
    const page = await ctx.newPage();
    page.setDefaultTimeout(12000);
    await page.setViewportSize({ width: 1280, height: 900 });
    const runs = await (await ctx.request.get(base + "/api/runs")).json();
    const [a, b] = runs.items || [];
    if (!a?.id || !b?.id) throw new Error("real baseline source probe needs two actual synthetic demo runs");
    await page.goto(base + `/comparison?a=${encodeURIComponent(a.id)}&b=${encodeURIComponent(b.id)}`);
    await page.getByTestId("page-comparison").waitFor();
    await page.getByTestId("text-a-input_kg").waitFor({ timeout: 15000 });
    const sourceResponse = page.waitForResponse(r =>
      new URL(r.url()).pathname === "/api/source-detail" && r.request().method() === "GET", { timeout: 15000 })
      .then(response => ({ response }), error => ({ error: cleanError(error) }));
    const sourceTrigger = page.locator('[data-testid="link-source-a-input_kg"]:visible');
    const triggerCount = await sourceTrigger.count();
    if (triggerCount !== 1) throw new Error(`expected one visible real metric source link; found ${triggerCount}`);
    await sourceTrigger.click();
    await page.getByTestId("drawer-source").waitFor();
    await page.getByTestId("text-source-title").waitFor();
    const responseResult = await sourceResponse;
    if (responseResult.error) throw new Error(`source detail request not observed: ${responseResult.error}`);
    const sourceStatus = responseResult.response.status();
    await page.getByTestId("text-source-value").waitFor({ timeout: 12000 });
    const source = {
      routeOpenedFrom: "/comparison",
      metric: "input_kg",
      sourceRunOrder: a.orderId,
      sourceName: a.sourceName,
      apiStatus: sourceStatus,
      drawerTitle: await page.getByTestId("text-source-title").innerText(),
      valueVisible: await page.getByTestId("text-source-value").isVisible().catch(() => false),
      notFound: await page.getByTestId("state-source-not-found").count() > 0,
    };
    if (source.apiStatus !== 200 || source.notFound || !source.valueVisible)
      throw new Error(`real metric source drawer did not resolve: ${JSON.stringify({ status: source.apiStatus, notFound: source.notFound, valueVisible: source.valueVisible })}`);
    await stable(page);
    const normal = await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      drawerVisible: !!document.querySelector('[data-testid="drawer-source"]'),
      zoom: { dpr: devicePixelRatio, scale: visualViewport?.scale ?? null, cssZoom: getComputedStyle(document.documentElement).zoom },
    }));
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 360, height: 900, deviceScaleFactor: 1, mobile: true, screenWidth: 360, screenHeight: 900,
    });
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
    const zoomed = await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      visualViewport: { width: visualViewport?.width ?? null, height: visualViewport?.height ?? null, scale: visualViewport?.scale ?? null },
      scrollWidth: document.documentElement.scrollWidth,
      drawerVisible: !!document.querySelector('[data-testid="drawer-source"]'),
      zoomRule: { dpr: devicePixelRatio, cssZoom: getComputedStyle(document.documentElement).zoom },
    }));
    const filename = `${runId}-source-drawer-cdp-zoom2x.png`;
    await shot(page, filename);
    result.status = zoomed.visualViewport.scale === 2 && zoomed.drawerVisible ? "PASS" : "FAIL";
    result.source = source;
    result.normal = normal;
    result.zoomed = zoomed;
    result.horizontalOverflow = zoomed.scrollWidth > zoomed.viewport.width + 1;
    result.screenshot = filename;
    result.cdpMethod = "Emulation.setDeviceMetricsOverride(mobile=true,width=360) + Emulation.setPageScaleFactor(2)";
  } catch (e) { result.status = "FAIL"; result.error = cleanError(e); }
  finally { await ctx?.close().catch(() => {}); await browser?.close().catch(() => {}); }
  return result;
}

async function publicStateMatrix(states) {
  const results = [];
  const inviteToken = process.env.PHASE19B_INVITE_TOKEN || "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  if (!/^[A-Za-z0-9_-]{43}$/.test(inviteToken)) throw new Error("public invite probe token must be exactly 43 URL-safe characters");
  const publicPages = [["reset", "/reset", "page-reset"], ["invite-unavailable", `/invite/${inviteToken}`, "state-invite-unavailable"]];
  const requestedPublic = process.env.PHASE19B_PUBLIC_PAGES?.split(",").map(x => x.trim()).filter(Boolean);
  const selectedPublic = requestedPublic ? publicPages.filter(x => requestedPublic.includes(x[0])) : publicPages;
  if (requestedPublic && selectedPublic.length !== requestedPublic.length)
    throw new Error(`unknown public page filter: ${requestedPublic.filter(n => !selectedPublic.some(p => p[0] === n)).join(",")}`);
  for (const [name, route, ready] of selectedPublic) {
    for (const language of ["en", "ar"]) for (const theme of ["light", "dark"]) {
      const batch = { page: name, route, language, theme, widths: [] };
      let browser, ctx;
      try {
        browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", headless: true, args: ["--no-sandbox"] });
        ctx = await browser.newContext();
        await ctx.addInitScript(({ language, theme }) => {
          localStorage.setItem("clarix.language", language);
          localStorage.setItem("clarix.theme", theme);
        }, { language, theme });
        const page = await ctx.newPage();
        page.setDefaultTimeout(10000);
        for (const width of [360, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(base + route);
          await page.getByTestId(ready).waitFor();
          await stable(page);
          await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}" });
          const actual = await page.evaluate(() => ({
            width: innerWidth, lang: document.documentElement.lang, dir: document.documentElement.dir,
            dark: document.documentElement.classList.contains("dark"),
            scrollWidth: document.documentElement.scrollWidth,
            zoom: { dpr: devicePixelRatio, scale: visualViewport?.scale ?? null, cssZoom: getComputedStyle(document.documentElement).zoom },
          }));
          const filename = `${runId}-${name}-${language}-${theme}-w${width}.png`;
          await shot(page, filename);
          batch.widths.push({
            requestedWidth: width, actual, overflow: actual.scrollWidth > width + 1, screenshot: filename,
            environmentMismatch: actual.width !== width || actual.lang.slice(0, 2) !== language ||
              actual.dir !== (language === "ar" ? "rtl" : "ltr") || actual.dark !== (theme === "dark"),
          });
        }
        batch.status = batch.widths.length === 2 && batch.widths.every(v => !v.environmentMismatch) ? "PASS" : "FAIL";
      } catch (e) { batch.status = "FAIL"; batch.error = cleanError(e); }
      finally { await ctx?.close().catch(() => {}); await browser?.close().catch(() => {}); }
      results.push(batch);
      evidence.publicStates = results;
      await save();
      console.log(`PHASE19B_PUBLIC ${name}/${language}/${theme} ${batch.status}`);
    }
  }
  return results;
}

async function runBatch(batch, states) {
  const record = { page: batch.name, route: batch.route, language: batch.language, theme: batch.theme, attempts: [] };
  evidence.batches.push(record); await save();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ar = { attempt, status: "RUNNING", viewports: [], stateCoverage: [] };
    record.attempts.push(ar); await save();
    let browser, ctx;
    try {
      await timeout((async () => {
        browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", headless: true, args: ["--no-sandbox"] });
        const storageState = batch.credential === "manager" ? states.managerState :
          batch.credential === "admin" ? states.adminState : undefined;
        ctx = await browser.newContext(storageState ? { storageState } : {});
        await ctx.setDefaultTimeout(10000);
        if (batch.credential !== "guest") await prefs(ctx, batch.language, batch.theme);
        else await ctx.addInitScript(({ language, theme }) => {
          localStorage.setItem("clarix.language", language);
          localStorage.setItem("clarix.theme", theme);
        }, { language: batch.language, theme: batch.theme });
        const page = await ctx.newPage();
        page.setDefaultTimeout(10000);
        if (batch.name === "snapshot-detail") batch.route = `/snapshots/${states.snapshotId}`;
        for (const width of [360, 768, 1280]) {
          const cell = await collectViewport(page, batch, attempt, width);
          ar.viewports.push(cell);
          ar.status = "RUNNING"; await save();
        }
        if (batch.name === "sources") ar.stateCoverage = await injectedSourceStates(browser, batch, states.managerState);
        if (batch.name === "snapshot-detail") ar.stateCoverage = await injectedSnapshotStates(browser, batch, states.managerState);
      })(), 90000, `batch ${batch.name}/${batch.language}/${batch.theme}`);
      ar.status = ar.viewports.length === 3 && ar.viewports.every(v => !v.environmentMismatch) ? "PASS" : "FAIL";
      if (ar.status !== "PASS") ar.error = "viewport/locale/theme mismatch or incomplete viewport set";
    } catch (e) {
      ar.status = "FAIL";
      ar.error = cleanError(e);
      ar.failingSelectors = [...new Set([...ar.viewports, ...(ar.stateCoverage || [])]
        .flatMap(v => v.axeSeriousCritical?.flatMap(x => x.selectors || []) || []))];
    } finally {
      await ctx?.close().catch(() => {});
      await browser?.close().catch(() => {});
      await save();
    }
    console.log(`PHASE19B_BATCH ${batch.name}/${batch.language}/${batch.theme} attempt=${attempt} ${ar.status}${ar.error ? ` error=${ar.error}` : ""}`);
    for (const v of ar.viewports) for (const finding of v.axeSeriousCritical || [])
      console.error(`PHASE19B_A11Y ${batch.name}/${batch.language}/${batch.theme}/w${v.width} ${finding.id}/${finding.impact} selectors=${JSON.stringify(finding.selectors)}`);
    if (ar.status === "PASS") break;
    if (attempt < 3) console.log(`PHASE19B_RETRY ${batch.name}/${batch.language}/${batch.theme} next=${attempt + 1}/3`);
  }
  if (!record.attempts.some(a => a.status === "PASS")) {
    evidence.failures.push({
      batch: `${batch.name}/${batch.language}/${batch.theme}`,
      error: record.attempts.at(-1)?.error || "failed after 3 attempts",
      failingSelectors: record.attempts.flatMap(a => a.failingSelectors || []),
    });
    console.error(`PHASE19B_FAILURE ${batch.name}/${batch.language}/${batch.theme} selectors=${JSON.stringify(evidence.failures.at(-1).failingSelectors)}`);
  }
  await save();
}

async function main() {
  await fs.mkdir(out, { recursive: true });
  const states = await setup();
  const requested = process.env.PHASE19B_PAGES?.split(",").map(x => x.trim()).filter(Boolean);
  const selectedPages = requested ? pages.filter(p => requested.includes(p[0])) : pages;
  if (requested && selectedPages.length !== requested.length)
    throw new Error(`unknown page filter: ${requested.filter(n => !selectedPages.some(p => p[0] === n)).join(",")}`);
  for (const [name, route, ready, credential] of selectedPages) {
    if (name === "snapshot-detail") await verifySnapshotActionHierarchy();
    for (const language of ["en", "ar"]) for (const theme of ["light", "dark"]) {
      await runBatch({ name, route, ready, credential, language, theme }, states);
    }
  }
  if (process.env.PHASE19B_SOURCE_DRAWER_ZOOM === "1") {
    evidence.sourceDrawerZoom = await realMetricSourceDrawerZoom(states);
    await save();
    console.log(`PHASE19B_SOURCE_DRAWER_ZOOM ${evidence.sourceDrawerZoom.status}`);
  }
  if (process.env.PHASE19B_PUBLIC_STATES === "1") await publicStateMatrix(states);
  evidence.summary = {
    batchCount: evidence.batches.length,
    successfulBatches: evidence.batches.filter(b => b.attempts.some(a => a.status === "PASS")).length,
    failedBatches: evidence.failures.length,
    axeCells: evidence.batches.flatMap(b => b.attempts)
      .filter(a => a.status === "PASS").flatMap(a => a.viewports).filter(v => v.axeViolations).length,
    seriousCritical: evidence.batches.flatMap(b => b.attempts).flatMap(a => a.viewports)
      .flatMap(v => v.axeSeriousCritical || []).length,
    screenshots: evidence.batches.flatMap(b => b.attempts)
      .flatMap(a => [...a.viewports.map(v => v.screenshot), ...(a.stateCoverage || []).map(s => s.screenshot)].filter(Boolean)).length,
    stateCoverage: evidence.batches.flatMap(b => b.attempts).flatMap(a => a.stateCoverage || []),
    sourceDrawerZoom: evidence.sourceDrawerZoom || null,
    publicStates: evidence.publicStates || [],
    missingCoverage: [
      ...(evidence.sourceDrawerZoom?.status === "PASS" ? [] : ["Source drawer from a real baseline metric and genuine zoom are not verified."]),
      "A successful real-fixture empty tenant state is unavailable because the audited tenant is intentionally seeded with the synthetic demo's two imports/four runs; response-injected empty is diagnostic only.",
      "Injected loading/error/empty states are labelled diagnostic only and are not counted as real fixture acceptance.",
    ],
  };
  evidence.status = evidence.failures.length ? "PARTIAL" : "PASS";
  await save();
  console.log(`PHASE19B_DONE ${JSON.stringify(evidence.summary)}`);
}
main().catch(async e => {
  evidence.status = "PARTIAL";
  evidence.failures.push({ stage: "setup-or-driver", error: cleanError(e), failingSelectors: [] });
  await save().catch(() => {});
  console.error(`PHASE19B_FATAL ${cleanError(e)}`);
  process.exitCode = 1;
});
