/**
 * All cryptography uses Node's built-in `crypto` — no native add-ons, no
 * network, nothing to download at runtime.
 */
import {
  createHash,
  createHmac,
  generateKeyPairSync,
  randomBytes,
  randomInt,
  scrypt as scryptCb,
  sign,
  timingSafeEqual,
  verify,
  createPrivateKey,
  createPublicKey,
  type KeyObject,
} from "node:crypto";

const SCRYPT = { N: 1 << 15, r: 8, p: 1, keylen: 64, maxmem: 128 * 1024 * 1024 };

function scrypt(password: string, salt: Buffer, N: number, r: number, p: number, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, { N, r, p, maxmem: SCRYPT.maxmem }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Format: scrypt$N$r$p$<salt b64>$<hash b64> */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p, SCRYPT.keylen);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), Number(n), Number(r), Number(p), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A precomputed hash used to equalise timing when the email is unknown. */
let dummyHash: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(12).toString("hex"));
  return dummyHash;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacHex(secret: string, input: string): string {
  return createHmac("sha256", secret).update(input).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function numericCode(digits = 6): string {
  return String(randomInt(0, 10 ** digits)).padStart(digits, "0");
}

/** Canonical JSON (sorted keys) so signatures are stable across runtimes. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

export interface SigningKeys {
  privateKey: KeyObject;
  publicKey: KeyObject;
  publicKeyPem: string;
  keyId: string;
}

export function generateSigningKeyPem(): string {
  const { privateKey } = generateKeyPairSync("ed25519");
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

export function loadSigningKeys(privatePem: string): SigningKeys {
  const privateKey = createPrivateKey(privatePem);
  const publicKey = createPublicKey(privateKey);
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return { privateKey, publicKey, publicKeyPem, keyId: sha256Hex(publicKeyPem).slice(0, 16) };
}

export function signPayload(keys: SigningKeys, payload: unknown): string {
  return sign(null, Buffer.from(canonicalJson(payload)), keys.privateKey).toString("base64url");
}

export function verifyPayload(publicKey: KeyObject | string, payload: unknown, signature: string): boolean {
  try {
    const key = typeof publicKey === "string" ? createPublicKey(publicKey) : publicKey;
    return verify(null, Buffer.from(canonicalJson(payload)), key, Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }
}
