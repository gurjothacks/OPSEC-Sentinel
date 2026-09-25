"use strict";

import { isValidIPv4, isValidIPv6, sanitizeText } from "../validate.js";
import { fetchText } from "../http.js";

export const IPV4_ENDPOINT = "https://api.ipify.org/";
export const IPV6_ENDPOINT = "https://api6.ipify.org/";

/** Plain-text IPv4 lookup. Throws {kind:"invalid"} on any non-IPv4 answer. */
export async function fetchIpv4({ timeoutMs = 8000, fetchImpl = fetch, base = IPV4_ENDPOINT } = {}) {
  const text = await fetchText(base, { timeoutMs, fetchImpl });
  const ip = sanitizeText(text, 64);
  if (!isValidIPv4(ip)) {
    const err = new Error("invalid IPv4 response");
    err.kind = "invalid";
    throw err;
  }
  return { ipv4: ip };
}

/**
 * Plain-text IPv6 lookup. Returns { ipv6 } or null when no IPv6 answer is
 * obtained (not detected, or the v6 path is blocked - the two are indistinguishable
 * from inside the browser, so absence is reported as "Not detected", never as fact).
 */
export async function fetchIpv6({ timeoutMs = 4000, fetchImpl = fetch, base = IPV6_ENDPOINT } = {}) {
  try {
    const text = await fetchText(base, { timeoutMs, fetchImpl });
    const ip = sanitizeText(text, 64);
    if (!isValidIPv6(ip)) return null;
    return { ipv6: ip };
  } catch {
    return null;
  }
}