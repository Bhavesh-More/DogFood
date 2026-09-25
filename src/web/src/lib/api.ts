/**
 * Thin fetch wrapper. Same-origin requests carry the HttpOnly session cookie
 * automatically; errors are normalised to ApiError with the server's code.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Field → message map for form validation errors. */
  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    const out: Record<string, string> = {};
    for (const d of this.details as { path?: string; message?: string }[]) {
      if (d.path && d.message && !(d.path in out)) out[d.path] = d.message;
    }
    return out;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  raw?: Blob | ArrayBuffer;
  contentType?: string;
}

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (opts.raw) {
    body = opts.raw;
    headers["Content-Type"] = opts.contentType ?? "application/octet-stream";
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["Content-Type"] = "application/json";
  }
  let res: Response;
  try {
    res = await fetch(withQuery(path, opts.query), {
      method: opts.method ?? (body ? "POST" : "GET"),
      headers,
      body,
      credentials: "same-origin",
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK", "Cannot reach the server. Is it running?");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const e = (data ?? {}) as { error?: string; code?: string; details?: unknown };
    throw new ApiError(res.status, e.code ?? `HTTP_${res.status}`, e.error ?? res.statusText, e.details);
  }
  return data as T;
}

export function get<T>(path: string, query?: Query): Promise<T> {
  return api<T>(path, { query });
}
export function post<T>(path: string, body?: unknown): Promise<T> {
  return api<T>(path, { method: "POST", body: body ?? {} });
}
export function put<T>(path: string, body?: unknown): Promise<T> {
  return api<T>(path, { method: "PUT", body: body ?? {} });
}
export function patch<T>(path: string, body?: unknown): Promise<T> {
  return api<T>(path, { method: "PATCH", body: body ?? {} });
}
export function del<T>(path: string): Promise<T> {
  return api<T>(path, { method: "DELETE" });
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
