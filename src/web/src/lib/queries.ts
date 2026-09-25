import { useQuery } from "@tanstack/react-query";
import type { EventDto, EventSummaryDto, TeamDto } from "@dogfood/core";
import { get } from "./api";

export const keys = {
  events: (scope = "public") => ["events", scope] as const,
  event: (slug: string) => ["event", slug] as const,
  myTeam: (eventId: string) => ["my-team", eventId] as const,
};

export function useEvents(scope: "public" | "mine" = "public", enabled = true) {
  return useQuery({
    queryKey: keys.events(scope),
    queryFn: () => get<EventSummaryDto[]>("/api/events", { scope }),
    enabled,
  });
}

export function useEvent(slug: string | undefined) {
  return useQuery({
    queryKey: keys.event(slug ?? ""),
    queryFn: () => get<EventDto>(`/api/events/${slug}`),
    enabled: Boolean(slug),
  });
}

export function useMyTeam(eventId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.myTeam(eventId ?? ""),
    queryFn: () => get<TeamDto | null>(`/api/events/${eventId}/my-team`),
    enabled: Boolean(eventId) && enabled,
  });
}
