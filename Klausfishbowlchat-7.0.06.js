// ==UserScript==
// @name         CyTube Dadders — Klaus Fish Bowl Chat
// @namespace    https://cytu.be/r/Dadders
// @version      7.0.06
// @match        https://cytu.be/r/Dadders*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// ═══════════════════════════════════════════════════════════════════════════════
//  Klaus Fish Bowl Chat — v7.0.06
//  GitHub : https://github.com/backwater-battery/Dadders-cybertube
//  jsDelivr: https://cdn.jsdelivr.net/gh/backwater-battery/Dadders-cybertube@main/Klausfishbowlchat-7.0.06.js
//
//  CHANGES v7.0.06:
//    • Bubbles now show MESSAGE TEXT ONLY — no username prefix in the bubble
//    • Bubble colour is FULLY DETERMINISTIC per username:
//        colour = PALETTE[ djb2(username) % PALETTE.length ]
//      Every browser client produces the same colour for the same username
//      regardless of join order, message order, or page load timing.
//      CyTube's own colour (from #userlist) is used when available and falls
//      back to the deterministic palette colour — so it's always consistent.
//    • Boat hull colour uses the same deterministic colour as the bubble
// ═══════════════════════════════════════════════════════════════════════════════

const KLAUS_DEBUG = true;

(function () {
  "use strict";

  // ───────────────────────────────────────────────────────────────────────────
  //  DETERMINISTIC COLOUR SYSTEM
  //
  //  Priority:
  //    1. CyTube's own colour for this username (from #userlist span style)
  //       — CyTube assigns these server-side so they're the same for all clients
  //    2. Fallback: PALETTE[ djb2(username) % PALETTE.length ]
  //       — pure hash, no state, identical result on every client
  //
  //  Both sources are deterministic. Source 1 is preferred because it matches
  //  CyTube's existing colour system. Source 2 kicks in for guests / users not
  //  yet in the userlist.
  // ───────────────────────────────────────────────────────────────────────────
  const PALETTE = [
    "#ff7eb3","#7dd8ff","#a8ff78","#ffcc44","#ff6b6b",
    "#c084fc","#34d399","#fb923c","#60a5fa","#f97316",
    "#e879f9","#22d3ee","#4ade80","#fbbf24","#f87171",
  ];

  function djb2(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return Math.abs(h >>> 0);
  }

  // Deterministic fallback colour — same result on every client for same name
  function hashColor(name) {
    return PALETTE[djb2(name) % PALETTE.length];
  }

  // Cache: populated from CyTube userlist (source 1) or hashColor (source 2)
  const colorCache = {};

  function getColor(name) {
    if (colorCache[name]) return colorCache[name];
    // Try CyTube userlist first
    let found = null;
    document.querySelectorAll("#userlist .userlist_item").forEach(div => {
      const nameSpan = div.children[1];
      if (nameSpan && nameSpan.textContent.trim() === name) {
        const c = $(nameSpan).css("color");
        if (c && c !== "rgb(0, 0, 0)" && c !== "rgba(0, 0, 0, 0)") found = c;
      }
    });
    colorCache[name] = found || hashColor(name);
    return colorCache[name];
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  GAME STATE
  // ───────────────────────────────────────────────────────────────────────────
  const boatScores = {};
  const boatEls    = {};

  function getPower(score) {
    if (score >= 15) return 2;
    if (score >= 7)  return 1;
    return 0;
  }
  function getCatchRadius(score) {
    return [45, 65, 90][getPower(score)];
  }
  function getInterceptY(score) {
    return getPower(score) === 2 ? 30 : 0;
  }

  function hexToRgba(hex, alpha) {
    if (!hex) return "rgba(100,180,255," + alpha + ")";
    if (hex.startsWith("rgb")) {
      const m = hex.match(/\d+/g);
      return m ? "rgba("+m[0]+","+m[1]+","+m[2]+","+alpha+")" : "rgba(100,180,255,"+alpha+")";
    }
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return "rgba("+r+","+g+","+b+","+alpha+")";
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  KLAUS'S LOGS
  // ───────────────────────────────────────────────────────────────────────────
  let logPanel  = null;
  let logBody   = null;
  let logLines  = [];
  let statusMsg = "idle";
  let bubblesSpawned = 0;
  let msgsProcessed  = 0;

  function buildLogUI() {
    if (!KLAUS_DEBUG) return;

    const logToggle = document.createElement("button");
    logToggle.id = "kl-log-btn";
    logToggle.textContent = "🪵 Klaus's Logs";
    logToggle.style.cssText = [
      "position:fixed","bottom:118px","right:10px",
      "background:rgba(0,0,0,0.78)","color:#00ff88",
      "border:1.5px solid #00ff88","border-radius:16px",
      "padding:4px 12px","font:700 11px monospace",
      "cursor:pointer","z-index:99999",
    ].join(";");
    logToggle.addEventListener("click", () => {
      logPanel.style.display = logPanel.style.display === "none" ? "flex" : "none";
    });
    document.body.appendChild(logToggle);

    logPanel = document.createElement("div");
    logPanel.id = "kl-log-panel";
    logPanel.style.cssText = [
      "display:none","position:fixed","bottom:148px","right:10px",
      "width:300px","max-height:260px",
      "background:rgba(0,0,0,0.92)","color:#00ff88",
      "border:1.5px solid #00ff88","border-radius:10px",
      "z-index:99999","flex-direction:column","font:10px monospace","overflow:hidden",
    ].join(";");

    const header = document.createElement("div");
    header.style.cssText = [
      "display:flex","align-items:center","gap:5px","padding:5px 8px",
      "background:rgba(0,255,100,0.08)",
      "border-bottom:1px solid rgba(0,255,100,0.2)","flex-shrink:0",
    ].join(";");
    const title = document.createElement("span");
    title.textContent = "🪵 Klaus's Logs";
    title.style.cssText = "font-weight:700;font-size:11px;color:#00ff88;flex:1;";
    header.appendChild(title);

    function makeBtn(label, color, onClick) {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = [
        "background:transparent","border:1px solid "+color,"color:"+color,
        "border-radius:10px","padding:2px 7px","font:700 9px monospace",
        "cursor:pointer","flex-shrink:0",
      ].join(";");
      b.addEventListener("click", onClick);
      return b;
    }

    const copyBtn  = makeBtn("Copy",   "#a8ff78", () => {
      const text = logLines.join("\n");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => { copyBtn.textContent = "Copied!"; setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500); })
          .catch(() => fallbackCopy(text, copyBtn));
      } else { fallbackCopy(text, copyBtn); }
    });
    const clearBtn = makeBtn("Clear",  "#ffcc44", () => { logLines = []; logBody.innerHTML = ""; dbg("log cleared"); });
    const closeBtn = makeBtn("✕",      "#ff6b6b", () => { logPanel.style.display = "none"; });
    const statBtn  = makeBtn("Status", "#7dd8ff", showStatusOverlay);

    header.appendChild(statBtn);
    header.appendChild(copyBtn);
    header.appendChild(clearBtn);
    header.appendChild(closeBtn);
    logPanel.appendChild(header);

    logBody = document.createElement("div");
    logBody.style.cssText = "flex:1;overflow-y:auto;padding:5px 7px;";
    logPanel.appendChild(logBody);
    document.body.appendChild(logPanel);
  }

  function fallbackCopy(text, btn) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); btn.textContent = "Copied!"; }
    catch(e) { btn.textContent = "Failed"; }
    setTimeout(() => { btn.textContent = "Copy"; }, 1500);
    document.body.removeChild(ta);
  }

  function showStatusOverlay() {
    const existing = document.getElementById("kl-status-overlay");
    if (existing) existing.remove();
    const ov = document.createElement("div");
    ov.id = "kl-status-overlay";
    ov.style.cssText = [
      "position:fixed","bottom:148px","right:10px","width:300px",
      "background:rgba(0,10,20,0.97)","border:1.5px solid #7dd8ff",
      "border-radius:10px","padding:12px 14px","z-index:999999",
      "font:11px monospace","color:#e8f4ff",
    ].join(";");

    const scoreEntries = Object.entries(boatScores)
      .sort((a,b) => b[1]-a[1])
      .map(([n,s]) => n + ": " + s + " (" + ["🚣","⚡","🤿"][getPower(s)] + ")")
      .join(" | ") || "none yet";

    const rows = [
      ["Version",       "7.0.06"],
      ["Status",        statusMsg],
      ["Socket",        typeof window.socket !== "undefined" ? "connected" : "NOT FOUND"],
      ["jQuery",        typeof $ !== "undefined" ? $.fn.jquery : "NOT FOUND"],
      ["CHATTHROTTLE",  typeof CHATTHROTTLE !== "undefined" ? String(CHATTHROTTLE) : "undefined"],
      ["Bubbles fired", String(bubblesSpawned)],
      ["Msgs seen",     String(msgsProcessed)],
      ["Users online",  String(document.querySelectorAll("#userlist .userlist_item").length)],
      ["Scores",        scoreEntries.substring(0,60)],
    ];
    rows.forEach(([k, v]) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;justify-content:space-between;margin-bottom:4px;border-bottom:1px solid rgba(100,180,255,0.1);padding-bottom:3px;gap:8px";
      const kEl = document.createElement("span"); kEl.style.cssText = "color:#7dd8ff;flex-shrink:0"; kEl.textContent = k;
      const vEl = document.createElement("span"); vEl.style.cssText = "color:"+(v.includes("NOT")?"#ff6b6b":"#a8ff78")+";text-align:right;word-break:break-all"; vEl.textContent = v;
      row.appendChild(kEl); row.appendChild(vEl); ov.appendChild(row);
    });
    const dismissBtn = document.createElement("button");
    dismissBtn.textContent = "✕ Close Status";
    dismissBtn.style.cssText = [
      "margin-top:8px","width:100%","background:rgba(0,130,255,0.15)",
      "border:1px solid rgba(0,180,255,0.35)","color:#7dd8ff","border-radius:8px",
      "padding:4px","font:700 10px monospace","cursor:pointer",
    ].join(";");
    dismissBtn.addEventListener("click", () => ov.remove());
    ov.appendChild(dismissBtn);
    document.body.appendChild(ov);
    setTimeout(() => { if (ov.parentNode) ov.remove(); }, 8000);
  }

  function dbg(msg) {
    if (!KLAUS_DEBUG) return;
    const ts   = new Date().toLocaleTimeString("en", { hour12: false });
    const full = ts + " " + msg;
    logLines.push(full);
    if (logLines.length > 300) logLines.shift();
    if (!logBody) return;
    const line = document.createElement("div");
    line.style.cssText = "border-bottom:1px solid rgba(0,255,100,0.1);padding:1px 0 2px;";
    line.textContent = full;
    logBody.insertBefore(line, logBody.firstChild);
    while (logBody.children.length > 200) logBody.lastChild.remove();
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  BOOT
  // ───────────────────────────────────────────────────────────────────────────
  buildLogUI();

  function init() {
    if (typeof $ === "undefined")             { setTimeout(init, 200); return; }
    if (!$("#messagebuffer").length)          { setTimeout(init, 300); return; }
    if (typeof window.socket === "undefined") { setTimeout(init, 300); return; }
    statusMsg = "running";
    dbg("v7.0.06 init OK");
    setup();
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  SETUP
  // ───────────────────────────────────────────────────────────────────────────
  function setup() {

    Object.assign(document.body.style, {
      backgroundImage:      "url('https://i.ibb.co/TDKkr0rx/Klaus-Fish-Bowl-Chats.webp')",
      backgroundSize:       "cover",
      backgroundPosition:   "center center",
      backgroundRepeat:     "no-repeat",
      backgroundAttachment: "fixed",
      overflow:             "hidden",
    });

    $("#chatwrap").hide();
    $("#rightpane-inner").hide();
    dbg("CyTube chat hidden");

    $("head").append(`<style id="kl-styles">
      #kl-nav {
        position:fixed; top:0; left:0; right:0; height:42px;
        background:rgba(0,0,0,0.75);
        border-bottom:1px solid rgba(0,180,255,0.2);
        display:flex; align-items:center; padding:0 14px;
        color:#7dd8ff; font-weight:700; font-size:14px;
        font-family:sans-serif; z-index:9998; gap:8px; user-select:none;
      }
      #kl-nav-count { margin-left:auto; font-size:12px; font-weight:400; color:rgba(130,200,255,0.55); }

      #kl-water {
        position:fixed; top:42px; left:0; right:0; height:52px;
        background:rgba(0,30,80,0.55);
        border-bottom:2px solid rgba(80,180,255,0.35);
        z-index:810; overflow:hidden; pointer-events:none;
      }
      #kl-water::after {
        content:''; position:absolute; bottom:0; left:0; right:0; height:4px;
        background:rgba(100,200,255,0.25);
      }

      .kl-boat {
        position:absolute; bottom:6px;
        display:flex; flex-direction:column; align-items:center; gap:1px;
        pointer-events:none;
        animation: kl-bob 2.4s ease-in-out infinite;
      }
      .kl-boat.sub { animation: kl-sub-bob 3s ease-in-out infinite; bottom:-8px; }
      @keyframes kl-bob      { 0%,100%{transform:translateY(0)}  50%{transform:translateY(-3px)} }
      @keyframes kl-sub-bob  { 0%,100%{transform:translateY(0)}  50%{transform:translateY(-5px)} }

      .kl-boat-sail  { width:0; height:0; border-left:6px solid transparent; border-right:6px solid transparent; margin-bottom:-1px; }
      .kl-boat-hull  { border-radius:0 0 12px 12px; height:16px; min-width:60px; display:flex; align-items:center; justify-content:center; font:700 9px sans-serif; color:#fff; padding:0 8px; white-space:nowrap; }
      .kl-boat-sub-hull { border-radius:10px; height:18px; min-width:80px; display:flex; align-items:center; justify-content:center; font:700 9px sans-serif; color:#fff; padding:0 10px; white-space:nowrap; }
      .kl-boat-score { font:700 8px sans-serif; color:rgba(255,220,80,0.9); margin-top:1px; }

      #kl-bubbles {
        position:fixed; top:94px; left:0; right:0; bottom:110px;
        pointer-events:none; overflow:hidden; z-index:800;
      }

      /* Bubbles: text only, no username — colour matches the sender */
      .kl-bubble {
        position:absolute; padding:7px 14px; border-radius:22px;
        font-size:13px; font-weight:600; color:#fff;
        white-space:nowrap; max-width:300px;
        overflow:hidden; text-overflow:ellipsis;
        font-family:sans-serif; pointer-events:none;
        will-change:top,left,opacity; line-height:1.4;
      }

      .kl-pop {
        position:fixed; font-size:20px; z-index:820; pointer-events:none;
        animation: kl-pop-anim 0.55s ease-out forwards;
      }
      @keyframes kl-pop-anim { 0%{opacity:1;transform:scale(1) translateY(0)} 100%{opacity:0;transform:scale(2.2) translateY(-18px)} }

      .kl-powerup {
        position:fixed; z-index:830; pointer-events:none;
        font:700 12px sans-serif; color:#ffcc44;
        text-shadow:0 0 6px rgba(0,0,0,0.8);
        animation: kl-pu-anim 1.4s ease-out forwards;
      }
      @keyframes kl-pu-anim { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-30px)} }

      #kl-chatbar {
        position:fixed; bottom:0; left:0; right:0;
        padding:6px 10px 8px; background:rgba(0,0,0,0.82);
        border-top:1px solid rgba(0,150,255,0.15);
        z-index:9998; display:flex; flex-direction:column; gap:5px;
        font-family:sans-serif;
      }
      #kl-userlist-row { display:flex; flex-wrap:wrap; gap:4px; align-items:center; min-height:20px; padding:0 2px; }
      .kl-ul-label { font-size:11px; color:rgba(160,210,255,0.4); margin-right:3px; }
      .kl-upill { display:inline-block; padding:1px 8px; border-radius:20px; border:1px solid currentColor; background:rgba(0,0,0,0.35); font-size:11px; font-weight:700; line-height:1.75; white-space:nowrap; }
      #kl-inputrow { display:flex; align-items:center; gap:8px; background:rgba(0,0,0,0.52); border:1.5px solid rgba(0,150,255,0.35); border-radius:24px; padding:5px 14px; }
      #kl-input { flex:1; background:transparent; border:none; outline:none; color:#e8f4ff; font-size:14px; font-family:inherit; caret-color:#7dd8ff; min-width:0; }
      #kl-input::placeholder { color:rgba(200,230,255,0.28); }
      #kl-throttle-warn { display:none; font-size:11px; color:#ffcc44; margin-left:4px; }
      #kl-sendbtn { background:rgba(0,130,255,0.20); border:1px solid rgba(0,180,255,0.35); color:#7dd8ff; border-radius:16px; padding:3px 14px; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; flex-shrink:0; }
      #kl-sendbtn:active { background:rgba(0,130,255,0.45); }
    </style>`);

    $("body").append(`
      <div id="kl-nav">
        <span style="font-size:20px;line-height:1">🐟</span>
        Klaus Fish Bowl Chats — Dadders
        <span id="kl-nav-count"></span>
      </div>`);
    function syncCount() { $("#kl-nav-count").text($("#usercount").text()); }
    syncCount();
    setInterval(syncCount, 2500);

    $("body").append('<div id="kl-water"></div>');
    const waterEl = document.getElementById("kl-water");

    $("body").append('<div id="kl-bubbles"></div>');
    const bubbleLayer = document.getElementById("kl-bubbles");

    $("body").append(`
      <div id="kl-chatbar">
        <div id="kl-userlist-row"><span class="kl-ul-label">online:</span></div>
        <div id="kl-inputrow">
          <input id="kl-input" type="text"
            placeholder="Message the fish bowl…"
            autocomplete="off" autocorrect="off"
            spellcheck="false" maxlength="240" />
          <span id="kl-throttle-warn">slow down</span>
          <button id="kl-sendbtn">Send</button>
        </div>
      </div>`);

    // ── Boat rendering ────────────────────────────────────────────────────
    function getBoatX(name) {
      const w = window.innerWidth || 400;
      return 10 + (djb2(name) % Math.max(10, w - 120));
    }

    function renderBoat(name) {
      const color = getColor(name);
      const score = boatScores[name] || 0;
      const power = getPower(score);
      const bx    = getBoatX(name);

      if (boatEls[name]) boatEls[name].remove();

      const boat = document.createElement("div");
      boat.className = "kl-boat" + (power === 2 ? " sub" : "");
      boat.style.left = bx + "px";
      boat.style.animationDelay = ((djb2(name) % 24) / 10) + "s";

      if (power === 2) {
        const hull = document.createElement("div");
        hull.className = "kl-boat-sub-hull";
        hull.style.background = hexToRgba(color, 0.82);
        hull.style.border = "1.5px solid " + color;
        hull.textContent = "🤿 " + name;
        boat.appendChild(hull);
      } else {
        const sail = document.createElement("div");
        sail.className = "kl-boat-sail";
        sail.style.borderBottom = "14px solid " + color;
        boat.appendChild(sail);
        const hull = document.createElement("div");
        hull.className = "kl-boat-hull";
        hull.style.background = hexToRgba(color, 0.80);
        hull.style.border = "1.5px solid " + color;
        hull.style.minWidth = power === 1 ? "85px" : "60px";
        hull.textContent = (power === 1 ? "⚡ " : "🚣 ") + name;
        boat.appendChild(hull);
      }

      const scoreEl = document.createElement("div");
      scoreEl.className = "kl-boat-score";
      scoreEl.textContent = score > 0 ? score + " pts" : "";
      boat.appendChild(scoreEl);

      waterEl.appendChild(boat);
      boatEls[name] = boat;
    }

    function showPop(x, y, emoji) {
      const pop = document.createElement("div");
      pop.className = "kl-pop";
      pop.textContent = emoji;
      pop.style.left = x + "px";
      pop.style.top  = y + 
