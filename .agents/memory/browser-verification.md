---
name: Secret-safe browser verification
description: Testing environment boundary for password-based browser checks.
---

Preflight the entire browser driver before starting costly isolated fixture setup.
**Why:** Setup/path mistakes, stale fixture assumptions and omitted first-run
onboarding handling consumed repeated full import preparations without testing
the requested UI. Those failures are test-harness failures, not evidence that
the application itself is broken.
**How to apply:** Validate variable scope, output parent directories, seed
assumptions and onboarding handling before running. After repeated driver failures,
stop and report unverified coverage rather than repeatedly rebuilding fixtures.

Wait for drawer animations to finish before strict geometry measurements.
**Why:** A near-edge readiness condition (within one pixel) allowed measurements
while the drawer was still moving, producing bounds flags without document overflow.
**How to apply:** Wait for the element's running animations to finish, then
measure; retain original failed observations rather than rewriting evidence.
Remote browser automation and workspace shell processes are separate environments; a secret available in the workspace may not be inherited by remote automation.

**Why:** Treating these environments as identical can cause incorrect reports of missing credentials or pressure to disclose secrets.

**How to apply:** Check presence only in the environment that runs the test. Keep credential consumption inside that environment; never copy values into prompts or logs. Distinguish API login evidence from UI verification.

Keep successful browser evidence separate from optional probes or retries.
**Why:** An optional focus probe overwrote a completed responsive matrix's raw
measurement file before failing at login, leaving screenshots and a summary but
not the full original DOM measurements.
**How to apply:** Use per-attempt output directories and promote a successful
manifest atomically. Do not rerun completed journeys to check a small unrelated
detail, and never silently replace original measurements with a reconstructed summary.

Preflight browser actions against the exact application state, including optional controls.
**Why:** An approval confirmation was accidentally conditional on an error-only checkbox, and an approved read-only page was checked for an editable approval button; neither failure was an application defect.
**How to apply:** Confirm required actions independently of optional checkboxes. Use state-specific ready markers. Capture the action's HTTP result and a failure screenshot before stopping, so a locator failure does not erase earlier verification.

Persist matrix evidence after each cell, and run long isolated browser harnesses
as background tasks rather than a bounded foreground shell.
**Why:** A shell's 300-second timeout terminated a matrix before its final write,
lost geometry/locale assertions and interrupted disposable-resource cleanup.
**How to apply:** Checkpoint every result, retain successful preference-save
responses before navigating, and verify namespace/storage cleanup after interruption.
