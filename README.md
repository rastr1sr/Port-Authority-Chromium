# <sub><img src="icons/logo-96.png" width="64px" height="64px"></sub> Port Authority (Chromium MV3 Version)

**Important:** This repository contains a **Manifest V3 port** of the original [Port Authority Firefox extension](https://github.com/ACK-J/Port_Authority) specifically for **Chromium-based browsers (like Chrome, Edge, Brave)**.

*   **Firefox Users:** Please use the official version from the original creator available on the [Mozilla Add-ons Store (AMO)](https://addons.mozilla.org/firefox/addon/port-authority). This repository **does not** support Firefox.
*   **Chromium Users:** This version leverages Manifest V3 features and requires a Chromium browser that supports the `chrome.dns` API (currently available in Dev/Canary channels, planned for stable release).

This extension blocks websites from using JavaScript to port scan your computer/internal network and dynamically blocks known LexisNexis (ThreatMetrix) endpoints from running their invasive data collection scripts within Chromium browsers.

---

## About This Chromium MV3 Port

**Disclaimer:** Please note that this port was created by an amateur developer (me !) as a learning exercise. It's a best-effort attempt to migrate the original extension to Manifest V3 for Chromium, and due to my limited experience, there's no guarantee it will work flawlessly or cover all edge cases. Please pardon any bugs or suboptimal programming practices you might encounter.

---

This version represents a significant migration from the original Firefox Manifest V2 extension to Google's Manifest V3 platform for Chromium browsers. Here's a summary of the key changes and decisions:

1.  **Manifest V3:** The core architecture was updated to MV3, requiring major changes:
    *   **Background Service Worker:** Replaced the persistent background script with a non-persistent Service Worker (`background.js`). Logic was adapted to handle the service worker potentially terminating and restarting.
    *   **Declarative Net Request (DNR) API:** MV3 heavily restricts blocking web requests. The powerful `webRequestBlocking` API used in the Firefox version is **not available**. We now use the `declarativeNetRequest` API for the actual blocking:
        *   **Static Rules:** Blocking rules for private IP addresses (`localhost`, `127.0.0.1`, `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`, `169.254.x.x`) and known ThreatMetrix-related domains are defined statically in `rules.json`. This provides fast, browser-native blocking.
        *   **Allowlist:** Domain allowlisting is implemented using *dynamic* DNR rules, which are added/removed based on user settings.
    *   **Host Permissions:** The `<all_urls>` permission is required for `declarativeNetRequest` to apply rules globally and for the non-blocking `webRequest` listener.
2.  **`chrome.dns` API Requirement:**
    *   A key feature of the original extension was dynamically blocking ThreatMetrix by resolving CNAME records in real-time.
    *   The `declarativeNetRequest` API **cannot** perform DNS lookups.
    *   To retain some dynamic detection capability (primarily for notifications and badge counts, as DNR handles the primary block of *known* domains), this MV3 version uses the `chrome.dns.resolve` API.
    *   **Crucially, the `chrome.dns` API is currently only available in Chrome Dev/Canary channels (as of early 2024) and is expected to roll out to Stable later.** This is why this version **requires a Chromium Dev build or newer** for full functionality (specifically, the CNAME check part). Without it, only static rule blocking will work.
3.  **Non-Blocking `webRequest` Listener:**
    *   Since DNR handles the blocking, we can no longer rely on `webRequestBlocking` to count blocks or trigger notifications accurately *at the moment of blocking*.
    *   Instead, a *non-blocking* `chrome.webRequest.onBeforeRequest` listener runs in parallel. It uses similar logic (regex for local IPs, `chrome.dns` for CNAME checks) to *detect* requests that *should* be blocked by DNR.
    *   This listener's sole purpose is to **update the badge count** on the extension icon and **trigger user notifications**. It does **not** perform any blocking itself. This is a necessary workaround due to MV3 limitations.
4.  **Namespace Changes:** All `browser.*` APIs were replaced with their `chrome.*` equivalents (`chrome.storage`, `chrome.tabs`, `chrome.notifications`, `chrome.action`, `chrome.runtime`, `chrome.dns`).
5.  **Code Structure:** While adapting to MV3, efforts were made to maintain modularity (e.g., `BrowserStorageManager.js`) and update UI components (`popup.html`, `settings.html` and associated JS).
6.  **Focus:** This port is exclusively for Chromium. Firefox-specific features, settings (`browser_specific_settings`), and APIs have been removed.

----
## What does this Chromium extension do?

1.  **Blocks Port Scanning Attempts:** Uses the `declarativeNetRequest` API to block requests from websites to private network IP addresses (localhost, RFC1918 ranges, link-local) via HTTP, HTTPS, WebSockets (WS/WSS).
2.  **Blocks Known ThreatMetrix Trackers:** Includes static rules to block known domains associated with LexisNexis ThreatMetrix tracking scripts. It also uses the `chrome.dns` API (when available) in a non-blocking listener to detect *potential* ThreatMetrix domains via CNAME lookups for notification purposes.
3.  **Allowlist:** Provides an options page to add trusted domains, allowing them to bypass the extension's blocking rules.
4.  **Notifications & Badge Count:** Alerts you when potential port scans or tracking scripts are detected and updates the extension icon badge to show a count of blocked resources for the active tab.
5.  **Privacy Focused:** Designed not to store or transmit any data about your browsing activity or the specific requests being blocked (beyond the temporary list shown in the popup for the current tab).

## Why use Port Authority?

Websites should not be probing your internal network. Furthermore, invasive tracking scripts like ThreatMetrix collect hundreds of data points about your device and network, often without clear consent. This extension aims to enhance your privacy and security by blocking these activities. The original author's motivation and research into ThreatMetrix can be found [here](https://github.com/ACK-J/Port_Authority#why-i-wrote-this-addon).

## Installation (Chromium Dev/Canary Recommended)

**Prerequisites:**
*   A Chromium-based browser (Chrome, Edge, Brave, etc.)
*   **Recommended:** Developer Channel build or newer (e.g., Chrome Dev, Chrome Canary) to ensure the `chrome.dns` API is available for full functionality.

**Steps:**
1.  Download this repository (e.g., click "Code" -> "Download ZIP").
2.  Unzip the downloaded file.
3.  Open your Chromium browser and navigate to the extensions page (e.g., `chrome://extensions` or `edge://extensions`).
4.  Enable "Developer mode" (usually a toggle in the top-right corner).
5.  Click "Load unpacked".
6.  Select the unzipped folder containing the `manifest.json` file.
7.  The Port Authority extension should now be installed.

## Testing

*   **Port Scanning:** Visit the [TestPortScans.html](TestPortScans.html) file (open it locally in your browser) included in this repository. Check the browser's Developer Tools (F12) Network tab – requests to local IPs should appear as blocked by the extension.
*   **ThreatMetrix:** Visit sites known to use ThreatMetrix (if you know specific examples). Check the Network tab and look for blocked requests to domains like `*.online-metrix.net` or known aliases defined in `rules.json`. The extension icon badge should increment, and you may receive a notification.

## Permissions Needed (Chromium)

*   **Read your browsing history (`tabs`):** Needed to associate blocked requests with specific tabs and manage badge counts per tab.
*   **Display notifications:** Required to alert you when potential port scans or tracking scripts are blocked.
*   **Block content on any page you visit (`declarativeNetRequest`):** The core permission to implement blocking rules.
*   **Access IP address and hostname information (`dns`):** Needed for the optional CNAME check to detect potential ThreatMetrix domains (requires Dev channel or newer).
*   **Read and change your data on all websites (`host_permissions: <all_urls>`):** Required by `declarativeNetRequest` to apply rules to all sites and by the non-blocking `webRequest` listener to detect potential blocks across all sites.
*   **Manage your apps, extensions, and themes (`management` - *Implicitly via storage*):** The `storage` permission allows storing settings like the allowlist and enabled status.

## Contributing

Bug reports and feature requests specifically for this **Chromium MV3 port** are welcome via the [Issues](https://github.com/rastr1sr/Port-Authority-Chromium/issues) tab. Please use the provided templates.

## Acknowledgements

*   This project is a port of the original [Port Authority](https://github.com/ACK-J/Port_Authority) by **ACK-J**. Many thanks for their excellent work on the original extension.