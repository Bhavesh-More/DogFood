// Bundle the API (and @dogfood/core) into a single ESM file so the runtime
// image needs no node_modules and no network access.
import { build } from "esbuild";

await build({
  entryPoints: { server: "src/index.ts", cli: "src/cli.ts" },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  legalComments: "none",
  external: ["pg-native"],
  banner: {
    js: [
      "import { createRequire as __dogfoodCreateRequire } from 'node:module';",
      "const require = __dogfoodCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  logLevel: "info",
});
