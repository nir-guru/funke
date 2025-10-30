
// ==UserScript==
// @name         FanGuru – Chef Assistant for German Cooking Site
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  AI Chef Assistant for recipe help, cooking techniques, and culinary questions
// @match        https://www.eatclub.de/*
// @grant        none
// @run-at       document-end
// ==/UserScript==


/* ═ CONFIG ═ */
// API endpoint - will use the proxy server to protect API keys
const API_ENDPOINT = window.location.origin + '/api/chat';
const DING_URL    = "https://cdn.jsdelivr.net/gh/saintplay/sounds@master/coins/coin_1.mp3";
const LAUNCHER_AVATAR_URL = window.location.origin + "/chef-avatar.png"; // Unique bust shape for launcher
const AVATAR_URL  = "https://www.eatclub.de/wp-content/uploads/2022/02/foto-felix-300x300.jpg"; // Circular for chat
const LOGO_URL    = "https://i.ibb.co/Xfk11T1V/Chat-GPT-Image-Oct-6-2025-03-37-25-PM-removebg-preview.png";
const POWERED_BY_URL = window.location.origin + "/powered-by.png"; // Powered by FanGuru image
const SPONSOR_IMG = "https://www.zwilling.com/dw/image/v2/BCGV_PRD/on/demandware.static/-/Sites-zwilling-master-catalog/default/dw55beb4c8/images/large/1010887_1.jpg";
const PREROLL_VIDEO = "V_A-am90kzg"; // YouTube video ID
const PREROLL_COOLDOWN = 60 * 60 * 1000; // 1 hour in milliseconds

const BASE_RULES = `Wichtig:
- Erfinde keine Fakten oder Zahlen.
- Wenn du keine Informationen hast, sag es.
- Du kannst veraltete Daten verwenden, aber warne, dass sie nicht aktuell sind.
- Bevorzuge Fakten gegenüber Meinungen.
- WICHTIG: Antworte IMMER in der gleichen Sprache, in der der Benutzer die Frage gestellt hat. Wenn der Benutzer auf Englisch fragt, antworte auf Englisch. Wenn auf Deutsch, antworte auf Deutsch.
- Halte deine Antworten kurz und prägnant (2-4 Sätze). Gib nur die wichtigsten Informationen.`;

/* ═ Chef Agent ═ */
const Pini = {
  id: "chef",
  name: "Chef",
  avatar: AVATAR_URL,
  sys: `${BASE_RULES} Du bist ein professioneller Koch-Assistent. Hilf Benutzern mit Rezepten, Kochtechniken, Zutatenersatz und kulinarischen Fragen. Sei freundlich, direkt und hilfreich. IMPORTANT: Keep answers SHORT and concise (2-4 sentences). Always respond in the SAME language the user asks in (English for English questions, German for German questions).`,
  qa: []
};

/* ═ GLOBALS ═ */
const ding = new Audio(DING_URL); ding.volume = .4;
let hist = [];
let panel = null;
let launcher = null;
let pageContext = "";
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let chatMode = "chat"; // "chat" or "voice"
let recordingStartTime = 0;
let darkMode = localStorage.getItem("fg_dark_mode") === "true"; // Dark mode state
const VOICE_AGENT_PATH = "/rezept/kraeuter-pasta-chorizo-crunch";
const isVoiceAgentPage = window.location.pathname.includes(VOICE_AGENT_PATH);

/* ═ Login Credentials ═ */
const VALID_USERNAME = "fanguru";
const VALID_PASSWORD = "fanguru1025";
const AUTH_KEY = "fg_authenticated";

/* ═ Extract Page Content for Context ═ */
function getPageContext() {
  const context = [];

  // Get page title
  const title = document.title;
  if (title) context.push(`Page Title: ${title}`);

  // Get main heading
  const h1 = document.querySelector('h1');
  if (h1) context.push(`Main Heading: ${h1.textContent.trim()}`);

  // Get recipe content (common selectors for recipe sites)
  const recipeSelectors = [
    '.recipe-content',
    '.recipe-description',
    '.entry-content',
    'article',
    '.post-content',
    '[itemprop="recipeInstructions"]',
    '[itemprop="description"]'
  ];

  for (const selector of recipeSelectors) {
    const elem = document.querySelector(selector);
    if (elem) {
      const text = elem.textContent.trim().substring(0, 2000); // Limit to 2000 chars
      if (text) {
        context.push(`Page Content: ${text}`);
        break;
      }
    }
  }

  // Get ingredients if present
  const ingredientSelectors = [
    '.ingredients',
    '[itemprop="recipeIngredient"]',
    '.ingredient-list'
  ];

  for (const selector of ingredientSelectors) {
    const elems = document.querySelectorAll(selector);
    if (elems.length > 0) {
      const ingredients = Array.from(elems).map(e => e.textContent.trim()).join(', ');
      context.push(`Ingredients: ${ingredients}`);
      break;
    }
  }

  return context.join('\n\n');
}



/* ═ Login Check ═ */
function checkAuth() {
  return localStorage.getItem(AUTH_KEY) === "true";
}

function showLoginScreen() {
  const loginOverlay = document.createElement("div");
  loginOverlay.id = "fg-login-overlay";
  loginOverlay.innerHTML = `
    <div class="fg-login-box">
      <img class="fg-login-logo" src="${LOGO_URL}" alt="FanGuru">
      <h2 class="fg-login-title">Willkommen bei FanGuru</h2>
      <p class="fg-login-subtitle">Bitte melden Sie sich an</p>
      <div class="fg-login-form">
        <input type="text" id="fg-username" placeholder="Benutzername" autocomplete="username">
        <input type="password" id="fg-password" placeholder="Passwort" autocomplete="current-password">
        <div id="fg-login-error" class="fg-login-error"></div>
        <button id="fg-login-btn">Anmelden</button>
      </div>
    </div>
  `;
  document.body.appendChild(loginOverlay);

  const usernameInput = loginOverlay.querySelector("#fg-username");
  const passwordInput = loginOverlay.querySelector("#fg-password");
  const loginBtn = loginOverlay.querySelector("#fg-login-btn");
  const errorDiv = loginOverlay.querySelector("#fg-login-error");

  const attemptLogin = () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
      // Store only authentication status, not credentials
      localStorage.setItem(AUTH_KEY, "true");
      loginOverlay.remove();
      initApp();
    } else {
      errorDiv.textContent = "Ungültiger Benutzername oder Passwort";
      usernameInput.value = "";
      passwordInput.value = "";
      usernameInput.focus();
    }
  };

  loginBtn.onclick = attemptLogin;
  usernameInput.addEventListener("keydown", e => e.key === "Enter" && passwordInput.focus());
  passwordInput.addEventListener("keydown", e => e.key === "Enter" && attemptLogin());

  setTimeout(() => usernameInput.focus(), 100);
}

function initApp() {
  makeLauncher();
  // Extract context when script loads
  pageContext = getPageContext();
}

/* ═ לאנצ'ר + TOGGLE + גרירה ═ */
function makeLauncher(){
  launcher = document.createElement("div");
  launcher.id = "fg-launcher";
  launcher.innerHTML = `
    <div class="fg-cta">
      <img class="fg-cta-avatar" src="${AVATAR_URL}" alt="Chef Felix">
      <div class="fg-cta-text">
        <div class="fg-cta-title">Chef Felix</div>
        <div class="fg-cta-sub">Recipes, techniques and cooking tips</div>
      </div>
    </div>
    <div class="fg-bubble" title="Chef Felix">
      <img class="fg-avatar" src="${LAUNCHER_AVATAR_URL}" alt="Chef">
      <div class="fg-ring"></div>
    </div>
  `;
  document.body.appendChild(launcher);

  let touchStartTime = 0;
  let touchStartPos = { x: 0, y: 0 };

  const onLauncherClick = (e)=>{
    if (!panel) makePanel();
    if (panel.classList.contains("open")) closePanel();
    else openPanel();
  };

  const bubble = launcher.querySelector(".fg-bubble");
  const cta = launcher.querySelector(".fg-cta");

  // Desktop click
  bubble.addEventListener("click", onLauncherClick);
  cta.addEventListener("click", onLauncherClick);

  // Mobile touch handling
  const onTouchStart = (e) => {
    touchStartTime = Date.now();
    const touch = e.touches[0];
    touchStartPos = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = (e) => {
    const touchDuration = Date.now() - touchStartTime;
    const touch = e.changedTouches[0];
    const moveDistance = Math.sqrt(
      Math.pow(touch.clientX - touchStartPos.x, 2) +
      Math.pow(touch.clientY - touchStartPos.y, 2)
    );

    if (touchDuration < 500 && moveDistance < 10) {
      e.preventDefault();
      e.stopPropagation();
      onLauncherClick(e);
    }
  };

  bubble.addEventListener("touchstart", onTouchStart, { passive: true });
  bubble.addEventListener("touchend", onTouchEnd, { passive: false });
  cta.addEventListener("touchstart", onTouchStart, { passive: true });
  cta.addEventListener("touchend", onTouchEnd, { passive: false });

  // Enable dragging only on desktop
  if (window.innerWidth > 640) {
    makeDraggable(launcher, "fg_launcher_pos", positionPanel);
  }
  window.addEventListener("resize", ()=>{ if(panel) positionPanel(); }, {passive:true});
}

/* ═ מיקום הפאנל צמוד לבועה ═ */
function positionPanel(){
  if(!panel || !launcher) return;
  const r = launcher.getBoundingClientRect();
  const rightPx  = Math.max(8, window.innerWidth - r.right);
  const bottomPx = Math.max(16, (window.innerHeight - r.bottom) + r.height + 16);
  panel.style.right  = `${rightPx}px`;
  panel.style.bottom = `${bottomPx}px`;
}

/* ═ Check if preroll should be shown ═ */
function shouldShowPreroll(){
  const lastShown = localStorage.getItem('fg_preroll_last_shown');
  if (!lastShown) {
    console.log('[FanGuru] No preroll timestamp found - showing preroll');
    return true;
  }
  const lastShownTime = parseInt(lastShown, 10);
  if (isNaN(lastShownTime)) {
    console.log('[FanGuru] Invalid timestamp in storage - clearing and showing preroll');
    localStorage.removeItem('fg_preroll_last_shown');
    return true;
  }
  const timeSince = Date.now() - lastShownTime;
  const shouldShow = timeSince > PREROLL_COOLDOWN;
  console.log('[FanGuru] Time since last preroll:', Math.floor(timeSince/1000/60), 'minutes | Should show:', shouldShow);
  return shouldShow;
}

/* ═ Show preroll video ═ */
function showPreroll(onComplete){
  if (!panel) {
    console.error('[FanGuru] Cannot show preroll - panel not initialized');
    return;
  }
  console.log('[FanGuru] Showing preroll video');

  const overlay = document.createElement("div");
  overlay.id = "preroll-overlay";
  overlay.innerHTML = `
    <div class="preroll-content">
      <div class="preroll-header">
        <span class="preroll-skip" id="preroll-skip">Überspringen ✕</span>
      </div>
      <iframe
        id="preroll-iframe"
        src="https://www.youtube.com/embed/${PREROLL_VIDEO}?autoplay=1&modestbranding=1&rel=0"
        frameborder="0"
        allow="autoplay; encrypted-media"
        allowfullscreen>
      </iframe>
    </div>
  `;
  panel.appendChild(overlay);

  const skip = () => {
    overlay.remove();
    localStorage.setItem('fg_preroll_last_shown', Date.now().toString());
    if (typeof onComplete === 'function') onComplete();
  };

  overlay.querySelector("#preroll-skip").onclick = skip;

  // Auto-close after video ends (approximate 30 seconds)
  setTimeout(skip, 30000);
}

/* ═ פתיחה ═ */
function openPanel(){
  panel.classList.add("open");
  positionPanel();

  // Check if preroll should be shown (after panel animation)
  if (shouldShowPreroll()) {
    setTimeout(() => showPreroll(), 300);
  }
}

/* ═ סגירת פאנל ═ */
function closePanel(){
  panel?.classList.remove("open");
}

/* ═ Toggle Dark Mode ═ */
function toggleDarkMode(){
  darkMode = !darkMode;
  localStorage.setItem("fg_dark_mode", darkMode.toString());

  const sunIcon = panel.querySelector(".sun-icon");
  const moonIcon = panel.querySelector(".moon-icon");

  if (darkMode) {
    panel.classList.add("dark-mode");
    // Show sun icon in dark mode
    sunIcon.style.display = "block";
    moonIcon.style.display = "none";
  } else {
    panel.classList.remove("dark-mode");
    // Show moon icon in light mode
    sunIcon.style.display = "none";
    moonIcon.style.display = "block";
  }
}

/* ═ PANEL עם Hero + Sponsor Banner ═ */
function makePanel(){
  panel = document.createElement("div"); panel.id="cpanel"; panel.dir="ltr";

  const voiceAgentButton = isVoiceAgentPage ? '<button id="voice-agent-btn" title="Sprachanruf starten">📞</button>' : '';

  panel.innerHTML = `
    <div id="chead" class="panel-blur-wrap">
      <div class="hero">
        <div class="hero-bg"></div>
        <div class="hero-overlay"></div>
        <div class="hero-content">
          <div class="hero-left">
            <img class="hero-avatar" src="${Pini.avatar}" alt="Chef">
            <div class="hero-text">
              <div class="hero-title">Felix Scheel</div>
              <div class="hero-sub">Ask abything about recipes and cooking</div>
            </div>
          </div>
        </div>
        <div class="hero-controls-left">
          <span id="cback" title="Zurück">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 1L3 7L10 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </div>
        <div class="hero-controls-right">
          <span id="dark-mode-toggle" title="Toggle Dark Mode" style="cursor: pointer;">
            <svg class="moon-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: ${darkMode ? 'none' : 'block'};">
              <path d="M14 8.5C13.5 11.5 10.5 14 7 14C3.5 14 1 11.5 1 8C1 4.5 3.5 2 7 2C7.5 2 8 2 8.5 2.5C6.5 3 5 5 5 7.5C5 10.5 7.5 13 10.5 13C11.5 13 12.5 12.5 13.5 12C13.5 12.5 13.5 13 14 8.5Z" stroke="currentColor" stroke-width="1.2" fill="none"/>
            </svg>
            <svg class="sun-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: ${darkMode ? 'block' : 'none'};">
              <circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.2" fill="none"/>
              <path d="M8 1V2M8 14V15M15 8H14M2 8H1M12.5 12.5L11.8 11.8M4.2 4.2L3.5 3.5M12.5 3.5L11.8 4.2M4.2 11.8L3.5 12.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
          </span>
          <span id="cclose" title="Schließen">✕</span>
        </div>
      </div>

      <!-- Sponsor Banner -->
      <div id="sponsor">
        <img class="sponsor-img" src="${SPONSOR_IMG}" alt="ZWILLING">
        <div class="sponsor-copy"><b>ZWILLING Motion Töpfe</b> – 15% Rabatt <a href="https://www.zwilling.com/us/zwilling/cookware/" target="_blank" style="color:#fff;text-decoration:underline;">Jetzt kaufen</a></div>
      </div>

      <!-- Mode Selector -->
      <div id="mode-selector">
        <div class="mode-label">Choose your chat mode</div>
        <div class="mode-buttons">
          <button class="mode-btn active" data-mode="chat">💬 Chat</button>
          <button class="mode-btn" data-mode="voice">🎤 Language</button>
        </div>
        <div class="powered-by-container">
          <img class="powered-by-img" src="${POWERED_BY_URL}" alt="Powered by FanGuru">
        </div>
      </div>
    </div>

    <div id="cmsgs" class="panel-blur-wrap"></div>

    <div id="cinput" class="panel-blur-wrap">
      <input id="chat-input" placeholder="White a message...">
      <button id="send-btn">Send</button>
      <button id="voice-btn" title="Sprachaufnahme">🎤</button>
      ${voiceAgentButton}
    </div>

    <div id="bottom-profile">
      <img class="bottom-avatar" src="${Pini.avatar}" alt="Chef Felix">
      <div class="bottom-text">
        <div class="bottom-title">Chef Felix</div>
        <div class="bottom-sub">Recipes, techniques and cooking tips</div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // איפוס שיחה בכל טעינת עמוד
  hist = [];
  panel.querySelector("#cmsgs").innerHTML = "";

  panel.querySelector("#send-btn").onclick = send;
  panel.querySelector("#voice-btn").onclick = toggleVoiceRecording;
  const inputEl = panel.querySelector("#chat-input");
  inputEl.addEventListener("keydown",e=>e.key==="Enter"&&send());
  panel.querySelector("#cback").onclick = closePanel;
  panel.querySelector("#cclose").onclick = closePanel;
  panel.querySelector("#dark-mode-toggle").onclick = toggleDarkMode;
  document.addEventListener("keydown",e=>{ if(e.key==="Escape") closePanel(); });

  // Apply dark mode if enabled (optional for future use)
  if (darkMode) {
    panel.classList.add("dark-mode");
  }

  // Voice agent button (only on specific page)
  if (isVoiceAgentPage) {
    panel.querySelector("#voice-agent-btn").onclick = openVoiceAgent;
  }

  // Mode selector event listeners
  panel.querySelectorAll(".mode-btn").forEach(btn => {
    btn.onclick = () => {
      chatMode = btn.dataset.mode;
      panel.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      console.log('[FanGuru] Mode switched to:', chatMode);
    };
  });

  render("Willkommen! Ich bin dein KI-Koch-Assistent. Frag mich alles über Rezepte und Kochen!", "in", false);
  positionPanel();
}

/* ═ Renderers ═ */
function render(text, cls, save=true){
  const wrap=document.createElement("div"); wrap.className="wrap";
  if(cls==="out") wrap.classList.add("user-msg");
  const msg=document.createElement("div"); msg.className=`msg ${cls}`; msg.textContent=text;
  if(cls==="in"){
    const img=document.createElement("img"); img.src=Pini.avatar; img.alt="Pini";
    wrap.append(img,msg);
  } else wrap.append(msg);
  panel.querySelector("#cmsgs").appendChild(wrap);
  panel.querySelector("#cmsgs").scrollTop = 9e9;
  if(cls==="in") ding.play();
  if(save) hist.push({role: cls==="out"?"user":"assistant", content: text});
}

function renderVoice(url, save=true){
  const wrap=document.createElement("div"); wrap.className="wrap";
  const img=document.createElement("img"); img.src=Pini.avatar; img.alt="Pini";

  const container=document.createElement("div"); container.className="voice-bubble";
  const audio=new Audio(url); let playing=false;

  const playBtn=document.createElement("div"); playBtn.className="play-btn"; playBtn.textContent="▶";
  const bar=document.createElement("div"); bar.className="bar";
  const fill=document.createElement("div"); fill.className="fill"; bar.appendChild(fill);
  const time=document.createElement("span"); time.textContent="0:00";

  playBtn.onclick=()=>{
    if(!playing){ audio.play(); playing=true; playBtn.textContent="⏸"; }
    else{ audio.pause(); playing=false; playBtn.textContent="▶"; }
  };
  audio.addEventListener("timeupdate",()=>{
    const dur = audio.duration || 0, cur = audio.currentTime || 0;
    fill.style.width = (dur ? (cur/dur)*100 : 0) + "%";
    time.textContent = formatTime(cur);
  });
  audio.addEventListener("ended",()=>{ playing=false; playBtn.textContent="▶"; fill.style.width="0%"; });

  container.append(playBtn,bar,time);
  wrap.append(img,container);
  panel.querySelector("#cmsgs").appendChild(wrap);
  panel.querySelector("#cmsgs").scrollTop=9e9; ding.play();
  if(save) hist.push({role:"assistant", content:`[AUDIO] ${url}`});
}

function showAnim(mode="typing"){
  const wrap=document.createElement("div"); wrap.className="wrap";
  const img=document.createElement("img"); img.src=Pini.avatar; img.alt="Pini";
  const anim=document.createElement("div"); anim.className=`msg in ${mode}`;
  anim.innerHTML = mode==="typing" ? "<span></span><span></span><span></span>" : "<span>🎤</span>";
  wrap.append(img,anim); panel.querySelector("#cmsgs").appendChild(wrap);
  panel.querySelector("#cmsgs").scrollTop=9e9; return wrap;
}
function formatTime(sec){ const m=Math.floor(sec/60), s=Math.floor(sec%60).toString().padStart(2,"0"); return `${m}:${s}`; }

/* ═ Voice Recording (WhatsApp Style) ═ */
async function toggleVoiceRecording() {
  if (!isRecording) {
    // Start recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        await processVoiceInput(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      isRecording = true;
      recordingStartTime = Date.now();
      showRecordingIndicator();
      console.log('[FanGuru] Recording started');
    } catch (error) {
      console.error('[FanGuru] Microphone access error:', error);
      render("⚠️ Mikrofon-Zugriff verweigert", "in", false);
    }
  } else {
    // Stop recording
    mediaRecorder.stop();
    isRecording = false;
    console.log('[FanGuru] Recording stopped');
  }
}

function showRecordingIndicator() {
  const inputArea = panel.querySelector("#cinput");
  const voiceBtn = panel.querySelector("#voice-btn");

  // Add recording class to input area
  inputArea.classList.add("recording-active");

  // Create voice visualizer
  const visualizer = document.createElement("div");
  visualizer.className = "voice-visualizer";
  visualizer.innerHTML = `
    <div class="voice-bar"></div>
    <div class="voice-bar"></div>
    <div class="voice-bar"></div>
    <div class="voice-bar"></div>
  `;

  // Create timer
  const timer = document.createElement("div");
  timer.className = "recording-timer-inline";
  timer.textContent = "0:00";

  // Insert visualizer and timer before voice button
  voiceBtn.parentNode.insertBefore(visualizer, voiceBtn);
  voiceBtn.parentNode.insertBefore(timer, voiceBtn);

  // Update timer
  const timerInterval = setInterval(() => {
    if (!isRecording) {
      clearInterval(timerInterval);
      return;
    }
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    timer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, 100);

  // Store interval for cleanup
  inputArea.dataset.timerInterval = timerInterval;
}

function removeRecordingIndicator() {
  const inputArea = panel.querySelector("#cinput");
  if (!inputArea) return;

  // Clear timer interval
  if (inputArea.dataset.timerInterval) {
    clearInterval(parseInt(inputArea.dataset.timerInterval));
    delete inputArea.dataset.timerInterval;
  }

  // Remove recording class
  inputArea.classList.remove("recording-active");

  // Remove visualizer and timer
  const visualizer = panel.querySelector(".voice-visualizer");
  const timer = panel.querySelector(".recording-timer-inline");
  if (visualizer) visualizer.remove();
  if (timer) timer.remove();
}

function showProcessingIndicator() {
  const inputArea = panel.querySelector("#cinput");
  inputArea.classList.add("processing-active");
}

function removeProcessingIndicator() {
  const inputArea = panel.querySelector("#cinput");
  if (inputArea) {
    inputArea.classList.remove("processing-active");
  }
}

async function processVoiceInput(audioBlob) {
  // Skip if audioChunks was cleared (canceled)
  if (audioChunks.length === 0) {
    removeRecordingIndicator();
    return;
  }

  // Remove recording indicator but keep processing indicator
  removeRecordingIndicator();
  showProcessingIndicator();

  // Show animation based on current mode: typing for chat mode, mic for voice mode
  const anim = showAnim(chatMode === "voice" ? "mic" : "typing");

  try {
    // Convert blob to base64
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);

    reader.onloadend = async () => {
      const base64Audio = reader.result;

      // Send to STT API
      console.log('[FanGuru] Transcribing audio...');
      const sttResponse = await fetch(API_ENDPOINT.replace('/chat', '/speech-to-text'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64Audio })
      });

      if (!sttResponse.ok) {
        throw new Error('STT failed');
      }

      const { text } = await sttResponse.json();
      console.log('[FanGuru] Transcribed text:', text);

      if (!text || text.trim() === '') {
        anim.remove();
        removeProcessingIndicator();
        render("⚠️ Keine Sprache erkannt", "in", false);
        return;
      }

      // Show user's transcribed message
      render(text, "out");

      // Get AI response - keep animation visible
      const aiResponse = await askAI();

      // Render response based on mode
      if (chatMode === "voice") {
        // Voice mode: only voice response
        console.log('[FanGuru] Converting response to speech...');
        const ttsResponse = await fetch(API_ENDPOINT.replace('/chat', '/text-to-speech'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: aiResponse })
        });

        if (!ttsResponse.ok) {
          throw new Error('TTS failed');
        }

        const { audio: audioUrl } = await ttsResponse.json();
        console.log('[FanGuru] Playing voice response');

        // Remove animation and processing indicator only after everything is done
        anim.remove();
        removeProcessingIndicator();
        renderVoice(audioUrl);
      } else {
        // Chat mode: only text response
        anim.remove();
        removeProcessingIndicator();
        render(aiResponse, "in");
      }
    };
  } catch (error) {
    console.error('[FanGuru] Voice processing error:', error);
    anim.remove();
    removeProcessingIndicator();
    render("⚠️ Sprachverarbeitung fehlgeschlagen", "in", false);
  }
}

/* ═ שליחה ═ */
async function send(){
  const inp=panel.querySelector("#chat-input"); const user=inp.value.trim(); if(!user) return;
  render(user,"out"); inp.value="";

  const qa = Pini.qa.find(q=>q.r.test(user));
  if(qa){
    const anim=showAnim(qa.type==="audio"||qa.type==="combo"?"mic":"typing");
    const delay=qa.type==="audio"?3000:(qa.type==="combo"?1500:1200);
    setTimeout(()=>{
      anim.remove();
      if(qa.type==="audio"){ renderVoice(qa.content); }
      else if(qa.type==="combo"){
        render(qa.text,"in",true);
        setTimeout(()=>renderVoice(qa.audio,true),1100);
      } else { render(qa.content,"in",true); }
    },delay);
    return;
  }

  // Show animation based on current mode
  console.log('[FanGuru] Current chat mode:', chatMode);
  const anim=showAnim(chatMode === "voice" ? "mic" : "typing");
  try{
    const res=await askAI();
    anim.remove();

    // Render response based on mode
    console.log('[FanGuru] Rendering response in mode:', chatMode);
    if (chatMode === "voice") {
      // Voice mode: convert to speech
      console.log('[FanGuru] Converting response to speech...', res);
      const ttsResponse = await fetch(API_ENDPOINT.replace('/chat', '/text-to-speech'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: res })
      });

      console.log('[FanGuru] TTS response status:', ttsResponse.status);

      if (ttsResponse.ok) {
        const { audio: audioUrl } = await ttsResponse.json();
        console.log('[FanGuru] Got audio URL:', audioUrl);
        renderVoice(audioUrl);
      } else {
        console.log('[FanGuru] TTS failed, showing text instead');
        render(res, "in");
      }
    } else {
      // Chat mode: show text
      console.log('[FanGuru] Chat mode - showing text');
      render(res,"in");
    }
  }catch(e){
    anim.remove();
    console.error('[FanGuru] Send error:', e);
    render("⚠️ Fehler", "in");
  }
}

async function askAI(){
  // Build system message with page context
  let systemMessage = Pini.sys;
  if (pageContext) {
    systemMessage += `\n\nAktueller Seitenkontext:\n${pageContext}\n\nVerwende diese Seiteninformationen, um relevante Antworten über das Rezept oder den Inhalt zu geben, den der Benutzer gerade ansieht.`;
  }

  const msgs = [
    { role: "system", content: systemMessage },
    ...hist
      .filter(m => !String(m.content).startsWith("[AUDIO]"))
      .map(m => ({
        role: m.role,
        content: String(m.content)
      }))
  ];

  // Use the server endpoint instead of calling OpenAI directly
  const r = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messages: msgs,
      max_tokens: 500
    })
  });

  if (!r.ok) {
    const errText = await r.text().catch(()=> "");
    throw new Error(`API error ${r.status}: ${errText}`);
  }

  const d = await r.json();
  return d.choices?.[0]?.message?.content?.trim() || "Keine Antwort.";
}

/* ═ CSS (Rethink Sans + עיצוב) ═ */
const style=document.createElement("style"); style.textContent=`
@import url('https://fonts.googleapis.com/css2?family=Rethink+Sans:wght@400;600;700&display=swap');

#fg-launcher, #cpanel, #cpanel * {
  font-family: 'Rethink Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans Hebrew', Arial, sans-serif !important;
}

/* ─ Launcher ─ */
#fg-launcher{
  position:fixed; right:2.2vw; bottom:3.2vh; display:flex; flex-direction:row; align-items:center; gap:12px; z-index: 99998;
  user-select:none; -webkit-user-drag:none;
}
#fg-launcher .fg-bubble{
  position:relative; width:60px; height:60px; cursor:pointer;
  filter:drop-shadow(0 6px 16px rgba(0,0,0,.18));
  animation:fg-float 3.5s ease-in-out infinite;
  display:flex; align-items:flex-end; justify-content:center;
  flex-shrink:0;
}
#fg-launcher .fg-avatar{
  width:100%; height:auto; object-fit:contain; display:block;
  pointer-events:none; user-select:none; -webkit-user-drag:none;
}
#fg-launcher .fg-ring{
  display:none; /* Hidden for unique chef shape */
}
#fg-launcher .fg-badge{
  position:absolute; top:-6px; right:-6px; background:#ff2d55; color:#fff; font-weight:800; font-size:12px;
  padding:4px 8px; border-radius:999px; box-shadow:0 6px 18px rgba(255,45,85,.4); transform:rotate(-10deg);
}
#fg-launcher .fg-cta{
  display:flex; align-items:center; gap:10px; background:#ffffff; border:none;
  padding:10px 16px; border-radius:999px; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,.12);
}
#fg-launcher .fg-cta-avatar{
  width:40px; height:40px; border-radius:50%; object-fit:cover;
  pointer-events:none; user-select:none; -webkit-user-drag:none; flex-shrink:0;
}
#fg-launcher .fg-cta-text{ display:flex; flex-direction:column; line-height:1.2; }
#fg-launcher .fg-cta-title{ font-size:14px; font-weight:700; color:#2E2A27; letter-spacing:0; }
#fg-launcher .fg-cta-sub{ font-size:10px; color:#2E2A27; font-weight:400; }

@keyframes fg-float{ 0%,100%{ transform:translateY(0) } 50%{ transform:translateY(-6px) } }
@keyframes fg-pulse{ 0%,100%{ opacity:.75 } 50%{ opacity:1 } }

/* ─ Panel ─ */
#cpanel{
  position:fixed; width:405px; height:745px; max-height:745px;
  background:#fff; border-radius:21px; display:flex; flex-direction:column;
  box-shadow:0 14px 40px rgba(0,0,0,.35); transform:translateY(22px); opacity:0; pointer-events:none;
  transition:.25s all ease; z-index:99999; overflow:hidden; border:1px solid #E7E7E7;
  right:2.2vw; bottom:calc(88px + 5.2vh);
}
#cpanel.open{ transform:none; opacity:1; pointer-events:auto; }

#chead{ position:relative; background:#FFFAF1; }
#chead .hero{ position:relative; height:80px; overflow:hidden; background:#FFFFFF; display:flex; align-items:center; padding:0 20px; justify-content:center; border-bottom:1px solid #E7E7E7; }
#chead .hero-bg{ display:none; }
#chead .hero-overlay{ display:none; }
#chead .hero-content{
  position:relative; display:flex; align-items:center; justify-content:space-between; width:100%;
  color:#2E2A27;
}
.hero-left{ display:flex; align-items:center; gap:10px; }
.hero-avatar{
  width:42px; height:42px; border-radius:50%; border:none;
  box-shadow:none; object-fit:cover; aspect-ratio:1/1; display:block;
}
.hero-title{ font-weight:700; font-size:15px; line-height:19px; color:#2E2A27; }
.hero-sub{ font-size:10px; line-height:19px; color:#2E2A27; font-weight:400; }
.hero-controls-left{ position:absolute; top:20px; left:20px; display:flex; align-items:center; z-index:10; }
.hero-controls-right{ position:absolute; top:20px; right:20px; display:flex; align-items:center; gap:12px; z-index:10; }
#cback, #dark-mode-toggle, #cclose{ color:#000; cursor:pointer; width:20px; height:20px; display:flex; align-items:center; justify-content:center; transition:opacity .2s; }
#cback:hover, #dark-mode-toggle:hover, #cclose:hover{ opacity:.6; }
#cclose{ font-size:20px; font-weight:400; }

/* Sponsor banner - HIDDEN in new design */
#sponsor{
  display:none;
}

/* Mode Selector */
#mode-selector{
  padding:16px; background:#FFFAF1; border-bottom:none;
}
.mode-label{
  font-size:13px; font-weight:400; line-height:15px; color:#000; margin-bottom:12px;
}
.mode-buttons{
  display:flex; gap:0;
}
.mode-btn{
  flex:1; border:0.82px solid #E7E7E7; background:#fff; color:#E7E7E7; padding:8px 16px; border-radius:163.4px;
  font-size:10.95px; font-weight:600; cursor:pointer; transition:all .2s; line-height:16px;
}
.mode-btn:first-child{ border-right:none; border-top-right-radius:0; border-bottom-right-radius:0; }
.mode-btn:last-child{ border-left:none; border-top-left-radius:0; border-bottom-left-radius:0; }
.mode-btn:hover{ background:#f9f9f9; }
.mode-btn.active{ background:#fff; color:#FF5B00; border-color:#FF5B00; box-shadow:none; border:0.82px solid #FF5B00; }
.powered-by-container{ margin-top:12px; display:flex; justify-content:center; align-items:center; }
.powered-by-img{ height:20px; width:auto; object-fit:contain; }

/* Messages */
#cmsgs{
  flex:1; overflow-y:auto; overflow-x:hidden; padding:16px; display:flex; flex-direction:column; gap:12px; background:#F7F7F7;
  position:relative;
}
/* Custom scrollbar */
#cmsgs::-webkit-scrollbar{ width:13px; }
#cmsgs::-webkit-scrollbar-track{ background:#E7E7E7; border-radius:6.5px; margin:8px 0; }
#cmsgs::-webkit-scrollbar-thumb{ background:#000; border-radius:6.5px; width:7px; border:3px solid #F7F7F7; }

.wrap{ width:100%; display:flex; justify-content:flex-start; gap:10px; align-items:flex-start; }
.wrap.user-msg{ justify-content:flex-end; }
.wrap img{
  width:37px; height:37px; border-radius:50%; box-shadow:none;
  object-fit:cover; aspect-ratio:1/1; display:block; flex-shrink:0;
}
.msg{ max-width:304px; padding:10px 14px; font-size:13px; border-radius:13px; direction:ltr; text-align:left; line-height:17px; font-weight:400; color:#000; }
.out{ background:#D0EFFE; border:none; }
.in{ background:#FFFFFF; border:none; }

/* Typing */
.typing span{ width:6px; height:6px; background:#888; border-radius:50%; display:inline-block; animation:b 1.4s infinite; }
@keyframes b{0%,80%,100%{opacity:.2;}40%{opacity:1;}}
.in.mic span{ font-size:20px; color:#d22; background:none; }

/* Voice bubble */
.voice-bubble{ display:flex; align-items:center; gap:12px; background:#fff; border:none;
  padding:10px 14px; border-radius:13px; min-width:190px; max-width:304px; box-shadow:none;}
.play-btn{ cursor:pointer; font-size:18px; width:30px; height:30px; display:flex; align-items:center; justify-content:center;
  border-radius:50%; background:#FF5B00; color:#fff; box-shadow:none;}
.bar{ flex:1; height:4px; background:#E7E7E7; border-radius:2px; position:relative; overflow:hidden;}
.fill{ position:absolute; top:0; left:0; height:100%; background:#FF5B00; width:0; transition:width .2s linear;}
.voice-bubble span{ font-size:13px; color:#000; min-width:40px; text-align:left; }

/* Input */
#cinput{ display:flex; gap:8px; padding:14px 16px; border-top:none; background:#FFF6E9; align-items:center; }
#cinput #chat-input{ flex:1; border:none; border-radius:36.5px; padding:12px 18px; font-size:13px; direction:ltr; text-align:left; min-width:0; background:#fff; color:#E7E7E7; }
#cinput #chat-input::placeholder{ color:#E7E7E7; font-weight:400; font-size:13px; line-height:19px; }
#cinput #chat-input:focus{ outline:none; }
#cinput #send-btn{ border:none; background:#FF5B00; color:#FFFAF1; padding:12px 20px; border-radius:200px; cursor:pointer; font-weight:600; font-size:13px; white-space:nowrap; flex-shrink:0; line-height:19px; }
#cinput #send-btn:hover{ background:#e55200; }
#cinput #voice-btn{ border:none; background:#2E2A27; color:#fff; padding:10px; border-radius:50%; cursor:pointer; font-size:17px; transition:all .2s; flex-shrink:0; width:37px; height:37px; display:flex; align-items:center; justify-content:center; }
#cinput #voice-btn:hover{ background:#1a1816; transform:scale(1.05); }
#cinput #voice-agent-btn{ border:none; background:#2E2A27; color:#fff; padding:10px; border-radius:50%; cursor:pointer; font-size:17px; transition:all .2s; flex-shrink:0; width:37px; height:37px; display:flex; align-items:center; justify-content:center; }
#cinput #voice-agent-btn:hover{ background:#1a1816; transform:scale(1.05); }
#cinput.recording-active #voice-btn{ background:#ff2d55; animation:pulse-mic 1.5s ease-in-out infinite; }
#cinput.processing-active #voice-btn{ background:#ccc; pointer-events:none; opacity:0.6; }
#cinput.recording-active #chat-input, #cinput.recording-active #send-btn, #cinput.recording-active #voice-agent-btn{ display:none; }
#cinput.processing-active #chat-input, #cinput.processing-active #send-btn, #cinput.processing-active #voice-agent-btn{ display:none; }

/* Voice Visualizer (WhatsApp style) */
.voice-visualizer{
  display:flex; align-items:center; gap:3px; height:24px;
}
.voice-bar{
  width:3px; background:#ff2d55; border-radius:2px; height:100%;
  animation:voice-wave 1.2s ease-in-out infinite;
}
.voice-bar:nth-child(1){ animation-delay:0s; }
.voice-bar:nth-child(2){ animation-delay:0.2s; }
.voice-bar:nth-child(3){ animation-delay:0.4s; }
.voice-bar:nth-child(4){ animation-delay:0.6s; }
@keyframes voice-wave{
  0%,100%{ height:6px; }
  50%{ height:24px; }
}

/* Recording Timer Inline */
.recording-timer-inline{
  font-size:14px; font-weight:700; color:#ff2d55; font-variant-numeric:tabular-nums;
  min-width:45px; text-align:right;
}

/* Mic Button Pulse */
@keyframes pulse-mic{
  0%,100%{ transform:scale(1); }
  50%{ transform:scale(1.1); }
}

/* Bottom Profile Section */
#bottom-profile{
  display:flex; align-items:center; gap:12px; padding:16px; background:#FFFAF1; border-radius:0 0 21px 21px; border-top:1px solid #E7E7E7;
}
.bottom-avatar{
  width:67px; height:67px; border-radius:50%; object-fit:cover; aspect-ratio:1/1; display:block;
}
.bottom-text{ display:flex; flex-direction:column; }
.bottom-title{ font-size:19.01px; font-weight:700; line-height:19px; color:#2E2A27; }
.bottom-sub{ font-size:13px; font-weight:400; line-height:19px; color:#2E2A27; }

/* Preroll overlay */
#preroll-overlay{
  position:absolute; inset:0; background:rgba(0,0,0,.95); z-index:100000;
  display:flex; align-items:center; justify-content:center; border-radius:18px;
}
.preroll-content{
  position:relative; width:92%; aspect-ratio:16/9; background:#000;
  border-radius:12px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,.6);
}
.preroll-header{
  position:absolute; top:0; left:0; right:0; z-index:10; padding:16px;
  background:linear-gradient(180deg, rgba(0,0,0,.7) 0%, rgba(0,0,0,0) 100%);
  display:flex; justify-content:flex-end;
}
.preroll-skip{
  color:#fff; cursor:pointer; font-weight:700; font-size:14px; padding:8px 16px;
  background:rgba(255,255,255,.15); border-radius:8px; transition:background .2s;
}
.preroll-skip:hover{ background:rgba(255,255,255,.25); }
#preroll-iframe{
  width:100%; height:100%; border:none;
}


/* Voice Agent Overlay (Mobile) */
#fg-voice-agent-overlay{
  position:fixed; inset:0;
  background:linear-gradient(135deg, rgba(11,108,255,0.85) 0%, rgba(16,185,129,0.85) 100%);
  backdrop-filter:blur(50px) saturate(200%);
  -webkit-backdrop-filter:blur(50px) saturate(200%);
  z-index:999998; display:flex; align-items:center; justify-content:center;
  animation:fg-overlay-fade-in 0.3s ease;
}
@keyframes fg-overlay-fade-in{
  from{ opacity:0; }
  to{ opacity:1; }
}
.fg-voice-agent-content{
  position:relative; width:100%; height:100%; display:flex; align-items:center; justify-content:center;
}
#fg-voice-agent-widget-container{
  width:100%; height:100%; display:flex; align-items:center; justify-content:center;
  background:rgba(255,255,255,0.05); border-radius:20px; padding:20px;
  box-shadow:0 8px 32px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.2);
}
.fg-voice-agent-close{
  position:absolute; top:20px; right:20px; z-index:10;
  background:rgba(255,255,255,0.25); color:#0b2343; border:2px solid rgba(255,255,255,0.3);
  width:48px; height:48px; border-radius:50%; font-size:24px; font-weight:700;
  cursor:pointer; display:flex; align-items:center; justify-content:center;
  transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow:0 4px 12px rgba(0,0,0,0.15);
}
.fg-voice-agent-close:hover{
  background:rgba(255,255,255,0.4); transform:scale(1.1) rotate(90deg);
  box-shadow:0 6px 20px rgba(0,0,0,0.2);
}

/* Login Screen */
#fg-login-overlay{
  position:fixed; inset:0; background:linear-gradient(135deg, #0b2343 0%, #1a3a5c 100%);
  z-index:999999; display:flex; align-items:center; justify-content:center;
  font-family: 'Heebo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.fg-login-box{
  background:#fff; padding:40px; border-radius:20px; box-shadow:0 20px 60px rgba(0,0,0,0.3);
  width:90%; max-width:400px; text-align:center;
}
.fg-login-logo{
  width:80px; height:auto; margin:0 auto 20px;
}
.fg-login-title{
  font-size:24px; font-weight:800; color:#0b2343; margin:0 0 8px;
}
.fg-login-subtitle{
  font-size:14px; color:#41556f; margin:0 0 30px;
}
.fg-login-form{
  display:flex; flex-direction:column; gap:12px;
}
.fg-login-form input{
  border:1px solid #cfd8e3; border-radius:12px; padding:14px 16px;
  font-size:15px; font-family:inherit;
}
.fg-login-form input:focus{
  outline:none; border-color:#0b6cff; box-shadow:0 0 0 3px rgba(11,108,255,0.1);
}
.fg-login-error{
  color:#ff2d55; font-size:13px; min-height:20px; font-weight:600;
}
#fg-login-btn{
  background:#0b6cff; color:#fff; border:none; border-radius:12px;
  padding:14px 24px; font-size:16px; font-weight:700; cursor:pointer;
  transition:all 0.2s; font-family:inherit;
}
#fg-login-btn:hover{
  background:#0957cc; transform:translateY(-1px); box-shadow:0 4px 12px rgba(11,108,255,0.3);
}

/* מובייל */
@media (max-width: 640px){
  #fg-launcher{ flex-direction:column; gap:8px; align-items:flex-end; }
  #fg-launcher .fg-cta{
    display:flex !important;
    background:#fff;
    border:none;
    box-shadow:0 4px 12px rgba(0,0,0,0.12);
    padding:10px 16px;
  }
  #fg-launcher .fg-cta-avatar{ width:40px; height:40px; }
  #fg-launcher .fg-cta-text{ color:#2E2A27; }
  #fg-launcher .fg-cta-title{ color:#2E2A27; font-size:14px; }
  #fg-launcher .fg-cta-sub{ color:#2E2A27; font-size:10px; }
  #fg-launcher .fg-bubble{
    width:60px;
    height:60px;
    filter:drop-shadow(0 6px 16px rgba(0,0,0,.18));
  }
  #cpanel{
    width:100vw !important;
    height:100vh !important;
    max-height:100vh !important;
    left:0 !important;
    bottom:0 !important;
    border-radius:0 !important;
  }
  #cclose{
    position:fixed !important;
    top:20px !important;
    left:20px !important;
    z-index:100001 !important;
    background:rgba(0,0,0,0.7) !important;
    width:40px !important;
    height:40px !important;
    border-radius:50%;
    display:flex !important;
    align-items:center;
    justify-content:center;
    font-size:22px !important;
  }
  .preroll-content{ width:95%; }
  .fg-login-box{ padding:30px 25px; }
}

/* ═══════════════════════════════════════════ */
/* DARK MODE STYLES */
/* ═══════════════════════════════════════════ */
#cpanel.dark-mode {
  background:#000;
  border-color:#A9A9A9;
}

/* Header - Dark Mode */
#cpanel.dark-mode #chead { background:#000; }
#cpanel.dark-mode #chead .hero { background:#383838; border-bottom-color:#000; }
#cpanel.dark-mode .hero-title,
#cpanel.dark-mode .hero-sub,
#cpanel.dark-mode .hero-powered,
#cpanel.dark-mode .hero-powered span { color:#FFF; }
#cpanel.dark-mode #cback,
#cpanel.dark-mode #dark-mode-toggle,
#cpanel.dark-mode #cclose { color:#FFF; }

/* Mode Selector - Dark Mode */
#cpanel.dark-mode #mode-selector { background:#000; }
#cpanel.dark-mode .mode-btn { background:#272728; border-color:#646464; color:#646464; }
#cpanel.dark-mode .mode-btn.active { background:#272728; color:#FF5B00; border-color:#FF5B00; }

/* Messages Area - Dark Mode */
#cpanel.dark-mode #cmsgs { background:#151515; }
#cpanel.dark-mode #cmsgs::-webkit-scrollbar-track { background:#000; }
#cpanel.dark-mode #cmsgs::-webkit-scrollbar-thumb { background:#A9A9A9; border-color:#151515; }

/* Message Bubbles - Dark Mode */
#cpanel.dark-mode .msg.in { background:#202222; color:#FFF; }
#cpanel.dark-mode .msg.out { background:#3D5E6E; color:#FFF; }
#cpanel.dark-mode .voice-bubble { background:#202222; }
#cpanel.dark-mode .voice-bubble span { color:#FFF; }
#cpanel.dark-mode .bar { background:#000; }
#cpanel.dark-mode .fill { background:#FF5B00; }

/* Input Area - Dark Mode */
#cpanel.dark-mode #cinput { background:#000; }
#cpanel.dark-mode #chat-input { background:#272728; border-color:#A9A9A9; color:#FFF; }
#cpanel.dark-mode #chat-input::placeholder { color:#515151; }
#cpanel.dark-mode #voice-btn,
#cpanel.dark-mode #voice-agent-btn { background:#272728; color:#A9A9A9; }

/* Bottom Profile - Dark Mode */
#cpanel.dark-mode #bottom-profile { background:#000; border-top-color:#000; }
#cpanel.dark-mode .bottom-title,
#cpanel.dark-mode .bottom-sub { color:#FFF; }

/* Mode Selector Label - Dark Mode */
#cpanel.dark-mode #mode-selector::before {
  content: "Choose your chat mode";
  position: absolute;
  left: 16px;
  top: -20px;
  font-size: 13px;
  line-height: 15px;
  color: #A9A9A9;
  font-weight: 400;
}
`; document.head.appendChild(style);

/* ─ Draggable launcher ─ */
function makeDraggable(el, key, onStop){
  const saved = localStorage.getItem(key);
  if(saved){
    try {
      const pos = JSON.parse(saved);
      if (pos.right) el.style.right = pos.right;
      if (pos.bottom) el.style.bottom = pos.bottom;
    } catch {}
  }
  let sX=0, sY=0, bR=0, bB=0, dragging=false, wasMoved=false;
  const onDown = (e)=>{
    const t = e.touches ? e.touches[0] : e;
    dragging = true; wasMoved = false; sX = t.clientX; sY = t.clientY;
    const cs = getComputedStyle(el);
    bR = parseFloat(cs.right); bB = parseFloat(cs.bottom);
    el.style.cursor = 'grabbing';
  };
  const onMove = (e)=>{
    if(!dragging) return;
    const t = e.touches ? e.touches[0] : e;
    const dX = t.clientX - sX; const dY = t.clientY - sY;
    // Only start dragging if moved more than 5px (prevent accidental drag on click)
    if(Math.abs(dX) > 5 || Math.abs(dY) > 5){
      wasMoved = true;
      e.preventDefault();
      el.style.right  = Math.max(8, bR - dX) + "px";
      el.style.bottom = Math.max(8, bB - dY) + "px";
    }
  };
  const onUp = ()=>{
    if(!dragging) return;
    dragging=false;
    el.style.cursor = 'grab';
    if(wasMoved){
      localStorage.setItem(key, JSON.stringify({ right: el.style.right, bottom: el.style.bottom }));
      if (typeof onStop === "function") onStop();
    }
  };
  el.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove, {passive:false});
  window.addEventListener("mouseup", onUp);

  // Set initial cursor
  el.style.cursor = 'grab';
}

/* ═ שליחה ═ */


/* Voice Agent Functions */
function openVoiceAgent() {
  // Create fullscreen overlay for mobile
  const isMobile = window.innerWidth <= 640;

  if (isMobile) {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'fg-voice-agent-overlay';
    overlay.innerHTML = `
      <div class="fg-voice-agent-content">
        <button id="fg-voice-agent-close" class="fg-voice-agent-close">✕</button>
        <div id="fg-voice-agent-widget-container"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector('#fg-voice-agent-close');
    const container = overlay.querySelector('#fg-voice-agent-widget-container');

    closeBtn.onclick = () => {
      overlay.remove();
    };

    // Check if widget is already loaded
    let widget = document.querySelector('elevenlabs-convai');

    if (!widget) {
      // Create the widget element
      widget = document.createElement('elevenlabs-convai');
      widget.setAttribute('agent-id', 'agent_3901k6wsg096e5as4db3jgxty41j');
      container.appendChild(widget);

      // Load the script if not already loaded
      if (!document.querySelector('script[src*="elevenlabs"]')) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed';
        script.async = true;
        script.type = 'text/javascript';
        document.body.appendChild(script);

        // Wait for script to load then trigger widget
        script.onload = () => {
          setTimeout(() => {
            const btn = widget?.shadowRoot?.querySelector('button');
            if (btn) btn.click();
          }, 500);
        };
      } else {
        // Script already loaded, just trigger the widget
        setTimeout(() => {
          const btn = widget?.shadowRoot?.querySelector('button');
          if (btn) btn.click();
        }, 300);
      }
    } else {
      // Move existing widget to container
      container.appendChild(widget);
      setTimeout(() => {
        const btn = widget?.shadowRoot?.querySelector('button');
        if (btn) btn.click();
      }, 300);
    }
  } else {
    // Desktop: original behavior
    // Check if widget is already loaded
    if (!document.querySelector('elevenlabs-convai')) {
      // Create the widget element
      const widget = document.createElement('elevenlabs-convai');
      widget.setAttribute('agent-id', 'agent_3901k6wsg096e5as4db3jgxty41j');
      document.body.appendChild(widget);

      // Load the script if not already loaded
      if (!document.querySelector('script[src*="elevenlabs"]')) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed';
        script.async = true;
        script.type = 'text/javascript';
        document.body.appendChild(script);

        // Wait for script to load then trigger widget
        script.onload = () => {
          setTimeout(() => {
            const btn = document.querySelector('elevenlabs-convai')?.shadowRoot?.querySelector('button');
            if (btn) btn.click();
          }, 500);
        };
      } else {
        // Script already loaded, just trigger the widget
        setTimeout(() => {
          const btn = document.querySelector('elevenlabs-convai')?.shadowRoot?.querySelector('button');
          if (btn) btn.click();
        }, 300);
      }
    } else {
      // Widget exists, just click it
      const btn = document.querySelector('elevenlabs-convai')?.shadowRoot?.querySelector('button');
      if (btn) btn.click();
    }
  }
}

/* הסרת Glassix אם קיים */
new MutationObserver(()=>{const g=document.querySelector('#glassix-widget-launcher-closed-wrapper');if(g)g.remove();})
.observe(document.body,{childList:true,subtree:true});

/* ═ Start Application ═ */
if (checkAuth()) {
  initApp();
} else {
  showLoginScreen();
}


