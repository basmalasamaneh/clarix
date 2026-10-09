import { createHash } from "node:crypto";
import type { SourceFile } from "./types";

// Pure bytes-in/hash-out. No filesystem, network or upload state. Ordering and
// separators match the reference's directory hash used by scenario 20.
export function contentHash(files: readonly SourceFile[]): string {
  if(new Set(files.map((f)=>f.name)).size!==files.length) throw new Error("Duplicate source file name");
  const hash=createHash("sha256");
  for(const file of [...files].sort((a,b)=>a.name<b.name ? -1:a.name>b.name ? 1:0)) {
    hash.update(file.name,"utf8"); hash.update("\0"); hash.update(file.bytes); hash.update("\0");
  }
  return hash.digest("hex");
}
