export type Role = "visitor" | "participant" | "judge" | "organizer" | "admin";

export interface ApiError {
  error: string;
  code: string;
}

export interface HealthResponse {
  status: "ok";
}
