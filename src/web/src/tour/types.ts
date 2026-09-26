import type { DriveStep } from "driver.js";

/**
 * A single guided-tour step. Extends driver.js's `DriveStep` with the fields
 * the engine needs to move between pages and accounts:
 *
 * - `as`    — the demo account that must be signed in (`null` = anonymous).
 *             Omit to leave the session untouched (used by role tours).
 * - `route` — navigate here before highlighting the step.
 * - `before`— run arbitrary DOM setup (click a tab, open an inline panel)
 *             after navigating and before waiting for the element.
 */
export interface TourStep extends DriveStep {
  as?: string | null;
  route?: string;
  before?: () => void | Promise<void>;
}
