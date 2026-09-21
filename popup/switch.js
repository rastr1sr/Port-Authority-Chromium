const blockingToggle = document.getElementById("globalStatusPortAuthority");
const notificationsToggle = document.getElementById("notificationStatusPortAuthority");

function sendToggle(type) {
    return (ev) => {
        chrome.runtime.sendMessage({ type, value: ev.target.checked })
            .then((response) => {
                if (!response?.success) console.error(`${type} failed`);
            })
            .catch((error) => console.error(`${type}:`, error));
    };
}

function applyState(toggle, value, name) {
    if (typeof value === "boolean") {
        toggle.checked = value;
    } else {
        console.warn(`bad ${name}`);
        toggle.disabled = true;
    }
}

chrome.runtime.sendMessage({ type: "popupInit" })
    .then((response) => {
        if (!response) throw new Error("no response");

        applyState(blockingToggle, response.isListening, "isListening");
        applyState(notificationsToggle, response.notificationsAllowed, "notificationsAllowed");

        blockingToggle.addEventListener("change", sendToggle("toggleEnabled"));
        notificationsToggle.addEventListener("change", sendToggle("setNotificationsAllowed"));
        document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
    })
    .catch((error) => {
        console.error("popup init:", error);

        const errorMsg = document.createElement("p");
        errorMsg.className = "error section";
        errorMsg.textContent = "Could not load status. Reload the extension.";
        document.querySelector(".popup-container").prepend(errorMsg);

        blockingToggle.disabled = true;
        notificationsToggle.disabled = true;
    })
    // transitions off until state is set
    .finally(() => document.documentElement.classList.remove("loading"));
