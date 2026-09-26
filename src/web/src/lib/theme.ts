import { useEffect, useState } from "react";

/** The UI has exactly two themes; the toggle flips between them. */
export type Theme = "light" | "dark";
const KEY = "dogfood.theme";

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The theme to show: the viewer's explicit choice, else the OS preference. */
export function currentTheme(): Theme {
  return stored() ?? systemTheme();
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function nextTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

/**
 * Per-viewer theme (a convenience, so localStorage is fine). Until the viewer
 * picks one, the page follows OS changes live; after that, their choice sticks.
 */
export function useTheme(): [Theme, () => void, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (!stored()) setTheme(systemTheme());
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const choose = (next: Theme) => {
    setTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable (private mode): the choice lasts this session */
    }
  };
  return [theme, () => choose(nextTheme(theme)), choose];
}

export function initTheme() {
  applyTheme(currentTheme());
}
