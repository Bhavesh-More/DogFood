import express from "express";
import type { ApiError, HealthResponse } from "@repo/types";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(express.json());

app.get("/health", (_req, res) => {
  const body: HealthResponse = { status: "ok" };
  res.json(body);
});

app.use((_req, res) => {
  const body: ApiError = { error: "Not found", code: "NOT_FOUND" };
  res.status(404).json(body);
});

app.listen(port, () => {
  console.log(`api listening on http://localhost:${port}`);
});
