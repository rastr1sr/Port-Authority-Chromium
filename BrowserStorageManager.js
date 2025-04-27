import { updateBadges, notifyThreatMetrix, notifyPortScanning } from "./browserActions.js";
import { getPortForProtocol } from "./constants.js";

const STORAGE_LOCK_KEY = "port_authority_storage_lock";

const ALLOWLIST_RULE_ID_START = 10000;
const ALLOWLIST_RULE_STORAGE_KEY = "allowlistRuleIds";

async function UNLOCKED_getItemFromLocal(key, default_value) {
    let storage_value;
    try {
        storage_value = await chrome.storage.local.get(key);

        if (storage_value && key in storage_value) {
             try {
                 if (typeof storage_value[key] === 'string') {
                     if (storage_value[key].startsWith('{') || storage_value[key].startsWith('[')) {
                        return JSON.parse(storage_value[key]);
                     }
                 }
                 return storage_value[key];
             } catch (parseError) {
                 console.warn(`Failed to parse storage value for key [${key}], returning raw. Error:`, parseError, "Value:", storage_value[key]);
                 return storage_value[key];
             }
        } else {
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
    return navigator.locks.request(STORAGE_LOCK_KEY,
        { mode: "shared" },
        async (lock) => {
            const value = await UNLOCKED_getItemFromLocal(key, default_value);
            return value;
        }
    );
}

export async function setItemInLocal(key, value) {
    let valueToStore = value;
    if (typeof value === 'object' && value !== null) {
         try {
            valueToStore = JSON.stringify(value);
         } catch (e) {
             console.error("Could not stringify value for key", key, value, e);
             valueToStore = value;
         }
    } else if (value === undefined) {
        console.warn("Storing undefined value to key [" + key + "]");
    }

    return navigator.locks.request(STORAGE_LOCK_KEY, async (lock) => {
        try {
            await chrome.storage.local.set({ [key]: valueToStore });

            if (key === "allowed_domain_list") {
                await updateAllowlistRules(value);
            }
        } catch (error) {
            console.error("Error setting storage:", {[key]: valueToStore}, error);
            throw error;
        }
        return value;
    });
}


export async function modifyItemInLocal(key, default_value, mutate) {
    return navigator.locks.request(STORAGE_LOCK_KEY, async (lock) => {
        const initial_value = await UNLOCKED_getItemFromLocal(key, default_value);
        const new_value_raw = await mutate(initial_value);

        let new_value_to_store = new_value_raw;
         if (typeof new_value_raw === 'object' && new_value_raw !== null) {
             try {
                 new_value_to_store = JSON.stringify(new_value_raw);
             } catch (e) {
                console.error("Could not stringify modified value for key", key, new_value_raw, e);
                new_value_to_store = new_value_raw;
             }
         }

        try {
            await chrome.storage.local.set({ [key]: new_value_to_store });

             if (key === "allowed_domain_list") {
                await updateAllowlistRules(new_value_raw);
             }

        } catch (error) {
            console.error("Error updating storage value:", {[key]: new_value_to_store}, error);
            throw error;
        }

        return new_value_raw;
    });
}


function createAllowlistRules(allowedDomains, existingRuleIds) {
    const rules = [];
    allowedDomains.forEach((domain, index) => {
        if (typeof domain === 'string' && domain.trim().length > 0) {
             const ruleId = existingRuleIds[index] || (ALLOWLIST_RULE_ID_START + index);
            rules.push({
                id: ruleId,
                priority: 2, // Higher priority than blocking rules
                action: { type: "allow" },
                condition: {
                    initiatorDomains: [domain],
                    resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest", "websocket", "image", "script", "other"]
                 }
            });
        } else {
            console.warn("Skipping invalid domain in allowlist:", domain);
        }
    });
    return rules;
}

async function updateAllowlistRules(allowedDomains) {
    if (!Array.isArray(allowedDomains)) {
        console.error("Cannot update allowlist rules, provided value is not an array:", allowedDomains);
        return;
    }

    try {
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const ruleIdsToRemove = existingRules
            .filter(rule => rule.id >= ALLOWLIST_RULE_ID_START)
            .map(rule => rule.id);

        const storedRuleIds = await UNLOCKED_getItemFromLocal(ALLOWLIST_RULE_STORAGE_KEY, []);

        const newRules = createAllowlistRules(allowedDomains, storedRuleIds);
        const newRuleIds = newRules.map(rule => rule.id);

         await UNLOCKED_setItemInLocal(ALLOWLIST_RULE_STORAGE_KEY, newRuleIds);

        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: ruleIdsToRemove,
            addRules: newRules
        });

    } catch (error) {
        console.error("Failed to update DNR allowlist rules:", error);
    }
}

async function UNLOCKED_setItemInLocal(key, value) {
     let valueToStore = value;
     if (typeof value === 'object' && value !== null) {
          try { valueToStore = JSON.stringify(value); } catch (e) { console.error("stringify error during internal set", e); }
     }
     await chrome.storage.local.set({ [key]: valueToStore });
}


export async function clearItemsInLocal(default_structure = {}) {
     const default_structure_processed = Object.fromEntries(
        Object.entries(default_structure).map(([key, value]) => {
            let valueToStore = value;
            if (typeof value === 'object' && value !== null) {
                 try { valueToStore = JSON.stringify(value); } catch(e) { console.error("Stringify error during clearItemsInLocal", e); }
            }
            return [key, valueToStore];
        })
    );

    return navigator.locks.request(STORAGE_LOCK_KEY, async (lock) => {
        await chrome.storage.local.clear();
        await UNLOCKED_setItemInLocal(ALLOWLIST_RULE_STORAGE_KEY, []);
        await chrome.storage.local.set(default_structure_processed);

        if (default_structure && "allowed_domain_list" in default_structure) {
            await updateAllowlistRules(default_structure.allowed_domain_list);
        } else {
            await updateAllowlistRules([]);
        }
        if (default_structure && "blocking_enabled" in default_structure) {
             await toggleBlocking(default_structure.blocking_enabled);
        } else {
            await toggleBlocking(true);
        }

        return default_structure;
    });
}

export async function toggleBlocking(enable) {
     const rulesetId = "ruleset_1";
     try {
         if (enable) {
             await chrome.declarativeNetRequest.updateEnabledRulesets({
                 enableRulesetIds: [rulesetId]
             });
         } else {
             await chrome.declarativeNetRequest.updateEnabledRulesets({
                 disableRulesetIds: [rulesetId]
             });
         }
     } catch (error) {
         console.error(`Failed to ${enable ? 'enable' : 'disable'} DNR ruleset ${rulesetId}:`, error);
     }
}


export async function addBlockedPortToHost(url, tabIdString) {
    const tabId = parseInt(tabIdString);
    if (isNaN(tabId) || tabId < 0) return;

    const host = url.hostname;
    const port = "" + (url.port || getPortForProtocol(url.protocol) || 'unknown');

    return modifyItemInLocal("blocked_ports", {}, (blocked_ports_tabs) => {
        const tab_hosts = blocked_ports_tabs[tabId] || {};
        let hosts_ports = tab_hosts[host] || [];

        if (!Array.isArray(hosts_ports)) {
            console.warn(`Correcting non-array value for blocked_ports[${tabId}][${host}]`);
            hosts_ports = [];
        }

        if (hosts_ports.indexOf(port) === -1) {
            hosts_ports.push(port);
            tab_hosts[host] = hosts_ports;
            blocked_ports_tabs[tabId] = tab_hosts;
        }
        return blocked_ports_tabs;
    });
}

export async function addBlockedTrackingHost(url, tabIdString) {
    const tabId = parseInt(tabIdString);
     if (isNaN(tabId) || tabId < 0) return;

    const host = url.hostname;

    return modifyItemInLocal("blocked_hosts", {}, (blocked_hosts_tabs) => {
        let blocked_hosts = blocked_hosts_tabs[tabId] || [];

        if (!Array.isArray(blocked_hosts)) {
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

export async function increaseBadge(request, isThreatMetrix) {
    const tabId = request?.tabId;
    const originUrl = request?.originUrl;

    if (!request || typeof tabId !== 'number' || tabId < 0) return;

    return modifyItemInLocal("badges", {}, async (badges) => {
        if (!badges[tabId]) {
            badges[tabId] = { counter: 0, portAlerted: false, tmxAlerted: false, lastURL: null };
        }
        if (!badges[tabId].lastURL) {
             try {
                 const tabInfo = await chrome.tabs.get(tabId);
                 badges[tabId].lastURL = tabInfo.url;
             } catch (e) { /* Ignore if tab is closed */ }
         }

        badges[tabId].counter += 1;
        updateBadges(badges[tabId].counter, tabId);

        const notifications_enabled = await UNLOCKED_getItemFromLocal("notificationsAllowed", true);
        const alertType = isThreatMetrix ? 'tmxAlerted' : 'portAlerted';

        if (notifications_enabled && !badges[tabId][alertType]) {
            badges[tabId][alertType] = true;

            let initiatingHost = "this site";
            try {
                if (originUrl) initiatingHost = new URL(originUrl).hostname;
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