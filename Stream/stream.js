(() => {
  ///////////////////////////////////////////////////////////////
  ///                                                         ///
  ///  STREAM PLUGIN SCRIPT FOR FM-DX-WEBSERVER (V2.0)        ///
  ///                                                         /// 
  ///  by Highpoint              last update: 28.04.25        ///
  ///                                                         ///
  ///  https://github.com/Highpoint2000/stream                ///
  ///                                                         ///
  ///////////////////////////////////////////////////////////////

  /* ==== Plugin Settings =============================================== */
  const PLUGIN_VERSION   = '2.0';
  const PLUGIN_JS_FILE   = 'main/Stream/stream.js';
  const PLUGIN_PATH      = 'https://raw.githubusercontent.com/highpoint2000/Stream/';
  const CORS_PROXY_URL   = 'https://cors-proxy.de:13128/';

  /* ==== State Variables =============================================== */
  let pressTimer;
  let cachedData        = null;
  let stationid;
  let audioPlayer       = null;
  let STREAM_ACTIVE     = false;
  let isAdminLoggedIn   = false;
  let isTuneLoggedIn    = false;
  let isAuthenticated   = false;

  const UPDATE_KEY       = 'STREAM_lastUpdateNotification';

  document.addEventListener('DOMContentLoaded', () => {
    checkAdminMode();
    setupWebSocket();
    createToggle('Stream-on-off');
    // perform version check after load
    setTimeout(checkPluginVersion, 2500);
  });

  /* =================================================================== *
   *  Admin / tune mode detection                                        *
   * =================================================================== */
  function checkAdminMode() {
    const txt = document.body.textContent || document.body.innerText;
    isAdminLoggedIn = txt.includes('You are logged in as an administrator.')
                   || txt.includes('You are logged in as an adminstrator.');
    isTuneLoggedIn  = txt.includes('You are logged in and can control the receiver.');
    isAuthenticated = isAdminLoggedIn || isTuneLoggedIn;
  }

  /* =================================================================== *
   *  Version check (admins only)                                        *
   * =================================================================== */
  function shouldShowUpdateToast() {
    const last = +localStorage.getItem(UPDATE_KEY) || 0;
    if (Date.now() - last > 86400000) {
      localStorage.setItem(UPDATE_KEY, Date.now());
      return true;
    }
    return false;
  }
  function compareVersions(a, b) {
    const parse = v => v.split(/(\d+|[a-z]+)/i).filter(Boolean).map(x => isNaN(x) ? x : +x);
    const A = parse(a), B = parse(b);
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      const x = A[i] || 0, y = B[i] || 0;
      if (x === y) continue;
      if (typeof x === 'number' && typeof y === 'number') return x > y ? 1 : -1;
      return x > y ? 1 : -1;
    }
    return 0;
  }
  function checkPluginVersion() {
    if (!isAuthenticated) return;
    fetch(`${PLUGIN_PATH}${PLUGIN_JS_FILE}`)
      .then(r => r.text())
      .then(text => {
        const m = text.match(/const\s+PLUGIN_VERSION\s*=\s*['"]([\d.]+[A-Za-z-]*)['"]/);
        if (!m) return;
        const remote = m[1];
        if (compareVersions(PLUGIN_VERSION, remote) === -1 && shouldShowUpdateToast()) {
          sendToast(
            'warning important',
            'STREAM',
            `Update available:<br>${PLUGIN_VERSION} → ${remote}`,
            false,
            false
          );
        }
      })
      .catch(e => console.error('STREAM: version check failed', e));
  }

  /* =================================================================== *
   *  WebSocket and message handling                                     *
   * =================================================================== */
  async function setupWebSocket() {
    try {
      const autoScanSocket = await window.socketPromise;
      autoScanSocket.addEventListener("open", () => console.log("WebSocket connected."));
      autoScanSocket.addEventListener("message", handleWebSocketMessage);
      autoScanSocket.addEventListener("error", e => console.error("WebSocket error:", e));
      autoScanSocket.addEventListener("close", () => setTimeout(setupWebSocket, 5000));
    } catch (error) {
      console.error("Failed to setup WebSocket:", error);
    }
  }

  async function handleWebSocketMessage(event) {
    try {
      const { freq: frequency, pi: picode, txInfo } = JSON.parse(event.data);
      const wasActive = STREAM_ACTIVE;
      stationid = txInfo?.id || "";
      const city = txInfo?.city || "";
      const itu  = txInfo?.itu  || "";

      if (itu === 'POL' && !stationid) {
        const fetched = await fetchstationid(frequency, picode, city);
        if (fetched) stationid = fetched;
      }

      const $btn = $('#Stream-on-off');
      if (!stationid) {
        if (wasActive) stopStream(), STREAM_ACTIVE = false;
        $btn.removeClass('bg-color-4 active').addClass('bg-color-2');
      } else {
        $btn.removeClass('bg-color-2').addClass('bg-color-4');
      }
    } catch (error) {
      console.error("Error processing WebSocket message:", error);
    }
  }

  /* =================================================================== *
   *  Toggle button creation                                             *
   * =================================================================== */
  function createToggle(id) {
    const obs = new MutationObserver((_, observer) => {
      if (typeof addIconToPluginPanel === 'function') {
        observer.disconnect();
        addIconToPluginPanel(id, "STREAM", "solid", "play", `Plugin Version: ${PLUGIN_VERSION}`);
        const btnObs = new MutationObserver(() => {
          const $btn = $(`#${id}`);
          if (!$btn.length) return;
          btnObs.disconnect();

          $btn.addClass('hide-phone bg-color-2');
          $btn.on('click', async e => {
            e.preventDefault();
            if (!stationid) {
              sendToast('warning important','Play Stream','Station ID not found!',false,false);
              return;
            }
            if (!STREAM_ACTIVE) {
              try {
                const token  = '924924';
                const API_URL = `https://api.fmlist.org/152/fmdxGetStreamById.php?id=${stationid}&token=${token}`;
                const domain = window.location.host;
                const url    = `${CORS_PROXY_URL}${API_URL}&cb=${Date.now()}&domain=${domain}`;
                const resp   = await fetch(url);
                if (!resp.ok) throw new Error(`API-Error ${resp.status}`);
                const streams = await resp.json();
                if (!Array.isArray(streams) || streams.length === 0) {
                  sendToast('warning important','Play Stream','No URL found!',false,false);
                  return;
                }
                const best = streams.reduce((a,b)=>parseInt(b.bitrate)>parseInt(a.bitrate)?b:a);
                playStream(best.linkname);
                sendToast('info important','Play Stream',
                  `<div style="max-width:150px;white-space:normal;word-break:break-all;">${best.linkname}</div>`,
                  false,false);
                STREAM_ACTIVE = true;
                $btn.addClass('active');
              } catch (err) {
                console.error('Fehler beim Laden des Streams:', err);
              }
            } else {
              stopStream(); STREAM_ACTIVE = false; $btn.removeClass('active');
            }
          });
        });
        btnObs.observe(document.body,{childList:true,subtree:true});

        $('<style>').prop('type','text/css').html(`
          #${id}:hover{color:var(--color-5);filter:brightness(120%)}
          #${id}.active{background-color:var(--color-2)!important;filter:brightness(120%)}
        `).appendTo('head');
      }
    });
    obs.observe(document.body,{childList:true,subtree:true});
  }

  /* =================================================================== *
   *  Audio playback                                                     *
   * =================================================================== */
  function playStream(url) {
    if (!audioPlayer) {
      audioPlayer = document.createElement('audio');
      audioPlayer.id = 'fmdx-stream-player';
      audioPlayer.autoplay = true; audioPlayer.controls = false;
      audioPlayer.style.display = 'none'; document.body.appendChild(audioPlayer);
    }
    audioPlayer.src = url; audioPlayer.play().catch(e=>console.error('Audio play failed:',e));
  }
  function stopStream() {
    if (audioPlayer) {
      audioPlayer.pause(); audioPlayer.src = '';
      audioPlayer.remove(); audioPlayer = null;
    }
  }

  /* =================================================================== *
   *  Station ID lookup                                                  *
   * =================================================================== */
  async function fetchstationid(frequency,picode,city) {
    try {
      if (!cachedData) {
        const res = await fetch("https://tef.noobish.eu/logos/scripts/StationID_PL.txt");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        cachedData = await res.text();
      }
      const cleanedFreq = frequency.replace('.','');
      const cleanedCity = city.replace(/[^a-z]/gi,'').toLowerCase();
      const pattern     = cleanedCity.slice(0,3).split('').map(c=>`.*${c}`).join('');
      const regex       = new RegExp(`${cleanedFreq};${picode};${pattern}.*`,'i');
      const line        = cachedData.split('\n').find(l=>regex.test(l));
      if (!line) return null;
      return line.split(';').pop().trim().replace(/[^0-9]/g,'');
    } catch(e) {
      console.error('Error fetching station ID:',e);
      return null;
    }
  }
})();
