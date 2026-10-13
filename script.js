/* =========================================================
   script.js — UI logic.
   The actual AI request lives in api.js (ChatAPI.stream).
   Load order in index.html: api.js first, then this file.
   ========================================================= */
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ---------- Icons (inline SVG paths) ---------- */
  const P = {
    search: "<circle cx='11' cy='11' r='7'/><path d='M20 20l-3.5-3.5'/>",
    panel: "<rect x='3' y='4' width='18' height='16' rx='3'/><path d='M9 4v16'/>",
    compose: "<path d='M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z'/>",
    images: "<rect x='6' y='3' width='15' height='15' rx='3'/><path d='M3 8v10a3 3 0 003 3h10'/>",
    clock: "<circle cx='12' cy='12' r='9'/><path d='M12 7v5l3 2'/>",
    lib: "<rect x='3' y='4' width='4' height='16' rx='1'/><rect x='9' y='4' width='4' height='16' rx='1'/><path d='M15 6l4-1 3 14-4 1z'/>",
    plug: "<circle cx='12' cy='12' r='9'/><circle cx='12' cy='12' r='3'/>",
    code: "<rect x='3' y='4' width='18' height='16' rx='5'/><path d='M8 10l3 2-3 2M13 15h3'/>",
    dots: "<circle cx='5' cy='12' r='1.2'/><circle cx='12' cy='12' r='1.2'/><circle cx='19' cy='12' r='1.2'/>",
    gift: "<rect x='3' y='8' width='18' height='5' rx='1'/><path d='M5 13v7h14v-7M12 8v12M12 8C9 8 8 4 10 4s2 4 2 4zM12 8c3 0 4-4 2-4s-2 4-2 4z'/>",
    key: "<circle cx='8' cy='15' r='4'/><path d='M11 12l9-9M16 7l3 3'/>",
    sun: "<circle cx='12' cy='12' r='4'/><path d='M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'/>",
    plus: "<path d='M12 5v14M5 12h14'/>",
    think: "<path d='M9 4a3 3 0 00-3 3 3 3 0 00-2 5 3 3 0 002 5 3 3 0 006 1V4a3 3 0 00-3 0zM15 4a3 3 0 013 3 3 3 0 012 5 3 3 0 01-2 5 3 3 0 01-6 1'/>",
    mic: "<rect x='9' y='3' width='6' height='11' rx='3'/><path d='M5 11a7 7 0 0014 0M12 18v3'/>",
    pen: "<path d='M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z'/>",
    globe: "<circle cx='12' cy='12' r='9'/><path d='M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18'/>",
    img: "<rect x='3' y='3' width='18' height='18' rx='4'/><circle cx='9' cy='9' r='1.5'/><path d='M4 17l5-5 4 4 3-3 4 4'/>",
    x: "<path d='M6 6l12 12M18 6L6 18'/>",
  };
  const svg = (paths, extra = "") => `<svg viewBox="0 0 24 24" ${extra}>${paths}</svg>`;
  const ICON = {
    copy: svg("<rect x='9' y='9' width='11' height='11' rx='2'/><path d='M5 15V6a2 2 0 012-2h9'/>"),
    redo: svg("<path d='M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5'/>"),
    up: svg("<path d='M7 11v9H4v-9zM7 11l4-8a2 2 0 012 2v4h6a2 2 0 012 2l-1 7a2 2 0 01-2 2H7'/>"),
    down: svg("<path d='M17 13V4h3v9zM17 13l-4 8a2 2 0 01-2-2v-4H5a2 2 0 01-2-2l1-7a2 2 0 012-2h11'/>"),
    trash: svg("<path d='M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'/>", "style='width:16px;height:16px'"),
    logo: svg("<path d='M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z'/>"),
    stop: svg("<rect x='5' y='5' width='14' height='14' rx='3'/>", "style='fill:currentColor;stroke:none;width:14px;height:14px'"),
    send: svg("<path d='M12 19V5M5 12l7-7 7 7'/>"),
    wave: svg("<path d='M4 10v4M8 6v12M12 3v18M16 8v8M20 11v2'/>"),
  };
  // Turn <i data-i="name"></i> placeholders in the HTML into real icons.
  $$("i[data-i]").forEach((el) => { el.outerHTML = svg(P[el.dataset.i]); });

  /* ---------- State + storage ---------- */
  let chats = [];        // [{ id, title, msgs: [{ role, content, vote? }] }]
  let cur = null;        // id of the open chat (null = new chat)
  let ctl = null;        // AbortController of the running request
  let thinkOn = false;
  let query = "";        // sidebar search text

  const find = (id) => chats.find((c) => c.id === id);
  const load = () => {
    try { chats = JSON.parse(localStorage.getItem("chatui.chats") || "[]") || []; } catch { chats = []; }
  };
  const save = () => {
    try { localStorage.setItem("chatui.chats", JSON.stringify(chats)); } catch {}
  };

  /* ---------- Small helpers ---------- */
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const NOTE = $("#note").textContent;
  let toastTimer;
  function toast(text, ms = 5000) {
    const n = $("#note");
    n.textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { n.textContent = NOTE; }, ms);
  }

  const copyText = async (t) => {
    try { await navigator.clipboard.writeText(t); } catch {
      const x = document.createElement("textarea");
      x.value = t; document.body.appendChild(x); x.select();
      try { document.execCommand("copy"); } catch {}
      x.remove();
    }
  };

  // Tiny Markdown renderer: code blocks, inline code, bold, lists, headings.
  function md(src) {
    const inline = (t) => t.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    return src.split("```").map((part, i) => {
      if (i % 2) {
        const nl = part.indexOf("\n");
        const lang = nl > -1 ? part.slice(0, nl).trim() : "";
        const code = nl > -1 ? part.slice(nl + 1) : part;
        return `<div class="pre"><div class="bar"><span>${esc(lang || "code")}</span>` +
               `<button data-copy>${ICON.copy}Copy</button></div>` +
               `<pre><code>${esc(code.replace(/\n$/, ""))}</code></pre></div>`;
      }
      let html = "", list = null;
      esc(part).split("\n").forEach((line) => {
        const ul = /^\s*[-*]\s+(.*)/.exec(line);
        const ol = /^\s*\d+\.\s+(.*)/.exec(line);
        const h = /^#{1,6}\s+(.*)/.exec(line);
        if (ul || ol) {
          const tag = ul ? "ul" : "ol";
          if (list !== tag) { if (list) html += `</${list}>`; html += `<${tag}>`; list = tag; }
          html += `<li>${inline((ul || ol)[1])}</li>`;
        } else {
          if (list) { html += `</${list}>`; list = null; }
          if (h) html += `<p><b>${inline(h[1])}</b></p>`;
          else if (line.trim()) html += `<p>${inline(line)}</p>`;
        }
      });
      if (list) html += `</${list}>`;
      return html;
    }).join("");
  }

  /* ---------- Sidebar ---------- */
  function renderSide() {
    const box = $("#hist");
    box.innerHTML = "";
    if (!chats.length) { box.innerHTML = '<div class="empty">No chats yet.</div>'; return; }
    chats.filter((c) => c.title.toLowerCase().includes(query)).forEach((c) => {
      const row = document.createElement("div");
      row.className = "item" + (c.id === cur ? " active" : "");

      const open = document.createElement("button");
      open.className = "t";
      open.textContent = c.title;
      open.onclick = () => { openChat(c.id); if (innerWidth <= 768) toggleSide(false); };

      const del = document.createElement("button");
      del.className = "del";
      del.setAttribute("aria-label", "Delete chat");
      del.innerHTML = ICON.trash;
      del.onclick = (e) => {
        e.stopPropagation();
        if (cur === c.id) { stop(); cur = null; }
        chats = chats.filter((k) => k.id !== c.id);
        save(); renderSide(); renderFeed();
      };

      row.append(open, del);
      box.append(row);
    });
  }

  function toggleSide(open) {
    $("#side").classList.toggle("closed", !open);
    $("#shade").classList.toggle("show", open && innerWidth <= 768);
  }

  /* ---------- Chat feed ---------- */
  function msgEl(m, index, isLast) {
    const row = document.createElement("div");
    row.className = "msg " + m.role;
    if (m.role === "user") {
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = m.content;
      row.append(bubble);
      return row;
    }
    row.dataset.i = index;
    row.innerHTML =
      `<div class="logo">${ICON.logo}</div><div class="body"><div class="txt">${md(m.content)}</div><div class="acts">` +
      `<button data-a="copy" aria-label="Copy">${ICON.copy}</button>` +
      `<button data-a="up" aria-label="Good response" class="${m.vote === "up" ? "on" : ""}">${ICON.up}</button>` +
      `<button data-a="down" aria-label="Bad response" class="${m.vote === "down" ? "on" : ""}">${ICON.down}</button>` +
      (isLast ? `<button data-a="redo" aria-label="Regenerate">${ICON.redo}</button>` : "") +
      `</div></div>`;
    return row;
  }

  function renderFeed() {
    const feed = $("#feed");
    feed.innerHTML = "";
    const chat = find(cur);
    const empty = !chat || !chat.msgs.length;
    $("#main").classList.toggle("fresh", empty);   // fresh = centred composer
    if (empty) return;
    chat.msgs.forEach((m, i) => {
      feed.append(msgEl(m, i, i === chat.msgs.length - 1 && m.role === "assistant"));
    });
    const pad = document.createElement("div");
    pad.style.height = "24px";
    feed.append(pad);
    $("#scroll").scrollTop = $("#scroll").scrollHeight;
  }

  function openChat(id) { stop(); cur = id; renderSide(); renderFeed(); $("#input").focus(); }
  function newChat() { stop(); cur = null; renderSide(); renderFeed(); $("#input").focus(); }

  /* ---------- Send / generate ---------- */
  const busy = () => ctl !== null;

  // Button shows: stop (while generating), send (text typed), or voice (empty).
  function syncSend() {
    const b = $("#send");
    const hasText = $("#input").value.trim() !== "";
    if (busy()) { b.innerHTML = ICON.stop; b.className = ""; b.setAttribute("aria-label", "Stop generating"); }
    else if (hasText) { b.innerHTML = ICON.send; b.className = ""; b.setAttribute("aria-label", "Send message"); }
    else { b.innerHTML = ICON.wave; b.className = "voice"; b.setAttribute("aria-label", "Start voice"); }
  }

  function grow() {
    const t = $("#input");
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 200) + "px";
    syncSend();
  }

  function stop() { if (ctl) ctl.abort(); }

  async function generate(chat) {
    const reply = { role: "assistant", content: "" };
    // Send the last 20 turns, starting on a user turn.
    const turns = chat.msgs.slice(-20).map(({ role, content }) => ({ role, content }));
    while (turns.length && turns[0].role !== "user") turns.shift();

    chat.msgs.push(reply);
    renderFeed();
    const el = $("#feed .msg:nth-last-child(2) .txt");
    if (el) { el.classList.add("cursor"); el.textContent = "Thinking…"; }

    ctl = new AbortController();
    syncSend();
    try {
      await ChatAPI.stream(turns, {
        signal: ctl.signal,
        thinking: thinkOn,
        onText: (text) => {
          reply.content = text;
          if (el) el.innerHTML = md(text);
          $("#scroll").scrollTop = $("#scroll").scrollHeight;
        },
      });
    } catch (e) {
      if (e.name !== "AbortError") toast(e.message, 9000);
    } finally {
      ctl = null;
      if (!reply.content) chat.msgs = chat.msgs.filter((m) => m !== reply);
      save(); syncSend(); renderFeed();
    }
  }

  function send(text) {
    text = (text || "").trim();
    if (!text || busy()) return;
    if (!ChatAPI.isReady()) { openSettings("Add your API key to get replies."); return; }

    let chat = find(cur);
    if (!chat) {
      chat = { id: String(Date.now()), title: text.length > 34 ? text.slice(0, 34) + "…" : text, msgs: [] };
      chats.unshift(chat);
      cur = chat.id;
    }
    chat.msgs.push({ role: "user", content: text });
    $("#input").value = "";
    grow();
    renderSide();
    save();
    generate(chat);
  }

  /* ---------- API settings dialog ---------- */
  const dlg = $("#settings");

  function updateKeyBtn() {
    $("#keyLabel").textContent = ChatAPI.isReady() ? "API settings" : "Add API key";
  }

  function openSettings(message = "") {
    const s = ChatAPI.load();
    $("#provider").value = s.provider;
    $("#apiKey").value = s.apiKey;
    $("#baseUrl").value = s.baseUrl;
    $("#model").value = s.model;
    $("#settingsMsg").textContent = message;
    dlg.showModal();
  }

  $("#keyBtn").onclick = () => openSettings();
  $(".me").onclick = () => openSettings();
  $("#cancelSettings").onclick = () => dlg.close();
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });  // click on backdrop

  $("#provider").onchange = () => {            // switching provider fills in its defaults
    const preset = ChatAPI.PRESETS[$("#provider").value];
    $("#baseUrl").value = preset.baseUrl;
    $("#model").value = preset.model;
  };
  $("#clearKey").onclick = () => {
    ChatAPI.save({ ...ChatAPI.load(), apiKey: "" });
    updateKeyBtn();
    dlg.close();
  };
  $("#settingsForm").addEventListener("submit", () => {   // fires, then the dialog closes itself
    ChatAPI.save({
      provider: $("#provider").value,
      apiKey: $("#apiKey").value.trim(),
      baseUrl: $("#baseUrl").value.trim().replace(/\/+$/, ""),
      model: $("#model").value.trim(),
    });
    updateKeyBtn();
  });

  /* ---------- Event wiring ---------- */
  $("#input").addEventListener("input", grow);
  $("#input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(e.target.value); }
  });
  $("#send").onclick = () => {
    if (busy()) stop();
    else if ($("#input").value.trim()) send($("#input").value);
    else toast("Voice is not available in this demo.");
  };
  $("#newChat").onclick = () => { newChat(); if (innerWidth <= 768) toggleSide(false); };

  // Message actions (copy, vote, regenerate) and code-block copy buttons.
  $("#feed").addEventListener("click", async (e) => {
    const cp = e.target.closest("[data-copy]");
    if (cp) {
      await copyText(cp.closest(".pre").querySelector("code").textContent);
      const old = cp.innerHTML; cp.textContent = "Copied";
      setTimeout(() => { cp.innerHTML = old; }, 1200);
      return;
    }
    const btn = e.target.closest("[data-a]");
    if (!btn) return;
    const chat = find(cur);
    const m = chat.msgs[+btn.closest(".msg").dataset.i];
    const action = btn.dataset.a;
    if (action === "copy") {
      await copyText(m.content);
      btn.classList.add("on"); setTimeout(() => btn.classList.remove("on"), 900);
    } else if (action === "up" || action === "down") {
      m.vote = m.vote === action ? null : action;
      save(); renderFeed();
    } else if (action === "redo" && !busy()) {
      chat.msgs.pop(); save(); generate(chat);
    }
  });

  // Placeholder controls ("data-soon") and suggestion rows ("data-fill").
  document.addEventListener("click", (e) => {
    const soon = e.target.closest("[data-soon]");
    if (soon) { toast(soon.dataset.soon + " is not available in this demo."); return; }
    const fill = e.target.closest("[data-fill]");
    if (fill) { const t = $("#input"); t.value = fill.dataset.fill; grow(); t.focus(); }
  });

  $("#think").onclick = (e) => {
    thinkOn = !thinkOn;
    e.currentTarget.classList.toggle("on", thinkOn);
    e.currentTarget.setAttribute("aria-pressed", thinkOn);
  };

  $("#srch").onclick = () => {
    const q = $("#q");
    q.hidden = !q.hidden;
    if (q.hidden) { q.value = ""; query = ""; renderSide(); } else q.focus();
  };
  $("#q").oninput = (e) => { query = e.target.value.toLowerCase(); renderSide(); };

  $("#vx").onclick = () => { $("#voice").hidden = true; };

  $("#openSide").onclick = () => toggleSide(true);
  $("#closeSide").onclick = () => toggleSide(false);
  $("#shade").onclick = () => toggleSide(false);

  $("#theme").onclick = () => {
    const root = document.documentElement;
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("chatui.theme", root.dataset.theme); } catch {}
  };

  // Voice dictation (browser speech recognition, if available).
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  $("#mic").onclick = (e) => {
    const btn = e.currentTarget;
    if (!SR) { toast("Dictation is not supported in this browser."); return; }
    if (rec) { rec.stop(); return; }
    const base = $("#input").value;
    rec = new SR();
    rec.interimResults = true;
    rec.onresult = (ev) => {
      const said = [...ev.results].map((r) => r[0].transcript).join("");
      $("#input").value = (base ? base + " " : "") + said;
      grow();
    };
    rec.onend = () => { rec = null; btn.classList.remove("on"); };
    rec.onerror = () => toast("Microphone access was blocked.");
    try { rec.start(); btn.classList.add("on"); } catch { rec = null; }
  };

  /* ---------- Start up ---------- */
  try {
    const theme = localStorage.getItem("chatui.theme");
    if (theme) document.documentElement.dataset.theme = theme;
  } catch {}
  load();
  if (innerWidth <= 768) toggleSide(false);
  updateKeyBtn();
  renderSide();
  renderFeed();
  syncSend();
})();
