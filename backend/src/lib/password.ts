import argon2 from "argon2";

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

/**
 * A hash of an arbitrary password, computed once and reused. When a login
 * is attempted against an email that has no matching user, we still verify
 * the submitted password against this hash before responding — so "no such
 * user" takes about as long as "wrong password" and an attacker can't use
 * response timing to enumerate which emails have accounts.
 */
let dummyHash: Promise<string> | undefined;

export function getDummyHash(): Promise<string> {
  dummyHash ??= argon2.hash("timing-safety-placeholder-password");
  return dummyHash;
}
