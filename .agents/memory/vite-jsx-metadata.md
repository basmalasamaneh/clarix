---
name: Vite JSX metadata transform
description: Explicit generic arguments in JSX can pass tsc but break the preview instrumentation.
---
Prefer inferred generics in JSX tags, or instantiate a typed component alias
outside JSX.

**Why:** The workspace's development metadata transform inserted JSX attributes
before an explicit type argument, producing invalid TSX even though the original
source passed TypeScript checking. This prevented the whole app from loading.

**How to apply:** For generic React components, verify the actual Vite transform,
not only tsc. Check frontend logs before launching expensive browser fixtures.
