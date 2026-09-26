import { useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
const KEY = "dogfood.theme";

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
}

/** Per-viewer theme preference (a convenience, so localStorage is fine). */
export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(read);
  useEffect(() => apply(pref), [pref]);
  return [
    pref,
    (p) => {
      setPref(p);
      try {
        localStorage.setItem(KEY, p);
      } catch {
        /* storage unavailable (private mode) — preference lasts this session */
      }
    },
  ];
}

export function initTheme() {
  apply(read());
}
