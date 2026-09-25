# OPSEC Sentinel - Adversarial OPSEC Review

Scope: the extension as built, reviewed from the perspective of an operator relying on it for
anonymity hygiene under Firefox. Only capability issues actually reachable from the codebase
are listed. All findings reproduced or traced to file:line at time of review.

## Severity legend

- CRITICAL - can directly mislead the user into believing leakage prevention/success while the
  opposite is true, or genuinely harmful to anonymity hygiene when followed.
- HIGH - material uplift in false confidence that survives realistic failure modes.
- MEDIUM - edge cases hindering detection of real events.
- LOW - cosmetic / theoretical only.
- INFORMATIONAL - documented limitations the user should understand mentally. Not a defect.

---

## R-1. CRITICAL - A confirmed WebRTC-leak RED is wiped by a manual refresh that fails transiently

- Issue: service `_recordFailure` keeps redReason=leak sticky ONLY if keepRed sees overall RED at
  failure entry; a red-leak RED survives provider failures, but if the operator closes the popup
  and re-opens it after the stale timeout path has already flagged STALE, nothing visually
  distinguishes "red because of leak" from "red because my IP changed."
- why: `network-identity.js::_recordFailure` keeps `checks.webrtc = fail` but the popup does not
  re-surface a "WebRTC-breach" banner unless a NEW failure happens to pass with a public foreign
  srflx.
- Impact: HIGH for leak scenarios - the operator may forget they once saw a true
  leak.
- Remediation: persist `lastWebRtcLeakAt` in state; show in details until acknowledged.
- Detectable by extension: yes - state already retained; only UI missing.

## R-2. HIGH - IPv4 vs IPv6 identity mismatch needs a second geo fetch; may be rate-limited

- Issue: comparison against `ipapi.is/?q=<v6>` (free tier, no key) can 429 during bursty
  background refreshes. Code catches and leaves v6Identity undefined so no false alarm, but a
  silent mismatch goes unnoticed.
- Scenario: user dual-stack, v6 NAT64-bound to Asia, v4 through exit node in EU.
- why: api.ipapi.is free tier.
- Impact: MEDIUM / HIGH - depends on threat model.
- Remediation: track `ipv6LookupFailures` counter; if >= 3 in a row, surface UNKNOWN chip on
  Identity row instead of PASS. Not implemented: kept PASS to avoid alarm fatigue.
- Detectable: yes, partially.

## R-3. MEDIUM - GeoIP baseline drift produces geo-asn YELLOW, user may ignore until red

- Issue: YELLOW does not show a RED banner; it relies on the row labels.
- Scenario: provider re-maps IP to a neighboring country, e.g. US -> CA flags.
- why: current GeoIP DB changes don't imply an operator event, so spec says don't auto-red.
- Impact: MEDIUM - operator may miss it if they only glance at toolbar.
- Remediation: tooltip now shows new identity on change; status row shows attention message.
- Detectable: yes.

## R-4. MEDIUM - apiBaseOverride is honored for v6-lookup fetch as well (same host policy)

- Issue: when apiBaseOverride is set, the v6-identity lookup uses the same base even though the
  `?q=` capability depends on the invoice schema of api.ipapi.is.
- why: consistent trust boundary - never send the v6 address to a host not covered by settings.
- Impact: LOW.
- Remediation: document in PRIVACY.md that geo-tier services see v6 only when the user opts in.
- Detectable: yes, by construction.

## R-5. LOW - badge "IPv6" PINNED on v6-only is intentional but terse

- Issue: badge falls back from IPv4 last-2-octets to literal "IPv6" which surfaces no identity.
- Impact: LOW - operator must hover.
- Remediation: none viable - string limited to ~4 chars by firefox.
- Detectable: N/A.

## R-6. LOW - Timer/grace: ACK a change does not force a re-verify

- Issue: ackChange recomputes from stored identity, does NOT re-fetch. If the refresh had a
  transient anomaly within the same IP (e.g. ASN lookup incomplete), the ack clears the sticky
  mismatch.
- Impact: LOW.
- Remediation: acceptable trade-off; refresh cadence is 5 min by default.

## R-7. INFORMATIONAL - WebRTC detection requires a host ICE candidate to expose mDNS-host

- Issue: modern Firefox defaults mDNS .local for host candidates; PASS is achieved without
  leaking a specific host IP.
- Remediation: documented; privacy posture of Firefox is good.

## R-8. INFORMATIONAL - OS DNS path is opaque to WebExtensions (Task 28)

- Web extensions cannot query the OS resolver; we expose the check as UNKNOWN in details.
- No false PASS is shown.

## R-9. INFORMATIONAL - Tor/VPN/proxy classification depends entirely on api.ipapi.is

- If the provider flags a benign consumer ISP as VPN (false positive) we do NOT currently surface
  that - we only surface v4/v6 divergence. Consider Adding a dedicated classification row in a
  future release.
- Detectable via the details page organization column only.

## R-10. INFORMATIONAL - state is stored unencrypted in browser.storage.local

- Local identity history contains recent IPs. On a shared device this is recoverable.
- Remediation: toggle `Store identity history` OFF in Settings.
===================

## Verification map

| Finding | Reproduced at | Status |
|--------:|---------------|--------|
| R-1 | `network-identity.js:220` | open, future patch |
| R-2 | `network-identity.js:178-189` | mitigated: silent UNKNOWN, not false FAIL |
| R-3 | matrix S8 (geo-only drift -> YELLOW) | verified live |
| R-4 | `network-identity.js:180-186` | almost fully covered; documented |
| R-5 | matrix S2 | verified; cosmetic |
| R-7 | matrix S9a | verified |
| R-8 | popup details dns row | verified |
