import { updateBadges, notifyThreatMetrix, notifyPortScanning } from "./browseraction.js";
import { getPortForProtocol } from "./constants.js";

const STORAGE_LOCK_KEY = "port_authority_storage_lock";

// Store dynamic rule IDs for allowlist
const ALLOWLIST_RULE_ID_START = 10000;
const ALLOWLIST_RULE_STORAGE_KEY = "allowlistRuleIds";

/**
 * @private
 * Read from storage without locking. Use with caution.
 */
async function UNLOCKED_getItemFromLocal(key, default_value) {
    let storage_value;
    try {
        storage_value = await chrome.storage.local.get(key);

        if (storage_value && key in storage_value) {
             // Check if the value is already an object/primitive or needs parsing
             // MV3 storage often returns the actual object directly
             try {
                 // Attempt to parse only if it looks like a JSON string
                 if (typeof storage_value[key] === 'string') {
                    // Avoid parsing 'true', 'false', numbers etc if they were stored as strings originally
                    // A simple heuristic: check for braces or brackets
                     if (storage_value[key].startsWith('{') || storage_value[key].startsWith('[')) {
                        return JSON.parse(storage_value[key]);
                     }
                 }
                 return storage_value[key]; // Return directly if not a complex JSON string
             } catch (parseError) {
                 console.warn(`Failed to parse storage value for key [${key}], returning raw. Error:`, parseError, "Value:", storage_value[key]);
                 return storage_value[key]; // Return raw value on parse error
             }
        } else {
            // Key not found, return default
             if (default_value !== undefined) {
                console.warn("No value found for [" + key + "], using provided default: ", {
                    [key]: default_value
                });
             }
            return default_value;
        }
    } catch (error) {
        console.error("Error getting storage value [" + key + "]: ", {
            error,
            default_value,
            storage_value
        });
        return default_value;
    }
}

export async function getItemFromLocal(key, default_value) {
    // Locking mechanism remains the same
    return navigator.locks.request(STORAGE_LOCK_KEY,
        { mode: "shared" },
        async (lock) => {
            const value = await UNLOCKED_getItemFromLocal(key, default_value);
            // console.debug("Reading storage:", {[key]: value}); // Reduce log noise
            return value;
        }
    );
}

export async function setItemInLocal(key, value) {
    // Don't stringify simple types unnecessarily, but complex objects should be
    let valueToStore = value;
    if (typeof value === 'object' && value !== null) {
         try {
            valueToStore = JSON.stringify(value);
         } catch (e) {
             console.error("Could not stringify value for key", key, value, e);
             // Decide how to handle error: maybe store as is, maybe throw
             valueToStore = value; // Store as is if stringify fails
         }
    } else if (value === undefined) {
        console.warn("Storing undefined value to key [" + key + "]");
        // Storing undefined might remove the key, depending on storage implementation.
        // Explicitly remove or store null instead? For now, let it try.
    }


    return navigator.locks.request(STORAGE_LOCK_KEY, async (lock) => {
        try {
            await chrome.storage.local.set({ [key]: valueToStore });
            // console.debug("Setting storage:", {[key]: value}); // Reduce log noise

            // If updating the allowlist, update DNR rules
            if (key === "allowed_domain_list") {
                await updateAllowlistRules(value); // value here is the new list of domains
            }
        } catch (error) {
            console.error("Error setting storage:", {[key]: valueToStore}, error);
            // Re-throw or handle error appropriately
            throw error; // Re-throw to indicate failure
        }
        return value; // Return the original value passed
    });
}


export async function modifyItemInLocal(key, default_value, mutate) {
    return navigator.locks.request(STORAGE_LOCK_KEY, async (lock) => {
        const initial_value = await UNLOCKED_getItemFromLocal(key, default_value);
        const new_value_raw = await mutate(initial_value);

        // Stringify if it's an object
        let new_value_to_store = new_value_raw;
         if (typeof new_value_raw === 'object' && new_value_raw !== null) {
             try {
                 new_value_to_store = JSON.stringify(new_value_raw);
             } catch (e) {
                console.error("Could not stringify modified value for key", key, new_value_raw, e);
                new_value_to_store = new_value_raw; // Store as is if fails
             }
         }

        try {
            await chrome.storage.local.set({ [key]: new_value_to_store });
            // console.debug("Updating storage value: ", key, { // Reduce log noise
            //     ["old " + key]: initial_value,
            //     ["new " + key]: new_value_raw
            // });

             // If updating the allowlist, update DNR rules
             if (key === "allowed_domain_list") {
                await updateAllowlistRules(new_value_raw); // pass the actual list
             }

        } catch (error) {
            console.error("Error updating storage value:", {[key]: new_value_to_store}, error);
            throw error;
        }

        return new_value_raw; // Return the value *after* mutation but *before* stringification
    });
}

// --- DNR Allowlist Rule Management ---

// Function to generate DNR rules for the allowlist
function createAllowlistRules(allowedDomains, existingRuleIds) {
    const rules = [];
    allowedDomains.forEach((domain, index) => {
        // Ensure domain is valid before creating a rule
        if (typeof domain === 'string' && domain.trim().length > 0) {
             // Reuse existing IDs or generate new ones
             const ruleId = existingRuleIds[index] || (ALLOWLIST_RULE_ID_START + index);
            rules.push({
                id: ruleId,
                priority: 2, // Higher priority than blocking rules
                action: { type: "allow" },
                condition: {
                    // Allow requests *initiated by* these domains to go anywhere
                    // This is slightly different from the original logic which checked destination
                    // but more aligned with common allowlist use cases.
                    // Adjust if the goal was to allow requests *to* private IPs *from* whitelisted domains.
                    initiatorDomains: [domain],
                    resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest", "websocket", "image", "script", "other"]
                 }
                 // --- Alternative Condition (if you want to allow *access to* local resources *from* allowlisted sites) ---
                 // condition: {
                 //   initiatorDomains: [domain],
                 //   requestDomains: ["localhost", /* other private IPs/domains if needed */],
                 //   urlFilter: "|http*://192.168.*", // Example for IPs
                 //   resourceTypes: [...]
                 // }
                 // This alternative is more complex to manage. Stick with initiatorDomains unless specifically needed.
            });
        } else {
            console.warn("Skipping invalid domain in allowlist:", domain);
        }
    });
    return rules;
}

// Function to update dynamic DNR rules based on the allowlist
async function updateAllowlistRules(allowedDomains) {
    if (!Array.isArray(allowedDomains)) {
        console.error("Cannot update allowlist rules, provided value is not an array:", allowedDomains);
        return;
    }
    console.log("Updating DNR allowlist rules for domains:", allowedDomains);

    try {
        // Get existing dynamic rules to find IDs to remove
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const ruleIdsToRemove = existingRules
            .filter(rule => rule.id >= ALLOWLIST_RULE_ID_START)
            .map(rule => rule.id);

        // Get stored rule IDs to attempt reuse (helps maintain stable IDs if list order changes slightly)
        const storedRuleIds = await UNLOCKED_getItemFromLocal(ALLOWLIST_RULE_STORAGE_KEY, []);

        // Create new rules
        const newRules = createAllowlistRules(allowedDomains, storedRuleIds);
        const newRuleIds = newRules.map(rule => rule.id);

         // Store the new IDs
         await UNLOCKED_setItemInLocal(ALLOWLIST_RULE_STORAGE_KEY, newRuleIds); // Use internal setter

        // Update DNR
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: ruleIdsToRemove,
            addRules: newRules
        });
        console.log("Successfully updated DNR allowlist rules.");

    } catch (error) {
        console.error("Failed to update DNR allowlist rules:", error);
         // Consider notifying the user or logging more details
    }
}

// Internal function to set storage without triggering rule updates recursively
async function UNLOCKED_setItemInLocal(key, value) {
     let valueToStore = value;
     if (typeof value === 'object' && value !== null) {
          try { valueToStore = JSON.stringify(value); } catch (e) { console.error("stringify error", e); }
     }
     await chrome.storage.local.set({ [key]: valueToStore });
     // console.debug("Internal set storage:", {[key]: value});
}


// --- Original Functions adapted ---


export async function clearItemsInLocal(default_structure = {}) {
    // Stringify only complex objects within the structure
     const default_structure_processed = Object.fromEntries(
        Object.entries(default_structure).map(([key, value]) => {
            let valueToStore = value;
            if (typeof value === 'object' && value !== null) {
                 try { valueToStore = JSON.stringify(value); } catch(e) { console.error("Stringify error", e); }
            }
            return [key, valueToStore];
        })
    );

    console.debug("Clearing local storage with default values:", {
        passed: default_structure,
        processed: default_structure_processed
    })

    return navigator.locks.request(STORAGE_LOCK_KEY, async (lock) => {
        await chrome.storage.local.clear();
        // Clear stored allowlist rule IDs as well
        await UNLOCKED_setItemInLocal(ALLOWLIST_RULE_STORAGE_KEY, []);

        await chrome.storage.local.set(default_structure_processed);

        // Re-apply DNR rules based on defaults
        if (default_structure && "allowed_domain_list" in default_structure) {
            await updateAllowlistRules(default_structure.allowed_domain_list);
        } else {
            await updateAllowlistRules([]); // Clear DNR rules if no default list
        }
        if (default_structure && "blocking_enabled" in default_structure) {
             await toggleBlocking(default_structure.blocking_enabled); // Update DNR enabled state
        } else {
            await toggleBlocking(true); // Enable by default if not specified
        }


        return default_structure;
    });
}

// Helper function to enable/disable the main static ruleset
export async function toggleBlocking(enable) {
     const rulesetId = "ruleset_1"; // Matches the ID in manifest.json
     try {
         if (enable) {
             await chrome.declarativeNetRequest.updateEnabledRulesets({
                 enableRulesetIds: [rulesetId]
             });
             console.log("DNR ruleset enabled:", rulesetId);
         } else {
             await chrome.declarativeNetRequest.updateEnabledRulesets({
                 disableRulesetIds: [rulesetId]
             });
             console.log("DNR ruleset disabled:", rulesetId);
         }
     } catch (error) {
         console.error(`Failed to ${enable ? 'enable' : 'disable'} DNR ruleset ${rulesetId}:`, error);
     }
}


/**
 * Records the *attempted* port scan (called from non-blocking listener).
 * The actual block is handled by DNR.
 */
export async function addBlockedPortToHost(url, tabIdString) {
    // This function now primarily serves logging/UI purposes
    const tabId = parseInt(tabIdString);
    if (isNaN(tabId) || tabId < 0) return; // Ignore invalid tab IDs

    const host = url.hostname; // Use hostname for better IPv6 handling
    const port = "" + (url.port || getPortForProtocol(url.protocol) || 'unknown'); // Handle missing port

    return modifyItemInLocal("blocked_ports", {}, (blocked_ports_tabs) => {
        const tab_hosts = blocked_ports_tabs[tabId] || {};
        let hosts_ports = tab_hosts[host] || []; // Initialize as empty array

        if (!Array.isArray(hosts_ports)) { // Ensure it's an array
            console.warn(`Correcting non-array value for blocked_ports[${tabId}][${host}]`);
            hosts_ports = [];
        }

        if (hosts_ports.indexOf(port) === -1) {
            hosts_ports.push(port); // Use push for simplicity
            tab_hosts[host] = hosts_ports;
            blocked_ports_tabs[tabId] = tab_hosts;
        }
        return blocked_ports_tabs;
    });
}

/**
 * Records the *attempted* tracking script load (called from non-blocking listener).
 * The actual block is handled by DNR.
 */
export async function addBlockedTrackingHost(url, tabIdString) {
     // This function now primarily serves logging/UI purposes
    const tabId = parseInt(tabIdString);
     if (isNaN(tabId) || tabId < 0) return; // Ignore invalid tab IDs

    const host = url.hostname; // Use hostname

    return modifyItemInLocal("blocked_hosts", {}, (blocked_hosts_tabs) => {
        let blocked_hosts = blocked_hosts_tabs[tabId] || [];

        if (!Array.isArray(blocked_hosts)) { // Ensure it's an array
            console.warn(`Correcting non-array value for blocked_hosts[${tabId}]`);
            blocked_hosts = [];
        }

        if (blocked_hosts.indexOf(host) === -1) {
            blocked_hosts.push(host);
        }
        blocked_hosts_tabs[tabId] = blocked_hosts;
        return blocked_hosts_tabs;
    });
}

/**
 * Increases the badge count when a potential block is detected by the non-blocking listener.
 */
export async function increaseBadge(request, isThreatMetrix) {
    const tabId = request?.tabId;
    const url = request?.url;
    const originUrl = request?.originUrl; // Use this for notification context

    if (!request || typeof tabId !== 'number' || tabId < 0) {
        // console.warn('Invalid `request` passed to increaseBadge:', {request, isThreatMetrix});
        return; // Ignore invalid requests (e.g., from browser's internal processes tabId=-1)
    };

    return modifyItemInLocal("badges", {}, async (badges) => {
        if (!badges[tabId]) {
            badges[tabId] = { counter: 0, alerted: 0, lastURL: null }; // Init with null lastURL
        }
        // Associate with the *current* URL of the tab if lastURL isn't set yet
        if (!badges[tabId].lastURL) {
             try {
                 const tabInfo = await chrome.tabs.get(tabId);
                 badges[tabId].lastURL = tabInfo.url;
             } catch (e) {
                 console.warn("Could not get tab info for badge init:", tabId, e);
                 // Proceed without lastURL if tab is gone
             }
         }


        badges[tabId].counter += 1;

        updateBadges(badges[tabId].counter, tabId); // Update UI

        const notifications_enabled = await UNLOCKED_getItemFromLocal("notificationsAllowed", true);
        // Only notify once per type per page load/tab session
        const alertType = isThreatMetrix ? 'tmxAlerted' : 'portAlerted';
        if (notifications_enabled && !badges[tabId][alertType]) {
            badges[tabId][alertType] = true; // Mark as alerted for this type

            let initiatingHost = "this site";
            try {
                if (originUrl) {
                    initiatingHost = new URL(originUrl).hostname;
                }
            } catch (e) { /* Use default */ }

            if (isThreatMetrix) {
                notifyThreatMetrix(initiatingHost);
            } else {
                notifyPortScanning(initiatingHost);
            }
        }

        return badges;
    });
}