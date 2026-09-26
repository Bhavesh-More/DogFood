import { useSession } from "../lib/session";
import { Icon, Menu } from "../ui";
import { roleTour } from "./steps";
import { useTour } from "./TourProvider";

/** Rail entry point for the guided tour and the full multi-role demo. */
export function TourMenu() {
  const { run, demo } = useTour();
  const { role } = useSession();
  return (
    <Menu
      align="start"
      placement="top"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="menu"
          data-tour="tour-menu"
          className="focus-ring flex flex-col items-center gap-1 rounded-lg text-on-surface-variant hover:text-on-surface"
        >
          <Icon name="explore" size={22} />
          <span className="type-label-sm">Tour</span>
        </button>
      )}
      items={[
        {
          label: "Quick tour of this account",
          icon: "explore",
          onSelect: () => run(roleTour(role)),
        },
        {
          label: "Full feature demo (all roles)",
          icon: "play_circle",
          onSelect: () => demo(),
        },
      ]}
    />
  );
}
