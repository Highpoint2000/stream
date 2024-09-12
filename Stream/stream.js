///////////////////////////////////////////////////////////////
///                                                         ///
///  STREAM PLUGIN SCRIPT FOR FM-DX-WEBSERVER (V1.0)        ///
///                                                         /// 
///  by Highpoint              last update: 12.09.24        ///
///                                                         ///
///  https://github.com/Highpoint2000/stream                ///
///                                                         ///
///////////////////////////////////////////////////////////////

(() => {

const plugin_version = 'V1.0'; // Plugin version
let pressTimer; // Timer variable
const longPressDuration = 1000; // Duration for long press in milliseconds
let streamWindow; // Variable to keep track of the opened stream window
let cachedData = null; // Variable to cache the file content
let stationid;

// Initialize the WebSocket connection when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    setupWebSocket(); // Activate WebSocket on start
    setTimeout(initializeStreamButton, 700);
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
            // Optionally, attempt to reconnect after a delay
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

        // Extract stationid from txInfo
        stationid = txInfo ? txInfo.id : "";
        const picode = eventData.pi; // Assuming `pi` is available in the eventData
        const city = txInfo ? txInfo.city : ""; // Assuming `city` is available in txInfo
        const itu = txInfo ? txInfo.itu : "";

        // Fetch the station ID if it's not available and itu is 'POL'
        if (itu === 'POL') {
            const fetchedStationID = await fetchstationid(frequency, picode, city);
            if (fetchedStationID) {
                // console.log("Fetched Station ID:", fetchedStationID);
                stationid = fetchedStationID; // Update the stationid variable
            }
        }

        // Determine if the stream button should be active
        const isActive = !!stationid; // isActive is true if stationid is not empty

        // Update button class and click event based on the presence of stationid
        if (StreamButton) {
            if (stationid) {
                StreamButton.classList.add('bg-color-4');
                StreamButton.classList.remove('bg-color-2');
                StreamButton.onclick = () => {
                    streamWindow = window.open(`https://fmscan.org/stream.php?i=${stationid}`, 'newWindow', 'width=800,height=160');
                    if (streamWindow) {
                        streamWindow.focus(); // Bring the window to the foreground
                    }
                };
            } else {
                StreamButton.classList.add('bg-color-2');
                StreamButton.classList.remove('bg-color-4');
                StreamButton.onclick = null; // Disable click event if not active
            }
        }

        // console.log("Station ID:", stationid);
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

// Create the stream button and append it to the button wrapper
const StreamButton = document.createElement('button');

function initializeStreamButton() {
    const buttonWrapper = document.getElementById('button-wrapper') || createDefaultButtonWrapper();

    if (buttonWrapper) {
        StreamButton.id = 'Stream-on-off';
        StreamButton.classList.add('hide-phone');
        StreamButton.setAttribute('data-tooltip', 'Stream on/off');
        StreamButton.style.marginTop = '18px';
        StreamButton.style.marginLeft = '5px';
        StreamButton.style.width = '100px';
		StreamButton.style.height = '22px';
        StreamButton.classList.add('bg-color-2');
        StreamButton.style.borderRadius = '0px';
        StreamButton.title = `Plugin Version: ${plugin_version}`;

        // Add SVG icon and text
        StreamButton.innerHTML = `
            <svg width="22" height="22" viewBox="0 0 27 27" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: -3px;">
                <path d="M8 5v14l11-7L8 5z" fill="#00FF00"/>
            </svg>
            <strong>STREAM</strong>
        `;
        
        buttonWrapper.appendChild(StreamButton);
        StreamButton.addEventListener('mousedown', startPressTimer);
        StreamButton.addEventListener('mouseup', cancelPressTimer);
        StreamButton.addEventListener('mouseleave', cancelPressTimer);
        console.log('Stream button successfully added.');
    } else {
        console.error('Unable to add button.');
    }
}

// Create a default button wrapper if it does not exist
function createDefaultButtonWrapper() {
    const wrapperElement = document.querySelector('.tuner-info');
    if (wrapperElement) {
        const buttonWrapper = document.createElement('div');
        buttonWrapper.classList.add('button-wrapper');
        buttonWrapper.id = 'button-wrapper';
        buttonWrapper.appendChild(StreamButton);
        wrapperElement.appendChild(buttonWrapper);
        wrapperElement.appendChild(document.createElement('br'));
        return buttonWrapper;
    } else {
        console.error('Standard location not found. Unable to add button.');
        return null;
    }
}

// Fetch the station ID from the URL
async function fetchstationid(frequency, picode, city) { 
    try {
        // Check if data is already cached
        if (!cachedData) {
            // Fetch the content from the specified URL if not cached
            const response = await fetch("https://tef.noobish.eu/logos/scripts/StationID_PL.txt");

            // Check if the response is successful
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Read the text content from the response
            cachedData = await response.text();
        } else {
            // console.log('Using cached data.');
        }

        // Remove the period from frequency
        const cleanedFreq = frequency.replace('.', '');

        // Remove all special characters from city and convert to lowercase
        const cleanedCity = city.replace(/[^a-z]/gi, '').toLowerCase();

        // Extract the first four characters of the cleaned city
        const cityPrefix = cleanedCity.substring(0, 3);

        // Create a pattern with wildcards around each of the first four characters of the cleaned city
        const cityPattern = cityPrefix
            .split('')
            .map(char => `.*${char}`)
            .join('');
        
        // Build the target string based on the provided variables with wildcards
        const targetString = `${cleanedFreq};${picode};${cityPattern}.*`;
        // console.log(`Searching for specified combination: ${targetString}`);

        // Create a case-insensitive regular expression to match the target string
        const regex = new RegExp(targetString, 'i');

        // Find the line that matches the target regex
        const targetLine = cachedData.split('\n').find(line => regex.test(line));

        if (targetLine) {
            // Split the line by semicolons to get all the parts
            const parts = targetLine.split(';');

            // Extract and clean the station ID from the last column
            let StationID = parts[parts.length - 1].trim();

            // Further cleaning can be done here if needed (e.g., removing specific characters)
            StationID = StationID.replace(/[^0-9]/g, ''); // Example: remove all non-alphanumeric characters

            // console.log(`Station ID: ${StationID}`);
            return StationID;
        } else {
            // console.log(`The specified combination of ${cleanedFreq};*${picode}*;*${cityPattern}* was not found.`);
            return null;
        }
    } catch (error) {
        console.error('Error fetching station ID:', error);
        return null;
    }
}
})();
