import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"; // Crockford-ish base32, no i/l/o/u

/** Opaque, unguessable, URL-safe id with a readable type prefix: `sub_7h3k…`. */
export function newId(prefix: string, length = 16): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % 32];
  return `${prefix}_${out}`;
}
