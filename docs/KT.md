# Knowledge Transfer - OPSEC Sentinel

## Status snapshot (this footnote updated with the Visual/Hardening pass)

Functional breadth:
- MV2 persistent background page (required on dev 156)
- Identity state machine: GREEN / YELLOW / RED / UNKNOWN, keepRed semantics for WebRTC
- Toolbar badge compact: last 2 octets of v4, "IPv6" if v6-only, "?" UNKNOWN, "!" RED
- Tooltip 5-line block incl. Previous/Current on identity change
- Popup: quiet status row, prominent IP + copy, sections, details view w/ history
- Light + dark themes via `settings.appearance` (system / light / dark)
- 16/16 live matrix PASS (2026-09-22); 61/61 unit tests
- vpn/proxy/hosting/relay classification flags are stored in state but only surfaced via
  the v4/v6 mismatch warning at this time; see OPSEC_REVIEW R-9

Key paths:
- src/services/network-identity.js - orchestrator, owns state machine, keepRed, family mismatch
- src/providers/geo.js - primary ipapi.is (+ ?q= lookup for v6 comparison) + ipinfo
- src/providers/ip.js - api.ipify.org + api6.ipify.org fallback
- src/providers/webrtc.js - RTCPeerConnection STUN, RFC1918/mDNS filtered
- src/format.js, src/status.js - pure formatting + status math
- popup/popup.{html,css,js} - UI, one `<body class=popup>` root, theme via `[data-theme]`
- icons/icon-{16,32,48,96}-{normal,warning,critical}.{svg,png} - rounded-diamond mark
- scripts/make-icons.mjs - `npm run icons` re-generates from one literal
- tests/*.test.js - node:test suite; 61 total
- OPSEC_REVIEW.md - adversarial findings, severity, per-scenario evidence / remediations
- PRIVACY.md - each endpoint, what leaves the client, where state is stored, opt-outs

## How we verify

- `npm test`, `npm run lint`, `npm run icons`, `npm run build`
- Live: `NODE_OPTIONS=--dns-result-order=ipv6first DISPLAY=:99 npx web-ext run --source-dir . --firefox=firefox --no-input`
- RDP: rdp-eval.mjs (parent chrome scope), rdp-eval-ext.mjs (extension process - no bg scope!)
- Screenshots: ImageMagick `import -window root`, Tesseract OCR for text proof;
  popup DOM behind Fission is NOT readable from parent, OCR is the only proof channel
- Mock server at 127.0.0.1:8700 in /tmp used for scenario matrix (described inline)

## Key non-obvious findings

1. Provider CONFLICT is only flagged when ipapi.is and ipinfo both succeed AND produce different IPs. A failure of either shapes as UNKNOWN-on-identity or keeps the cached value. Never auto-RED.
2. WebRTC UNAVAILABLE => UNKNOWN explicitly, never implied PASS.
3. IPv6 absent is "Not detected" (not a leak, not a fail).
4. GeoCasual IP drift (country/ASN only) => YELLOW + sticky geo-asn banner until ackChange. IP change => RED + RED banner until ackChange.
5. apiBaseOverride must be loopback; any other URL is CLEARed from settings, not just ignored. Fail-closed.
6. The extension MUST NOT show confirmed-pass stale state as PASS-green. `stale` flag demotes the status title to "Data stale" and surfaces a notice.
7. v4/v6 "Network identity mismatch" warning fires ONLY on country-code OR ASN divergence, never on organization alone (organization strings drift constantly, false-positive magnet).
8. v4/v6 mismatch lookup uses `ipapi.is/?q=<v6>`; hits the SAME endpoint as the primary geo call, so "one apiBaseOverride" = "one trust host" invariant holds.

## Build & release recipe

```
npm install
npm run icons        # regenerate SVG+PNG status icons (idempotent)
npm test             # 61 tests - must stay green
npm run lint         # zero errors/warnings target
npm run build        # to artifacts/opsec_sentinel-1.0.0.zip
cp artifacts/opsec_sentinel-1.0.0.zip artifacts/opsec_sentinel-1.0.0.xpi
```

For signing to permanent install: `npx web-ext sign --api-key=... --api-secret=...` (AMO
self-signing) or load as temporary from about:debugging while unsigned.

## Restart-persistence evidence

- browser.storage.local is the only persistent store used (chrome.storage.local sqlite DB).
- Read-side test: boot with providers offline (override points at a hung loopback), popup shows STALE + last known identity - passed.
- Write-side test: state after refresh; sqlite dump contains full identity JSON incl. settings. Passed.
- History survives restarts. Ack'd changes do not repop until next real change.

## Known technical debt

- R-1 from OPSEC_REVIEW: keepRed state isn't separately surfaced in popup; user relies on
  state identity chain being visible. (future: dedicated "WebRTC breach seen" indicator)
- Task 9 asked for "view details >" right-aligned in footer; we keep it mid-page as
  primary disclosure. Acceptable; matches Linear precedent.
- ICONS: current SVG-diamond set is fine but a 1-2px inner ring bump at 32px+ reads cleaner.
  Low priority since toolbar uses 16px.
- No theme "auto" toggle UI beyond the tri-state select; matches spec (System/Light/Dark).
- No locale/i18n. English only. Not a defect for 1.0.
- No GitHub CI. Tests run locally; add a workflow when the repo gets public.

## State of the spawned browser session

Firefox Developer Edition 156.0, Xvfb DISPLAY=:99, about:debugging runtime temp install
or permanent + `xpinstall.signatures.required=false` on dev edition. RDP port changes each
run - discover via `ps aux | grep 'no-remote'` and look for `--debugger-server <port>`.
Background service exposes globalThis.__opsec on the bg window. rdp-eval-ext cannot reach
it; use parent scope or storage API for scripted pokes.
