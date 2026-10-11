---
name: Demo factory policy
description: Approved Phase19 exception, synthetic-only demo provisioning and safe suspension
---
Demo factory creation is the sole new-feature exception to final polish.
Platform Admin only; embedded synthetic examples, never copied from a real
factory; no generated users; persistent DEMO banner; no shell in production.
Suspension is the non-destructive removal-from-use path, retaining immutable
history. Do not add a hard-delete path or relax production tenant access.

**Why:** The user explicitly approved synthetic-only demos that can be
suspended/removed without affecting another factory, while keeping calculations
and protected fixtures unchanged and prohibiting publishing.

**How to apply:** Keep demo imports synthetic; any future editable demo data or
deletion workflow needs an explicit scope decision. Use isolated verification.
