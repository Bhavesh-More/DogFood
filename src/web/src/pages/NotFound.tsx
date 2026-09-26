import { EmptyState, LinkButton } from "../ui";

export function NotFoundPage() {
  return (
    <EmptyState
      icon="travel_explore"
      shape="burst"
      title="This page wandered off"
      body="The link may be old, or the page may be restricted to another role."
      action={<LinkButton to="/" icon="home">Back home</LinkButton>}
      className="py-24"
    />
  );
}
