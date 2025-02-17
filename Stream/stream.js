(() => {
///////////////////////////////////////////////////////////////
///                                                         ///
///  STREAM PLUGIN SCRIPT FOR FM-DX-WEBSERVER (V1.1)        ///
///                                                         /// 
///  by Highpoint              last update: 17.02.25        ///
///                                                         ///
///  https://github.com/Highpoint2000/stream                ///
///                                                         ///
///////////////////////////////////////////////////////////////

///  This plugin only works from web server version 1.3.5 !!!

const plugin_version = 'V1.1'; // Plugin version
let pressTimer; // Timer variable
const longPressDuration = 1000; // Duration for long press in milliseconds
let streamWindow; // Variable to keep track of the opened stream window
let cachedData = null; // Variable to cache the file content
let stationid;

// Initialize the WebSocket connection when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    setupWebSocket(); // Activate WebSocket on start
    // Erstelle den Button über die Plugin-Funktion
    createButton('Stream-on-off');
});

// Setup WebSocket connection
async function setupWebSocket() {
    try {
        autoScanSocket = await window.socketPromise;

        autoScanSocket.addEventListener("open", () => {
            console.log("WebSocket connected.");
        });

        autoScanSocket.addEventListener("message", handleWebSocketMessage);

        autoScanSocket.addEventListener("error", (error) => {
            console.error("WebSocket error:", error);
        });

        autoScanSocket.addEventListener("close", (event) => {
            console.log("WebSocket closed:", event);
            // Optional: Versuche nach einer kurzen Pause neu zu verbinden
            setTimeout(setupWebSocket, 5000);
        });

    } catch (error) {
        console.error("Failed to setup WebSocket:", error);
    }
}

// Handle incoming WebSocket messages
async function handleWebSocketMessage(event) {
    try {
        const eventData = JSON.parse(event.data);
        const frequency = eventData.freq;
        const txInfo = eventData.txInfo;

        // Extrahiere die stationid aus txInfo
        stationid = txInfo ? txInfo.id : "";
        const picode = eventData.pi; // Annahme: `pi` ist in eventData vorhanden
        const city = txInfo ? txInfo.city : ""; // Annahme: `city` ist in txInfo vorhanden
        const itu = txInfo ? txInfo.itu : "";

        // Hole die StationID, falls nicht vorhanden und itu === 'POL'
        if (itu === 'POL') {
            const fetchedStationID = await fetchstationid(frequency, picode, city);
            if (fetchedStationID) {
                stationid = fetchedStationID;
            }
        }

        // Aktualisiere den Button basierend auf der stationid
        const $pluginButton = $('#Stream-on-off');
        if ($pluginButton.length > 0) {
            if (stationid) {
                $pluginButton.addClass('bg-color-4').removeClass('bg-color-2');
                // Klick-Event: Öffne das Stream-Fenster
                $pluginButton.off('click').on('click', () => {
                    streamWindow = window.open(`https://fmscan.org/stream.php?i=${stationid}`, 'newWindow', 'width=800,height=160');
                    if (streamWindow) {
                        streamWindow.focus(); // Fenster in den Vordergrund holen
                    }
                });
            } else {
                $pluginButton.addClass('bg-color-2').removeClass('bg-color-4');
                $pluginButton.off('click');
            }
        }
    } catch (error) {
        console.error("Error processing WebSocket message:", error);
    }
}

// Handle long press on the button
function startPressTimer() {
    pressTimer = setTimeout(() => {
        window.open('https://fmscan.org/', 'newWindow', 'width=350,height=650');
    }, longPressDuration);
}

// Cancel the press timer if the button is released or mouse leaves
function cancelPressTimer() {
    clearTimeout(pressTimer);
}

// ───────────────────────────────────────────────────────────────
// New button creation and migration of event listeners
function createButton(buttonId) {
  (function waitForFunction() {
    const maxWaitTime = 10000;
    let functionFound = false;

    const observer = new MutationObserver((mutationsList, observer) => {
      if (typeof addIconToPluginPanel === 'function') {
        observer.disconnect();
        // Erstelle den Button via Plugin-Panel
        // Ändere hier das Label von "Screenshot" zu "STREAM"
        addIconToPluginPanel(buttonId, "STREAM", "solid", "play", `Plugin Version: ${plugin_version}`);
        functionFound = true;

        const buttonObserver = new MutationObserver(() => {
          const $pluginButton = $(`#${buttonId}`);
          if ($pluginButton.length > 0) {
            // Füge die Event-Listener für den Long-Press hinzu
            $pluginButton.on('mousedown', startPressTimer);
            $pluginButton.on('mouseup mouseleave', cancelPressTimer);
            // Entferne diesen Observer, um Konflikte mit separaten Click-Handlern zu vermeiden
            buttonObserver.disconnect();
          }
        });
        buttonObserver.observe(document.body, { childList: true, subtree: true });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      if (!functionFound) {
        console.error(`Function addIconToPluginPanel not found after ${maxWaitTime / 1000} seconds.`);
      }
    }, maxWaitTime);
  })();

  // Zusätzliche CSS-Anpassungen für den neuen Button
  const aStreamCss = `
    #${buttonId}:hover {
      color: var(--color-5);
      filter: brightness(120%);
    }
  `;
  $("<style>")
    .prop("type", "text/css")
    .html(aStreamCss)
    .appendTo("head");
}

// Fetch the station ID from the URL
async function fetchstationid(frequency, picode, city) { 
    try {
        // Überprüfe, ob die Daten bereits im Cache sind
        if (!cachedData) {
            const response = await fetch("https://tef.noobish.eu/logos/scripts/StationID_PL.txt");
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            cachedData = await response.text();
        }

        // Entferne den Punkt aus der Frequenz
        const cleanedFreq = frequency.replace('.', '');

        // Entferne Sonderzeichen aus der Stadtbezeichnung und wandle in Kleinbuchstaben um
        const cleanedCity = city.replace(/[^a-z]/gi, '').toLowerCase();

        // Extrahiere die ersten drei Zeichen der bereinigten Stadt
        const cityPrefix = cleanedCity.substring(0, 3);

        // Erstelle ein Muster mit Wildcards um jedes der ersten drei Zeichen der Stadt
        const cityPattern = cityPrefix
            .split('')
            .map(char => `.*${char}`)
            .join('');
        
        // Baue den Suchstring mit Wildcards zusammen
        const targetString = `${cleanedFreq};${picode};${cityPattern}.*`;

        // Erstelle einen Regex (case-insensitive), um den String zu finden
        const regex = new RegExp(targetString, 'i');

        // Suche in den gecachten Daten
        const targetLine = cachedData.split('\n').find(line => regex.test(line));

        if (targetLine) {
            const parts = targetLine.split(';');
            let StationID = parts[parts.length - 1].trim();
            StationID = StationID.replace(/[^0-9]/g, '');
            return StationID;
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error fetching station ID:', error);
        return null;
    }
}
})();
