"use strict";

import { isValidIPv4, isValidIPv6, sanitizeText, upperTwo, asnFromOrg, countryName } from "../validate.js";
import { fetchJson } from "../http.js";

export const IPAPI_IS_ENDPOINT = "https://api.ipapi.is/";
export const IPINFO_ENDPOINT = "https://ipinfo.io/json";

/**
 * Network-type derivation, strictly from provider-supplied classification flags.
 * Never guesses. Free-tier ipapi.is responses carry no flags -> "Unknown".
 */
function deriveNetworkType(j) {
  if (!j || typeof j !== "object") return "Unknown";
  if (j.is_tor === true) return "Tor";
  if (j.is_vpn === true) return "VPN";
  if (j.is_proxy === true) return "Proxy";
  if (j.is_icloud_relay === true) return "iCloud Relay";
  if (j.is_datacenter === true) return "Datacenter";
  const ct = sanitizeText(j.company && j.company.type, 32);
  if (ct === "hosting") return "Datacenter";
  if (ct === "isp") return "Residential";
  return "Unknown";
}

/**
 * Primary provider. Handles both payload shapes:
 *  - paid/keyed tier (nested: ip, location{...}, asn{...}, company{...}, is_vpn...)
 *  - free tier (flat: ip, asn "AS62240 Clouvider Limited", company, city, region,
 *    country, timezone; no classification flags, no country code)
 * Throws {kind:"invalid"} when no valid IP is present.
 */
export async function ipapiIsProvider({ timeoutMs = 8000, fetchImpl = fetch, base = IPAPI_IS_ENDPOINT, lookupIp = null } = {}) {
  let url = base;
  if (lookupIp) url = base + (base.includes("?") ? "&" : "?") + "q=" + encodeURIComponent(lookupIp);
  const j = await fetchJson(url, { timeoutMs, fetchImpl });
  if (!j || typeof j !== "object") {
    const err = new Error("invalid provider payload");
    err.kind = "invalid";
    throw err;
  }

  const ip = sanitizeText(j.ip, 64);
  if (!isValidIPv4(ip) && !isValidIPv6(ip)) {
    const err = new Error("no valid IP in provider payload");
    err.kind = "invalid";
    throw err;
  }

  const loc = j.location && typeof j.location === "object" ? j.location : {};
  const asnObj = j.asn && typeof j.asn === "object" ? j.asn : null;
  const flatAsn = asnFromOrg(j.asn); // flat shape: "AS62240 Clouvider Limited"
  const nestedAsn = asnObj && Number.isInteger(Number(asnObj.asn)) && Number(asnObj.asn) > 0
    ? { asn: `AS${Number(asnObj.asn)}`, organization: sanitizeText(asnObj.description || asnObj.name, 128) }
    : null;
  const countryCode = upperTwo(loc.country_code);

  return {
    ipv4: isValidIPv4(ip) ? ip : undefined,
    ipv6: isValidIPv6(ip) ? ip : undefined,
    country: sanitizeText(loc.country || j.country, 64) || countryName(countryCode),
    countryCode,
    region: sanitizeText(loc.region || j.region, 64),
    city: sanitizeText(loc.city || j.city, 64),
    timezone: sanitizeText(loc.timezone || j.timezone, 64),
    asn: (nestedAsn && nestedAsn.asn) || (flatAsn && flatAsn.asn),
    organization: (nestedAsn && nestedAsn.organization) ||
      (flatAsn && flatAsn.organization) ||
      sanitizeText(j.company && j.company.name, 128) ||
      sanitizeText(j.company, 128),
    networkType: deriveNetworkType(j),
    privacy: {
      vpn: j.is_vpn === true,
      proxy: j.is_proxy === true,
      tor: j.is_tor === true,
      datacenter: j.is_datacenter === true,
      icloudRelay: j.is_icloud_relay === true,
      anonymous: j.is_anonymous === true,
      mobile: j.is_mobile === true
    },
    provider: "ipapi.is"
  };
}

/**
 * Fallback / supplement provider: basic geo + ASN + country code. No classification flags.
 */
export async function ipinfoProvider({ timeoutMs = 8000, fetchImpl = fetch, base = IPINFO_ENDPOINT } = {}) {
  const j = await fetchJson(base, { timeoutMs, fetchImpl });
  if (!j || typeof j !== "object") {
    const err = new Error("invalid provider payload");
    err.kind = "invalid";
    throw err;
  }
  const ip = sanitizeText(j.ip, 64);
  if (!isValidIPv4(ip) && !isValidIPv6(ip)) {
    const err = new Error("no valid IP in provider payload");
    err.kind = "invalid";
    throw err;
  }
  const parsed = asnFromOrg(j.org);
  const countryCode = upperTwo(j.country);
  return {
    ipv4: isValidIPv4(ip) ? ip : undefined,
    ipv6: isValidIPv6(ip) ? ip : undefined,
    country: countryName(countryCode), // ipinfo gives only a code; display the full name
    countryCode,
    region: sanitizeText(j.region, 64),
    city: sanitizeText(j.city, 64),
    timezone: sanitizeText(j.timezone, 64),
    asn: parsed ? parsed.asn : undefined,
    organization: parsed ? parsed.organization : sanitizeText(j.org, 128),
    networkType: "Unknown",
    privacy: null,
    provider: "ipinfo.io"
  };
}