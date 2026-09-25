"use strict";

import test from "node:test";
import assert from "node:assert/strict";

import { STATUS, CHECK, checkStatus, computeChecks, computeOverall } from "../src/status.js";

test("checkStatus: fail wins, then unknown", () => {
  assert.equal(checkStatus(CHECK.PASS, CHECK.PASS), "pass");
  assert.equal(checkStatus(CHECK.PASS, CHECK.UNKNOWN), "unknown");
  assert.equal(checkStatus(CHECK.PASS, CHECK.FAIL), "fail");
  assert.equal(checkStatus(CHECK.UNKNOWN, CHECK.FAIL), "fail");
  assert.equal(checkStatus("pass", "unknown"), "unknown");
});

const identity = { ipv4: "198.51.100.11", country: "Netherlands", countryCode: "NL" };
const noChange = { ipChanged: false, geoChanged: false, asnChanged: false, hasPrevious: true };

test("computeChecks: baseline", () => {
  const c = computeChecks(identity, { status: CHECK.PASS }, noChange);
  assert.equal(c.ipv4.status, CHECK.PASS);
  assert.equal(c.ipv6.status, CHECK.PASS);
  assert.equal(c.webrtc.status, CHECK.PASS);
  assert.equal(c.identity.status, CHECK.PASS);
  assert.equal(c.dns.status, CHECK.UNKNOWN); // DNS is UNKNOWN by design
});

test("computeChecks: no IPv6 is PASS, not a leak", () => {
  const c = computeChecks(identity, { status: CHECK.PASS }, noChange);
  assert.equal(c.ipv6.status, CHECK.PASS);
  assert.ok(c.ipv6.note.includes("No IPv6 detected"));
});

test("computeChecks: IP change -> identity FAIL", () => {
  const c = computeChecks(identity, { status: CHECK.PASS }, { ipChanged: true, geoChanged: false, asnChanged: false });
  assert.equal(c.identity.status, CHECK.FAIL);
});

test("computeChecks: provider conflict -> identity FAIL", () => {
  const c = computeChecks(identity, { status: CHECK.PASS }, noChange, true);
  assert.equal(c.identity.status, CHECK.FAIL);
});

test("computeOverall: green when consistent", () => {
  const checks = computeChecks(identity, { status: CHECK.PASS }, noChange);
  assert.equal(computeOverall({ identity, checks, change: noChange }), STATUS.GREEN);
});

test("computeOverall: ip change -> RED", () => {
  const checks = computeChecks(identity, { status: CHECK.PASS }, noChange);
  assert.equal(computeOverall({ identity, checks, change: { ipChanged: true, geoChanged: false, asnChanged: false } }), STATUS.RED);
});

test("computeOverall: webrtc fail -> RED", () => {
  const checks = computeChecks(identity, { status: CHECK.FAIL }, noChange);
  assert.equal(computeOverall({ identity, checks, change: noChange }), STATUS.RED);
});

test("computeOverall: webrtc unknown -> YELLOW, never red", () => {
  const checks = computeChecks(identity, { status: CHECK.UNKNOWN }, noChange);
  assert.equal(computeOverall({ identity, checks, change: noChange }), STATUS.YELLOW);
});

test("computeOverall: geo/asn drift -> YELLOW", () => {
  const checks = computeChecks(identity, { status: CHECK.PASS }, noChange);
  assert.equal(computeOverall({ identity, checks, change: { ipChanged: false, geoChanged: true, asnChanged: true } }), STATUS.YELLOW);
});

test("computeOverall: no identity -> UNKNOWN", () => {
  const checks = computeChecks(null, { status: CHECK.PASS }, noChange);
  assert.equal(computeOverall({ identity: null, checks, change: noChange }), STATUS.UNKNOWN);
});

test("computeOverall: missing geo -> YELLOW", () => {
  const checks = computeChecks({ ipv4: "192.0.2.100" }, { status: CHECK.PASS }, noChange);
  assert.equal(computeOverall({ identity: { ipv4: "192.0.2.100" }, checks, change: noChange }), STATUS.YELLOW);
});

test("computeOverall: provider conflict -> YELLOW", () => {
  const checks = computeChecks(identity, { status: CHECK.PASS }, noChange, true);
  assert.equal(computeOverall({ identity, checks, change: noChange, providerConflict: true }), STATUS.YELLOW);
});