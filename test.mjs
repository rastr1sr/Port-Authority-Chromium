// Run: node test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isPrivateHost } from "./constants.js";

for (const host of [
    "localhost", "localhost.", "LoCALhOst", "0.0.0.0", "::1",
    "127.0.0.1", "127.255.255.255",
    "10.0.0.1", "10.255.22.33",
    "172.16.0.1", "172.17.100.155", "172.031.33.33", "172.31.255.255",
    "192.168.1.1", "192.168.1.255",
    "169.254.1.0"
]) assert.equal(isPrivateHost(host), true, `expected private: ${host}`);

for (const host of [
    "example.com", "online-metrix.net", "notlocalhost",
    "8.8.8.8", "1.1.1.1",
    "172.15.0.1", "172.32.0.1", "172.100.0.1",
    "192.169.1.1", "169.253.1.1",
    "10.0.0.256", "127.0.0", "127.0.0.1.example.com"
]) assert.equal(isPrivateHost(host), false, `expected public: ${host}`);

console.log("isPrivateHost: ok");

// Same ranges, two languages; fail if either drifts.

const rules = JSON.parse(readFileSync(new URL("./rules.json", import.meta.url)));

function sampleHost(urlFilter) {
    const octets = urlFilter.replace(/^\|\|/, "").replace(/\.\*$/, "").split(".");
    while (octets.length < 4) octets.push("1");
    return octets.join(".");
}

const ipFilters = rules
    .filter((rule) => rule.action.type === "block" && rule.condition.urlFilter)
    .map((rule) => rule.condition.urlFilter);

assert.ok(ipFilters.length > 0, "rules.json has no urlFilter block rules");

for (const urlFilter of ipFilters) {
    const host = sampleHost(urlFilter);
    assert.equal(isPrivateHost(host), true,
        `rules.json blocks ${urlFilter} but isPrivateHost("${host}") is false`);
}

assert.ok(
    rules.some((rule) => rule.condition.requestDomains?.includes("localhost")),
    "rules.json no longer blocks localhost"
);

// Reverse direction.
for (const [label, host] of [
    ["127.0.0.0/8", "127.0.0.1"],
    ["10.0.0.0/8", "10.0.0.1"],
    ["172.16.0.0/12", "172.16.0.1"],
    ["172.16.0.0/12 (top)", "172.31.0.1"],
    ["192.168.0.0/16", "192.168.0.1"],
    ["169.254.0.0/16", "169.254.0.1"],
    ["0.0.0.0", "0.0.0.0"]
]) {
    assert.equal(isPrivateHost(host), true, `${label} sample is not private`);
    assert.ok(
        ipFilters.some((f) => host.startsWith(f.replace(/^\|\|/, "").replace(/\.\*$/, ""))),
        `isPrivateHost blocks ${label} but rules.json has no rule for it`
    );
}

console.log(`rules.json agreement: ok (${ipFilters.length} IP rules)`);

// getter-only in node.
Object.defineProperty(globalThis, "navigator", {
    value: { locks: { request: (_name, fn) => fn() } },
    configurable: true
});

const store = {
    allowed_domain_list: '["example.com","test.org"]',
    blocked_ports: '{"7":{"127.0.0.1":["80"]}}',
    allowlistRuleIds: "[10000,10001]",
    blocking_enabled: true,
    notificationsAllowed: false,
    some_plain_string: "not json",
    broken_json: "{oops"
};

globalThis.chrome = {
    storage: {
        local: {
            get: async (key) => (key === null ? { ...store } : (key in store ? { [key]: store[key] } : {})),
            set: async (obj) => { Object.assign(store, obj); },
            remove: async (key) => { delete store[key]; }
        }
    }
};

const { migrateStringifiedStorage } = await import("./BrowserStorageManager.js");

// broken_json is deliberate.
console.warn = () => {};

await migrateStringifiedStorage();

assert.deepEqual(store.allowed_domain_list, ["example.com", "test.org"]);
assert.deepEqual(store.blocked_ports, { 7: { "127.0.0.1": ["80"] } });
assert.equal(store.blocking_enabled, true);
assert.equal(store.notificationsAllowed, false);
assert.equal(store.some_plain_string, "not json");
assert.equal(store.broken_json, "{oops", "unparseable values are left alone");
assert.ok(!("allowlistRuleIds" in store), "stale allowlistRuleIds key not removed");

// Idempotent.
const snapshot = JSON.stringify(store);
await migrateStringifiedStorage();
assert.equal(JSON.stringify(store), snapshot, "migration is not idempotent");

console.log("migrateStringifiedStorage: ok");


const { installDOM, serialize } = await import("./dom-stub.mjs");

function fakeStorage(data) {
    globalThis.chrome = {
        storage: {
            local: {
                get: async (key) => (key in data ? { [key]: data[key] } : {}),
                set: async () => {},
                remove: async () => {}
            }
        },
        tabs: { query: async () => [{ id: 7 }] }
    };
}

const dom = installDOM();
fakeStorage({
    blocked_hosts: { 7: ["h.online-metrix.net", "tmx.bestbuy.com"] },
    blocked_ports: { 7: { "192.168.1.1": ["80", "443"], "127.0.0.1": ["8080"] } }
});

const { buildDataMarkup } = await import("./popup/PopupUI.js");
const popupContainer = dom.element("blocked_data_display");

popupContainer.replaceChildren();
await buildDataMarkup();

assert.equal(serialize(popupContainer), [
    "div",
    "  section.section",
    "    h5.bold[Blocked Tracking Scripts:]",
    "    ul.host-list",
    "      li.brand-text-color.bold[h.online-metrix.net]",
    "      li.brand-text-color.bold[tmx.bestbuy.com]",
    "  section.section",
    "    h5.bold[Blocked Port Scans:]",
    "    details",
    "      summary.bold[192.168.1.1]",
    "      div.port[:80]",
    "      div.port[:443]",
    "    details",
    "      summary.bold[127.0.0.1]",
    "      div.port[:8080]"
].join("\n"));

fakeStorage({ blocked_hosts: {}, blocked_ports: {} });
popupContainer.replaceChildren();
await buildDataMarkup();
assert.equal(serialize(popupContainer),
    "div\n  p.muted[Nothing blocked on this tab.]");

console.log("popup render: ok");

fakeStorage({ allowed_domain_list: ["a.example.com", "b.example.org"] });
const { load_allowed_domains } = await import("./settings/settings.js");
const domainList = dom.element("allowedDomainsListID");

await load_allowed_domains();
assert.equal(serialize(domainList), [
    "div",
    "  li",
    "    span[a.example.com]",
    "    button[Remove]",
    "  li",
    "    span[b.example.org]",
    "    button[Remove]"
].join("\n"));
assert.equal(domainList.children[0].children[1].attributes["aria-label"],
    "Remove a.example.com from allowlist", "remove button lost its accessible name");

fakeStorage({ allowed_domain_list: [] });
await load_allowed_domains();
assert.equal(serialize(domainList), "div\n  li[No domains allowlisted.]");

console.log("settings render: ok");
