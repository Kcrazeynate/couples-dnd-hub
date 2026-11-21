// D&D Campaign Hub app logic.
// Tabs, Supabase reads and writes, dice roller, battle tracker.

(function () {
  "use strict";

  var PLACEHOLDER_URL = "PASTE_SUPABASE_URL_HERE";
  var PLACEHOLDER_KEY = "PASTE_SUPABASE_ANON_KEY_HERE";
  var PLACEHOLDER_PASS = "CHANGE_ME_PASSPHRASE";

  var db = null;
  var configured = false;
  var selectedDie = 20;
  var combatants = [];
  var currentTurn = 0;

  // ---------- helpers ----------

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmtTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function numOrNull(value) {
    if (value === "" || value === null || value === undefined) return null;
    var n = parseInt(value, 10);
    return isNaN(n) ? null : n;
  }

  function rollDie(sides) {
    if (window.crypto && window.crypto.getRandomValues) {
      var arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      return (arr[0] % sides) + 1;
    }
    return Math.floor(Math.random() * sides) + 1;
  }

  function setupNeeded() {
    alert("Setup is not finished yet. Fill in config.js first. See README.md.");
  }

  // ---------- passphrase gate ----------

  function initGate() {
    var gate = $("gate");
    var app = $("app");
    var setupMsg = $("gate-setup");
    var gateForm = $("gate-form");
    var input = $("passphrase-input");
    var btn = $("passphrase-btn");
    var error = $("gate-error");

    if (CONFIG.CAMPAIGN_PASSPHRASE === PLACEHOLDER_PASS) {
      setupMsg.classList.remove("hidden");
      gateForm.classList.add("hidden");
      return;
    }

    function storedUnlocked() {
      try { if (localStorage.getItem("dnd_hub_unlocked") === "1") return true; } catch (e) {}
      try { if (sessionStorage.getItem("dnd_hub_unlocked") === "1") return true; } catch (e) {}
      return false;
    }

    if (storedUnlocked()) {
      unlock();
      return;
    }

    function tryUnlock() {
      if (input.value === CONFIG.CAMPAIGN_PASSPHRASE) {
        if ($("remember-device") && $("remember-device").checked) {
          try { localStorage.setItem("dnd_hub_unlocked", "1"); } catch (e) {}
        } else {
          sessionStorage.setItem("dnd_hub_unlocked", "1");
        }
        unlock();
      } else {
        error.classList.remove("hidden");
        input.value = "";
        input.focus();
      }
    }

    btn.addEventListener("click", tryUnlock);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") tryUnlock();
    });

    function unlock() {
      gate.classList.add("hidden");
      app.classList.remove("hidden");
      var lockBtn = $("lock-btn");
      if (lockBtn) {
        lockBtn.addEventListener("click", function () {
          try { localStorage.removeItem("dnd_hub_unlocked"); } catch (e) {}
          try { sessionStorage.removeItem("dnd_hub_unlocked"); } catch (e) {}
          location.reload();
        });
      }
      initApp();
    }
  }

  // ---------- Supabase ----------

  function initDb() {
    if (CONFIG.SUPABASE_URL === PLACEHOLDER_URL ||
        CONFIG.SUPABASE_ANON_KEY === PLACEHOLDER_KEY) {
      configured = false;
      return;
    }
    configured = true;
    db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  }

  // ---------- tabs ----------

  var TAB_LOADERS = {
    board: loadMessages,
    log: loadLogEntries,
    characters: loadCharacters,
    quests: loadQuests,
    npcs: loadNpcs,
    dice: loadRolls,
    battle: loadCombatants,
    maps: loadMaps
  };

  function switchTab(name) {
    document.querySelectorAll(".tab-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.tab === name);
    });
    document.querySelectorAll(".tab-panel").forEach(function (p) {
      p.classList.toggle("active", p.id === "tab-" + name);
    });
    var loader = TAB_LOADERS[name];
    if (loader) loader();
  }

  // ---------- Board ----------

  function messageTag(body) {
    if (!body) return null;
    if (body.indexOf("[Question] ") === 0) return { tag: "Question", cls: "tag-question", text: body.slice(11) };
    if (body.indexOf("[Decision] ") === 0) return { tag: "Decision", cls: "tag-decision", text: body.slice(11) };
    return null;
  }

  async function loadMessages() {
    var list = $("messages-list");
    if (!configured) {
      list.innerHTML = '<p class="empty">Setup is not finished yet. See README.md.</p>';
      return;
    }
    var res = await db.from("messages").select("*").order("created_at", { ascending: true });
    if (res.error) {
      list.innerHTML = '<p class="error">Could not load messages.</p>';
      return;
    }
    if (!res.data.length) {
      list.innerHTML = '<p class="empty">No messages yet. Post the first one below.</p>';
      return;
    }
    list.innerHTML = res.data.map(function (m) {
      var tag = messageTag(m.body);
      var bodyText = tag ? tag.text : m.body;
      return '<div class="card">' +
        '<p class="meta">' + escapeHtml(m.author) + ' - ' + escapeHtml(fmtTime(m.created_at)) + '</p>' +
        (tag ? '<p><span class="badge ' + tag.cls + '">' + tag.tag + '</span></p>' : '') +
        '<p>' + escapeHtml(bodyText) + '</p>' +
        '</div>';
    }).join("");
    list.scrollTop = list.scrollHeight;
  }

  async function postMessage(e) {
    e.preventDefault();
    if (!configured) return setupNeeded();
    var author = $("message-author").value;
    var body = $("message-body").value.trim();
    if (!body) return;
    var type = $("message-type").value;
    if (type === "question") body = "[Question] " + body;
    if (type === "decision") body = "[Decision] " + body;
    var res = await db.from("messages").insert({ author: author, body: body });
    if (res.error) {
      alert("Could not post the message. Check the connection and try again.");
      return;
    }
    $("message-body").value = "";
    loadMessages();
  }

  // ---------- Push notifications ----------

  var pushRegistration = null;

  function urlBase64ToUint8Array(base64) {
    var padding = "=".repeat((4 - base64.length % 4) % 4);
    var base64url = (base64 + padding).replace(/\-/g, "+").replace(/_/g, "/");
    var raw = window.atob(base64url);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function pushSupported() {
    return "serviceWorker" in navigator && "PushManager" in window &&
      "Notification" in window && !!CONFIG.VAPID_PUBLIC_KEY;
  }

  async function setupPush() {
    var status = $("push-status");
    var btn = $("push-toggle");
    if (!pushSupported()) {
      status.textContent = "Notifications are not supported in this browser. On iPhone, open the hub from the home screen app and try again.";
      btn.disabled = true;
      return;
    }
    try {
      pushRegistration = await navigator.serviceWorker.register("sw.js");
    } catch (e) {
      status.textContent = "Could not set up notifications on this phone.";
      btn.disabled = true;
      return;
    }
    btn.addEventListener("click", togglePush);
    await refreshPushStatus();
  }

  async function refreshPushStatus() {
    var status = $("push-status");
    var btn = $("push-toggle");
    var sub = await pushRegistration.pushManager.getSubscription();
    if (!sub) {
      status.textContent = "Notifications are off on this phone.";
      btn.textContent = "Turn on notifications";
      return;
    }
    var res = await db.from("push_subscriptions").select("label").eq("endpoint", sub.endpoint).limit(1);
    var label = res.data && res.data.length ? res.data[0].label : "this phone";
    status.textContent = "Notifications are on for " + label + " on this phone.";
    btn.textContent = "Turn off notifications";
  }

  async function togglePush() {
    var status = $("push-status");
    var btn = $("push-toggle");
    var sub = await pushRegistration.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
      await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await refreshPushStatus();
      return;
    }
    var label = ($("push-label").value || "").trim();
    if (!label) {
      status.textContent = "Type a name first, for example Angela, so new posts do not notify you about your own messages.";
      return;
    }
    if (Notification.permission === "denied") {
      status.textContent = "Notifications are blocked for this site. Allow them in the phone settings, then try again.";
      return;
    }
    var permission = await Notification.requestPermission();
    if (permission !== "granted") {
      status.textContent = "Notifications need permission to work.";
      return;
    }
    try {
      var newSub = await pushRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(CONFIG.VAPID_PUBLIC_KEY)
      });
      var json = newSub.toJSON();
      var res = await db.from("push_subscriptions").insert({
        label: label,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth
      });
      if (res.error) throw new Error(res.error.message);
      await refreshPushStatus();
    } catch (e) {
      status.textContent = "Could not turn on notifications. Check the connection and try again.";
    }
  }

  // ---------- Campaign Log ----------

  async function loadLogEntries() {
    var list = $("log-list");
    if (!configured) {
      list.innerHTML = '<p class="empty">Setup is not finished yet. See README.md.</p>';
      return;
    }
    var res = await db.from("log_entries").select("*").order("created_at", { ascending: false });
    if (res.error) {
      list.innerHTML = '<p class="error">Could not load the log.</p>';
      return;
    }
    if (!res.data.length) {
      list.innerHTML = '<p class="empty">No log entries yet.</p>';
      return;
    }
    var effectsByLog = {};
    var effRes = await db.from("log_effects").select("*").order("created_at", { ascending: true });
    if (!effRes.error && effRes.data) {
      effRes.data.forEach(function (fx) {
        (effectsByLog[fx.log_id] = effectsByLog[fx.log_id] || []).push(fx);
      });
    }
    list.innerHTML = res.data.map(function (entry) {
      var fxs = effectsByLog[entry.id] || [];
      var fxHtml = fxs.length
        ? '<p class="meta">Changes: ' + fxs.map(function (fx) { return escapeHtml(effectText(fx)); }).join(" · ") + '</p>'
        : '';
      return '<div class="card">' +
        '<p class="meta">' + escapeHtml(fmtTime(entry.created_at)) + '</p>' +
        '<p class="title">' + escapeHtml(entry.title) + '</p>' +
        '<p>' + escapeHtml(entry.body) + '</p>' + fxHtml +
        '</div>';
    }).join("");
  }

  // ---------- Log entry effects ----------

  var logEffectsReady = false;

  function signedNum(n) {
    n = n || 0;
    return (n >= 0 ? "+" : "") + n;
  }

  function effectTargetName(target) {
    if (target === "party") return "Party";
    if (charByPlayer[target] && charByPlayer[target].name) return charByPlayer[target].name;
    return playerLabel(target);
  }

  function effectText(fx) {
    var who = effectTargetName(fx.target);
    if (fx.kind === "xp") return who + " " + signedNum(fx.amount) + " XP";
    if (fx.kind === "gold") return who + " " + signedNum(fx.amount) + " gold";
    if (fx.kind === "hp") return who + " " + signedNum(fx.amount) + " HP";
    if (fx.kind === "temp_hp") return who + " temp HP set to " + fx.amount;
    if (fx.kind === "level") return who + " is now level " + fx.amount;
    if (fx.kind === "add_item") return who + " gained: " + fx.item;
    if (fx.kind === "remove_item") return who + " lost: " + fx.item;
    return who + " " + fx.kind;
  }

  async function setupLogEffects() {
    var box = $("log-effects");
    if (!box) return;
    var res = await db.from("log_effects").select("id").limit(1);
    if (res.error) return; // table not there yet (SQL not run): leave the section hidden
    logEffectsReady = true;
    box.classList.remove("hidden");
    $("log-effect-add").addEventListener("click", addLogEffectRow);
  }

  function addLogEffectRow() {
    var row = document.createElement("div");
    row.className = "effect-row";
    var sources = charPlayers.length ? charPlayers : PLAYERS;
    var targetOpts = '<option value="party">Full party</option>' + sources.map(function (p) {
      return '<option value="' + p.player + '">' + escapeHtml(effectTargetName(p.player)) + '</option>';
    }).join("");
    row.innerHTML =
      '<select class="effect-target">' + targetOpts + '</select>' +
      '<select class="effect-kind">' +
        '<option value="xp">XP</option>' +
        '<option value="gold">Gold</option>' +
        '<option value="hp">HP</option>' +
        '<option value="temp_hp">Temp HP (set)</option>' +
        '<option value="add_item">Add item</option>' +
        '<option value="remove_item">Remove item</option>' +
        '<option value="level">Set level</option>' +
      '</select>' +
      '<input type="number" class="effect-value" placeholder="+/- amount">' +
      '<button type="button" class="effect-remove" title="Remove this change">x</button>';
    row.querySelector(".effect-kind").addEventListener("change", function (ev) {
      var v = row.querySelector(".effect-value");
      var itemKind = ev.target.value === "add_item" || ev.target.value === "remove_item";
      var next = document.createElement("input");
      next.className = "effect-value";
      if (itemKind) { next.type = "text"; next.placeholder = "Item name"; }
      else { next.type = "number"; next.placeholder = "+/- amount"; }
      v.replaceWith(next);
    });
    row.querySelector(".effect-remove").addEventListener("click", function () { row.remove(); });
    $("log-effect-rows").appendChild(row);
  }

  function clearLogEffectRows() { $("log-effect-rows").innerHTML = ""; }

  function readLogEffectRows() {
    var rows = document.querySelectorAll("#log-effect-rows .effect-row");
    var out = [];
    rows.forEach(function (row) {
      var target = row.querySelector(".effect-target").value;
      var kind = row.querySelector(".effect-kind").value;
      var val = row.querySelector(".effect-value").value.trim();
      if (!val) return;
      var fx = { target: target, kind: kind, amount: null, item: null };
      if (kind === "add_item" || kind === "remove_item") fx.item = val;
      else fx.amount = parseInt(val, 10);
      if (fx.amount !== null && isNaN(fx.amount)) return;
      out.push(fx);
    });
    return out;
  }

  async function applyLogEffect(fx) {
    var targets = fx.target === "party"
      ? (charPlayers.length ? charPlayers.map(function (p) { return p.player; }) : PLAYERS.map(function (p) { return p.player; }))
      : [fx.target];
    for (var i = 0; i < targets.length; i++) {
      var res = await db.from("characters").select("xp, gold, hp, max_hp, temp_hp, inventory, level").eq("player", targets[i]).single();
      if (res.error || !res.data) continue;
      var c = res.data, patch = {};
      if (fx.kind === "xp") patch.xp = (c.xp || 0) + (fx.amount || 0);
      if (fx.kind === "gold") patch.gold = (c.gold || 0) + (fx.amount || 0);
      if (fx.kind === "hp") {
        var hp = (c.hp || 0) + (fx.amount || 0);
        if (hp < 0) hp = 0;
        if (c.max_hp !== null && c.max_hp !== undefined && hp > c.max_hp) hp = c.max_hp;
        patch.hp = hp;
      }
      if (fx.kind === "temp_hp") patch.temp_hp = fx.amount || 0;
      if (fx.kind === "level") patch.level = fx.amount;
      if (fx.kind === "add_item" && fx.item) {
        patch.inventory = (c.inventory || "").trim() ? (c.inventory || "") + "\n" + fx.item : fx.item;
      }
      if (fx.kind === "remove_item" && fx.item) {
        var lines = (c.inventory || "").split("\n").filter(function (l) { return l.trim().toLowerCase() !== fx.item.trim().toLowerCase(); });
        patch.inventory = lines.join("\n");
      }
      patch.updated_at = new Date().toISOString();
      await db.from("characters").update(patch).eq("player", targets[i]);
    }
  }

  async function addLogEntry(e) {
    e.preventDefault();
    if (!configured) return setupNeeded();
    var title = $("log-title").value.trim();
    var body = $("log-body").value.trim();
    if (!title || !body) return;
    var res = await db.from("log_entries").insert({ title: title, body: body }).select("id").single();
    if (res.error || !res.data) {
      alert("Could not add the entry. Check the connection and try again.");
      return;
    }
    var effects = logEffectsReady ? readLogEffectRows() : [];
    if (effects.length) {
      var ok = true;
      for (var i = 0; i < effects.length; i++) {
        var fx = effects[i];
        fx.log_id = res.data.id;
        var ins = await db.from("log_effects").insert(fx);
        if (ins.error) { ok = false; break; }
        await applyLogEffect(fx);
      }
      if (!ok) alert("Entry saved, but its character changes did not apply. Check the connection and try again.");
    }
    $("log-title").value = "";
    $("log-body").value = "";
    clearLogEffectRows();
    loadLogEntries();
    loadCharacters();
  }

  // ---------- Characters ----------

  var PLAYERS = [
    { player: "nathan", label: "Nathan's character" },
    { player: "angela", label: "Angela's character" }
  ];

  var charPlayers = [];
  var charByPlayer = {};

  async function loadCharacters() {
    var list = $("characters-list");
    if (!configured) {
      list.innerHTML = '<p class="empty">Setup is not finished yet. See README.md.</p>';
      return;
    }
    var res = await db.from("characters").select("*");
    if (res.error) {
      list.innerHTML = '<p class="error">Could not load characters.</p>';
      return;
    }
    var byPlayer = {};
    res.data.forEach(function (c) { byPlayer[c.player] = c; });
    charByPlayer = byPlayer;
    var players = PLAYERS.slice();
    var seen = {};
    players.forEach(function (p) { seen[p.player] = true; });
    res.data.forEach(function (c) {
      if (c.player && !seen[c.player]) {
        seen[c.player] = true;
        players.push({ player: c.player, label: labelFromPlayer(c.player) });
      }
    });
    charPlayers = players;
    list.innerHTML = players.map(function (p) {
      var c = byPlayer[p.player];
      if (!c) return emptyCharCard(p);
      return charCard(p, c);
    }).join("");
    bindCharCards();
  }

  function labelFromPlayer(player) {
    var words = String(player).split(/[-_ ]+/).filter(Boolean).map(function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1);
    });
    var name = words.join(" ") || String(player);
    return name + "'s character";
  }

  function playerLabel(player) {
    for (var i = 0; i < PLAYERS.length; i++) {
      if (PLAYERS[i].player === player) return PLAYERS[i].label;
    }
    return labelFromPlayer(player);
  }

  function emptyCharCard(p) {
    return '<div class="card">' +
      '<p class="title">' + escapeHtml(p.label) + '</p>' +
      '<p class="empty">Not built yet</p>' +
      '<div class="actions"><button type="button" data-build="' + p.player + '">Build character</button></div>' +
      '</div>';
  }

  // ---------- Character sheet math (same as the real 5E sheet) ----------

  function abilityMod(score) {
    if (score === null || score === undefined || isNaN(score)) return 0;
    return Math.floor((score - 10) / 2);
  }

  function fmtMod(mod) {
    return (mod >= 0 ? "+" : "") + mod;
  }

  function profBonus(level) {
    var l = level || 1;
    if (l >= 17) return 6;
    if (l >= 13) return 5;
    if (l >= 9) return 4;
    if (l >= 5) return 3;
    return 2;
  }

  var SAVE_PROFS = {
    barbarian: ["str", "con"], bard: ["dex", "cha"], cleric: ["wis", "cha"],
    druid: ["int", "wis"], fighter: ["str", "con"], monk: ["str", "dex"],
    paladin: ["wis", "cha"], ranger: ["str", "dex"], rogue: ["dex", "int"],
    sorcerer: ["con", "cha"], warlock: ["wis", "cha"], wizard: ["int", "wis"]
  };

  function classKey(cls) {
    var s = String(cls || "").toLowerCase().replace(/\(.*\)/, "").trim();
    var words = s.split(/\s+/).filter(Boolean);
    return words.length ? words[words.length - 1] : "";
  }

  var SKILLS = [
    ["Acrobatics", "dex"], ["Animal Handling", "wis"], ["Arcana", "int"],
    ["Athletics", "str"], ["Deception", "cha"], ["History", "int"],
    ["Insight", "wis"], ["Intimidation", "cha"], ["Investigation", "int"],
    ["Medicine", "wis"], ["Nature", "int"], ["Perception", "wis"],
    ["Performance", "cha"], ["Persuasion", "cha"], ["Religion", "int"],
    ["Sleight of Hand", "dex"], ["Stealth", "dex"], ["Survival", "wis"]
  ];

  function parseSkillNames(skillsText) {
    return (skillsText || "").split("\n").map(function (s) {
      return s.trim().replace(/\s*[+-]\d+\s*$/, "").trim().toLowerCase();
    }).filter(Boolean);
  }

  function skillBonus(c, skillName, ability) {
    var mod = abilityMod(c[ability]);
    var prof = parseSkillNames(c.skills).indexOf(skillName.toLowerCase()) !== -1;
    return { bonus: mod + (prof ? profBonus(c.level) : 0), proficient: prof };
  }

  var SPEEDS = { halfling: 25, gnome: 25, dwarf: 25 };

  function speedFor(race) {
    var s = String(race || "").toLowerCase();
    for (var k in SPEEDS) { if (s.indexOf(k) !== -1) return SPEEDS[k]; }
    return 30;
  }

  var CASTER_ABILITY = { bard: "cha", cleric: "wis", druid: "wis", sorcerer: "cha", warlock: "cha", wizard: "int" };

  function spellStats(c) {
    var ab = CASTER_ABILITY[classKey(c.class)];
    if (!ab) return null;
    var mod = abilityMod(c[ab]);
    var pb = profBonus(c.level);
    return { dc: 8 + pb + mod, attack: pb + mod };
  }

  function textLines(text) {
    return (text || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function listHtml(lines) {
    return '<ul class="inventory">' + lines.map(function (l) { return "<li>" + escapeHtml(l) + "</li>"; }).join("") + "</ul>";
  }

  var HIT_DICE = {
    barbarian: 12, bard: 8, cleric: 8, druid: 8, fighter: 10, monk: 8,
    paladin: 10, ranger: 10, rogue: 8, sorcerer: 6, warlock: 8, wizard: 6
  };

  function hitDieFor(c) {
    return HIT_DICE[classKey(c.class)] || 8;
  }

  function hitDiceTotal(c) {
    return c.level || 1;
  }

  function hitDiceLeft(c) {
    var left = hitDiceTotal(c) - (c.hit_dice_used || 0);
    if (left < 0) left = 0;
    return left;
  }

  function deathSaveDots(c, kind, player) {
    var count = kind === "success" ? (c.death_save_successes || 0) : (c.death_save_failures || 0);
    var dots = "";
    for (var i = 1; i <= 3; i++) {
      dots += '<button type="button" class="ds-dot' + (i <= count ? ' filled' : '') + '" data-death-save="' + kind + '" data-death-n="' + i + '" data-player="' + player + '" title="' + kind + ' ' + i + '">' + (i <= count ? "●" : "○") + '</button>';
    }
    return dots;
  }

  function charCard(p, c) {
    var pb = profBonus(c.level);
    var hpText = (c.hp === null || c.hp === undefined ? "-" : c.hp) +
      " / " + (c.max_hp === null || c.max_hp === undefined ? "-" : c.max_hp);
    var tempHp = c.temp_hp || 0;
    var items = textLines(c.inventory);
    var invHtml = items.length ? listHtml(items) : '<p class="empty">No items yet.</p>';
    var saveProfs = SAVE_PROFS[classKey(c.class)] || [];
    var saveNames = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
    var savesHtml = ["str", "dex", "con", "int", "wis", "cha"].map(function (ab) {
      var prof = saveProfs.indexOf(ab) !== -1;
      var bonus = abilityMod(c[ab]) + (prof ? pb : 0);
      return '<div class="sheet-line' + (prof ? ' prof' : '') + '"><span class="dot">' + (prof ? "●" : "○") + '</span><span>' + saveNames[ab] + '</span><span class="num">' + fmtMod(bonus) + '</span></div>';
    }).join("");
    var skillsHtml = SKILLS.map(function (sk) {
      var r = skillBonus(c, sk[0], sk[1]);
      return '<div class="sheet-line' + (r.proficient ? ' prof' : '') + '"><span class="dot">' + (r.proficient ? "●" : "○") + '</span><span>' + sk[0] + ' (' + sk[1].toUpperCase() + ')</span><span class="num">' + fmtMod(r.bonus) + '</span></div>';
    }).join("");
    var perc = skillBonus(c, "Perception", "wis");
    var scoresHtml = ["str", "dex", "con", "int", "wis", "cha"].map(function (ab) {
      return '<div class="sheet-score"><span class="mod">' + fmtMod(abilityMod(c[ab])) + '</span>' +
        '<span class="score-name">' + ab.toUpperCase() + '</span>' +
        '<span class="score-val">' + (c[ab] === null || c[ab] === undefined ? "-" : c[ab]) + '</span></div>';
    }).join("");
    var atkLines = textLines(c.attacks);
    var attacksHtml = "";
    if (atkLines.length) {
      var rows = atkLines.map(function (line) {
        var parts = line.split(",").map(function (s) { return s.trim(); });
        return "<tr><td>" + escapeHtml(parts[0] || line) + "</td><td>" + escapeHtml(parts[1] || "-") + "</td><td>" + escapeHtml(parts.slice(2).join(", ") || "-") + "</td></tr>";
      }).join("");
      attacksHtml = '<p><strong>Attacks</strong></p><table class="sheet-attacks"><tr><th>Name</th><th>Attack</th><th>Damage</th></tr>' + rows + '</table>';
    }
    var spellLines = textLines(c.spells);
    var sp = spellStats(c);
    var spellsHtml = "";
    if (spellLines.length) {
      spellsHtml = '<p><strong>Spells</strong></p>' +
        (sp ? '<p class="meta">Spell save DC ' + sp.dc + ' · Spell attack ' + fmtMod(sp.attack) + '</p>' : '') +
        listHtml(spellLines);
    }
    var featLines = textLines(c.features);
    var featuresHtml = featLines.length ? '<p><strong>Features &amp; Traits</strong></p>' + listHtml(featLines) : "";
    var persHtml = "";
    [["Personality traits", c.personality_traits], ["Ideals", c.ideals], ["Bonds", c.bonds], ["Flaws", c.flaws]].forEach(function (pair) {
      if (pair[1]) persHtml += '<p><strong>' + pair[0] + '</strong></p><p>' + escapeHtml(pair[1]) + '</p>';
    });
    var subMeta = [];
    if (c.background) subMeta.push(c.background);
    if (c.alignment) subMeta.push(c.alignment);
    if (c.xp !== null && c.xp !== undefined) subMeta.push(c.xp + " XP");
    return '<div class="card sheet">' +
      (c.image_url ? '<img class="char-img" src="' + escapeHtml(c.image_url) + '" alt="">' : '') +
      '<div class="char-head"><span class="name">' + escapeHtml(c.name || "Unnamed") + '</span>' +
      '<span class="level">' + escapeHtml(p.label) + '</span></div>' +
      '<p class="meta">' + escapeHtml(c.race || "") + (c.race && c.class ? " " : "") + escapeHtml(c.class || "") +
      ' - Level ' + (c.level === null || c.level === undefined ? "-" : c.level) +
      ' - AC ' + (c.ac === null || c.ac === undefined ? "-" : c.ac) + '</p>' +
      (subMeta.length ? '<p class="meta">' + subMeta.map(escapeHtml).join(" · ") + '</p>' : '') +
      '<div class="combat-grid">' +
      '<div class="combat-stat"><span>Armor Class</span><strong>' + (c.ac === null || c.ac === undefined ? "-" : c.ac) + '</strong></div>' +
      '<div class="combat-stat"><span>Initiative</span><strong>' + fmtMod(abilityMod(c.dex)) + '</strong></div>' +
      '<div class="combat-stat"><span>Speed</span><strong>' + speedFor(c.race) + ' ft</strong></div>' +
      '<div class="combat-stat"><span>Prof. Bonus</span><strong>' + fmtMod(pb) + '</strong></div>' +
      '</div>' +
      '<div class="hp-row"><span>HP</span><span class="hp">' + hpText + (tempHp > 0 ? ' <span class="temp-hp">+ ' + tempHp + ' temp</span>' : '') + '</span>' +
      '<button type="button" class="hp-btn" data-hp-delta="-1" data-player="' + p.player + '">-</button>' +
      '<button type="button" class="hp-btn" data-hp-delta="1" data-player="' + p.player + '">+</button></div>' +
      '<div class="hp-row"><span>Hit Dice</span><span class="hp">' + hitDiceTotal(c) + 'd' + hitDieFor(c) + ' · ' + hitDiceLeft(c) + ' left</span>' +
      '<button type="button" class="hp-btn" data-hit-dice-delta="-1" data-player="' + p.player + '">-</button>' +
      '<button type="button" class="hp-btn" data-hit-dice-delta="1" data-player="' + p.player + '">+</button></div>' +
      '<div class="death-saves"><span>Death Saves</span><span class="ds-group"><span class="ds-label">Success</span>' + deathSaveDots(c, "success", p.player) + '</span><span class="ds-group"><span class="ds-label">Failure</span>' + deathSaveDots(c, "failure", p.player) + '</span></div>' +
      '<div class="sheet-scores">' + scoresHtml + '</div>' +
      '<p><strong>Saving Throws</strong></p><div class="sheet-list">' + savesHtml + '</div>' +
      '<p><strong>Skills</strong></p><div class="sheet-list">' + skillsHtml + '</div>' +
      '<p class="meta">Passive Perception ' + (10 + perc.bonus) + '</p>' +
      attacksHtml + spellsHtml + featuresHtml + persHtml +
      '<p>Gold: ' + (c.gold === null || c.gold === undefined ? "-" : c.gold) + '</p>' +
      '<p><strong>Inventory</strong></p>' + invHtml +
      (c.notes ? '<p><strong>Notes</strong></p><p>' + escapeHtml(c.notes) + '</p>' : '') +
      '<div class="actions"><button type="button" data-edit="' + p.player + '">Edit</button></div>' +
      '</div>';
  }

  function bindCharCards() {
    document.querySelectorAll("[data-build]").forEach(function (btn) {
      btn.addEventListener("click", function () { openCharModal(btn.dataset.build, null); });
    });
    document.querySelectorAll("[data-edit]").forEach(function (btn) {
      btn.addEventListener("click", function () { openCharModal(btn.dataset.edit, null); });
    });
    document.querySelectorAll("[data-hp-delta]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        changeCharHp(btn.dataset.player, parseInt(btn.dataset.hpDelta, 10));
      });
    });
    document.querySelectorAll("[data-hit-dice-delta]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        changeHitDice(btn.dataset.player, parseInt(btn.dataset.hitDiceDelta, 10));
      });
    });
    document.querySelectorAll("[data-death-save]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setDeathSave(btn.dataset.player, btn.dataset.deathSave, parseInt(btn.dataset.deathN, 10));
      });
    });
  }

  async function changeCharHp(player, delta) {
    if (!configured) return setupNeeded();
    var res = await db.from("characters").select("hp, max_hp, temp_hp").eq("player", player).single();
    if (res.error || !res.data) return;
    var hp = (res.data.hp === null || res.data.hp === undefined) ? 0 : res.data.hp;
    var tempHp = res.data.temp_hp || 0;
    var patch = {};
    if (delta < 0) {
      var dmg = -delta;
      var absorbed = Math.min(tempHp, dmg);
      tempHp -= absorbed;
      dmg -= absorbed;
      hp -= dmg;
      if (hp < 0) hp = 0;
      patch.hp = hp;
      patch.temp_hp = tempHp;
    } else {
      hp += delta;
      if (res.data.max_hp !== null && res.data.max_hp !== undefined && hp > res.data.max_hp) hp = res.data.max_hp;
      patch.hp = hp;
    }
    patch.updated_at = new Date().toISOString();
    await db.from("characters").update(patch).eq("player", player);
    loadCharacters();
  }

  async function changeHitDice(player, delta) {
    if (!configured) return setupNeeded();
    var res = await db.from("characters").select("level, hit_dice_used").eq("player", player).single();
    if (res.error || !res.data) return;
    var total = res.data.level || 1;
    var used = res.data.hit_dice_used || 0;
    var left = total - used + delta;
    if (left < 0) left = 0;
    if (left > total) left = total;
    await db.from("characters").update({ hit_dice_used: total - left, updated_at: new Date().toISOString() }).eq("player", player);
    loadCharacters();
  }

  async function setDeathSave(player, kind, n) {
    if (!configured) return setupNeeded();
    var col = kind === "success" ? "death_save_successes" : "death_save_failures";
    var res = await db.from("characters").select(col).eq("player", player).single();
    if (res.error || !res.data) return;
    var current = res.data[col] || 0;
    var next = current === n ? n - 1 : n;
    var patch = { updated_at: new Date().toISOString() };
    patch[col] = next;
    await db.from("characters").update(patch).eq("player", player);
    loadCharacters();
  }

  async function openCharModal(player, existing) {
    if (!configured) return setupNeeded();
    var c = existing;
    if (!c) {
      var res = await db.from("characters").select("*").eq("player", player).single();
      if (!res.error && res.data) c = res.data;
    }
    $("char-player").value = player;
    $("char-modal-title").textContent = playerLabel(player);
    $("char-name").value = c ? (c.name || "") : "";
    $("char-image").value = c ? (c.image_url || "") : "";
    $("char-race").value = c ? (c.race || "") : "";
    $("char-class").value = c ? (c.class || "") : "";
    $("char-background").value = c ? (c.background || "") : "";
    $("char-level").value = c && c.level !== null && c.level !== undefined ? c.level : 1;
    $("char-hp").value = c && c.hp !== null && c.hp !== undefined ? c.hp : "";
    $("char-max-hp").value = c && c.max_hp !== null && c.max_hp !== undefined ? c.max_hp : "";
    $("char-ac").value = c && c.ac !== null && c.ac !== undefined ? c.ac : "";
    $("char-gold").value = c && c.gold !== null && c.gold !== undefined ? c.gold : 0;
    $("char-temp-hp").value = c && c.temp_hp !== null && c.temp_hp !== undefined ? c.temp_hp : "";
    $("char-hit-dice-used").value = c && c.hit_dice_used !== null && c.hit_dice_used !== undefined ? c.hit_dice_used : "";
    $("char-death-successes").value = c && c.death_save_successes !== null && c.death_save_successes !== undefined ? c.death_save_successes : "";
    $("char-death-failures").value = c && c.death_save_failures !== null && c.death_save_failures !== undefined ? c.death_save_failures : "";
    $("char-str").value = c && c.str !== null && c.str !== undefined ? c.str : "";
    $("char-dex").value = c && c.dex !== null && c.dex !== undefined ? c.dex : "";
    $("char-con").value = c && c.con !== null && c.con !== undefined ? c.con : "";
    $("char-int").value = c && c.int !== null && c.int !== undefined ? c.int : "";
    $("char-wis").value = c && c.wis !== null && c.wis !== undefined ? c.wis : "";
    $("char-cha").value = c && c.cha !== null && c.cha !== undefined ? c.cha : "";
    $("char-skills").value = c ? (c.skills || "") : "";
    $("char-inventory").value = c ? (c.inventory || "") : "";
    $("char-notes").value = c ? (c.notes || "") : "";
    $("char-attacks").value = c ? (c.attacks || "") : "";
    $("char-spells").value = c ? (c.spells || "") : "";
    $("char-features").value = c ? (c.features || "") : "";
    $("char-personality").value = c ? (c.personality_traits || "") : "";
    $("char-ideals").value = c ? (c.ideals || "") : "";
    $("char-bonds").value = c ? (c.bonds || "") : "";
    $("char-flaws").value = c ? (c.flaws || "") : "";
    $("char-xp").value = c && c.xp !== null && c.xp !== undefined ? c.xp : "";
    $("char-alignment").value = c ? (c.alignment || "") : "";
    $("char-modal").classList.remove("hidden");
  }

  function closeCharModal() {
    $("char-modal").classList.add("hidden");
  }

  async function saveChar(e) {
    e.preventDefault();
    if (!configured) return setupNeeded();
    var row = {
      player: $("char-player").value,
      name: $("char-name").value.trim() || null,
      image_url: $("char-image").value.trim() || null,
      race: $("char-race").value.trim() || null,
      class: $("char-class").value.trim() || null,
      background: $("char-background").value.trim() || null,
      level: numOrNull($("char-level").value),
      hp: numOrNull($("char-hp").value),
      max_hp: numOrNull($("char-max-hp").value),
      ac: numOrNull($("char-ac").value),
      str: numOrNull($("char-str").value),
      dex: numOrNull($("char-dex").value),
      con: numOrNull($("char-con").value),
      int: numOrNull($("char-int").value),
      wis: numOrNull($("char-wis").value),
      cha: numOrNull($("char-cha").value),
      skills: $("char-skills").value.trim(),
      gold: numOrNull($("char-gold").value),
      temp_hp: numOrNull($("char-temp-hp").value),
      hit_dice_used: numOrNull($("char-hit-dice-used").value),
      death_save_successes: numOrNull($("char-death-successes").value),
      death_save_failures: numOrNull($("char-death-failures").value),
      inventory: $("char-inventory").value.trim(),
      notes: $("char-notes").value.trim(),
      attacks: $("char-attacks").value.trim(),
      spells: $("char-spells").value.trim(),
      features: $("char-features").value.trim(),
      personality_traits: $("char-personality").value.trim(),
      ideals: $("char-ideals").value.trim(),
      bonds: $("char-bonds").value.trim(),
      flaws: $("char-flaws").value.trim(),
      xp: numOrNull($("char-xp").value),
      alignment: $("char-alignment").value.trim() || null,
      updated_at: new Date().toISOString()
    };
    var res = await db.from("characters").upsert(row, { onConflict: "player" });
    if (res.error) {
      alert("Could not save the character. Check the connection and try again.");
      return;
    }
    closeCharModal();
    loadCharacters();
  }

  // ---------- Quests ----------

  async function loadQuests() {
    var list = $("quests-list");
    if (!configured) {
      list.innerHTML = '<p class="empty">Setup is not finished yet. See README.md.</p>';
      return;
    }
    var res = await db.from("quests").select("*").order("created_at", { ascending: false });
    if (res.error) {
      list.innerHTML = '<p class="error">Could not load quests.</p>';
      return;
    }
    if (!res.data.length) {
      list.innerHTML = '<p class="empty">No quests yet.</p>';
      return;
    }
    list.innerHTML = res.data.map(function (q) {
      var done = q.status === "Done";
      return '<div class="card">' +
        '<p class="title">' + escapeHtml(q.title) + ' <span class="badge' + (done ? " done" : "") + '">' + escapeHtml(q.status) + '</span></p>' +
        '<p>' + escapeHtml(q.description || "") + '</p>' +
        '<p class="meta">' + escapeHtml(fmtTime(q.created_at)) + '</p>' +
        '<div class="actions">' +
        '<button type="button" data-quest-toggle="' + q.id + '" data-status="' + q.status + '">' + (done ? "Mark Active" : "Mark Done") + '</button>' +
        '<button type="button" class="small-danger" data-quest-delete="' + q.id + '">Delete</button>' +
        '</div></div>';
    }).join("");
    bindQuestButtons();
  }

  function bindQuestButtons() {
    document.querySelectorAll("[data-quest-toggle]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var next = btn.dataset.status === "Done" ? "Active" : "Done";
        await db.from("quests").update({ status: next }).eq("id", btn.dataset.questToggle);
        loadQuests();
      });
    });
    document.querySelectorAll("[data-quest-delete]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!confirm("Delete this quest?")) return;
        await db.from("quests").delete().eq("id", btn.dataset.questDelete);
        loadQuests();
      });
    });
  }

  async function addQuest(e) {
    e.preventDefault();
    if (!configured) return setupNeeded();
    var title = $("quest-title").value.trim();
    var description = $("quest-description").value.trim();
    if (!title) return;
    var res = await db.from("quests").insert({ title: title, description: description, status: "Active" });
    if (res.error) {
      alert("Could not add the quest. Check the connection and try again.");
      return;
    }
    $("quest-title").value = "";
    $("quest-description").value = "";
    loadQuests();
  }

  // ---------- NPCs and Places ----------

  async function loadNpcs() {
    var list = $("npcs-list");
    if (!configured) {
      list.innerHTML = '<p class="empty">Setup is not finished yet. See README.md.</p>';
      return;
    }
    var res = await db.from("npcs").select("*").order("created_at", { ascending: false });
    if (res.error) {
      list.innerHTML = '<p class="error">Could not load NPCs.</p>';
      return;
    }
    var rows = (res.data || []).filter(function (n) {
      return (n.kind || "").toLowerCase() !== "place";
    });
    if (!rows.length) {
      list.innerHTML = '<p class="empty">Nothing here yet.</p>';
      return;
    }
    list.innerHTML = rows.map(function (n) {
      var img = n.image_url ? '<img class="npc-img" src="' + escapeHtml(n.image_url) + '" alt="">' : "";
      return '<div class="card npc-card">' + img +
        '<p class="title">' + escapeHtml(n.name) + ' <span class="badge">' + escapeHtml(n.kind) + '</span></p>' +
        '<p>' + escapeHtml(n.notes || "") + '</p>' +
        '<div class="actions">' +
        '<button type="button" class="small-danger" data-npc-delete="' + n.id + '">Delete</button>' +
        '</div></div>';
    }).join("");
    document.querySelectorAll("[data-npc-delete]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!confirm("Delete this entry?")) return;
        await db.from("npcs").delete().eq("id", btn.dataset.npcDelete);
        loadNpcs();
      });
    });
  }

  async function addNpc(e) {
    e.preventDefault();
    if (!configured) return setupNeeded();
    var name = $("npc-name").value.trim();
    var kind = $("npc-kind").value;
    var notes = $("npc-notes").value.trim();
    var imageUrl = $("npc-image").value.trim() || null;
    if (!name) return;
    var row = { name: name, kind: kind, notes: notes };
    if (imageUrl) row.image_url = imageUrl;
    var res = await db.from("npcs").insert(row);
    if (res.error && imageUrl) {
      var retry = await db.from("npcs").insert({ name: name, kind: kind, notes: notes });
      if (retry.error) {
        alert("Could not add the entry. Check the connection and try again.");
        return;
      }
      alert("Entry added, but the picture was not saved. Run the SQL line for the image column first, then add the picture.");
      $("npc-name").value = "";
      $("npc-notes").value = "";
      $("npc-image").value = "";
      loadNpcs();
      return;
    }
    if (res.error) {
      alert("Could not add the entry. Check the connection and try again.");
      return;
    }
    $("npc-name").value = "";
    $("npc-notes").value = "";
    $("npc-image").value = "";
    loadNpcs();
  }

  // ---------- Dice ----------

  async function loadRolls() {
    var list = $("rolls-list");
    if (!configured) {
      list.innerHTML = '<p class="empty">Setup is not finished yet. See README.md.</p>';
      return;
    }
    var res = await db.from("rolls").select("*").order("created_at", { ascending: false }).limit(50);
    if (res.error) {
      list.innerHTML = '<p class="error">Could not load rolls.</p>';
      return;
    }
    if (!res.data.length) {
      list.innerHTML = '<p class="empty">No rolls yet.</p>';
      return;
    }
    list.innerHTML = res.data.map(function (r) {
      return '<div class="card">' +
        '<p class="meta">' + escapeHtml(r.roller) + ' - ' + escapeHtml(fmtTime(r.created_at)) + '</p>' +
        '<p class="title">' + escapeHtml(r.label) + ': ' + escapeHtml(String(r.result)) + '</p>' +
        '<p>' + escapeHtml(r.detail) + '</p>' +
        '</div>';
    }).join("");
  }

  async function doRoll(e) {
    e.preventDefault();
    if (!configured) return setupNeeded();
    var roller = $("dice-roller").value.trim() || "Someone";
    var mod = numOrNull($("dice-mod").value) || 0;
    var mode = $("dice-mode").value;
    var label = "d" + selectedDie;
    var result, detail;

    if (selectedDie === 20 && (mode === "advantage" || mode === "disadvantage")) {
      var r1 = rollDie(20);
      var r2 = rollDie(20);
      var kept = mode === "advantage" ? Math.max(r1, r2) : Math.min(r1, r2);
      result = kept + mod;
      detail = "d20 (" + mode + ") " + (mod >= 0 ? "+ " : "- ") + Math.abs(mod) + " = " + result + " [rolls " + r1 + ", " + r2 + "]";
    } else {
      var roll = rollDie(selectedDie);
      result = roll + mod;
      detail = "d" + selectedDie + " " + (mod >= 0 ? "+ " : "- ") + Math.abs(mod) + " = " + result + " [roll " + roll + "]";
    }

    var box = $("dice-result");
    box.classList.remove("hidden");
    box.innerHTML = '<span class="big">' + escapeHtml(String(result)) + '</span>' +
      '<span class="detail">' + escapeHtml(detail) + '</span>';

    var res = await db.from("rolls").insert({
      roller: roller,
      label: label,
      result: result,
      detail: detail
    });
    if (res.error) {
      alert("Roll was made but could not be saved. Check the connection.");
      return;
    }
    loadRolls();
  }

  // ---------- Battle ----------

  async function loadCombatants() {
    var list = $("combatants-list");
    if (!configured) {
      list.innerHTML = '<p class="empty">Setup is not finished yet. See README.md.</p>';
      return;
    }
    var res = await db.from("combatants").select("*").order("initiative", { ascending: false });
    if (res.error) {
      list.innerHTML = '<p class="error">Could not load combatants.</p>';
      return;
    }
    combatants = res.data || [];
    if (currentTurn >= combatants.length) currentTurn = 0;
    renderCombatants();
  }

  function renderCombatants() {
    var list = $("combatants-list");
    if (!combatants.length) {
      list.innerHTML = '<p class="empty">No combatants yet. Add the fighters above.</p>';
      return;
    }
    list.innerHTML = combatants.map(function (c, i) {
      var isCurrent = i === currentTurn;
      return '<div class="card combatant' + (isCurrent ? " current" : "") + '">' +
        '<p class="title">' + escapeHtml(c.name) + ' ' +
        '<span class="init">(Init ' + c.initiative + ')</span>' +
        (isCurrent ? ' <span class="turn-tag">Current turn</span>' : '') + '</p>' +
        '<div class="hp-row"><span>HP</span><span class="hp">' + c.hp + ' / ' + c.max_hp + '</span>' +
        '<button type="button" class="hp-btn" data-combat-hp="-1" data-id="' + c.id + '">-</button>' +
        '<button type="button" class="hp-btn" data-combat-hp="1" data-id="' + c.id + '">+</button></div>' +
        (c.note ? '<p>' + escapeHtml(c.note) + '</p>' : '') +
        '<div class="actions">' +
        '<button type="button" class="small-danger" data-combat-delete="' + c.id + '">Remove</button>' +
        '</div></div>';
    }).join("");
    document.querySelectorAll("[data-combat-hp]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        changeCombatantHp(btn.dataset.id, parseInt(btn.dataset.combatHp, 10));
      });
    });
    document.querySelectorAll("[data-combat-delete]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        await db.from("combatants").delete().eq("id", btn.dataset.combatDelete);
        loadCombatants();
      });
    });
  }

  async function changeCombatantHp(id, delta) {
    var c = combatants.find(function (x) { return x.id === id; });
    if (!c) return;
    var hp = c.hp + delta;
    if (hp < 0) hp = 0;
    if (hp > c.max_hp) hp = c.max_hp;
    await db.from("combatants").update({ hp: hp }).eq("id", id);
    loadCombatants();
  }

  async function addCombatant(e) {
    e.preventDefault();
    if (!configured) return setupNeeded();
    var name = $("combatant-name").value.trim();
    if (!name) return;
    var row = {
      name: name,
      initiative: numOrNull($("combatant-initiative").value) || 0,
      hp: numOrNull($("combatant-hp").value) || 0,
      max_hp: numOrNull($("combatant-max-hp").value) || 1,
      note: $("combatant-note").value.trim()
    };
    var res = await db.from("combatants").insert(row);
    if (res.error) {
      alert("Could not add the combatant. Check the connection and try again.");
      return;
    }
    $("combatant-name").value = "";
    $("combatant-note").value = "";
    loadCombatants();
  }

  function nextTurn() {
    if (!combatants.length) return;
    currentTurn = (currentTurn + 1) % combatants.length;
    renderCombatants();
  }

  async function clearBattle() {
    if (!configured) return setupNeeded();
    if (!combatants.length) return;
    if (!confirm("Clear the whole battle?")) return;
    await db.from("combatants").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    currentTurn = 0;
    loadCombatants();
  }

  // ---------- Maps ----------

  var MAP_COLS = 12;
  var MAP_ROWS = 8;
  var mapsList = [];
  var currentMapId = null;
  var mapCells = {};
  var mapMarkers = [];
  var mapMode = "view";
  var mapEdit = false;
  var npcsEdit = false;
  var placesEdit = false;
  var questsEdit = false;
  var suppressMapClick = false;
  var npcsByName = {};
  var mapZoom = 1;
  var measureA = null;
  var measureB = null;
  var milesPerSquare = 12;
  try {
    var savedScale = parseFloat(localStorage.getItem("hub-map-scale"));
    if (savedScale && savedScale > 0) milesPerSquare = savedScale;
  } catch (e) {}

  function normName(s) {
    return (s || "").toLowerCase().trim().replace(/^the\s+/, "");
  }

  async function loadMaps() {
    var tabs = $("map-tabs");
    if (!configured) {
      tabs.innerHTML = '<p class="empty">Setup is not finished yet. See README.md.</p>';
      return;
    }
    var res = await db.from("maps").select("*").order("created_at", { ascending: true });
    if (res.error) {
      tabs.innerHTML = '<p class="error">Could not load maps.</p>';
      return;
    }
    mapsList = res.data || [];
    if (!mapsList.length) {
      tabs.innerHTML = "";
      $("map-view").classList.add("hidden");
      $("map-empty").classList.remove("hidden");
      return;
    }
    $("map-empty").classList.add("hidden");
    if (!currentMapId || !mapsList.some(function (m) { return m.id === currentMapId; })) {
      currentMapId = mapsList[0].id;
    }
    tabs.innerHTML = mapsList.map(function (m) {
      return '<button type="button" class="map-tab' + (m.id === currentMapId ? " active" : "") + '" data-map="' + m.id + '">' + escapeHtml(m.name) + '</button>';
    }).join("");
    document.querySelectorAll(".map-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        currentMapId = btn.dataset.map;
        loadMaps();
      });
    });
    $("map-view").classList.remove("hidden");
    loadMapView();
  }

  async function loadMapView() {
    var map = mapsList.find(function (m) { return m.id === currentMapId; });
    if (!map) return;
    var wrap = $("map-wrap");
    wrap.style.backgroundImage = map.image_url ? 'url("' + map.image_url + '")' : "none";
    mapCells = {};
    renderMapGrid();
    $("map-markers").innerHTML = "";
    var cellsRes = await db.from("map_cells").select("*").eq("map_id", map.id);
    mapCells = {};
    if (!cellsRes.error && cellsRes.data) {
      cellsRes.data.forEach(function (c) {
        if (c.revealed) mapCells[c.x + "," + c.y] = true;
      });
    }
    var markersRes = await db.from("map_markers").select("*").eq("map_id", map.id).order("created_at", { ascending: true });
    mapMarkers = markersRes.error ? [] : (markersRes.data || []);
    var npcsRes = await db.from("npcs").select("*");
    npcsByName = {};
    if (!npcsRes.error && npcsRes.data) {
      npcsRes.data.forEach(function (n) {
        npcsByName[normName(n.name)] = n;
      });
    }
    closeMapTooltip();
    measureA = null;
    measureB = null;
    renderMapGrid();
    renderMapMarkers();
    renderUnmarkedPlaces();
    renderMeasure();
  }

  function renderMapGrid() {
    var grid = $("map-grid");
    var html = "";
    for (var y = 0; y < MAP_ROWS; y++) {
      for (var x = 0; x < MAP_COLS; x++) {
        var revealed = !!mapCells[x + "," + y];
        html += '<div class="map-cell' + (revealed ? " revealed" : " fog") + '" data-x="' + x + '" data-y="' + y + '"></div>';
      }
    }
    grid.innerHTML = html;
    grid.querySelectorAll(".map-cell").forEach(function (cell) {
      cell.addEventListener("click", function () {
        onMapCellClick(parseInt(cell.dataset.x, 10), parseInt(cell.dataset.y, 10));
      });
    });
  }

  var openTooltipMarker = null;

  function closeMapTooltip() {
    var tip = $("map-tooltip");
    if (tip) tip.classList.add("hidden");
    openTooltipMarker = null;
  }

  function toggleMapTooltip(markerId) {
    var tip = $("map-tooltip");
    if (!tip) return;
    var mk = mapMarkers.find(function (m) { return m.id === markerId; });
    if (!mk) return;
    if (openTooltipMarker === markerId) {
      closeMapTooltip();
      return;
    }
    openTooltipMarker = markerId;
    var entry = npcsByName[normName(mk.label)];
    var html = '<p class="tip-title">' + escapeHtml(mk.label) + '</p>';
    if (entry && entry.image_url) html += '<img class="tip-img" src="' + escapeHtml(entry.image_url) + '" alt="">';
    if (entry && entry.notes) html += '<p class="tip-notes">' + escapeHtml(entry.notes) + '</p>';
    tip.innerHTML = html;
    var wrap = $("map-wrap");
    var px = (mk.x + 0.5) / MAP_COLS * wrap.clientWidth;
    var pinY = (mk.y + 0.5) / MAP_ROWS * wrap.clientHeight;
    tip.classList.remove("hidden");
    tip.classList.remove("below");
    tip.style.transform = "";
    var tipH = tip.offsetHeight;
    var tipW = tip.offsetWidth;
    tip.style.left = Math.min(Math.max(px, tipW / 2 + 6), Math.max(tipW / 2 + 6, wrap.clientWidth - tipW / 2 - 6)) + "px";
    if (pinY - tipH - 14 >= 0) {
      tip.style.top = pinY + "px";
    } else if (pinY + 16 + tipH <= wrap.clientHeight) {
      tip.style.top = pinY + "px";
      tip.classList.add("below");
    } else {
      tip.style.top = Math.max(8, wrap.clientHeight - tipH - 8) + "px";
      tip.style.transform = "translate(-50%, 0)";
    }
    tip.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function renderMapMarkers() {
    var layer = $("map-markers");
    layer.innerHTML = mapMarkers.map(function (mk) {
      var left = ((mk.x + 0.5) / MAP_COLS * 100).toFixed(2);
      var top = ((mk.y + 0.5) / MAP_ROWS * 100).toFixed(2);
      return '<div class="map-marker" data-marker-id="' + mk.id + '" style="left:' + left + '%;top:' + top + '%"><span class="pin"></span></div>';
    }).join("");
    layer.querySelectorAll(".map-marker").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        if (suppressMapClick) return;
        if (mapMode === "measure") {
          var mk = mapMarkers.find(function (m) { return m.id === el.dataset.markerId; });
          if (mk) onMapCellClick(mk.x, mk.y);
          return;
        }
        toggleMapTooltip(el.dataset.markerId);
      });
    });
    var list = $("map-markers-list");
    if (!mapMarkers.length) {
      list.innerHTML = '<p class="empty">No places marked on this map yet.</p>';
      return;
    }
    list.innerHTML = mapMarkers.map(function (mk) {
      var entry = npcsByName[normName(mk.label)];
      var img = entry && entry.image_url ? '<img class="place-thumb" src="' + escapeHtml(entry.image_url) + '" alt="">' : "";
      return '<div class="card place-card" data-marker-id="' + mk.id + '">' + img +
        '<p class="title">' + escapeHtml(mk.label) + '</p>' +
        '<p class="meta">' + escapeHtml(mk.kind || "Place") + '</p>' +
        '<div class="actions"><button type="button" class="small-danger" data-marker-delete="' + mk.id + '">Delete</button></div></div>';
    }).join("");
    list.querySelectorAll(".place-card").forEach(function (card) {
      card.addEventListener("click", function () {
        highlightMapMarker(card.dataset.markerId);
      });
    });
    document.querySelectorAll("[data-marker-delete]").forEach(function (btn) {
      btn.addEventListener("click", async function (e) {
        e.stopPropagation();
        if (!confirm("Delete this place?")) return;
        await db.from("map_markers").delete().eq("id", btn.dataset.markerDelete);
        loadMapView();
      });
    });
  }

  var highlightTimer = null;

  function highlightMapMarker(markerId) {
    var mk = mapMarkers.find(function (m) { return m.id === markerId; });
    if (!mk) return;
    var el = document.querySelector('.map-marker[data-marker-id="' + markerId + '"]');
    if (el) {
      el.scrollIntoView({ block: "center", inline: "center" });
      document.querySelectorAll(".map-marker.highlight").forEach(function (m) { m.classList.remove("highlight"); });
      el.classList.add("highlight");
      if (highlightTimer) clearTimeout(highlightTimer);
      highlightTimer = setTimeout(function () { el.classList.remove("highlight"); }, 3000);
    }
    if (openTooltipMarker !== markerId) toggleMapTooltip(markerId);
  }

  function renderUnmarkedPlaces() {
    var wrap = $("map-places-unmarked-wrap");
    var list = $("map-places-unmarked");
    if (!wrap || !list) return;
    var marked = {};
    mapMarkers.forEach(function (mk) { marked[normName(mk.label)] = true; });
    var rows = Object.keys(npcsByName).map(function (k) { return npcsByName[k]; }).filter(function (n) {
      return (n.kind || "").toLowerCase() === "place" && !marked[normName(n.name)];
    });
    if (!rows.length) {
      wrap.classList.add("hidden");
      list.innerHTML = "";
      return;
    }
    wrap.classList.remove("hidden");
    list.innerHTML = rows.map(function (n) {
      var img = n.image_url ? '<img class="place-thumb" src="' + escapeHtml(n.image_url) + '" alt="">' : "";
      return '<div class="card place-card">' + img +
        '<p class="title">' + escapeHtml(n.name) + '</p>' +
        '<p>' + escapeHtml(n.notes || "") + '</p>' +
        '<div class="actions"><button type="button" class="small-danger" data-place-delete="' + n.id + '">Delete</button></div></div>';
    }).join("");
    list.querySelectorAll("[data-place-delete]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!confirm("Delete this place?")) return;
        await db.from("npcs").delete().eq("id", btn.dataset.placeDelete);
        loadMapView();
      });
    });
  }

  async function onMapCellClick(x, y) {
    if (!configured) return setupNeeded();
    var key = x + "," + y;
    closeMapTooltip();
    if (suppressMapClick) return;
    if ((mapMode === "reveal" || mapMode === "hide" || mapMode === "marker") && !mapEdit) return;
    if (mapMode === "measure") {
      if (!measureA || measureB) {
        measureA = { x: x, y: y };
        measureB = null;
      } else {
        measureB = { x: x, y: y };
      }
      renderMeasure();
      return;
    }
    if (mapMode === "reveal") {
      if (mapCells[key]) return;
      var res = await db.from("map_cells").upsert({ map_id: currentMapId, x: x, y: y, revealed: true }, { onConflict: "map_id,x,y" });
      if (res.error) {
        alert("Could not reveal that square. Check the connection and try again.");
        return;
      }
      mapCells[key] = true;
      renderMapGrid();
    } else if (mapMode === "hide") {
      if (!mapCells[key]) return;
      var resHide = await db.from("map_cells").upsert({ map_id: currentMapId, x: x, y: y, revealed: false }, { onConflict: "map_id,x,y" });
      if (resHide.error) {
        alert("Could not hide that square. Check the connection and try again.");
        return;
      }
      delete mapCells[key];
      renderMapGrid();
    } else if (mapMode === "marker") {
      if (!mapCells[key]) {
        alert("Reveal this area first, then you can mark a place on it.");
        return;
      }
      var label = prompt("Place name:");
      if (!label || !label.trim()) return;
      var resMark = await db.from("map_markers").insert({ map_id: currentMapId, x: x, y: y, label: label.trim(), kind: "Place" });
      if (resMark.error) {
        alert("Could not add the place. Check the connection and try again.");
        return;
      }
      loadMapView();
    }
  }

  function markerAt(x, y) {
    return mapMarkers.find(function (m) { return m.x === x && m.y === y; });
  }

  function pointName(p) {
    var mk = markerAt(p.x, p.y);
    return mk ? mk.label : "Square (" + p.x + ", " + p.y + ")";
  }

  function renderMeasure() {
    var svg = $("map-measure-svg");
    var text = $("map-measure-text");
    if (!svg || !text) return;
    if (!measureA) {
      svg.innerHTML = "";
      text.textContent = "Tap Measure, then tap two squares or places to see distance and travel time.";
      return;
    }
    var ax = ((measureA.x + 0.5) / MAP_COLS * 100).toFixed(2);
    var ay = ((measureA.y + 0.5) / MAP_ROWS * 100).toFixed(2);
    var shapes = '<circle cx="' + ax + '%" cy="' + ay + '%" r="6" class="measure-dot"/>';
    if (measureB) {
      var bx = ((measureB.x + 0.5) / MAP_COLS * 100).toFixed(2);
      var by = ((measureB.y + 0.5) / MAP_ROWS * 100).toFixed(2);
      shapes += '<line x1="' + ax + '%" y1="' + ay + '%" x2="' + bx + '%" y2="' + by + '%" class="measure-line"/>' +
        '<circle cx="' + bx + '%" cy="' + by + '%" r="6" class="measure-dot"/>';
      var dx = measureB.x - measureA.x;
      var dy = measureB.y - measureA.y;
      var squares = Math.sqrt(dx * dx + dy * dy);
      var miles = squares * milesPerSquare;
      text.textContent = pointName(measureA) + " to " + pointName(measureB) + ": " +
        Math.round(miles) + " miles (" + squares.toFixed(1) + " squares). On foot by road: " + (miles / 24).toFixed(1) +
        " days. Rough country: " + (miles / 12).toFixed(1) + " days. On horseback: " + (miles / 30).toFixed(1) + " days.";
    } else {
      text.textContent = pointName(measureA) + " set. Tap a second square or place.";
    }
    svg.innerHTML = shapes;
  }

  function applyMapZoom() {
    var wrap = $("map-wrap");
    if (!wrap) return;
    wrap.style.transform = "scale(" + mapZoom + ")";
    wrap.style.transformOrigin = "top left";
    var label = $("map-zoom-level");
    if (label) label.textContent = mapZoom.toFixed(1) + "x";
  }

  function setMapZoom(z, smooth) {
    mapZoom = Math.min(3, Math.max(1, smooth ? z : Math.round(z * 2) / 2));
    applyMapZoom();
  }

  async function addMap(e) {
    e.preventDefault();
    if (!configured) return setupNeeded();
    var name = $("new-map-name").value.trim();
    if (!name) return;
    var imageUrl = $("new-map-image").value.trim() || null;
    var res = await db.from("maps").insert({ name: name, image_url: imageUrl }).select().single();
    if (res.error || !res.data) {
      alert("Could not add the map. Check the connection and try again.");
      return;
    }
    $("new-map-name").value = "";
    $("new-map-image").value = "";
    currentMapId = res.data.id;
    loadMaps();
  }

  // ---------- live updates ----------

  var liveChannel = null;

  function setLiveStatus(text, ok) {
    var el = $("live-status");
    if (!el) return;
    el.textContent = "Live updates: " + text;
    el.classList.toggle("live-on", !!ok);
    el.classList.toggle("live-off", !ok);
  }

  function subscribeLive() {
    if (!configured || !db) {
      setLiveStatus("off (setup not finished)", false);
      return;
    }
    var tables = {
      messages: loadMessages,
      log_entries: loadLogEntries,
      characters: loadCharacters,
      quests: loadQuests,
      npcs: loadNpcs,
      rolls: loadRolls,
      combatants: loadCombatants,
      maps: loadMaps,
      map_cells: loadMapView,
      map_markers: loadMapView
    };
    liveChannel = db.channel("hub-live");
    Object.keys(tables).forEach(function (table) {
      ["INSERT", "UPDATE", "DELETE"].forEach(function (event) {
        liveChannel.on("postgres_changes", { event: event, schema: "public", table: table }, function () {
          tables[table]();
        });
      });
    });
    liveChannel.subscribe(function (status) {
      if (status === "SUBSCRIBED") {
        setLiveStatus("on", true);
      } else {
        setLiveStatus("off (refreshing every 15 seconds)", false);
      }
    });
  }

  // ---------- image lightbox ----------

  function openLightbox(src) {
    var box = $("image-lightbox");
    var img = $("lightbox-img");
    if (!box || !img || !src) return;
    img.src = src;
    box.classList.remove("hidden");
  }

  function closeLightbox() {
    var box = $("image-lightbox");
    if (box) box.classList.add("hidden");
    var img = $("lightbox-img");
    if (img) img.src = "";
  }

  // ---------- edit-list mode ----------

  function setNpcsEdit(on) {
    npcsEdit = on;
    var tab = $("tab-npcs");
    if (tab) tab.classList.toggle("editing", on);
    var form = $("npc-form");
    if (form) form.classList.toggle("hidden", !on);
    var btn = $("npcs-edit-toggle");
    if (btn) btn.textContent = on ? "Done" : "Edit list";
  }

  function setPlacesEdit(on) {
    placesEdit = on;
    var view = $("map-view");
    if (view) view.classList.toggle("editing", on);
    var btn = $("places-edit-toggle");
    if (btn) btn.textContent = on ? "Done" : "Edit list";
  }

  function setQuestsEdit(on) {
    questsEdit = on;
    var tab = $("tab-quests");
    if (tab) tab.classList.toggle("editing", on);
    var form = $("quest-form");
    if (form) form.classList.toggle("hidden", !on);
    var btn = $("quests-edit-toggle");
    if (btn) btn.textContent = on ? "Done" : "Edit list";
  }

  // ---------- init ----------

  function initApp() {
    initDb();
    subscribeLive();

    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { switchTab(btn.dataset.tab); });
    });

    var backToTop = document.querySelector(".back-to-top");
    var scrollUpdatePending = false;
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function updateBackToTop() {
      var visible = window.scrollY >= Math.max(window.innerHeight, document.documentElement.clientHeight);
      backToTop.classList.toggle("is-visible", visible);
      backToTop.setAttribute("aria-hidden", visible ? "false" : "true");
      backToTop.tabIndex = visible ? 0 : -1;
      scrollUpdatePending = false;
    }
    window.addEventListener("scroll", function () {
      if (!scrollUpdatePending) { scrollUpdatePending = true; window.requestAnimationFrame(updateBackToTop); }
    }, { passive: true });
    window.addEventListener("resize", updateBackToTop);
    backToTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }); });
    updateBackToTop();

    document.addEventListener("click", function (e) {
      var t = e.target;
      if (t && t.tagName === "IMG" && !t.closest("#image-lightbox")) {
        e.stopPropagation();
        openLightbox(t.src);
      }
    }, true);
    $("image-lightbox").addEventListener("click", function (e) {
      if (e.target === this || e.target.id === "lightbox-close") closeLightbox();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeLightbox();
    });
    $("npcs-edit-toggle").addEventListener("click", function () { setNpcsEdit(!npcsEdit); });
    $("places-edit-toggle").addEventListener("click", function () { setPlacesEdit(!placesEdit); });
    $("quests-edit-toggle").addEventListener("click", function () { setQuestsEdit(!questsEdit); });
    $("npc-form").classList.add("hidden");
    $("quest-form").classList.add("hidden");
    setupPush();
    setupLogEffects();

    $("message-form").addEventListener("submit", postMessage);
    $("messages-refresh").addEventListener("click", loadMessages);
    $("log-form").addEventListener("submit", addLogEntry);
    $("char-form").addEventListener("submit", saveChar);
    $("char-cancel").addEventListener("click", closeCharModal);
    $("add-player-form").addEventListener("submit", function (e) {
      e.preventDefault();
      if (!configured) return setupNeeded();
      var name = $("new-player-name").value.trim();
      if (!name) return;
      var id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (!id) return;
      $("new-player-name").value = "";
      openCharModal(id, null);
    });
    $("quest-form").addEventListener("submit", addQuest);
    $("npc-form").addEventListener("submit", addNpc);
    $("dice-form").addEventListener("submit", doRoll);
    $("combatant-form").addEventListener("submit", addCombatant);
    $("next-turn-btn").addEventListener("click", nextTurn);
    $("clear-battle-btn").addEventListener("click", clearBattle);
    $("add-map-form").addEventListener("submit", addMap);
    document.querySelectorAll(".map-modes .mode-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(".map-modes .mode-btn").forEach(function (b) {
          b.classList.remove("selected");
        });
        btn.classList.add("selected");
        mapMode = btn.id.replace("map-mode-", "");
        $("map-mode-hint").textContent =
          mapMode === "reveal" ? "Tap a dark square to reveal it." :
          mapMode === "hide" ? "Tap a revealed square to cover it with fog again." :
          mapMode === "measure" ? "Tap two squares or places to measure the distance between them." :
          "Tap a revealed square to mark a place there.";
      });
    });

    $("map-zoom-in").addEventListener("click", function () { setMapZoom(mapZoom + 0.5); });
    $("map-zoom-out").addEventListener("click", function () { setMapZoom(mapZoom - 0.5); });
    $("map-zoom-reset").addEventListener("click", function () { setMapZoom(1); });
    $("map-viewport").addEventListener("wheel", function (e) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setMapZoom(mapZoom + (e.deltaY < 0 ? 0.5 : -0.5));
    }, { passive: false });
    $("map-edit-toggle").addEventListener("click", function () {
      mapEdit = !mapEdit;
      var toggle = $("map-edit-toggle");
      toggle.textContent = mapEdit ? "Done" : "Edit map";
      toggle.classList.toggle("selected", mapEdit);
      document.querySelectorAll(".edit-mode-btn").forEach(function (b) {
        b.classList.toggle("hidden", !mapEdit);
      });
      document.querySelectorAll(".map-modes .mode-btn").forEach(function (b) {
        b.classList.remove("selected");
      });
      closeMapTooltip();
      if (mapEdit) {
        mapMode = "reveal";
        $("map-mode-reveal").classList.add("selected");
        $("map-mode-hint").textContent = "Tap a dark square to reveal it.";
      } else {
        mapMode = "view";
        $("map-mode-hint").textContent = "Tap a place to see it. Tap Edit map to change the map.";
      }
    });
    initMapGestures();

    function initMapGestures() {
      var viewport = $("map-viewport");
      var pointers = new Map();
      var panStart = null;
      var pinchStart = null;
      var dragged = false;
      viewport.addEventListener("pointerdown", function (e) {
        try { viewport.setPointerCapture(e.pointerId); } catch (err) {}
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 1) {
          panStart = { x: e.clientX, y: e.clientY, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop };
          dragged = false;
        } else if (pointers.size === 2) {
          var pts = Array.from(pointers.values());
          pinchStart = {
            dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
            zoom: mapZoom,
            midX: (pts[0].x + pts[1].x) / 2 - viewport.getBoundingClientRect().left,
            midY: (pts[0].y + pts[1].y) / 2 - viewport.getBoundingClientRect().top,
            scrollLeft: viewport.scrollLeft,
            scrollTop: viewport.scrollTop
          };
          panStart = null;
        }
      });
      viewport.addEventListener("pointermove", function (e) {
        if (!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 1 && panStart) {
          var dx = e.clientX - panStart.x;
          var dy = e.clientY - panStart.y;
          if (Math.abs(dx) + Math.abs(dy) > 8) dragged = true;
          if (dragged) {
            viewport.scrollLeft = panStart.scrollLeft - dx;
            viewport.scrollTop = panStart.scrollTop - dy;
          }
        } else if (pointers.size === 2 && pinchStart) {
          var pts2 = Array.from(pointers.values());
          var dist = Math.hypot(pts2[0].x - pts2[1].x, pts2[0].y - pts2[1].y);
          if (dist > 0) {
            var rect = viewport.getBoundingClientRect();
            var midX = (pts2[0].x + pts2[1].x) / 2 - rect.left;
            var midY = (pts2[0].y + pts2[1].y) / 2 - rect.top;
            var contentX = (pinchStart.scrollLeft + pinchStart.midX) / pinchStart.zoom;
            var contentY = (pinchStart.scrollTop + pinchStart.midY) / pinchStart.zoom;
            dragged = true;
            setMapZoom(pinchStart.zoom * dist / pinchStart.dist, true);
            viewport.scrollLeft = contentX * mapZoom - midX;
            viewport.scrollTop = contentY * mapZoom - midY;
          }
        }
      });
      function endPointer(e) {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinchStart = null;
        if (pointers.size === 0) {
          panStart = null;
          if (dragged) {
            suppressMapClick = true;
            setTimeout(function () { suppressMapClick = false; }, 150);
          }
        }
      }
      viewport.addEventListener("pointerup", endPointer);
      viewport.addEventListener("pointercancel", endPointer);
    }
    var scaleInput = $("map-scale-input");
    scaleInput.value = milesPerSquare;
    scaleInput.addEventListener("change", function () {
      var v = parseFloat(scaleInput.value);
      if (v && v > 0) {
        milesPerSquare = v;
        try { localStorage.setItem("hub-map-scale", String(v)); } catch (e) {}
        renderMeasure();
      } else {
        scaleInput.value = milesPerSquare;
      }
    });

    document.querySelectorAll("#dice-buttons button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("#dice-buttons button").forEach(function (b) {
          b.classList.remove("selected");
        });
        btn.classList.add("selected");
        selectedDie = parseInt(btn.dataset.die, 10);
      });
    });

    loadMessages();
    setInterval(loadMessages, 15000);
  }

  initGate();
})();
