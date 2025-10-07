
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
const AVATAR_URL  = "https://www.eatclub.de/wp-content/uploads/2022/02/foto-felix-300x300.jpg";
const LOGO_URL    = "https://i.ibb.co/Xfk11T1V/Chat-GPT-Image-Oct-6-2025-03-37-25-PM-removebg-preview.png";
const SPONSOR_IMG = "https://www.zwilling.com/dw/image/v2/BCGV_PRD/on/demandware.static/-/Sites-zwilling-master-catalog/default/dw55beb4c8/images/large/1010887_1.jpg";
const PREROLL_VIDEO = "V_A-am90kzg"; // YouTube video ID
const PREROLL_COOLDOWN = 60 * 60 * 1000; // 1 hour in milliseconds

const BASE_RULES = `Wichtig:
- Erfinde keine Fakten oder Zahlen.
- Wenn du keine Informationen hast, sag es.
- Du kannst veraltete Daten verwenden, aber warne, dass sie nicht aktuell sind.
- Bevorzuge Fakten gegenüber Meinungen.
- WICHTIG: Antworte IMMER in der gleichen Sprache, in der der Benutzer die Frage gestellt hat. Wenn der Benutzer auf Englisch fragt, antworte auf Englisch. Wenn auf Deutsch, antworte auf Deutsch.`;

/* ═ Chef Agent ═ */
const Pini = {
  id: "chef",
  name: "Chef",
  avatar: AVATAR_URL,
  sys: `${BASE_RULES} Du bist ein professioneller Koch-Assistent. Hilf Benutzern mit Rezepten, Kochtechniken, Zutatenersatz und kulinarischen Fragen. Halte die Antworten präzise und praktisch. IMPORTANT: Always respond in the SAME language the user asks in (English for English questions, German for German questions).`,
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
const VOICE_AGENT_PATH = "/rezept/kraeuter-pasta-chorizo-crunch";
const isVoiceAgentPage = window.location.pathname.includes(VOICE_AGENT_PATH);

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

// Extract context when script loads
pageContext = getPageContext();


/* ═ לאנצ'ר + TOGGLE + גרירה ═ */
(function makeLauncher(){
  launcher = document.createElement("div");
  launcher.id = "fg-launcher";
  launcher.innerHTML = `
    <div class="fg-bubble" title="Chef Felix">
      <img class="fg-avatar" src="${Pini.avatar}" alt="Chef">
      <div class="fg-ring"></div>
    </div>
    <div class="fg-cta">
      <img class="fg-logo" src="${LOGO_URL}" alt="FanGuru">
      <div class="fg-cta-text">
        <div class="fg-cta-title">Chef Felix</div>
        <div class="fg-cta-sub">Rezepte, Techniken und Kochtipps</div>
      </div>
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

  makeDraggable(launcher, "fg_launcher_pos", positionPanel);
  window.addEventListener("resize", ()=>{ if(panel) positionPanel(); }, {passive:true});
})();

/* ═ מיקום הפאנל צמוד לבועה ═ */
function positionPanel(){
  if(!panel || !launcher) return;
  const r = launcher.getBoundingClientRect();
  const leftPx   = Math.max(8, r.left);
  const bottomPx = Math.max(16, (window.innerHeight - r.bottom) + r.height + 16);
  panel.style.left   = `${leftPx}px`;
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
              <div class="hero-title">Felix Scheel • Live AI</div>
              <div class="hero-sub">Frag alles über Rezepte und Kochen</div>
            </div>
          </div>
          <div class="hero-right">
            <a href="https://www.fanguru.ai" target="_blank" class="hero-powered">
              <span>Powered by</span>
              <img class="hero-logo" src="${LOGO_URL}" alt="FanGuru">
            </a>
          </div>
        </div>
        <span id="cclose" title="Schließen">✕</span>
      </div>

      <!-- Sponsor Banner -->
      <div id="sponsor">
        <img class="sponsor-img" src="${SPONSOR_IMG}" alt="ZWILLING">
        <div class="sponsor-copy"><b>ZWILLING Motion Töpfe</b> – 15% Rabatt <a href="https://www.zwilling.com/us/zwilling/cookware/" target="_blank" style="color:#fff;text-decoration:underline;">Jetzt kaufen</a></div>
      </div>

      <!-- Mode Selector -->
      <div id="mode-selector">
        <button class="mode-btn active" data-mode="chat">💬 Chat</button>
        <button class="mode-btn" data-mode="voice">🎤 Sprache</button>
      </div>
    </div>

    <div id="cmsgs" class="panel-blur-wrap"></div>

    <div id="cinput" class="panel-blur-wrap">
      <input id="chat-input" placeholder="Nachricht schreiben…">
      <button id="send-btn">Senden</button>
      <button id="voice-btn" title="Sprachaufnahme">🎤</button>
      ${voiceAgentButton}
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
  panel.querySelector("#cclose").onclick = closePanel;
  document.addEventListener("keydown",e=>{ if(e.key==="Escape") closePanel(); });

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

  // Keep mic animation visible throughout entire process
  const anim = showAnim("mic");

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

      // Get AI response - keep mic animation visible
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

  const anim=showAnim("typing");
  try{
    const res=await askAI();
    anim.remove();
    render(res,"in");
  }catch(e){
    anim.remove();
    render("⚠️ Fehler", "in");
  }
}

async function askAI(){
  const msgs = [
    { role:"system", content: Pini.sys },
    ...hist.filter(m => !String(m.content).startsWith("[AUDIO]"))
  ];

  const r = await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${OPENAI_KEY}` },
    body:JSON.stringify({ model: MODEL, max_output_tokens:120, messages: msgs }) // בלי temperature
  });
  if(!r.ok) throw new Error("bad response");
  const d = await r.json();
  return d.choices?.[0]?.message?.content?.trim() || "Keine Antwort.";
}

/* ═ CSS (Heebo + עיצוב) ═ */
const style=document.createElement("style"); style.textContent=`
@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;800&display=swap');

#fg-launcher, #cpanel, #cpanel * {
  font-family: 'Heebo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans Hebrew', Arial, sans-serif !important;
}

/* ─ Launcher ─ */
#fg-launcher{
  position:fixed; left:2.2vw; bottom:3.2vh; display:flex; align-items:center; gap:12px; z-index: 99998;
  user-select:none; -webkit-user-drag:none;
}
#fg-launcher .fg-bubble{
  position:relative; width:88px; height:88px; border-radius:50%; overflow:hidden; cursor:pointer;
  box-shadow:0 12px 30px rgba(0,0,0,.28);
  animation:fg-float 3.5s ease-in-out infinite;
  background:#111;
}
#fg-launcher .fg-avatar{ width:100%; height:100%; object-fit:cover; aspect-ratio:1/1; display:block; }
#fg-launcher .fg-ring{
  position:absolute; inset:-6px; border-radius:50%;
  box-shadow:0 0 0 6px rgba(0,120,255,.18), 0 0 30px rgba(0,120,255,.35), 0 0 60px rgba(0,120,255,.25);
  pointer-events:none; animation:fg-pulse 2.6s ease-in-out infinite;
}
#fg-launcher .fg-badge{
  position:absolute; top:-6px; right:-6px; background:#ff2d55; color:#fff; font-weight:800; font-size:12px;
  padding:4px 8px; border-radius:999px; box-shadow:0 6px 18px rgba(255,45,85,.4); transform:rotate(-10deg);
}
#fg-launcher .fg-cta{
  display:flex; align-items:center; gap:10px; background:#ffffff; border:1px solid #dfe6f1;
  padding:10px 12px; border-radius:999px; cursor:pointer; box-shadow:0 8px 24px rgba(0,0,0,.16);
}
#fg-launcher .fg-logo{ width:26px; height:26px; object-fit:contain; }
#fg-launcher .fg-cta-text{ display:flex; flex-direction:column; line-height:1.1; }
#fg-launcher .fg-cta-title{ font-size:15px; font-weight:800; color:#0b2343; letter-spacing:.1px; }
#fg-launcher .fg-cta-sub{ font-size:12px; color:#41556f; }

@keyframes fg-float{ 0%,100%{ transform:translateY(0) } 50%{ transform:translateY(-6px) } }
@keyframes fg-pulse{ 0%,100%{ opacity:.75 } 50%{ opacity:1 } }

/* ─ Panel ─ */
#cpanel{
  position:fixed; width:380px; height:72vh; max-height:72vh;
  background:#fff; border-radius:18px; display:flex; flex-direction:column;
  box-shadow:0 14px 40px rgba(0,0,0,.35); transform:translateY(22px); opacity:0; pointer-events:none;
  transition:.25s all ease; z-index:99999; overflow:hidden;
  left:2.2vw; bottom:calc(88px + 5.2vh);
}
#cpanel.open{ transform:none; opacity:1; pointer-events:auto; }

#chead{ position:relative; }
#chead .hero{ position:relative; height:90px; overflow:hidden; }
#chead .hero-bg{
  position:absolute; inset:0; background-image:url('${AVATAR_URL}');
  background-size:cover; background-position:center; filter:blur(4px) brightness(.75);
  transform:scale(1.05);
}
#chead .hero-overlay{
  position:absolute; inset:0;
  background:linear-gradient(90deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,0) 50%),
             linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,.55) 100%);
}
#chead .hero-content{
  position:absolute; inset:0; display:flex; align-items:flex-end; justify-content:space-between; padding:12px 12px;
  color:#fff;
}
.hero-left{ display:flex; align-items:center; gap:8px; }
.hero-avatar{
  width:40px; height:40px; border-radius:50%; border:2px solid rgba(255,255,255,.85);
  box-shadow:0 4px 14px rgba(0,0,0,.35); object-fit:cover; aspect-ratio:1/1; display:block;
}
.hero-title{ font-weight:900; font-size:15px; }
.hero-sub{ font-size:11px; opacity:.95; }
.hero-right{ display:flex; flex-direction:column; align-items:flex-end; }
.hero-powered{ display:flex; align-items:center; gap:6px; font-size:10px; letter-spacing:.2px; opacity:.95; color:#fff; text-decoration:none; cursor:pointer; transition:opacity .2s; }
.hero-powered:hover{ opacity:1; }
.hero-logo{ width:40px; height:auto; object-fit:contain; }
#cclose{ position:absolute; top:8px; left:10px; color:#fff; cursor:pointer; font-weight:800; font-size:18px; }

/* Sponsor banner */
#sponsor{
  display:flex; align-items:center; gap:8px; padding:6px 10px; background:#0b2343; color:#fff;
  border-bottom:1px solid #0a1c33;
}
#sponsor .sponsor-img{
  width:40px; height:40px; border-radius:6px; object-fit:cover; aspect-ratio:1/1; display:block;
  box-shadow:0 4px 10px rgba(0,0,0,.25);
}
#sponsor .sponsor-copy{ font-size:12px; }

/* Mode Selector */
#mode-selector{
  display:flex; gap:8px; padding:10px 12px; background:#f6f8fb; border-bottom:1px solid #e6eaf0;
}
.mode-btn{
  flex:1; border:none; background:#fff; color:#41556f; padding:10px 16px; border-radius:10px;
  font-size:14px; font-weight:600; cursor:pointer; transition:all .2s; border:2px solid transparent;
}
.mode-btn:hover{ background:#eef2f7; }
.mode-btn.active{ background:#0b6cff; color:#fff; border-color:#0b6cff; box-shadow:0 4px 12px rgba(11,108,255,.25); }

/* Messages */
#cmsgs{ flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:8px; background:#f6f8fb; }
.wrap{ width:100%; display:flex; justify-content:flex-start; gap:8px; align-items:flex-end; }
.wrap.user-msg{ justify-content:flex-end; }
.wrap img{
  width:26px; height:26px; border-radius:50%; box-shadow:0 1px 3px rgba(0,0,0,.2);
  object-fit:cover; aspect-ratio:1/1; display:block;
}
.msg{ max-width:78%; padding:8px 12px; font-size:14px; border-radius:14px; direction:ltr; text-align:left; }
.out{ background:#d9f1ff; } .in{ background:#fff; border:1px solid #e6eaf0; }

/* Typing */
.typing span{ width:6px; height:6px; background:#888; border-radius:50%; display:inline-block; animation:b 1.4s infinite; }
@keyframes b{0%,80%,100%{opacity:.2;}40%{opacity:1;}}
.in.mic span{ font-size:20px; color:#d22; background:none; }

/* Voice bubble */
.voice-bubble{ display:flex; align-items:center; gap:12px; background:#fff; border:1px solid #e6eaf0;
  padding:8px 12px; border-radius:16px; min-width:190px; max-width:260px; box-shadow:0 2px 6px rgba(0,0,0,.08);}
.play-btn{ cursor:pointer; font-size:20px; width:30px; height:30px; display:flex; align-items:center; justify-content:center;
  border-radius:50%; background:#0b6cff; color:#fff; box-shadow:0 2px 4px rgba(0,0,0,.2);}
.bar{ flex:1; height:4px; background:#eef2f7; border-radius:2px; position:relative; overflow:hidden;}
.fill{ position:absolute; top:0; left:0; height:100%; background:#0b6cff; width:0; transition:width .2s linear;}
.voice-bubble span{ font-size:12px; color:#444; min-width:40px; text-align:left; }

/* Input */
#cinput{ display:flex; gap:6px; padding:10px; border-top:1px solid #e6eaf0; background:#fff; align-items:center; }
#cinput #chat-input{ flex:1; border:1px solid #cfd8e3; border-radius:12px; padding:10px 12px; font-size:14px; direction:ltr; text-align:left; min-width:0; }
#cinput #send-btn{ border:none; background:#0b6cff; color:#fff; padding:10px 14px; border-radius:12px; cursor:pointer; font-weight:700; font-size:13px; white-space:nowrap; flex-shrink:0; }
#cinput #send-btn:hover{ background:#0957cc; }
#cinput #voice-btn{ border:none; background:#0b6cff; color:#fff; padding:10px 12px; border-radius:12px; cursor:pointer; font-size:18px; transition:all .2s; flex-shrink:0; }
#cinput #voice-btn:hover{ background:#0957cc; transform:scale(1.05); }
#cinput #voice-agent-btn{ border:none; background:#10b981; color:#fff; padding:10px 12px; border-radius:12px; cursor:pointer; font-size:18px; transition:all .2s; flex-shrink:0; }
#cinput #voice-agent-btn:hover{ background:#059669; transform:scale(1.05); }
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


/* מובייל */
@media (max-width: 640px){
  #fg-launcher .fg-cta{ display:none; }
  #fg-launcher .fg-bubble{ width:60px; height:60px; }
  #cpanel{
    width:100vw !important;
    height:100vh !important;
    max-height:100vh !important;
    left:0 !important;
    bottom:0 !important;
    border-radius:0 !important;
  }
  #cclose{
    top:12px;
    left:12px;
    z-index:10;
    background:rgba(0,0,0,0.5);
    width:32px;
    height:32px;
    border-radius:50%;
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:20px;
  }
  .preroll-content{ width:95%; }
}
`; document.head.appendChild(style);

/* ─ Draggable launcher ─ */
function makeDraggable(el, key, onStop){
  const saved = localStorage.getItem(key);
  if(saved){
    try {
      const pos = JSON.parse(saved);
      if (pos.left) el.style.left = pos.left;
      if (pos.bottom) el.style.bottom = pos.bottom;
    } catch {}
  }
  let sX=0, sY=0, bL=0, bB=0, dragging=false, wasMoved=false;
  const onDown = (e)=>{
    // Don't interfere with bubble/cta clicks
    if(e.target.closest('.fg-bubble') || e.target.closest('.fg-cta')) return;

    const t = e.touches ? e.touches[0] : e;
    dragging = true; wasMoved = false; sX = t.clientX; sY = t.clientY;
    const cs = getComputedStyle(el);
    bL = parseFloat(cs.left); bB = parseFloat(cs.bottom);
  };
  const onMove = (e)=>{
    if(!dragging) return;
    const t = e.touches ? e.touches[0] : e;
    const dX = t.clientX - sX; const dY = t.clientY - sY;
    // Only start dragging if moved more than 10px (prevent accidental drag on tap)
    if(Math.abs(dX) > 10 || Math.abs(dY) > 10){
      wasMoved = true;
      e.preventDefault();
      el.style.left   = Math.max(8, bL + dX) + "px";
      el.style.bottom = Math.max(8, bB - dY) + "px";
    }
  };
  const onUp = ()=>{
    if(!dragging) return;
    dragging=false;
    if(wasMoved){
      localStorage.setItem(key, JSON.stringify({ left: el.style.left, bottom: el.style.bottom }));
      if (typeof onStop === "function") onStop();
    }
  };
  el.addEventListener("mousedown", onDown);
  el.addEventListener("touchstart", onDown, {passive:true});
  window.addEventListener("mousemove", onMove, {passive:false});
  window.addEventListener("touchmove", onMove, {passive:false});
  window.addEventListener("mouseup", onUp);
  window.addEventListener("touchend", onUp);
}

/* ═ שליחה ═ */
async function send(){
  const inp=panel.querySelector("#chat-input"); const user=inp.value.trim(); if(!user) return;
  render(user,"out"); inp.value="";

  // טריגרים גמישים
  const qa = Pini.qa.find(q=> q.r.test(user));
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

  const anim=showAnim("typing");
  try{
    const res=await askAI();
    anim.remove();
    render(res,"in");
  }catch(e){
    anim.remove();
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
        role: m.role,                 // "user" | "assistant"
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
      max_tokens: 120
    })
  });

  if (!r.ok) {
    const errText = await r.text().catch(()=> "");
    throw new Error(`API error ${r.status}: ${errText}`);
  }

  const d = await r.json();
  return d.choices?.[0]?.message?.content?.trim() || "Keine Antwort.";
}


/* Voice Agent Functions */
function openVoiceAgent() {
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

/* הסרת Glassix אם קיים */
new MutationObserver(()=>{const g=document.querySelector('#glassix-widget-launcher-closed-wrapper');if(g)g.remove();})
.observe(document.body,{childList:true,subtree:true});


