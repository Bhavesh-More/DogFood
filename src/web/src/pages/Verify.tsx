import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { get } from "../lib/api";
import { formatDate } from "../lib/time";
import { Banner, Button, ErrorState, Icon, PageLoader, Shape } from "../ui";
import { Logo } from "../app/Logo";

interface RecordResponse {
  payload: {
    id: string;
    kind: "judge_participation" | "participant" | "winner";
    issuer: { name: string; url: string; keyId: string };
    event: { name: string; slug: string };
    subject: { name: string };
    details: Record<string, string | number | null>;
    issuedAt: string;
  };
  signature: string;
  keyId: string;
  algorithm: string;
  publicKeyPem: string;
  valid: boolean;
  revoked: boolean;
  howToVerify: string;
}

const TITLE = { judge_participation: "Certificate of Judging", participant: "Certificate of Participation", winner: "Certificate of Achievement" };

export function VerifyPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ["record", id], queryFn: () => get<RecordResponse>(`/api/records/${id}`) });
  if (q.isPending) return <PageLoader label="Verifying signature" />;
  if (q.error) return <ErrorState error={q.error} />;
  const r = q.data;
  const p = r.payload;
  const ok = r.valid && !r.revoked;
  const line =
    p.kind === "judge_participation"
      ? `served as a judge and completed ${p.details.reviewsCompleted} review${p.details.reviewsCompleted === 1 ? "" : "s"} (${p.details.tracks})`
      : p.kind === "winner"
        ? `placed #${p.details.rank} with “${p.details.project}” (team ${p.details.team})`
        : `built and submitted “${p.details.project}” with team ${p.details.team}`;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 py-6 animate-enter">
      <Banner tone={ok ? "success" : "error"} icon={ok ? "verified" : "gpp_maybe"} title={ok ? "Signature valid" : r.revoked ? "Record revoked" : "Signature invalid"} className="no-print">
        {ok ? `Signed with Ed25519 key ${r.keyId}; the payload has not been altered.` : "This record should not be trusted."}
      </Banner>

      <article className="relative overflow-hidden rounded-2xl bg-surface-container-low p-8 shadow-1 medium:p-14 print:shadow-none">
        <Shape name="cookie12" className="absolute -right-24 -top-24 h-80 w-80 text-primary-container opacity-60" />
        <Shape name="clover4" className="absolute -bottom-20 -left-16 h-64 w-64 text-tertiary-container opacity-50" />
        <div className="relative text-center">
          <div className="flex justify-center">
            <Logo size={64} />
          </div>
          <p className="mt-6 type-label-lg uppercase tracking-[0.2em] text-on-surface-variant">{TITLE[p.kind]}</p>
          <p className="mt-6 type-body-lg text-on-surface-variant">This certifies that</p>
          <h1 className="mt-2 font-rounded text-5xl font-bold text-on-surface [font-variation-settings:'ROND'_100]">{p.subject.name}</h1>
          <p className="mx-auto mt-4 max-w-xl type-title-lg font-normal text-on-surface">
            {line} at <strong>{p.event.name}</strong>.
          </p>
          <p className="mt-6 type-body-md text-on-surface-variant">Issued {formatDate(p.issuedAt)} by {p.issuer.name}</p>
          <p className="mt-6 font-mono type-body-sm text-on-surface-variant">
            Record {p.id} · key {r.keyId} {ok ? <Icon name="verified" size={16} className="inline text-success" /> : null}
          </p>
        </div>
      </article>

      <div className="no-print flex flex-wrap gap-2">
        <Button icon="print" onClick={() => window.print()}>Print / save as PDF</Button>
      </div>

      <details className="no-print rounded-xl bg-surface-container-low p-4">
        <summary className="cursor-pointer type-title-sm text-on-surface">Verify it yourself</summary>
        <p className="mt-2 type-body-md text-on-surface-variant">{r.howToVerify}</p>
        <p className="mt-3 type-label-lg text-on-surface">Payload</p>
        <pre className="mt-1 overflow-x-auto rounded-md bg-inverse-surface p-3 text-[12px] text-inverse-on-surface">{JSON.stringify(p, null, 2)}</pre>
        <p className="mt-3 type-label-lg text-on-surface">Signature (base64url)</p>
        <pre className="mt-1 overflow-x-auto rounded-md bg-inverse-surface p-3 text-[12px] text-inverse-on-surface">{r.signature}</pre>
        <p className="mt-3 type-label-lg text-on-surface">Public key ({r.algorithm})</p>
        <pre className="mt-1 overflow-x-auto rounded-md bg-inverse-surface p-3 text-[12px] text-inverse-on-surface">{r.publicKeyPem}</pre>
      </details>
    </div>
  );
}
