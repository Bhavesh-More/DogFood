import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { get } from "../lib/api";
import { cx } from "../lib/format";
import { Banner, Chip, ErrorState, LinkButton, PageLoader, TextField } from "../ui";

interface Operation {
  summary: string;
  description?: string;
  tags: string[];
  requestBody?: { content: Record<string, { schema?: unknown }> };
  parameters: { name: string; in: string; required: boolean }[];
  responses: Record<string, unknown>;
  "x-required-capability": string;
}
interface OpenApi {
  info: { title: string; version: string; description: string };
  tags: { name: string }[];
  paths: Record<string, Record<string, Operation>>;
}

const METHOD_TONE: Record<string, string> = {
  get: "bg-secondary-container text-on-secondary-container",
  post: "bg-primary-container text-on-primary-container",
  put: "bg-tertiary-container text-on-tertiary-container",
  patch: "bg-tertiary-container text-on-tertiary-container",
  delete: "bg-error-container text-on-error-container",
};

/** Human-readable view of /api/openapi.json (generated from the live route table). */
export function ApiDocsPage() {
  const doc = useQuery({ queryKey: ["openapi"], queryFn: () => get<OpenApi>("/api/openapi.json") });
  const [tag, setTag] = useState("");
  const [q, setQ] = useState("");
  const ops = useMemo(() => {
    if (!doc.data) return [];
    return Object.entries(doc.data.paths).flatMap(([path, methods]) => Object.entries(methods).map(([method, op]) => ({ path, method, op })));
  }, [doc.data]);
  if (doc.isPending) return <PageLoader label="Loading API reference" />;
  if (doc.error) return <ErrorState error={doc.error} />;
  const filtered = ops.filter((o) => (!tag || o.op.tags.includes(tag)) && `${o.path} ${o.op.summary}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="animate-enter">
      <header className="flex flex-wrap items-end justify-between gap-4 py-6">
        <div>
          <h1 className="type-display-sm type-emphasized text-on-surface">REST API</h1>
          <p className="mt-2 max-w-2xl type-body-lg text-on-surface-variant">{doc.data.info.description}</p>
        </div>
        <LinkButton to="/api/openapi.json" external icon="data_object" variant="tonal">
          OpenAPI {doc.data.info.version}
        </LinkButton>
      </header>
      <Banner tone="primary" icon="terminal" className="mb-6" title="Quick start">
        <code className="mt-1 block overflow-x-auto whitespace-pre font-mono text-[13px]">{`curl -H "Authorization: Bearer $DOGFOOD_TOKEN" ${window.location.origin}/api/events`}</code>
      </Banner>
      <div className="mb-4 flex flex-col gap-3">
        <TextField label="Filter endpoints" leadingIcon="search" value={q} onChange={(ev) => setQ(ev.target.value)} className="max-w-md" />
        <div className="scrollbar-none flex gap-2 overflow-x-auto">
          <Chip selected={!tag} onClick={() => setTag("")}>All ({ops.length})</Chip>
          {doc.data.tags.map((t) => (
            <Chip key={t.name} selected={tag === t.name} onClick={() => setTag(tag === t.name ? "" : t.name)}>
              {t.name}
            </Chip>
          ))}
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {filtered.map(({ path, method, op }) => {
          const schema = op.requestBody?.content["application/json"]?.schema;
          return (
            <li key={`${method} ${path}`}>
              <details className="group rounded-lg bg-surface-container-low">
                <summary className="flex cursor-pointer flex-wrap items-center gap-3 p-3">
                  <span className={cx("w-16 rounded-sm py-0.5 text-center font-mono type-label-md uppercase", METHOD_TONE[method])}>{method}</span>
                  <code className="min-w-0 break-all font-mono type-body-md text-on-surface">{path}</code>
                  <span className="min-w-0 flex-1 basis-48 type-body-md text-on-surface-variant">{op.summary}</span>
                  <span className="rounded-full bg-surface-container-highest px-2 py-0.5 font-mono type-label-sm text-on-surface-variant">{op["x-required-capability"]}</span>
                </summary>
                <div className="border-t border-outline-variant p-4">
                  {op.description ? <p className="mb-3 type-body-md text-on-surface">{op.description}</p> : null}
                  <p className="type-label-lg text-on-surface-variant">Responses: {Object.keys(op.responses).join(", ")}</p>
                  {schema ? <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-inverse-surface p-3 text-[12px] text-inverse-on-surface">{JSON.stringify(schema, null, 2)}</pre> : null}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
