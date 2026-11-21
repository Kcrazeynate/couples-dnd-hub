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
    list.innerHTML = res.data.map(function (entry) {
      return '<div class="card">' +
        '<p class="meta">' + escapeHtml(fmtTime(entry.created_at)) + '</p>' +
        '<p class="title">' + escapeHtml(entry.title) + '</p>' +
        '<p>' + escapeHtml(entry.body) + '</p>' +
        '</div>';
    }).join("");
  }

  async function addLogEntry(e) {
    e.preventDefault();
    if (!configured) return setupNeeded();
    var title = $("log-title").value.trim();
    var body = $("log-body").value.trim();
    if (!title || !body) return;
    var res = await db.from("log_entries").insert({ title: title, body: body });
    if (res.error) {
      alert("Could not add the entry. Check the connection and try again.");
      return;
    }
    $("log-title").value = "";
    $("log-body").value = "";
    loadLogEntries();
  }

  // ---------- Characters ----------

  var PLAYERS = [
    { player: "nathan", label: "Nathan's character" },
    { player: "angela", label: "Angela's character" }
  ];

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
    var players = PLAYERS.slice();
    var seen = {};
    players.forEach(function (p) { seen[p.player] = true; });
    res.data.forEach(function (c) {
      if (c.player && !seen[c.player]) {
        seen[c.player] = true;
        players.push({ player: c.player, label: labelFromPlayer(c.player) });
      }
    });
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

  function charCard(p, c) {
    var hpText = (c.hp === null || c.hp === undefined ? "-" : c.hp) +
      " / " + (c.max_hp === null || c.max_hp === undefined ? "-" : c.max_hp);
    var items = (c.inventory || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    var invHtml = items.length
      ? '<ul class="inventory">' + items.map(function (i) { return "<li>" + escapeHtml(i) + "</li>"; }).join("") + "</ul>"
      : '<p class="empty">No items yet.</p>';
    var skillItems = (c.skills || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    var skillsHtml = skillItems.length
      ? '<ul class="inventory">' + skillItems.map(function (s) { return "<li>" + escapeHtml(s) + "</li>"; }).join("") + "</ul>"
      : '<p class="empty">No skills yet.</p>';
    return '<div class="card">' +
      (c.image_url ? '<img class="char-img" src="' + escapeHtml(c.image_url) + '" alt="">' : '') +
      '<div class="char-head"><span class="name">' + escapeHtml(c.name || "Unnamed") + '</span>' +
      '<span class="level">' + escapeHtml(p.label) + '</span></div>' +
      '<p class="meta">' + escapeHtml(c.race || "") + (c.race && c.class ? " " : "") + escapeHtml(c.class || "") +
      ' - Level ' + (c.level === null || c.level === undefined ? "-" : c.level) +
      ' - AC ' + (c.ac === null || c.ac === undefined ? "-" : c.ac) + '</p>' +
      '<div class="hp-row"><span>HP</span><span class="hp">' + hpText + '</span>' +
      '<button type="button" class="hp-btn" data-hp-delta="-1" data-player="' + p.player + '">-</button>' +
      '<button type="button" class="hp-btn" data-hp-delta="1" data-player="' + p.player + '">+</button></div>' +
      '<div class="scores">' +
      scoreCell("STR", c.str) + scoreCell("DEX", c.dex) + scoreCell("CON", c.con) +
      scoreCell("INT", c.int) + scoreCell("WIS", c.wis) + scoreCell("CHA", c.cha) +
      '</div>' +
      (c.background ? '<p><strong>Background</strong></p><p>' + escapeHtml(c.background) + '</p>' : '') +
      '<p><strong>Skills</strong></p>' + skillsHtml +
      '<p>Gold: ' + (c.gold === null || c.gold === undefined ? "-" : c.gold) + '</p>' +
      '<p><strong>Inventory</strong></p>' + invHtml +
      (c.notes ? '<p><strong>Notes</strong></p><p>' + escapeHtml(c.notes) + '</p>' : '') +
      '<div class="actions"><button type="button" data-edit="' + p.player + '">Edit</button></div>' +
      '</div>';
  }

  function scoreCell(label, value) {
    return '<div class="score"><strong>' + label + '</strong>' +
      (value === null || value === undefined ? "-" : value) + '</div>';
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
  }

  async function changeCharHp(player, delta) {
    if (!configured) return setupNeeded();
    var res = await db.from("characters").select("hp, max_hp").eq("player", player).single();
    if (res.error || !res.data) return;
    var hp = (res.data.hp === null || res.data.hp === undefined) ? 0 : res.data.hp;
    hp += delta;
    if (hp < 0) hp = 0;
    if (res.data.max_hp !== null && res.data.max_hp !== undefined && hp > res.data.max_hp) hp = res.data.max_hp;
    await db.from("characters").update({ hp: hp, updated_at: new Date().toISOString() }).eq("player", player);
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
    $("char-str").value = c && c.str !== null && c.str !== undefined ? c.str : "";
    $("char-dex").value = c && c.dex !== null && c.dex !== undefined ? c.dex : "";
    $("char-con").value = c && c.con !== null && c.con !== undefined ? c.con : "";
    $("char-int").value = c && c.int !== null && c.int !== undefined ? c.int : "";
    $("char-wis").value = c && c.wis !== null && c.wis !== undefined ? c.wis : "";
    $("char-cha").value = c && c.cha !== null && c.cha !== undefined ? c.cha : "";
    $("char-skills").value = c ? (c.skills || "") : "";
    $("char-inventory").value = c ? (c.inventory || "") : "";
    $("char-notes").value = c ? (c.notes || "") : "";
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
      inventory: $("char-inventory").value.trim(),
      notes: $("char-notes").value.trim(),
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
      list.innerHTML = '<p class="error">Could not load NPCs and places.</p>';
      return;
    }
    if (!res.data.length) {
      list.innerHTML = '<p class="empty">Nothing here yet.</p>';
      return;
    }
    list.innerHTML = res.data.map(function (n) {
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
  var mapMode = "reveal";
  var npcsByName = {};
  var mapZoom = 1;
  var measureA = null;
  var measureB = null;
  var milesPerSquare = 12;
  try {
    var savedScale = parseFloat(localStorage.getItem("hub-map-scale"));
    if (savedScale && savedScale > 0) milesPerSquare = savedScale;
  } catch (e) {}

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
        npcsByName[(n.name || "").toLowerCase()] = n;
      });
    }
    closeMapTooltip();
    measureA = null;
    measureB = null;
    renderMapGrid();
    renderMapMarkers();
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
    var entry = npcsByName[(mk.label || "").toLowerCase()];
    var html = '<p class="tip-title">' + escapeHtml(mk.label) + '</p>';
    if (entry && entry.image_url) html += '<img class="tip-img" src="' + escapeHtml(entry.image_url) + '" alt="">';
    if (entry && entry.notes) html += '<p class="tip-notes">' + escapeHtml(entry.notes) + '</p>';
    tip.innerHTML = html;
    var wrap = $("map-wrap");
    var px = (mk.x + 0.5) / MAP_COLS * wrap.clientWidth;
    var clamped = Math.min(Math.max(px, 115), Math.max(115, wrap.clientWidth - 115));
    tip.style.left = clamped + "px";
    var topPct = (mk.y + 0.5) / MAP_ROWS * 100;
    tip.style.top = topPct.toFixed(2) + "%";
    tip.classList.toggle("below", topPct < 35);
    tip.classList.remove("hidden");
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
        toggleMapTooltip(el.dataset.markerId);
      });
    });
    var list = $("map-markers-list");
    if (!mapMarkers.length) {
      list.innerHTML = '<p class="empty">No places marked on this map yet.</p>';
      return;
    }
    list.innerHTML = mapMarkers.map(function (mk) {
      return '<div class="card"><p class="title">' + escapeHtml(mk.label) + '</p>' +
        '<p class="meta">' + escapeHtml(mk.kind || "Place") + '</p>' +
        '<div class="actions"><button type="button" class="small-danger" data-marker-delete="' + mk.id + '">Delete</button></div></div>';
    }).join("");
    document.querySelectorAll("[data-marker-delete]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!confirm("Delete this place?")) return;
        await db.from("map_markers").delete().eq("id", btn.dataset.markerDelete);
        loadMapView();
      });
    });
  }

  async function onMapCellClick(x, y) {
    if (!configured) return setupNeeded();
    var key = x + "," + y;
    closeMapTooltip();
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
      text.textContent = "Tap Measure, then tap two squares to see distance and travel time.";
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
      text.textContent = pointName(measureA) + " set. Tap a second square.";
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

  function setMapZoom(z) {
    mapZoom = Math.min(3, Math.max(1, Math.round(z * 2) / 2));
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

  // ---------- init ----------

  function initApp() {
    initDb();
    subscribeLive();

    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { switchTab(btn.dataset.tab); });
    });

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
          mapMode === "measure" ? "Tap two squares to measure the distance between them." :
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
