# Privacy

OPSEC Sentinel's purpose is to read and display your current public network
identity and to flag when it changes in a way that might matter. It does not
convert that observation into analytics or a behavioral profile. All rendering
happens locally.

## 1. What data the extension processes

- Public IPv4 (queried from api.ipify.org / api.ipapi.is / ipinfo.io).
- Public IPv6 (queried from api6.ipify.org).
- Geolocation metadata returned with the IP answer (city, region, country
  code, timezone, country).
- ASN and ISP/organization metadata.
- WebRTC local+server-reflexive candidate summary (never raw private IPs).
- Internal settings you choose (refresh interval, badge mode, mask-IP,
  store-history, webrtc-enabled, API override, appearance).

## 2. What is stored locally

- The latest identity snapshot (IPv4/IPv6, geo, ASN, organization, provider,
  timestamp).
- The previous identity snapshot plus a rolling "history" of the last 10
  observations. Can be disabled in Settings (store-history).
- User settings.
- All stored locally under `browser.storage.local`. Nothing syncs.
- Nothing is sent to remote anchors beyond the provider queries below.

## 3. What network requests are made

- **api.ipify.org** (IPv4 lookup) - response contains only your public
  IPv4 as text.
- **api6.ipify.org** (IPv6 lookup) - same shape for IPv6.
- **api.ipapi.is** (primary geo/ASN lookup) - also used to look up
  per-family identity for the v4/v6 comparison (`?q=<ip>`).
- **ipinfo.io** (fallback geo/ASN) - when ipapi.is is unavailable.
- **STUN** (host by default: `stun.l.google.com:19302`) - WebRTC candidate
  discovery.

## 4. What those providers inherently observe

Any lookup provider receives the source IP of the HTTP request. That is how
they can answer "what is your public IP". Specifically:

- api.ipify.org sees your public IPv4.
- api6.ipify.org sees your public IPv6.
- api.ipapi.is sees your IP plus any query parameters (`?q=<addr>` when
  performing the v4/v6 comparison).
- ipinfo.io sees your IP.
- The STUN server sees your IP during candidate discovery.

The extension shows what those providers return and cannot control their own
logging or retention of the observed requests.

## 5. Does identity history leave the machine?

No. History is stored in `browser.storage.local` on your device only. No
aggregation, no sync, no third-party analytics.

## 6. Telemetry

None.

## 7. Analytics

None.

## 8. Permissions

The manifest requests only:

- `storage` - persist identity snapshot, history, settings.
- `alarms` - periodic refresh.
- Host permissions for the documented API hosts:
  `api.ipapi.is`, `api.ipify.org`, `api6.ipify.org`, `ipinfo.io`,
  plus loopback (`127.0.0.1`, `localhost`) only to support the optional API
  override during local testing.

Not used: `tabs`, `webRequest`, `cookies`, `history`, `bookmarks`,
`<all_urls>`, `nativeMessaging`.

## 9. Why each permission exists

- `storage`: identity snapshots must survive restarts; history is opt-out.
- `alarms`: periodic refresh.
- Host permissions: each provider must be reachable. There are no wildcard
  host permissions for arbitrary sites.

## 10. What the extension CANNOT see / cannot do

- Cannot read page content of sites you visit.
- Cannot read cookies of sites you visit.
- Cannot inspect all system traffic - only the browser-visible public identity
  and WebRTC candidates gathered under the extension's own
  RTCPeerConnection.
- Cannot infer DNS leakage from the public IP. GeoIP remains approximate.
- Cannot guarantee anonymity.

## Feedback

If you find a way this extension captures or leaks more than documented,
please report it via GitHub Security Advisories.
