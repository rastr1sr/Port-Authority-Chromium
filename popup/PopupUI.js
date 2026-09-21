import { getItemFromLocal } from "../BrowserStorageManager.js";

function buildSection(title) {
    const section = document.createElement("section");
    section.className = "section";

    const header = document.createElement("h5");
    header.className = "bold";
    header.textContent = title;
    section.appendChild(header);

    return section;
}

function renderBlockedHosts(container, hosts) {
    if (hosts.length === 0) return;

    const section = buildSection("Blocked Tracking Scripts:");
    const list = document.createElement("ul");
    list.className = "host-list";

    for (const host of hosts) {
        const item = document.createElement("li");
        item.className = "brand-text-color bold";
        item.textContent = host;
        list.appendChild(item);
    }

    section.appendChild(list);
    container.appendChild(section);
}

function renderBlockedPorts(container, blocked_ports) {
    const hosts = Object.keys(blocked_ports);
    if (hosts.length === 0) return;

    const section = buildSection("Blocked Port Scans:");

    for (const host of hosts) {
        const details = document.createElement("details");

        const summary = document.createElement("summary");
        summary.className = "bold";
        summary.textContent = host;
        details.appendChild(summary);

        for (const port of blocked_ports[host]) {
            const port_element = document.createElement("div");
            port_element.className = "port";
            port_element.textContent = `:${port}`;
            details.appendChild(port_element);
        }

        section.appendChild(details);
    }

    container.appendChild(section);
}

function showMessage(container, className, text) {
    const message = document.createElement("p");
    message.className = className;
    message.textContent = text;
    container.appendChild(message);
}

export async function buildDataMarkup() {
    const container = document.getElementById("blocked_data_display");

    try {
        const [tab] = await chrome.tabs.query({ currentWindow: true, active: true });
        if (!tab?.id) {
            showMessage(container, "muted", "No active tab.");
            return;
        }

        const [blocked_hosts, blocked_ports] = await Promise.all([
            getItemFromLocal("blocked_hosts", {}),
            getItemFromLocal("blocked_ports", {})
        ]);

        renderBlockedHosts(container, blocked_hosts[tab.id] ?? []);
        renderBlockedPorts(container, blocked_ports[tab.id] ?? {});

        if (container.children.length === 0) {
            showMessage(container, "muted", "Nothing blocked on this tab.");
        }
    } catch (error) {
        console.error("render:", error);
        container.replaceChildren();
        showMessage(container, "error", "Could not load. Reopen the popup.");
    }
}

buildDataMarkup();
