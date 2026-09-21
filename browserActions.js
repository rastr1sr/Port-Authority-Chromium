// Chrome assigns the id.
async function notify(title, message) {
    try {
        await chrome.notifications.create({
            type: "basic",
            iconUrl: chrome.runtime.getURL("icons/logo-96.png"),
            title,
            message,
            priority: 1
        });
    } catch (e) {
        console.error(`notify "${title}":`, e);
    }
}

export function notifyPortScanning(domain_name) {
    return notify(
        "Port Scan Blocked",
        `Blocked ${domain_name} from scanning your network.`
    );
}

export function notifyThreatMetrix(domain_name) {
    return notify(
        "Tracking Script Blocked",
        `Blocked a LexisNexis tracker on ${domain_name}.`
    );
}

export function setBadgeColor() {
    chrome.action.setBadgeBackgroundColor({ color: "#800000" });
}

export function updateBadges(count, tabId) {
    try {
        chrome.action.setBadgeText({ text: String(count), tabId });
    } catch (error) {
        // tab closed
    }
}
