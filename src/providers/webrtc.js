"use strict";

import { isValidIPv4, isValidIPv6 } from "../validate.js";

export const DEFAULT_STUN = "stun:stun.l.google.com:19302";

function addUnique(arr, v) {
  if (!arr.includes(v)) arr.push(v);
}

/**
 * Pure parser for one raw ICE candidate line. Exported for tests.
 * Returns { kind, ip } with lowercase ip, { kind:"host", ip:null, mdns:true }
 * for mDNS-obfuscated host candidates, or null for garbage.
 */
export function parseCandidate(line) {
  if (typeof line !== "string") return null;
  const m = line.match(/candidate:.*? (\S+) (\d+) typ (host|srflx|prflx|relay)/i);
  if (!m) return null;
  const ip = m[1];
  if (ip.endsWith(".local")) return { kind: "host", ip: null, mdns: true };
  if (!isValidIPv4(ip) && !isValidIPv6(ip)) return null;
  return { kind: m[3].toLowerCase(), ip: ip.toLowerCase() };
}

/**
 * Gather ICE candidates (host + STUN srflx) with a hard timeout.
 * Runs in the background event page, which has DOM/WebRTC access (MV3 service
 * workers in Firefox do not).
 */
export async function gatherCandidates({
  timeoutMs = 3000,
  stun = DEFAULT_STUN,
  RTCPeerConnectionImpl = null
} = {}) {
  const PC = RTCPeerConnectionImpl || (typeof RTCPeerConnection !== "undefined" ? RTCPeerConnection : null);
  if (!PC) return { supported: false, reason: "no-rtc" };
  let pc;
  try {
    pc = new PC({ iceServers: [{ urls: stun }] });
  } catch {
    return { supported: false, reason: "rtc-failed" };
  }
  return new Promise((resolve) => {
    const result = { supported: true, publicIps: [], privateIps: [], mdns: false, complete: false };
    let settled = false;
    const finish = (complete) => {
      if (settled) return;
      settled = true;
      result.complete = complete;
      try { pc.close(); } catch { /* noop */ }
      resolve(result);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    try { pc.createDataChannel("opsec"); } catch { /* noop */ }
    pc.onicecandidate = (e) => {
      if (!e || !e.candidate) {
        clearTimeout(timer);
        finish(true);
        return;
      }
      const parsed = parseCandidate(e.candidate.candidate || "");
      if (!parsed) return;
      if (parsed.kind === "host") {
        if (parsed.mdns) result.mdns = true;
        else addUnique(result.privateIps, parsed.ip);
      } else if (parsed.kind === "srflx" || parsed.kind === "prflx") {
        addUnique(result.publicIps, parsed.ip);
      }
    };
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        finish(true);
      }
    };
    pc.createOffer()
      .then((o) => pc.setLocalDescription(o))
      .catch(() => {
        clearTimeout(timer);
        finish(false);
      });
  });
}

/**
 * Evaluate gathered candidates against the current identity.
 * Any public candidate that does not match the identity's IP is a leak (FAIL).
 * Never fabricates a PASS: a timed-out or empty gather is UNKNOWN, because
 * "we observed nothing" is not evidence of absence of a leak.
 */
export function evaluateWebrtc(gathered, identity) {
  if (!gathered || gathered.supported !== true) {
    return { status: "unknown", note: "WebRTC check unavailable in this context" };
  }
  if (gathered.complete !== true) {
    return { status: "unknown", note: "WebRTC gathering timed out; result inconclusive" };
  }
  if (gathered.publicIps.length === 0) {
    if (gathered.mdns || (gathered.privateIps || []).length > 0) {
      return {
        status: "pass",
        note: gathered.mdns
          ? "No public candidate observed; host addresses mDNS-obfuscated"
          : "No public candidate observed"
      };
    }
    return { status: "unknown", note: "No ICE candidates observed" };
  }
  const known = new Set();
  if (identity && identity.ipv4) known.add(identity.ipv4.toLowerCase());
  if (identity && identity.ipv6) known.add(identity.ipv6.toLowerCase());
  const leaked = gathered.publicIps.filter((ip) => !known.has(ip));
  if (leaked.length > 0) {
    return {
      status: "fail",
      note: `Public candidate(s) not matching current identity: ${leaked.join(", ")}`
    };
  }
  return { status: "pass", note: "Public candidates match current identity" };
}