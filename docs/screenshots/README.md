# Screenshots

Place sanitized screenshots here. To capture screenshots:

1. Build and run the extension locally: `npm install && npm start`.
2. With the extension loaded, open its popup and use the "API endpoint
   override" in Settings to point all providers at `http://localhost:PORT/`
   serving fixture data (use TEST-NET addresses, e.g. 203.0.113.42 /
   "Example City" / AS64500) so no real IP appears in any capture.
3. Take the screenshot, name it semantically (e.g. `popup-dark.png`,
   `popup-light.png`, `details.png`), and commit.

Never commit a screenshot containing a real public IP, a real location, or a
real ASN tied to a person.
