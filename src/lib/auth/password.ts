import { type BinaryLike, randomBytes, scrypt, type ScryptOptions, timingSafeEqual } from "node:crypto";

// Password hashing with scrypt (memory-hard, in Node core — no native deps).
// Stored format: scrypt$N$r$p$<saltHex>$<hashHex>. The cost params live in the
// stored string so we can raise them later without breaking old hashes.

function scryptAsync(password: BinaryLike, salt: BinaryLike, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

const N = 16384; // CPU/memory cost
const R = 8; // block size
const P = 1; // parallelisation
const KEYLEN = 64;
const SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!n || !r || !p) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  let derived: Buffer;
  try {
    derived = await scryptAsync(password, salt, expected.length, { N: n, r, p });
  } catch {
    return false;
  }
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
