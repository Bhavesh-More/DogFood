import { driver as createDriver, type Driver } from "driver.js";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { SessionDto } from "@dogfood/core";
import { post } from "../lib/api";
import { router } from "../routes";
import { useSession } from "../lib/session";
import { useToast } from "../ui";
import { DEMO_PASSWORD } from "./accounts";
import { closeDialogs, waitForElement } from "./dom";
import { FULL_DEMO } from "./steps";
import type { TourStep } from "./types";

interface TourApi {
  /** Run an arbitrary step list (already-built role tours or the full demo). */
  run: (steps: TourStep[]) => void;
  /** Run the comprehensive, all-roles feature demo. */
  demo: () => void;
  /** Stop the running tour and restore the original session. */
  stop: () => void;
}

const TourContext = createContext<TourApi | null>(null);

export function useTour(): TourApi {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour outside TourProvider");
  return ctx;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 40));
const isDemoAccount = (email: string | null | undefined) =>
  Boolean(email && email.endsWith("@dogfood.local"));

export function TourProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { user } = useSession();
  const toast = useToast();

  const stepsRef = useRef<TourStep[]>([]);
  const driverRef = useRef<Driver | null>(null);
  const busyRef = useRef(false);
  const activeRef = useRef(false);
  const currentRef = useRef<string | null>(null);
  const startEmailRef = useRef<string | null>(null);
  const switchedRef = useRef(false);

  const swapSession = useCallback(
    async (email: string | null) => {
      if (email === null) {
        try {
          await post("/api/auth/logout");
        } catch {
          /* already signed out */
        }
        await qc.invalidateQueries({ queryKey: ["session"] });
      } else {
        const s = await post<SessionDto>("/api/auth/login", {
          email,
          password: DEMO_PASSWORD,
        });
        qc.setQueryData(["session"], s);
      }
      currentRef.current = email;
      await qc.resetQueries({ predicate: (q) => q.queryKey[0] !== "session" });
      await tick();
    },
    [qc],
  );

  const ensureSession = useCallback(
    async (as: string | null | undefined) => {
      if (as === undefined || as === currentRef.current) return;
      switchedRef.current = true;
      await swapSession(as);
      if (as) toast.success(`Signed in as ${as}`);
    },
    [swapSession, toast],
  );

  /** Put the original session back once the tour ends. */
  const restore = useCallback(async () => {
    // A role tour never changes the session, so there is nothing to restore.
    if (!switchedRef.current) return;
    const start = startEmailRef.current;
    // Leave the page before swapping sessions so role-specific queries do not
    // briefly fire (and 401/403) as the wrong account.
    router.navigate("/");
    await tick();
    try {
      if (isDemoAccount(start)) {
        await ensureSession(start);
      } else if (currentRef.current !== null) {
        await ensureSession(null);
        if (start)
          toast.show("Demo finished — signed out of the demo accounts.");
      }
    } catch {
      /* best effort */
    }
  }, [ensureSession, toast]);

  const prepare = useCallback(
    async (step: TourStep) => {
      closeDialogs();
      const switching = step.as !== undefined && step.as !== currentRef.current;
      // Unmount the previous account's page before swapping sessions, so its
      // role-scoped queries don't refetch (and fail) under the new identity.
      if (switching) {
        router.navigate("/");
        await tick();
      }
      await ensureSession(step.as);
      if (step.route) {
        router.navigate(step.route);
        await tick();
      }
      if (step.before) await step.before();
      await waitForElement(step);
    },
    [ensureSession],
  );

  const advance = useCallback(
    async (dir: 1 | -1) => {
      const d = driverRef.current;
      if (!d || busyRef.current) return;
      const i = d.getActiveIndex() ?? 0;
      const next = i + dir;
      if (next < 0) return;
      if (next >= stepsRef.current.length) {
        d.destroy();
        return;
      }
      busyRef.current = true;
      try {
        await prepare(stepsRef.current[next]!);
        if (driverRef.current === d) d.moveTo(next);
      } catch (err) {
        d.destroy();
        toast.error(
          err instanceof Error ? err.message : "The tour could not continue.",
        );
      } finally {
        busyRef.current = false;
      }
    },
    [prepare, toast],
  );

  const run = useCallback(
    (steps: TourStep[]) => {
      if (activeRef.current || steps.length === 0) return;
      closeDialogs();
      activeRef.current = true;
      stepsRef.current = steps;
      currentRef.current = user?.email ?? null;
      startEmailRef.current = user?.email ?? null;
      switchedRef.current = false;

      const d = createDriver({
        steps,
        animate: true,
        smoothScroll: true,
        allowClose: true,
        overlayOpacity: 0.55,
        stagePadding: 8,
        stageRadius: 12,
        popoverOffset: 12,
        showProgress: true,
        progressText: "{{current}} / {{total}}",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Finish",
        waitForElement: 0,
        onNextClick: () => void advance(1),
        onPrevClick: () => void advance(-1),
        onDestroyed: () => {
          driverRef.current = null;
          activeRef.current = false;
          void restore();
        },
      });
      driverRef.current = d;

      busyRef.current = true;
      void (async () => {
        try {
          await prepare(steps[0]!);
          if (driverRef.current === d) d.drive(0);
        } catch (err) {
          d.destroy();
          toast.error(
            err instanceof Error ? err.message : "The tour could not start.",
          );
        } finally {
          busyRef.current = false;
        }
      })();
    },
    [advance, prepare, restore, toast, user],
  );

  const demo = useCallback(() => {
    if (activeRef.current) return;
    if (
      user &&
      !isDemoAccount(user.email) &&
      !window.confirm(
        "The full demo signs in and out of the seeded demo accounts. Your current session will be signed out at the end and cannot be restored automatically. Continue?",
      )
    ) {
      return;
    }
    run(FULL_DEMO);
  }, [run, user]);

  const stop = useCallback(() => driverRef.current?.destroy(), []);

  const api = useMemo<TourApi>(() => ({ run, demo, stop }), [run, demo, stop]);
  return <TourContext.Provider value={api}>{children}</TourContext.Provider>;
}
