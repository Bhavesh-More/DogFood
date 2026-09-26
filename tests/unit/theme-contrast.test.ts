import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Readability guard for the generated Material colour roles: every text colour
 * the UI puts on a surface must meet WCAG contrast in BOTH themes. Regenerating
 * the theme (or changing the seed) can't silently make dark mode unreadable.
 */
const css = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/web/src/styles/theme.css"),
  "utf8",
);

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`selector ${selector} not found`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--md-([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const THEMES = {
  light: tokens(':root[data-theme="light"]'),
  dark: tokens(':root[data-theme="dark"]'),
};

/** [text role, background role, minimum ratio] — 4.5 body text, 3 large display text. */
const PAIRS: [string, string, number][] = [
  ["on-surface", "surface", 4.5],
  ["on-surface", "surface-container", 4.5],
  ["on-surface", "surface-container-high", 4.5],
  ["on-surface-variant", "surface", 4.5],
  ["on-surface-variant", "surface-container-low", 4.5],
  ["on-surface-variant", "surface-container-high", 4.5],
  ["primary", "surface", 4.5],
  ["primary", "surface-container-low", 4.5],
  ["on-primary", "primary", 4.5],
  ["on-primary-container", "primary-container", 4.5],
  ["on-secondary-container", "secondary-container", 4.5],
  ["on-tertiary", "tertiary", 4.5],
  ["on-tertiary-container", "tertiary-container", 4.5],
  ["on-error", "error", 4.5],
  ["on-error-container", "error-container", 4.5],
  ["on-success-container", "success-container", 4.5],
  ["on-warning-container", "warning-container", 4.5],
  ["inverse-on-surface", "inverse-surface", 4.5],
];

describe("theme contrast", () => {
  for (const [name, t] of Object.entries(THEMES)) {
    describe(name, () => {
      it.each(PAIRS)("%s on %s ≥ %s:1", (fg, bg, min) => {
        expect(t[fg], `--md-${fg} missing`).toBeDefined();
        expect(t[bg], `--md-${bg} missing`).toBeDefined();
        expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(min);
      });
    });
  }

  it("dark mode uses deep containers, not light slabs", () => {
    // A container brighter than mid-grey on a near-black page reads as a glare panel.
    for (const role of ["primary-container", "tertiary-container", "secondary-container"]) {
      expect(luminance(THEMES.dark[role]!), role).toBeLessThan(0.18);
    }
  });

  it("the prefers-color-scheme block matches the explicit dark theme", () => {
    const media = tokens(':root:not([data-theme="light"])');
    expect(media).toEqual(THEMES.dark);
  });
});
