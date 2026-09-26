import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router";
import type { NotificationDto } from "@dogfood/core";
import { errorMessage, post } from "../lib/api";
import { cx } from "../lib/format";
import { useNotifications } from "../lib/queries";
import { useSession } from "../lib/session";
import { relativeTime, useServerNow } from "../lib/time";
import { Button, EmptyState, Icon, PageLoader, useToast, type IconName } from "../ui";

const KIND_ICON: Record<NotificationDto["kind"], IconName> = {
  announcement: "campaign",
  assignment: "rate_review",
  invite: "group_add",
};

export function NotificationsPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const now = useServerNow(60_000);
  const q = useNotifications(Boolean(user));
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const read = useMutation({ mutationFn: (id: string) => post(`/api/notifications/${id}/read`), onSuccess: refresh });
  const readAll = useMutation({
    mutationFn: () => post("/api/notifications/read-all"),
    onSuccess: refresh,
    onError: (err) => toast.error(errorMessage(err)),
  });
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login?next=/notifications" replace />;
  const items = q.data?.items ?? [];
  const unread = q.data?.unread ?? 0;
  const open = (n: NotificationDto) => {
    if (!n.readAt) read.mutate(n.id);
    if (n.link) navigate(n.link);
  };
  return (
    <div className="animate-enter mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="type-display-sm type-emphasized text-on-surface">Notifications</h1>
          <p className="type-body-md text-on-surface-variant">{unread ? `${unread} unread` : "You're all caught up"}</p>
        </div>
        {unread ? (
          <Button variant="text" icon="done_all" loading={readAll.isPending} onClick={() => readAll.mutate()}>
            Mark all as read
          </Button>
        ) : null}
      </header>
      {q.isPending ? (
        <PageLoader />
      ) : items.length ? (
        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => open(n)}
                className={cx(
                  "focus-ring flex w-full items-start gap-3 rounded-xl p-4 text-left transition-colors",
                  n.readAt ? "bg-surface-container-low hover:bg-surface-container" : "bg-secondary-container hover:brightness-105",
                )}
              >
                <Icon name={KIND_ICON[n.kind]} size={22} className="mt-0.5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="type-title-sm text-on-surface">{n.title}</span>
                    {n.readAt ? null : <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                  </span>
                  {n.body ? <span className="mt-1 block type-body-md text-on-surface-variant">{n.body}</span> : null}
                  <span className="mt-1 block type-body-sm text-on-surface-variant">{relativeTime(n.createdAt, now)}</span>
                </span>
                {n.link ? <Icon name="chevron_right" size={20} className="mt-1 shrink-0 text-on-surface-variant" /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="notifications" title="Nothing here yet" body="Announcements, judging work and team invitations will appear here." />
      )}
    </div>
  );
}
