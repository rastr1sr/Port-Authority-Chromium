import { getItemFromLocal, modifyItemInLocal } from "../BrowserStorageManager.js";

let remove_buttons_event_controller = null;
const listContainerElement = document.getElementById("allowedDomainsListID");
const addDomainForm = document.getElementById("addDomainForm");
const addDomainInput = document.getElementById("add_domain_input");


async function load_allowed_domains() {
    if (remove_buttons_event_controller) {
        remove_buttons_event_controller.abort();
    }

    remove_buttons_event_controller = new AbortController();
    const signal = remove_buttons_event_controller.signal;

    let allowedDomainsList = [];
    try {
        allowedDomainsList = await getItemFromLocal("allowed_domain_list", []);
        if (!Array.isArray(allowedDomainsList)) {
            console.warn("Stored allowlist is not an array, resetting.");
            allowedDomainsList = [];
            // Consider notifying the user or automatically fixing storage here
        }
    } catch (error) {
        console.error("Error loading allowed domains:", error);
        listContainerElement.innerHTML = '<li>Error loading domain list.</li>'; // Display error
        return;
    }


    if (!listContainerElement) {
        console.error("Could not find list container element #allowedDomainsListID");
        return;
    }

    if (allowedDomainsList.length === 0) {
        listContainerElement.innerHTML = '<li>No domains currently allowlisted.</li>';
        return;
    }

    const domainListDomElements = allowedDomainsList.map((domain) => {
        const listItem = document.createElement("li");

        const domainSpan = document.createElement("span");
        domainSpan.textContent = domain;
        listItem.appendChild(domainSpan);

        const button = document.createElement("button");
        button.textContent = "Remove";
        button.setAttribute('aria-label', `Remove ${domain} from allowlist`); // Accessibility

        button.addEventListener("click", async () => {
            try {
                button.disabled = true;
                button.textContent = "Removing...";

                await modifyItemInLocal("allowed_domain_list", [],
                    (list) => list.filter((d) => d !== domain)
                );

                await load_allowed_domains(); // Await the reload

            } catch (error) {
                console.error(`Error removing domain ${domain}:`, error);
                // Re-enable button on error maybe? Or show an error message?
                button.disabled = false;
                button.textContent = "Remove";
                alert(`Failed to remove domain ${domain}. Please try again.`);
            }
        }, { signal }); // Pass the signal to the listener options

        listItem.appendChild(button);

        return listItem;
    });

    listContainerElement.replaceChildren(...domainListDomElements);
}

function extractURLHost(text) {
    let urlInput = String(text).trim();

    if (!urlInput) {
        throw new Error("Input is empty.");
    }

    // Basic check if it looks like a domain/IP before prepending protocol
    if (!urlInput.includes('.') && !urlInput.includes(':') && urlInput !== 'localhost') {
         throw new Error(`Invalid domain format: "${urlInput}". Should contain '.' or be 'localhost'.`);
    }


    // Try prepending https:// if no protocol exists
    if (!urlInput.startsWith('http://') && !urlInput.startsWith('https://')) {
        if (!urlInput.startsWith('//')) {
             urlInput = "https://" + urlInput;
        } else {
            // Handle protocol-relative URL
             urlInput = "https:" + urlInput;
        }
    }

    try {
        const newUrl = new URL(urlInput);
        if (!newUrl.hostname) {
             throw new Error("Could not extract a valid hostname.");
        }
        return newUrl.hostname; // Strips port, converts to lowercase
    } catch (e) {
        console.error("URL parsing error:", e);
        throw new Error(`Invalid URL or domain: "${text}"`);
    }
}

async function saveOptions(e) {
    e.preventDefault(); // Prevent default form submission

    const domainToAddInput = addDomainInput.value;
    let normalizedHost;

    try {
        normalizedHost = extractURLHost(domainToAddInput);
    } catch(error) {
        console.error("Validation Error:", error);
        alert(error.message || "Please enter a valid domain name (e.g., example.com).");
        return;
    }

    try {
        const result = await modifyItemInLocal("allowed_domain_list", [],
            (list) => {
                const currentList = Array.isArray(list) ? list : [];
                if (!currentList.includes(normalizedHost)) {
                    return [...currentList, normalizedHost].sort(); // Keep the list sorted
                } else {
                    return null; // Signal no modification needed
                }
            });

        if (result === null) {
             alert(`Domain "${normalizedHost}" is already in the allowlist.`);
        } else {
             console.log(`Domain "${normalizedHost}" added to allowlist.`);
             addDomainInput.value = ""; // Clear the input field
             await load_allowed_domains(); // Refresh the list display
        }

    } catch(storageError) {
        console.error("Error saving domain to storage:", storageError);
        alert("Failed to save domain to allowlist. Please try again.");
    }
}


// --- Initial Setup ---

if (!listContainerElement || !addDomainForm || !addDomainInput) {
     console.error("Essential settings page elements not found. Script initialization failed.");
     document.body.innerHTML = "<h1>Error</h1><p>Could not initialize settings page. Required elements are missing.</p>";
} else {
    load_allowed_domains();
    addDomainForm.addEventListener("submit", saveOptions);
}