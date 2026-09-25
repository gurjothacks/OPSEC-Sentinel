"use strict";

// OPSEC Sentinel popup. Renders the cached state owned by the background page.
// All external values are written through textContent / value - never innerHTML.

import { STATUS, CHECK } from "../src/status.js";
import { formatTime } from "../src/format.js";

const $ = (id) => document.getElementById(id);
const setText = (id, value) => { const el = $(id); if (el) el.textContent = value == null ? "-" : String(value); };

let lastRenderedState = null;

/** Mask an IP for display when maskIp is on: "203.0.113.x" / "2001:db8:...". */
function maskIp(ip) {
  if (!ip) return ip;
  if (ip.includes(".")) {
    const parts = ip.split(".");
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : ip;
  }
  const parts = ip.split(":");
  return parts.slice(0, 2).join(":") + ":...";
}

/** Human data age: "just now", "2 min ago", "1 h 12 min ago", ... */
function ageText(ts, now) {
  if (!ts) return "never";
  const ms = Math.max(0, now - ts);
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min ago`;
}

function applyTheme(appearance) {
  const mode = appearance || "system";
  const dark = mode === "dark" || (mode === "system" && globalThis.matchMedia && !matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function render(state) {
  lastRenderedState = state;
  const identity = state.identity;
  const settings = state.settings || {};
  const mask = settings.maskIp === true;
  const showIp = (ip) => (ip && mask ? maskIp(ip) : ip);
  applyTheme(settings.appearance);

  // ---- status row ----
  const row = $("status-row");
  row.dataset.state = state.overall || "unknown";
  const idCheck = state.checks && state.checks.identity;
  const isFirstObservation = !!(idCheck && idCheck.status === CHECK.UNKNOWN &&
    idCheck.note && idCheck.note.toLowerCase().includes("first observation"));
  if (state.stale && identity) {
    setText("status-title", "Network identity stale");
  } else if (state.overall === STATUS.RED) {
    setText("status-title", state.redReason === "leak" ? "Network identity requires attention" : "Network identity changed");
  } else if (state.overall === STATUS.YELLOW) {
    setText("status-title", isFirstObservation ? "Network identity verified" : "Network identity requires attention");
  } else if (state.overall === STATUS.UNKNOWN) {
    setText("status-title", "Network identity unavailable");
  } else {
    setText("status-title", isFirstObservation ? "Network identity verified" : "Network identity consistent");
  }
  let sub;
  if (state.stale) sub = ageText(state.lastCheck, Date.now()) ? `Last verified ${ageText(state.lastCheck, Date.now())}` : "Showing last known identity.";
  else if (!identity) sub = "Checking network identity...";
  else if (state.lastCheck) sub = `Verified ${ageText(state.lastCheck, Date.now())}`;
  else sub = "";
  setText("status-sub", sub);

  // ---- identity-change notice ----
  const chg = state.lastChange;
  const chgEl = $("change-banner");
  if (chg && !chg.seen) {
    chgEl.classList.remove("hidden");
    if (chg.kind === "ip") {
      setText("chg-prev", showIp(chg.previousIp));
      setText("chg-curr", showIp(chg.currentIp));
      $("geo-change-note").classList.add("hidden");
    } else {
      setText("chg-prev", chg.previousCountry || "-");
      setText("chg-curr", chg.currentCountry || "-");
      const note = $("geo-change-note");
      note.classList.remove("hidden");
      note.textContent = `IP unchanged, but location/ASN changed: ${chg.previousCountry || "?"} -> ${chg.currentCountry || "?"}, ${chg.previousAsn || "?"} -> ${chg.currentAsn || "?"}`;
    }
  } else {
    chgEl.classList.add("hidden");
  }

  // ---- mismatch notice (Task 4) ----
  const mi = $("mismatch-banner");
  if (identity && identity.v6Identity && state.checks && state.checks.identity &&
      state.checks.identity.status === CHECK.FAIL &&
      state.checks.identity.note && state.checks.identity.note.includes("different network identities")) {
    mi.classList.remove("hidden");
    const v4s = [identity.country || "unknown", identity.asn || "unknown"].join(" · ");
    const v6s = [identity.v6Identity.country || "unknown", identity.v6Identity.asn || "unknown"].join(" · ");
    setText("mismatch-sub", `IPv4: ${v4s}    IPv6: ${v6s}  —  This is a warning, not proof of a leak.`);
  } else {
    mi.classList.add("hidden");
  }

  // ---- stale notice ----
  const staleEl = $("stale-banner");
  if (state.stale && identity) {
    staleEl.classList.remove("hidden");
    setText("stale-sub", state.lastCheck
      ? `Identity not re-verified since ${formatTime(state.lastCheck)}. Data may be stale.`
      : "Identity never verified. Data unavailable.");
  } else {
    staleEl.classList.add("hidden");
  }

  // ---- public IP focus ----
  const v4 = identity ? identity.ipv4 : null;
  const v6 = identity ? identity.ipv6 : null;
  const primary = v4 || v6;
  setText("ip-primary", primary ? showIp(primary) : "-");
  $("btn-copy").disabled = !primary;
  const geo = identity && (identity.country || identity.city)
    ? [identity.city, identity.country].filter(Boolean).join(" · ")
    : (identity ? "Location unavailable" : "-");
  setText("ip-geo", geo);

  // ---- network meta ----
  setText("id-asn", identity ? identity.asn || "Unknown" : "-");
  setText("id-org", identity ? identity.organization || "Unknown" : "-");
  setText("id-nettype", identity ? identity.networkType || "Unknown" : "-");

  // ---- checks (quiet indicators) ----
  const chkMap = { ipv4: "chk-ipv4", ipv6: "chk-ipv6", webrtc: "chk-webrtc", identity: "chk-identity" };
  for (const [key, elId] of Object.entries(chkMap)) {
    const c = state.checks && state.checks[key];
    const el = $(elId);
    const st = c ? c.status : "unknown";
    el.textContent = st === CHECK.PASS ? "✓" : st === CHECK.FAIL ? "!" : "–";
    el.className = `chk ${st}`;
    el.title = c && c.note ? c.note : "";
  }

  // ---- details ----
  setText("d-ipv4", showIp(v4) || "None detected");
  setText("d-ipv6", showIp(v6) || "None detected");
  setText("d-country", identity ? identity.country || "Unknown" : "-");
  setText("d-countrycode", identity ? identity.countryCode || "Unknown" : "-");
  setText("d-region", identity ? identity.region || "Unknown" : "-");
  setText("d-city", identity ? identity.city || "Unknown" : "-");
  setText("d-timezone", identity ? identity.timezone || "Unknown" : "-");
  setText("d-asn", identity ? identity.asn || "Unknown" : "-");
  setText("d-org", identity ? identity.organization || "Unknown" : "-");
  setText("d-nettype", identity ? identity.networkType || "Unknown" : "-");
  setText("d-provider", identity ? identity.provider || "Unknown" : "-");
  setText("d-verified", state.lastCheck ? new Date(state.lastCheck).toLocaleString() : "never");
  setText("d-age", state.lastCheck ? ageText(state.lastCheck, Date.now()) : "-");

  // ---- identity consistency details (what the compact "Consistency ✓" row means) ----
  const idChk = state.checks && state.checks.identity;
  const prev = state.previousIdentity;
  const firstObs = !!(idChk && idChk.status === CHECK.UNKNOWN && idChk.note &&
    idChk.note.toLowerCase().includes("first observation"));
  if (firstObs) {
    setText("d-cons-status", "First observation");
    setText("d-cons-expl", "No previous identity exists for comparison.");
  } else if (idChk && idChk.status === CHECK.FAIL && idChk.note && idChk.note.includes("different network identities")) {
    setText("d-cons-status", "IPv4/IPv6 mismatch");
    setText("d-cons-expl", "IPv4 and IPv6 indicate different network identities. This is a warning, not automatically a leak.");
  } else if (idChk && idChk.status === CHECK.FAIL) {
    setText("d-cons-status", "Changed");
    setText("d-cons-expl", "A change in public network identity was detected compared to the previous observation.");
  } else if (idChk && idChk.status === CHECK.PASS) {
    setText("d-cons-status", "Consistent");
    setText("d-cons-expl", "Current public network identity matches the previous observation.");
  } else {
    setText("d-cons-status", "Unknown");
    setText("d-cons-expl", "Insufficient previous or current data to perform the comparison.");
  }
  setText("d-cons-prev4", prev && prev.ipv4 ? showIp(prev.ipv4) : "None");
  setText("d-cons-curr4", identity && identity.ipv4 ? showIp(identity.ipv4) : "None");
  setText("d-cons-prev6", prev && prev.ipv6 ? showIp(prev.ipv6) : "None detected");
  setText("d-cons-curr6", identity && identity.ipv6 ? showIp(identity.ipv6) : "None detected");
  setText("d-cons-time", state.lastCheck ? new Date(state.lastCheck).toLocaleString() : "-");

  // ---- WebRTC details (kept out of the compact popup by design) ----
  const wrk = state.checks && state.checks.webrtc;
  const wrExpl = $("d-webrtc-expl");
  const wrLimit = $("d-webrtc-limit");
  if (wrk) {
    setText("d-webrtc-status", wrk.status === CHECK.PASS ? "PASS" : wrk.status === CHECK.FAIL ? "FAIL" : "UNKNOWN");
    setText("d-webrtc-result", wrk.note || "-");
    if (wrk.status === CHECK.PASS) {
      wrExpl.classList.remove("hidden");
      setText("d-webrtc-expl", "Meaning: no unexpected public WebRTC candidate was observed during the available test.");
      wrLimit.classList.add("hidden");
    } else if (wrk.status === CHECK.FAIL) {
      wrExpl.classList.remove("hidden");
      setText("d-webrtc-expl", "Meaning: an unexpected public WebRTC address was observed.");
      wrLimit.classList.add("hidden");
    } else {
      wrExpl.classList.remove("hidden");
      setText("d-webrtc-expl", wrk.note && wrk.note.includes("disabled") && (state.settings && state.settings.webrtcEnabled === false)
        ? "Meaning: the WebRTC exposure test was not performed because the check is disabled in settings."
        : "Meaning: Firefox restrictions prevented a complete WebRTC exposure test.");
      wrLimit.classList.remove("hidden");
      setText("d-webrtc-limit", "Firefox does not expose no-candidate time to extensions; absence of candidates can also mean none were observed. Overall state stays YELLOW rather than fabricating PASS.");
    }
  } else {
    setText("d-webrtc-status", "UNKNOWN");
    setText("d-webrtc-result", "-");
    wrExpl.classList.add("hidden");
    wrLimit.classList.add("hidden");
  }

  renderRouting(state);
  renderHistory(state);
}

function renderRouting(state) {
  const box = $("routing-detail");
  box.textContent = "";
  if (!state.checks) {
    box.textContent = "No check results yet.";
    return;
  }
  const rows = [["IPv4", state.checks.ipv4], ["IPv6", state.checks.ipv6], ["WebRTC", state.checks.webrtc], ["Consistency", state.checks.identity]];
  const wrap = document.createElement("div");
  wrap.className = "meta";
  for (const [label, c] of rows) {
    if (!c) continue;
    const row = document.createElement("div");
    row.className = "meta-row";
    const s = document.createElement("span");
    s.textContent = label;
    const b = document.createElement("b");
    b.textContent = `${(c.status || "unknown")}${c.note ? ` · ${c.note}` : ""}`;
    row.append(s, b);
    wrap.appendChild(row);
  }
  box.appendChild(wrap);
}

function renderHistory(state) {
  const tbody = $("history-body");
  tbody.textContent = "";
  $("history-note").classList.toggle("hidden", (state.settings && state.settings.storeHistory) !== false);
  const history = state.history || [];
  if (!history.length) {
    const row = document.createElement("div");
    row.className = "meta-row";
    const s = document.createElement("span");
    if ((state.settings && state.settings.storeHistory) === false) s.textContent = "Disabled in settings.";
    else s.textContent = "No identity changes recorded.";
    row.appendChild(s);
    tbody.appendChild(row);
    return;
  }
  for (const h of history) {
    const row = document.createElement("div");
    row.className = "meta-row";
    const s = document.createElement("span");
    s.textContent = formatTime(h.timestamp);
    const b = document.createElement("b");
    if (h.kind === "ip") b.textContent = `${h.previousIp || "?"} → ${h.currentIp || "?"}`;
    else b.textContent = `${h.previousCountry || "?"} → ${h.currentCountry || "?"} (ASN ${h.previousAsn || "?"} → ${h.currentAsn || "?"})`;
    row.append(s, b);
    tbody.appendChild(row);
  }
}

async function loadState() {
  try {
    const res = await browser.runtime.sendMessage({ type: "opsec:getState" });
    if (res && res.ok) {
      render(res.state);
      return res.state;
    }
  } catch { /* background unavailable */ }
  render({ overall: STATUS.UNKNOWN, checks: null, identity: null, history: [], lastChange: null, stale: false, lastCheck: null, settings: {}, previousIdentity: null });
  return null;
}

document.addEventListener("DOMContentLoaded", async () => {
  const st = await loadState();
  try { $("about-version").textContent = browser.runtime.getManifest().version || "-"; } catch { /* noop */ }

  if (st && st.lastChange && !st.lastChange.seen) {
    try { await browser.runtime.sendMessage({ type: "opsec:ackChange" }); } catch { /* noop */ }
  }

  $("btn-copy").addEventListener("click", async () => {
    const s = lastRenderedState;
    const ip = s && s.identity ? (s.identity.ipv4 || s.identity.ipv6) : null;
    if (!ip) return;
    const btn = $("btn-copy");
    try {
      await navigator.clipboard.writeText(ip);
      btn.textContent = "Copied";
      setTimeout(() => { btn.textContent = "Copy"; }, 1200);
    } catch { btn.textContent = "Failed"; setTimeout(() => { btn.textContent = "Copy"; }, 1200); }
  });

  $("btn-refresh").addEventListener("click", async () => {
    const btn = $("btn-refresh");
    btn.disabled = true;
    btn.textContent = "Refreshing...";
    try {
      const res = await browser.runtime.sendMessage({ type: "opsec:refresh" });
      if (res && res.ok) render(res.state);
    } catch { /* background unavailable */ }
    btn.disabled = false;
    btn.textContent = "Refresh";
  });

  $("btn-details").addEventListener("click", () => {
    const d = $("details");
    d.classList.toggle("hidden");
    $("btn-details").firstChild.textContent = d.classList.contains("hidden") ? "View details " : "Hide details ";
  });

  $("btn-settings").addEventListener("click", () => {
    const box = $("settings");
    box.classList.toggle("hidden");
    const st2 = lastRenderedState;
    if (!box.classList.contains("hidden") && st2 && st2.settings) {
      $("set-interval").value = st2.settings.intervalMinutes || 5;
      $("set-badgemode").value = st2.settings.badgeMode || "ip";
      $("set-webrtc").checked = st2.settings.webrtcEnabled !== false;
      $("set-api").value = st2.settings.apiBaseOverride || "";
      $("set-maskip").checked = st2.settings.maskIp === true;
      $("set-history").checked = st2.settings.storeHistory !== false;
      $("set-appearance").value = st2.settings.appearance || "system";
    }
  });

  $("btn-save").addEventListener("click", async () => {
    const patch = {
      intervalMinutes: Number($("set-interval").value),
      badgeMode: $("set-badgemode").value,
      webrtcEnabled: $("set-webrtc").checked,
      apiBaseOverride: $("set-api").value,
      maskIp: $("set-maskip").checked,
      storeHistory: $("set-history").checked,
      appearance: $("set-appearance").value
    };
    try {
      const res = await browser.runtime.sendMessage({ type: "opsec:setSettings", settings: patch });
      $("settings-status").textContent = res && res.ok ? "Saved." : "Save failed - endpoint rejected or background unavailable.";
      if (res && res.ok) render(res.state);
    } catch {
      $("settings-status").textContent = "Save failed - background unavailable.";
    }
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.opsecState && changes.opsecState.newValue) {
      render(changes.opsecState.newValue);
    }
  });
});
