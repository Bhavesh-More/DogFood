import type { TourStep } from "./types";

const norm = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

/** First element matching `selector` whose text contains `text`. */
export function find(selector: string, text?: string): Element | null {
  const nodes = Array.from(document.querySelectorAll(selector));
  if (!text) return nodes[0] ?? null;
  return nodes.find((n) => norm(n.textContent).includes(text)) ?? null;
}

/**
 * driver.js element resolver: highlights the matching element, or falls back
 * to a centred popover when it is missing.
 */
export const at =
  (selector: string, text?: string): (() => Element) =>
  () =>
    find(selector, text) as Element;

/** Element resolver keyed by a stable `data-tour="id"` anchor. */
export const byTour =
  (id: string): (() => Element) =>
  () =>
    document.querySelector(`[data-tour="${id}"]`) as Element;

/** The visible primary nav: the desktop rail on wide screens, the bottom bar on phones. */
export const visibleNav = (): (() => Element) => () => {
  const rail = document.querySelector('[data-tour="nav-rail"]');
  if (rail) {
    const r = rail.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return rail;
  }
  return document.querySelector('[data-tour="nav-bottom"]') as Element;
};

/** Click the first matching element (used by `before`). */
export function click(selector: string, text?: string): void {
  (find(selector, text) as HTMLElement | null)?.click();
}

/** Click the first selector match with no text filter. */
export function clickFirst(selector: string): void {
  (document.querySelector(selector) as HTMLElement | null)?.click();
}

/** Native `<dialog>`s render in the browser top layer, above driver.js; close them. */
export function closeDialogs(): void {
  document.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach((d) => {
    try {
      d.close();
    } catch {
      /* already closed */
    }
  });
}

export function waitForSelector(
  selector: string,
  timeout = 5000,
): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) return resolve();
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (document.querySelector(selector) || Date.now() - started > timeout) {
        window.clearInterval(timer);
        resolve();
      }
    }, 60);
  });
}

function resolve(step: TourStep): Element | null {
  const e = step.element;
  if (!e) return null;
  if (typeof e === "function") {
    try {
      return e() ?? null;
    } catch {
      return null;
    }
  }
  if (typeof e === "string") return document.querySelector(e);
  return e;
}

/** Poll until the step's element is present and has a layout box (or we time out). */
export async function waitForElement(
  step: TourStep,
  timeout = 3000,
): Promise<void> {
  if (!step.element) return;
  const started = Date.now();
  for (;;) {
    const el = resolve(step);
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) return;
    }
    if (Date.now() - started > timeout) return;
    await new Promise((r) => setTimeout(r, 80));
  }
}
