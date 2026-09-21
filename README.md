# Port Authority (Chromium MV3)

Stops websites from port scanning your network with JavaScript, and blocks LexisNexis (ThreatMetrix) trackers.

Port of [Port Authority](https://github.com/ACK-J/Port_Authority) by ACK-J. Chromium only; Firefox users want [the original](https://addons.mozilla.org/firefox/addon/port-authority). Written by an amateur as a learning exercise, so expect bugs and [report them](https://github.com/rastr1sr/Port-Authority-Chromium/issues).

## Install

1. Download and unzip
2. Open `chrome://extensions`, turn on Developer mode
3. Load unpacked, pick the folder holding `manifest.json`

### On stable Chrome you lose CNAME detection

`chrome.dns` is [Dev channel only](https://developer.chrome.com/docs/extensions/reference/api/dns), and Google says there are no foreseeable plans to ship it to stable. On stable Chrome the extension still blocks port scans and the known ThreatMetrix domains in `rules.json`. What it cannot do is catch trackers that hide behind a CNAME. Run Chrome Dev or Canary if you want that half.

## Test

`node test.mjs`, or open `TestPortScans.html` and follow the page.

## Why the IP ranges exist twice

`rules.json` blocks them. `constants.js` detects them again for the badge and popup, because declarativeNetRequest won't tell you what it blocked and can't do DNS lookups. `test.mjs` fails if the two drift.
