/* iz_cards.js - Psympha card mode renderer (inbox zero, later sphere sessions).
   Master copy: Airtable Ops › Scripts row "iz_cards.js". Published one-way to GitHub
   by publish_cards.py; widgets load it from jsDelivr pinned to the tag in Scripts › Published.
   Claude writes only JSON per round:  IZCards.render(el, data)
   data = {v, title, sub, cap, note, fyi:{items:[{code,text,propose?,from?}], heading?},
           cards:[{code, label, title, meta?, context?, body?, draft?:{to,cc,subject,text,files?},
                   thread?:[{who,when,text}], options?:[str], reply?, actions?:[[label,cmd]], text_cmd?}],
           closed:[{code,text}], help?}
   Commands are the normal text-mode commands; the global button sends them as ONE chat message.
   Drafts (typed text + picked buttons) autosave to localStorage per card (key: title + code + card title),
   come back when the widget is redrawn (e.g. after visiting another chat), are cleared on Send and
   expire after 3 days. Storage may be blocked in some clients - then cards behave as before. */
(function () {
  var VERSION = "1.1.0";
  var CSS = [
    ".izc{font-family:var(--font-sans);color:var(--text-primary);font-size:15px;line-height:1.55}",
    ".izc *{box-sizing:border-box}",
    ".izc-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin:0 0 4px}",
    ".izc-title{font-size:18px;font-weight:500;margin:0}",
    ".izc-cap{font-size:13px;color:var(--text-secondary);margin:0 0 12px}",
    ".izc-card{background:var(--surface-2);border:0.5px solid var(--border);border-radius:12px;padding:14px 16px;margin:0 0 10px}",
    ".izc-card.izc-picked{border-color:var(--fill-accent);border-width:1.5px}",
    ".izc-prev{font-size:13px;margin:12px 0 0;padding:8px 12px;background:var(--surface-1);border-radius:var(--radius);white-space:pre-wrap;font-family:var(--font-mono);color:var(--text-primary)}",
    ".izc-prev.empty{color:var(--text-muted);font-family:var(--font-sans)}",
    ".izc-top{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}",
    ".izc-code{font-family:var(--font-mono);font-size:13px;color:var(--text-secondary)}",
    ".izc-lab{font-size:12px;padding:1px 8px;border-radius:var(--radius);background:var(--bg-neutral,var(--surface-1));color:var(--text-secondary)}",
    ".izc-lab.reply{background:var(--bg-accent);color:var(--text-accent)}",
    ".izc-lab.decide,.izc-lab.action{background:var(--bg-warning);color:var(--text-warning)}",
    ".izc-lab.urgent{background:var(--bg-danger);color:var(--text-danger)}",
    ".izc-lab.fyi{background:var(--bg-success);color:var(--text-success)}",
    ".izc-t{font-weight:500;font-size:15px}",
    ".izc-meta{font-size:13px;color:var(--text-secondary);margin:2px 0 0}",
    ".izc-p{margin:8px 0 0;white-space:pre-wrap;word-wrap:break-word}",
    ".izc-draft{margin:10px 0 0;padding:10px 12px;background:var(--surface-1);border-radius:var(--radius);font-size:14px}",
    ".izc-draft .h{font-size:12px;color:var(--text-secondary);margin:0 0 6px;word-wrap:break-word}",
    ".izc-draft .b{white-space:pre-wrap;word-wrap:break-word;margin:0}",
    ".izc-reply{margin:10px 0 0;padding:8px 12px;border-left:2px solid var(--border-accent);border-radius:0;font-size:14px;white-space:pre-wrap}",
    ".izc details{margin:8px 0 0;font-size:13px;color:var(--text-secondary)}",
    ".izc details p{margin:6px 0 0;white-space:pre-wrap;color:var(--text-primary)}",
    ".izc-acts{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0}",
    ".izc-acts button{font-size:13px;min-height:34px;padding:0 12px}",
    ".izc-acts button.on{background:var(--bg-accent);color:var(--text-accent);border-color:var(--border-accent)}",
    ".izc textarea{width:100%;min-height:84px;margin:8px 0 0;font:inherit;font-size:14px;padding:7px 10px;border:0.5px solid var(--border-strong);border-radius:var(--radius);background:var(--fill-field,transparent);color:var(--text-primary);resize:vertical}",
    ".izc-fyi li{margin:0 0 6px}",
    ".izc-fyi ul{margin:8px 0 0;padding-left:18px}",
    ".izc-prop{color:var(--text-secondary)}",
    ".izc-closed{font-size:13px;color:var(--text-secondary);margin:4px 0 12px;padding:0;list-style:none}",
    ".izc-closed li{padding:2px 0}",
    ".izc-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:14px 0 4px}",
    ".izc-bar .go{min-height:40px;padding:0 18px;font-weight:500}",
    ".izc-out{font-size:13px;color:var(--text-secondary);white-space:pre-wrap;font-family:var(--font-mono)}",
    ".izc-err{font-size:13px;color:var(--text-danger)}",
    ".izc-help{font-size:12px;color:var(--text-muted);margin:6px 0 0}"
  ].join("\n");

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }
  function labClass(l) {
    l = (l || "").toLowerCase();
    if (l.indexOf("fyi") === 0) return "fyi";
    if (l.indexOf("reply") === 0) return "reply";
    if (l.indexOf("urgent") === 0) return "urgent";
    if (l.indexOf("decide") === 0) return "decide";
    if (l.indexOf("action") === 0) return "action";
    return "";
  }
  function setOn(b, on) {
    if (!b._label) b._label = b.textContent;
    b.textContent = (on ? "\u2713 " : "") + b._label;
    b.style.background = on ? "var(--fill-accent)" : "";
    b.style.color = on ? "var(--on-accent)" : "";
    b.style.borderColor = on ? "var(--fill-accent)" : "";
    b.setAttribute("aria-pressed", on ? "true" : "false");
  }
  var STORE_DAYS = 3;
  function hashStr(t) { var h = 0; t = String(t || ""); for (var i = 0; i < t.length; i++) { h = ((h << 5) - h + t.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); }
  function ls() { try { var x = window.localStorage; x.setItem("izc:t", "1"); x.removeItem("izc:t"); return x; } catch (e) { return null; } }
  function sGet(k) { var x = ls(); if (!x) return null; try { var v = JSON.parse(x.getItem(k) || "null"); if (v && v.ts && Date.now() - v.ts > STORE_DAYS * 864e5) { x.removeItem(k); return null; } return v; } catch (e) { return null; } }
  function sSet(k, v) { var x = ls(); if (!x) return; try { v.ts = Date.now(); x.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function sDel(k) { var x = ls(); if (!x) return; try { x.removeItem(k); } catch (e) {} }
  function sPrune() { var x = ls(); if (!x) return; try { for (var i = x.length - 1; i >= 0; i--) { var k = x.key(i); if (k && k.indexOf("izc:") === 0) sGet(k); } } catch (e) {} }
  function bare(code) { return String(code).replace(/^#/, ""); }

  function defaultActions(c) {
    var code = c.code, n = bare(code);
    if (/^#/.test(code)) return [["Send", "send " + n], ["Edit", "edit " + n + ": {text}"], ["Discard", "discard " + n], ["Skip", "skip " + code], ["Later", "later " + code]];
    if (/^D\d/.test(code)) return [["Do now", "do " + code], ["Plan", "plan " + code], ["Drop", "drop " + code]];
    if (/^R\d/.test(code)) return [["Utlegg", "utlegg " + code], ["Privat", "privat " + code]];
    if (/^H\d/.test(code)) return [["OK", "ok " + code], ["Done", "done " + code], ["Skip", "skip " + code], ["Later", "later " + code]];
    return [["Done", "done " + code], ["Skip", "skip " + code], ["Later", "later " + code]];
  }

  function render(root, data) {
    if (typeof root === "string") root = document.getElementById(root);
    data = data || {};
    root.innerHTML = "";
    sPrune();
    var kp = "izc:" + hashStr(data.title || "Inbox zero") + ":";
    if (!document.getElementById("izc-style")) {
      var st = document.createElement("style"); st.id = "izc-style"; st.textContent = CSS; document.head.appendChild(st);
    }
    var wrap = el("div", "izc"); root.appendChild(wrap);
    var h2 = el("h2", null, data.title || "Inbox zero"); h2.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)"; wrap.appendChild(h2);

    var head = el("div", "izc-head");
    head.appendChild(el("p", "izc-title", data.title || "Inbox zero"));
    if (data.sub) head.appendChild(el("span", "izc-cap", data.sub));
    wrap.appendChild(head);
    if (data.cap) wrap.appendChild(el("p", "izc-cap", data.cap));
    if (data.note) wrap.appendChild(el("p", "izc-p", data.note));

    if (data.closed && data.closed.length) {
      var ul = el("ul", "izc-closed");
      data.closed.forEach(function (x) { ul.appendChild(el("li", null, "✓ " + x.code + " · " + x.text)); });
      wrap.appendChild(ul);
    }

    var state = [];
    var preview = function () {};

    if (data.fyi && data.fyi.items && data.fyi.items.length) {
      var f = el("div", "izc-card izc-fyi");
      var top = el("div", "izc-top");
      top.appendChild(el("span", "izc-lab fyi", "FYI – no action"));
      top.appendChild(el("span", "izc-t", data.fyi.heading || ("FYIs (" + data.fyi.items.length + ")")));
      f.appendChild(top);
      var fl = el("ul");
      var fyiState = { kind: "fyi", choice: null, yes: {}, except: {}, ta: null, card: f,
        key: kp + "fyi:" + hashStr(data.fyi.items.map(function (x) { return x.code + x.text; }).join("|")) };
      var fsv = sGet(fyiState.key) || {};
      var fyiBtns = [];
      data.fyi.items.forEach(function (it) {
        var li = el("li");
        li.appendChild(el("span", "izc-code", it.code + " "));
        li.appendChild(document.createTextNode(it.text + (it.from ? " (from " + it.from + ")" : "")));
        if (it.propose) {
          li.appendChild(el("span", "izc-prop", " → " + it.propose + " "));
          var yb = el("button", null, "Yes " + it.code); yb.style.cssText = "font-size:12px;min-height:28px;padding:0 8px;margin-left:4px";
          yb.onclick = function () { fyiState.yes[it.code] = !fyiState.yes[it.code]; setOn(yb, !!fyiState.yes[it.code]); mark(); };
          if (fsv.yes && fsv.yes[it.code]) fyiBtns.push(function () { fyiState.yes[it.code] = true; setOn(yb, true); });
          li.appendChild(yb);
        }
        var kb = el("button", null, "Keep"); kb.title = "Keep open (seen except)"; kb.style.cssText = "font-size:12px;min-height:28px;padding:0 8px;margin-left:4px";
        kb.onclick = function () { fyiState.except[it.code] = !fyiState.except[it.code]; setOn(kb, !!fyiState.except[it.code]); mark(); };
        if (fsv.except && fsv.except[it.code]) fyiBtns.push(function () { fyiState.except[it.code] = true; setOn(kb, true); });
        li.appendChild(kb);
        fl.appendChild(li);
      });
      f.appendChild(fl);
      var fa = el("div", "izc-acts");
      var seen = el("button", null, "Seen");
      seen.onclick = function () { fyiState.choice = fyiState.choice ? null : "seen"; setOn(seen, !!fyiState.choice); mark(); };
      fa.appendChild(seen); f.appendChild(fa);
      var fta = el("textarea"); fta.placeholder = "Answer to an FYI, e.g. F2: remind me in Booking"; fta.rows = 3; fta.oninput = mark;
      fyiState.ta = fta; f.appendChild(fta);
      function mark() {
        f.className = "izc-card izc-fyi" + (fyiCmd(fyiState) ? " izc-picked" : "");
        if (fyiCmd(fyiState)) sSet(fyiState.key, { t: fta.value, choice: fyiState.choice, yes: fyiState.yes, except: fyiState.except }); else sDel(fyiState.key);
        preview();
      }
      if (fsv.t) fta.value = fsv.t;
      if (fsv.choice === "seen") { fyiState.choice = "seen"; setOn(seen, true); }
      fyiBtns.forEach(function (fn) { fn(); });
      f.className = "izc-card izc-fyi" + (fyiCmd(fyiState) ? " izc-picked" : "");
      state.push(fyiState);
      wrap.appendChild(f);
    }

    (data.cards || []).forEach(function (c) {
      var card = el("div", "izc-card");
      var s = { kind: "card", code: c.code, cmd: null, ta: null, card: card, textCmd: c.text_cmd,
        key: kp + c.code + ":" + hashStr((c.title || "") + "|" + (c.draft && c.draft.subject || "")) };
      var top = el("div", "izc-top");
      top.appendChild(el("span", "izc-code", c.code));
      if (c.label) top.appendChild(el("span", "izc-lab " + labClass(c.label), c.label));
      if (c.title) top.appendChild(el("span", "izc-t", c.title));
      card.appendChild(top);
      if (c.meta) card.appendChild(el("p", "izc-meta", c.meta));
      if (c.context) card.appendChild(el("p", "izc-p", c.context));
      if (c.body) card.appendChild(el("p", "izc-p", c.body));
      if (c.options && c.options.length) {
        var ol = el("div", "izc-p"); ol.textContent = c.options.join("\n"); card.appendChild(ol);
      }
      if (c.draft) {
        var d = el("div", "izc-draft");
        var hl = [];
        if (c.draft.to) hl.push("To " + c.draft.to);
        if (c.draft.cc) hl.push("Cc " + c.draft.cc);
        if (c.draft.subject) hl.push(c.draft.subject);
        if (c.draft.files && c.draft.files.length) hl.push("Files: " + c.draft.files.join(", "));
        if (hl.length) d.appendChild(el("p", "h", hl.join(" · ")));
        d.appendChild(el("p", "b", c.draft.text || ""));
        card.appendChild(d);
      }
      if (c.thread && c.thread.length) {
        var det = el("details");
        det.appendChild(el("summary", null, "Latest in the thread (" + c.thread.length + ")"));
        c.thread.forEach(function (m) { det.appendChild(el("p", null, (m.who || "") + (m.when ? " · " + m.when : "") + "\n" + (m.text || ""))); });
        card.appendChild(det);
      }
      if (c.reply) card.appendChild(el("div", "izc-reply", c.reply));
      var acts = c.actions || defaultActions(c);
      var ab = el("div", "izc-acts"), btns = [];
      acts.forEach(function (a) {
        var b = el("button", null, a[0]);
        b.onclick = function () {
          s.cmd = (s.cmd === a[1]) ? null : a[1];
          btns.forEach(function (x) { setOn(x, false); });
          if (s.cmd) setOn(b, true);
          if (s.cmd && s.cmd.indexOf("{text}") >= 0) s.ta.focus();
          paint();
        };
        btns.push(b); ab.appendChild(b);
      });
      card.appendChild(ab);
      var ta = el("textarea"); ta.rows = 3;
      ta.placeholder = /^#/.test(c.code) ? "Answer or edit instruction" : "Your answer";
      ta.oninput = paint; s.ta = ta; card.appendChild(ta);
      function paint() {
        card.className = "izc-card" + (cardCmd(s) ? " izc-picked" : "");
        if (s.cmd || ta.value.trim()) sSet(s.key, { t: ta.value, c: s.cmd }); else sDel(s.key);
        preview();
      }
      var sv = sGet(s.key);
      if (sv) {
        if (sv.t) ta.value = sv.t;
        if (sv.c) { for (var i = 0; i < acts.length; i++) { if (acts[i][1] === sv.c) { s.cmd = sv.c; setOn(btns[i], true); } } }
        card.className = "izc-card" + (cardCmd(s) ? " izc-picked" : "");
      }
      state.push(s);
      wrap.appendChild(card);
    });

    var prev = el("div", "izc-prev empty", "Nothing picked yet");
    wrap.appendChild(prev);
    function collect() { var lines = []; state.forEach(function (s) { var c = s.kind === "fyi" ? fyiCmd(s) : cardCmd(s); if (c) lines.push(c); }); return lines; }
    preview = function () { var l = collect(); prev.className = "izc-prev" + (l.length ? "" : " empty"); prev.textContent = l.length ? "Will send:\n" + l.join("\n") : "Nothing picked yet"; };
    preview();
    var bar = el("div", "izc-bar");
    var go = el("button", "go", "Send answers ↗");
    var out = el("span", "izc-out");
    var err = el("span", "izc-err");
    bar.appendChild(go); bar.appendChild(err); wrap.appendChild(bar); wrap.appendChild(out);
    if (data.help !== false) wrap.appendChild(el("p", "izc-help", data.help || ("Pick a button and/or type, on as many cards as you like, then send once. Cards you leave alone stay open." + (ls() ? " What you type is kept on this device until you send." : ""))));

    go.onclick = function () {
      var lines = collect();
      if (!lines.length) { err.textContent = "Answer at least one card first"; return; }
      err.textContent = "";
      var msg = lines.join("\n");
      if (typeof sendPrompt === "function") {
        sendPrompt(msg);
        state.forEach(function (s) { sDel(s.key); });
        go.textContent = "Sent – waiting for Claude"; go.disabled = true;
        state.forEach(function (s) { s.card.style.opacity = "0.6"; });
      } else {
        out.textContent = "Couldn't send from here. Copy this into the chat:\n" + msg;
      }
    };
    return { version: VERSION };
  }

  function cardCmd(s) {
    var t = (s.ta && s.ta.value || "").trim();
    if (s.cmd) {
      if (s.cmd.indexOf("{text}") >= 0) return t ? s.cmd.replace("{text}", t) : null;
      return t ? s.cmd + "\n" + s.code + ": " + t : s.cmd;
    }
    if (t) return s.textCmd ? s.textCmd.replace("{text}", t) : s.code + ": " + t;
    return null;
  }
  function fyiCmd(s) {
    var parts = [];
    Object.keys(s.yes).forEach(function (k) { if (s.yes[k]) parts.push("yes " + k); });
    var t = (s.ta && s.ta.value || "").trim();
    if (t) parts.push(t);
    if (s.choice === "seen") {
      var ex = Object.keys(s.except).filter(function (k) { return s.except[k]; });
      parts.push(ex.length ? "seen except " + ex.join(" ") : "seen");
    }
    return parts.length ? parts.join("\n") : null;
  }

  window.IZCards = { render: render, version: VERSION };
})();
