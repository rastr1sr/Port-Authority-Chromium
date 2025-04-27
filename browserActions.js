export async function notifyPortScanning(domain_name) {
    const message = domain_name
        ? `Port Authority blocked ${domain_name} from potentially port scanning your private network.`
        : "Port Authority blocked a potential port scan attempt.";

    const notificationId = "port-scanning-notification-" + Date.now();

    try {
        await chrome.notifications.create(notificationId, {
            type: "basic",
            iconUrl: chrome.runtime.getURL("icons/logo-96.png"),
            title: "Port Scan Blocked",
            message: message,
            priority: 1
        });
    } catch (e) {
        console.error(`Failed to create port scanning notification (ID: ${notificationId}):`, e);
    }
}


export async function notifyThreatMetrix(domain_name) {
    const message = domain_name
        ? `Port Authority blocked a known LexisNexis tracker endpoint on ${domain_name}.`
        : "Port Authority blocked a known LexisNexis tracker endpoint.";

    const notificationId = "threatmetrix-notification-" + Date.now();

    try {
        await chrome.notifications.create(notificationId, {
            type: "basic",
            iconUrl: chrome.runtime.getURL("icons/logo-96.png"),
            title: "Tracking Script Blocked",
            message: message,
            priority: 1
        });
     } catch (e) {
         console.error(`Failed to create ThreatMetrix notification (ID: ${notificationId}):`, e);
     }
}


export function updateBadges(text, tabId) {
    const badgeText = String(text);
    const targetTabId = parseInt(tabId);

    if (isNaN(targetTabId) || targetTabId < 0) {
        return;
    }

    try {
        chrome.action.setBadgeText({
            text: badgeText,
            tabId: targetTabId
        });
        chrome.action.setBadgeBackgroundColor({
            color: "#800000", // Dark red color
            tabId: targetTabId
        });
    } catch (error) {
        // Silently catch errors, often due to closed tabs.
    }
}