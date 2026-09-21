import {
    getItemFromLocal, setItemInLocal, modifyItemInLocal,
    addBlockedPortToHost, addBlockedTrackingHost, increaseBadge,
    toggleBlocking, migrateStringifiedStorage
} from "./BrowserStorageManager.js";
import { RESOURCE_TYPES, isPrivateHost } from "./constants.js";
import { setBadgeColor } from "./browserActions.js";

const THREATMETRIX_CNAME_HOST = "online-metrix.net";

const INSTALL_DEFAULTS = {
    blocking_enabled: true,
    notificationsAllowed: true,
    allowed_domain_list: [],
    blocked_ports: {},
    blocked_hosts: {},
    badges: {}
};


chrome.runtime.onInstalled.addListener(async ({ reason }) => {
    try {
        if (reason === "install") {
            await chrome.storage.local.set(INSTALL_DEFAULTS);
        } else if (reason === "update") {
            await migrateStringifiedStorage();
        }
    } catch (error) {
        console.error(`storage ${reason}:`, error);
    }
});

async function initialize() {
    setBadgeColor();
    await toggleBlocking(await getItemFromLocal("blocking_enabled", true));
}

initialize();

// Detection only; DNR blocks.
chrome.webRequest.onBeforeRequest.addListener(
    detectPotentialBlock,
    { urls: ["<all_urls>"], types: RESOURCE_TYPES },
    []
);

async function detectPotentialBlock(requestDetails) {
    if (requestDetails.tabId < 0 || requestDetails.url.startsWith("data:")) {
        return;
    }

    if (!(await getItemFromLocal("blocking_enabled", true))) return;

    let requestUrl;
    try {
        requestUrl = new URL(requestDetails.url);
    } catch (e) {
        return;
    }

    let initiatorHost = null;
    const initiatorString = requestDetails.initiator || requestDetails.originUrl;
    if (initiatorString && (initiatorString.startsWith("http:") || initiatorString.startsWith("https:"))) {
        try {
            initiatorHost = new URL(initiatorString).hostname;
        } catch (e) {
            // bad initiator
        }
    }

    if (initiatorHost) {
        const allowed_domains_list = await getItemFromLocal("allowed_domain_list", []);
        if (allowed_domains_list.includes(initiatorHost)) {
            return;
        }
    }

    if (isPrivateHost(requestUrl.hostname)) {
        if (requestUrl.hostname !== initiatorHost) {
            try {
                await increaseBadge(requestDetails, false);
                await addBlockedPortToHost(requestUrl, requestDetails.tabId);
            } catch (error) { console.error("Error updating state for port scan detection:", error); }
        }
        return;
    }

    // chrome.dns is Dev channel only, so on stable this half never runs.
    if (!chrome.dns) return;

    try {
        const { canonicalName } = await chrome.dns.resolve(requestUrl.hostname);
        const cname = canonicalName?.toLowerCase() ?? "";
        if (cname === THREATMETRIX_CNAME_HOST || cname.endsWith(`.${THREATMETRIX_CNAME_HOST}`)) {
            try {
                await increaseBadge(requestDetails, true);
                await addBlockedTrackingHost(requestUrl, requestDetails.tabId);
            } catch (error) { console.error("Error updating state for ThreatMetrix CNAME detection:", error); }
        }
    } catch (e) {
        // lookup failed
    }
}

async function setBlocking(enable) {
    await toggleBlocking(enable);
    await setItemInLocal("blocking_enabled", enable);
}

// increaseBadge recreates entries on demand.
function resetTabState(tabId) {
    return Promise.all(["badges", "blocked_ports", "blocked_hosts"].map(
        (key) => modifyItemInLocal(key, {}, (obj) => { delete obj[tabId]; return obj; })
    ));
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.url && (changeInfo.url.startsWith("http:") || changeInfo.url.startsWith("https:"))) {
        await resetTabState(tabId);
        try { await chrome.action.setBadgeText({ text: "", tabId }); }
        catch (e) { /* tab closed */ }
    }
});

chrome.tabs.onRemoved.addListener((tabId) => resetTabState(tabId));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!sender.url || !sender.url.startsWith(chrome.runtime.getURL(""))) {
        console.warn("rejected sender", sender);
        return false;
    }

    (async () => {
        try {
            switch (message.type) {
                case "popupInit":
                    sendResponse({
                        isListening: await getItemFromLocal("blocking_enabled", true),
                        notificationsAllowed: await getItemFromLocal("notificationsAllowed", true)
                    });
                    break;
                case "toggleEnabled":
                    await setBlocking(message.value);
                    sendResponse({ success: true });
                    break;
                case "setNotificationsAllowed":
                    await setItemInLocal("notificationsAllowed", message.value);
                    sendResponse({ success: true });
                    break;
                default:
                    console.warn("unknown message", message.type);
                    sendResponse({ success: false, error: "unknown message type" });
            }
        } catch (error) {
            console.error(`message ${message?.type}:`, error);
            sendResponse({ success: false, error: error.message || "failed" });
        }
    })();

    // async sendResponse
    return true;
});
