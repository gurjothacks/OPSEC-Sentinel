"use strict";

export const STATUS = { GREEN: "green", YELLOW: "yellow", RED: "red", UNKNOWN: "unknown" };
export const CHECK = { PASS: "pass", FAIL: "fail", UNKNOWN: "unknown" };

export function checkStatus(...vals) {
  for (const v of vals) {
    if (v === CHECK.FAIL || v === "fail") return "fail";
  }
  for (const v of vals) {
    if (v === CHECK.UNKNOWN || v === "unknown") return "unknown";
  }
  return "pass";
}

/**
 * Build the per-check result set.
 * Leak-oriented semantics: a row PASSes when nothing anomalous was observed
 * (e.g. "IPv6: None detected" is PASS, not FAIL - absence is not a leak).
 *
 * @param {import("./typedefs.js").NetworkIdentity|null} identity
 * @param {{status: string, note?: string}|null} webrtcResult
 * @param {{ipChanged:boolean, geoChanged:boolean, asnChanged:boolean}} change
 * @param {boolean} [providerConflict] true when two providers disagree on the IP.
 * @returns {import("./typedefs.js").OpsecStatus}
 */
export function computeChecks(identity, webrtcResult, change, providerConflict = false, familyMismatch = false) {
  const hasV4 = !!(identity && identity.ipv4);
  const hasV6 = !!(identity && identity.ipv6);
  const hasIdentity = hasV4 || hasV6;
  const hasBaseline = !!(change && change.hasPrevious);

  let identityStatus = CHECK.PASS;
  let identityNote = "Current identity consistent with the previous observation";
  if (providerConflict) {
    identityStatus = CHECK.FAIL;
    identityNote = "IP providers disagree on the public address";
  } else if (familyMismatch) {
    identityStatus = CHECK.FAIL;
    identityNote = "IPv4 and IPv6 indicate different network identities";
  } else if (change && change.ipChanged) {
    identityStatus = CHECK.FAIL;
    identityNote = "A network identity change was detected";
  } else if (change && (change.geoChanged || change.asnChanged)) {
    identityStatus = CHECK.FAIL;
    identityNote = "Location or ASN changed since the previous observation";
  } else if (!hasBaseline && hasIdentity) {
    // First observation: no baseline yet - comparison was not performed.
    identityStatus = CHECK.UNKNOWN;
    identityNote = "First observation - no previous identity to compare against";
  } else if (!hasIdentity) {
    identityStatus = CHECK.UNKNOWN;
    identityNote = "No identity yet to compare";
  }

  return {
    ipv4: { status: CHECK.PASS, note: hasV4 ? "IPv4 verified" : "No IPv4 detected" },
    ipv6: { status: CHECK.PASS, note: hasV6 ? "IPv6 verified" : "No IPv6 detected" },
    webrtc: {
      status: webrtcResult ? webrtcResult.status : CHECK.UNKNOWN,
      note: webrtcResult && webrtcResult.note ? webrtcResult.note : "WebRTC check not run"
    },
    identity: { status: identityStatus, note: identityNote },
    dns: { status: CHECK.UNKNOWN, note: "DNS path is not testable from a browser extension" }
  };
}

/**
 * Overall status model:
 *  - RED     meaningful leak or unexpected identity (IP) change
 *  - YELLOW  information incomplete / a check could not be performed / geo-asn drift
 *  - UNKNOWN cannot reliably determine the state
 *  - GREEN   everything expected is consistent
 * API failures are NEVER classified as leaks; they surface as UNKNOWN (see service).
 */
export function computeOverall({ identity, checks, change, providerConflict = false, familyMismatch = false }) {
  if (!identity || (!identity.ipv4 && !identity.ipv6)) return STATUS.UNKNOWN;
  if (change && change.ipChanged) return STATUS.RED;
  if (checks.webrtc.status === CHECK.FAIL) return STATUS.RED;
  if (providerConflict) return STATUS.YELLOW;
  if (familyMismatch) return STATUS.YELLOW;
  if (change && (change.geoChanged || change.asnChanged)) return STATUS.YELLOW;
  if (checks.webrtc.status === CHECK.UNKNOWN) return STATUS.YELLOW;
  if (!identity.country && !identity.countryCode) return STATUS.YELLOW;
  // First observation / unperformable consistency check: state is established but
  // one check is UNKNOWN - do not fabricate GREEN.
  if (checks.identity && checks.identity.status === CHECK.UNKNOWN) return STATUS.YELLOW;
  return STATUS.GREEN;
}