"use strict";

import test from "node:test";
import assert from "node:assert/strict";

import { STATUS, CHECK } from "../src/status.js";
import { NetworkIdentityService } from "../src/services/network-identity.js";

// ---- test doubles ----

class FakePC {
  constructor() { this.iceGatheringState = "new"; }
  createDataChannel() { return {}; }
  createOffer() { return Promise.resolve({ type: "offer", sdp: "" }); }
  setLocalDescription() {
    this.iceGatheringState = "complete";
    queueMicrotask(() => {
      if (this.onicecandidate) {
        // Model desktop Firefox: one mDNS-obfuscated host candidate, then end.
        this.onicecandidate({ candidate: { candidate: "candidate:1 1 udp 2122260223 f7abc123-4567.example.local 54321 typ host" } });
        this.onicecandidate({ candidate: null });
      }
    });
    return Promise.resolve();
  }
  close() {}
}
globalThis.RTCPeerConnection = FakePC;

function storageStub(initial = {}) {
  const data = { ...initial };
  return {
    local: {
      async get(k) { return k ? { [k]: data[k] } : { ...data }; },
      async set(o) { Object.assign(data, o); },
      async remove(k) { delete data[k]; }
    }
  };
}

function actionStub() {
  const calls = { badgeText: [], badgeColor: [], title: [], icon: [] };
  return {
    calls,
    async setBadgeText(o) { calls.badgeText.push(o); },
    async setBadgeBackgroundColor(o) { calls.badgeColor.push(o); },
    async setTitle(o) { calls.title.push(o); },
    async setIcon(o) { calls.icon.push(o); }
  };
}

function alarmsStub() {
  const calls = { clear: [], create: [] };
  return {
    calls,
    async clear(n) { calls.clear.push(n); },
    async create(n, opts) { calls.create.push([n, opts]); }
  };
}

const FLAT = {
  ip: "203.0.113.42",
  company: "Packethub S.A.",
  asn: "AS62240 Clouvider Limited",
  city: "Atlanta",
  region: "Georgia",
  country: "United States",
  timezone: "America/New_York"
};

const IPINFO_DEFAULT = { ip: FLAT.ip, city: FLAT.city, region: FLAT.region, country: "US", org: FLAT.asn, timezone: FLAT.timezone };

function makeFetch({ ipapi = FLAT, ipinfo, ipv6 = "", ipapiByQuery = null } = {}) {
  return async (url) => {
    if (url.startsWith("https://api.ipapi.is/?q=")) {
      if (ipapiByQuery === null) return new Response(JSON.stringify(FLAT), { status: 200 });
      if (ipapiByQuery === "fail") throw new TypeError("network error");
      return new Response(JSON.stringify(ipapiByQuery), { status: 200 });
    }
    if (url === "https://api.ipapi.is/") {
      if (ipapi === null) throw new TypeError("network error");
      return new Response(JSON.stringify(ipapi), { status: 200 });
    }
    if (url === "https://ipinfo.io/json") {
      if (ipinfo === null) throw new TypeError("network error");
      return new Response(JSON.stringify(ipinfo === undefined ? IPINFO_DEFAULT : ipinfo), { status: 200 });
    }
    if (url === "https://api6.ipify.org/") {
      return new Response(ipv6, { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
}

async function makeService({ state, fetchImpl, now } = {}) {
  const svc = await NetworkIdentityService.load({
    storage: storageStub(state ? { opsecState: state } : {}),
    alarms: alarmsStub(),
    action: actionStub(),
    now: now || (() => Date.now()),
    fetchImpl: fetchImpl || makeFetch()
  });
  return svc;
}

const baseState = (over = {}) => ({
  identity: null, previousIdentity: null, checks: null, overall: STATUS.UNKNOWN,
  redReason: null, stale: false, lastCheck: null, lastError: null, lastChange: null,
  history: [], settings: { intervalMinutes: 5, badgeMode: "ip", webrtcEnabled: true, apiBaseOverride: "" },
  schemaVersion: 1, ...over
});

test("initial refresh: first observation = YELLOW; second = GREEN + toolbar applied", async () => {
  const svc = await makeService();
  const st0 = await svc.refresh({ force: true });
  assert.equal(st0.identity.ipv4, "203.0.113.42");
  assert.equal(st0.checks.identity.status, CHECK.UNKNOWN); // first observation - no baseline
  assert.equal(st0.overall, STATUS.YELLOW); // informed, not fabricated green
  const st = await svc.refresh({ force: true });
  assert.equal(st.identity.ipv4, "203.0.113.42");
  assert.equal(st.identity.country, "United States");
  assert.equal(st.identity.asn, "AS62240");
  assert.equal(st.checks.identity.status, CHECK.PASS);
  assert.equal(st.overall, STATUS.GREEN);
  assert.equal(st.stale, false);
  assert.equal(st.lastChange, null);
  const a = svc.action.calls;
  assert.ok(a.badgeText.length >= 1);
  assert.equal(a.badgeText.at(-1).text, "203...");
  assert.ok(a.title.at(-1).title.includes("203.0.113.42"));
  assert.ok(a.icon.at(-1).path["16"].includes("normal"));
});

test("IP change -> RED, badge !, history entry, previous identity retained", async () => {
  const t0 = 1_700_000_000_000;
  let t = t0;
  const svc = await makeService({
    now: () => t,
    state: baseState({ identity: { ipv4: "10.0.0.1", country: "Old Country", timestamp: t0 - 60_000 }, lastCheck: t0 - 60_000 })
  });
  t = t0 + 300_000;
  const st = await svc.refresh({ force: true });
  assert.equal(st.overall, STATUS.RED);
  assert.equal(st.redReason, "change");
  assert.equal(st.identity.ipv4, "203.0.113.42");
  assert.equal(st.previousIdentity.ipv4, "10.0.0.1");
  assert.equal(st.checks.identity.status, CHECK.FAIL);
  assert.equal(st.history.length, 1);
  assert.equal(st.history[0].kind, "ip");
  assert.equal(st.history[0].previousIp, "10.0.0.1");
  assert.equal(st.history[0].currentIp, "203.0.113.42");
  assert.equal(st.lastChange.kind, "ip");
  assert.equal(st.lastChange.seen, false);
  assert.equal(svc.action.calls.badgeText.at(-1).text, "!");
});

test("provider failure -> UNKNOWN + stale, identity preserved, never RED", async () => {
  const t0 = 1_700_000_000_000;
  let t = t0;
  const svc = await makeService({
    now: () => t,
    fetchImpl: makeFetch({ ipapi: null, ipinfo: null }),
    state: baseState({
      identity: { ipv4: "203.0.113.42", country: "United States", timestamp: t0 - 60_000 },
      lastCheck: t0 - 60_000, overall: STATUS.GREEN
    })
  });
  t = t0 + 300_000;
  const st = await svc.refresh({ force: true });
  assert.equal(st.overall, STATUS.UNKNOWN);
  assert.equal(st.redReason, null);
  assert.equal(st.stale, true);
  assert.equal(st.identity.ipv4, "203.0.113.42"); // last known kept
  assert.ok(st.lastError);
  assert.equal(svc.action.calls.badgeText.at(-1).text, "?");
  const title = svc.action.calls.title.at(-1).title;
  assert.ok(title.includes("Stale"));
});

test("previously confirmed WebRTC leak stays RED when refresh fails", async () => {
  const svc = await makeService({
    fetchImpl: makeFetch({ ipapi: null, ipinfo: null }),
    state: baseState({
      identity: { ipv4: "203.0.113.42", country: "United States", timestamp: 1 },
      lastCheck: 1, overall: STATUS.RED, redReason: "leak",
      checks: { webrtc: { status: CHECK.FAIL } }
    })
  });
  const st = await svc.refresh({ force: true });
  assert.equal(st.overall, STATUS.RED);
  assert.equal(st.redReason, "leak");
  assert.equal(st.stale, true);
});

test("ackChange: banner seen, baseline resets, badge back to short IP", async () => {
  const t0 = 1_700_000_000_000;
  let t = t0;
  const svc = await makeService({
    now: () => t,
    state: baseState({ identity: { ipv4: "10.0.0.1", country: "Old", timestamp: t0 - 60_000 }, lastCheck: t0 - 60_000 })
  });
  t = t0 + 60_000;
  await svc.refresh({ force: true });
  assert.equal(svc.state.overall, STATUS.RED);
  const st = await svc.ackChange();
  assert.equal(st.lastChange.seen, true);
  assert.equal(st.overall, STATUS.GREEN);
  assert.equal(st.previousIdentity.ipv4, "203.0.113.42");
  assert.equal(svc.action.calls.badgeText.at(-1).text, "203...");
});

test("geo/asn drift without IP change -> YELLOW, geo-asn lastChange", async () => {
  const t0 = 1_700_000_000_000;
  let t = t0;
  const svc = await makeService({
    now: () => t,
    state: baseState({
      identity: { ipv4: "203.0.113.42", country: "Germany", city: "Berlin", asn: "AS12345", timestamp: t0 - 60_000 },
      lastCheck: t0 - 60_000, overall: STATUS.GREEN
    })
  });
  t = t0 + 60_000;
  const st = await svc.refresh({ force: true });
  assert.equal(st.overall, STATUS.YELLOW);
  assert.equal(st.lastChange.kind, "geo-asn");
  assert.equal(svc.action.calls.badgeText.at(-1).text, "?");
});

test("provider conflict -> YELLOW with identity FAIL", async () => {
  const svc = await makeService({
    fetchImpl: makeFetch({ ipapi: { ...FLAT, ip: "192.0.2.100" } })
  });
  const st = await svc.refresh({ force: true });
  assert.equal(st.overall, STATUS.YELLOW);
  assert.equal(st.checks.identity.status, CHECK.FAIL);
});

test("history capped at 10", async () => {
  const t0 = 1_700_000_000_000;
  let t = t0;
  const svc = await makeService({ now: () => t });
  let prev = "10.0.0.1";
  for (let i = 0; i < 12; i++) {
    t = t0 + i * 60_000;
    svc.state.identity = { ipv4: prev, country: "X", timestamp: t };
    svc.state.lastCheck = t;
    const ip = `203.0.113.${i + 1}`;
    const fetchImpl = async (url) => {
      if (url === "https://api.ipapi.is/") return new Response(JSON.stringify({ ...FLAT, ip }), { status: 200 });
      if (url === "https://ipinfo.io/json") return new Response(JSON.stringify({ ip, country: "US", org: FLAT.asn }), { status: 200 });
      return new Response("", { status: 200 });
    };
    svc.fetchImpl = fetchImpl;
    await svc.refresh({ force: true });
    prev = ip;
  }
  assert.equal(svc.state.history.length, 10);
  assert.equal(svc.state.history[0].currentIp, "203.0.113.12");
  assert.equal(svc.state.history[9].currentIp, "203.0.113.3");
});

test("shouldAutoRefresh respects interval", async () => {
  const t0 = 1_700_000_000_000;
  let t = t0;
  const svc = await makeService({ now: () => t, state: baseState({ lastCheck: t0 - 10_000 }) });
  assert.equal(svc.shouldAutoRefresh(), false);
  t = t0 + 6 * 60_000;
  assert.equal(svc.shouldAutoRefresh(), true);
});

test("settings: clamping, badge mode, endpoint override policy", async () => {
  const svc = await makeService();
  await svc.setSettings({ intervalMinutes: 999, badgeMode: "bogus", webrtcEnabled: false, apiBaseOverride: "http://evil.example.com/x" });
  assert.equal(svc.state.settings.intervalMinutes, 60);
  assert.equal(svc.state.settings.badgeMode, "ip"); // unchanged
  assert.equal(svc.state.settings.webrtcEnabled, false);
  assert.equal(svc.state.settings.apiBaseOverride, ""); // rejected (non-localhost http)
  const alarm = svc.alarms.calls.create.at(-1);
  assert.equal(alarm[0], "opsec-refresh");
  assert.equal(alarm[1].periodInMinutes, 60);
  await svc.setSettings({ apiBaseOverride: "http://localhost:9999/" });
  assert.equal(svc.state.settings.apiBaseOverride, "http://localhost:9999/");
  await svc.setSettings({ apiBaseOverride: "https://my.example.com/" });
  assert.equal(svc.state.settings.apiBaseOverride, "https://my.example.com/");
});

test("endpoint override drives the provider chain", async () => {
  const svc = await makeService();
  await svc.setSettings({ apiBaseOverride: "http://localhost:9999/" });
  svc.fetchImpl = async (url) => {
    if (url === "http://localhost:9999/") {
      return new Response(JSON.stringify({ ...FLAT, ip: "192.0.2.42" }), { status: 200 });
    }
    return new Response("", { status: 404 });
  };
  const st = await svc.refresh({ force: true });
  assert.equal(st.identity.ipv4, "192.0.2.42");
  assert.equal(st.identity.provider, "ipapi.is");
});

test("IPv6-only identity when v4 provider yields v6 and v6 supplement absent", async () => {
  const svc = await makeService({
    fetchImpl: makeFetch({ ipapi: { ...FLAT, ip: "2001:db8::1" }, ipv6: "" })
  });
  await svc.refresh({ force: true }); // first observation - no baseline yet
  const st = await svc.refresh({ force: true }); // second - baseline established
  assert.equal(st.identity.ipv6, "2001:db8::1");
  assert.equal(st.identity.ipv4, undefined);
  assert.equal(svc.action.calls.badgeText.at(-1).text, "IPv6");
});

test("persist round-trip: hydrate restores state", async () => {
  const svc = await makeService();
  await svc.refresh({ force: true });
  await svc.refresh({ force: true }); // second obs -> GREEN baseline state
  assert.equal(svc.state.overall, STATUS.GREEN);
  const svc2 = await makeService({ state: svc.state });
  assert.equal(svc2.state.identity.ipv4, "203.0.113.42");
  assert.equal(svc2.state.overall, STATUS.GREEN);
});
test("v4/v6 identity mismatch -> YELLOW + identity FAIL, popup-safe (Task 4)", async () => {
  const svc = await makeService({
    fetchImpl: makeFetch({
      ipv6: "2001:db8::7",
      ipapiByQuery: { ip: "2001:db8::7", country: "India", asn: "AS12345 SomeProvider", company: "SomeProvider", city: "Mumbai", region: "Maharashtra", timezone: "Asia/Kolkata" }
    })
  });
  const st = await svc.refresh({ force: true });
  assert.equal(st.identity.ipv4, "203.0.113.42");
  assert.equal(st.identity.ipv6, "2001:db8::7");
  assert.equal(st.identity.v6Identity.country, "India");
  assert.equal(st.identity.v6Identity.asn, "AS12345");
  assert.equal(st.overall, STATUS.YELLOW);
  assert.equal(st.checks.identity.status, CHECK.FAIL);
  assert.ok(st.checks.identity.note.includes("different network identities"));
  // never auto-labelled RED/leak
  assert.notEqual(st.redReason, "leak");
});

test("v4/v6 same network -> GREEN, mismatch suppressed when lookup unavailable", async () => {
  // lookup returns same identity => no mismatch
  const ok = await makeService({ fetchImpl: makeFetch({ ipv6: "2001:db8::7", ipapiByQuery: { ip: "2001:db8::7", country: "United States", asn: "AS62240 Clouvider Limited", company: "Clouvider", city: "Atlanta" } }) });
  await ok.refresh({ force: true }); // first observation - identity UNKNOWN (no baseline)
  const st1 = await ok.refresh({ force: true }); // second observation - baseline exists
  assert.equal(st1.identity.v6Identity.asn, "AS62240");
  assert.equal(st1.checks.identity.status, CHECK.PASS);
  assert.equal(st1.overall, STATUS.GREEN);
  // lookup fails => unknown evidence, no fabricated fail
  const fail = await makeService({ fetchImpl: makeFetch({ ipv6: "2001:db8::7", ipapiByQuery: "fail" }) });
  await fail.refresh({ force: true }); // first observation - YELLOW (no baseline)
  const st2 = await fail.refresh({ force: true }); // second - GREEN
  assert.equal(st2.identity.v6Identity, undefined);
  assert.equal(st2.overall, STATUS.GREEN);
});

test("storeHistory=false suppresses history growth on IP change", async () => {
  const t0 = 1_700_000_000_000;
  const svc = await makeService({
    state: baseState({ identity: { ipv4: "10.0.0.1", country: "Old", timestamp: t0 - 60_000 }, settings: { intervalMinutes: 5, badgeMode: "ip", webrtcEnabled: true, apiBaseOverride: "", storeHistory: false } })
  });
  const st = await svc.refresh({ force: true });
  assert.equal(st.overall, STATUS.RED);
  assert.equal(st.history.length, 0); // banner present, history not written
  assert.ok(st.lastChange);
});

test("settings: maskIp, storeHistory, appearance accepted and clamped", async () => {
  const svc = await makeService();
  await svc.refresh({ force: true });
  let st = await svc.setSettings({ maskIp: true, storeHistory: false, appearance: "light" });
  assert.equal(st.settings.maskIp, true);
  assert.equal(st.settings.storeHistory, false);
  assert.equal(st.settings.appearance, "light");
  st = await svc.setSettings({ appearance: "bogus" });
  assert.equal(st.settings.appearance, "light"); // rejected, unchanged
  st = await svc.setSettings({ maskIp: false, storeHistory: true, appearance: "system" });
  assert.equal(st.settings.appearance, "system");
});

test("organization change -> ASN drift YELLOW (asn dominates org-driven geo)", async () => {
  const t0 = 1_700_000_000_000;
  const svc = await makeService({ state: baseState({ identity: { ipv4: "203.0.113.42", country: "United States", asn: "AS11111", timestamp: t0 - 60_000 }, lastCheck: t0 - 60_000 }) });
  const st = await svc.refresh({ force: true });
  assert.equal(st.overall, STATUS.YELLOW); // asnChanged -> drift banner
  assert.equal(st.lastChange.kind, "geo-asn");
});

test("toolbar icon variant follows overall state without color being the only signal", async () => {
  const svc = await makeService();
  await svc.refresh({ force: true }); // first observation - YELLOW
  assert.ok(svc.action.calls.icon.at(-1).path["16"].includes("warning"));
  await svc.refresh({ force: true }); // second observation - GREEN
  assert.ok(svc.action.calls.icon.at(-1).path["16"].includes("normal"));
  const t0 = 1_700_000_000_000;
  const svc2 = await makeService({ now: () => t0, state: baseState({ identity: { ipv4: "10.0.0.1", timestamp: t0 - 1_000 }, lastCheck: t0 - 1_000 }) });
  await svc2.refresh({ force: true });
  assert.equal(svc2.state.overall, STATUS.RED);
  assert.ok(svc2.action.calls.icon.at(-1).path["16"].includes("critical"));
});

test("first observation: identity UNKNOWN + YELLOW overall, not GREEN (state machine honesty)", async () => {
  const svc = await makeService();
  const st = await svc.refresh({ force: true });
  assert.equal(st.checks.identity.status, CHECK.UNKNOWN);
  assert.ok(st.checks.identity.note.includes("First observation"));
  assert.equal(st.overall, STATUS.YELLOW); // not green - comparison was not performed
  assert.ok(st.identity.ipv4); // identity exists, just no baseline
});

test("second identical observation: identity PASS + GREEN", async () => {
  const svc = await makeService();
  await svc.refresh({ force: true });
  const st = await svc.refresh({ force: true });
  assert.equal(st.checks.identity.status, CHECK.PASS);
  assert.equal(st.overall, STATUS.GREEN);
});

test("webrtc UNKNOWN -> overall YELLOW (not green)", async () => {
  const t0 = 1_700_000_000_000;
  // second-observation snapshot with webrtc deliberately disabled since the first one
  const prev = { ipv4: FLAT.ip, country: FLAT.country, countryCode: "US", asn: FLAT.asn.split(" ")[0], organization: "", timestamp: t0 - 60_000 };
  const svc = await makeService({ state: baseState({ identity: prev, previousIdentity: prev, settings: { intervalMinutes: 5, badgeMode: "ip", webrtcEnabled: false, apiBaseOverride: "" }, lastCheck: t0 - 60_000 }) });
  const st = await svc.refresh({ force: true });
  assert.equal(st.checks.webrtc.status, CHECK.UNKNOWN);
  assert.equal(st.checks.webrtc.note, "WebRTC check disabled");
  assert.equal(st.overall, STATUS.YELLOW); // honest: can't fully verify exposure surface
});

test("country name resolved from code via Intl (ipinfo fallback path)", async () => {
  const svc = await makeService({ fetchImpl: makeFetch({ ipapi: () => { throw new Error("down"); } }) });
  await svc.refresh({ force: true });
  const st = await svc.refresh({ force: true });
  assert.equal(st.identity.countryCode, "US");
  assert.equal(st.identity.country, "United States"); // name, not bare code
});

test("countryName() from validate resolves codes, rejects garbage", async () => {
  const { countryName } = await import("../src/validate.js");
  assert.equal(countryName("US"), "United States");
  assert.equal(countryName("us"), "United States");
  assert.equal(countryName("XX"), undefined);
  assert.equal(countryName(null), undefined);
  assert.equal(countryName(1234), undefined);
  assert.equal(countryName("United States"), undefined); // not a code: reject, do not echo
});
