import { getItemFromLocal } from "../BrowserStorageManager.js";


const SECTION_HEADER_ELEMENT = "h5";

/**
 * Applies an object of variable_name: variable_value as attributes to a provided DOM element.
 *
 * @param {HTMLElement} element The element to add data attributes to
 * @param {object} attributes An object of all values to add
 */
const setAttributesOnElement = (element, attributes) => {
    const attribute_names = Object.keys(attributes);
    for (let i = 0; i < attribute_names.length; i++) {
        const attribute = attribute_names[i];
        element.setAttribute(attribute, attributes[attribute]);
    }
};

function buildSectionWrapper() {
    const section_wrapper = document.createElement("div");
    section_wrapper.classList.add("col-12", "d-flex", "flex-column", "mb-3"); // Added margin bottom
    return section_wrapper;
}

/**
 * Generates markup for a bootstrap collapse element.
 * The collapse has a title with a btn-link on the opposite side
 * <div>
 *  <div class="d-flex justify-content-between">
 *      <h6>collapse_title</h5>
 *      <button>toggle_text</button>
 *  </div>
 * </div>
 *
 * @param {string} data_target ID of the collapse element used for the toggles data target.
 * @param {string} collapse_title Title of the collapse element
 * @param {string} toggle_text Text for the toggle button
 * @returns {HTMLElement} A collapse Wrapper with a button to toggle the collapse
 */
function buildCollapseWrapperAndToggle(
    data_target,
    collapse_title,
    toggle_text
) {
    const collapse_wrapper = document.createElement("div");
    const title_toggle_wrapper = document.createElement("div");

    title_toggle_wrapper.classList.add(
        "d-flex",
        "justify-content-between",
        "align-items-center",
        "mb-1" // Add some space below title/toggle row
    );

    const title_element = document.createElement("h6");
    title_element.innerText = collapse_title;
    title_element.classList.add("bold-text", "mb-0"); // remove default margin
    title_toggle_wrapper.appendChild(title_element);

    const collapse_toggle_button = document.createElement("button");
    collapse_toggle_button.innerText = toggle_text;
    // Updated for Bootstrap 5 data attributes
    const collapse_attributes = {
        type: "button",
        class: "btn btn-link btn-sm p-0", // Make button smaller and remove padding
        "data-bs-toggle": "collapse", // Use data-bs-toggle
        "data-bs-target": `#${data_target}`, // Use data-bs-target
        "aria-expanded": "false",
        "aria-controls": data_target,
        style: "text-decoration: none;" // Remove underline from link button
    };
    setAttributesOnElement(collapse_toggle_button, collapse_attributes);
    title_toggle_wrapper.appendChild(collapse_toggle_button);

    collapse_wrapper.appendChild(title_toggle_wrapper);

    return collapse_wrapper;
}

/**
 * Displays a list of blocked ports in the popup UI.
 * Data is re-rendered each time the popup is opened.
 */
async function updateBlockedPortsDisplay(blocked_data_display) {
    let currentTab;
    try {
        let querying = await chrome.tabs.query({
            currentWindow: true,
            active: true,
        });
        if (!querying || querying.length === 0 || !querying[0].id) {
             console.warn("Could not get active tab ID.");
             const noTabMsg = document.createElement('p');
             noTabMsg.textContent = "No active tab found to display block info.";
             noTabMsg.classList.add('text-muted', 'small', 'col-12');
             blocked_data_display.appendChild(noTabMsg);
             return;
        }
        currentTab = querying[0];

    } catch (error) {
        console.error("Error querying tabs:", error);
        const errorMsg = document.createElement('p');
        errorMsg.textContent = "Error retrieving tab information.";
        errorMsg.classList.add('text-danger', 'small', 'col-12');
        blocked_data_display.appendChild(errorMsg);
        return;
    }

    const tabId = currentTab.id;

    const blocked_ports_tabs = await getItemFromLocal("blocked_ports", {});

    if (!blocked_ports_tabs || Object.keys(blocked_ports_tabs).length === 0) {
        console.log("No blocked port data found in storage.");
        return;
    }

    const blocked_ports = blocked_ports_tabs[tabId] || {};
    const hosts = Object.keys(blocked_ports);

    if (hosts.length === 0) {
        console.log(`No blocked ports found for tab ${tabId}.`);
        return;
    }

    const all_ports_wrapper = buildSectionWrapper();
    const all_ports_header = document.createElement(SECTION_HEADER_ELEMENT);
    all_ports_header.innerText = "Blocked Port Scans:";
    all_ports_header.classList.add("bold-text");
    all_ports_wrapper.appendChild(all_ports_header);

    for (let i_host = 0; i_host < hosts.length; i_host++) {
        const host = hosts[i_host];
        const host_id = `collapse-ports-${tabId}-${i_host}`;
        const host_wrapper = buildCollapseWrapperAndToggle(
            host_id,
            host,
            "View Ports"
        );

        const hosts_ul = document.createElement("div");
        hosts_ul.id = host_id;
        hosts_ul.classList.add("collapse");

        const ports = blocked_ports[host] || []; // Safely access ports

        if (!Array.isArray(ports)) {
            console.warn(`Ports data for host ${host} is not an array:`, ports);
            continue; // Skip this host if data is malformed
        }

        for (let i_port = 0; i_port < ports.length; i_port++) {
            const port = ports[i_port];
            const port_element = document.createElement("div");
            port_element.innerText = `:${port}`;
            port_element.classList.add("ps-3", "small"); // Indent and make text smaller
            hosts_ul.appendChild(port_element);
        }

        host_wrapper.appendChild(hosts_ul);
        all_ports_wrapper.appendChild(host_wrapper);
    }

    blocked_data_display.appendChild(all_ports_wrapper);
}


async function updateBlockedHostsDisplay(blocked_data_display) {
     let currentTab;
     try {
         let querying = await chrome.tabs.query({
             currentWindow: true,
             active: true,
         });
         if (!querying || querying.length === 0 || !querying[0].id) {
              console.warn("Could not get active tab ID for blocked hosts.");
              return;
         }
         currentTab = querying[0];
     } catch (error) {
         console.error("Error querying tabs:", error);
         return;
     }

    const tabId = currentTab.id;

    const blocked_hosts_tabs = await getItemFromLocal("blocked_hosts", {});

     if (!blocked_hosts_tabs || Object.keys(blocked_hosts_tabs).length === 0) {
         console.log("No blocked tracking host data found in storage.");
         return;
     }

    const blocked_hosts = blocked_hosts_tabs[tabId] || [];

    if (blocked_hosts.length === 0) {
        console.log(`No blocked tracking hosts found for tab ${tabId}.`);
        return;
    }

    const hosts_wrapper = buildSectionWrapper();
    const host_header = document.createElement(SECTION_HEADER_ELEMENT);
    host_header.innerText = "Blocked Tracking Scripts:";
    host_header.classList.add("bold-text");
    hosts_wrapper.appendChild(host_header);

    const hosts_ul = document.createElement("ul");
    hosts_ul.classList.add("list-unstyled", "ps-3"); // Indent the list

    if (!Array.isArray(blocked_hosts)) {
        console.warn(`Blocked hosts data for tab ${tabId} is not an array:`, blocked_hosts);
        return; // Exit if data is malformed
    }

    for (let i = 0; i < blocked_hosts.length; i++) {
        const host_name = blocked_hosts[i];
        if (typeof host_name !== 'string') continue; // Skip non-string entries

        const host_li = document.createElement("li");
        host_li.classList.add("brand-text-color", "bold-text", "small");
        host_li.innerText = host_name;

        hosts_ul.appendChild(host_li);
    }

    hosts_wrapper.appendChild(hosts_ul);
    blocked_data_display.appendChild(hosts_wrapper);
}

async function buildDataMarkup() {
    const blocked_data_display = document.getElementById("blocked_data_display");
    if (!blocked_data_display) {
        console.error("Could not find #blocked_data_display element.");
        return;
    }
    blocked_data_display.innerHTML = ''; // Clear previous content

    try {
        await updateBlockedHostsDisplay(blocked_data_display);
        await updateBlockedPortsDisplay(blocked_data_display);

         // If no content was added, display a message
         if (blocked_data_display.children.length === 0) {
            const noBlocksMsg = document.createElement('p');
            noBlocksMsg.textContent = "No blocked activity detected on this tab.";
            noBlocksMsg.classList.add('text-muted', 'small', 'col-12');
            blocked_data_display.appendChild(noBlocksMsg);
         }

    } catch (error) {
        console.error("Error building data markup:", error);
        blocked_data_display.innerHTML = '<p class="text-danger col-12">Error displaying blocked data.</p>';
    }
}

buildDataMarkup();