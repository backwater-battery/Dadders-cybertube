// ==UserScript==
// @name         CyTube Dadders — Klaus Fish Bowl Chat
// @namespace    https://cytu.be/r/Dadders
// @version      7.0.05
// @match        https://cytu.be/r/Dadders*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// ═══════════════════════════════════════════════════════════════════════════════
//  Klaus Fish Bowl Chat — v7.0.05
//  GitHub : https://github.com/backwater-battery/Dadders-cybertube
//  jsDelivr: https://cdn.jsdelivr.net/gh/backwater-battery/Dadders-cybertube@main/Klausfishbowlchat-7.0.05.js
//
//  CHANGES v7.0.05 — FISH TANK GAME:
//
//  A water strip sits between the nav bar and the bubble canvas.
//  Each connected user gets a boat rendered at a deterministic X position
//  derived from hash(username) — same position on every client, no sync needed.
//
//  BOATS:
//    Each boat shows the username and current session score.
//    Boat X = djb2_hash(username) % (screenWidth - padding)
//    Boats gently bob up and down (CSS animation).
//
//  BUBBLE EATING:
//    When a rising bubble enters the water strip zone and overlaps a boat's
//    catch radius, it gets "eaten" — a splash pop appears, the bubble is
//    removed, and that boat's score increments.
//
//  POWER-UP TIERS (session score):
//    0  pts — 🚣 rowboat      (catch radius: 45px)
//    7  pts — ⚡ speedboat    (catch radius: 65px, wider hull)
//    15 pts — 🤿 submarine   (catch radius: 90px, dips below surface to
//                              intercept bubbles 30px earlier)
//
//  All state is local per-session. No socket tricks, no sync required.
//  Scores reset on page refresh.
// ═══════════════════════════════════════════════════════════════════════════════

const KLAUS_DEBUG = true;

(function () {
  "use strict";

  // ───────────────────────────────────────────────────────────────────────────
  //  GAME STATE
  // ───────────────────────────────────────────────────────────────────────────
  const boatScores = {};   // { username: number }
  const boatEls    = {};   // { username: HTMLElement }

  function djb2(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return Math.abs(h >>> 0);
  }

  function getPower(score) {
    if (score >= 15) return 2;  // submarine
    if (score >= 7)  return 1;  // speedboat
    return 0;                   // rowboat
  }

  function getCatchRadius(score) {
    const p = getPower(score);
    return p === 2 ? 90 : p === 1 ? 65 : 45;
  }

  // Submarine dips 30px below water line to intercept early
  function getInterceptY(score) {
    return getPower(score) === 2 ? 30 : 0;
  }

  function boatLabel(name, score) {
    const p = getPower(score);
    if (p === 2) return "🤿 " + name;
    if (p === 1) return "⚡ " + name;
    return "🚣 " + name;
  }

  function hexToRgba(hex, alpha) {
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
      ["Version",       "7.0.05"],
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
      const vEl = document.createElement("span"); vEl.style.cssText = "color:" + (v.includes("NOT") ? "#ff6b6b" : "#a8ff78") + ";text-align:right;word-break:break-all"; vEl.textContent = v;
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
    dbg("v7.0.05 init OK");
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

    // ── Styles ────────────────────────────────────────────────────────────
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

      /* Water strip — boats float here */
      #kl-water {
        position:fixed; top:42px; left:0; right:0; height:52px;
        background:rgba(0,30,80,0.55);
        border-bottom:2px solid rgba(80,180,255,0.35);
        z-index:810; overflow:hidden; pointer-events:none;
      }
      /* Subtle wave shimmer on water surface */
      #kl-water::after {
        content:''; position:absolute; bottom:0; left:0; right:0; height:4px;
        background:rgba(100,200,255,0.25);
      }

      /* Individual boat */
      .kl-boat {
        position:absolute; bottom:6px;
        display:flex; flex-direction:column; align-items:center; gap:1px;
        pointer-events:none;
        animation: kl-bob 2.4s ease-in-out infinite;
      }
      .kl-boat.sub { animation: kl-sub-bob 3s ease-in-out infinite; bottom:-8px; }
      @keyframes kl-bob {
        0%,100% { transform:translateY(0px); }
        50%      { transform:translateY(-3px); }
      }
      @keyframes kl-sub-bob {
        0%,100% { transform:translateY(0px); }
        50%      { transform:translateY(-5px); }
      }
      .kl-boat-sail {
        width:0; height:0;
        border-left:6px solid transparent;
        border-right:6px solid transparent;
        margin-bottom:-1px;
      }
      .kl-boat-hull {
        border-radius:0 0 12px 12px;
        height:16px; min-width:60px;
        display:flex; align-items:center; justify-content:center;
        font:700 9px sans-serif; color:#fff; padding:0 8px;
        white-space:nowrap;
      }
      .kl-boat-sub-hull {
        border-radius:10px;
        height:18px; min-width:80px;
        display:flex; align-items:center; justify-content:center;
        font:700 9px sans-serif; color:#fff; padding:0 10px;
        white-space:nowrap;
      }
      .kl-boat-score {
        font:700 8px sans-serif; color:rgba(255,220,80,0.9);
        margin-top:1px;
      }

      /* Bubble canvas */
      #kl-bubbles {
        position:fixed; top:94px; left:0; right:0; bottom:110px;
        pointer-events:none; overflow:hidden; z-index:800;
      }
      .kl-bubble {
        position:absolute; padding:7px 14px; border-radius:22px;
        font-size:13px; font-weight:600; color:#fff;
        white-space:nowrap; max-width:310px;
        overflow:hidden; text-overflow:ellipsis;
        font-family:sans-serif; pointer-events:none;
        will-change:top,left,opacity; line-height:1.4;
      }
      .kl-bubble b { opacity:0.82; margin-right:5px; }

      /* Eat pop splash */
      .kl-pop {
        position:fixed; font-size:20px; z-index:820;
        pointer-events:none;
        animation: kl-pop-anim 0.55s ease-out forwards;
      }
      @keyframes kl-pop-anim {
        0%   { opacity:1; transform:scale(1) translateY(0); }
        100% { opacity:0; transform:scale(2.2) translateY(-18px); }
      }

      /* Power-up toast */
      .kl-powerup {
        position:fixed; z-index:830; pointer-events:none;
        font:700 12px sans-serif; color:#ffcc44;
        text-shadow:0 0 6px rgba(0,0,0,0.8);
        animation: kl-pu-anim 1.4s ease-out forwards;
      }
      @keyframes kl-pu-anim {
        0%   { opacity:1; transform:translateY(0); }
        100% { opacity:0; transform:translateY(-30px); }
      }

      /* Chat bar */
      #kl-chatbar {
        position:fixed; bottom:0; left:0; right:0;
        padding:6px 10px 8px;
        background:rgba(0,0,0,0.82);
        border-top:1px solid rgba(0,150,255,0.15);
        z-index:9998; display:flex; flex-direction:column; gap:5px;
        font-family:sans-serif;
      }
      #kl-userlist-row {
        display:flex; flex-wrap:wrap; gap:4px; align-items:center;
        min-height:20px; padding:0 2px;
      }
      .kl-ul-label { font-size:11px; color:rgba(160,210,255,0.4); margin-right:3px; }
      .kl-upill {
        display:inline-block; padding:1px 8px; border-radius:20px;
        border:1px solid currentColor; background:rgba(0,0,0,0.35);
        font-size:11px; font-weight:700; line-height:1.75; white-space:nowrap;
      }
      #kl-inputrow {
        display:flex; align-items:center; gap:8px;
        background:rgba(0,0,0,0.52);
        border:1.5px solid rgba(0,150,255,0.35);
        border-radius:24px; padding:5px 14px;
      }
      #kl-input {
        flex:1; background:transparent; border:none; outline:none;
        color:#e8f4ff; font-size:14px; font-family:inherit;
        caret-color:#7dd8ff; min-width:0;
      }
      #kl-input::placeholder { color:rgba(200,230,255,0.28); }
      #kl-throttle-warn { display:none; font-size:11px; color:#ffcc44; margin-left:4px; }
      #kl-sendbtn {
        background:rgba(0,130,255,0.20); border:1px solid rgba(0,180,255,0.35);
        color:#7dd8ff; border-radius:16px; padding:3px 14px;
        font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; flex-shrink:0;
      }
      #kl-sendbtn:active { background:rgba(0,130,255,0.45); }
    </style>`);

    // ── Nav ───────────────────────────────────────────────────────────────
    $("body").append(`
      <div id="kl-nav">
        <span style="font-size:20px;line-height:1">🐟</span>
        Klaus Fish Bowl Chats — Dadders
        <span id="kl-nav-count"></span>
      </div>`);
    function syncCount() { $("#kl-nav-count").text($("#usercount").text()); }
    syncCount();
    setInterval(syncCount, 2500);

    // ── Water strip (boat lane) ───────────────────────────────────────────
    $("body").append('<div id="kl-water"></div>');
    const waterEl = document.getElementById("kl-water");

    // ── Bubble layer ──────────────────────────────────────────────────────
    $("body").append('<div id="kl-bubbles"></div>');
    const bubbleLayer = document.getElementById("kl-bubbles");

    // ── Chat bar ──────────────────────────────────────────────────────────
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

    // ── Colour cache ──────────────────────────────────────────────────────
    const colorCache = {};
    const fallbackPalette = [
      "#ff7eb3","#7dd8ff","#a8ff78","#ffcc44","#ff6b6b",
      "#c084fc","#34d399","#fb923c","#60a5fa","#f97316",
    ];
    let palIdx = 0;

    function getColor(name) {
      if (colorCache[name]) return colorCache[name];
      let found = null;
      document.querySelectorAll("#userlist .userlist_item").forEach(div => {
        const nameSpan = div.children[1];
        if (nameSpan && nameSpan.textContent.trim() === name) {
          const c = $(nameSpan).css("color");
          if (c && c !== "rgb(0, 0, 0)" && c !== "rgba(0, 0, 0, 0)") found = c;
        }
      });
      if (found) { colorCache[name] = found; return found; }
      colorCache[name] = fallbackPalette[palIdx++ % fallbackPalette.length];
      return colorCache[name];
    }

    // ── Boat rendering ────────────────────────────────────────────────────
    function getBoatX(name) {
      const w = window.innerWidth || 400;
      return 10 + (djb2(name) % Math.max(10, w - 120));
    }

    function renderBoat(name) {
      const color  = getColor(name);
      const score  = boatScores[name] || 0;
      const power  = getPower(score);
      const bx     = getBoatX(name);

      // Remove old boat if exists
      if (boatEls[name]) boatEls[name].remove();

      const boat = document.createElement("div");
      boat.className = "kl-boat" + (power === 2 ? " sub" : "");
      boat.style.left = bx + "px";
      // Stagger bob phase per user so they don't all move in sync
      boat.style.animationDelay = ((djb2(name) % 24) / 10) + "s";

      if (power === 2) {
        // Submarine
        const hull = document.createElement("div");
        hull.className = "kl-boat-sub-hull";
        hull.style.background = hexToRgba(color, 0.82);
        hull.style.border = "1.5px solid " + color;
        hull.textContent = "🤿 " + name;
        boat.appendChild(hull);
      } else {
        // Sail
        const sail = document.createElement("div");
        sail.className = "kl-boat-sail";
        sail.style.borderBottom = "14px solid " + color;
        boat.appendChild(sail);
        // Hull
        const hull = document.createElement("div");
        hull.className = "kl-boat-hull";
        hull.style.background = hexToRgba(color, 0.80);
        hull.style.border = "1.5px solid " + color;
        hull.style.minWidth = power === 1 ? "85px" : "60px";
        hull.textContent = (power === 1 ? "⚡ " : "🚣 ") + name;
        boat.appendChild(hull);
      }

      // Score label
      const scoreEl = document.createElement("div");
      scoreEl.className = "kl-boat-score";
      scoreEl.textContent = score > 0 ? score + " pts" : "";
      boat.appendChild(scoreEl);

      waterEl.appendChild(boat);
      boatEls[name] = boat;
    }

    function renderAllBoats() {
      Object.keys(colorCache).forEach(name => renderBoat(name));
    }

    // ── Pop/splash animation ─────────────────────────────────────────────
    function showPop(x, y, emoji) {
      const pop = document.createElement("div");
      pop.className = "kl-pop";
      pop.textContent = emoji;
      pop.style.left = x + "px";
      pop.style.top  = y + "px";
      document.body.appendChild(pop);
      setTimeout(() => pop.remove(), 600);
    }

    function showPowerUp(x, y, text) {
      const pu = document.createElement("div");
      pu.className = "kl-powerup";
      pu.textContent = text;
      pu.style.left = x + "px";
      pu.style.top  = y + "px";
      document.body.appendChild(pu);
      setTimeout(() => pu.remove(), 1500);
    }

    // ── Userlist sync ─────────────────────────────────────────────────────
    let lastUserCount = -1;

    function refreshUserList(forceLog) {
      const $row = $("#kl-userlist-row").empty()
        .append('<span class="kl-ul-label">online:</span>');
      const items = document.querySelectorAll("#userlist .userlist_item");
      const count = items.length;
      if (forceLog || count !== lastUserCount) {
        dbg("userlist: " + count + " user" + (count !== 1 ? "s" : ""));
        lastUserCount = count;
      }
      items.forEach(div => {
        const nameSpan = div.children[1];
        if (!nameSpan) return;
        const name  = nameSpan.textContent.trim();
        const color = $(nameSpan).css("color") || "#7dd8ff";
        if (!name) return;
        const wasNew = !colorCache[name];
        colorCache[name] = color;
        if (wasNew) {
          if (!(name in boatScores)) boatScores[name] = 0;
          renderBoat(name);
          dbg("boat spawned: " + name);
        }
        $('<span class="kl-upill"></span>').text(name).css("color", color).appendTo($row);
      });
    }

    refreshUserList(true);
    setInterval(() => refreshUserList(false), 3000);
    const ulEl = document.getElementById("userlist");
    if (ulEl) new MutationObserver(() => refreshUserList(true)).observe(ulEl, { childList:true, subtree:true });

    // ── Bubble engine + eat detection ─────────────────────────────────────
    function cssToRgba(color, alpha) {
      const t = document.createElement("span");
      t.style.cssText = "position:fixed;top:-9999px;color:" + color;
      document.body.appendChild(t);
      const v = getComputedStyle(t).color;
      document.body.removeChild(t);
      const m = v.match(/\d+/g);
      return m ? "rgba("+m[0]+","+m[1]+","+m[2]+","+alpha+")" : "rgba(100,180,255,"+alpha+")";
    }

    function esc(s) {
      return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    }

    // Water strip top in viewport coords (approx 42px nav + 52px water = 94px from top)
    // Bubbles are in #kl-bubbles which starts at top:94px
    // So bubble y=0 in bubble-layer = viewport y=94
    // Water surface (bottom of strip) = viewport y=94
    // Intercept zone = bubble y < (interceptY) inside bubble-layer
    const WATER_INTERCEPT_BASE = 5;  // px above bottom of water strip in bubble coords

    function spawnBubble(name, text, color) {
      bubblesSpawned++;
      dbg("BUBBLE #"+bubblesSpawned+" "+name+": "+text.substring(0,25));

      const el = document.createElement("div");
      el.className        = "kl-bubble";
      el.style.background = cssToRgba(color, 0.70);
      el.style.borderLeft = "3px solid " + color;
      el.innerHTML = "<b>" + esc(name) + "</b>" + esc(text);
      bubbleLayer.appendChild(el);

      const lW = bubbleLayer.clientWidth  || window.innerWidth;
      const lH = bubbleLayer.clientHeight || (window.innerHeight - 204);
      const startX = 12 + Math.random() * Math.max(4, lW - 324);
      let y = lH, x = startX;
      el.style.top  = y + "px";
      el.style.left = x + "px";

      const drift = (Math.random() - 0.5) * 0.9;
      const speed = 0.9 + Math.random() * 1.1;
      const fadeZ = 60;
      let eaten = false;

      const tid = setInterval(() => {
        if (eaten) return;
        y -= speed;
        x += drift;
        el.style.top  = y + "px";
        el.style.left = x + "px";
        if (y < fadeZ) el.style.opacity = Math.max(0, y / fadeZ).toFixed(3);

        // Check eat zone — once bubble is near the water surface
        if (y < WATER_INTERCEPT_BASE + 40 && !eaten) {
          Object.keys(boatScores).forEach(bname => {
            if (eaten) return;
            const bScore = boatScores[bname] || 0;
            const bx     = getBoatX(bname);
            const radius = getCatchRadius(bScore);
            const interceptY = getInterceptY(bScore); // sub intercepts earlier (higher y)
            const checkY = WATER_INTERCEPT_BASE + interceptY;

            if (y < checkY && Math.abs(x - bx) < radius) {
              eaten = true;
              clearInterval(tid);
              el.remove();

              // Get viewport position for pop animation
              const waterRect = waterEl.getBoundingClientRect();
              const popX = bx + waterRect.left;
              const popY = waterRect.bottom - 20;

              const prevPower = getPower(bScore);
              boatScores[bname] = bScore + 1;
              const newPower = getPower(boatScores[bname]);

              // Splash
              const splashEmoji = newPower === 2 ? "🌊" : newPower === 1 ? "💥" : "💧";
              showPop(popX, popY, splashEmoji);

              // Power-up notification
              if (newPower > prevPower) {
                const puText = newPower === 2 ? "🤿 SUBMARINE!" : "⚡ SPEEDBOAT!";
                showPowerUp(popX - 20, popY - 30, puText);
                dbg("POWER UP " + bname + " → " + puText);
              }

              // Re-render this boat
              renderBoat(bname);
              dbg("eat: " + bname + " ate bubble (" + boatScores[bname] + "pts)");
            }
          });
        }

        if (y < -60) { clearInterval(tid); el.remove(); }
      }, 16);
    }

    // ── Process incoming #messagebuffer nodes ─────────────────────────────
    const SKIP_CLASS_FRAGMENTS = ["nick-highlight", "server-msg", "$server$"];
    const SKIP_NAMES = ["$server$", "$voteskip$", "$poll$"];
    const seen = new WeakSet();
    let lastSeenName = "";

    function processNode(node) {
      if (!(node instanceof HTMLElement) || seen.has(node)) return;
      seen.add(node);
      if (node.tagName !== "DIV") return;
      const cls = node.className || "";
      if (SKIP_CLASS_FRAGMENTS.some(f => cls.includes(f))) return;

      msgsProcessed++;
      dbg("msg#"+msgsProcessed+" "+cls.substring(0,40));

      let name = "";
      const strongEl = node.querySelector("strong.username");
      if (strongEl) { name = strongEl.textContent.trim().replace(/:\s*$/, ""); lastSeenName = name; }
      if (!name) {
        const idx = cls.indexOf("chat-msg-");
        if (idx !== -1) { name = cls.slice(idx + 9).split(" ")[0]; if (name) lastSeenName = name; }
      }
      if (!name && lastSeenName) name = lastSeenName;
      if (!name || SKIP_NAMES.includes(name)) return;

      // Ensure sender has a boat
      if (!(name in boatScores)) {
        boatScores[name] = 0;
        if (!colorCache[name]) getColor(name);
        renderBoat(name);
        dbg("boat spawned from msg: " + name);
      }

      const spans = node.querySelectorAll("span");
      let msgText = "";
      for (let i = spans.length - 1; i >= 0; i--) {
        const sp = spans[i];
        if (sp.classList.contains("timestamp")) continue;
        if (sp.querySelector("strong.username")) continue;
        msgText = sp.textContent.trim();
        break;
      }
      if (!msgText) {
        const full = node.textContent.trim();
        const pfx = name + ": ";
        msgText = full.startsWith(pfx) ? full.slice(pfx.length).trim() : full;
      }
      if (!msgText) return;

      dbg("  " + name + ": " + msgText.substring(0,30));
      spawnBubble(name, msgText, getColor(name));
    }

    const buf = document.getElementById("messagebuffer");
    dbg("buf ready, existing: " + buf.querySelectorAll("div").length);
    buf.querySelectorAll("div[class*='chat-msg']").forEach(processNode);
    new MutationObserver(mutations => {
      mutations.forEach(m => m.addedNodes.forEach(processNode));
    }).observe(buf, { childList: true, subtree: false });

    // ── Send ──────────────────────────────────────────────────────────────
    function sendMsg() {
      const text = $("#kl-input").val().trim();
      if (!text) return;
      if (typeof CHATTHROTTLE !== "undefined" && CHATTHROTTLE) {
        dbg("throttled");
        $("#kl-throttle-warn").fadeIn(100).delay(1200).fadeOut(400);
        return;
      }
      const meta = {};
      if (typeof USEROPTS !== "undefined" && typeof CLIENT !== "undefined") {
        if (USEROPTS.modhat && CLIENT.rank >= 2) meta.modflair = CLIENT.rank;
      }
      dbg("emit: " + text.substring(0,30));
      window.socket.emit("chatMsg", { msg: text, meta: meta });
      $("#kl-input").val("").focus();
    }

    $("#kl-input").on("keydown", function (e) {
      if (e.keyCode === 13) { e.preventDefault(); sendMsg(); }
    });
    $("#kl-sendbtn").on("click", sendMsg);

    document.body.style.overflow = "hidden";
    $(document).on("touchmove", function (e) {
      if (!$(e.target).closest("#kl-userlist-row").length) e.preventDefault();
    }, { passive: false });

    statusMsg = "active";
    dbg("setup complete — v7.0.05");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 350);
  }

})();
