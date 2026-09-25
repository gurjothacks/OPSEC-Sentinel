"use strict";

import test from "node:test";
import assert from "node:assert/strict";

import { isValidIPv4, isValidIPv6, sanitizeText, upperTwo, asnFromOrg, normalizeIp } from "../src/validate.js";

test("isValidIPv4", () => {
  assert.equal(isValidIPv4("198.51.100.11"), true);
  assert.equal(isValidIPv4("0.0.0.0"), true);
  assert.equal(isValidIPv4("255.255.255.255"), true);
  assert.equal(isValidIPv4("256.1.1.1"), false);
  assert.equal(isValidIPv4("1.2.3"), false);
  assert.equal(isValidIPv4("1.2.3.4.5"), false);
  assert.equal(isValidIPv4("1.2.3.04"), false); // leading zeros
  assert.equal(isValidIPv4("a.b.c.d"), false);
  assert.equal(isValidIPv4(""), false);
  assert.equal(isValidIPv4(null), false);
  assert.equal(isValidIPv4("198.51.100.11 "), false); // trailing space must fail
  assert.equal(isValidIPv4("198.51.100.11\n"), false);
});

test("isValidIPv6", () => {
  assert.equal(isValidIPv6("2001:db8::1"), true);
  assert.equal(isValidIPv6("::1"), true);
  assert.equal(isValidIPv6("fe80::1"), true);
  assert.equal(isValidIPv6("2606:4700:4700::1111"), true);
  assert.equal(isValidIPv6("::ffff:192.168.1.1"), true); // v4-mapped
  assert.equal(isValidIPv6("2001:db8:0:0:0:0:2:1"), true);
  assert.equal(isValidIPv6("2001:db8:0:0:0:0:2:1:9"), false); // 9 groups
  assert.equal(isValidIPv6("2001:db8::1::2"), false); // two "::"
  assert.equal(isValidIPv6("gggg::1"), false);
  assert.equal(isValidIPv6(""), false);
  assert.equal(isValidIPv6("198.51.100.11"), false);
});

test("sanitizeText", () => {
  assert.equal(sanitizeText("  hello \u0000world\n", 100), "hello world");
  assert.equal(sanitizeText("abcdef", 3), "abc");
  assert.equal(sanitizeText(123, 10), undefined);
  assert.equal(sanitizeText(null, 10), undefined);
  assert.equal(sanitizeText(undefined, 10), undefined);
  assert.equal(sanitizeText("", 10), undefined);
  assert.equal(sanitizeText("  \t ", 10), undefined);
});

test("upperTwo", () => {
  assert.equal(upperTwo("nl"), "NL");
  assert.equal(upperTwo("US"), "US");
  assert.equal(upperTwo("x"), undefined);
  assert.equal(upperTwo("XXX"), undefined);
  assert.equal(upperTwo(null), undefined);
  assert.equal(upperTwo(undefined), undefined);
});

test("asnFromOrg", () => {
  assert.deepEqual(asnFromOrg("AS62240 Clouvider Limited"), { asn: "AS62240", organization: "Clouvider Limited" });
  assert.deepEqual(asnFromOrg("AS13335 Cloudflare, Inc."), { asn: "AS13335", organization: "Cloudflare, Inc." });
  assert.equal(asnFromOrg("Clouvider Limited"), undefined);
  assert.equal(asnFromOrg("AS"), undefined);
  assert.equal(asnFromOrg(null), undefined);
  assert.equal(asnFromOrg(""), undefined);
  assert.equal(asnFromOrg(42), undefined);
});

test("normalizeIp", () => {
  assert.equal(normalizeIp("198.51.100.11"), "198.51.100.11");
  assert.equal(normalizeIp("2001:DB8::1"), "2001:db8::1");
  assert.equal(normalizeIp(null), "");
});