import { getItemFromLocal, modifyItemInLocal } from "../BrowserStorageManager.js";

const listContainerElement = document.getElementById("allowedDomainsListID");
const addDomainForm = document.getElementById("addDomainForm");
const addDomainInput = document.getElementById("add_domain_input");

export async function load_allowed_domains() {
    let allowedDomainsList;
    try {
        allowedDomainsList = await getItemFromLocal("allowed_domain_list", []);
    } catch (error) {
        console.error("load allowlist:", error);
        listContainerElement.replaceChildren(buildMessage("Could not load the list. Reopen this page."));
        return;
    }

    if (allowedDomainsList.length === 0) {
        listContainerElement.replaceChildren(buildMessage("No domains allowlisted."));
        return;
    }

    listContainerElement.replaceChildren(...allowedDomainsList.map(buildDomainRow));
}

function buildMessage(text) {
    const listItem = document.createElement("li");
    listItem.textContent = text;
    return listItem;
}

function buildDomainRow(domain) {
    const listItem = document.createElement("li");

    const domainSpan = document.createElement("span");
    domainSpan.textContent = domain;
    listItem.appendChild(domainSpan);

    const button = document.createElement("button");
    button.textContent = "Remove";
    button.setAttribute("aria-label", `Remove ${domain} from allowlist`);

    button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "Removing...";
        try {
            await modifyItemInLocal("allowed_domain_list", [], (list) => list.filter((d) => d !== domain));
            await load_allowed_domains();
        } catch (error) {
            console.error(`remove ${domain}:`, error);
            button.disabled = false;
            button.textContent = "Remove";
            alert(`Could not remove ${domain}. Try again.`);
        }
    });

    listItem.appendChild(button);
    return listItem;
}

function extractURLHost(text) {
    let urlInput = String(text).trim();

    if (!urlInput) {
        throw new Error("Empty input.");
    }

    if (!urlInput.includes(".") && !urlInput.includes(":") && urlInput !== "localhost") {
        throw new Error(`Invalid domain: "${urlInput}". Use the bare domain, e.g. example.com`);
    }

    if (!urlInput.startsWith("http://") && !urlInput.startsWith("https://")) {
        urlInput = "https://" + urlInput;
    }

    try {
        const { hostname } = new URL(urlInput);
        if (!hostname) throw new Error("No hostname.");
        return hostname;
    } catch (e) {
        console.error("parse:", e);
        throw new Error(`Invalid domain: "${text}". Use the bare domain, e.g. example.com`);
    }
}

async function saveOptions(e) {
    e.preventDefault();

    let normalizedHost;
    try {
        normalizedHost = extractURLHost(addDomainInput.value);
    } catch (error) {
        alert(error.message || "Enter a domain, e.g. example.com");
        return;
    }

    let alreadyPresent = false;
    try {
        // Returning null on a dupe would wipe the list.
        await modifyItemInLocal("allowed_domain_list", [], (list) => {
            alreadyPresent = list.includes(normalizedHost);
            return alreadyPresent ? list : [...list, normalizedHost].sort();
        });

        if (alreadyPresent) {
            alert(`"${normalizedHost}" is already allowlisted.`);
            return;
        }

        addDomainInput.value = "";
        await load_allowed_domains();
    } catch (storageError) {
        console.error("save:", storageError);
        alert("Could not save. Try again.");
    }
}

load_allowed_domains();
addDomainForm.addEventListener("submit", saveOptions);
