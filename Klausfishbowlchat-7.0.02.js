// ==UserScript==
// @name         CyTube Dadders — Klaus Fish Bowl Chat
// @namespace    https://cytu.be/r/Dadders
// @version      7.0.02
// @match        https://cytu.be/r/Dadders*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// ═══════════════════════════════════════════════════════════════════════════════
//  Klaus Fish Bowl Chat — v7.0.02
//  GitHub : https://github.com/backwater-battery/Dadders-cybertube
//  jsDelivr: https://cdn.jsdelivr.net/gh/backwater-battery/Dadders-cybertube@main/Klausfishbowlchat-7.0.02.js
//
//  CHANGES v7.0.02:
//    • Userlist fix — always showed 0 users. Now uses children[1] selector
//      (confirmed from ui.js line 140) with strong/span fallbacks.
//      Logs raw li[0] HTML once on first load for structure debugging.
//    • Server message filter — $server$ and system divs no longer bubble.
//    • Log spam fix — userlist only logs when count changes, not every poll.
// ═══════════════════════════════════════════════════════════════════════════════

const KLAUS_DEBUG = true;

(function () {
  "use strict";

  let logPanel  = null;
  let logBody   = null;
  let logLines  = [];
  let statusMsg = "idle";
  let bubblesSpawned = 0;
  let msgsProcessed  = 0;

  // ── Klaus's Logs UI ───────────────────────────────────────────────────────
  function buildLogUI() {
    if (!KLAUS_DEBUG) return;

    const toggle = document.createElement("button");
    toggle.id = "kl-log-btn";
    toggle.textContent = "🪵 Klaus's Logs";
    toggle.style.cssText = [
      "position:fixed","bottom:118px","right:10px",
      "background:rgba(0,0,0,0.78)","color:#00ff88",
      "border:1.5px solid #00ff88","border-radius:16px",
      "padding:4px 12px","font:700 11px monospace",
      "cursor:pointer","z-index:99999",
    ].join(";");

    logPanel = document.createElement("div");
    logPanel.style.cssText = [
      "display:none","position:fixed","bottom:148px","right:10px",
      "width:300px","max-height:260px",
      "background:rgba(0,0,0,0.92)","color:#00ff88",
      "border:1.5px solid #00ff88","border-radius:10px",
      "z-index:99999","flex-direction:column",
      "font:10px monospace","overflow:hidden",
    ].join(";");

    toggle.addEventListener("click", () => {
      logPanel.style.display = logPanel.style.display === "none" ? "flex" : "none";
    });

    const hdr = document.createElement("div");
    hdr.style.cssText = "display:flex;align-items:center;gap:5px;padding:5px 8px;background:rgba(0,255,100,0.08);border-bottom:1px solid rgba(0,255,100,0.2);flex-shrink:0;";
    const ttl = document.createElement("span");
    ttl.textContent = "🪵 Klaus's Logs";
    ttl.style.cssText = "font-weight:700;font-size:11px;color:#00ff88;flex:1;";
    hdr.appendChild(ttl);

    function mkBtn(label, color, fn) {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = "background:transparent;border:1px solid "+color+";color:"+color+";border-radius:10px;padding:2px 7px;font:700 9px monospace;cursor:pointer;flex-shrink:0;";
      b.addEventListener("click", fn);
      return b;
    }

    hdr.appendChild(mkBtn("Status","#7dd8ff", showStatusOverlay));
    const copyBtn = mkBtn("Copy","#a8ff78", () => {
      const text = logLines.join("\n");
      const done = () => { copyBtn.textContent = "Copied!"; setTimeout(()=>{ copyBtn.textContent="Copy"; },1500); };
      const fail = () => { copyBtn.textContent = "Failed";  setTimeout(()=>{ copyBtn.textContent="Copy"; },1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => fbCopy(text, done, fail));
      } else { fbCopy(text, done, fail); }
    });
    hdr.appendChild(copyBtn);
    hdr.appendChild(mkBtn("Clear","#ffcc44", () => { logLines=[]; logBody.innerHTML=""; dbg("log cleared"); }));
    hdr.appendChild(mkBtn("✕","#ff6b6b", () => { logPanel.style.display="none"; }));
    logPanel.appendChild(hdr);

    logBody = document.createElement("div");
    logBody.style.cssText = "flex:1;overflow-y:auto;padding:5px 7px;";
    logPanel.appendChild(logBody);

    document.body.appendChild(toggle);
    document.body.appendChild(logPanel);
  }

  function fbCopy(text, done, fail) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch(e) { fail(); }
    document.body.removeChild(ta);
  }

  function showStatusOverlay() {
    const old = document.getElementById("kl-status-overlay");
    if (old) old.remove();
    const ov = document.createElement("div");
    ov.id = "kl-status-overlay";
    ov.style.cssText = "position:fixed;bottom:148px;right:10px;width:300px;background:rgba(0,10,20,0.97);border:1.5px solid #7dd8ff;border-radius:10px;padding:12px 14px;z-index:999999;font:11px monospace;color:#e8f4ff;";
    [
      ["Version",      "7.0.02"],
      ["Status",       statusMsg],
      ["Socket",       typeof window.socket!=="undefined" ? "connected" : "NOT FOUND"],
      ["jQuery",       typeof $!=="undefined" ? $.fn.jquery : "NOT FOUND"],
      ["CHATTHROTTLE", typeof CHATTHROTTLE!=="undefined" ? String(CHATTHROTTLE) : "undefined"],
      ["CLIENT.rank",  typeof CLIENT!=="undefined" ? String(CLIENT.rank) : "undefined"],
      ["CLIENT.name",  typeof CLIENT!=="undefined" ? String(CLIENT.name) : "undefined"],
      ["Bubbles fired",String(bubblesSpawned)],
      ["Msgs seen",    String(msgsProcessed)],
    ].forEach(([k,v]) => {
      const r = document.createElement("div");
      r.style.cssText = "display:flex;justify-content:space-between;margin-bottom:4px;border-bottom:1px solid rgba(100,180,255,0.1);padding-bottom:3px";
      const ke = document.createElement("span"); ke.style.color="#7dd8ff"; ke.textContent=k;
      const ve = document.createElement("span"); ve.style.color=v.includes("NOT")?"#ff6b6b":"#a8ff78"; ve.textContent=v;
      r.appendChild(ke); r.appendChild(ve); ov.appendChild(r);
    });
    const db = document.createElement("button");
    db.textContent = "✕ Close Status";
    db.style.cssText = "margin-top:8px;width:100%;background:rgba(0,130,255,0.15);border:1px solid rgba(0,180,255,0.35);color:#7dd8ff;border-radius:8px;padding:4px;font:700 10px monospace;cursor:pointer;";
    db.addEventListener("click", ()=>ov.remove());
    ov.appendChild(db);
    document.body.appendChild(ov);
    setTimeout(()=>{ if(ov.parentNode) ov.remove(); }, 8000);
  }

  function dbg(msg) {
    if (!KLAUS_DEBUG) return;
    const full = new Date().toLocaleTimeString("en",{hour12:false}) + " " + msg;
    logLines.push(full);
    if (logLines.length > 300) logLines.shift();
    if (!logBody) return;
    const line = document.createElement("div");
    line.style.cssText = "border-bottom:1px solid rgba(0,255,100,0.1);padding:1px 0 2px;";
    line.textContent = full;
    logBody.insertBefore(line, logBody.firstChild);
    while (logBody.children.length > 200) logBody.lastChild.remove();
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  buildLogUI();

  function init() {
    if (typeof $ === "undefined")             { setTimeout(init, 200); return; }
    if (!$("#messagebuffer").length)          { setTimeout(init, 300); return; }
    if (typeof window.socket === "undefined") { setTimeout(init, 300); return; }
    statusMsg = "running";
    dbg("v7.0.02 init OK");
    setup();
  }

  function setup() {
    // Background
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
        position:fixed;top:0;left:0;right:0;height:42px;
        background:rgba(0,0,0,0.75);border-bottom:1px solid rgba(0,180,255,0.2);
        display:flex;align-items:center;padding:0 14px;
        color:#7dd8ff;font-weight:700;font-size:14px;
        font-family:sans-serif;z-index:9998;gap:8px;user-select:none;
      }
      #kl-nav-count { margin-left:auto;font-size:12px;font-weight:400;color:rgba(130,200,255,0.55); }
      #kl-bubbles { position:fixed;top:42px;left:0;right:0;bottom:110px;pointer-events:none;overflow:hidden;z-index:800; }
      .kl-bubble {
        position:absolute;padding:7px 14px;border-radius:22px;
        font-size:13px;font-weight:600;color:#fff;
        white-space:nowrap;max-width:310px;overflow:hidden;text-overflow:ellipsis;
        font-family:sans-serif;pointer-events:none;will-change:top,left,opacity;line-height:1.4;
      }
      .kl-bubble b { opacity:0.82;margin-right:5px; }
      #kl-chatbar {
        position:fixed;bottom:0;left:0;right:0;padding:6px 10px 8px;
        background:rgba(0,0,0,0.82);border-top:1px solid rgba(0,150,255,0.15);
        z-index:9998;display:flex;flex-direction:column;gap:5px;font-family:sans-serif;
      }
      #kl-userlist-row { display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-height:20px;padding:0 2px; }
      .kl-ul-label { font-size:11px;color:rgba(160,210,255,0.4);margin-right:3px; }
      .kl-upill {
        display:inline-block;padding:1px 8px;border-radius:20px;
        border:1px solid currentColor;background:rgba(0,0,0,0.35);
        font-size:11px;font-weight:700;line-height:1.75;white-space:nowrap;
      }
      #kl-inputrow {
        display:flex;align-items:center;gap:8px;
        background:rgba(0,0,0,0.52);border:1.5px solid rgba(0,150,255,0.35);
        border-radius:24px;padding:5px 14px;
      }
      #kl-input {
        flex:1;background:transparent;border:none;outline:none;
        color:#e8f4ff;font-size:14px;font-family:inherit;caret-color:#7dd8ff;min-width:0;
      }
      #kl-input::placeholder { color:rgba(200,230,255,0.28); }
      #kl-throttle-warn { display:none;font-size:11px;color:#ffcc44;margin-left:4px; }
      #kl-sendbtn {
        background:rgba(0,130,255,0.20);border:1px solid rgba(0,180,255,0.35);
        color:#7dd8ff;border-radius:16px;padding:3px 14px;
        font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;flex-shrink:0;
      }
      #kl-sendbtn:active { background:rgba(0,130,255,0.45); }
    </style>`);

    $("body").append(`<div id="kl-nav"><span style="font-size:20px;line-height:1">🐟</span> Klaus Fish Bowl Chats — Dadders <span id="kl-nav-count"></span></div>`);
    function syncCount() { $("#kl-nav-count").text($("#usercount").text()); }
    syncCount(); setInterval(syncCount, 2500);

    $("body").append('<div id="kl-bubbles"></div>');
    const bubbleLayer = document.getElementById("kl-bubbles");

    $("body").append(`
      <div id="kl-chatbar">
        <div id="kl-userlist-row"><span class="kl-ul-label">online:</span></div>
        <div id="kl-inputrow">
          <input id="kl-input" type="text" placeholder="Message the fish bowl…"
            autocomplete="off" autocorrect="off" spellcheck="false" maxlength="240" />
          <span id="kl-throttle-warn">slow down</span>
          <button id="kl-sendbtn">Send</button>
        </div>
      </div>`);

    // ── Colours ───────────────────────────────────────────────────────────
    const colorCache = {};
    const palette = ["#ff7eb3","#7dd8ff","#a8ff78","#ffcc44","#ff6b6b","#c084fc","#34d399","#fb923c","#60a5fa","#f97316"];
    let palIdx = 0;

    function getColor(name) {
      if (colorCache[name]) return colorCache[name];
      let found = null;
      document.querySelectorAll("#userlist li").forEach(li => {
        const s = li.querySelector("strong.username, span.username") || li.children[1];
        if (!s) return;
        if (s.textContent.trim().replace(/:$/,"") === name) {
          const c = $(s).css("color");
          if (c && c !== "rgb(0, 0, 0)" && c !== "rgba(0, 0, 0, 0)") found = c;
        }
      });
      if (found) { colorCache[name] = found; return found; }
      colorCache[name] = palette[palIdx++ % palette.length];
      return colorCache[name];
    }

    // ── Userlist ──────────────────────────────────────────────────────────
    // From ui.js line 140: children[1] is the username element
    let lastUserCount = -1;
    let ulDumped = false;

    function refreshUserList() {
      const $row = $("#kl-userlist-row").empty().append('<span class="kl-ul-label">online:</span>');
      let n = 0;
      $("#userlist li").each(function(i) {
        // Dump raw HTML of first item once so we can verify selector
        if (!ulDumped && i === 0) {
          dbg("UL li[0]: " + this.outerHTML.substring(0, 150));
          ulDumped = true;
        }
        const nameEl = this.querySelector("strong.username, span.username") || this.children[1];
        if (!nameEl) return;
        const name  = nameEl.textContent.trim().replace(/:$/,"");
        const color = $(nameEl).css("color") || "#7dd8ff";
        if (!name) return;
        colorCache[name] = color;
        n++;
        $('<span class="kl-upill"></span>').text(name).css("color", color).appendTo($row);
      });
      // Only log on change — no more every-3.5s spam
      if (n !== lastUserCount) {
        dbg("userlist changed: " + n + " users");
        lastUserCount = n;
      }
    }
    refreshUserList();
    setInterval(refreshUserList, 3500);
    const ulEl = document.getElementById("userlist");
    if (ulEl) new MutationObserver(refreshUserList).observe(ulEl, { childList:true, subtree:true });

    // ── Bubble engine ─────────────────────────────────────────────────────
    function cssToRgba(color, alpha) {
      const t = document.createElement("span");
      t.style.cssText = "position:fixed;top:-9999px;color:"+color;
      document.body.appendChild(t);
      const v = getComputedStyle(t).color;
      document.body.removeChild(t);
      const m = v.match(/\d+/g);
      return m ? "rgba("+m[0]+","+m[1]+","+m[2]+","+alpha+")" : "rgba(100,180,255,"+alpha+")";
    }
    function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

    function spawnBubble(name, text, color) {
      bubblesSpawned++;
      dbg("BUBBLE #"+bubblesSpawned+" "+name+": "+text.substring(0,25));
      const el = document.createElement("div");
      el.className = "kl-bubble";
      el.style.background = cssToRgba(color, 0.70);
      el.style.borderLeft = "3px solid " + color;
      el.innerHTML = "<b>"+esc(name)+"</b>"+esc(text);
      bubbleLayer.appendChild(el);

      const lW = bubbleLayer.clientWidth  || window.innerWidth;
      const lH = bubbleLayer.clientHeight || (window.innerHeight - 152);
      let y = lH, x = 12 + Math.random() * Math.max(4, lW - 324);
      el.style.top = y+"px"; el.style.left = x+"px";

      const drift = (Math.random()-0.5)*0.9;
      const speed = 0.9 + Math.random()*1.1;
      const fadeZ = 90;
      const tid = setInterval(()=>{
        y -= speed; x += drift;
        el.style.top = y+"px"; el.style.left = x+"px";
        if (y < fadeZ) el.style.opacity = Math.max(0, y/fadeZ).toFixed(3);
        if (y < -60) { clearInterval(tid); el.remove(); }
      }, 16);
    }

    // ── Server/system message filter ──────────────────────────────────────
    // $server$ messages, disconnect/reconnect notices, etc. don't bubble.
    function isSystemMsg(node, name) {
      if (/^\$/.test(name)) return true;                          // $server$, $voteskip$, etc.
      if (/chat-msg-\$/.test(node.className)) return true;        // class contains $
      const sysCls = ["server-msg","server-msg-disconnect","server-msg-reconnect","server-whisper"];
      return sysCls.some(c => node.classList.contains(c));
    }

    // ── Observe #messagebuffer ────────────────────────────────────────────
    const seen = new WeakSet();
    let lastSeenName = "";

    function processNode(node) {
      if (!(node instanceof HTMLElement) || seen.has(node)) return;
      seen.add(node);
      if (node.tagName !== "DIV") return;
      msgsProcessed++;

      // Extract username
      let name = "";
      const strongEl = node.querySelector("strong.username");
      if (strongEl) { name = strongEl.textContent.trim().replace(/:\s*$/,""); lastSeenName = name; }
      if (!name) {
        const cm = node.className && node.className.match(/chat-msg-([^\s]+)/);
        if (cm) { name = cm[1]; lastSeenName = name; }
      }
      if (!name && lastSeenName) name = lastSeenName;
      if (!name) return;

      // Filter system messages
      if (isSystemMsg(node, name)) {
        dbg("sys filtered: " + name);
        return;
      }

      dbg("msg#"+msgsProcessed+" "+name.substring(0,20));

      // Extract message text — last non-timestamp, non-name-wrapper span
      const spans = node.querySelectorAll("span");
      let msgText = "";
      for (let i = spans.length-1; i >= 0; i--) {
        const sp = spans[i];
        if (sp.classList.contains("timestamp")) continue;
        if (sp.querySelector("strong.username")) continue;
        msgText = sp.textContent.trim();
        break;
      }
      if (!msgText) {
        const full = node.textContent.trim();
        const pfx  = name + ": ";
        msgText = full.startsWith(pfx) ? full.slice(pfx.length).trim() : full;
      }
      if (!msgText) return;

      spawnBubble(name, msgText, getColor(name));
    }

    const buf = document.getElementById("messagebuffer");
    dbg("buf ready, existing: " + buf.querySelectorAll("div").length);
    buf.querySelectorAll("div[class*='chat-msg']").forEach(processNode);
    new MutationObserver(m => m.forEach(r => r.addedNodes.forEach(processNode)))
      .observe(buf, { childList: true, subtree: false });

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
      if (typeof USEROPTS!=="undefined" && typeof CLIENT!=="undefined") {
        if (USEROPTS.modhat && CLIENT.rank >= 2) meta.modflair = CLIENT.rank;
      }
      dbg("emit: " + text.substring(0,30));
      window.socket.emit("chatMsg", { msg: text, meta: meta });
      $("#kl-input").val("").focus();
    }
    $("#kl-input").on("keydown", function(e){ if(e.keyCode===13){ e.preventDefault(); sendMsg(); } });
    $("#kl-sendbtn").on("click", sendMsg);

    document.body.style.overflow = "hidden";
    $(document).on("touchmove", function(e){
      if (!$(e.target).closest("#kl-userlist-row").length) e.preventDefault();
    }, { passive: false });

    statusMsg = "active";
    dbg("setup complete — v7.0.02");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 350);
  }
})();
