/**
 * Keepalive pinger for a free-tier Render web service.
 *
 * Render free web services spin down after 15 minutes without inbound
 * traffic. This polls the API health endpoint so the service never sleeps.
 *
 * Usage:
 *   node scripts/keepalive.ts                         # every 15s, forever
 *   HEALTH_URL=... INTERVAL_MS=600000 node scripts/keepalive.ts
 *   node scripts/keepalive.ts --once                  # one ping, then exit
 *
 * Zero dependencies: Node >= 22.18 strips TypeScript types natively.
 *
 * It must run on an always-on host — a local run only keeps the service up
 * while your machine is awake. The truly 24/7, no-code alternative is a free
 * uptime monitor (UptimeRobot, cron-job.org) pointed at the same URL.
 */

export {};

const url = process.env.HEALTH_URL ?? "https://dogfood-api-nara.onrender.com/api/health";
const intervalMs = Number(process.env.INTERVAL_MS ?? 15_000);
const once = process.argv.includes("--once");

async function ping(): Promise<void> {
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    const body = (await res.text()).slice(0, 120);
    console.log(`${new Date().toISOString()}  ${res.status}  ${Date.now() - started}ms  ${body}`);
  } catch (err) {
    console.error(`${new Date().toISOString()}  ERR  ${Date.now() - started}ms  ${(err as Error).message}`);
  }
}

if (once) {
  await ping();
} else {
  console.log(`keepalive: ${url} every ${intervalMs}ms (Ctrl-C to stop)`);
  await ping();
  setInterval(ping, intervalMs);
}
