import {
    getItemFromLocal, setItemInLocal, modifyItemInLocal,
    addBlockedPortToHost, addBlockedTrackingHost, increaseBadge,
    toggleBlocking
} from "./BrowserStorageManager.js";

// Local filter regex (ensure backslashes are escaped for JS String)
// Note: This regex will be used in the *non-blocking* listener for *detection*, not blocking.
const local_filter_regex = new RegExp("\\b(^(http|https|wss|ws|ftp|ftps):\\/\\/127[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)|^(http|https|wss|ws|ftp|ftps):\\/\\/0\\.0\\.0\\.0|^(http|https|wss|ws|ftp|ftps):\\/\\/(10)([.](25[0-5]|2[0-4][0-9]|1[0-9]{1,2}|[0-9]{1,2})){3}|^(http|https|wss|ws|ftp|ftps):\\/\\/localhost|^(http|https|wss|ws|ftp|ftps):\\/\\/172[.](1[6-9]|2[0-9]|3[0-1])[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)|^(http|https|wss|ws|ftp|ftps):\\/\\/192\\.168[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)|^(http|https|wss|ws|ftp|ftps):\\/\\/169\\.254[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?))", "i");

// ThreatMetrix CNAME target regex
const thm_cname_target_regex = new RegExp("online-metrix\\.net$", "i");

let isListenerAttached = false; // Track non-blocking listener state

async function initialize() {
    console.log("Port Authority Service Worker Started");
    const blockingEnabled = await getItemFromLocal("blocking_enabled", true);
    await toggleBlocking(blockingEnabled); // Sync DNR state with storage

    if (blockingEnabled) {
        attachNonBlockingListener();
    }

    const allowedList = await getItemFromLocal("allowed_domain_list", []);
    // Allowlist rules update is handled internally by BrowserStorageManager now
}

initialize();


// This function DETECTS requests that SHOULD be blocked, to trigger UI updates.
// The actual BLOCKING is done by Declarative Net Request rules.
async function detectPotentialBlock(requestDetails) {
    if (requestDetails.tabId < 0) {
        return; // Ignore internal browser requests
    }
     if (requestDetails.url.startsWith('data:')) {
         return; // Ignore data URLs
     }

    let requestUrl;
    try {
        requestUrl = new URL(requestDetails.url);
    } catch (e) {
        console.warn("Could not parse request URL:", requestDetails.url, e);
        return;
    }

    // 1. Check Allowlist (Initiator Domain) - DNR handles the actual allow, but we skip detection logic if allowed.
    let initiatorUrl;
    let initiatorHost = null;
     try {
        // Fallback for missing originUrl
        initiatorUrl = requestDetails.initiator ? new URL(requestDetails.initiator) : (requestDetails.originUrl ? new URL(requestDetails.originUrl) : null);
        if (initiatorUrl) {
             initiatorHost = initiatorUrl.hostname;
        }
     } catch(e) {
        console.warn("Could not parse initiator/origin URL:", requestDetails.initiator || requestDetails.originUrl, e);
     }

    if (initiatorHost) {
        const allowed_domains_list = await getItemFromLocal("allowed_domain_list", []);
        if (allowed_domains_list.includes(initiatorHost)) {
            return; // Don't badge/notify for allowlisted initiators
        }
    }

    // 2. Check if it's a Local Resource Request (Port Scan attempt)
    if (local_filter_regex.test(requestDetails.url)) {
         // Check if it's a third-party request (approximated)
         // DNR handles blocking, but we check here to simulate the old logic for badging/notification context
         let isThirdParty = true; // Assume third party unless proven otherwise
         if (initiatorUrl && requestUrl.hostname === initiatorHost) {
             isThirdParty = false;
         } else if (!initiatorUrl && requestUrl.protocol.startsWith('http')) {
             // If initiator is missing, and it's an http request, assume it's likely third-party or top-level nav (heuristic)
         } else {
            // If initiator known and different, definitely third party
            // If initiator unknown and not http (e.g. extension), maybe not third party? Be cautious.
         }

         // Only count/notify if it appears to be a cross-origin attempt to a local resource
         if (isThirdParty) {
            try {
                await increaseBadge(requestDetails, false);
                await addBlockedPortToHost(requestUrl, requestDetails.tabId);
            } catch (error) {
                 console.error("Error updating state for port scan detection:", error);
            }
         }
        return; // Don't proceed to CNAME check if it matched local filter
    }


    // 3. Check for ThreatMetrix via CNAME (if not matched by static DNR list)
    // This check is best-effort as DNR blocks known domains statically.
    // We perform the DNS check here mainly for notification/badging if a *new* alias is encountered.
    try {
        const dnsResult = await chrome.dns.resolve(requestUrl.hostname);
        if (dnsResult && dnsResult.canonicalName && thm_cname_target_regex.test(dnsResult.canonicalName)) {
             try {
                await increaseBadge(requestDetails, true);
                await addBlockedTrackingHost(requestUrl, requestDetails.tabId);
             } catch (error) {
                 console.error("Error updating state for ThreatMetrix CNAME detection:", error);
             }
        }
    } catch (e) {
        // DNS resolution can fail for many reasons (NXDOMAIN, network error, etc.), often not an error
    }
}

function attachNonBlockingListener() {
    if (isListenerAttached) {
        return;
    }
    try {
        chrome.webRequest.onBeforeRequest.addListener(
            detectPotentialBlock,
            { urls: ["<all_urls>"], types: ["main_frame", "sub_frame", "xmlhttprequest", "websocket", "image", "script", "other"] },
            []
        );
        isListenerAttached = true;
        console.log("Attached NON-BLOCKING webRequest listener for detection.");
    } catch (e) {
        console.error("Failed to attach non-blocking listener:", e);
    }
}

function removeNonBlockingListener() {
    if (!isListenerAttached) {
        return;
    }
    try {
        // Check if the listener actually exists before trying to remove
        if (chrome.webRequest.onBeforeRequest.hasListener(detectPotentialBlock)) {
             chrome.webRequest.onBeforeRequest.removeListener(detectPotentialBlock);
             isListenerAttached = false;
             console.log("Removed NON-BLOCKING webRequest listener.");
        } else {
             isListenerAttached = false; // Correct state if listener wasn't found
        }
    } catch (e) {
        console.error("Failed to remove non-blocking listener:", e);
         isListenerAttached = false; // Ensure state is false on error
    }
}


// --- Blocking Control ---
async function startBlocking() {
    await toggleBlocking(true);
    attachNonBlockingListener();
    await setItemInLocal("blocking_enabled", true);
    console.log("Blocking enabled (DNR + Detection Listener).");
}

async function stopBlocking() {
    await toggleBlocking(false);
    removeNonBlockingListener();
    await setItemInLocal("blocking_enabled", false);
    console.log("Blocking disabled (DNR + Detection Listener).");
}

async function isBlockingEnabled() {
    // Check storage first as the source of truth for user intent
    const storageState = await getItemFromLocal("blocking_enabled", true);

    // Also check if listener is attached (should match storageState)
    if (storageState !== isListenerAttached) {
         console.warn("Mismatch between storage blocking state and listener state:", {storageState, isListenerAttached});
         // Attempt to fix listener state based on storage
         if (storageState) attachNonBlockingListener(); else removeNonBlockingListener();
    }

    return storageState;
}


// --- Event Listeners ---

// Tab Update Listener (Reset counters on navigation)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tabInfo) => {
    // Check if the URL changed, ignore other updates (like loading status, favicons)
    // Also ignore about:blank, chrome:// etc.
    if (changeInfo.url && changeInfo.url.startsWith('http')) {
        await modifyItemInLocal("badges", {}, (currentBadges) => {
            if (currentBadges[tabId] && currentBadges[tabId].lastURL !== changeInfo.url) {
                // Reset specific tab's badge info
                currentBadges[tabId] = {
                    counter: 0,
                    portAlerted: false,
                    tmxAlerted: false,
                    lastURL: changeInfo.url
                };
            } else if (!currentBadges[tabId]) {
                // Initialize if tab wasn't tracked before
                 currentBadges[tabId] = { counter: 0, portAlerted: false, tmxAlerted: false, lastURL: changeInfo.url };
            }
            return currentBadges;
        });

        // Reset badge text for the tab
        try {
             await chrome.action.setBadgeText({ text: '', tabId: tabId });
        } catch (e) { /* Tab might be closed already */ }


        // Clear out the logged blocked ports/hosts for the tab
        await modifyItemInLocal("blocked_ports", {}, (blocked_ports_object) => {
            delete blocked_ports_object[tabId];
            return blocked_ports_object;
        });
        await modifyItemInLocal("blocked_hosts", {}, (blocked_hosts_object) => {
            delete blocked_hosts_object[tabId];
            return blocked_hosts_object;
        });
    }
});

// Tab Removed Listener (Cleanup data) - Optional but good practice
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
     await modifyItemInLocal("badges", {}, (currentBadges) => {
         delete currentBadges[tabId];
         return currentBadges;
     });
     await modifyItemInLocal("blocked_ports", {}, (blocked_ports_object) => {
         delete blocked_ports_object[tabId];
         return blocked_ports_object;
     });
     await modifyItemInLocal("blocked_hosts", {}, (blocked_hosts_object) => {
         delete blocked_hosts_object[tabId];
         return blocked_hosts_object;
     });
});


// Runtime Message Listener (from Popup/Options)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Basic origin check (less strict, relies on extension ID)
    if (!sender.url || !sender.url.startsWith(chrome.runtime.getURL(""))) {
        console.warn('Message from unexpected sender:', sender);
        return false;
    }

    if (message.type === 'popupInit') {
        (async () => {
            const listening = await isBlockingEnabled();
            const notifications = await getItemFromLocal("notificationsAllowed", true);
            sendResponse({ isListening: listening, notificationsAllowed: notifications });
        })();
        return true; // Indicate async response
    } else if (message.type === 'toggleEnabled') {
        (async () => {
            message.value ? await startBlocking() : await stopBlocking();
            sendResponse({ success: true });
        })();
        return true; // Indicate async response
    } else if (message.type === 'setNotificationsAllowed') {
         (async () => {
             await setItemInLocal("notificationsAllowed", message.value);
             sendResponse({ success: true });
         })();
         return true; // Indicate async response
    } else if (message.type === 'getItemFromLocal') {
         (async () => {
             const value = await getItemFromLocal(message.key, message.defaultValue);
             sendResponse(value);
         })();
         return true; // Indicate async response
    } else if (message.type === 'setItemInLocal') {
         (async () => {
            try {
                 await setItemInLocal(message.key, message.value);
                 sendResponse({ success: true });
            } catch (error) {
                 console.error(`Error setting item via message for key ${message.key}:`, error);
                 sendResponse({ success: false, error: error.message });
            }
         })();
         return true; // Indicate async response
    }
     else {
        console.warn('Port Authority: unknown message type: ', message.type);
        return false; // No async response intended
    }
});