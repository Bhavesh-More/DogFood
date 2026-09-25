import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router";
import { EventCard } from "../../components/EventCard";
import { get } from "../../lib/api";
import { useEvents } from "../../lib/queries";
import { useSession } from "../../lib/session";
import { formatDate } from "../../lib/time";
import { Card, EmptyState, Icon, LinkButton, PageLoader, SectionHeader, Shape } from "../../ui";

interface RecordRow {
  id: string;
  kind: "judge_participation" | "participant" | "winner";
  payload: { event: { name: string }; details: Record<string, string | number> };
  createdAt: string;
}

const KIND_LABEL = { judge_participation: "Judge participation", participant: "Participation certificate", winner: "Winner certificate" };

export function DashboardPage() {
  const { user, loading } = useSession();
  const mine = useEvents("mine", Boolean(user));
  const records = useQuery({ queryKey: ["my-records"], queryFn: () => get<RecordRow[]>("/api/me/records"), enabled: Boolean(user) });
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login?next=/dashboard" replace />;
  return (
    <div className="animate-enter flex flex-col gap-10">
      <header className="relative overflow-hidden rounded-2xl bg-secondary-container p-6 text-on-secondary-container medium:p-10">
        <Shape name="softBurst" className="animate-float absolute -right-8 -top-8 h-40 w-40 text-tertiary-container" />
        <p className="type-label-lg opacity-80">Welcome back</p>
        <h1 className="mt-1 type-display-sm type-emphasized">{user.name.split(" ")[0]}</h1>
        <p className="mt-2 max-w-xl type-body-lg opacity-90">Your hackathons, teams and certificates in one place.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <LinkButton to="/events" icon="travel_explore">Find a hackathon</LinkButton>
          <LinkButton to="/settings" variant="elevated" icon="settings">Settings</LinkButton>
        </div>
      </header>

      <section>
        <SectionHeader title="My hackathons" subtitle="Events you registered for or joined a team in" />
        {mine.isPending ? (
          <PageLoader />
        ) : mine.data?.length ? (
          <div className="stagger grid gap-4 sm:grid-cols-2 expanded:grid-cols-3">
            {mine.data.map((e) => (
              <div key={e.id} className="flex flex-col gap-2">
                <EventCard event={e} />
                {e.phase === "submissions_open" ? (
                  <div className="flex gap-2">
                    <LinkButton to={`/e/${e.slug}/team`} variant="tonal" size="xs" icon="groups">Team</LinkButton>
                    <LinkButton to={`/e/${e.slug}/submit`} size="xs" icon="edit">Submission</LinkButton>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon="rocket_launch" title="No hackathons yet" body="Register for an event to see it here." action={<LinkButton to="/events">Browse events</LinkButton>} />
        )}
      </section>

      <section id="records">
        <SectionHeader title="Certificates & signed records" subtitle="Each record is signed with the platform's Ed25519 key and can be verified by anyone." />
        {records.data?.length ? (
          <div className="grid gap-4 sm:grid-cols-2 expanded:grid-cols-3">
            {records.data.map((r) => (
              <Card key={r.id} to={`/verify/${r.id}`} variant={r.kind === "winner" ? "primary" : "filled"} className="flex items-center gap-4">
                <Shape name={r.kind === "winner" ? "burst" : "cookie9"} className="h-14 w-14 shrink-0 text-tertiary-container">
                  <Icon name={r.kind === "winner" ? "trophy" : "workspace_premium"} size={24} className="text-on-tertiary-container" />
                </Shape>
                <div className="min-w-0">
                  <p className="type-title-sm">{KIND_LABEL[r.kind]}</p>
                  <p className="truncate type-body-sm opacity-80">{r.payload.event.name}</p>
                  <p className="type-body-sm opacity-70">{formatDate(r.createdAt)}</p>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState icon="workspace_premium" title="No certificates yet" body="Organizers issue signed certificates after results are published." />
        )}
      </section>
    </div>
  );
}
