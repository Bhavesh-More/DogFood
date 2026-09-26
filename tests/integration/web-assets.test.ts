import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, type TestStack } from "./helpers";

/** Web delivery: precompressed assets, compressed JSON, caching, SPA fallback and security headers. */
let s: TestStack;
const js = `export const greeting = "${"hello ".repeat(400)}";`;
beforeAll(async () => {
  const dist = mkdtempSync(path.join(tmpdir(), "dogfood-web-"));
  mkdirSync(path.join(dist, "assets"));
  writeFileSync(path.join(dist, "index.html"), "<!doctype html><div id=\"root\"></div>");
  writeFileSync(path.join(dist, "assets", "app-abc123.js"), js);
  writeFileSync(path.join(dist, "assets", "app-abc123.js.br"), brotliCompressSync(js));
  writeFileSync(path.join(dist, "assets", "app-abc123.js.gz"), gzipSync(js));
  s = await startStack({ webDist: dist });
});
afterAll(async () => {
  await s?.close();
});

const fetchRaw = (p: string, encoding: string) => fetch(s.base + p, { headers: { "accept-encoding": encoding } });

describe("static web delivery", () => {
  it("serves the Brotli twin when accepted, with immutable caching", async () => {
    const r = await fetchRaw("/assets/app-abc123.js", "gzip, deflate, br");
    expect(r.headers.get("content-encoding")).toBe("br");
    expect(r.headers.get("vary")).toBe("Accept-Encoding");
    expect(r.headers.get("content-type")).toMatch(/javascript/);
    expect(r.headers.get("cache-control")).toContain("immutable");
    expect(await r.text()).toBe(js); // fetch decodes transparently
  });

  it("falls back to gzip, then to the plain file", async () => {
    expect((await fetchRaw("/assets/app-abc123.js", "gzip")).headers.get("content-encoding")).toBe("gzip");
    const plain = await fetchRaw("/assets/app-abc123.js", "identity");
    expect(plain.headers.get("content-encoding")).toBeNull();
    expect(await plain.text()).toBe(js);
  });

  it("serves the SPA shell for client routes, uncached, with the strict CSP", async () => {
    const r = await fetchRaw("/e/sample-hack-2026/gallery", "br");
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('id="root"');
    expect(r.headers.get("cache-control")).toBe("no-cache");
    expect(r.headers.get("content-security-policy")).toContain("script-src 'self'");
  });

  it("compresses large JSON API responses but not tiny ones", async () => {
    const big = await fetchRaw("/api/openapi.json", "br");
    expect(big.headers.get("content-encoding")).toBe("br");
    expect(big.headers.get("vary")).toBe("Accept-Encoding");
    expect((await big.json()).openapi).toMatch(/^3\.1/);
    const small = await fetchRaw("/api/health", "br, gzip");
    expect(small.headers.get("content-encoding")).toBeNull();
    const identity = await fetchRaw("/api/openapi.json", "identity");
    expect(identity.headers.get("content-encoding")).toBeNull();
  });

  it("never escapes the assets directory", async () => {
    const r = await fetchRaw("/assets/..%2f..%2fpackage.json", "br");
    expect(await r.text()).not.toContain('"name"');
  });
});
