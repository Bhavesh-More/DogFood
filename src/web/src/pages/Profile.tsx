import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import type { UserProfileDto } from "@dogfood/core";
import { ApiError, errorMessage, get, put } from "../lib/api";
import { useSession } from "../lib/session";
import { formatDate } from "../lib/time";
import { Avatar, Banner, Button, Card, Icon, PageLoader, RoleBadge, SectionHeader, TextArea, TextField, useToast, type IconName } from "../ui";

function SkillChips({ skills }: { skills: string[] }) {
  if (!skills.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Tech stack">
      {skills.map((s) => (
        <li key={s} className="rounded-sm bg-secondary-container px-2 py-0.5 font-mono type-label-md text-on-secondary-container">
          {s}
        </li>
      ))}
    </ul>
  );
}

const LINKS: { key: "website" | "github" | "linkedin"; label: string; icon: IconName }[] = [
  { key: "website", label: "Website", icon: "public" },
  { key: "github", label: "GitHub", icon: "code" },
  { key: "linkedin", label: "LinkedIn", icon: "badge" },
];

/** Editable form for your own profile. */
function ProfileForm({ profile }: { profile: UserProfileDto }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({
    headline: profile.headline,
    bio: profile.bio,
    techStack: profile.techStack.join(", "),
    qualifications: profile.qualifications,
    website: profile.links.website,
    github: profile.links.github,
    linkedin: profile.links.linkedin,
  });
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: () =>
      put<UserProfileDto>("/api/profile/me", {
        headline: f.headline,
        bio: f.bio,
        techStack: f.techStack.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
        qualifications: f.qualifications,
        links: { website: f.website.trim(), github: f.github.trim(), linkedin: f.linkedin.trim() },
      }),
    onSuccess: (updated) => {
      qc.setQueryData(["profile", "me"], updated);
      toast.success("Profile saved");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const errs = save.error instanceof ApiError ? save.error.fieldErrors : {};
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    save.mutate();
  };
  const isJudge = profile.role === "judge";
  return (
    <form onSubmit={submit} className="flex flex-col gap-6" aria-label="Edit profile" noValidate>
      <Card variant="filled" radius="2xl" className="flex flex-col gap-4">
        <SectionHeader title="About you" subtitle="Shown to other signed-in users — never your email." level={3} className="mb-0" />
        <TextField label="Headline" value={f.headline} onChange={(ev) => set("headline", ev.target.value)} maxLength={120} supporting="e.g. Full-stack developer · ML engineer" error={errs.headline} />
        <TextArea label="About" rows={4} value={f.bio} onChange={(ev) => set("bio", ev.target.value)} maxLength={1000} counter={`${f.bio.length}/1000`} error={errs.bio} />
      </Card>
      <Card variant="filled" radius="2xl" className="flex flex-col gap-4">
        <SectionHeader
          title={isJudge ? "Judging profile" : "Skills"}
          subtitle={isJudge ? "What qualifies you to judge — shown to organizers and participants." : "Your tech stack helps captains and teams find you."}
          level={3}
          className="mb-0"
        />
        <TextField label="Tech stack (comma-separated)" value={f.techStack} onChange={(ev) => set("techStack", ev.target.value)} maxLength={200} supporting="e.g. typescript, react, postgres · up to 12" error={Object.entries(errs).find(([k]) => k.startsWith("techStack"))?.[1]} />
        <TextArea label="Qualifications & experience" rows={4} value={f.qualifications} onChange={(ev) => set("qualifications", ev.target.value)} maxLength={1000} counter={`${f.qualifications.length}/1000`} supporting="Roles, years of experience, notable work, events judged." error={errs.qualifications} />
      </Card>
      <Card variant="filled" radius="2xl" className="flex flex-col gap-4">
        <SectionHeader title="Links" subtitle="Optional. Must be http(s) URLs." level={3} className="mb-0" />
        <div className="grid grid-cols-1 gap-4 medium:grid-cols-3">
          <TextField label="Website" value={f.website} onChange={(ev) => set("website", ev.target.value)} leadingIcon="public" error={errs["links.website"]} />
          <TextField label="GitHub" value={f.github} onChange={(ev) => set("github", ev.target.value)} leadingIcon="code" error={errs["links.github"]} />
          <TextField label="LinkedIn" value={f.linkedin} onChange={(ev) => set("linkedin", ev.target.value)} leadingIcon="badge" error={errs["links.linkedin"]} />
        </div>
      </Card>
      <div className="sticky bottom-24 z-10 flex justify-end medium:bottom-4">
        <Button type="submit" size="md" icon="check" loading={save.isPending}>
          Save profile
        </Button>
      </div>
    </form>
  );
}

/** Read-only profile of another user. */
function ProfileView({ profile }: { profile: UserProfileDto }) {
  const links = LINKS.filter((l) => profile.links[l.key]);
  return (
    <div className="flex flex-col gap-6">
      <Card variant="filled" radius="2xl" className="flex items-center gap-4">
        <Avatar name={profile.name} size={64} />
        <div className="min-w-0">
          <h1 className="type-headline-sm text-on-surface">{profile.name}</h1>
          {profile.headline ? <p className="type-body-lg text-on-surface-variant">{profile.headline}</p> : null}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <RoleBadge role={profile.role} />
            <span className="type-body-sm text-on-surface-variant">since {formatDate(profile.createdAt)}</span>
          </div>
        </div>
      </Card>
      {profile.techStack.length ? (
        <Card variant="outlined" radius="2xl" className="flex flex-col gap-3">
          <SectionHeader title="Tech stack" level={3} className="mb-0" />
          <SkillChips skills={profile.techStack} />
        </Card>
      ) : null}
      {profile.qualifications ? (
        <Card variant="outlined" radius="2xl" className="flex flex-col gap-2">
          <SectionHeader title="Qualifications & experience" level={3} className="mb-0" />
          <p className="whitespace-pre-line break-words type-body-md text-on-surface">{profile.qualifications}</p>
        </Card>
      ) : null}
      {profile.bio ? (
        <Card variant="outlined" radius="2xl" className="flex flex-col gap-2">
          <SectionHeader title="About" level={3} className="mb-0" />
          <p className="whitespace-pre-line break-words type-body-md text-on-surface">{profile.bio}</p>
        </Card>
      ) : null}
      {links.length ? (
        <Card variant="outlined" radius="2xl" className="flex flex-col gap-3">
          <SectionHeader title="Links" level={3} className="mb-0" />
          <ul className="flex flex-wrap gap-2">
            {links.map((l) => (
              <li key={l.key}>
                <a href={profile.links[l.key]} target="_blank" rel="noreferrer noopener" className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-1.5 type-label-lg text-on-surface hover:bg-on-surface/8">
                  <Icon name={l.icon} size={18} className="text-primary" />
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {!profile.techStack.length && !profile.qualifications && !profile.bio ? (
        <Card variant="outlined" radius="2xl">
          <p className="type-body-md text-on-surface-variant">{profile.name} hasn't filled in their profile yet.</p>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * `/profile` edits your own profile; `/u/:userId` views another user's. A
 * captain can open an applicant's profile here before deciding to invite them.
 */
export function ProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const isSelf = !userId || userId === user?.id;
  const q = useQuery({
    queryKey: ["profile", isSelf ? "me" : userId],
    queryFn: () => get<UserProfileDto>(isSelf ? "/api/profile/me" : `/api/users/${userId}/profile`),
    enabled: Boolean(user),
  });
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to={`/login?next=${isSelf ? "/profile" : `/u/${userId}`}`} replace />;
  if (q.isPending) return <PageLoader />;
  if (q.error || !q.data) {
    return (
      <div className="mx-auto max-w-3xl py-6">
        <Banner tone="error" icon="person_off" title="Profile not found">
          {errorMessage(q.error ?? new Error("No such user"))}
        </Banner>
      </div>
    );
  }
  const mine = q.data.isSelf;
  return (
    <div className="mx-auto max-w-3xl py-6 animate-enter">
      {!mine ? (
        <div className="mb-4">
          <button type="button" onClick={() => navigate(-1)} className="focus-ring inline-flex items-center gap-1 type-label-lg text-primary hover:underline">
            <Icon name="arrow_back" size={18} /> Back
          </button>
        </div>
      ) : null}
      <h1 className="mb-4 type-display-sm type-emphasized text-on-surface">{mine ? "Your profile" : `${q.data.name}'s profile`}</h1>
      {mine ? <ProfileForm profile={q.data} /> : <ProfileView profile={q.data} />}
    </div>
  );
}
