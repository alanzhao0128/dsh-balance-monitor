// Volcengine OpenAPI signature V4 (AK/SK).
//
// Pure functions over node:crypto — no network, no state, unit-testable.
// This signs the control-plane OpenAPI gateway (open.volcengineapi.com) for
// the ark service. The algorithm is the volcano variant of SigV4 and differs
// from AWS in three places (verified against cc-switch's working
// implementation and a live gateway probe):
//   1. canonical headers use a FIXED order `host;x-date;x-content-sha256;content-type`
//      (NOT alphabetical);
//   2. the algorithm string is `HMAC-SHA256` (no `AWS4` prefix), the credential
//      scope ends in `request` (not `aws4_request`), and the signing key is
//      kDate = HMAC(SK, date) with the SK NOT prefixed;
//   3. canonical query keys are still sorted alphabetically (like SigV4).
// Body is always empty for these quota actions.
import { createHash, createHmac } from "node:crypto";

export const OPENAPI_HOST = "open.volcengineapi.com";
export const SERVICE = "ark";
export const DEFAULT_REGION = "cn-beijing";
export const DEFAULT_VERSION = "2024-01-01";
export const CONTENT_TYPE = "application/json; charset=utf-8";
export const SIGNED_HEADERS = "host;x-date;x-content-sha256;content-type";

const hmacSha256 = (key, data) => createHmac("sha256", key).update(data).digest();
const sha256Hex = (data) => createHash("sha256").update(data).digest("hex");

// RFC3986 unreserved chars pass through; everything else is %XX-encoded.
const uriEncode = (input) =>
  encodeURIComponent(input).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

/** Canonical query string: `Action/Region/Version` sorted by key. */
export function canonicalQuery({ action, region, version }) {
  return [
    ["Action", action],
    ["Region", region],
    ["Version", version],
  ]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`)
    .join("&");
}

/**
 * Build the fully-signed request for one OpenAPI action.
 * Returns `{ url, headers }`; `headers` carries X-Date / X-Content-Sha256 /
 * Content-Type / Authorization. `now` is injectable for deterministic tests.
 */
export function buildSignedRequest({ accessKeyId, secretAccessKey, region, version, action, now = new Date() }) {
  const query = canonicalQuery({ action, region, version });
  const xDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const shortDate = xDate.slice(0, 8);
  const body = Buffer.from("");
  const xContentSha256 = sha256Hex(body);
  const canonicalHeaders =
    `host:${OPENAPI_HOST}\n` +
    `x-date:${xDate}\n` +
    `x-content-sha256:${xContentSha256}\n` +
    `content-type:${CONTENT_TYPE}\n`;
  const canonicalRequest =
    `POST\n/\n${query}\n${canonicalHeaders}\n${SIGNED_HEADERS}\n${xContentSha256}`;
  const credentialScope = `${shortDate}/${region}/${SERVICE}/request`;
  const stringToSign = `HMAC-SHA256\n${xDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;
  const kDate = hmacSha256(secretAccessKey, shortDate);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, SERVICE);
  const kSigning = hmacSha256(kService, "request");
  const signature = hmacSha256(kSigning, stringToSign).toString("hex");
  return {
    url: `https://${OPENAPI_HOST}/?${query}`,
    headers: {
      "X-Date": xDate,
      "X-Content-Sha256": xContentSha256,
      "Content-Type": CONTENT_TYPE,
      Authorization: `HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${SIGNED_HEADERS}, Signature=${signature}`,
    },
  };
}