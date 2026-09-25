import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ApiError } from "../../lib/api";
import { useLogin, useRegister } from "../../lib/session";
import { Banner, Button, ButtonGroup, Icon, Shape, TextField } from "../../ui";
import { Logo } from "../../app/Logo";

function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-[calc(100dvh-8rem)] place-items-center py-6">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl bg-surface-container-low shadow-1 medium:grid-cols-2">
        <div className="relative hidden overflow-hidden bg-primary p-10 text-on-primary medium:block">
          <Shape name="cookie12" className="absolute -bottom-20 -left-16 h-72 w-72 text-primary-container opacity-40" />
          <Shape name="clover8" className="animate-float absolute right-8 top-24 h-28 w-28 text-tertiary-container" />
          <div className="relative">
            <Logo size={56} />
            <p className="mt-8 font-rounded text-4xl font-bold leading-tight [font-variation-settings:'ROND'_100]">Build it. Ship it. Get judged fairly.</p>
            <ul className="mt-8 space-y-3 type-body-md opacity-90">
              {["Bias-corrected scoring", "Hard deadlines, no surprises", "Your data stays on this server"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Icon name="check_circle" size={20} /> {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="p-6 medium:p-10">
          <h1 className="type-headline-md text-on-surface">{title}</h1>
          <p className="mt-1 type-body-md text-on-surface-variant">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

const DEMO = [
  { label: "Organizer", email: "organizer@dogfood.local" },
  { label: "Judge", email: "judge.a@dogfood.local" },
  { label: "Participant", email: "participant@dogfood.local" },
  { label: "Admin", email: "admin@dogfood.local" },
];

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const login = useLogin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") ?? "/";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate(next.startsWith("/") ? next : "/") });
  };
  return (
    <AuthLayout title="Welcome back" subtitle="Sign in with your local account.">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {login.error ? <Banner tone="error">{(login.error as ApiError).message}</Banner> : null}
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required leadingIcon="mail" />
        <TextField
          label="Password"
          type={show ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          leadingIcon="key"
          trailing={
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="grid h-10 w-10 place-items-center rounded-full text-on-surface-variant hover:bg-on-surface/8">
              <Icon name={show ? "visibility_off" : "visibility"} size={20} />
            </button>
          }
        />
        <Button type="submit" size="md" loading={login.isPending} fullWidth>
          Sign in
        </Button>
        <p className="text-center type-body-md text-on-surface-variant">
          New here?{" "}
          <Link to={`/register${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-primary underline-offset-2 hover:underline">
            Create an account
          </Link>
        </p>
      </form>
      <div className="mt-8 rounded-lg bg-surface-container p-4">
        <p className="type-label-lg text-on-surface">Demo accounts</p>
        <p className="type-body-sm text-on-surface-variant">
          Password for all: <code className="font-mono">dogfood-demo-2026</code>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              onClick={() => {
                setEmail(d.email);
                setPassword("dogfood-demo-2026");
              }}
              className="state-layer focus-ring rounded-sm border border-outline-variant px-3 py-1.5 type-label-md text-on-surface-variant"
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [intent, setIntent] = useState<"participant" | "visitor">("participant");
  const register = useRegister();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") ?? "/dashboard";
  const errors = register.error instanceof ApiError ? register.error.fieldErrors : {};
  const submit = (e: FormEvent) => {
    e.preventDefault();
    register.mutate({ ...form, intent }, { onSuccess: () => navigate(next.startsWith("/") ? next : "/dashboard") });
  };
  return (
    <AuthLayout title="Create your account" subtitle="Accounts are stored on this server only.">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {register.error && !Object.keys(errors).length ? <Banner tone="error">{(register.error as ApiError).message}</Banner> : null}
        <div>
          <p className="mb-2 type-label-lg text-on-surface-variant">I want to</p>
          <ButtonGroup
            label="Account type"
            value={intent}
            onChange={setIntent}
            options={[
              { value: "participant", label: "Compete", icon: "rocket_launch" },
              { value: "visitor", label: "Browse & vote", icon: "how_to_vote" },
            ]}
          />
        </div>
        <TextField label="Full name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} required />
        <TextField label="Email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} required />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={errors.password}
          supporting="At least 8 characters"
          required
        />
        <Button type="submit" size="md" loading={register.isPending} fullWidth>
          Create account
        </Button>
        <p className="text-center type-body-md text-on-surface-variant">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
