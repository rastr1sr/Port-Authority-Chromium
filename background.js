import {
    getItemFromLocal, setItemInLocal, modifyItemInLocal,
    addBlockedPortToHost, addBlockedTrackingHost, increaseBadge,
    toggleBlocking
} from "./BrowserStorageManager.js";

const local_filter_regex = new RegExp("\\b(^(http|https|wss|ws|ftp|ftps):\\/\\/127[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)|^(http|https|wss|ws|ftp|ftps):\\/\\/0\\.0\\.0\\.0|^(http|https|wss|ws|ftp|ftps):\\/\\/(10)([.](25[0-5]|2[0-4][0-9]|1[0-9]{1,2}|[0-9]{1,2})){3}|^(http|https|wss|ws|ftp|ftps):\\/\\/localhost|^(http|https|wss|ws|ftp|ftps):\\/\\/172[.](1[6-9]|2[0-9]|3[0-1])[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)|^(http|https|wss|ws|ftp|ftps):\\/\\/192\\.168[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)|^(http|https|wss|ws|ftp|ftps):\\/\\/169\\.254[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?))", "i");
const thm_cname_target_regex = new RegExp("online-metrix\\.net$", "i");

let isListenerAttached = false;

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
        try {
            await setItemInLocal("blocking_enabled", true);
            await setItemInLocal("notificationsAllowed", true);
            await setItemInLocal("allowed_domain_list", []);
            await setItemInLocal("blocked_ports", {});
            await setItemInLocal("blocked_hosts", {});
            await setItemInLocal("badges", {});
        } catch (error) {
            console.error("Error initializing storage on install:", error);
        }
    }
});

async function initialize() {
    console.log("Port Authority Service Worker Started");
    const blockingEnabled = await getItemFromLocal("blocking_enabled", true);
    await toggleBlocking(blockingEnabled);
    if (blockingEnabled) {
        attachNonBlockingListener();
    }
}

initialize();

async function detectPotentialBlock(requestDetails) {
    if (requestDetails.tabId < 0 || requestDetails.url.startsWith('data:')) {
        return;
    }

    let requestUrl;
    try {
        requestUrl = new URL(requestDetails.url);
    } catch (e) {
        return;
    }

    let initiatorUrl = null;
    let initiatorHost = null;
    const initiatorString = requestDetails.initiator || requestDetails.originUrl;
    if (initiatorString && (initiatorString.startsWith('http:') || initiatorString.startsWith('https:'))) {
        try {
            initiatorUrl = new URL(initiatorString);
            initiatorHost = initiatorUrl.hostname;
        } catch (e) {
            // Ignore errors if initiator URL is invalid
        }
    }

    if (initiatorHost) {
        const allowed_domains_list = await getItemFromLocal("allowed_domain_list", []);
        if (Array.isArray(allowed_domains_list) && allowed_domains_list.includes(initiatorHost)) {
            return;
        }
    }

    if (local_filter_regex.test(requestDetails.url)) {
         const isThirdParty = !(initiatorUrl && requestUrl.hostname === initiatorHost);
         if (isThirdParty) {
            try {
                await increaseBadge(requestDetails, false);
                await addBlockedPortToHost(requestUrl, requestDetails.tabId);
            } catch (error) { console.error("Error updating state for port scan detection:", error); }
         }
        return;
    }

    try {
        const blockingEnabled = await getItemFromLocal("blocking_enabled", true);
        if (!blockingEnabled) return;

        const dnsResult = await chrome.dns.resolve(requestUrl.hostname);
        if (dnsResult?.canonicalName && thm_cname_target_regex.test(dnsResult.canonicalName)) {
             try {
                await increaseBadge(requestDetails, true);
                await addBlockedTrackingHost(requestUrl, requestDetails.tabId);
             } catch (error) { console.error("Error updating state for ThreatMetrix CNAME detection:", error); }
        }
    } catch (e) {
        // Ignore DNS resolution errors
    }
}

function attachNonBlockingListener() {
    if (isListenerAttached) return;
    try {
        chrome.webRequest.onBeforeRequest.addListener(
            detectPotentialBlock,
            { urls: ["<all_urls>"], types: ["main_frame", "sub_frame", "xmlhttprequest", "websocket", "image", "script", "other"] },
            []
        );
        isListenerAttached = true;
    } catch (e) {
        console.error("Failed to attach non-blocking listener:", e);
    }
}

function removeNonBlockingListener() {
    if (!isListenerAttached) return;
    try {
        if (chrome.webRequest.onBeforeRequest.hasListener(detectPotentialBlock)) {
             chrome.webRequest.onBeforeRequest.removeListener(detectPotentialBlock);
        }
    } catch (e) { console.error("Failed to remove non-blocking listener:", e); }
    finally { isListenerAttached = false; }
}

async function startBlocking() {
    attachNonBlockingListener();
    await setItemInLocal("blocking_enabled", true);
}

async function stopBlocking() {
    removeNonBlockingListener();
    await setItemInLocal("blocking_enabled", false);
}

async function isBlockingEnabled() {
    const storageState = await getItemFromLocal("blocking_enabled", true);
    if (storageState !== isListenerAttached) {
         if (storageState) attachNonBlockingListener(); else removeNonBlockingListener();
    }
    return storageState;
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tabInfo) => {
    if (changeInfo.url && (changeInfo.url.startsWith('http:') || changeInfo.url.startsWith('https:'))) {
        await modifyItemInLocal("badges", {}, (currentBadges) => {
            currentBadges[tabId] = { counter: 0, portAlerted: false, tmxAlerted: false, lastURL: changeInfo.url };
            return currentBadges;
        });
        try { await chrome.action.setBadgeText({ text: '', tabId: tabId }); }
        catch (e) { /* Ignore error if tab closed */ }
        await modifyItemInLocal("blocked_ports", {}, (obj) => { delete obj[tabId]; return obj; });
        await modifyItemInLocal("blocked_hosts", {}, (obj) => { delete obj[tabId]; return obj; });
    }
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    await modifyItemInLocal("badges", {}, (obj) => { delete obj[tabId]; return obj; });
    await modifyItemInLocal("blocked_ports", {}, (obj) => { delete obj[tabId]; return obj; });
    await modifyItemInLocal("blocked_hosts", {}, (obj) => { delete obj[tabId]; return obj; });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!sender.url || !sender.url.startsWith(chrome.runtime.getURL(""))) {
        console.warn('Message rejected from unexpected sender:', sender);
        return false;
    }

    (async () => {
        try {
            switch (message.type) {
                case 'popupInit': {
                    const listening = await isBlockingEnabled();
                    const notifications = await getItemFromLocal("notificationsAllowed", true);
                    sendResponse({ isListening: listening, notificationsAllowed: notifications });
                    break;
                }
                case 'toggleEnabled':
                    await (message.value ? startBlocking() : stopBlocking());
                    sendResponse({ success: true });
                    break;
                case 'setNotificationsAllowed':
                    await setItemInLocal("notificationsAllowed", message.value);
                    sendResponse({ success: true });
                    break;
                case 'getItemInLocal':
                    const value = await getItemFromLocal(message.key, message.defaultValue);
                    sendResponse(value);
                    break;
                case 'setItemInLocal':
                    await setItemInLocal(message.key, message.value);
                    sendResponse({ success: true });
                    break;
                default:
                    console.warn('Port Authority: Received unknown message type: ', message.type);
                    sendResponse({ success: false, error: "Unknown message type" });
            }
        } catch (error) {
            console.error(`Error processing message type ${message?.type}:`, error);
            sendResponse({ success: false, error: error.message || "An unknown error occurred" });
        }
    })();

    // Return true to indicate that sendResponse will be called asynchronously
    return true;
});