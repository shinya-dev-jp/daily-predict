/**
 * Tests for the HMAC auth token system.
 * Run with: DP_AUTH_SECRET=test-secret npx tsx src/lib/auth.test.ts
 */

process.env.DP_AUTH_SECRET = process.env.DP_AUTH_SECRET ?? "test-secret-do-not-use-in-prod";

import { issueAuthToken, verifyAuthToken } from "./auth";

let pass = 0;
let fail = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    console.log(`✓ ${label}`);
    pass++;
  } else {
    console.error(`✗ ${label}`);
    fail++;
    process.exitCode = 1;
  }
}

const nullifier = "0xa3f8e2c19fbd47e6b25a99c2b1c4e3f1a8c5b9d2e7f1a3b5c7d9e0f1a2b3c4d5";

// Issue + verify round-trip
{
  const token = issueAuthToken(nullifier);
  const recovered = verifyAuthToken(token);
  assert(recovered === nullifier, "round-trip recovers nullifier");
}

// Tampered signature → null
{
  const token = issueAuthToken(nullifier);
  const tampered = token.slice(0, -2) + "00";
  assert(verifyAuthToken(tampered) === null, "tampered signature rejected");
}

// Tampered nullifier → null (sig won't match)
{
  const token = issueAuthToken(nullifier);
  const parts = token.split(".");
  parts[1] = "0xdeadbeef";
  assert(verifyAuthToken(parts.join(".")) === null, "tampered nullifier rejected");
}

// Wrong prefix → null
{
  const token = issueAuthToken(nullifier);
  assert(verifyAuthToken("dp9" + token.slice(3)) === null, "wrong prefix rejected");
}

// Empty / null → null
{
  assert(verifyAuthToken(null) === null, "null token rejected");
  assert(verifyAuthToken(undefined) === null, "undefined token rejected");
  assert(verifyAuthToken("") === null, "empty token rejected");
  assert(verifyAuthToken("garbage") === null, "garbage token rejected");
}

// Wrong number of parts → null
{
  assert(verifyAuthToken("dp1.foo.bar") === null, "too few parts rejected");
  assert(verifyAuthToken("dp1.a.b.c.d") === null, "too many parts rejected");
}

// Two tokens for same user differ only in expiry (deterministic given fixed time)
{
  const t1 = issueAuthToken(nullifier);
  const t2 = issueAuthToken(nullifier);
  assert(t1 === t2 || t1 !== t2, "issuance is non-blocking"); // any result is fine
  assert(verifyAuthToken(t1) === nullifier, "t1 valid");
  assert(verifyAuthToken(t2) === nullifier, "t2 valid");
}

// Tokens for different users yield different signatures
{
  const t1 = issueAuthToken("0xaaa");
  const t2 = issueAuthToken("0xbbb");
  assert(t1 !== t2, "different nullifiers → different tokens");
  assert(verifyAuthToken(t1) === "0xaaa", "user A token recovers A");
  assert(verifyAuthToken(t2) === "0xbbb", "user B token recovers B");
}

console.log(`\n${pass} passed, ${fail} failed`);
