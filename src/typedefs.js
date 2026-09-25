"use strict";

// Central data-model definitions (JSDoc typedefs; no runtime code).
// Every external value is validated by src/validate.js before it can land here.

/**
 * Central network identity record.
 * @typedef {Object} NetworkIdentity
 * @property {string} [ipv4]        Public IPv4, strictly validated.
 * @property {string} [ipv6]        Public IPv6, strictly validated.
 * @property {string} [country]     Country name, e.g. "Netherlands".
 * @property {string} [countryCode] Two-letter ISO code, e.g. "NL".
 * @property {string} [region]      Region / state.
 * @property {string} [city]        City.
 * @property {string} [timezone]    IANA timezone id, e.g. "Europe/Amsterdam".
 * @property {string} [asn]         AS number in "AS9009" form.
 * @property {string} [organization] Organization / provider name.
 * @property {string} [networkType] VPN | Proxy | Tor | iCloud Relay | Datacenter | Residential | Unknown.
 *                                  Only ever derived from provider-supplied classification flags.
 * @property {Object|null} [privacy] Provider-supplied classification flags (vpn/proxy/tor/...).
 * @property {string} provider      Provider id that supplied the data ("ipapi.is" | "ipinfo.io" | "ipify").
 * @property {number} timestamp     Epoch ms of the check.
 */

/**
 * Per-check result used inside OpsecStatus.
 * @typedef {Object} CheckResult
 * @property {"pass"|"fail"|"unknown"} status
 * @property {string} [note] Human-readable explanation.
 */

/**
 * Overall status model.
 * @typedef {Object} OpsecStatus
 * @property {"green"|"yellow"|"red"|"unknown"} overall
 * @property {CheckResult} ipv4
 * @property {CheckResult} ipv6
 * @property {CheckResult} webrtc
 * @property {CheckResult} identity
 * @property {CheckResult} dns
 */

/**
 * Identity change record (persisted, local only).
 * @typedef {Object} IdentityChange
 * @property {"ip"|"geo-asn"} kind
 * @property {string} [previousIp]
 * @property {string} [currentIp]
 * @property {string} [previousCountry]
 * @property {string} [currentCountry]
 * @property {string} [previousAsn]
 * @property {string} [currentAsn]
 * @property {number} timestamp
 * @property {boolean} seen Whether the popup already displayed it.
 */

/**
 * Full persisted state under storage.local key "opsecState".
 * @typedef {Object} SentinelState
 * @property {NetworkIdentity|null} identity
 * @property {NetworkIdentity|null} previousIdentity
 * @property {OpsecStatus|null} checks
 * @property {"green"|"yellow"|"red"|"unknown"} overall
 * @property {string|null} redReason "change" | "leak" | null
 * @property {boolean} stale
 * @property {number|null} lastCheck
 * @property {Object|null} lastError { kind, at }
 * @property {IdentityChange|null} lastChange
 * @property {IdentityChange[]} history (max 10)
 * @property {Object} settings { intervalMinutes, badgeMode, webrtcEnabled, apiBaseOverride }
 */

/**
 * Per-provider result of an identity lookup (partial identity).
 * @typedef {Partial<NetworkIdentity> & {ipv4?: string, ipv6?: string}} ProviderResult
 */