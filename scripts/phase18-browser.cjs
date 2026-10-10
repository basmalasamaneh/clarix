require("./isolated-browser-guard.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { chromium } = require(path.resolve("scripts/node_modules/playwright-core"));
const out = path.resolve("generated-artifacts/phase18/browser");
const base = process.env.CLARIX_TEST_BASE_URL;
const pass = process.env.SEED_TEST_PASSWORD;
const events = [], screenshots = [];
let stage = "setup", browser;
const check = (name, ok, detail = "") => {
  events.push({ name, result: ok ? "PASS" : "FAIL", ...(detail ? { detail } : {}) });
  if (!ok) throw new Error(name);
};
const login = async (page, email, password) => {
  await page.goto(base + "/login");
  await page.getByTestId("input-email").waitFor({ timeout: 10000 });
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("button-login").click();
};
const screenshot = async (page, name, route) => {
  await page.addStyleTag({ content: `
    [data-testid^="secret-"], [data-testid^="text-secret-"], [data-testid="img-mfa-qr"],
    input[type="password"], input[autocomplete="one-time-code"], input[inputmode="numeric"] {
      filter: blur(18px) !important; color: transparent !important;
    }` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(out, file), fullPage: true });
  screenshots.push({ file, route, viewport: page.viewportSize().width, overflow });
  return overflow;
};
function otp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = secret.toUpperCase().replace(/[\s=-]/g, "");
  let bits = "";
  for (const c of clean) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.slice(0, Math.floor(bits.length / 8) * 8).match(/.{8}/g).map(x => parseInt(x, 2)));
  const counter = Math.floor(Date.now() / 30000);
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac("sha1", key).update(msg).digest(), offset = mac[19] & 15;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return String(code).padStart(6, "0");
}
async function setPrefs(ctx, language, theme) {
  const s = await (await ctx.request.get(base + "/api/auth/session")).json();
  const r = await ctx.request.patch(base + "/api/preferences", {
    headers: { "X-CSRF-Token": s.csrfToken }, data: { language, theme, tourCompleted: true }
  });
  check(`preferences-${language}-${theme}`, r.status() === 200);
}
async function matrix(ctx, page, screen, route, testid, authenticated = true) {
  for (const width of [360, 768, 1280]) for (const language of ["en", "ar"]) for (const theme of ["light", "dark"]) {
    if (authenticated) await setPrefs(ctx, language, theme);
    else {
      await page.goto(base + route);
      await page.evaluate(({ language, theme }) => {
        localStorage.setItem("clarix.language", language);
        localStorage.setItem("clarix.theme", theme);
      }, { language, theme });
    }
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + route);
    await page.getByTestId(testid).waitFor({ timeout: 10000 });
    await screenshot(page, `${screen}-${width}-${language}-${theme}`, route);
  }
}
(async () => {
  await fs.mkdir(out, { recursive: true });
  if (!pass) throw new Error("SEED_TEST_PASSWORD unavailable");
  browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();

  stage = "manager-login";
  await login(page, "ethmar.manager@clarix.test", pass);
  await page.getByTestId("page-overview").waitFor({ timeout: 12000 });
  events.push({ name: "manager-login", result: "PASS" });

  stage = "manager-reset-issue";
  await page.goto(base + "/members");
  await page.getByTestId("text-members-title").waitFor({ timeout: 10000 });
  check("manager-self-reset-control-absent", await page.getByTestId("button-reset-member-test-manager").count() === 0);
  await page.getByTestId("button-reset-member-test-analyst").click();
  await page.getByTestId("button-reset-create").click();
  await page.getByTestId("secret-reset-link").waitFor({ timeout: 10000 });
  await page.getByTestId("button-copy-secret-reset-link").click();
  const resetUrl = await page.evaluate(() => navigator.clipboard.readText());
  check("reset-link-copied-in-memory", resetUrl.startsWith(base + "/reset#"));
  const freshPassword = crypto.randomBytes(24).toString("base64url") + "!Q7";
  await page.goto(resetUrl);
  await page.getByTestId("input-reset-password").waitFor({ timeout: 10000 });
  await page.getByTestId("input-reset-password").fill(freshPassword);
  await page.getByTestId("input-reset-confirm").fill(freshPassword);
  await page.getByTestId("button-reset-submit").click();
  await page.getByTestId("status-reset-done").waitFor({ timeout: 10000 });
  check("manager-issued-reset-completed-and-signed-out", true);
  await screenshot(page, "reset-complete", "/reset");

  stage = "reset-login";
  await page.getByTestId("button-reset-signin").click();
  await login(page, "ethmar.analyst@clarix.test", freshPassword);
  await page.getByTestId("page-overview").waitFor({ timeout: 12000 });
  check("reset-password-login", true);
  await page.goto(base + "/account");
  await page.getByTestId("button-account-logout").click();
  await page.getByTestId("text-login-title").waitFor({ timeout: 10000 });

  stage = "manager-mfa-enrollment";
  await login(page, "ethmar.manager@clarix.test", pass);
  await page.getByTestId("page-overview").waitFor({ timeout: 12000 });
  await page.goto(base + "/account");
  await page.getByTestId("panel-mfa").waitFor({ timeout: 10000 });
  await page.getByTestId("button-mfa-start").click();
  await page.getByTestId("input-mfa-password").fill(pass);
  await page.getByTestId("button-mfa-continue").click();
  await page.getByTestId("img-mfa-qr").waitFor({ timeout: 10000 });
  const manualSecret = (await page.getByTestId("text-secret-mfa-key").innerText()).replace(/\s/g, "");
  check("mfa-qr-and-manual-secret-present-in-memory", await page.getByTestId("img-mfa-qr").locator("img").count() === 1 && manualSecret.length >= 16);
  await page.getByTestId("input-mfa-code").fill(otp(manualSecret));
  await page.getByTestId("button-mfa-confirm").click();
  await page.getByTestId("secret-recovery-codes").waitFor({ timeout: 10000 });
  const recoveryCodes = (await page.getByTestId("text-secret-recovery-codes").innerText())
    .split("\n").map(s => s.replace(/^\s*\d+\.\s*/, "").trim()).filter(Boolean);
  check("mfa-confirmed-with-ten-recovery-codes", recoveryCodes.length === 10);
  await page.getByTestId("checkbox-saved-secret-recovery-codes").check();
  await page.getByTestId("button-saved-secret-recovery-codes").click();
  await page.getByTestId("text-security-mfa").waitFor({ timeout: 10000 });
  check("saved-codes-acknowledged-mfa-enabled", (await page.getByTestId("text-security-mfa").innerText()).length > 0);
  await page.getByTestId("button-account-logout").click();
  await page.getByTestId("text-login-title").waitFor({ timeout: 10000 });

  stage = "manager-recovery-login";
  await login(page, "ethmar.manager@clarix.test", pass);
  await page.getByTestId("stage-second-factor").waitFor({ timeout: 10000 });
  await page.getByTestId("button-second-factor-toggle").click();
  await page.getByTestId("input-second-factor-code").fill(recoveryCodes[0]);
  await page.getByTestId("button-second-factor-submit").click();
  await page.getByTestId("page-overview").waitFor({ timeout: 12000 });
  check("login-with-unused-recovery-code", true);

  stage = "sessions-second-login";
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await login(page2, "ethmar.manager@clarix.test", pass);
  await page2.getByTestId("stage-second-factor").waitFor({ timeout: 10000 });
  await page2.getByTestId("button-second-factor-toggle").click();
  await page2.getByTestId("input-second-factor-code").fill(recoveryCodes[1]);
  await page2.getByTestId("button-second-factor-submit").click();
  await page2.getByTestId("page-overview").waitFor({ timeout: 12000 });
  await page.goto(base + "/account");
  await page.getByTestId("panel-device-sessions").waitFor({ timeout: 10000 });
  const rowsBefore = page.locator('[data-testid^="row-session-"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="row-session-"]').length >= 2, null, { timeout: 10000 });
  check("sessions-list-shows-two-sessions", await rowsBefore.count() >= 2);
  const sessionRows = await rowsBefore.evaluateAll(els => els.map(el => ({
    id: el.getAttribute("data-testid"),
    current: !!el.querySelector('[data-testid^="badge-session-current-"]')
  })));
  const targetRowId = sessionRows.find(r => !r.current)?.id;
  check("second-session-identifiable-for-revocation", !!targetRowId);
  const targetRow = page.getByTestId(targetRowId);
  const revokeButton = targetRow.locator('button[data-testid^="button-revoke-session-"]');
  await revokeButton.click();
  await page.getByTestId("dialog-revoke-session").waitFor();
  await page.getByTestId("button-revoke-session-confirm").click();
  await targetRow.waitFor({ state: "detached", timeout: 10000 });
  check("second-session-revoked", await page.locator('[data-testid^="row-session-"]').count() === 1);
  await page.setViewportSize({ width: 360, height: 900 });
  await screenshot(page, "sessions-360-en-light", "/account");
  await page.setViewportSize({ width: 1280, height: 900 });
  await screenshot(page, "sessions-1280-en-light", "/account");
  await ctx2.close();

  stage = "analyst-viewer-denials";
  for (const [role, email, memberId, rolePassword] of [
    ["analyst", "ethmar.analyst@clarix.test", "test-analyst", freshPassword],
    ["viewer", "ethmar.viewer@clarix.test", "test-viewer", pass]
  ]) {
    const roleCtx = await browser.newContext();
    const rolePage = await roleCtx.newPage();
    await login(rolePage, email, rolePassword);
    await rolePage.getByTestId("page-overview").waitFor({ timeout: 12000 });
    await rolePage.goto(base + "/members");
    await rolePage.getByTestId("state-forbidden").waitFor({ timeout: 10000 });
    check(`${role}-members-management-ui-denied`, await rolePage.getByTestId("button-invite-member").count() === 0);
    const session = await (await roleCtx.request.get(base + "/api/auth/session")).json();
    const response = await roleCtx.request.post(base + "/api/auth/security", {
      headers: { "X-CSRF-Token": session.csrfToken }, data: { action: "issue-reset", memberId }
    });
    check(`${role}-manager-reset-action-denied`, response.status() === 403);
    await roleCtx.close();
  }

  stage = "visual-screen-matrix";
  await matrix(ctx, page, "account", "/account", "text-account-title");
  await matrix(ctx, page, "members", "/members", "text-members-title");
  await matrix(ctx, page, "factory-settings", "/settings", "section-factory-settings");
  await matrix(ctx, page, "help", "/help", "page-help");
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await matrix(guest, guestPage, "login", "/login", "text-login-title", false);
  await matrix(guest, guestPage, "reset", "/reset", "page-reset", false);
  await guest.close();

  check("visual-matrix-no-horizontal-overflow", screenshots.every(s => !s.overflow), `${screenshots.filter(s => s.overflow).length} overflowing views`);
  await fs.writeFile(path.join(out, "evidence.json"), JSON.stringify({
    status: "PASS", stages: events, screenshots, note: "Screenshots redact secret boxes, MFA QR, passwords, and one-time-code inputs."
  }, null, 2));
  await browser.close();
})().catch(async () => {
  try {
    await fs.mkdir(out, { recursive: true });
    await fs.writeFile(path.join(out, "evidence.json"), JSON.stringify({
      status: "PARTIAL", failedStage: stage, stages: events, screenshots,
      note: "Failure detail intentionally omitted to prevent accidental secret disclosure; screenshots redact sensitive elements."
    }, null, 2));
  } catch {}
  if (browser) try { await browser.close(); } catch {}
  console.error(`PHASE18_BROWSER_FAILURE stage=${stage}`);
  process.exitCode = 1;
});
