export const dynamic = "force-dynamic";

const apiUrl = process.env.API_URL ?? "http://localhost:3001";

export default async function Home() {
  let apiStatus = "down";

  try {
    const res = await fetch(`${apiUrl}/health`, { cache: "no-store" });
    const body = (await res.json()) as { status: string };
    apiStatus = res.ok ? body.status : `http ${res.status}`;
  } catch {
    apiStatus = "down";
  }

  return (
    <main>
      <h1>Dogfood 2026</h1>
      <p>Self-hostable submission and judging platform.</p>
      <ul>
        <li>web: up</li>
        <li>api: {apiStatus}</li>
      </ul>
    </main>
  );
}
