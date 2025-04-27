function toggleEnabled(ev){
  chrome.runtime.sendMessage({type: 'toggleEnabled', value: ev.target.checked})
    .then(response => {
        if (!response?.success) console.error("Failed to toggle enabled state.");
        // Optional: Add visual feedback on success/failure
    })
    .catch(error => {
        console.error("Error sending toggleEnabled message:", error);
         // Maybe revert checkbox state if message fails?
         // ev.target.checked = !ev.target.checked;
    });
}

function setNotificationsAllowed(ev){
  chrome.runtime.sendMessage({type: 'setNotificationsAllowed', value: ev.target.checked})
     .then(response => {
         if (!response?.success) console.error("Failed to set notifications allowed state.");
     })
     .catch(error => console.error("Error sending setNotificationsAllowed message:", error));
}

function settingsClicked(ev){
  chrome.runtime.openOptionsPage();
}

chrome.runtime.sendMessage({type: 'popupInit'})
  .then((response) => {
    if (!response) {
        console.error("Error: No response received from background script for popupInit.");
        document.getElementById("globalStatusPortAuthority").disabled = true;
        document.getElementById("notificationStatusPortAuthority").disabled = true;
        return;
    }

    if (typeof response.isListening === 'boolean') {
        document.getElementById("globalStatusPortAuthority").checked = response.isListening;
    } else {
        console.warn("Missing or invalid 'isListening' in popupInit response.");
        document.getElementById("globalStatusPortAuthority").disabled = true;
    }

    if (typeof response.notificationsAllowed === 'boolean') {
         document.getElementById("notificationStatusPortAuthority").checked = response.notificationsAllowed;
    } else {
        console.warn("Missing or invalid 'notificationsAllowed' in popupInit response.");
        document.getElementById("notificationStatusPortAuthority").disabled = true;
    }

    document.getElementById('globalStatusPortAuthority').addEventListener("change", toggleEnabled);
    document.getElementById('notificationStatusPortAuthority').addEventListener("change", setNotificationsAllowed);

    const settingsIcon = document.getElementById('settings');
    if (settingsIcon) {
         settingsIcon.addEventListener("click", settingsClicked);
    } else {
        console.error("Could not find settings icon element.");
    }

    // Remove loading class after a short delay to allow rendering
    // Ensure the class is on the html element as per the CSS
    setTimeout(() => document.documentElement.classList.remove('loading'), 50); // Increased delay slightly

  })
  .catch(error => {
      console.error("Error during popup initialization:", error);
      // Display an error message to the user in the popup?
      const container = document.querySelector('.popup-container');
      if (container) {
          const errorMsg = document.createElement('p');
          errorMsg.textContent = "Error loading extension status. Please try again later.";
          errorMsg.className = 'alert alert-danger'; // Use Bootstrap alert style
          container.prepend(errorMsg); // Add message at the top
      }
       document.getElementById("globalStatusPortAuthority").disabled = true;
       document.getElementById("notificationStatusPortAuthority").disabled = true;

  });