// Precompress built assets (Brotli + gzip) so the API server can serve them
// without compressing on every request. Runs after `vite build`.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const dir = new URL("../dist/assets/", import.meta.url).pathname;
const COMPRESSIBLE = /\.(js|css|svg|json|txt)$/;
let before = 0;
let after = 0;
for (const name of readdirSync(dir)) {
  if (!COMPRESSIBLE.test(name)) continue;
  const file = path.join(dir, name);
  const raw = readFileSync(file);
  if (raw.length < 1024) continue;
  const br = brotliCompressSync(raw, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: raw.length },
  });
  writeFileSync(`${file}.br`, br);
  writeFileSync(`${file}.gz`, gzipSync(raw, { level: 9 }));
  before += statSync(file).size;
  after += br.length;
}
console.log(`precompressed assets: ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB (brotli)`);
