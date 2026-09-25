"use strict";

import { STATUS } from "./status.js";

/** Compact badge form of the identity: "185..." for IPv4, "IPv6" for IPv6-only. */
export function shortIp(identity) {
  const ip = identity && (identity.ipv4 || identity.ipv6);
  if (!ip) return null;
  if (identity.ipv6 && !identity.ipv4) return "IPv6";
  return `${ip.split(".")[0]}...`;
}

/** Toolbar badge text. Always short; never the full IP. */
export function badgeText(state) {
  if (!state) return "?";
  if (state.overall === STATUS.RED) return "!";
  if (state.overall === STATUS.YELLOW || state.overall === STATUS.UNKNOWN) return "?";
  const mode = state.settings && state.settings.badgeMode ? state.settings.badgeMode : "ip";
  if (mode === "country") {
    const id = state.identity;
    const cc = id && (id.countryCode || "");
    return cc ? cc : "OK";
  }
  if (mode === "ok") return "OK";
  return shortIp(state.identity) || "OK";
}

export function badgeColor(state) {
  switch (state && state.overall) {
    case STATUS.RED: return "#F97066";
    case STATUS.YELLOW: return "#F2C94C";
    case STATUS.UNKNOWN: return "#626D7E";
    default: return "#32D583";
  }
}

export function iconVariant(state) {
  switch (state && state.overall) {
    case STATUS.RED: return "critical";
    case STATUS.YELLOW: return "warning";
    case STATUS.UNKNOWN: return "warning";
    default: return "normal";
  }
}

export function statusLabel(overall) {
  switch (overall) {
    case STATUS.RED: return "Leak / identity change";
    case STATUS.YELLOW: return "Partial information";
    case STATUS.UNKNOWN: return "Status unknown";
    default: return "Network OK";
  }
}

/** Toolbar tooltip. Contains the full public IP - shown locally on hover, as intended. */
export function tooltipText(state) {
  const id = state && state.identity;
  const chg = state && state.lastChange && !state.lastChange.seen ? state.lastChange : null;
  if (chg && chg.kind === "ip") {
    return [
      "OPSEC Sentinel",
      "",
      "Network identity changed",
      "",
      `Previous: ${chg.previousIp || "unknown"}`,
      `Current: ${chg.currentIp || "unknown"}`
    ].join("\n");
  }
  const ip = id ? id.ipv4 || id.ipv6 || "unknown" : "unknown";
  const loc = id && (id.city || id.country)
    ? [id.city, id.country].filter(Boolean).join(", ")
    : "unknown";
  const asn = id && id.asn ? id.asn : "unknown";
  const net = id && id.networkType ? id.networkType : "unknown";
  let st;
  if (state && state.overall === STATUS.RED) {
    st = state.redReason === "leak" ? "Leak" : "Identity changed";
  } else if (state && state.stale) {
    st = "Stale";
  } else if (state && state.overall === STATUS.UNKNOWN) {
    st = "Unknown";
  } else if (state && state.overall === STATUS.YELLOW) {
    st = "Incomplete";
  } else {
    st = "OK";
  }
  return [
    "OPSEC Sentinel",
    `IP: ${ip}`,
    `Location: ${loc}`,
    `ASN: ${asn}`,
    `Network: ${net}`,
    `Status: ${st}`
  ].join("\n");
}

export function formatTime(ts) {
  if (!ts) return "never";
  const d = new Date(ts);
  return `${d.toLocaleTimeString([], { hour12: false })} ${d.toLocaleDateString()}`;
}