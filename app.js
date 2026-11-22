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
  var selectedCount = 1;
  var combatants = [];
  var currentTurn = 0;
  var battleState = { round: 1, current_combatant_id: null };
  var battleStateReady = false;

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
    companions: loadCompanions,
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
    var res = await db.from("messages").select("*").order("created_at", { ascending: false });
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
        (entry.is_mechanics ? '<p class="meta">Mechanics note</p>' : '') +
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
      if (isNpcPlayer(targets[i]) && (fx.kind === "xp" || fx.kind === "gold" || fx.kind === "level")) continue;
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
    var isMechanics = $("log-mechanics") ? $("log-mechanics").checked : false;
    var entryData = { title: title, body: body, is_mechanics: isMechanics };
    if (logAreaMapReady) {
      var areaMapSel = $("log-area-map");
      if (areaMapSel && areaMapSel.value) entryData.area_map_url = areaMapSel.value;
    }
    var res = await db.from("log_entries").insert(entryData).select("id").single();
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
    var locations = partyLocationsReady ? readLogLocationRows() : [];
    if (locations.length) {
      for (var j = 0; j < locations.length; j++) {
        locations[j].log_id = res.data.id;
        await db.from("party_locations").insert(locations[j]);
        await db.from("map_markers").update({ visited: true }).eq("id", locations[j].marker_id);
        var mkRes = await db.from("map_markers").select("label").eq("id", locations[j].marker_id).single();
        if (!mkRes.error && mkRes.data) {
          var npcRes = await db.from("npcs").select("id, name").eq("kind", "Place");
          if (!npcRes.error && npcRes.data) {
            var match = npcRes.data.find(function (n) { return normName(n.name) === normName(mkRes.data.label); });
            if (match) await db.from("npcs").update({ visited: true }).eq("id", match.id);
          }
        }
      }
    }
    $("log-title").value = "";
    $("log-body").value = "";
    if ($("log-mechanics")) $("log-mechanics").checked = false;
    if ($("log-area-map")) $("log-area-map").value = "";
    clearLogEffectRows();
    clearLogLocationRows();
    loadLogEntries();
    loadCharacters();
    loadPartyLocations();
    loadCurrentArea();
  }

  // ---------- Party locations ----------

  var locationOptionsHtml = '<option value="">Where?</option>';

  async function setupPartyLocations() {
    var res = await db.from("party_locations").select("id").limit(1);
    if (res.error) return; // table not there yet (SQL not run): leave the section hidden
    partyLocationsReady = true;
    var box = $("log-locations");
    if (box) box.classList.remove("hidden");
    var addBtn = $("log-location-add");
    if (addBtn) addBtn.addEventListener("click", addLogLocationRow);
    addLogLocationRow();
    loadLocationOptions();
  }

  // ---------- Area maps on log entries ----------
  var HUB_BASE = "https://kcrazeynate.github.io/couples-dnd-hub/assets/";
  var AREA_MAP_OPTIONS = [
    { label: "Ruins north of Riverton", url: HUB_BASE + "area-ruins.jpg", grid: 14 },
    { label: "Lantern Inn", url: HUB_BASE + "area-lantern-inn.jpg", grid: 14 },
    { label: "Gilded Boar", url: HUB_BASE + "area-gilded-boar.jpg", grid: 14 },
    { label: "Toll house", url: HUB_BASE + "area-tollhouse.jpg", grid: 14 },
    { label: "Watchtower ruins", url: HUB_BASE + "area-watchtower.jpg", grid: 14 },
    { label: "Forest road", url: HUB_BASE + "area-forest-road.jpg", grid: 14 }
  ];
  var logAreaMapReady = false;

  async function setupLogAreaMap() {
    var sel = $("log-area-map");
    if (!sel) return;
    sel.innerHTML = '<option value="">None</option>' + AREA_MAP_OPTIONS.map(function (o) {
      return '<option value="' + o.url + '">' + escapeHtml(o.label) + '</option>';
    }).join("");
    var res = await db.from("log_entries").select("area_map_url").limit(1);
    if (res.error) return; // column not there yet (SQL not run): leave the section hidden
    logAreaMapReady = true;
    var box = $("log-area-map-wrap");
    if (box) box.classList.remove("hidden");
  }

  // Current area: the map for where the party is, from the latest log entry
  // that carries a map or a location. Entry's own map wins; otherwise the
  // location marker's map, then the matching place's map. Unvisited places
  // stay hidden.
  // ---------- Map view: world vs area ----------
  var currentAreaMapUrl = null;
  var currentAreaLabel = "";
  var battleActive = false;
  var prevBattleActive = false;
  var prevHasAreaMap = false;
  var mapViewOverride = null;
  var mapView = "world";

  function areaMapLabel(url) {
    var opt = AREA_MAP_OPTIONS.find(function (o) { return o.url === url; });
    return opt ? opt.label : null;
  }

  function areaGridFor(url) {
    var opt = AREA_MAP_OPTIONS.find(function (o) { return o.url === url; });
    return (opt && opt.grid) || 14;
  }

  function characterForCombatant(name) {
    var n = String(name || "").toLowerCase().trim();
    if (!n) return null;
    var chars = Object.keys(charByPlayer).map(function (k) { return charByPlayer[k]; });
    for (var i = 0; i < chars.length; i++) {
      var cn = String(chars[i].name || "").toLowerCase();
      if (!cn) continue;
      if (cn.indexOf(n) !== -1 || n.indexOf(cn.split(" ")[0]) !== -1) return chars[i];
    }
    return null;
  }

  function combatantSpeed(c) {
    if (typeof c.speed === "number" && c.speed > 0) return c.speed;
    var ch = characterForCombatant(c.name);
    if (ch) return speedFor(ch.race);
    return 30;
  }

  function combatantSide(c) {
    return c.side || "party";
  }

  // Grid distance in feet between two squares (each square is 5 ft).
  function gridFeet(ax, ay, bx, by) {
    return Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 5;
  }

  function renderAreaTokens() {
    var layer = $("area-tokens");
    if (!layer || !currentAreaMapUrl) return;
    var grid = areaGridFor(currentAreaMapUrl);
    layer.classList.toggle("editing", placesEdit);
    var html = combatants.filter(function (c) {
      return c.hp > 0 && typeof c.grid_x === "number" && typeof c.grid_y === "number";
    }).map(function (c) {
      var side = combatantSide(c);
      var isCurrent = battleStateReady && c.id === battleState.current_combatant_id;
      var initial = String(c.name || "?").trim().charAt(0).toUpperCase();
      var left = ((c.grid_x + 0.5) / grid * 100).toFixed(2);
      var top = ((c.grid_y + 0.5) / grid * 100).toFixed(2);
      return '<div class="area-token ' + side + (isCurrent ? " current" : "") + '" data-token-id="' + c.id + '" style="left:' + left + '%;top:' + top + '%" title="' + escapeHtml(c.name) + ' - HP ' + c.hp + '/' + c.max_hp + ', Speed ' + combatantSpeed(c) + ' ft">' + escapeHtml(initial) + '</div>';
    }).join("");
    layer.innerHTML = html;
    layer.querySelectorAll(".area-token").forEach(function (el) {
      el.addEventListener("pointerdown", onTokenPointerDown);
    });
  }

  var tokenDrag = null;

  function areaSquareFromEvent(ev) {
    var wrap = document.querySelector(".area-map-wrap");
    if (!wrap || !currentAreaMapUrl) return null;
    var rect = wrap.getBoundingClientRect();
    var grid = areaGridFor(currentAreaMapUrl);
    var x = Math.floor((ev.clientX - rect.left) / rect.width * grid);
    var y = Math.floor((ev.clientY - rect.top) / rect.height * grid);
    x = Math.max(0, Math.min(grid - 1, x));
    y = Math.max(0, Math.min(grid - 1, y));
    return { x: x, y: y, grid: grid };
  }

  function onTokenPointerDown(ev) {
    if (!placesEdit) return;
    var id = ev.currentTarget.dataset.tokenId;
    var c = combatants.find(function (cc) { return cc.id === id; });
    if (!c) return;
    ev.preventDefault();
    var sq = areaSquareFromEvent(ev);
    if (!sq) return;
    tokenDrag = {
      id: id,
      startX: c.grid_x,
      startY: c.grid_y,
      moved: false,
      startClientX: ev.clientX,
      startClientY: ev.clientY
    };
    ev.currentTarget.classList.add("dragging");
    ev.currentTarget.setPointerCapture(ev.pointerId);
    ev.currentTarget.addEventListener("pointermove", onTokenPointerMove);
    ev.currentTarget.addEventListener("pointerup", onTokenPointerUp);
    ev.currentTarget.addEventListener("pointercancel", onTokenPointerUp);
  }

  function onTokenPointerMove(ev) {
    if (!tokenDrag) return;
    var sq = areaSquareFromEvent(ev);
    if (!sq) return;
    if (Math.abs(ev.clientX - tokenDrag.startClientX) > 6 || Math.abs(ev.clientY - tokenDrag.startClientY) > 6) {
      tokenDrag.moved = true;
    }
    var el = document.querySelector('[data-token-id="' + tokenDrag.id + '"]');
    if (el) {
      el.style.left = ((sq.x + 0.5) / sq.grid * 100).toFixed(2) + "%";
      el.style.top = ((sq.y + 0.5) / sq.grid * 100).toFixed(2) + "%";
    }
    var c = combatants.find(function (cc) { return cc.id === tokenDrag.id; });
    var label = $("area-drag-label");
    if (c && label) {
      var feet = gridFeet(tokenDrag.startX, tokenDrag.startY, sq.x, sq.y);
      label.textContent = c.name + ": " + feet + " ft (speed " + combatantSpeed(c) + " ft)";
      label.classList.remove("hidden");
    }
    tokenDrag.x = sq.x;
    tokenDrag.y = sq.y;
  }

  async function onTokenPointerUp(ev) {
    var drag = tokenDrag;
    tokenDrag = null;
    var el = ev.currentTarget;
    el.classList.remove("dragging");
    el.removeEventListener("pointermove", onTokenPointerMove);
    el.removeEventListener("pointerup", onTokenPointerUp);
    el.removeEventListener("pointercancel", onTokenPointerUp);
    var label = $("area-drag-label");
    var c = combatants.find(function (cc) { return cc.id === drag.id; });
    if (!c) { renderAreaTokens(); return; }
    if (!drag.moved) {
      // A tap: show the token's details for a few seconds.
      if (label) {
        label.textContent = c.name + " - HP " + c.hp + "/" + c.max_hp + ", Speed " + combatantSpeed(c) + " ft, " + combatantSide(c);
        label.classList.remove("hidden");
        setTimeout(function () { label.classList.add("hidden"); }, 3000);
      }
      renderAreaTokens();
      return;
    }
    var toX = (typeof drag.x === "number") ? drag.x : drag.startX;
    var toY = (typeof drag.y === "number") ? drag.y : drag.startY;
    if (toX === drag.startX && toY === drag.startY) {
      if (label) label.classList.add("hidden");
      renderAreaTokens();
      return;
    }
    var feet = gridFeet(drag.startX, drag.startY, toX, toY);
    var speed = combatantSpeed(c);
    var side = combatantSide(c);
    var oa = [];
    combatants.forEach(function (other) {
      if (other.id === c.id || other.hp <= 0) return;
      if (combatantSide(other) === side) return;
      var startAdj = gridFeet(drag.startX, drag.startY, other.grid_x, other.grid_y) <= 5;
      var endAdj = gridFeet(toX, toY, other.grid_x, other.grid_y) <= 5;
      if (startAdj && !endAdj) oa.push(other.name);
    });
    var problems = [];
    if (feet > speed) {
      problems.push(c.name + " has a speed of " + speed + " ft. This move is " + feet + " ft, so they can't move that far. Dashing would allow " + (speed * 2) + " ft.");
    }
    if (oa.length) {
      problems.push("Moving out of " + oa.join(", ") + "'s reach. " + oa.join(", ") + " get" + (oa.length > 1 ? "" : "s") + " an opportunity attack, unless " + c.name + " Disengaged.");
    }
    if (label) label.classList.add("hidden");
    if (problems.length) {
      var ok = window.confirm(problems.join("\n\n") + "\n\nMove anyway?");
      if (!ok) { renderAreaTokens(); return; }
    }
    var res = await db.from("combatants").update({ grid_x: toX, grid_y: toY }).eq("id", c.id);
    if (res.error) {
      alert("Could not move the token. Check the connection and try again.");
      renderAreaTokens();
      return;
    }
    loadCombatants();
  }

  function renderAreaMapView() {
    var view = $("area-map-view");
    var content = $("area-map-content");
    if (!view || !content) return;
    if (!currentAreaMapUrl) {
      content.innerHTML = '<p class="empty">No area map for where the party is right now.</p>';
      return;
    }
    content.innerHTML = '<div class="card"><p class="title">Current area: ' + escapeHtml(currentAreaLabel || "this scene") + '</p>' +
      '<div class="area-map-wrap"><img class="area-map-img" src="' + escapeHtml(currentAreaMapUrl) + '" alt="Area map">' +
      '<div id="area-tokens" class="area-tokens"></div>' +
      '<div id="area-drag-label" class="area-drag-label hidden"></div></div>' +
      '<p class="hint">1 square = 5 feet. Tap a token to see who it is. Turn on Edit list to move tokens, only the DM moves them.</p></div>';
    content.querySelector("img").addEventListener("click", function () {
      openLightbox(currentAreaMapUrl);
    });
    renderAreaTokens();
  }

  function setMapView(view) {
    mapView = view;
    var worldView = $("map-view");
    var areaView = $("area-map-view");
    if (worldView) worldView.classList.toggle("hidden", view !== "world" || !mapsList.length);
    if (areaView) areaView.classList.toggle("hidden", view !== "area");
    var worldBtn = $("map-view-world");
    var areaBtn = $("map-view-area");
    if (worldBtn) worldBtn.classList.toggle("selected", view === "world");
    if (areaBtn) {
      areaBtn.classList.toggle("selected", view === "area");
      areaBtn.disabled = !currentAreaMapUrl;
    }
  }

  // Auto-switch: a battle with an area map shows the area map; when the
  // battle ends, or the party leaves a mapped area, it goes back to the
  // world map. A manual tap on World/Area map sticks until the next
  // battle start or end.
  function updateMapView() {
    var hasAreaMap = !!currentAreaMapUrl;
    var inBattle = battleActive;
    if (inBattle !== prevBattleActive) mapViewOverride = null;
    if (!hasAreaMap && prevHasAreaMap) mapViewOverride = null;
    prevBattleActive = inBattle;
    prevHasAreaMap = hasAreaMap;
    var auto = (inBattle && hasAreaMap) ? "area" : "world";
    setMapView(mapViewOverride || auto);
  }

  async function loadCurrentArea() {
    var wrap = $("current-area");
    if (!wrap || !configured) return;
    var mapUrl = null;
    var placeName = null;
    var entryTitle = null;
    var entryDate = null;
    // A battle's area map wins while the battle is on.
    var battleRes = await db.from("battle_state").select("area_map_url").eq("id", 1).single();
    var combatRes = await db.from("combatants").select("id").limit(1);
    var inBattle = !combatRes.error && combatRes.data && combatRes.data.length > 0;
    battleActive = inBattle;
    if (inBattle && !battleRes.error && battleRes.data && battleRes.data.area_map_url) {
      mapUrl = battleRes.data.area_map_url;
      placeName = areaMapLabel(mapUrl) || "Battle";
    }
    // Otherwise fall back to the latest log entry.
    var res = await db.from("log_entries").select("id, title, created_at, area_map_url").order("created_at", { ascending: false }).limit(20);
    if (res.error) {
      // column not there yet (SQL not run): retry without it, location maps still work
      res = await db.from("log_entries").select("id, title, created_at").order("created_at", { ascending: false }).limit(20);
    }
    if (!mapUrl && !res.error && res.data && res.data.length) {
      var locRes = await db.from("party_locations").select("log_id, marker_id").order("created_at", { ascending: false }).limit(50);
      var locByLog = {};
      (locRes.data || []).forEach(function (pl) {
        (locByLog[pl.log_id] = locByLog[pl.log_id] || []).push(pl.marker_id);
      });
      for (var i = 0; i < res.data.length; i++) {
        var e = res.data[i];
        var m = e.area_map_url || null;
        var pn = null;
        if (!m) {
          var mids = locByLog[e.id] || [];
          for (var j = 0; j < mids.length; j++) {
            var mk = mapMarkers.find(function (mm) { return mm.id === mids[j]; });
            if (!mk) continue;
            pn = mk.label;
            if (mk.area_map_url && mk.visited) { m = mk.area_map_url; break; }
            var entry = npcsByName[normName(mk.label)];
            if (entry && entry.area_map_url && entry.visited) { m = entry.area_map_url; break; }
          }
        }
        if (m) {
          mapUrl = m;
          placeName = pn;
          entryTitle = e.title;
          entryDate = e.created_at;
          break;
        }
      }
    }
    currentAreaMapUrl = mapUrl;
    currentAreaLabel = placeName || entryTitle || "";
    if (mapUrl) {
      var date = entryDate ? new Date(entryDate).toLocaleDateString() : "";
      var where = placeName ? escapeHtml(placeName) : "this scene";
      wrap.innerHTML = '<div class="card"><p class="title">Current area: ' + where + '</p>' +
        (entryTitle ? '<p>As of "' + escapeHtml(entryTitle) + '"' + (date ? ' (' + escapeHtml(date) + ')' : '') + '</p>' : '') +
        '<button type="button" class="area-map-btn" data-area-map="' + escapeHtml(mapUrl) + '">View area map</button></div>';
      wrap.querySelector("[data-area-map]").addEventListener("click", function (ev) {
        ev.stopPropagation();
        openLightbox(mapUrl);
      });
    } else {
      wrap.innerHTML = '<p class="empty">No area map for where the party is right now.</p>';
    }
    renderAreaMapView();
    updateMapView();
  }

  async function loadLocationOptions() {
    var res = await db.from("map_markers").select("id, label").order("label", { ascending: true });
    if (res.error || !res.data) return;
    locationOptionsHtml = '<option value="">Where?</option>' + res.data.map(function (m) {
      return '<option value="' + m.id + '">' + escapeHtml(m.label) + '</option>';
    }).join("");
    document.querySelectorAll("#log-location-rows .location-where").forEach(function (sel) {
      var cur = sel.value;
      sel.innerHTML = locationOptionsHtml;
      sel.value = cur;
    });
  }

  function addLogLocationRow() {
    var row = document.createElement("div");
    row.className = "location-row";
    row.innerHTML =
      '<input type="text" class="location-who" placeholder="Who? e.g. Full party">' +
      '<select class="location-where">' + locationOptionsHtml + '</select>' +
      '<button type="button" class="effect-remove" title="Remove this group">x</button>';
    row.querySelector(".effect-remove").addEventListener("click", function () { row.remove(); });
    $("log-location-rows").appendChild(row);
  }

  function clearLogLocationRows() {
    $("log-location-rows").innerHTML = "";
    if (partyLocationsReady) addLogLocationRow();
  }

  function readLogLocationRows() {
    var rows = document.querySelectorAll("#log-location-rows .location-row");
    var out = [];
    rows.forEach(function (row) {
      var who = row.querySelector(".location-who").value.trim() || "Full party";
      var markerId = row.querySelector(".location-where").value;
      if (!markerId) return;
      out.push({ label: who, marker_id: markerId });
    });
    return out;
  }

  async function loadPartyLocations() {
    var layer = $("party-markers");
    if (!layer) return;
    layer.innerHTML = "";
    partyLocations = [];
    if (!configured) return;
    var res = await db.from("party_locations").select("*").order("created_at", { ascending: false });
    if (res.error || !res.data || !res.data.length) return;
    var latestLogId = res.data[0].log_id;
    var rows = res.data.filter(function (r) { return r.log_id === latestLogId; });
    var entryRes = await db.from("log_entries").select("title, created_at").eq("id", latestLogId).single();
    partyEntryTitle = (!entryRes.error && entryRes.data) ? entryRes.data.title : "";
    partyEntryDate = (!entryRes.error && entryRes.data) ? entryRes.data.created_at : "";
    partyLocations = rows;
    renderPartyMarkers();
  }

  function renderPartyMarkers() {
    var layer = $("party-markers");
    if (!layer) return;
    layer.innerHTML = partyLocations.map(function (loc, i) {
      var mk = mapMarkers.find(function (m) { return m.id === loc.marker_id; });
      if (!mk) return "";
      var color = PARTY_COLORS[i % PARTY_COLORS.length];
      var left = ((mk.x + 0.5) / MAP_COLS * 100).toFixed(2);
      var top = ((mk.y + 0.5) / MAP_ROWS * 100).toFixed(2);
      return '<div class="party-marker" data-party-idx="' + i + '" style="left:' + left + '%;top:' + top + '%;--party-color:' + color + '">' +
        '<span class="party-token"></span><span class="party-label">' + escapeHtml(loc.label) + '</span></div>';
    }).join("");
    layer.querySelectorAll(".party-marker").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        togglePartyTooltip(parseInt(el.dataset.partyIdx, 10));
      });
    });
  }

  function togglePartyTooltip(idx) {
    var tip = $("map-tooltip");
    if (!tip) return;
    var loc = partyLocations[idx];
    if (!loc) return;
    var key = "party-" + idx;
    if (openTooltipMarker === key) {
      closeMapTooltip();
      return;
    }
    openTooltipMarker = key;
    var mk = mapMarkers.find(function (m) { return m.id === loc.marker_id; });
    var place = mk ? mk.label : "somewhere";
    var html = '<p class="tip-title">Party: ' + escapeHtml(loc.label) + '</p>' +
      '<p class="tip-notes">At ' + escapeHtml(place) + '</p>';
    if (partyEntryTitle) html += '<p class="tip-notes">As of "' + escapeHtml(partyEntryTitle) + '"' + (partyEntryDate ? ' (' + escapeHtml(fmtTime(partyEntryDate)) + ')' : '') + '</p>';
    tip.innerHTML = html;
    var wrap = $("map-wrap");
    var px = mk ? (mk.x + 0.5) / MAP_COLS * wrap.clientWidth : wrap.clientWidth / 2;
    var pinY = mk ? (mk.y + 0.5) / MAP_ROWS * wrap.clientHeight : wrap.clientHeight / 2;
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
    await syncNpcLevels(res.data);
    var byPlayer = {};
    res.data.forEach(function (c) { byPlayer[c.player] = c; });
    charByPlayer = byPlayer;
    var players = PLAYERS.slice();
    var seen = {};
    players.forEach(function (p) { seen[p.player] = true; });
    res.data.forEach(function (c) {
      if (c.player && !seen[c.player] && !(isNpcPlayer(c.player) && c.dismissed)) {
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

  async function loadCompanions() {
    var statusEl = $("companions-status");
    var list = $("companions-list");
    if (!configured) {
      statusEl.innerHTML = "";
      list.innerHTML = '<p class="empty">Setup is not finished yet. See README.md.</p>';
      return;
    }
    var res = await db.from("characters").select("*");
    if (res.error) {
      list.innerHTML = '<p class="error">Could not load companions.</p>';
      return;
    }
    var rows = res.data || [];
    var byPlayer = {};
    rows.forEach(function (c) { byPlayer[c.player] = c; });
    var counts = partyCounts(rows);
    var locked = await recruitmentLocked();
    var targetLevel = npcTargetLevel(rows);
    var open = 6 - counts.real - counts.npcs;
    var status = "";
    if (locked) status = '<p class="meta">Recruitment is closed. The campaign has started, so no companions can be added.</p>';
    else status = '<p class="meta">Recruitment is open. Pick up to ' + open + ' companion' + (open === 1 ? '' : 's') + ' to fill the party of 6. Once the first story entry is posted, recruitment closes.</p>';
    status += '<p class="meta">Party: ' + counts.real + ' player' + (counts.real === 1 ? '' : 's') + ' + ' + counts.npcs + ' companion' + (counts.npcs === 1 ? '' : 's') + ' of 6. Companions scale to level ' + targetLevel + ' (average of the players, rounded up) and carry no gold.</p>';
    statusEl.innerHTML = status;
    list.innerHTML = NPC_ROSTER.map(function (entry) {
      return npcRosterCard(entry, byPlayer["npc_" + entry.key], locked, counts, targetLevel);
    }).join("");
    bindCompanionCards();
  }

  function npcRosterDetails(entry, targetLevel) {
    var pseudo = { level: targetLevel, str: entry.str, dex: entry.dex, con: entry.con, int: entry.int, wis: entry.wis, cha: entry.cha, skills: entry.skills, class: entry.class };
    var pb = profBonus(targetLevel);
    var scoresHtml = ["str", "dex", "con", "int", "wis", "cha"].map(function (ab) {
      return '<div class="sheet-score"><span class="mod">' + fmtMod(abilityMod(entry[ab])) + '</span><span class="score-name">' + ab.toUpperCase() + '</span><span class="score-val">' + entry[ab] + '</span></div>';
    }).join("");
    var saveProfs = SAVE_PROFS[classKey(entry.class)] || [];
    var saveNames = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
    var savesHtml = ["str", "dex", "con", "int", "wis", "cha"].map(function (ab) {
      var prof = saveProfs.indexOf(ab) !== -1;
      var bonus = abilityMod(entry[ab]) + (prof ? pb : 0);
      return '<div class="sheet-line' + (prof ? ' prof' : '') + '"><span class="dot">' + (prof ? "●" : "○") + '</span><span>' + saveNames[ab] + '</span><span class="num">' + fmtMod(bonus) + '</span></div>';
    }).join("");
    var skillsHtml = SKILLS.map(function (sk) {
      var r = skillBonus(pseudo, sk[0], sk[1]);
      return '<div class="sheet-line' + (r.proficient ? ' prof' : '') + '"><span class="dot">' + (r.proficient ? "●" : "○") + '</span><span>' + sk[0] + ' (' + sk[1].toUpperCase() + ')</span><span class="num">' + fmtMod(r.bonus) + '</span></div>';
    }).join("");
    var perc = skillBonus(pseudo, "Perception", "wis");
    var atkLines = textLines(entry.attacks);
    var attacksHtml = "";
    if (atkLines.length) {
      var rows = atkLines.map(function (line) {
        var parts = line.split(",").map(function (s) { return s.trim(); });
        return "<tr><td>" + escapeHtml(parts[0] || line) + "</td><td>" + escapeHtml(parts[1] || "-") + "</td><td>" + escapeHtml(parts.slice(2).join(", ") || "-") + "</td></tr>";
      }).join("");
      attacksHtml = '<p><strong>Attacks</strong></p><table class="sheet-attacks"><tr><th>Name</th><th>Attack</th><th>Damage</th></tr>' + rows + '</table>';
    }
    var spellLines = textLines(entry.spells);
    var sp = spellStats(pseudo);
    var spellsHtml = "";
    if (spellLines.length) {
      spellsHtml = '<p><strong>Spells</strong></p>' +
        (sp ? '<p class="meta">Spell save DC ' + sp.dc + ' · Spell attack ' + fmtMod(sp.attack) + '</p>' : '') +
        listHtml(spellLines);
    }
    var featLines = textLines(entry.features);
    var featuresHtml = featLines.length ? '<p><strong>Features &amp; Traits</strong></p>' + listHtml(featLines) : "";
    var invLines = textLines(entry.inventory);
    var invHtml = invLines.length ? listHtml(invLines) : '<p class="empty">No items yet.</p>';
    return '<div class="sheet-scores">' + scoresHtml + '</div>' +
      '<p><strong>Saving Throws</strong></p><div class="sheet-list">' + savesHtml + '</div>' +
      '<p><strong>Skills</strong></p><div class="sheet-list">' + skillsHtml + '</div>' +
      '<p class="meta">Passive Perception ' + (10 + perc.bonus) + '</p>' +
      attacksHtml + spellsHtml + featuresHtml +
      '<p><strong>Inventory</strong></p>' + invHtml;
  }

  function npcRosterCard(entry, row, locked, counts, targetLevel) {
    var recruited = !!row && !row.dismissed;
    var dismissed = !!row && !!row.dismissed;
    var maxHp = npcMaxHp(entry, targetLevel);
    var hpLine = recruited ? (row.hp + " / " + row.max_hp) : (maxHp + " max");
    var picHtml = entry.image
      ? '<img class="npc-pic" src="' + escapeHtml(entry.image) + '" alt="">'
      : '<div class="npc-pic npc-pic-fallback">' + escapeHtml(entry.class.charAt(0)) + '</div>';
    var action = "";
    if (dismissed) {
      action = '<p class="meta">Dismissed. Gone for this campaign.</p>';
    } else if (recruited) {
      action = '<p class="meta">In the party · ' + escapeHtml(joinModeLabel(row.join_mode)) + '</p>' +
        '<div class="actions"><button type="button" data-dismiss-npc="' + entry.key + '">Dismiss</button></div>';
    } else if (locked) {
      action = '<p class="meta">Recruitment closed.</p>';
    } else if (counts.real + counts.npcs >= 6) {
      action = '<p class="meta">The party is full (6).</p>';
    } else {
      action = '<div class="actions"><label>Join as <select data-join-mode="' + entry.key + '"><option value="story">Met in the story</option><option value="start">Started with the party</option></select></label>' +
        '<button type="button" data-recruit-npc="' + entry.key + '">Recruit</button></div>';
    }
    return '<div class="card sheet npc">' +
      '<div class="npc-summary">' + picHtml +
      '<div class="npc-id"><span class="name">' + escapeHtml(entry.name) + '</span>' +
      '<span class="meta">' + escapeHtml(entry.race) + ' ' + escapeHtml(entry.class) + ' - Level ' + targetLevel + '</span>' +
      '<span class="meta">HP ' + hpLine + ' · AC ' + entry.ac + '</span>' +
      '<span class="meta">' + escapeHtml(entry.blurb) + '</span></div>' +
      '<button type="button" class="npc-toggle" data-npc-toggle="roster-' + entry.key + '">Full stats</button>' +
      '</div>' +
      '<div class="npc-details hidden" data-npc-details="roster-' + entry.key + '">' + npcRosterDetails(entry, targetLevel) + '</div>' +
      action +
      '</div>';
  }

  function bindCompanionCards() {
    document.querySelectorAll('[data-npc-toggle^="roster-"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        var details = document.querySelector('[data-npc-details="' + btn.dataset.npcToggle + '"]');
        if (!details) return;
        var hidden = details.classList.toggle("hidden");
        btn.textContent = hidden ? "Full stats" : "Hide full stats";
      });
    });
    document.querySelectorAll("[data-recruit-npc]").forEach(function (btn) {
      btn.addEventListener("click", function () { recruitNpc(btn.dataset.recruitNpc); });
    });
    document.querySelectorAll("[data-dismiss-npc]").forEach(function (btn) {
      btn.addEventListener("click", function () { dismissNpc(btn.dataset.dismissNpc); });
    });
  }

  async function recruitNpc(key) {
    var entry = npcRosterByKey(key);
    if (!entry) return;
    var sel = document.querySelector('[data-join-mode="' + key + '"]');
    var mode = sel ? sel.value : "story";
    var res = await db.from("characters").select("*");
    var rows = (res.data || []);
    var counts = partyCounts(rows);
    if (counts.real + counts.npcs >= 6) { alert("The party is full (6)."); return; }
    if (await recruitmentLocked()) { alert("Recruitment is closed. The campaign has started."); loadCompanions(); return; }
    var targetLevel = npcTargetLevel(rows);
    var maxHp = npcMaxHp(entry, targetLevel);
    var insert = {
      player: "npc_" + key,
      name: entry.name, race: entry.race, class: entry.class, background: entry.background,
      level: targetLevel, hp: maxHp, max_hp: maxHp, temp_hp: 0, ac: entry.ac,
      str: entry.str, dex: entry.dex, con: entry.con, int: entry.int, wis: entry.wis, cha: entry.cha,
      skills: entry.skills, attacks: entry.attacks, spells: entry.spells, features: entry.features,
      inventory: entry.inventory, gold: 0, join_mode: mode, dismissed: false,
      hit_dice_used: 0, death_save_successes: 0, death_save_failures: 0,
      updated_at: new Date().toISOString()
    };
    var ins = await db.from("characters").insert(insert);
    if (ins.error) { alert("Could not recruit " + entry.name + "."); return; }
    loadCompanions();
    loadCharacters();
  }

  async function dismissNpc(key) {
    var entry = npcRosterByKey(key);
    if (!entry) return;
    if (!window.confirm("Dismiss " + entry.name + "? They leave the party and cannot come back until a new campaign.")) return;
    await db.from("characters").update({ dismissed: true, updated_at: new Date().toISOString() }).eq("player", "npc_" + key);
    loadCompanions();
    loadCharacters();
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

  var HUB_URL = "https://kcrazeynate.github.io/couples-dnd-hub/";

  function isNpcPlayer(player) {
    return String(player || "").indexOf("npc_") === 0;
  }

  var NPC_ROSTER = [
    { key: "barbarian", name: "Ghorza", race: "Half-orc", class: "Barbarian", background: "Outlander", ac: 13, str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10, skills: "Athletics, Intimidation, Survival", attacks: "Greataxe, +4, 1d12+2 slashing\nHandaxe, +4, 1d6+2 slashing", spells: "", features: "Rage", inventory: "Greataxe\n2x Handaxe\nJavelin\nExplorer's Pack", image: HUB_URL + "assets/npc-ghorza.jpg", blurb: "Laughs first, hits second." },
    { key: "bard", name: "Pip", race: "Half-elf", class: "Bard", background: "Entertainer", ac: 13, str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 15, skills: "Performance, Persuasion, Insight", attacks: "Rapier, +4, 1d8+2 piercing\nDagger, +4, 1d4+2 piercing", spells: "Cantrips: Vicious Mockery, Minor Illusion\n1st level: Healing Word, Cure Wounds", features: "Bardic Inspiration (d6)\nJack of All Trades\nSpellcasting", inventory: "Rapier\nLute\nLeather armor\nEntertainer's Pack", image: HUB_URL + "assets/npc-pip.jpg", blurb: "Sings the party's deeds before they've done them." },
    { key: "cleric", name: "Liora", race: "Half-elf", class: "Cleric", background: "Acolyte", ac: 16, str: 10, dex: 13, con: 14, int: 8, wis: 15, cha: 12, skills: "Medicine, Insight, Religion", attacks: "Mace, +2, 1d6 bludgeoning\nLight crossbow, +3, 1d8+1 piercing\nDagger, +2, 1d4 piercing", spells: "Cantrips: Sacred Flame, Guidance, Light\n1st level: Bless, Cure Wounds", features: "Disciple of Life\nSpellcasting", inventory: "Mace\nLight crossbow\n20x Bolt\nDagger\nHoly symbol\nExplorer's Pack", image: HUB_URL + "assets/npc-liora.jpg", blurb: "Warm, steady, the one who looks away when the party gets rough." },
    { key: "druid", name: "Ash", race: "Wood elf", class: "Druid", background: "Hermit", ac: 14, str: 10, dex: 14, con: 13, int: 12, wis: 15, cha: 8, skills: "Nature, Survival, Animal Handling", attacks: "Quarterstaff, +2, 1d6 bludgeoning\nDagger, +4, 1d4+2 piercing", spells: "Cantrips: Druidcraft, Produce Flame\n1st level: Cure Wounds, Entangle", features: "Wild Shape\nSpellcasting", inventory: "Quarterstaff\nLeather armor\nHerbalism kit\nExplorer's Pack", image: HUB_URL + "assets/npc-ash.jpg", blurb: "Talks to the road more than to people." },
    { key: "fighter", name: "Bram", race: "Human", class: "Fighter", background: "Soldier", ac: 19, str: 16, dex: 14, con: 18, int: 10, wis: 12, cha: 8, skills: "Athletics, Intimidation", attacks: "Longsword, +5, 1d8+3 slashing", spells: "", features: "Second Wind\nAction Surge", inventory: "Longsword\nShield\nSplint armor\nExplorer's Pack", image: HUB_URL + "assets/npc-bram.jpg", blurb: "Big, loyal, carries the shield and the debt." },
    { key: "monk", name: "Kira", race: "Human", class: "Monk", background: "Acolyte", ac: 14, str: 12, dex: 15, con: 13, int: 10, wis: 14, cha: 8, skills: "Acrobatics, Stealth, Insight", attacks: "Unarmed strike, +4, 1d4+2 bludgeoning\nQuarterstaff, +4, 1d6+2 bludgeoning", spells: "", features: "Unarmored Defense\nMartial Arts", inventory: "Quarterstaff\n10x Dart\nExplorer's Pack", image: HUB_URL + "assets/npc-kira.jpg", blurb: "Calm hands, fast feet." },
    { key: "paladin", name: "Ser Aldric", race: "Human", class: "Paladin", background: "Soldier", ac: 18, str: 15, dex: 10, con: 13, int: 8, wis: 12, cha: 14, skills: "Athletics, Religion, Persuasion", attacks: "Longsword, +4, 1d8+2 slashing", spells: "1st level: Cure Wounds, Bless", features: "Divine Sense\nLay on Hands", inventory: "Longsword\nShield\nChain mail\nHoly symbol\nExplorer's Pack", image: HUB_URL + "assets/npc-aldric.jpg", blurb: "An oath he keeps, even when it costs him." },
    { key: "ranger", name: "Sable", race: "Wood elf", class: "Ranger", background: "Outlander", ac: 14, str: 12, dex: 15, con: 13, int: 10, wis: 14, cha: 8, skills: "Perception, Survival, Stealth", attacks: "Longbow, +4, 1d8+2 piercing\nShortsword, +4, 1d6+2 piercing", spells: "", features: "Favored Enemy\nNatural Explorer", inventory: "Longbow\n20x Arrow\nShortsword\nStudded leather armor\nExplorer's Pack", image: HUB_URL + "assets/npc-sable.jpg", blurb: "Reads the ground like a letter." },
    { key: "rogue", name: "Nix", race: "Halfling", class: "Rogue", background: "Criminal", ac: 13, str: 8, dex: 15, con: 13, int: 14, wis: 12, cha: 10, skills: "Stealth, Sleight of Hand, Perception, Investigation", attacks: "Shortsword, +4, 1d6+2 piercing\nDagger, +4, 1d4+2 piercing\nShortbow, +4, 1d6+2 piercing", spells: "", features: "Sneak Attack\nThieves' Cant\nCunning Action", inventory: "Shortsword\nDagger\nShortbow\n20x Arrow\nThieves' tools\nLeather armor\nBurglar's Pack", image: HUB_URL + "assets/npc-nix.jpg", blurb: "Small, quick, already gone." },
    { key: "sorcerer", name: "Ember", race: "Tiefling", class: "Sorcerer", background: "Sage", ac: 11, str: 8, dex: 13, con: 14, int: 12, wis: 10, cha: 15, skills: "Arcana, Persuasion, Deception", attacks: "Dagger, +3, 1d4+1 piercing", spells: "Cantrips: Fire Bolt, Mage Hand, Prestidigitation\n1st level: Magic Missile, Burning Hands", features: "Spellcasting\nSorcerous Origin", inventory: "Dagger\nComponent pouch\nExplorer's Pack", image: HUB_URL + "assets/npc-ember.jpg", blurb: "The magic came first, the control came later." },
    { key: "warlock", name: "Morvain", race: "Half-elf", class: "Warlock", background: "Charlatan", ac: 13, str: 8, dex: 13, con: 14, int: 12, wis: 10, cha: 15, skills: "Arcana, Deception, Intimidation", attacks: "Dagger, +3, 1d4+1 piercing", spells: "Cantrips: Eldritch Blast, Minor Illusion\n1st level: Hex, Arms of Hadar", features: "Spellcasting\nOtherworldly Patron", inventory: "Dagger\nLeather armor\nComponent pouch\nExplorer's Pack", image: HUB_URL + "assets/npc-morvain.jpg", blurb: "Made a deal, won't say with who." },
    { key: "wizard", name: "Finn", race: "Gnome", class: "Wizard", background: "Sage", ac: 12, str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10, skills: "Arcana, Investigation", attacks: "Dagger, +4, 1d4+2 piercing", spells: "Cantrips: Fire Bolt, Mage Hand, Prestidigitation\n1st level: Sleep, Magic Missile, Detect Magic", features: "Darkvision\nGnome Cunning\nSpellcasting\nArcane Recovery", inventory: "Spellbook\nComponent pouch\nDagger\nExplorer's Pack", image: HUB_URL + "assets/npc-finn.jpg", blurb: "Quiet, clever, stays back by the trees until he's needed." }
  ];

  function npcRosterByKey(key) {
    for (var i = 0; i < NPC_ROSTER.length; i++) {
      if (NPC_ROSTER[i].key === key) return NPC_ROSTER[i];
    }
    return null;
  }

  function npcTargetLevel(rows) {
    var levels = rows.filter(function (r) { return !isNpcPlayer(r.player) && !r.dismissed; }).map(function (r) { return r.level || 1; });
    if (!levels.length) return 1;
    var sum = levels.reduce(function (a, b) { return a + b; }, 0);
    return Math.ceil(sum / levels.length);
  }

  function npcMaxHp(entry, level) {
    var die = HIT_DICE[entry.key] || 8;
    var conMod = abilityMod(entry.con);
    var perLevel = Math.ceil((die + 1) / 2) + conMod;
    return (die + conMod) + (level - 1) * perLevel;
  }

  async function syncNpcLevels(rows) {
    var target = npcTargetLevel(rows);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!isNpcPlayer(r.player) || r.dismissed) continue;
      var entry = npcRosterByKey(classKey(r.class));
      if (!entry) continue;
      var newMax = npcMaxHp(entry, target);
      if (r.level === target && r.max_hp === newMax) continue;
      var newHp = (r.hp || 0) + (newMax - (r.max_hp || 0));
      if (newHp < 0) newHp = 0;
      if (newHp > newMax) newHp = newMax;
      await db.from("characters").update({ level: target, max_hp: newMax, hp: newHp, updated_at: new Date().toISOString() }).eq("player", r.player);
      r.level = target;
      r.max_hp = newMax;
      r.hp = newHp;
    }
  }

  function partyCounts(rows) {
    var real = 0, npcs = 0;
    rows.forEach(function (r) {
      if (r.dismissed) return;
      if (isNpcPlayer(r.player)) npcs++;
      else real++;
    });
    return { real: real, npcs: npcs };
  }

  async function recruitmentLocked() {
    var res = await db.from("log_entries").select("id").or("is_mechanics.is.null,is_mechanics.eq.false").limit(1);
    if (res.error) return true;
    return !!(res.data && res.data.length);
  }

  function joinModeLabel(mode) {
    return mode === "story" ? "Met in the story" : "Started with the party";
  }

  function charCard(p, c) {
    var isNpc = isNpcPlayer(p.player);
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
    var inner =
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
      (isNpc ? '' : '<p>Gold: ' + (c.gold === null || c.gold === undefined ? "-" : c.gold) + '</p>') +
      '<p><strong>Inventory</strong></p>' + invHtml +
      (c.notes ? '<p><strong>Notes</strong></p><p>' + escapeHtml(c.notes) + '</p>' : '') +
      '<div class="actions"><button type="button" data-edit="' + p.player + '">Edit</button></div>';
    if (!isNpc) return '<div class="card sheet">' + inner + '</div>';
    var picHtml = c.image_url
      ? '<img class="npc-pic" src="' + escapeHtml(c.image_url) + '" alt="">'
      : '<div class="npc-pic npc-pic-fallback">' + escapeHtml((c.class || "?").charAt(0)) + '</div>';
    var joinHtml = c.join_mode ? '<span class="meta">' + escapeHtml(joinModeLabel(c.join_mode)) + '</span>' : '';
    return '<div class="card sheet npc">' +
      '<div class="npc-summary">' + picHtml +
      '<div class="npc-id"><span class="name">' + escapeHtml(c.name || "Unnamed") + '</span>' +
      '<span class="meta">' + escapeHtml(c.race || "") + (c.race && c.class ? " " : "") + escapeHtml(c.class || "") + ' - Level ' + (c.level === null || c.level === undefined ? "-" : c.level) + '</span>' +
      '<span class="meta">HP ' + hpText + (tempHp > 0 ? ' + ' + tempHp + ' temp' : '') + ' · AC ' + (c.ac === null || c.ac === undefined ? "-" : c.ac) + '</span>' +
      joinHtml + '</div>' +
      '<button type="button" class="hp-btn" data-hp-delta="-1" data-player="' + p.player + '">-</button>' +
      '<button type="button" class="hp-btn" data-hp-delta="1" data-player="' + p.player + '">+</button>' +
      '<button type="button" class="npc-toggle" data-npc-toggle="' + p.player + '">Full sheet</button>' +
      '</div>' +
      '<div class="npc-details hidden" data-npc-details="' + p.player + '">' + inner + '</div>' +
      '</div>';
  }

  function bindCharCards() {
    document.querySelectorAll("[data-npc-toggle]:not([data-npc-toggle^='roster-'])").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var details = document.querySelector('[data-npc-details="' + btn.dataset.npcToggle + '"]');
        if (!details) return;
        var hidden = details.classList.toggle("hidden");
        btn.textContent = hidden ? "Full sheet" : "Hide full sheet";
      });
    });
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
    $("char-gold-field").style.display = isNpcPlayer(player) ? "none" : "";
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
      gold: isNpcPlayer($("char-player").value) ? 0 : numOrNull($("char-gold").value),
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
    loadDiceRollers();
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

  function shortCharName(name) {
    var n = String(name || "").trim();
    if (!n) return "Someone";
    if (n === "Sylvara Dawnmere") return "Sylvie";
    if (n.indexOf("Sister ") === 0) return n.slice(7).split(" ")[0];
    return n.split(" ")[0];
  }

  // Who is rolling, by this phone. The push subscription label (for example
  // "Nathan's iphone") names the phone's owner, so the roller fills itself
  // in. The dropdown changes it when someone else is playing on this phone.
  async function detectDeviceRoller(names) {
    try {
      if (typeof pushRegistration === "undefined" || !pushRegistration) return null;
      var sub = await pushRegistration.pushManager.getSubscription();
      if (!sub) return null;
      var res = await db.from("push_subscriptions").select("label").eq("endpoint", sub.endpoint).limit(1);
      if (!res.data || !res.data.length) return null;
      var label = String(res.data[0].label || "").toLowerCase();
      if (!label) return null;
      var chars = await db.from("characters").select("player, name");
      if (chars.error || !chars.data) return null;
      for (var i = 0; i < chars.data.length; i++) {
        var player = String(chars.data[i].player || "").toLowerCase();
        if (player && label.indexOf(player) !== -1) {
          var short = shortCharName(chars.data[i].name);
          if (names.indexOf(short) !== -1) return short;
        }
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  async function loadDiceRollers() {
    var sel = $("dice-roller");
    if (!sel || !configured) return;
    var names = [];
    var res = await db.from("characters").select("name").eq("dismissed", false);
    if (!res.error && res.data) {
      res.data.forEach(function (c) {
        var short = shortCharName(c.name);
        if (names.indexOf(short) === -1) names.push(short);
      });
    }
    // The DM's party companions, who roll but are not character rows.
    ["cleric", "wizard", "fighter"].forEach(function (key) {
      var entry = npcRosterByKey(key);
      if (entry && names.indexOf(entry.name) === -1) names.push(entry.name);
    });
    names.push("DM");
    var cur = sel.value;
    sel.innerHTML = names.map(function (n) {
      return '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + '</option>';
    }).join("");
    var stored = null;
    try { stored = window.localStorage.getItem("hub-dice-roller"); } catch (e) {}
    var picked = null;
    if (cur && names.indexOf(cur) !== -1) {
      picked = cur;
    } else if (stored && names.indexOf(stored) !== -1) {
      picked = stored;
    } else {
      picked = await detectDeviceRoller(names);
      if (!picked) picked = names[0] || "DM";
    }
    sel.value = picked;
    try { window.localStorage.setItem("hub-dice-roller", picked); } catch (e) {}
  }

  function updateDiceMode() {
    var modeSel = $("dice-mode");
    if (!modeSel) return;
    var advOk = selectedCount === 1 && selectedDie === 20;
    modeSel.disabled = !advOk;
    if (!advOk) modeSel.value = "normal";
  }

  async function doRoll(e) {
    e.preventDefault();
    if (!configured) return setupNeeded();
    var roller = $("dice-roller").value || "Someone";
    var mod = numOrNull($("dice-mod").value) || 0;
    var mode = $("dice-mode").value;
    var count = selectedCount;
    var label = (count > 1 ? count : "") + "d" + selectedDie;
    var dice = [];
    var result, detail;
    if (selectedDie === 20 && count === 1 && (mode === "advantage" || mode === "disadvantage")) {
      var r1 = rollDie(20);
      var r2 = rollDie(20);
      var kept = mode === "advantage" ? Math.max(r1, r2) : Math.min(r1, r2);
      dice = [kept];
      result = kept + mod;
      detail = "d20 (" + mode + ") " + (mod >= 0 ? "+ " : "- ") + Math.abs(mod) + " = " + result + " [rolls " + r1 + ", " + r2 + "]";
    } else {
      for (var i = 0; i < count; i++) dice.push(rollDie(selectedDie));
      var sum = dice.reduce(function (a, b) { return a + b; }, 0);
      result = sum + mod;
      detail = label + " " + (mod >= 0 ? "+ " : "- ") + Math.abs(mod) + " = " + result + " [rolls " + dice.join(", ") + "]";
    }
    var box = $("dice-result");
    var rollBtn = document.querySelector(".roll-btn");
    box.classList.remove("hidden");
    box.innerHTML = '<div class="dice-faces">' + dice.map(function () {
      return '<span class="die-face rolling">' + rollDie(selectedDie) + '</span>';
    }).join("") + '</div>' + '<span class="big">...</span>' + '<span class="detail">Rolling...</span>';
    if (rollBtn) rollBtn.disabled = true;
    var faces = box.querySelectorAll(".die-face");
    var ticks = 0;
    var timer = setInterval(function () {
      ticks++;
      faces.forEach(function (f) { f.textContent = rollDie(selectedDie); });
      if (ticks < 9) return;
      clearInterval(timer);
      faces.forEach(function (f, i) {
        f.textContent = dice[i];
        f.classList.remove("rolling");
      });
      box.querySelector(".big").textContent = String(result);
      box.querySelector(".detail").textContent = detail;
      if (rollBtn) rollBtn.disabled = false;
      db.from("rolls").insert({
        roller: roller,
        label: label,
        result: result,
        detail: detail
      }).then(function (res) {
        if (res.error) {
          alert("Roll was made but could not be saved. Check the connection.");
          return;
        }
        loadRolls();
      });
    }, 80);
  }

  // ---------- Battle ----------

  // Battle state lives in the DB so the turn and round sync across devices
  // and follow the board: the DM updates combatant HP and this row as it
  // resolves actions, and the tracker reloads live.
  async function loadBattleState() {
    var res = await db.from("battle_state").select("current_combatant_id, round, area_map_url").eq("id", 1).single();
    if (res.error || !res.data) return; // table not there yet (SQL not run): local turn only
    battleState = res.data;
    battleStateReady = true;
  }

  async function saveBattleState() {
    if (!battleStateReady) return;
    await db.from("battle_state").update({
      current_combatant_id: battleState.current_combatant_id,
      round: battleState.round,
      updated_at: new Date().toISOString()
    }).eq("id", 1);
  }

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
    var wasActive = battleActive;
    battleActive = combatants.length > 0;
    await loadBattleState();
    if (battleStateReady) {
      var idx = combatants.findIndex(function (c) { return c.id === battleState.current_combatant_id; });
      currentTurn = idx >= 0 ? idx : 0;
    } else if (currentTurn >= combatants.length) {
      currentTurn = 0;
    }
    renderCombatants();
    if (battleActive !== wasActive) loadCurrentArea();
    updateMapView();
  }

  function renderCombatants() {
    var list = $("combatants-list");
    var roundEl = $("battle-round");
    if (roundEl) roundEl.textContent = combatants.length ? ("Round " + battleState.round) : "";
    if (!combatants.length) {
      list.innerHTML = '<p class="empty">No combatants yet. Add the fighters above.</p>';
      return;
    }
    list.innerHTML = combatants.map(function (c, i) {
      var isCurrent = i === currentTurn;
      return '<div class="card combatant' + (isCurrent ? " current" : "") + '">' +
        '<p class="title">' + escapeHtml(c.name) + ' ' +
        '<span class="init">(Init ' + c.initiative + ')</span> ' +
        '<span class="init">Speed ' + combatantSpeed(c) + ' ft</span>' +
        (isCurrent ? ' <span class="turn-tag">Current turn</span>' : '') + '</p>' +
        '<div class="hp-row"><span>HP</span><span class="hp">' + c.hp + ' / ' + c.max_hp + '</span>' +
        '<button type="button" class="hp-btn" data-combat-hp="-1" data-id="' + c.id + '">-</button>' +
        '<button type="button" class="hp-btn" data-combat-hp="1" data-id="' + c.id + '">+</button>' +
        '<input type="number" class="hp-amount" data-amount-id="' + c.id + '" placeholder="Amount" min="1" step="1">' +
        '<button type="button" class="hp-btn" data-combat-damage="' + c.id + '">Damage</button>' +
        '<button type="button" class="hp-btn" data-combat-heal="' + c.id + '">Heal</button></div>' +
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
    document.querySelectorAll("[data-combat-damage]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var input = document.querySelector('[data-amount-id="' + btn.dataset.combatDamage + '"]');
        var amt = input ? parseInt(input.value, 10) : NaN;
        if (!amt || amt <= 0) return;
        changeCombatantHp(btn.dataset.combatDamage, -amt);
      });
    });
    document.querySelectorAll("[data-combat-heal]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var input = document.querySelector('[data-amount-id="' + btn.dataset.combatHeal + '"]');
        var amt = input ? parseInt(input.value, 10) : NaN;
        if (!amt || amt <= 0) return;
        changeCombatantHp(btn.dataset.combatHeal, amt);
      });
    });
    document.querySelectorAll("[data-combat-delete]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        await db.from("combatants").delete().eq("id", btn.dataset.combatDelete);
        loadCombatants();
      });
    });
    renderAreaTokens();
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
      speed: numOrNull($("combatant-speed").value),
      side: $("combatant-side").value,
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

  async function nextTurn() {
    if (!combatants.length) return;
    var next = (currentTurn + 1) % combatants.length;
    if (next === 0) battleState.round += 1;
    currentTurn = next;
    battleState.current_combatant_id = combatants[currentTurn].id;
    await saveBattleState();
    renderCombatants();
  }

  async function clearBattle() {
    if (!configured) return setupNeeded();
    if (!combatants.length) return;
    if (!confirm("Clear the whole battle?")) return;
    await db.from("combatants").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    currentTurn = 0;
    battleState = { round: 1, current_combatant_id: null };
    await saveBattleState();
    loadCombatants();
  }

  // ---------- Maps ----------

  var MAP_COLS = 12;
  var MAP_ROWS = 8;
  var mapsList = [];
  var currentMapId = null;
  var mapCells = {};
  var mapMarkers = [];
  var partyLocations = [];
  var partyLocationsReady = false;
  var partyEntryTitle = "";
  var partyEntryDate = "";
  var PARTY_COLORS = ["#c9a227", "#6a9bd8", "#b678c9", "#7fb069"];
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
    loadPartyLocations();
    renderUnmarkedPlaces();
    loadCurrentArea();
    loadCombatants();
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
      var areaBtn = (mk.area_map_url && (mk.visited || placesEdit)) ? '<button type="button" class="area-map-btn" data-area-map="' + escapeHtml(mk.area_map_url) + '">View area map</button>' : "";
      return '<div class="card place-card" data-marker-id="' + mk.id + '">' + img +
        '<p class="title">' + escapeHtml(mk.label) + '</p>' +
        '<p class="meta">' + escapeHtml(mk.kind || "Place") + '</p>' +
        areaBtn +
        '<div class="actions"><button type="button" class="small-danger" data-marker-delete="' + mk.id + '">Delete</button></div></div>';
    }).join("");
    list.querySelectorAll(".place-card").forEach(function (card) {
      card.addEventListener("click", function () {
        highlightMapMarker(card.dataset.markerId);
      });
    });
    document.querySelectorAll("[data-area-map]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        openLightbox(btn.dataset.areaMap);
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
      var areaBtn = (n.area_map_url && (n.visited || placesEdit)) ? '<button type="button" class="area-map-btn" data-area-map="' + escapeHtml(n.area_map_url) + '">View area map</button>' : "";
      return '<div class="card place-card">' + img +
        '<p class="title">' + escapeHtml(n.name) + '</p>' +
        '<p>' + escapeHtml(n.notes || "") + '</p>' +
        areaBtn +
        '<div class="actions"><button type="button" class="small-danger" data-place-delete="' + n.id + '">Delete</button></div></div>';
    }).join("");
    list.querySelectorAll("[data-area-map]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        openLightbox(btn.dataset.areaMap);
      });
    });
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
      log_entries: function () { loadLogEntries(); loadCurrentArea(); },
      characters: loadCharacters,
      quests: loadQuests,
      npcs: loadNpcs,
      rolls: loadRolls,
      combatants: loadCombatants,
      battle_state: loadCombatants,
      maps: loadMaps,
      map_cells: loadMapView,
      map_markers: loadMapView,
      party_locations: function () { loadPartyLocations(); loadCurrentArea(); }
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
    renderMapMarkers();
    renderUnmarkedPlaces();
    renderAreaTokens();
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
    setupPartyLocations();
    setupLogAreaMap();

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
    $("map-view-world").addEventListener("click", function () {
      mapViewOverride = "world";
      setMapView("world");
    });
    $("map-view-area").addEventListener("click", function () {
      if (!currentAreaMapUrl) return;
      mapViewOverride = "area";
      setMapView("area");
    });
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
        updateDiceMode();
      });
    });

    document.querySelectorAll("#dice-count-buttons button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("#dice-count-buttons button").forEach(function (b) {
          b.classList.remove("selected");
        });
        btn.classList.add("selected");
        selectedCount = parseInt(btn.dataset.count, 10);
        updateDiceMode();
      });
    });

    $("dice-roller").addEventListener("change", function () {
      try { window.localStorage.setItem("hub-dice-roller", $("dice-roller").value); } catch (e) {}
    });

    updateDiceMode();

    loadMessages();
    setInterval(loadMessages, 15000);
    loadCombatants();
  }

  initGate();
})();
