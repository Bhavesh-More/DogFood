import type { AiStatusDto } from "@dogfood/core";
import type { Config } from "../config";

/**
 * Thin client for the optional AI sidecar (src/ai). Never throws into the
 * request path by design: callers either catch `AiUnavailable` and fall back
 * to the deterministic path, or check `enabled` first. Every call has a hard
 * timeout so a slow/hung sidecar can never stall the API.
 */
export class AiUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailable";
  }
}

export interface ClassifyProjectInput {
  id: string;
  title: string;
  tagline: string;
  description: string;
  techTags: string[];
  track: string | null;
}
export interface JudgeInput {
  id: string;
  name: string;
  scope: string[];
  declared: string[];
  historyTags: string[];
}
export interface AiClassification {
  id: string;
  tags: string[];
  primaryTag: string;
  confidence: number;
  source: string;
  model: string;
}
export interface AiExpertise {
  id: string;
  tags: string[];
  source: string;
  model: string;
}
export interface AiAffinityPair {
  judgeId: string;
  submissionId: string;
  score: number;
}

export interface AiClient {
  readonly enabled: boolean;
  status(): Promise<AiStatusDto>;
  classify(projects: ClassifyProjectInput[], vocab?: string[]): Promise<AiClassification[]>;
  expertise(judges: JudgeInput[]): Promise<AiExpertise[]>;
  affinity(
    projects: { id: string; tags: string[]; track: string | null }[],
    judges: { id: string; tags: string[]; scope: string[] }[],
    conflictPairs: [string, string][],
  ): Promise<AiAffinityPair[]>;
  summary(input: { title: string; tagline: string; description: string; answers: Record<string, string> }): Promise<{ summary: string; model: string; source: string }>;
  feedback(input: { title: string; tagline: string; notes: string; criteria: { name: string; weight: number; value: number; max: number; guidance: string }[] }): Promise<{ feedback: string; model: string; source: string }>;
}

const DISABLED_STATUS: AiStatusDto = {
  enabled: false,
  service: "disabled",
  device: "n/a",
  classifierBackend: "n/a",
  generatorBackend: "n/a",
  classifierModel: "n/a",
  summaryModel: "n/a",
  feedbackModel: "n/a",
};

export function createAiClient(config: Config): AiClient {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (config.aiServiceKey) headers.Authorization = `Bearer ${config.aiServiceKey}`;

  async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    if (!config.aiEnabled) throw new AiUnavailable("AI is disabled (set AI_ENABLED=true)");
    let res: Response;
    try {
      res = await fetch(`${config.aiServiceUrl}${path}`, {
        method: init?.method ?? "POST",
        headers,
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(config.aiTimeoutMs),
      });
    } catch (err) {
      throw new AiUnavailable(`AI service unreachable: ${(err as Error).message}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new AiUnavailable(`AI service returned ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
    }
    return (await res.json()) as T;
  }

  return {
    enabled: config.aiEnabled,

    async status(): Promise<AiStatusDto> {
      if (!config.aiEnabled) return DISABLED_STATUS;
      try {
        const h = await call<{
          device: string;
          classifierBackend: string;
          generatorBackend: string;
          classifierModel: string;
          summaryModel: string;
          feedbackModel: string;
        }>("/health", { method: "GET" });
        return { enabled: true, service: "up", ...h };
      } catch {
        return { ...DISABLED_STATUS, enabled: true, service: "down" };
      }
    },

    async classify(projects, vocab = []) {
      const r = await call<{ results: AiClassification[] }>("/v1/classify", { body: { projects, vocab } });
      return r.results;
    },

    async expertise(judges) {
      const r = await call<{ results: AiExpertise[] }>("/v1/expertise", { body: { judges } });
      return r.results;
    },

    async affinity(projects, judges, conflictPairs) {
      const r = await call<{ pairs: AiAffinityPair[] }>("/v1/affinity", { body: { projects, judges, conflictPairs } });
      return r.pairs;
    },

    async summary(input) {
      return call<{ summary: string; model: string; source: string }>("/v1/summary", { body: input });
    },

    async feedback(input) {
      return call<{ feedback: string; model: string; source: string }>("/v1/feedback", { body: input });
    },
  };
}
