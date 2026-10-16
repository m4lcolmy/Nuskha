// Runs Typst (compiled to WebAssembly, the same build in the browser and in Node): the book's Typst
// source in, the PDF and the place of every word marker out.

import init, { TypstCompilerBuilder, type InitInput, type TypstCompiler } from '@myriaddreamin/typst-ts-web-compiler';

/** Where a word marker landed: its value (a word number, or [text, size]), page (1-based), x and y in pt from the top left. */
export type Mark = [value: number | [string, number], page: number, x: number, y: number];

export interface Compiled {
  pdf: Uint8Array;
  marks: Mark[];
  /** Notes not on the page of their marker: label, marker page, note page. */
  misplaced: [label: string, marker: number, note: number][];
}

export class TypstError extends Error {}

let ready: Promise<unknown> | undefined;

/** A compiler with Amiri, the only font the book uses. `wasm` is the compiler's .wasm (bytes, URL or response). */
export async function createCompiler(wasm: InitInput | Promise<InitInput>, font: Uint8Array): Promise<TypstCompiler> {
  ready ??= init({ module_or_path: wasm });
  await ready;
  const b = new TypstCompilerBuilder();
  b.set_dummy_access_model();
  await b.add_raw_font(font);
  return b.build();
}

// Read after layout: every marker with its place, rounded to 0.1 pt; notes away from their marker.
const MARKS = `
#context [#metadata(query(<w>).map(m => {
  let p = m.location().position()
  (m.value, p.page, calc.round(p.x.pt(), digits: 1), calc.round(p.y.pt(), digits: 1))
}))<marks>]
#context [#metadata(query(<fe>).map(m => m.value).filter(v => v.at(1) != v.at(2)))<misplaced>]
`;

export function compile(c: TypstCompiler, source: string, files: Record<string, Uint8Array> = {}): Compiled {
  c.reset_shadow();
  for (const [path, bytes] of Object.entries(files)) c.map_shadow(path, bytes);
  c.add_source('/main.typ', source + MARKS);
  const world = c.snapshot(null, '/main.typ', null);
  try {
    const r = world.compile(0, 1) as { diagnostics?: Diagnostic[] } | undefined;
    const errors = (r?.diagnostics ?? []).filter((d) => d.severity === 'Error' || d.severity === 'error');
    if (errors.length) throw new TypstError(errors.map((d) => d.message).join('; '));
    const art = (world.get_artifact(1, 1) ?? {}) as { result?: Uint8Array; diagnostics?: Diagnostic[] };
    if (!art.result) throw new TypstError((art.diagnostics ?? []).map((d) => d.message).join('; ') || 'no PDF');
    const marks = (JSON.parse(world.query(0, '<marks>', 'value')) as Mark[][])[0] ?? [];
    const misplaced = (JSON.parse(world.query(0, '<misplaced>', 'value')) as Compiled['misplaced'][])[0] ?? [];
    return { pdf: art.result, marks, misplaced };
  } finally {
    world.free();
  }
}

interface Diagnostic {
  severity: string;
  message: string;
}
