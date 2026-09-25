"use strict";

import test from "node:test";
import assert from "node:assert/strict";

import { STATUS } from "../src/status.js";
import { shortIp, badgeText, badgeColor, iconVariant, statusLabel, tooltipText, formatTime } from "../src/format.js";

const greenState = {
  overall: STATUS.GREEN,
  stale: false,
  redReason: null,
  identity: { ipv4: "198.51.100.11", city: "Amsterdam", country: "Netherlands", countryCode: "NL", asn: "AS9009", networkType: "VPN" },
  settings: { badgeMode: "ip" }
};

test("shortIp: IPv4 -> first 3 octets chars", () => {
  assert.equal(shortIp({ ipv4: "198.51.100.11" }), "198...");
  assert.equal(shortIp({ ipv4: "198.51.100.11", ipv6: "2001:db8::1" }), "198...");
});

test("shortIp: IPv6-only -> literal IPv6", () => {
  assert.equal(shortIp({ ipv6: "2001:db8::1" }), "IPv6");
});

test("shortIp: no identity -> null", () => {
  assert.equal(shortIp(null), null);
  assert.equal(shortIp({}), null);
});

test("badgeText states", () => {
  assert.equal(badgeText({ ...greenState, overall: STATUS.RED }), "!");
  assert.equal(badgeText({ ...greenState, overall: STATUS.YELLOW }), "?");
  assert.equal(badgeText({ ...greenState, overall: STATUS.UNKNOWN }), "?");
  assert.equal(badgeText(null), "?");
  assert.equal(badgeText(greenState), "198...");
});

test("badgeText modes", () => {
  assert.equal(badgeText({ ...greenState, settings: { badgeMode: "country" } }), "NL");
  assert.equal(badgeText({ ...greenState, settings: { badgeMode: "country" }, identity: { ipv4: "192.0.2.100" } }), "OK");
  assert.equal(badgeText({ ...greenState, settings: { badgeMode: "ok" } }), "OK");
});

test("badgeColor", () => {
  assert.equal(badgeColor({ overall: STATUS.RED }), "#F97066");
  assert.equal(badgeColor({ overall: STATUS.YELLOW }), "#F2C94C");
  assert.equal(badgeColor({ overall: STATUS.UNKNOWN }), "#626D7E");
  assert.equal(badgeColor({ overall: STATUS.GREEN }), "#32D583");
  assert.equal(badgeColor(null), "#32D583");
});

test("iconVariant", () => {
  assert.equal(iconVariant({ overall: STATUS.RED }), "critical");
  assert.equal(iconVariant({ overall: STATUS.YELLOW }), "warning");
  assert.equal(iconVariant({ overall: STATUS.UNKNOWN }), "warning");
  assert.equal(iconVariant({ overall: STATUS.GREEN }), "normal");
});

test("statusLabel", () => {
  assert.equal(statusLabel(STATUS.GREEN), "Network OK");
  assert.equal(statusLabel(STATUS.RED), "Leak / identity change");
  assert.equal(statusLabel(STATUS.YELLOW), "Partial information");
  assert.equal(statusLabel(STATUS.UNKNOWN), "Status unknown");
});

test("tooltipText contains identity details", () => {
  const t = tooltipText(greenState);
  assert.ok(t.includes("OPSEC Sentinel"));
  assert.ok(t.includes("198.51.100.11"));
  assert.ok(t.includes("Amsterdam, Netherlands"));
  assert.ok(t.includes("AS9009"));
  assert.ok(t.includes("VPN"));
  assert.ok(t.includes("OK"));
  const red = tooltipText({ ...greenState, overall: STATUS.RED, redReason: "leak" });
  assert.ok(red.includes("Leak"));
  const stale = tooltipText({ ...greenState, stale: true, overall: STATUS.UNKNOWN });
  assert.ok(stale.includes("Stale"));
});

test("formatTime", () => {
  assert.equal(formatTime(null), "never");
  assert.ok(/^\d{2}:\d{2}:\d{2}/.test(formatTime(1700000000000)));
});