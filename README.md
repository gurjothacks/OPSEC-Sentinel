# OPSEC Sentinel

A privacy-focused Firefox extension that shows your current public network
identity and provides lightweight network identity and WebRTC exposure checks.

Not an anonymity guarantee - just a quiet way to see what your network identity
looks like right now.

## Features

- Public IPv4 display
- Public IPv6 detection
- IP geolocation (country / city / region / timezone)
- ASN and network organization
- Network identity comparison against the previous observation
- WebRTC exposure check
- IP-change detection with changed-identity banner
- Stale-data detection (marks data as stale if re-verification fails)
- Firefox toolbar indicator (badge + icon + tooltip update on every check)
- Local identity history (last 10 observations, stored locally only)
- Dark / light / system themes

## Screenshots

A `docs/screenshots/` directory placeholder exists. To add screenshots, capture
the popup with fictional data (see the builds artifact for how to run locally),
then place them in `docs/screenshots/` and reference them here.

## Installation

### From source

1. Clone or download the repository.
2. Build (see "Development" below).
3. In Firefox, open `about:debugging#/runtime/this-firefox`.
4. Click **Load Temporary Add-on**.
5. Select `manifest.json` from the repository root (or the built manifest in
   `artifacts/` after `npm run build`).

### From a built artifact

After `npm run build`, the zipped extension is written to
`artifacts/opsec_sentinel-<version>.zip`. To install it permanently in
Firefox Developer Edition, set `xpinstall.signatures.required = false` in
`about:config` (this is for personal use only). On Firefox stable, the add-on
must be signed via [addons.mozilla.org](https://addons.mozilla.org).

## Development

Requires Node.js >= 20 and Firefox (tested on Firefox 156).

```bash
npm install
npm test
npm run build
npm run lint
npm run icons
npm start
```

Scripts that actually run:

- `npm test` - unit tests (`node --test tests/*.test.js`), no browser needed
- `npm run build` - icons + web-ext build to `artifacts/`
- `npm run lint` - `web-ext lint` (manifest + packaging checks)
- `npm run icons` - regenerates icons in `icons/`
- `npm start`   - `web-ext run` (launches a Firefox with the extension loaded
                  for local verification)

## Architecture

The extension follows a small layered design:

- `src/services/network-identity.js` - orchestrator / state machine
- `src/providers/ip.js` - IPv4/IPv6 lookup (api.ipify.org / api6.ipify.org)
- `src/providers/geo.js` - geo/ASN via api.ipapi.is, supplemental ipinfo.io
- `src/providers/webrtc.js` - STUN-based candidate gathering / evaluation
- `src/status.js` - computeChecks + computeOverall semantics
- `src/format.js` - badge / tooltip / status formatting
- `popup/` - UI surface (toolbar popup)
- `background.js` - MV2 persistent background page (registered in manifest)

High-level flow:

```
Firefox Extension
        |
        v
Network Identity Service
        |
  +-----+-----+
  |     |     |
 IP   Geo   WebRTC
        |
        v
Identity State
   |         |
   v         v
Toolbar     Popup
```

State survives across restarts via `browser.storage.local`. State machine: GREEN
(all checks ran, no unexpected condition), YELLOW (incomplete, stale, or any
UNKNOWN check component), RED (meaningful unexpected change or confirmed leak),
UNKNOWN (no trustworthy current state).

## Privacy

This extension exists to show you, on your machine, what your network identity
currently looks like. It does not collect, transmit, or monetize any personal
data.

What it does NOT do:

- No browsing history
- No page content capture
- No cookies
- No passwords
- No analytics
- No telemetry
- No remote scripts / no CDN
- No fingerprinting, no tracking

What it MUST do:

- Query external IP-identity providers (api.ipapi.is, ipinfo.io) and map the
  source-IP answer back to you. By definition, those providers observe the
  public IP of the request the extension makes on your behalf - that is how
  they work.
- Query external STUN for WebRTC candidate discovery.

The exact privacy contract and every external endpoint is documented in
**PRIVACY.md**.

## Limitations

Be explicit about what the extension cannot do:

- GeoIP is approximate; city-level data is a best-effort lookup from the
  provider, not a guarantee.
- VPN / proxy / datacenter classification may be unavailable on the free
  provider tier. The extension shows "Unknown" rather than guessing.
- WebRTC detection is limited by what Firefox exposes to extensions. Absence
  of observed public candidates does not mean candidates could not have been
  produced by other routes.
- The extension cannot guarantee anonymity.
- The extension does not inspect all system traffic; it observes only the
  public IP endpoints reachable from the browser context and WebRTC candidates
  gathered via a single RTCPeerConnection.
- DNS leakage cannot be inferred merely from the browser's public IP.
- A network identity change is not automatically a security incident.

## Security

Vulnerability reporting, supported versions, and the threat-model assumptions
that already shape the extension are in **SECURITY.md**.

## License

MIT - see `LICENSE`.
