import { updateBadges, notifyThreatMetrix, notifyPortScanning } from "./browserActions.js";
import { RESOURCE_TYPES } from "./constants.js";

const STORAGE_LOCK_KEY = "port_authority_storage_lock";
const ALLOWLIST_RULE_ID_START = 10000;

// webRequest only delivers these.
const DEFAULT_PORTS = { "http:": 80, "ws:": 80, "https:": 443, "wss:": 443 };

export async function getItemFromLocal(key, default_value) {
    try {
        const stored = await chrome.storage.local.get(key);
        return key in stored ? stored[key] : default_value;
    } catch (error) {
        console.error(`read ${key}:`, error);
        return default_value;
    }
}

// Caller holds the lock.
async function commit(key, value) {
    await chrome.storage.local.set({ [key]: value });

    if (key === "allowed_domain_list") {
        await updateAllowlistRules(value);
    }
    return value;
}

export function setItemInLocal(key, value) {
    return navigator.locks.request(STORAGE_LOCK_KEY, () => commit(key, value));
}

export function modifyItemInLocal(key, default_value, mutate) {
    return navigator.locks.request(STORAGE_LOCK_KEY, async () =>
        commit(key, await mutate(await getItemFromLocal(key, default_value)))
    );
}

// <=1.0.0 stored JSON strings and rule ids.
export function migrateStringifiedStorage() {
    // Without the lock, in-flight requests lose their writes.
    return navigator.locks.request(STORAGE_LOCK_KEY, async () => {
        const stored = await chrome.storage.local.get(null);
        const parsed = {};

        for (const [key, value] of Object.entries(stored)) {
            if (typeof value === "string" && (value.startsWith("{") || value.startsWith("["))) {
                try {
                    parsed[key] = JSON.parse(value);
                } catch (e) {
                    console.warn(`kept unparseable ${key}`, e);
                }
            }
        }

        if (Object.keys(parsed).length > 0) await chrome.storage.local.set(parsed);
        await chrome.storage.local.remove("allowlistRuleIds");
    });
}

async function updateAllowlistRules(allowedDomains) {
    const domains = (allowedDomains ?? []).filter(
        (domain) => typeof domain === "string" && domain.trim().length > 0
    );

    try {
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: existingRules
                .filter((rule) => rule.id >= ALLOWLIST_RULE_ID_START)
                .map((rule) => rule.id),
            addRules: domains.map((domain, index) => ({
                id: ALLOWLIST_RULE_ID_START + index,
                priority: 2, // beats rules.json
                action: { type: "allow" },
                condition: { initiatorDomains: [domain], resourceTypes: RESOURCE_TYPES }
            }))
        });
    } catch (error) {
        console.error("allowlist rules:", error);
    }
}

export async function toggleBlocking(enable) {
    const rulesets = enable
        ? { enableRulesetIds: ["ruleset_1"] }
        : { disableRulesetIds: ["ruleset_1"] };
    try {
        await chrome.declarativeNetRequest.updateEnabledRulesets(rulesets);
    } catch (error) {
        console.error(`ruleset ${enable ? "on" : "off"}:`, error);
    }
}

export async function addBlockedPortToHost(url, tabId) {
    const host = url.hostname;
    const port = "" + (url.port || DEFAULT_PORTS[url.protocol.toLowerCase()] || "unknown");

    return modifyItemInLocal("blocked_ports", {}, (blocked_ports_tabs) => {
        const tab_hosts = blocked_ports_tabs[tabId] ?? {};
        const hosts_ports = tab_hosts[host] ?? [];

        if (!hosts_ports.includes(port)) {
            hosts_ports.push(port);
            tab_hosts[host] = hosts_ports;
            blocked_ports_tabs[tabId] = tab_hosts;
        }
        return blocked_ports_tabs;
    });
}

export async function addBlockedTrackingHost(url, tabId) {
    const host = url.hostname;

    return modifyItemInLocal("blocked_hosts", {}, (blocked_hosts_tabs) => {
        const blocked_hosts = blocked_hosts_tabs[tabId] ?? [];

        if (!blocked_hosts.includes(host)) {
            blocked_hosts.push(host);
        }
        blocked_hosts_tabs[tabId] = blocked_hosts;
        return blocked_hosts_tabs;
    });
}

export async function increaseBadge(request, isThreatMetrix) {
    const tabId = request.tabId;

    return modifyItemInLocal("badges", {}, async (badges) => {
        badges[tabId] ??= { counter: 0, portAlerted: false, tmxAlerted: false };
        badges[tabId].counter += 1;
        updateBadges(badges[tabId].counter, tabId);

        const notifications_enabled = await getItemFromLocal("notificationsAllowed", true);
        const alertType = isThreatMetrix ? "tmxAlerted" : "portAlerted";

        if (notifications_enabled && !badges[tabId][alertType]) {
            badges[tabId][alertType] = true;

            let initiatingHost = "this site";
            try {
                if (request.originUrl) initiatingHost = new URL(request.originUrl).hostname;
            } catch (e) { /* keep "this site" */ }

            if (isThreatMetrix) {
                notifyThreatMetrix(initiatingHost);
            } else {
                notifyPortScanning(initiatingHost);
            }
        }
        return badges;
    });
}
