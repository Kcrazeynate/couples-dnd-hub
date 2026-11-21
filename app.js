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

    if (sessionStorage.getItem("dnd_hub_unlocked") === "1") {
      unlock();
      return;
    }

    function tryUnlock() {
      if (input.value === CONFIG.CAMPAIGN_PASSPHRASE) {
        sessionStorage.setItem("dnd_hub_unlocked", "1");
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
    battle: loadCombatants
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
      return '<div class="card">' +
        '<p class="meta">' + escapeHtml(m.author) + ' - ' + escapeHtml(fmtTime(m.created_at)) + '</p>' +
        '<p>' + escapeHtml(m.body) + '</p>' +
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
    list.innerHTML = PLAYERS.map(function (p) {
      var c = byPlayer[p.player];
      if (!c) return emptyCharCard(p);
      return charCard(p, c);
    }).join("");
    bindCharCards();
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
    $("char-modal-title").textContent = player === "nathan" ? "Nathan's character" : "Angela's character";
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
      return '<div class="card">' +
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
    if (!name) return;
    var res = await db.from("npcs").insert({ name: name, kind: kind, notes: notes });
    if (res.error) {
      alert("Could not add the entry. Check the connection and try again.");
      return;
    }
    $("npc-name").value = "";
    $("npc-notes").value = "";
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

  // ---------- init ----------

  function initApp() {
    initDb();

    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { switchTab(btn.dataset.tab); });
    });

    $("message-form").addEventListener("submit", postMessage);
    $("messages-refresh").addEventListener("click", loadMessages);
    $("log-form").addEventListener("submit", addLogEntry);
    $("char-form").addEventListener("submit", saveChar);
    $("char-cancel").addEventListener("click", closeCharModal);
    $("quest-form").addEventListener("submit", addQuest);
    $("npc-form").addEventListener("submit", addNpc);
    $("dice-form").addEventListener("submit", doRoll);
    $("combatant-form").addEventListener("submit", addCombatant);
    $("next-turn-btn").addEventListener("click", nextTurn);
    $("clear-battle-btn").addEventListener("click", clearBattle);

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
