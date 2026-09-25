# Security Policy

## Supported versions

The current tagged release of `main` is supported. Fixes and improvements land
on `main` and are released as new patch or minor versions. Once a new release
is out, older releases of the same major version are considered out of support.

## Reporting a vulnerability

Please report security issues privately via GitHub Security Advisories on this
repository ("Security > Report a vulnerability").

Do not open a public GitHub issue for a suspected vulnerability before the
project maintainer has had a chance to review.

## Responsible disclosure expectations

- Give describe-the-impact detail up front. If the issue can lead to data
  exposure, privilege escalation, remote code execution, or a bypass of a
  stated guarantee of the extension, say so explicitly and include the
  trigger conditions.
- Allow a reasonable response window (60 days is a common baseline; if the
  issue looks actively exploited, state that in the report).
- Coordinate before publishing technical details or a proof of concept.
- If an issue has a documented mitigation the user can apply immediately,
  include it.

## What to include in a report

- Affected version(s) of the extension and Firefox build.
- A brief reproducible trigger or exact steps.
- What the vulnerable behavior allows an attacker to do in plain terms.
- Any log lines or observation that support the claim.
- Whether the issue is confirmed, strongly suspected, or hypothetical.

## What NOT to include in the report

- Your real public IP address or any identifying location.
- Long logs with unredacted identity data.
- Credentials, API tokens, or session state from a live system.
- Any AS-org / ASN attribution that could identify a specific person.

Prefer clearly fictional examples (203.0.113.42, AS64500, Example City) when
writing test cases.

## Scope

This repository contains:

- The Firefox extension itself (popup UI, background service, providers).
- Test code and fixtures.
- Documentation.

In-scope for vulnerability reports: defects that break the stated privacy
contract, allow data leakage beyond the documented behavior, or undermine
the integrity of the identity/leak checks shown to the user.

Out of scope: evidence-gathering room-temperature (style, lint, minor UX),
feature requests, and "the provider API is down" availability complaints.
