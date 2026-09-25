"use strict";

import test from "node:test";
import assert from "node:assert/strict";

import { fetchIpv4, fetchIpv6 } from "../src/providers/ip.js";
import { ipapiIsProvider, ipinfoProvider } from "../src/providers/geo.js";
import { parseCandidate, evaluateWebrtc } from "../src/providers/webrtc.js";

function jsonFetch(payload, status = 200) {
  return async () => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function textFetch(text, status = 200) {
  return async () => new Response(text, { status, headers: { "content-type": "text/plain" } });
}

const FLAT_FREE_TIER = {
  ip: "203.0.113.42",
  is_bogon: false,
  company: "Packethub S.A.",
  asn: "AS62240 Clouvider Limited",
  city: "Atlanta",
  region: "Georgia",
  country: "United States",
  lat: 33.749,
  lon: -84.38798,
  timezone: "America/New_York"
};

const NESTED_PAID_TIER = {
  ip: "198.51.100.11",
  is_vpn: true,
  is_proxy: false,
  is_tor: false,
  is_datacenter: false,
  is_icloud_relay: false,
  is_anonymous: true,
  is_mobile: false,
  asn: { asn: 9009, name: "M247", description: "M247 Ltd", country: { iso: "GB", name: "United Kingdom" }, type: "hosting" },
  company: { name: "M247 Ltd", network: "198.51.100.10/22", type: "hosting" },
  location: { city: "Amsterdam", region: "North Holland", country: "Netherlands", country_code: "NL", timezone: "Europe/Amsterdam", latitude: 52.37, longitude: 4.9 }
};

test("fetchIpv4: valid", async () => {
  const r = await fetchIpv4({ fetchImpl: textFetch("198.51.100.11") });
  assert.equal(r.ipv4, "198.51.100.11");
});

test("fetchIpv4: garbage -> kind invalid", async () => {
  await assert.rejects(fetchIpv4({ fetchImpl: textFetch("not-an-ip") }), (e) => e.kind === "invalid");
  await assert.rejects(fetchIpv4({ fetchImpl: textFetch("") }), (e) => e.kind === "invalid");
});

test("fetchIpv4: HTTP error propagates kind http", async () => {
  await assert.rejects(fetchIpv4({ fetchImpl: textFetch("", 500) }), (e) => e.kind === "http");
});

test("fetchIpv6: valid -> ipv6; garbage/error -> null (Not detected)", async () => {
  const ok = await fetchIpv6({ fetchImpl: textFetch("2001:db8::1") });
  assert.equal(ok.ipv6, "2001:db8::1");
  assert.equal(await fetchIpv6({ fetchImpl: textFetch("") }), null);
  assert.equal(await fetchIpv6({ fetchImpl: textFetch("nope") }), null);
  assert.equal(await fetchIpv6({ fetchImpl: textFetch("", 500) }), null);
});

test("ipapiIsProvider: free tier flat shape", async () => {
  const p = await ipapiIsProvider({ fetchImpl: jsonFetch(FLAT_FREE_TIER) });
  assert.equal(p.ipv4, "203.0.113.42");
  assert.equal(p.country, "United States");
  assert.equal(p.asn, "AS62240");
  assert.equal(p.organization, "Clouvider Limited");
  assert.equal(p.networkType, "Unknown"); // no classification flags in free tier -> never fabricated
  assert.equal(p.privacy.vpn, false);
  assert.equal(p.provider, "ipapi.is");
});

test("ipapiIsProvider: paid tier nested shape with VPN flag", async () => {
  const p = await ipapiIsProvider({ fetchImpl: jsonFetch(NESTED_PAID_TIER) });
  assert.equal(p.ipv4, "198.51.100.11");
  assert.equal(p.country, "Netherlands");
  assert.equal(p.countryCode, "NL");
  assert.equal(p.region, "North Holland");
  assert.equal(p.city, "Amsterdam");
  assert.equal(p.timezone, "Europe/Amsterdam");
  assert.equal(p.asn, "AS9009");
  assert.equal(p.organization, "M247 Ltd");
  assert.equal(p.networkType, "VPN");
  assert.equal(p.privacy.vpn, true);
  assert.equal(p.privacy.icloudRelay, false);
});

test("ipapiIsProvider: nested datacenter company.type", async () => {
  const p = await ipapiIsProvider({ fetchImpl: jsonFetch({ ...NESTED_PAID_TIER, is_vpn: false, is_datacenter: true }) });
  assert.equal(p.networkType, "Datacenter");
});

test("ipapiIsProvider: malformed payloads rejected", async () => {
  await assert.rejects(ipapiIsProvider({ fetchImpl: jsonFetch({ foo: "bar" }) }), (e) => e.kind === "invalid");
  await assert.rejects(ipapiIsProvider({ fetchImpl: jsonFetch({ ip: "999.1.1.1" }) }), (e) => e.kind === "invalid");
  await assert.rejects(ipapiIsProvider({ fetchImpl: jsonFetch([]) }), (e) => e.kind === "invalid");
  await assert.rejects(ipapiIsProvider({ fetchImpl: textFetch("not json") }), (e) => e.kind === "invalid");
});

test("ipapiIsProvider: hostile payload sanitized (control chars, huge strings)", async () => {
  const p = await ipapiIsProvider({ fetchImpl: jsonFetch({ ip: "203.0.113.42", country: "A\u0000B\n<b>X</b>", city: "c".repeat(5000) }) });
  assert.equal(p.country, "AB<b>X</b>");
  assert.equal(p.city.length, 64);
});

test("ipinfoProvider: parses geo + ASN from org", async () => {
  const p = await ipinfoProvider({ fetchImpl: jsonFetch({ ip: "203.0.113.42", city: "Atlanta", region: "Georgia", country: "US", org: "AS62240 Clouvider", timezone: "America/New_York" }) });
  assert.equal(p.countryCode, "US");
  assert.equal(p.asn, "AS62240");
  assert.equal(p.organization, "Clouvider");
  assert.equal(p.networkType, "Unknown");
  assert.equal(p.privacy, null);
});

test("ipinfoProvider: invalid ip rejected", async () => {
  await assert.rejects(ipinfoProvider({ fetchImpl: jsonFetch({ ip: "nope" }) }), (e) => e.kind === "invalid");
});

test("parseCandidate: srflx, host, mdns, garbage", () => {
  const srflx = parseCandidate("candidate:1 1 udp 2122260223 198.51.100.11 54321 typ srflx raddr 192.168.1.5 rport 54322 generation 0");
  assert.deepEqual(srflx, { kind: "srflx", ip: "198.51.100.11" });
  const host = parseCandidate("candidate:2 1 udp 2122260223 192.168.1.5 54321 typ host generation 0");
  assert.deepEqual(host, { kind: "host", ip: "192.168.1.5" });
  const mdns = parseCandidate("candidate:3 1 udp 2122260223 abc123.local 54321 typ host generation 0");
  assert.deepEqual(mdns, { kind: "host", ip: null, mdns: true });
  assert.equal(parseCandidate("candidate:1 1 udp 2122260223 999.1.1.1 54321 typ srflx"), null);
  assert.equal(parseCandidate("garbage"), null);
  assert.equal(parseCandidate(null), null);
  assert.equal(parseCandidate("candidate:1 1 udp 2122260223 2001:db8::1 54321 typ srflx").ip, "2001:db8::1");
});

test("evaluateWebrtc", () => {
  const identity = { ipv4: "198.51.100.11" };
  assert.equal(evaluateWebrtc({ supported: true, complete: true, publicIps: [] }, identity).status, "unknown");
  assert.equal(evaluateWebrtc({ supported: true, complete: true, publicIps: [], mdns: true }, identity).status, "pass");
  assert.equal(evaluateWebrtc({ supported: true, complete: true, publicIps: [], privateIps: ["192.168.1.5"] }, identity).status, "pass");
  assert.equal(evaluateWebrtc({ supported: true, complete: false, publicIps: [] }, identity).status, "unknown");
  assert.equal(evaluateWebrtc({ supported: true, complete: false, publicIps: [], mdns: true }, identity).status, "unknown");
  assert.equal(evaluateWebrtc({ supported: true, complete: true, publicIps: ["198.51.100.11"] }, identity).status, "pass");
  assert.equal(evaluateWebrtc({ supported: true, complete: true, publicIps: ["192.0.2.10"] }, identity).status, "fail");
  assert.equal(evaluateWebrtc({ supported: true, complete: true, publicIps: ["192.0.2.10", "198.51.100.11"] }, identity).status, "fail");
  assert.equal(evaluateWebrtc({ supported: false }, identity).status, "unknown");
  assert.equal(evaluateWebrtc(null, identity).status, "unknown");
  // IPv6-only identity
  assert.equal(evaluateWebrtc({ supported: true, complete: true, publicIps: ["2001:db8::1"] }, { ipv6: "2001:DB8::1" }).status, "pass");
});