# ARCHITECTURE

## Overview

```
                    background (MV3 event page)
                              |
                              v
                   NetworkIdentityService  (central state)
                              |
               +--------------+--------------+
               |              |              |
               v              v              v
           providers:     storage       toolbar action
           ip / geo /     (state +      (badge, color,
           webrtc         history +     tooltip, icon)
                          settings)            |
                                              v
                                         popup dashboard
                                         (reads cached state,
                                          manual refresh,
                                          settings editor)
```

- The background page owns the current `NetworkIdentity` and `OpsecStatus`.
  The popup is a read-only projection of the cached state; opening it never by
  itself triggers a flurry of API calls.
- Providers are modular and interchangeable; `NetworkIdentityService` combines
  their results and owns change detection, history, and toolbar updates.

## Firefox-specific choices

- **MV3 event page, not service worker**: Firefox MV3 service workers do not
  expose the DOM or `RTCPeerConnection`, but the WebRTC leak check needs the
  candidate gathering inside the background (so the badge reflects leaks
  without opening the popup). The MV3 event page (`background.scripts`) is the
  recommended Firefox MV3 background and gives full extension-page APIs.
- **`browser.action`** (MV3): `setBadgeText`, `setBadgeBackgroundColor`,
  `setTitle`, `setIcon`. Tooltip is set via `setTitle`.
- **Periodicity** via `browser.alarms` (survives event-page suspension).

## Data model (`src/typedefs.js`)

```ts
interface NetworkIdentity {
  ipv4?: string;
  ipv6?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  timezone?: string;
  asn?: string;
  organization?: string;
  networkType?: string;   // from provider-supplied classification, or "Unknown"
  privacy?: {             // only flags the provider actually supplies
    vpn?: boolean; proxy?: boolean; tor?: boolean;
    datacenter?: boolean; icloudRelay?: boolean;
    anonymous?: boolean; mobile?: boolean;
  } | null;
  provider?: string;      // which provider supplied the identity
  timestamp: number;
}

interface OpsecStatus {
  overall: "green" | "yellow" | "red" | "unknown";
  ipv4: CheckResult;
  ipv6: CheckResult;
  webrtc: CheckResult;
  identity: CheckResult;
  dns: CheckResult;       // always UNKNOWN; see Honest checks
}

type CheckResult = { status: "pass" | "fail" | "unknown", note?: string };
```

The JSDoc in `src/typedefs.js` is the source of truth.

## State machine

- **Initial load**: hydrate from `browser.storage.local`; if empty or stale,
  run a refresh immediately.
- **`refresh(force)`**:
  1. Collect identity (primary `ipapi.is` -> fallback `ipinfo.io` -> IPv4-only
     `ipify`).
  2. IPv6 supplement via `api6.ipify.org` (non-fatal).
  3. Diff against the previous identity (`diffIdentities`).
  4. WebRTC leak check (`gatherCandidates` + `evaluateWebrtc`).
  5. Derive per-check results and overall status (`computeChecks` /
     `computeOverall`).
  6. Record change history (cap 10), persist, update the toolbar.
- **Failure path**: `_recordFailure` keeps the last identity, marks it STALE,
  sets `overall: UNKNOWN` (or keeps RED if a WebRTC leak was already
  confirmed), and logs status noise only.
- **Acknowledge path**: `ackChange` runs when the popup has rendered a pending
  change banner. The new identity becomes the baseline; the banner is marked
  as seen so it does not re-open on the next popup open.

## Change events

```
state.lastChange            latest change banner (seen/unseen)
state.history               last 10 events, newest first
```

Event shapes:

- `{ kind: "ip", previousIp, currentIp, previousCountry, previousAsn, timestamp, seen }`
- `{ kind: "geo-asn", previousCountry, currentCountry, previousAsn, currentAsn, timestamp, seen }`

IP changes are RED (`!` badge); geo/ASN-only changes are YELLOW (`?` badge).

## Honest checks

- **WebRTC**: PASS when no public candidate is observed or when all public
  candidates match the current identity. FAIL when any public candidate does
  not match. UNKNOWN when WebRTC is unavailable (e.g. disabled by policy) or
  when the check is switched off in Settings.
- **DNS**: always UNKNOWN. A browser extension cannot test the system resolver
  path; pretending otherwise would be fabrication.
- **IPv6**: "Not detected" means an IPv6 answer was not observed through the
  supplement lookup; it does not prove IPv6 is absent on the network.
- **Classification**: shown only from provider-supplied flags; the free
  ipapi.is tier supplies none -> "Unknown".

## Messaging

```
popup / background
  opsec:getState    -> current state (may kick a refresh if stale)
  opsec:refresh     -> force refresh, then state
  opsec:ackChange   -> mark change banner seen, recompute
  opsec:setSettings -> clamp + persist, reschedule alarm, retext badge
```

The popup also listens on `browser.storage.onChanged` so external edits (or a
later background refresh) update the rendered view immediately.

## Security posture

See SECURITY.md. Short version: strict validation of every external value,
no innerHTML with external data, no eval / new Function, no remote scripts,
dependence on CSP-locked extension pages, minimal permissions, dependency-free
runtime code (`web-ext` is dev-only and not shipped).