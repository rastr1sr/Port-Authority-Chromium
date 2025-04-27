---
name: False Positive Report (Port Authority)
about: Report a legitimate website or resource incorrectly blocked by Port Authority.
title: "[False Positive] "
labels: bug, false-positive
assignees: rastr1sr

---

**Blocked Resource URL**
Please provide the **exact URL of the resource that was blocked**. This might be different from the page you were visiting.
*   You can often find this in the browser's **Developer Tools (F12) Network tab**. Look for requests marked as blocked or failed.
*   If Port Authority showed a notification, it might have included the domain.
*   `[Enter the specific blocked URL here]`

**Website Visited**
The URL of the page you were visiting when the block occurred:
`[Enter the URL of the website page here]`

**Describe the False Positive**
Explain why you believe this block was incorrect. What is the purpose of the blocked resource? (e.g., "This is required for login", "It's loading essential images", "It's part of the site's core functionality").

**Type of Block (if known)**
Do you know if Port Authority blocked this as a potential **port scan** (e.g., request to `localhost`, `192.168.x.x`) or as a **ThreatMetrix tracker**? (The popup or notification might indicate this).
`[Port Scan / ThreatMetrix / Unsure]`

**Steps to Reproduce**
Provide clear steps to trigger the incorrect block:
1. Ensure Port Authority is enabled.
2. Go to the 'Website Visited' URL above.
3. Interact with the page: `[e.g., Click login button, load specific content, etc.]`
4. Observe the block (e.g., functionality breaks, resource fails to load in Network tab).

**Expected Behavior**
What should have happened? (e.g., "Login should complete", "Images should load", "The request should be allowed").

**Screenshots**
If applicable, add screenshots to help explain the problem.
*   A screenshot of the **Network tab** in Developer Tools (F12) showing the blocked request (often highlighted in red) is highly valuable.
*   Screenshots of broken site functionality are also helpful.

**Environment (please complete the following information):**
 - OS: [e.g., Windows 11, macOS Sonoma 14.1, Ubuntu 22.04]
 - Browser: [e.g., Chrome, Firefox, Edge, Brave]
 - Browser Version: [e.g., Chrome 120.0.6099.129]
 - **Port Authority Extension Version:** [e.g., 2.1.0 - # Find this in your browser's extension manager]

**Troubleshooting Information (Optional but Helpful)**
*   Did adding the 'Website Visited' domain to the Port Authority allowlist prevent the block? `[Yes/No/Haven't Tried]`
*   **CNAME Check (If blocked as ThreatMetrix):** Can you check the CNAME record for the **Blocked Resource URL**'s domain? (Using tools like `nslookup` (command line) or online DNS checkers). Does it point to `online-metrix.net` or similar? `[Paste CNAME result here, if checked]`
*   **Console Errors:** Are there any relevant errors in the browser's Developer Console (F12)?