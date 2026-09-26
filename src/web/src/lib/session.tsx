import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Capability, Role, SessionDto, UserDto } from "@dogfood/core";
import { get, post } from "./api";
import { setServerSkew } from "./time";

interface SessionValue {
  user: UserDto | null;
  role: Role | null;
  loading: boolean;
  can: (capability: Capability) => boolean;
  refresh: () => Promise<unknown>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const s = await get<SessionDto>("/api/auth/me");
      setServerSkew(s.serverTime);
      return s;
    },
    staleTime: 60_000,
  });
  const value = useMemo<SessionValue>(
    () => ({
      user: query.data?.user ?? null,
      role: query.data?.user?.role ?? null,
      loading: query.isPending,
      can: (c) => query.data?.capabilities.includes(c) ?? false,
      refresh: () => query.refetch(),
    }),
    [query],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}

/* qc.clear() would detach the session query SessionProvider observes, leaving
   the app signed out after a successful login. Swap the session in place and
   reset everything else so per-user data refetches under the new identity. */
function signedIn(qc: QueryClient, s: SessionDto) {
  qc.setQueryData(["session"], s);
  void qc.resetQueries({ predicate: (q) => q.queryKey[0] !== "session" });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) => post<SessionDto>("/api/auth/login", input),
    onSuccess: (s) => signedIn(qc, s),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string; name: string; intent: "participant" | "visitor" }) =>
      post<SessionDto>("/api/auth/register", input),
    onSuccess: (s) => signedIn(qc, s),
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: () => post("/api/auth/logout"),
    // Full reload: drops every cached per-user query and in-memory state.
    onSuccess: () => window.location.assign("/"),
  });
}
