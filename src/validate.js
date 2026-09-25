"use strict";

// Strict, dependency-free validation. Every external value passes through here.
// No eval, no new Function, no innerHTML with external data anywhere in the extension.

const MAX_TEXT = 200;

/** Validate a dotted-quad IPv4 string. Rejects leading zeros, non-digits, out-of-range octets. */
export function isValidIPv4(v) {
  if (typeof v !== "string") return false;
  const parts = v.split(".");
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return false;
    if (p.length > 1 && p[0] === "0") return false;
    const n = Number(p);
    if (n < 0 || n > 255) return false;
  }
  return true;
}

/** Validate an IPv6 string: hex groups, one "::", optional embedded IPv4 tail, optional zone id. */
export function isValidIPv6(v) {
  if (typeof v !== "string") return false;
  let s = v.trim();
  if (!s.includes(":")) return false;
  s = s.split("%")[0]; // strip zone id; public identities never carry one
  const double = s.split("::");
  if (double.length > 2) return false;
  const [head, rest] = double;
  let groups = [];
  let tail = [];
  if (double.length === 2) {
    if (head === "" && rest === "") return false; // bare "::"
    if (head) groups = head.split(":");
    if (rest) tail = rest.split(":");
    if (groups.length + tail.length > 6) return false; // "::" must cover >= 1 group
  } else {
    groups = s.split(":");
    if (groups.length !== 8) return false;
  }
  const all = groups.concat(tail);
  for (let i = 0; i < all.length; i++) {
    const g = all[i];
    if (i === all.length - 1 && g.includes(".")) {
      if (!isValidIPv4(g)) return false;
      continue;
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return false;
  }
  return true;
}

/** Strip control characters, trim, cap length. Returns undefined for non-strings/empty. */
export function sanitizeText(v, maxLen = MAX_TEXT) {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!s) return undefined;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

/** Validate a two-letter uppercase country code. */
export function upperTwo(s) {
  const t = sanitizeText(s, 8);
  if (!t) return undefined;
  const u = t.toUpperCase();
  return /^[A-Z]{2}$/.test(u) ? u : undefined;
}

/** Parse "AS62240 Clouvider Limited" into { asn: "AS62240", organization: "Clouvider Limited" }. */
export function asnFromOrg(org) {
  const t = sanitizeText(org, 120);
  if (!t) return undefined;
  const m = t.match(/^(AS\d+)\s+(.*)$/);
  if (!m) return undefined;
  return { asn: m[1], organization: sanitizeText(m[2], 120) };
}

/** Canonical form for IP comparison. */
export function normalizeIp(ip) {
  return ip ? String(ip).toLowerCase() : "";
}

/**
 * Resolve a displayable country name from an ISO-3166 alpha-2 code via Intl.
 * Many providers (e.g. ipinfo.io) return only the code ("US"), not the name -
 * the UI should always render the full name when the code is available.
 * Returns undefined when the code is invalid or Intl.DisplayNames is unavailable.
 */
const _ccNames = (typeof Intl !== "undefined" && Intl.DisplayNames)
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;
export function countryName(code) {
  const c = upperTwo(code);
  if (!c || !_ccNames) return undefined;
  try {
    const name = _ccNames.of(c);
    // Intl returns the code itself for unknown regions - treat as no name
    return (typeof name === "string" && name !== c) ? name : undefined;
  } catch {
    return undefined;
  }
}