import { Navigate } from "react-router";
import { PhasePill } from "../../components/EventCard";
import { useEvents } from "../../lib/queries";
import { useSession } from "../../lib/session";
import { formatDate } from "../../lib/time";
import { Card, EmptyState, ErrorState, Fab, GeneratedArt, Icon, LinkButton, PageLoader } from "../../ui";

export function OrganizeHomePage() {
  const { user, loading, role } = useSession();
  const events = useEvents("mine", Boolean(user));
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login?next=/organize" replace />;
  if (role !== "organizer" && role !== "admin") return <EmptyState icon="block" title="Organizer access only" body="Ask an admin to grant your account the organizer role." />;
  if (events.isPending) return <PageLoader label="Loading your events" />;
  if (events.error) return <ErrorState error={events.error} />;
  return (
    <div className="animate-enter">
      <header className="flex flex-wrap items-end justify-between gap-4 py-6">
        <div>
          <h1 className="type-display-sm type-emphasized text-on-surface">Organizer console</h1>
          <p className="mt-2 type-body-lg text-on-surface-variant">{role === "admin" ? "Every event on this server." : "Events you organize."}</p>
        </div>
        <div className="flex gap-2">
          <LinkButton to="/organize/new" icon="add" size="md">
            New event
          </LinkButton>
        </div>
      </header>
      {events.data.length === 0 ? (
        <EmptyState icon="event" title="No events yet" body="Create your first hackathon — it starts as a private draft." action={<LinkButton to="/organize/new" icon="add">Create event</LinkButton>} />
      ) : (
        <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 expanded:grid-cols-3">
          {events.data.map((e) => (
            <Card key={e.id} to={`/organize/${e.slug}`} variant="elevated" padded={false} className="flex flex-col">
              <GeneratedArt seed={e.id} label={e.name} className="h-28" />
              <div className="relative z-[1] flex flex-col gap-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <PhasePill phase={e.phase} />
                  <span className="type-body-sm text-on-surface-variant">{formatDate(e.startsAt)}</span>
                </div>
                <h2 className="type-title-lg text-on-surface">{e.name}</h2>
                <div className="flex gap-4 type-body-sm text-on-surface-variant">
                  <span className="inline-flex items-center gap-1"><Icon name="how_to_reg" size={16} /> {e.stats.registrations}</span>
                  <span className="inline-flex items-center gap-1"><Icon name="groups" size={16} /> {e.stats.teams}</span>
                  <span className="inline-flex items-center gap-1"><Icon name="rocket_launch" size={16} /> {e.stats.submissions}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <div className="fixed bottom-24 right-4 medium:hidden">
        <Fab icon="add" label="New event" to="/organize/new" />
      </div>
    </div>
  );
}
