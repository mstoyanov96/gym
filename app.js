// ============================================================
//  My Workout — vanilla JS PWA
//  State persisted in localStorage. No build step, no backend.
// ============================================================

const LS = {
  program: "gym_program",
  sessions: "gym_sessions",
  active: "gym_active",
  lang: "gym_lang",
  equipment: "gym_equipment",
};

// Sensible starting gym inventory (user edits it in the Equipment screen).
const DEFAULT_EQUIPMENT = {
  bar: 20,              // Olympic barbell weight (kg)
  dumbbellHandle: 2,    // weight of one empty dumbbell handle (kg)
  plates: [             // total plates owned (count is the full number, not pairs)
    { kg: 20, count: 4 },
    { kg: 15, count: 2 },
    { kg: 10, count: 4 },
    { kg: 5, count: 4 },
    { kg: 2.5, count: 4 },
    { kg: 1.25, count: 2 },
  ],
};

const state = {
  lang: I18N[load(LS.lang, "bg")] ? load(LS.lang, "bg") : "bg",
  program: load(LS.program, null) || clone(DEFAULT_PROGRAM),
  sessions: load(LS.sessions, []),        // [{date:"YYYY-MM-DD", dayId, dayName:{bg,en}, icon, exercises:[{name,setsDone,sets}]}]
  active: load(LS.active, null),          // {dayId, started, sets:{exId:count}, done:{exId:bool}}
  equipment: load(LS.equipment, null) || clone(DEFAULT_EQUIPMENT),
  tab: "workouts",
  view: { screen: "list", dayId: null, editing: false },
  calMonth: new Date().getFullYear() * 12 + new Date().getMonth(),
};

// Seed the default program on first run only. Never overwrite a stored program,
// so app updates (even with a newer default) can't wipe the user's edits.
if (!localStorage.getItem(LS.program)) {
  save(LS.program, state.program);
}
if (!localStorage.getItem(LS.equipment)) {
  save(LS.equipment, state.equipment);
}

// Migrate an in-progress session from the old set-counter model to per-set logs.
if (state.active && !state.active.log) {
  const d = state.program.days.find((x) => x.id === state.active.dayId);
  if (d) {
    const log = {};
    d.exercises.forEach((e) => {
      const cnt = (state.active.sets && state.active.sets[e.id]) || 0;
      log[e.id] = Array.from({ length: Number(e.sets) || 0 }, (_, i) => ({ weight: "", reps: "", done: i < cnt }));
    });
    state.active = { dayId: state.active.dayId, started: state.active.started, startedAt: state.active.startedAt || null, log };
    save(LS.active, state.active);
  } else {
    state.active = null; localStorage.removeItem(LS.active);
  }
}

// Deep clone of plain JSON data (works on all browsers, unlike structuredClone).
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
// Accept both "," and "." as decimal separator (iOS numeric keyboards type ",").
function fixDec(v) { return String(v ?? "").replace(",", "."); }
function num(v) { const n = Number(fixDec(v)); return Number.isFinite(n) ? n : NaN; }
function t() { return I18N[state.lang] || I18N.bg; }
function L(obj) {
  // Resolve a bilingual field (string or {bg,en}).
  if (obj == null) return "";
  if (typeof obj === "string") return obj;
  return obj[state.lang] ?? obj.bg ?? obj.en ?? "";
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtDuration(min) {
  if (min == null || min < 0 || isNaN(min)) return "";
  if (min < 60) return `${min} ${t().minShort}`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} ${t().hrShort} ${m} ${t().minShort}` : `${h} ${t().hrShort}`;
}

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// ---------- Day lookup ----------
function getDay(id) { return state.program.days.find((d) => d.id === id); }

// ============================================================
//  RENDER
// ============================================================
const viewEl = document.getElementById("view");

function render() {
  document.getElementById("appTitle").textContent = "🏋️ " + t().appTitle;
  document.getElementById("langToggle").textContent = state.lang === "bg" ? "EN" : "BG";
  document.documentElement.lang = state.lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t()[el.dataset.i18n];
  });
  document.querySelectorAll(".tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === state.tab)
  );

  if (state.tab === "calendar") return renderCalendar();
  if (state.view.screen === "detail") return renderDetail();
  return renderList();
}

// ---------- Workouts list ----------
function renderList() {
  const sessions = state.sessions;
  const streak = computeStreak();
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisMonth = sessions.filter((s) => s.date.startsWith(monthKey)).length;

  let html = `
    <div class="stats">
      <div class="stat"><div class="stat-num">${sessions.length}</div><div class="stat-label">${t().workoutsCount}</div></div>
      <div class="stat"><div class="stat-num">${thisMonth}</div><div class="stat-label">${t().thisMonth}</div></div>
      <div class="stat"><div class="stat-num">${streak}</div><div class="stat-label">${t().streak}</div></div>
    </div>
    <div class="section-title">${t().chooseDay}</div>
  `;

  html += state.program.days.map((d) => {
    const isResume = state.active && state.active.dayId === d.id;
    return `
      <div class="day-card ${isResume ? "resume" : ""}" data-day="${d.id}">
        ${isResume ? `<span class="resume-badge">${t().inProgress}</span>` : ""}
        <div class="day-emoji">${d.icon}</div>
        <div class="day-info">
          <div class="day-name">${L(d.name)}</div>
          <div class="day-focus">${L(d.focus)}</div>
          <div class="day-meta">${d.exercises.length} ${t().exercises} ${isResume ? "· " + t().resume : ""}</div>
        </div>
        <div class="day-chevron">›</div>
      </div>`;
  }).join("");

  html += `
    <div class="tools-row">
      <button class="btn-ghost" id="btnPlateCalc">🏋️ ${t().plateCalc}</button>
      <button class="btn-ghost" id="btnEquipment">⚙️ ${t().equipment}</button>
    </div>
    <div class="backup-row">
      <button class="btn-ghost" id="btnExport">⬇️ ${t().backup}</button>
      <label class="btn-ghost backup-label">⬆️ ${t().restore}
        <input type="file" id="fileImport" accept="application/json,.json" hidden />
      </label>
    </div>
    <div class="subtle backup-hint">${t().backupHint}</div>`;

  viewEl.innerHTML = html;
  viewEl.querySelectorAll(".day-card").forEach((c) =>
    c.addEventListener("click", () => openDay(c.dataset.day))
  );
  document.getElementById("btnPlateCalc").onclick = () => openPlateCalc("", "dumbbell");
  document.getElementById("btnEquipment").onclick = () => openEquipment();
  document.getElementById("btnExport").onclick = exportData;
  document.getElementById("fileImport").onchange = (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = "";
  };
}

function exportData() {
  const payload = {
    app: "my-workout", backupVersion: 1, exported: new Date().toISOString(),
    program: state.program, sessions: state.sessions, equipment: state.equipment,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `workout-backup-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.program?.days && !Array.isArray(data.sessions)) throw new Error("bad");
      if (!confirm(t().importConfirm)) return;
      if (data.program?.days) { state.program = data.program; save(LS.program, state.program); }
      if (Array.isArray(data.sessions)) { state.sessions = data.sessions; save(LS.sessions, state.sessions); }
      if (data.equipment?.plates) { state.equipment = data.equipment; save(LS.equipment, state.equipment); }
      toast(t().importDone);
      render();
    } catch {
      toast(t().importError);
    }
  };
  reader.readAsText(file);
}


function openDay(dayId) {
  // Just open the plan. The session starts only when the user taps Start.
  state.view = { screen: "detail", dayId, editing: false };
  history.pushState({ layer: "detail" }, "");
  render();
}

// ---------- Day detail (tracking) ----------
function renderDetail() {
  const day = getDay(state.view.dayId);
  if (!day) { state.view.screen = "list"; return render(); }
  const isActiveDay = state.active && state.active.dayId === day.id;
  const active = isActiveDay ? state.active : null;
  const started = !!active;
  const editing = state.view.editing;

  const totalSets = day.exercises.reduce((a, e) => a + Number(e.sets || 0), 0);
  const doneSets = day.exercises.reduce((a, e) => a + Math.min(doneCountFor(active, e), e.sets), 0);
  const pct = totalSets ? Math.round((doneSets / totalSets) * 100) : 0;

  let html = `
    <div class="detail-head">
      <button class="btn-back" id="btnBack">‹ ${t().back}</button>
      <button class="edit-toggle" id="btnEdit">${editing ? "✓ " + t().editDone : "✎ " + t().edit}</button>
    </div>
    <div class="detail-title">${day.icon} ${L(day.name)}</div>
    <div class="detail-focus">${L(day.focus)}</div>
  `;

  if (!editing && started) {
    html += `
      <div class="progress-wrap">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="progress-text">${doneSets}/${totalSets} ${t().sets.toLowerCase()} · ${pct}%</div>
      </div>`;
  }

  if (editing) {
    html += day.exercises.map((e) => exerciseEditCard(e)).join("");
  } else {
    html += `<div class="ex-list ${started ? "" : "preview"}">`;
    html += day.exercises.map((e) => exerciseTrackCard(e, active)).join("");
    html += `</div>`;
  }

  if (editing) {
    html += `<button class="add-ex-btn" id="btnAddEx">+ ${t().addExercise}</button>`;
    html += `<button class="btn-ghost" id="btnFindEx">🔍 ${t().findExercise}</button>`;
  } else if (!started) {
    html += `<button class="btn-primary" id="btnStart">▶ ${t().start}</button>`;
  } else {
    html += `
      <button class="btn-primary" id="btnFinish">${t().finish}</button>
      <button class="btn-ghost btn-danger" id="btnDiscard">${t().discard}</button>`;
  }

  viewEl.innerHTML = html;
  wireDetail(day, started);
}

function exerciseTrackCard(e, active) {
  const sets = (active && active.log && active.log[e.id]) || [];
  const doneCount = sets.filter((s) => s.done).length;
  const isDone = e.sets > 0 && doneCount >= e.sets;
  const rows = sets.map((s, i) => `
    <div class="set-row ${s.done ? "done" : ""}">
      <button class="set-num" data-toggle="${e.id}:${i}">${i + 1}</button>
      <input class="set-field set-weight" type="text" inputmode="decimal"
             placeholder="${s.pw || t().kg}" value="${s.weight ?? ""}" data-w="${e.id}:${i}" />
      <span class="set-mult">×</span>
      <input class="set-field set-reps" type="text" inputmode="numeric"
             placeholder="${s.pr || L(e.reps)}" value="${s.reps ?? ""}" data-r="${e.id}:${i}" />
    </div>`).join("");

  return `
    <div class="ex-card ${isDone ? "done" : ""}" data-card="${e.id}">
      <div class="ex-top" data-info="${e.id}">
        <div class="ex-thumb">${thumb(e)}</div>
        <div class="ex-main">
          <div class="ex-name">${L(e.name)}</div>
          <div class="ex-sub">${e.sets} × ${L(e.reps)} · ${t().muscles[e.muscle] || ""}</div>
          ${L(e.notes) ? `<div class="ex-notes">${L(e.notes)}</div>` : ""}
        </div>
        <button class="ex-check" data-check="${e.id}">${isDone ? "✓" : ""}</button>
      </div>
      ${sets.length ? `
      <div class="sets-head">
        <span>${t().setsDone}: ${doneCount}/${e.sets}</span>
        <span class="sets-headright">
          <span class="sets-colhead">${t().kg} × ${t().reps}</span>
          <button class="plate-btn" data-plate="${e.id}" title="${t().plateCalc}">🏋️</button>
        </span>
      </div>
      <div class="set-rows">${rows}</div>` : ""}
    </div>`;
}

// Public-domain exercise photos (free-exercise-db). Falls back to the muscle map on 404.
const EXDB_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";
function exImages(e) {
  if (e.img) return [e.img];
  if (e.exdb) return [EXDB_BASE + e.exdb + "/0.jpg", EXDB_BASE + e.exdb + "/1.jpg"];
  return [];
}
function thumb(e) {
  const imgs = exImages(e);
  if (imgs.length) return `<img src="${imgs[0]}" alt="" loading="eager" decoding="async" fetchpriority="high" onerror="this.parentElement.innerHTML='${escapeAttr(MUSCLE_SVG(e.muscle))}'">`;
  return MUSCLE_SVG(e.muscle);
}
function escapeAttr(s) { return s.replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/\n/g, ""); }

// Thumbnail for a logged (session) exercise. Uses its own stored image if present,
// otherwise falls back to the matching program exercise by id, then muscle art.
function sessionThumb(se) {
  if (se.img || se.exdb) return thumb(se);
  const prog = (state.program.days || []).flatMap((d) => d.exercises || []).find((e) => e.id === se.exId);
  return thumb(prog || se);
}

// ---------- Per-set tracking helpers ----------
function doneCountFor(active, e) {
  const arr = active && active.log && active.log[e.id];
  return arr ? arr.filter((s) => s.done).length : 0;
}
function lastLogFor(exId) {
  // Most recent logged sets for this exercise, to pre-fill the next workout.
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const ex = state.sessions[i].exercises?.find((x) => x.exId === exId);
    if (ex && ex.logs && ex.logs.length) return ex.logs;
  }
  return null;
}
function startActive(day) {
  const log = {};
  day.exercises.forEach((e) => {
    const prev = lastLogFor(e.id);
    const n = Number(e.sets) || 0;
    log[e.id] = Array.from({ length: n }, (_, i) => {
      const p = prev ? (prev[i] || prev[prev.length - 1]) : null;
      // Keep the actual value empty; show last time's numbers as a grey hint (pw/pr).
      return { weight: "", reps: "", pw: p ? (p.weight ?? "") : "", pr: p ? (p.reps ?? "") : "", done: false };
    });
  });
  state.active = { dayId: day.id, started: todayStr(), startedAt: Date.now(), log };
  save(LS.active, state.active);
}

// ---------- Exercise database search (free-exercise-db) ----------
const EXDB_INDEX = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
let exDbCache = null;
let exDbFailed = false;
const DB_MUSCLE_MAP = {
  chest: "chest",
  "middle back": "back", lats: "back", "lower back": "back", traps: "back",
  shoulders: "shoulders",
  biceps: "biceps", forearms: "biceps",
  triceps: "triceps",
  quadriceps: "quads", adductors: "quads", abductors: "quads",
  hamstrings: "hamstrings", glutes: "glutes", calves: "calves",
  abdominals: "core", neck: "shoulders",
};
function mapDbMuscle(m) { return DB_MUSCLE_MAP[String(m || "").toLowerCase()] || "core"; }

function openExerciseSearch(day) {
  openModal(`
    <div class="modal-title">${t().findExercise}</div>
    <input id="exSearchInput" class="ex-search-input" type="search" placeholder="${t().searchPlaceholder}" autocomplete="off" />
    <div id="exSearchResults" class="ex-search-results"></div>
    <button class="btn-ghost" id="modalClose" style="margin-top:14px">${t().close}</button>
  `);
  const input = document.getElementById("exSearchInput");
  const results = document.getElementById("exSearchResults");
  const run = () => renderSearchResults(day, input.value, results);
  input.oninput = run;
  run();                                  // show the user's own exercises right away
  if (exDbCache || exDbFailed) return;
  fetch(EXDB_INDEX)
    .then((r) => r.json())
    .then((data) => { exDbCache = data; exDbFailed = false; run(); })
    .catch(() => { exDbFailed = true; run(); });
}

// The user's own exercises across all days, de-duplicated by name.
function ownExercises() {
  const seen = new Set();
  const out = [];
  state.program.days.forEach((d) => d.exercises.forEach((e) => {
    const key = L(e.name).toLowerCase().trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(e);
  }));
  return out;
}

function renderSearchResults(day, q, container) {
  q = String(q || "").trim().toLowerCase();
  const terms = q ? q.split(/\s+/) : [];
  const match = (hay) => terms.every((tm) => hay.includes(tm));

  // 1) The user's own exercises (so an exercise added to one day is reusable in another).
  const own = ownExercises().filter((e) => {
    if (!q) return true;
    const hay = `${L(e.name)} ${t().muscles[e.muscle] || ""} ${e.muscle}`.toLowerCase();
    return match(hay);
  }).slice(0, 20);

  // 2) The external exercise library.
  let db = [];
  if (exDbCache) {
    const base = q
      ? exDbCache.filter((it) => match(`${it.name} ${(it.primaryMuscles || []).join(" ")} ${it.equipment || ""}`.toLowerCase()))
      : exDbCache;
    db = base.slice(0, 40);
  }

  const subtle = (txt) => `<div class="subtle" style="text-align:center;padding:16px">${txt}</div>`;
  let html = "";

  if (own.length) {
    html += `<div class="ex-search-section">${t().myExercises}</div>`;
    html += own.map((e, idx) => {
      const img = exImages(e)[0]
        ? `<img src="${exImages(e)[0]}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'">` : "";
      return `
        <div class="ex-search-item">
          <div class="ex-search-thumb">${img || MUSCLE_SVG(e.muscle)}</div>
          <div class="ex-search-info">
            <div class="ex-search-name">${escapeHtml(L(e.name))}</div>
            <div class="ex-search-meta">${escapeHtml(t().muscles[e.muscle] || "")}</div>
          </div>
          <button class="ex-search-add" data-add-own="${idx}">+ ${t().add}</button>
        </div>`;
    }).join("");
  }

  html += `<div class="ex-search-section">${t().exerciseLibrary}</div>`;
  if (exDbCache) {
    html += db.length
      ? db.map((it, idx) => {
          const img = (it.images && it.images[0])
            ? `<img src="${EXDB_BASE + it.images[0]}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'">` : "";
          const muscles = (it.primaryMuscles || []).join(", ");
          return `
            <div class="ex-search-item">
              <div class="ex-search-thumb">${img}</div>
              <div class="ex-search-info">
                <div class="ex-search-name">${escapeHtml(it.name)}</div>
                <div class="ex-search-meta">${escapeHtml(muscles)}${it.equipment ? " · " + escapeHtml(it.equipment) : ""}</div>
              </div>
              <button class="ex-search-add" data-add="${idx}">+ ${t().add}</button>
            </div>`;
        }).join("")
      : subtle(t().noResults);
  } else if (exDbFailed) {
    html += subtle(t().searchError);
  } else {
    html += subtle(t().loading);
  }

  container.innerHTML = html;
  container.querySelectorAll("[data-add-own]").forEach((btn) =>
    btn.onclick = () => addExerciseCopy(day, own[Number(btn.dataset.addOwn)])
  );
  container.querySelectorAll("[data-add]").forEach((btn) =>
    btn.onclick = () => addExerciseFromDb(day, db[Number(btn.dataset.add)])
  );
}

function addExerciseCopy(day, e) {
  if (!e) return;
  collectEdits(day);  // keep any unsaved edits that are open behind the modal
  day.exercises.push({
    id: "x" + Date.now(),
    muscle: e.muscle,
    exdb: e.exdb || "",
    name: clone(e.name),
    sets: e.sets, reps: e.reps,
    notes: clone(e.notes || { bg: "", en: "" }),
    steps: clone(e.steps || { bg: [], en: [] }),
    img: e.img || "",
  });
  save(LS.program, state.program);
  closeModal();
  toast(t().exerciseAdded);
  render();
}

function addExerciseFromDb(day, item) {
  collectEdits(day);  // keep any unsaved edits that are open behind the modal
  const folder = (item.images && item.images[0]) ? item.images[0].split("/")[0] : "";
  const steps = (item.instructions || []).slice();
  day.exercises.push({
    id: "x" + Date.now(),
    muscle: mapDbMuscle(item.primaryMuscles && item.primaryMuscles[0]),
    exdb: folder,
    name: { bg: item.name, en: item.name },
    sets: 3, reps: "8–12",
    notes: { bg: "", en: "" },
    steps: { bg: steps.slice(), en: steps.slice() },
    img: "",
  });
  save(LS.program, state.program);
  closeModal();
  toast(t().exerciseAdded);
  render();
}

function exerciseEditCard(e) {
  const muscleOpts = Object.keys(t().muscles).map((m) =>
    `<option value="${m}" ${m === e.muscle ? "selected" : ""}>${t().muscles[m]}</option>`
  ).join("");
  return `
    <details class="ex-card ex-edit-card" data-edit="${e.id}">
      <summary class="ex-edit-head">
        <span class="ex-drag" data-drag-handle title="${t().dragToReorder}">⠿</span>
        <span class="ex-edit-thumb">${thumb(e)}</span>
        <span class="ex-edit-name">${escapeHtml(L(e.name))}</span>
        <span class="ex-edit-caret">▸</span>
      </summary>
      <div class="ex-edit-body">
        <div class="field">
          <label>${t().name}</label>
          <input data-f="name" value="${escapeHtml(L(e.name))}" />
        </div>
        <div class="field-row">
          <div class="field"><label>${t().sets}</label><input data-f="sets" type="number" min="1" value="${e.sets}" /></div>
          <div class="field"><label>${t().reps}</label><input data-f="reps" value="${escapeHtml(L(e.reps))}" /></div>
        </div>
        <div class="field">
          <label>${t().targetMuscle}</label>
          <select data-f="muscle">${muscleOpts}</select>
        </div>
        <div class="field">
          <label>${t().notes}</label>
          <input data-f="notes" value="${escapeHtml(L(e.notes))}" />
        </div>
        <details class="field ex-edit-steps">
          <summary>${t().instructions}</summary>
          <textarea data-f="steps" rows="4">${escapeHtml(((e.steps && e.steps[state.lang]) || []).join("\n"))}</textarea>
        </details>
        <div class="field">
          <label>${t().imageUrl}</label>
          <input data-f="img" value="${escapeHtml(e.img || "")}" placeholder="https://..." />
        </div>
        <button class="btn-ghost btn-danger" data-del="${e.id}">🗑 ${t().deleteExercise}</button>
      </div>
    </details>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wireDetail(day, started) {
  document.getElementById("btnBack").onclick = () => history.back();
  document.getElementById("btnEdit").onclick = () => {
    if (state.view.editing) collectEdits(day);
    state.view.editing = !state.view.editing;
    render();
  };

  // Exercise info is available whether or not the workout is started.
  // Tapping anywhere in the card row (except the check button) opens it.
  viewEl.querySelectorAll(".ex-top[data-info]").forEach((el) =>
    el.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-check]")) return;
      openExerciseInfo(getEx(day, el.dataset.info));
    })
  );

  if (state.view.editing) {
    document.getElementById("btnFindEx").onclick = () => openExerciseSearch(day);
    document.getElementById("btnAddEx").onclick = () => {
      collectEdits(day);
      day.exercises.push({
        id: "x" + Date.now(),
        muscle: "chest",
        name: { bg: t().newExerciseName, en: I18N.en.newExerciseName },
        sets: 3, reps: "10–12", notes: { bg: "", en: "" }, steps: { bg: [], en: [] }, img: "",
      });
      save(LS.program, state.program);
      render();
    };
    viewEl.querySelectorAll("[data-del]").forEach((b) =>
      b.onclick = () => {
        if (confirm(t().deleteConfirm)) {
          collectEdits(day);
          day.exercises = day.exercises.filter((x) => x.id !== b.dataset.del);
          save(LS.program, state.program);
          render();
        }
      }
    );
    enableDragReorder(day);
    return;
  }

  // Not started yet: only wire the Start button.
  if (!started) {
    document.getElementById("btnStart").onclick = () => { startActive(day); render(); };
    return;
  }

  // Tracking interactions — per-set weight / reps and done toggles.
  viewEl.querySelectorAll(".set-num[data-toggle]").forEach((btn) =>
    btn.onclick = () => {
      const parts = btn.dataset.toggle.split(":");
      const row = state.active.log[parts[0]][Number(parts[1])];
      row.done = !row.done;
      if (row.done) {
        if (row.weight === "" || row.weight == null) row.weight = row.pw ?? "";
        if (row.reps === "" || row.reps == null) row.reps = row.pr ?? "";
      }
      save(LS.active, state.active);
      render();
    }
  );
  viewEl.querySelectorAll("[data-w]").forEach((inp) =>
    inp.oninput = () => {
      const parts = inp.dataset.w.split(":");
      state.active.log[parts[0]][Number(parts[1])].weight = fixDec(inp.value);
      save(LS.active, state.active);
    }
  );
  viewEl.querySelectorAll("[data-r]").forEach((inp) =>
    inp.oninput = () => {
      const parts = inp.dataset.r.split(":");
      state.active.log[parts[0]][Number(parts[1])].reps = fixDec(inp.value);
      save(LS.active, state.active);
    }
  );
  viewEl.querySelectorAll("[data-check]").forEach((btn) =>
    btn.onclick = () => {
      const arr = state.active.log[btn.dataset.check] || [];
      const allDone = arr.length > 0 && arr.every((s) => s.done);
      arr.forEach((s) => {
        s.done = !allDone;
        if (s.done) {
          if (s.weight === "" || s.weight == null) s.weight = s.pw ?? "";
          if (s.reps === "" || s.reps == null) s.reps = s.pr ?? "";
        }
      });
      save(LS.active, state.active);
      render();
    }
  );

  document.getElementById("btnFinish").onclick = () => finishWorkout(day);
  document.getElementById("btnDiscard").onclick = () => {
    if (confirm(t().discardConfirm)) {
      state.active = null; localStorage.removeItem(LS.active);
      state.view.screen = "list"; render();
    }
  };
  viewEl.querySelectorAll("[data-plate]").forEach((btn) =>
    btn.onclick = () => {
      const arr = (state.active.log && state.active.log[btn.dataset.plate]) || [];
      const src = arr.find((s) => s.weight) || arr.find((s) => s.pw) || arr[0];
      openPlateCalc(src ? (src.weight || src.pw || "") : "", "dumbbell");
    }
  );
}

function getEx(day, id) { return day.exercises.find((e) => e.id === id); }

// Touch/mouse drag-and-drop reordering of exercise cards in edit mode.
// The dragged card follows the finger; the displaced card glides (FLIP) into place.
function enableDragReorder(day) {
  let dragEl = null, startY = 0, lastY = 0, autoScroll = 0, raf = 0;
  const siblings = () => [...viewEl.querySelectorAll(".ex-card[data-edit]")];

  const glide = (el, fromDy) => {
    if (!fromDy) return;
    el.style.transition = "none";
    el.style.transform = `translateY(${fromDy}px)`;
    requestAnimationFrame(() => {
      el.style.transition = "transform .18s cubic-bezier(.2,.7,.3,1)";
      el.style.transform = "";
    });
  };

  // Swap the dragged card with a neighbour, keeping it visually under the finger.
  const swap = (sib, mutate) => {
    const sibTop = sib.getBoundingClientRect().top;
    const dragTop = dragEl.getBoundingClientRect().top;
    mutate();
    startY += dragEl.getBoundingClientRect().top - dragTop;   // compensate layout shift
    dragEl.style.transform = `translateY(${lastY - startY}px)`;
    glide(sib, sibTop - sib.getBoundingClientRect().top);
  };

  const reorder = () => {
    const list = siblings();
    const i = list.indexOf(dragEl);
    const center = dragEl.getBoundingClientRect().top + dragEl.offsetHeight / 2;
    const next = list[i + 1], prev = list[i - 1];
    if (next) {
      const r = next.getBoundingClientRect();
      if (center > r.top + r.height / 2) return swap(next, () => dragEl.parentNode.insertBefore(next, dragEl));
    }
    if (prev) {
      const r = prev.getBoundingClientRect();
      if (center < r.top + r.height / 2) return swap(prev, () => dragEl.parentNode.insertBefore(dragEl, prev));
    }
  };

  const tick = () => {
    if (autoScroll && dragEl) {
      window.scrollBy(0, autoScroll);
      startY -= autoScroll;                                   // keep card under finger while scrolling
      dragEl.style.transform = `translateY(${lastY - startY}px)`;
      reorder();
      raf = requestAnimationFrame(tick);
    } else raf = 0;
  };

  viewEl.querySelectorAll("[data-drag-handle]").forEach((handle) => {
    const card = handle.closest(".ex-card[data-edit]");
    // The handle lives inside the <summary>; dragging it must not toggle the card.
    handle.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); });
    handle.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      dragEl = card;
      startY = lastY = ev.clientY;
      card.classList.add("dragging");
      document.body.classList.add("reordering");

      const move = (e) => {
        lastY = e.clientY;
        dragEl.style.transform = `translateY(${lastY - startY}px)`;
        reorder();
        const m = 70, h = window.innerHeight;
        autoScroll = lastY < m ? -Math.ceil((m - lastY) / 5)
          : lastY > h - m ? Math.ceil((lastY - (h - m)) / 5) : 0;
        if (autoScroll && !raf) raf = requestAnimationFrame(tick);
      };
      const up = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        document.removeEventListener("pointercancel", up);
        autoScroll = 0;
        card.classList.remove("dragging");
        document.body.classList.remove("reordering");
        // Settle the card into its slot, then persist the new order.
        dragEl.style.transition = "transform .18s cubic-bezier(.2,.7,.3,1)";
        dragEl.style.transform = "";
        const el = dragEl;
        dragEl = null;
        setTimeout(() => { el.style.transition = ""; commitOrder(day); }, 170);
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
      document.addEventListener("pointercancel", up);
    });
  });
}

function commitOrder(day) {
  collectEdits(day);  // preserve any in-progress field edits before re-rendering
  const order = [...viewEl.querySelectorAll(".ex-card[data-edit]")].map((c) => c.dataset.edit);
  day.exercises.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  save(LS.program, state.program);
  render();
}

function collectEdits(day) {
  viewEl.querySelectorAll("[data-edit]").forEach((card) => {
    const ex = getEx(day, card.dataset.edit);
    if (!ex) return;
    const get = (f) => card.querySelector(`[data-f="${f}"]`)?.value ?? "";
    setLang(ex, "name", get("name"));
    ex.sets = Math.max(1, Number(get("sets")) || 1);
    setLang(ex, "reps", get("reps"));
    ex.muscle = get("muscle");
    setLang(ex, "notes", get("notes"));
    ex.img = get("img").trim();
    setSteps(ex, get("steps"));
  });
  save(LS.program, state.program);
}
function setSteps(ex, text) {
  const arr = String(text).split("\n").map((s) => s.trim()).filter(Boolean);
  if (!ex.steps || typeof ex.steps !== "object") ex.steps = { bg: [], en: [] };
  ex.steps[state.lang] = arr;
  const other = state.lang === "bg" ? "en" : "bg";
  if (!Array.isArray(ex.steps[other])) ex.steps[other] = [];
}
function setLang(obj, field, val) {
  // Edit the field in the currently active language, keep the other side.
  const cur = obj[field];
  if (typeof cur === "object" && cur) cur[state.lang] = val;
  else obj[field] = state.lang === "bg" ? { bg: val, en: val } : { bg: val, en: val };
}

function finishWorkout(day) {
  const active = state.active;
  const anyDone = day.exercises.some((e) => (active.log[e.id] || []).some((s) => s.done));
  if (!anyDone) { toast(state.lang === "bg" ? "Отбележи поне едно упражнение" : "Mark at least one exercise"); return; }
  if (!confirm(t().finishConfirm)) return;

  const endedAt = Date.now();
  const durationMin = active.startedAt ? Math.max(0, Math.round((endedAt - active.startedAt) / 60000)) : null;
  const session = {
    date: todayStr(),
    dayId: day.id,
    dayName: { bg: day.name.bg, en: day.name.en },
    icon: day.icon,
    startedAt: active.startedAt || null,
    endedAt,
    durationMin,
    exercises: day.exercises.map((e) => {
      const arr = active.log[e.id] || [];
      return {
        exId: e.id,
        name: { bg: e.name.bg || L(e.name), en: e.name.en || L(e.name) },
        img: e.img, exdb: e.exdb, muscle: e.muscle,
        sets: e.sets,
        setsDone: arr.filter((s) => s.done).length,
        logs: arr.map((s) => ({ weight: s.weight, reps: s.reps, done: s.done })),
      };
    }),
  };
  state.sessions.push(session);
  save(LS.sessions, state.sessions);
  state.active = null; localStorage.removeItem(LS.active);
  state.view.screen = "list";
  toast(t().savedToCalendar);
  state.tab = "calendar";
  state.calMonth = new Date().getFullYear() * 12 + new Date().getMonth();
  render();
}

function computeStreak() {
  if (!state.sessions.length) return 0;
  const dates = new Set(state.sessions.map((s) => s.date));
  let streak = 0;
  const d = new Date();
  // Count consecutive days back from today that have a workout.
  for (;;) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (dates.has(key)) { streak++; d.setDate(d.getDate() - 1); }
    else if (streak === 0 && key === todayStr()) { d.setDate(d.getDate() - 1); } // allow no workout today yet
    else break;
  }
  return streak;
}

// ---------- Exercise info modal ----------
function openExerciseInfo(e) {
  const imgs = exImages(e);
  const gallery = imgs.length
    ? `<div class="modal-gallery">${imgs.map((u) => `<img src="${u}" alt="" loading="lazy" onerror="this.remove()">`).join("")}</div>`
    : "";
  const steps = (e.steps && e.steps[state.lang]) || e.steps?.bg || [];
  const howBlock = steps.length
    ? `<ol class="how-steps">${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>`
    : (L(e.notes) ? `<div>${L(e.notes)}</div>` : "");
  const tip = steps.length && L(e.notes) ? `<div class="how-tip">💡 ${L(e.notes)}</div>` : "";
  openModal(`
    <div class="modal-title">${L(e.name)}</div>
    <span class="muscle-tag">🎯 ${t().muscles[e.muscle] || ""}</span>
    ${gallery}
    <div class="modal-section-label">${t().howTo}</div>
    ${howBlock}
    ${tip}
    <div class="modal-section-label">${t().sets} / ${t().reps}</div>
    <div>${e.sets} × ${L(e.reps)}</div>
    <div class="modal-section-label">${t().targetMuscle}</div>
    <div class="modal-img">${MUSCLE_SVG(e.muscle)}</div>
    <button class="btn-ghost" id="modalClose" style="margin-top:16px">${t().close}</button>
  `);
}

// ============================================================
//  EQUIPMENT + PLATE CALCULATOR
// ============================================================
function saveEquipment() { save(LS.equipment, state.equipment); }
function fmtKg(n) { return Number.isInteger(n) ? String(n) : String(Number(Number(n).toFixed(2))); }

function sortedPlates() {
  return (state.equipment.plates || [])
    .map((p) => ({ kg: Number(p.kg) || 0, count: Math.max(0, Math.floor(Number(p.count) || 0)) }))
    .filter((p) => p.kg > 0 && p.count > 0)
    .sort((a, b) => b.kg - a.kg);
}

// Greedy plate loading for ONE side of a symmetric load (barbell side / dumbbell end).
function calcPlates(target, base) {
  const tw = Number(target), b = Number(base) || 0;
  if (!(tw > 0)) return { empty: true, perSide: [], loaded: b };
  const perSideTarget = (tw - b) / 2;
  if (perSideTarget < -1e-9) return { under: true, perSide: [], loaded: b };
  if (perSideTarget < 1e-9) return { ok: true, perSide: [], loaded: b };
  const avail = sortedPlates().map((p) => ({ kg: p.kg, pairs: Math.floor(p.count / 2) }));
  let rem = perSideTarget;
  const perSide = [];
  for (const p of avail) {
    while (p.pairs > 0 && rem >= p.kg - 1e-9) { perSide.push(p.kg); rem -= p.kg; p.pairs--; }
  }
  const loaded = b + perSide.reduce((a, c) => a + c, 0) * 2;
  return { ok: Math.abs(loaded - tw) < 1e-9, perSide, loaded };
}

let plateCalc = null;  // { weight, mode:"bar"|"dumbbell" }
function openPlateCalc(weight, mode) {
  plateCalc = { weight: weight != null && weight !== "" ? Number(weight) : "", mode: mode || "dumbbell" };
  renderPlateCalc();
}
function renderPlateCalc() {
  const eq = state.equipment;
  const base = plateCalc.mode === "bar" ? Number(eq.bar) || 0 : Number(eq.dumbbellHandle) || 0;
  const res = plateCalc.weight === "" ? null : calcPlates(plateCalc.weight, base);
  let resultHtml;
  if (!res) {
    resultHtml = `<div class="subtle" style="padding:8px 0">${t().plateEnterWeight}</div>`;
  } else if (res.under) {
    resultHtml = `<div class="plate-note">${t().plateBelowBar} (${fmtKg(base)} ${t().kg})</div>`;
  } else if (!res.perSide.length) {
    resultHtml = `<div class="plate-note">${t().plateJustBar} (${fmtKg(base)} ${t().kg})</div>`;
  } else {
    const chips = res.perSide.map((kg) => `<span class="plate-chip">${fmtKg(kg)}</span>`).join("");
    const summary = res.ok
      ? `<div class="plate-ok">✓ ${t().plateExact}: ${fmtKg(res.loaded)} ${t().kg}</div>`
      : `<div class="plate-note">≈ ${fmtKg(res.loaded)} ${t().kg} — ${t().plateClosest}</div>`;
    resultHtml = `
      <div class="plate-side-label">${t().platePerSide}</div>
      <div class="plate-chips">${chips}</div>
      ${summary}`;
  }
  openModal(`
    <div class="modal-title">🏋️ ${t().plateCalc}</div>
    <div class="seg">
      <button class="seg-btn ${plateCalc.mode === "dumbbell" ? "active" : ""}" data-mode="dumbbell">${t().dumbbell}</button>
      <button class="seg-btn ${plateCalc.mode === "bar" ? "active" : ""}" data-mode="bar">${t().barbell}</button>
    </div>
    <div class="field">
      <label>${t().targetWeight} (${t().kg})</label>
      <input id="plateWeight" type="text" inputmode="decimal" value="${plateCalc.weight}" />
    </div>
    <div class="plate-result">${resultHtml}</div>
    <div class="subtle" style="margin-top:10px">${plateCalc.mode === "bar" ? t().barbell : t().dumbbell}: ${fmtKg(base)} ${t().kg}</div>
    <button class="btn-ghost" id="openEquip" style="margin-top:12px">⚙️ ${t().editEquipment}</button>
    <button class="btn-ghost" id="modalClose" style="margin-top:8px">${t().close}</button>
  `);
  document.querySelectorAll(".seg-btn[data-mode]").forEach((b) =>
    b.onclick = () => { plateCalc.mode = b.dataset.mode; renderPlateCalc(); }
  );
  const wInput = document.getElementById("plateWeight");
  wInput.oninput = () => { plateCalc.weight = wInput.value === "" ? "" : num(wInput.value); renderPlateCalc(); };
  document.getElementById("openEquip").onclick = () => openEquipment();
}

function openEquipment() { renderEquipment(); }
function renderEquipment() {
  const eq = state.equipment;
  const plateRows = (eq.plates || []).map((p, i) => `
    <div class="equip-row">
      <input class="equip-kg" type="text" inputmode="decimal" value="${p.kg}" data-pk="${i}" placeholder="${t().kg}" />
      <span class="equip-x">×</span>
      <input class="equip-count" type="text" inputmode="numeric" value="${p.count}" data-pc="${i}" placeholder="${t().count}" />
      <button class="icon-btn" data-prm="${i}" title="${t().deleteExercise}">🗑</button>
    </div>`).join("");
  openModal(`
    <div class="modal-title">⚙️ ${t().equipment}</div>
    <div class="field-row">
      <div class="field"><label>${t().barWeight} (${t().kg})</label><input id="eqBar" type="text" inputmode="decimal" value="${eq.bar}" /></div>
      <div class="field"><label>${t().handleWeight} (${t().kg})</label><input id="eqHandle" type="text" inputmode="decimal" value="${eq.dumbbellHandle}" /></div>
    </div>
    <div class="modal-section-label">${t().plates} (${t().kg} × ${t().count})</div>
    <div class="subtle" style="margin-bottom:8px">${t().platesHint}</div>
    <div id="equipPlates">${plateRows}</div>
    <button class="btn-ghost" id="eqAdd" style="margin-top:6px">+ ${t().addPlate}</button>
    <div class="modal-actions">
      <button class="btn-primary" id="eqSave">✓ ${t().saveLabel}</button>
      <button class="btn-ghost" id="modalClose">${t().close}</button>
    </div>
  `);
  const collect = () => {
    const eqn = state.equipment;
    eqn.bar = num(document.getElementById("eqBar").value) || 0;
    eqn.dumbbellHandle = num(document.getElementById("eqHandle").value) || 0;
    document.querySelectorAll("[data-pk]").forEach((inp) => {
      const i = Number(inp.dataset.pk); if (eqn.plates[i]) eqn.plates[i].kg = num(inp.value) || 0;
    });
    document.querySelectorAll("[data-pc]").forEach((inp) => {
      const i = Number(inp.dataset.pc); if (eqn.plates[i]) eqn.plates[i].count = Math.max(0, Math.floor(num(inp.value) || 0));
    });
  };
  document.getElementById("eqAdd").onclick = () => { collect(); state.equipment.plates.push({ kg: 0, count: 0 }); renderEquipment(); };
  document.querySelectorAll("[data-prm]").forEach((b) =>
    b.onclick = () => { collect(); state.equipment.plates.splice(Number(b.dataset.prm), 1); renderEquipment(); }
  );
  document.getElementById("eqSave").onclick = () => {
    collect();
    state.equipment.plates = state.equipment.plates.filter((p) => p.kg > 0 && p.count > 0).sort((a, b) => b.kg - a.kg);
    saveEquipment();
    toast(t().saved);
    closeModal();
  };
}

// ============================================================
//  CALENDAR
// ============================================================
function renderCalendar() {
  const year = Math.floor(state.calMonth / 12);
  const month = state.calMonth % 12;
  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7;          // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDate = {};
  state.sessions.forEach((s) => { (byDate[s.date] ||= []).push(s); });

  let cells = "";
  for (let i = 0; i < startDow; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let dnum = 1; dnum <= daysInMonth; dnum++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(dnum).padStart(2, "0")}`;
    const list = byDate[key] || [];
    const isToday = key === todayStr();
    const more = list.length > 1 ? `<span class="cal-ic-more">${list.length}</span>` : "";
    cells += `
      <div class="cal-cell ${list.length ? "has-workout" : ""} ${isToday ? "today" : ""}" data-date="${key}">
        <span class="cal-num">${dnum}</span>
        ${list.length ? `<span class="cal-ic">${list[0].icon}${more}</span>` : ""}
      </div>`;
  }

  const dow = t().weekdays.map((w) => `<div class="cal-dow">${w}</div>`).join("");
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthDates = Object.keys(byDate).filter((d) => d.startsWith(monthKey)).sort();
  const monthSessions = state.sessions.filter((s) => s.date.startsWith(monthKey));
  const monthCount = monthSessions.length;
  const durs = monthSessions.map((s) => s.durationMin).filter((x) => typeof x === "number" && x >= 0);
  const avgMin = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;

  const overview = monthDates.length
    ? monthDates.map((d) => {
        const parts = d.split("-").map(Number);
        const dd = parts[2];
        const wd = t().weekdays[(new Date(parts[0], parts[1] - 1, dd).getDay() + 6) % 7];
        return byDate[d].map((s) => {
          const done = s.exercises.filter((e) => e.setsDone > 0).length;
          const total = s.exercises.length;
          return `
            <div class="cal-list-item" data-date="${d}">
              <span class="cal-list-date"><b>${dd}</b><span>${wd}</span></span>
              <span class="cal-list-emoji">${s.icon}</span>
              <span class="cal-list-name">${L(s.dayName)}</span>
              <span class="cal-list-meta">${done}/${total}</span>
            </div>`;
        }).join("");
      }).join("")
    : `<div class="subtle" style="text-align:center;padding:16px 0">${t().nothingLogged}</div>`;

  viewEl.innerHTML = `
    <div class="cal-head">
      <button class="cal-nav" id="calPrev">‹</button>
      <div class="cal-month">${t().months[month]} ${year}</div>
      <button class="cal-nav" id="calNext">›</button>
    </div>
    <div class="subtle" style="text-align:center;margin-bottom:14px">${monthCount} ${t().workoutsCount}${avgMin != null ? ` · ${t().avgTime}: ${fmtDuration(avgMin)}` : ""}</div>
    <div class="cal-grid">${dow}${cells}</div>
    <div class="section-title" style="margin-top:22px">${t().loggedWorkouts}</div>
    <div class="cal-list">${overview}</div>
  `;

  document.getElementById("calPrev").onclick = () => { state.calMonth--; render(); };
  document.getElementById("calNext").onclick = () => { state.calMonth++; render(); };
  viewEl.querySelectorAll(".cal-cell[data-date]").forEach((c) =>
    c.onclick = () => openDayLog(c.dataset.date, byDate[c.dataset.date] || [])
  );
  viewEl.querySelectorAll(".cal-list-item[data-date]").forEach((c) =>
    c.onclick = () => openDayLog(c.dataset.date, byDate[c.dataset.date] || [])
  );
}

function openDayLog(date, list) {
  const [y, m, d] = date.split("-").map(Number);
  const title = `${d} ${t().months[m - 1]} ${y}`;
  let body;
  if (!list.length) {
    body = `<div class="empty-state"><div class="big">🛌</div>${t().nothingLogged}</div>`;
  } else {
    body = list.map((s) => {
      const idx = state.sessions.indexOf(s);
      const done = s.exercises.filter((e) => e.setsDone > 0).length;
      const total = s.exercises.length;
      const dur = fmtDuration(s.durationMin);
      const exLines = s.exercises.map((e) => {
        let chips = "";
        if (e.logs && e.logs.length) {
          const doneSets = e.logs.filter((l) => l.done && (l.weight || l.reps));
          if (doneSets.length) {
            chips = `<div class="log-set-chips">` + doneSets.map((l) =>
              `<span class="log-set-chip">${l.weight || "–"}${t().kg}<span class="log-set-x">×</span>${l.reps || "–"}</span>`
            ).join("") + `</div>`;
          }
        }
        const full = e.setsDone >= e.sets;
        return `
          <div class="log-ex">
            <span class="log-ex-thumb">${sessionThumb(e)}</span>
            <div class="log-ex-body">
              <div class="log-ex-top">
                <span class="log-ex-name">${L(e.name)}</span>
                <span class="log-ex-sets ${full ? "full" : ""}">${e.setsDone}/${e.sets}</span>
              </div>
              ${chips}
            </div>
          </div>`;
      }).join("");
      return `
        <div class="log-card">
          <div class="log-card-head">
            <span class="log-emoji">${s.icon}</span>
            <span class="log-name">${L(s.dayName)}</span>
            <span class="log-badge">${done}/${total}</span>
          </div>
          ${dur ? `<div class="log-stats"><span class="log-stat">⏱ ${dur}</span></div>` : ""}
          <div class="log-ex-list">${exLines}</div>
          <div class="log-actions">
            <button class="btn-ghost btn-sm" data-edit-sess="${idx}">✎ ${t().edit}</button>
            <button class="btn-ghost btn-sm btn-danger" data-del-sess="${idx}">🗑 ${t().deleteExercise}</button>
          </div>
        </div>`;
    }).join("");
  }
  openModal(`
    <div class="modal-title">${title}</div>
    <div class="modal-section-label">${t().loggedWorkouts}</div>
    ${body}
    <button class="btn-ghost" id="modalClose" style="margin-top:16px">${t().close}</button>
  `);
  document.querySelectorAll("[data-del-sess]").forEach((b) =>
    b.onclick = () => {
      if (!confirm(t().deleteWorkoutConfirm)) return;
      state.sessions.splice(Number(b.dataset.delSess), 1);
      save(LS.sessions, state.sessions);
      toast(t().saved);
      render();
      const rest = state.sessions.filter((s) => s.date === date);
      if (rest.length) openDayLog(date, rest); else closeModal();
    }
  );
  document.querySelectorAll("[data-edit-sess]").forEach((b) =>
    b.onclick = () => openSessionEdit(date, Number(b.dataset.editSess))
  );
}

let sessEdit = null;
function openSessionEdit(date, idx) {
  sessEdit = { date, idx, data: clone(state.sessions[idx]) };
  renderSessionEdit();
}
function renderSessionEdit() {
  const s = sessEdit.data;
  const rows = s.exercises.map((e, i) => {
    let body;
    if (e.logs && e.logs.length) {
      body = `<div class="set-rows">` + e.logs.map((l, k) => `
        <div class="set-row ${l.done ? "done" : ""}">
          <button class="set-num" data-toggle="${i}:${k}">${k + 1}</button>
          <input class="set-field set-weight" type="text" inputmode="decimal" placeholder="${t().kg}" value="${l.weight ?? ""}" data-w="${i}:${k}" />
          <span class="set-mult">×</span>
          <input class="set-field set-reps" type="text" inputmode="numeric" placeholder="${t().reps}" value="${l.reps ?? ""}" data-r="${i}:${k}" />
        </div>`).join("") + `</div>`;
    } else {
      const dots = Array.from({ length: Number(e.sets) || 0 }, (_, k) =>
        `<div class="set-dot ${k < e.setsDone ? "filled" : ""}" data-exi="${i}" data-set="${k + 1}">${k + 1}</div>`
      ).join("");
      body = `<div class="sets-label">${t().setsDone}: ${e.setsDone}/${e.sets}</div><div class="set-dots">${dots}</div>`;
    }
    return `
      <div class="log-edit-row">
        <div class="log-edit-head">
          <span class="log-name">${L(e.name)}</span>
          <button class="icon-btn" data-rm-ex="${i}" title="${t().deleteExercise}">🗑</button>
        </div>
        ${body}
      </div>`;
  }).join("");
  openModal(`
    <div class="modal-title">${t().editWorkout}</div>
    <div class="log-name" style="margin-bottom:10px">${s.icon} ${L(s.dayName)}</div>
    ${rows || `<div class="subtle">${t().nothingLogged}</div>`}
    <div class="modal-actions">
      <button class="btn-primary" id="sessSave">✓ ${t().editDone}</button>
      <button class="btn-ghost" id="sessCancel">${t().close}</button>
    </div>
  `);
  document.querySelectorAll(".modal .set-dot").forEach((dot) =>
    dot.onclick = () => {
      const i = Number(dot.dataset.exi), n = Number(dot.dataset.set);
      const ex = sessEdit.data.exercises[i];
      ex.setsDone = ex.setsDone === n ? n - 1 : n;
      renderSessionEdit();
    }
  );
  document.querySelectorAll(".modal .set-num[data-toggle]").forEach((btn) =>
    btn.onclick = () => {
      const parts = btn.dataset.toggle.split(":").map(Number);
      const ex = sessEdit.data.exercises[parts[0]];
      ex.logs[parts[1]].done = !ex.logs[parts[1]].done;
      ex.setsDone = ex.logs.filter((x) => x.done).length;
      renderSessionEdit();
    }
  );
  document.querySelectorAll(".modal [data-w]").forEach((inp) =>
    inp.oninput = () => {
      const parts = inp.dataset.w.split(":").map(Number);
      sessEdit.data.exercises[parts[0]].logs[parts[1]].weight = fixDec(inp.value);
    }
  );
  document.querySelectorAll(".modal [data-r]").forEach((inp) =>
    inp.oninput = () => {
      const parts = inp.dataset.r.split(":").map(Number);
      sessEdit.data.exercises[parts[0]].logs[parts[1]].reps = fixDec(inp.value);
    }
  );
  document.querySelectorAll("[data-rm-ex]").forEach((b) =>
    b.onclick = () => {
      sessEdit.data.exercises.splice(Number(b.dataset.rmEx), 1);
      renderSessionEdit();
    }
  );
  document.getElementById("sessSave").onclick = () => {
    const { idx, date, data } = sessEdit;
    if (!data.exercises.length) state.sessions.splice(idx, 1);
    else state.sessions[idx] = data;
    save(LS.sessions, state.sessions);
    sessEdit = null;
    toast(t().saved);
    render();
    const rest = state.sessions.filter((s) => s.date === date);
    if (rest.length) openDayLog(date, rest); else closeModal();
  };
  document.getElementById("sessCancel").onclick = () => {
    const date = sessEdit.date;
    sessEdit = null;
    const rest = state.sessions.filter((s) => s.date === date);
    if (rest.length) openDayLog(date, rest); else closeModal();
  };
}

// ============================================================
//  MODAL helper
// ============================================================
let backdrop;
let modalOpen = false;
function ensureBackdrop() {
  if (backdrop) return backdrop;
  backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal" id="modalBox"></div>`;
  document.body.appendChild(backdrop);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
  return backdrop;
}
function openModal(html) {
  ensureBackdrop();
  document.getElementById("modalBox").innerHTML = html;
  if (!modalOpen) { modalOpen = true; history.pushState({ layer: "modal" }, ""); }
  backdrop.classList.add("open");
  const close = document.getElementById("modalClose");
  if (close) close.onclick = closeModal;
}
// User-initiated close: step back in history; the popstate handler hides it.
function closeModal() { if (modalOpen) history.back(); }
// Actually hide the modal UI (called from the back-navigation handler).
function hideModal() { modalOpen = false; if (backdrop) backdrop.classList.remove("open"); }

// ============================================================
//  GLOBAL WIRING
// ============================================================
document.getElementById("langToggle").onclick = () => {
  state.lang = state.lang === "bg" ? "en" : "bg";
  save(LS.lang, state.lang);
  render();
};
document.querySelectorAll(".tab").forEach((b) =>
  b.onclick = () => {
    state.tab = b.dataset.tab;
    if (state.tab === "workouts") state.view.screen = "list";
    render();
  }
);

// ============================================================
//  BACK-BUTTON / SWIPE-BACK NAVIGATION
//  Each deeper view (opening a workout = detail, opening a modal) pushes a
//  history entry when it opens, so the device Back button / iOS edge-swipe
//  pops exactly one layer. At the base list, Back exits the app.
// ============================================================
window.addEventListener("popstate", () => {
  if (modalOpen) { hideModal(); return; }
  if (state.tab === "workouts" && state.view.screen === "detail") {
    state.view.screen = "list";
    render();
  }
});

// ============================================================
//  SERVICE WORKER + UPDATE PROMPT
//  A new release shows a banner asking to update. Workouts live in
//  localStorage and are never touched, so updating keeps all data.
// ============================================================
function showUpdateBanner(reg) {
  if (document.getElementById("updateBanner")) return;
  const bar = document.createElement("div");
  bar.id = "updateBanner";
  bar.className = "update-banner";
  bar.innerHTML = `
    <div class="update-text">
      <strong>${t().updateTitle}</strong>
      <span>${t().updateBody}</span>
    </div>
    <div class="update-actions">
      <button class="update-later" id="updateLater">${t().updateLater}</button>
      <button class="update-now" id="updateNow">${t().updateNow}</button>
    </div>`;
  document.body.appendChild(bar);
  requestAnimationFrame(() => bar.classList.add("show"));
  document.getElementById("updateLater").onclick = () => bar.remove();
  document.getElementById("updateNow").onclick = () => {
    const sw = reg.waiting;
    if (sw) sw.postMessage({ type: "SKIP_WAITING" });
    bar.remove();
  };
}

if ("serviceWorker" in navigator) {
  // Reload once when the new service worker takes control, so updated files load immediately.
  let swReloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (swReloaded) return;
    swReloaded = true;
    location.reload();
  });
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("sw.js").then((reg) => {
      reg.update();
      // A newer version was already downloaded and is waiting.
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg);
      // A newer version is being installed right now.
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateBanner(reg);
          }
        });
      });
    }).catch(() => {})
  );
}

render();
