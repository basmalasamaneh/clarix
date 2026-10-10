---
name: Reconciliation blocking
description: Reconciliation refuses all figures in a red group even when tables retain values.
---
Reconciliation blocks every figure in a red metric group, including scenario
07's non-null Input and Good output. Preserve their existing table visibility.

**Why:** The user explicitly selected group-wide refusal for reconciliation,
rather than allowing all non-null table values.

**How to apply:** Missing or red-group figures never receive a reconciliation
difference or Matches result. Do not apply this stricter rule to existing tables.
