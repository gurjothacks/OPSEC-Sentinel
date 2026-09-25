"use strict";

import { STATUS, CHECK, computeChecks, computeOverall } from "../status.js";
import { badgeText, badgeColor, iconVariant, tooltipText } from "../format.js";
import { normalizeIp, countryName } from "../validate.js";
import { fetchIpv4, fetchIpv6 } from "../providers/ip.js";
import { ipapiIsProvider, ipinfoProvider } from "../providers/geo.js";
import { gatherCandidates, evaluateWebrtc } from "../providers/webrtc.js";

const STATE_KEY = "opsecState";
const HISTORY_MAX = 10;
const DEFAULT_SETTINGS = { intervalMinutes: 5, badgeMode: "ip", webrtcEnabled: true, apiBaseOverride: "", maskIp: false, storeHistory: true, appearance: "system" };

function isAllowedEndpoint(u) {
  try {
    const url = new URL(u);
    if (url.protocol === "https:") return true;
    if (url.protocol === "http:" && ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) return true;
  } catch { /* noop */ }
  return false;
}

function diffIdentities(prev, curr) {
  if (!prev || !curr) {
    return { ipChanged: false, geoChanged: false, asnChanged: false, hasPrevious: !!prev };
  }
  const v4c = normalizeIp(curr.ipv4);
  const v4p = normalizeIp(prev.ipv4 || "");
  const v6c = normalizeIp(curr.ipv6);
  const v6p = normalizeIp(prev.ipv6 || "");
  const ipChanged = v4c !== v4p || v6c !== v6p;
  const geoChanged =
    (curr.countryCode || curr.country || "") !== (prev.countryCode || prev.country || "") ||
    (curr.city || "") !== (prev.city || "");
  const asnChanged = (curr.asn || "") !== (prev.asn || "");
  return { ipChanged, geoChanged, asnChanged, hasPrevious: true };
}

function familyMismatchOf(identity) {
  const v = identity && identity.v6Identity;
  if (!identity || !v) return false;
  const countryDiff = identity.countryCode && v.countryCode && identity.countryCode !== v.countryCode;
  const asnDiff = identity.asn && v.asn && identity.asn !== v.asn;
  return !!(countryDiff || asnDiff);
}

/**
 * Central NetworkIdentity state machine. Owned by the background event page.
 *   providers (ip / geo / webrtc) -> NetworkIdentityService -> state ->
 *   toolbar badge/title/icon and popup (which reads the cached state).
 */
export class NetworkIdentityService {
  constructor({ storage, alarms, action, now = Date.now, fetchImpl = fetch }) {
    this.storage = storage;
    this.alarms = alarms;
    this.action = action;
    this.now = now;
    this.fetchImpl = fetchImpl;
    this.state = null;
    this.refreshing = false;
    this.lastRefreshPromise = null;
  }

  static async load(deps) {
    const svc = new NetworkIdentityService(deps);
    await svc.hydrate();
    return svc;
  }

  async hydrate() {
    let raw = null;
    try {
      raw = await this.storage.local.get(STATE_KEY);
    } catch { /* first run: no state */ }
    const st = (raw && raw[STATE_KEY]) || {};
    this.state = {
      identity: st.identity && typeof st.identity === "object" ? st.identity : null,
      previousIdentity: st.previousIdentity && typeof st.previousIdentity === "object" ? st.previousIdentity : null,
      checks: st.checks && typeof st.checks === "object" ? st.checks : null,
      overall: st.overall || STATUS.UNKNOWN,
      redReason: st.redReason || null,
      stale: st.stale === true,
      lastCheck: typeof st.lastCheck === "number" ? st.lastCheck : null,
      lastError: st.lastError || null,
      lastChange: st.lastChange || null,
      history: Array.isArray(st.history) ? st.history.slice(-HISTORY_MAX) : [],
      settings: { ...DEFAULT_SETTINGS, ...(st.settings || {}) },
      schemaVersion: 1
    };
  }

  async persist() {
    try {
      await this.storage.local.set({ [STATE_KEY]: this.state });
    } catch (e) {
      this._log("persist failed", e);
    }
  }

  // Logs never contain IPs, ASNs, locations, or URLs - status noise only.
  _log(msg, err) {
    const detail = err && err.kind ? `kind=${err.kind}` : "";
    console.log(`[opsec] ${msg}${detail ? ` ${detail}` : ""}`);
  }

  async init() {
    await this.scheduleAlarm();
    await this.applyToolbar();
    if (!this.state.identity || this.state.stale || !this.state.lastCheck) {
      this.refresh({ force: true });
    }
  }

  async scheduleAlarm() {
    const minutes = Math.min(60, Math.max(1, Math.floor(this.state.settings.intervalMinutes) || 5));
    try {
      if (this.alarms) {
        await this.alarms.clear("opsec-refresh");
        await this.alarms.create("opsec-refresh", { periodInMinutes: minutes });
      }
    } catch (e) {
      this._log("alarm setup failed", e);
    }
  }

  shouldAutoRefresh() {
    const intervalMs = (this.state.settings.intervalMinutes || 5) * 60_000;
    return !this.state.lastCheck || this.now() - this.state.lastCheck > intervalMs;
  }

  getState() {
    const s = this.state;
    return {
      ...s,
      identity: s.identity ? { ...s.identity } : null,
      previousIdentity: s.previousIdentity ? { ...s.previousIdentity } : null,
      checks: s.checks ? JSON.parse(JSON.stringify(s.checks)) : null,
      history: s.history.slice(),
      settings: { ...s.settings }
    };
  }

  // ---- refresh pipeline ----

  refresh({ force = false } = {}) {
    if (this.refreshing) return this.lastRefreshPromise;
    this.refreshing = true;
    this.lastRefreshPromise = this._doRefresh({ force }).finally(() => {
      this.refreshing = false;
    });
    return this.lastRefreshPromise;
  }

  async _doRefresh({ force }) {
    const started = this.now();
    let identity = null;
    let conflict = false;
    try {
      const collected = await this._collectIdentity();
      const p = collected.identity;
      conflict = collected.conflict === true;
      identity = {
        ipv4: p.ipv4 || undefined,
        ipv6: p.ipv6 || undefined,
        country: p.country || undefined,
        countryCode: p.countryCode || undefined,
        region: p.region || undefined,
        city: p.city || undefined,
        timezone: p.timezone || undefined,
        asn: p.asn || undefined,
        organization: p.organization || undefined,
        networkType: p.networkType || "Unknown",
        privacy: p.privacy || null,
        provider: p.provider || "unknown",
        timestamp: started
      };
    } catch (e) {
      this._log("identity fetch failed", e);
      return this._recordFailure(started, e);
    }

    // IPv6 supplement (non-fatal: absence is "Not detected", never a leak)
    if (!identity.ipv6) {
      const v6 = await fetchIpv6({ fetchImpl: this.fetchImpl }).catch(() => null);
      if (v6 && v6.ipv6) identity.ipv6 = v6.ipv6;
    }

    // v4/v6 network-identity comparison (Task 4). When both families exist, look
    // up the v6 address' geo and compare against the v4 identity. A meaningful
    // divergence (country or ASN) is exposed as a warning - never auto-labelled
    // a "leak".
    if (identity.ipv4 && identity.ipv6) {
      const override = (this.state.settings.apiBaseOverride || "").trim();
      const v6geo = await ipapiIsProvider({
        fetchImpl: this.fetchImpl,
        lookupIp: identity.ipv6,
        base: override && isAllowedEndpoint(override) ? override : undefined
      }).catch(() => null);
      if (v6geo) {
        identity.v6Identity = {
          country: v6geo.country || undefined,
          countryCode: v6geo.countryCode || undefined,
          asn: v6geo.asn || undefined,
          organization: v6geo.organization || undefined
        };
      }
    }
    const familyMismatch = familyMismatchOf(identity);

    const change = diffIdentities(this.state.identity, identity);

    let webrtcResult = null;
    if (this.state.settings.webrtcEnabled !== false) {
      try {
        const gathered = await gatherCandidates();
        webrtcResult = evaluateWebrtc(gathered, identity);
      } catch (e) {
        this._log("webrtc check failed", e);
        webrtcResult = { status: CHECK.UNKNOWN, note: "WebRTC check failed" };
      }
    } else {
      webrtcResult = { status: CHECK.UNKNOWN, note: "WebRTC check disabled" };
    }

    const checks = computeChecks(identity, webrtcResult, change, conflict, familyMismatch);
    const overall = computeOverall({ identity, checks, change, providerConflict: conflict, familyMismatch });
    const redReason =
      overall === STATUS.RED ? (checks.webrtc.status === CHECK.FAIL ? "leak" : "change") : null;

    const prev = this.state.identity;
    const keepHistory = this.state.settings.storeHistory !== false;
    if (change.hasPrevious && change.ipChanged) {
      const entry = {
        kind: "ip",
        previousIp: (prev && (prev.ipv4 || prev.ipv6)) || "unknown",
        currentIp: identity.ipv4 || identity.ipv6 || "unknown",
        previousCountry: (prev && (prev.country || prev.countryCode)) || "unknown",
        previousAsn: (prev && prev.asn) || "unknown",
        timestamp: started,
        seen: false
      };
      if (keepHistory) this.state.history = [entry, ...this.state.history].slice(0, HISTORY_MAX);
      this.state.lastChange = entry;
    } else if (change.hasPrevious && (change.geoChanged || change.asnChanged)) {
      this.state.lastChange = {
        kind: "geo-asn",
        previousCountry: prev && (prev.country || prev.countryCode),
        currentCountry: identity.country || identity.countryCode,
        previousAsn: prev && prev.asn,
        currentAsn: identity.asn,
        timestamp: started,
        seen: false
      };
    }

    this.state.identity = identity;
    if (change.hasPrevious && change.ipChanged) this.state.previousIdentity = prev;
    this.state.checks = checks;
    this.state.overall = overall;
    this.state.redReason = redReason;
    this.state.stale = false;
    this.state.lastCheck = started;
    this.state.lastError = null;

    await this.persist();
    await this.applyToolbar();
    this._log(`refresh ok provider=${identity.provider} overall=${overall}`);
    return this.state;
  }

  async _collectIdentity() {
    const override = (this.state.settings.apiBaseOverride || "").trim();
    const opts = { fetchImpl: this.fetchImpl };
    const errors = [];

    if (override) {
      if (!isAllowedEndpoint(override)) {
        const err = new Error("endpoint override rejected");
        err.kind = "invalid";
        throw err;
      }
      try {
        const p = await ipapiIsProvider({ ...opts, base: override });
        return { identity: p, conflict: false };
      } catch (e) {
        errors.push(e);
      }
      throw errors[0];
    }

    let primary = null;
    let secondary = null;
    try {
      primary = await ipapiIsProvider(opts);
    } catch (e) {
      errors.push(e);
      this._log("ipapi.is failed", e);
    }
    try {
      secondary = await ipinfoProvider(opts);
    } catch (e) {
      this._log("ipinfo.io failed", e);
    }

    if (!primary && !secondary) {
      // Last resort: IP-only lookups.
      try {
        const v4 = await fetchIpv4(opts);
        const v6 = await fetchIpv6(opts);
        return {
          identity: {
            ipv4: v4.ipv4,
            ipv6: v6 && v6.ipv6,
            networkType: "Unknown",
            provider: "ipify"
          },
          conflict: false
        };
      } catch (e) {
        errors.push(e);
      }
      throw errors[0] || new Error("all providers failed");
    }

    const identity = primary ? { ...primary } : { ...secondary };
    if (secondary) {
      if (!identity.countryCode && secondary.countryCode) identity.countryCode = secondary.countryCode;
      if (!identity.timezone && secondary.timezone) identity.timezone = secondary.timezone;
      if (!identity.organization && secondary.organization) identity.organization = secondary.organization;
      if (!identity.asn && secondary.asn) identity.asn = secondary.asn;
    }
    // Never leave the UI with a code but no displayable name
    if (!identity.country && identity.countryCode) {
      identity.country = countryName(identity.countryCode);
    }
    const conflict = !!(
      primary && secondary &&
      primary.ipv4 && secondary.ipv4 &&
      normalizeIp(primary.ipv4) !== normalizeIp(secondary.ipv4)
    );
    return { identity, conflict };
  }

  async _recordFailure(timestamp, err) {
    // An API failure is NEVER a leak. A previously confirmed leak stays red
    // (stale), everything else drops to UNKNOWN with the last identity kept.
    const keepRed = this.state.identity && this.state.overall === STATUS.RED && this.state.redReason === "leak";
    if (!keepRed) {
      this.state.overall = STATUS.UNKNOWN;
      this.state.redReason = null;
    }
    this.state.stale = true;
    this.state.lastCheck = timestamp;
    this.state.lastError = { kind: err && err.kind ? err.kind : "unknown", at: timestamp };
    await this.persist();
    await this.applyToolbar();
    this._log("refresh failed -> stale", err);
    return this.state;
  }

  async ackChange() {
    if (!this.state.lastChange || this.state.lastChange.seen) return this.state;
    this.state.lastChange = { ...this.state.lastChange, seen: true };
    // The new identity becomes the baseline; red-from-change clears,
    // red-from-leak persists (checks.webrtc still FAIL).
    this.state.previousIdentity = this.state.identity;
    const wr = this.state.checks && this.state.checks.webrtc
      ? { status: this.state.checks.webrtc.status, note: this.state.checks.webrtc.note }
      : null;
    const noChange = { ipChanged: false, geoChanged: false, asnChanged: false, hasPrevious: true };
    this.state.checks = computeChecks(this.state.identity, wr, noChange, false, familyMismatchOf(this.state.identity));
    this.state.overall = computeOverall({ identity: this.state.identity, checks: this.state.checks, change: noChange, familyMismatch: familyMismatchOf(this.state.identity) });
    this.state.redReason = null;
    await this.persist();
    await this.applyToolbar();
    return this.state;
  }

  async setSettings(patch) {
    const s = { ...this.state.settings };
    if (patch && typeof patch === "object") {
      if (patch.intervalMinutes !== undefined) {
        s.intervalMinutes = Math.min(60, Math.max(1, Math.floor(Number(patch.intervalMinutes)) || 5));
      }
      if (patch.badgeMode !== undefined && ["ip", "country", "ok"].includes(patch.badgeMode)) {
        s.badgeMode = patch.badgeMode;
      }
      if (patch.webrtcEnabled !== undefined) s.webrtcEnabled = patch.webrtcEnabled === true;
      if (patch.maskIp !== undefined) s.maskIp = patch.maskIp === true;
      if (patch.storeHistory !== undefined) s.storeHistory = patch.storeHistory === true;
      if (patch.appearance !== undefined && ["system", "light", "dark"].includes(patch.appearance)) {
        s.appearance = patch.appearance;
      }
      if (typeof patch.apiBaseOverride === "string") {
        const v = patch.apiBaseOverride.trim();
        s.apiBaseOverride = v && isAllowedEndpoint(v) ? v : "";
      }
    }
    this.state.settings = s;
    await this.persist();
    await this.scheduleAlarm();
    await this.applyToolbar();
    return this.state;
  }

  async applyToolbar() {
    try {
      if (!this.action) return;
      await this.action.setBadgeText({ text: badgeText(this.state) });
      await this.action.setBadgeBackgroundColor({ color: badgeColor(this.state) });
      await this.action.setTitle({ title: tooltipText(this.state) });
      const variant = iconVariant(this.state);
      await this.action.setIcon({
        path: {
          16: `icons/icon-16-${variant}.png`,
          32: `icons/icon-32-${variant}.png`,
          48: `icons/icon-48-${variant}.png`,
          96: `icons/icon-96-${variant}.png`
        }
      });
    } catch (e) {
      this._log("toolbar update failed", e);
    }
  }
}