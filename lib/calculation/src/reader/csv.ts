export interface CsvRow { line: number; start_line: number; end_line: number; cells: Record<string,string> }
export interface CsvTable { header: string[]; rows: CsvRow[] }

export function decodeBytes(bytes: Uint8Array, encoding = "auto"): string {
  if (encoding !== "auto") {
    const name = /^(cp1256|windows-1256)$/i.test(encoding) ? "windows-1256" :
      /^utf-8-sig$/i.test(encoding) ? "utf-8" : encoding;
    return new TextDecoder(name, { fatal: true }).decode(bytes);
  }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("windows-1256", { fatal: true }).decode(bytes); }
}

export function detectDelimiter(text: string): string {
  const candidates = [",", ";", "\t", "|"];
  const counts = new Map(candidates.map((c) => [c, 0]));
  let quoted = false;
  for (let i=0; i<text.length; i++) {
    const c=text[i];
    if (c === '"') {
      if (quoted && text[i+1] === '"') { i++; continue; }
      quoted=!quoted;
    } else if (!quoted) {
      if (c==="\r" || c==="\n") break;
      if (counts.has(c)) counts.set(c, counts.get(c)!+1);
    }
  }
  return candidates.reduce((best,c) => counts.get(c)! > counts.get(best)! ? c:best);
}

export function parseCsv(text: string, delimiter = "auto"): CsvTable {
  const sep = delimiter === "auto" ? detectDelimiter(text) : delimiter;
  if (![",",";","\t","|"].includes(sep)) throw new Error("Unsupported CSV delimiter");
  const parsed: { line: number; start_line: number; end_line: number; values: string[] }[] = [];
  let field="", fields: string[]=[], quoted=false, closed=false, physical=1, start=1;
  const endField = () => { fields.push(field); field=""; closed=false; };
  const endRow = () => { endField(); parsed.push({line:start,start_line:start,end_line:physical,values:fields}); fields=[]; };
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (quoted) {
      if (c==='"') {
        if (text[i+1]==='"') { field+='"'; i++; } else { quoted=false; closed=true; }
      } else {
        field+=c;
        if (c==="\r") { if(text[i+1]==="\n") field+=text[++i]; physical++; }
        else if (c==="\n") physical++;
      }
    } else if (c===sep) endField();
    else if (c==="\r" || c==="\n") {
      endRow(); if(c==="\r" && text[i+1]==="\n") i++; physical++; start=physical;
    } else if (c==='"' && field==="" && !closed) quoted=true;
    else {
      if (closed || c==='"') throw new Error(`Malformed CSV at physical line ${physical}`);
      field+=c;
    }
  }
  if (quoted) throw new Error(`Unclosed CSV quote at physical line ${physical}`);
  if (field!=="" || fields.length || closed) endRow();
  const header = parsed.shift()?.values.map((h) => h.trim()) ?? [];
  if (!header.length || new Set(header).size!==header.length) throw new Error("Missing or duplicate CSV headers");
  const rows = parsed.filter((r) => r.values.some((v) => v.trim()!=="")).map((r) => {
    if (r.values.length>header.length) throw new Error(`Too many cells at physical line ${r.line}`);
    return { line:r.line, start_line:r.start_line, end_line:r.end_line, cells:Object.fromEntries(header.map((h,i) => [h,r.values[i] ?? ""])) };
  });
  return {header,rows};
}
