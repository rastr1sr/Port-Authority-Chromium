export async function notifyPortScanning(domain_name) {
    const message = domain_name
        ? `Port Authority blocked ${domain_name} from potentially port scanning your private network.`
        : "Port Authority blocked a potential port scan attempt.";
    try {
        await chrome.notifications.create("port-scanning-notification-" + Date.now(), { // Unique ID per notification
            type: "basic",
            iconUrl: chrome.runtime.getURL("icons/logo-96.png"),
            title: "Port Scan Blocked",
            message: message,
            priority: 1 // Optional: set priority
        });
    } catch (e) {
        console.error("Failed to create port scanning notification:", e);
    }
}

export async function notifyThreatMetrix(domain_name) {
    const message = domain_name
        ? `Port Authority blocked a known LexisNexis tracker endpoint on ${domain_name}.`
        : "Port Authority blocked a known LexisNexis tracker endpoint.";
     try {
        await chrome.notifications.create("threatmetrix-notification-" + Date.now(), { // Unique ID
            type: "basic",
            iconUrl: chrome.runtime.getURL("icons/logo-96.png"),
            title: "Tracking Script Blocked",
            message: message,
            priority: 1 // Optional
        });
     } catch (e) {
         console.error("Failed to create ThreatMetrix notification:", e);
     }
}


/**
 * Updates the extension action icon's badge text.
 */
export function updateBadges(text, tabId) {
    // Ensure text is a string and tabId is a valid number
    const badgeText = String(text);
    const targetTabId = parseInt(tabId);

    if (isNaN(targetTabId) || targetTabId < 0) {
        // console.warn("Attempted to set badge for invalid tabId:", tabId);
        return; // Don't attempt to set badge for invalid tabs like -1
    }

    try {
        chrome.action.setBadgeText({
            text: badgeText,
            tabId: targetTabId
        });
        // Optional: Set badge color
        chrome.action.setBadgeBackgroundColor({
            color: "#800000", // Dark red color from CSS
            tabId: targetTabId
        });
    } catch (error) {
        // Catch errors, e.g., if the tab doesn't exist anymore
        // console.warn("Couldn't update badge:", { tabId: targetTabId, text: badgeText, error });
    }
}