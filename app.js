// ============================================================
//  My Workout — vanilla JS PWA
//  State persisted in localStorage. No build step, no backend.
// ============================================================

const LS = {
  program: "gym_program",
  sessions: "gym_sessions",
  active: "gym_active",
  lang: "gym_lang",
};

const state = {
  lang: localStorage.getItem(LS.lang) || "bg",
  program: load(LS.program, null) || structuredClone(DEFAULT_PROGRAM),
  sessions: load(LS.sessions, []),        // [{date:"YYYY-MM-DD", dayId, dayName:{bg,en}, icon, exercises:[{name,setsDone,sets}]}]
  active: load(LS.active, null),          // {dayId, started, sets:{exId:count}, done:{exId:bool}}
  tab: "workouts",
  view: { screen: "list", dayId: null, editing: false },
  calMonth: new Date().getFullYear() * 12 + new Date().getMonth(),
};

// Migrate program if a newer default version ships.
if (!state.program.version || state.program.version < DEFAULT_PROGRAM.version) {
  state.program = structuredClone(DEFAULT_PROGRAM);
  save(LS.program, state.program);
}

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function t() { return I18N[state.lang]; }
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
  document.getElementById("btnExport").onclick = exportData;
  document.getElementById("fileImport").onchange = (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = "";
  };
}

function exportData() {
  const payload = {
    app: "my-workout", backupVersion: 1, exported: new Date().toISOString(),
    program: state.program, sessions: state.sessions,
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
  const doneSets = day.exercises.reduce((a, e) => a + Math.min(active?.sets?.[e.id] || 0, e.sets), 0);
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
  const setsDone = active?.sets?.[e.id] || 0;
  const isDone = active?.done?.[e.id] || setsDone >= e.sets;
  const dots = Array.from({ length: Number(e.sets) || 0 }, (_, i) =>
    `<div class="set-dot ${i < setsDone ? "filled" : ""}" data-ex="${e.id}" data-set="${i + 1}">${i + 1}</div>`
  ).join("");

  return `
    <div class="ex-card ${isDone ? "done" : ""}" data-card="${e.id}">
      <div class="ex-top">
        <div class="ex-thumb" data-info="${e.id}">${thumb(e)}</div>
        <div class="ex-main">
          <div class="ex-name">${L(e.name)}</div>
          <div class="ex-sub">${e.sets} × ${L(e.reps)} · ${t().muscles[e.muscle] || ""}</div>
          ${L(e.notes) ? `<div class="ex-notes">${L(e.notes)}</div>` : ""}
        </div>
        <button class="ex-check" data-check="${e.id}">${isDone ? "✓" : ""}</button>
      </div>
      <div class="sets-row">
        <div class="sets-label">${t().setsDone}: ${setsDone}/${e.sets}</div>
        <div class="set-dots">${dots}</div>
      </div>
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
  if (imgs.length) return `<img src="${imgs[0]}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='${escapeAttr(MUSCLE_SVG(e.muscle))}'">`;
  return MUSCLE_SVG(e.muscle);
}
function escapeAttr(s) { return s.replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/\n/g, ""); }

function exerciseEditCard(e) {
  const muscleOpts = Object.keys(t().muscles).map((m) =>
    `<option value="${m}" ${m === e.muscle ? "selected" : ""}>${t().muscles[m]}</option>`
  ).join("");
  return `
    <div class="ex-card" data-edit="${e.id}">
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
      <div class="field">
        <label>${t().imageUrl}</label>
        <input data-f="img" value="${escapeHtml(e.img || "")}" placeholder="https://..." />
      </div>
      <button class="btn-ghost btn-danger" data-del="${e.id}">🗑 ${t().deleteExercise}</button>
    </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wireDetail(day, started) {
  document.getElementById("btnBack").onclick = () => { state.view.screen = "list"; render(); };
  document.getElementById("btnEdit").onclick = () => {
    if (state.view.editing) collectEdits(day);
    state.view.editing = !state.view.editing;
    render();
  };

  // Exercise info is available whether or not the workout is started.
  viewEl.querySelectorAll("[data-info]").forEach((el) =>
    el.onclick = () => openExerciseInfo(getEx(day, el.dataset.info))
  );

  if (state.view.editing) {
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
    return;
  }

  // Not started yet: only wire the Start button.
  if (!started) {
    document.getElementById("btnStart").onclick = () => {
      state.active = { dayId: day.id, started: todayStr(), sets: {}, done: {} };
      save(LS.active, state.active);
      render();
    };
    return;
  }

  // Tracking interactions
  viewEl.querySelectorAll(".set-dot").forEach((dot) =>
    dot.onclick = () => {
      const ex = dot.dataset.ex, n = Number(dot.dataset.set);
      const cur = state.active.sets[ex] || 0;
      state.active.sets[ex] = cur === n ? n - 1 : n;  // tap same dot to toggle down
      if ((state.active.sets[ex] || 0) >= getEx(day, ex).sets) state.active.done[ex] = true;
      else state.active.done[ex] = false;
      save(LS.active, state.active);
      render();
    }
  );
  viewEl.querySelectorAll("[data-check]").forEach((btn) =>
    btn.onclick = () => {
      const ex = btn.dataset.check;
      const exObj = getEx(day, ex);
      const nowDone = !(state.active.done[ex] || (state.active.sets[ex] || 0) >= exObj.sets);
      state.active.done[ex] = nowDone;
      state.active.sets[ex] = nowDone ? exObj.sets : 0;
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
}

function getEx(day, id) { return day.exercises.find((e) => e.id === id); }

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
  });
  save(LS.program, state.program);
}
function setLang(obj, field, val) {
  // Edit the field in the currently active language, keep the other side.
  const cur = obj[field];
  if (typeof cur === "object" && cur) cur[state.lang] = val;
  else obj[field] = state.lang === "bg" ? { bg: val, en: val } : { bg: val, en: val };
}

function finishWorkout(day) {
  const active = state.active;
  const anyDone = day.exercises.some((e) => (active.sets[e.id] || 0) > 0 || active.done[e.id]);
  if (!anyDone) { toast(state.lang === "bg" ? "Отбележи поне едно упражнение" : "Mark at least one exercise"); return; }
  if (!confirm(t().finishConfirm)) return;

  const session = {
    date: todayStr(),
    dayId: day.id,
    dayName: { bg: day.name.bg, en: day.name.en },
    icon: day.icon,
    exercises: day.exercises.map((e) => ({
      name: { bg: L(e.name) && e.name.bg ? e.name.bg : L(e.name), en: e.name.en || L(e.name) },
      setsDone: Math.min(active.sets[e.id] || 0, e.sets) || (active.done[e.id] ? e.sets : 0),
      sets: e.sets,
    })),
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
    const dots = list.slice(0, 4).map(() => `<span class="cal-dot"></span>`).join("");
    cells += `
      <div class="cal-cell ${list.length ? "has-workout" : ""} ${isToday ? "today" : ""}" data-date="${key}">
        <span>${dnum}</span>
        ${list.length ? `<div class="cal-dots">${dots}</div>` : ""}
      </div>`;
  }

  const dow = t().weekdays.map((w) => `<div class="cal-dow">${w}</div>`).join("");
  const monthCount = state.sessions.filter((s) => s.date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`)).length;

  viewEl.innerHTML = `
    <div class="cal-head">
      <button class="cal-nav" id="calPrev">‹</button>
      <div class="cal-month">${t().months[month]} ${year}</div>
      <button class="cal-nav" id="calNext">›</button>
    </div>
    <div class="subtle" style="text-align:center;margin-bottom:14px">${monthCount} ${t().workoutsCount}</div>
    <div class="cal-grid">${dow}${cells}</div>
  `;

  document.getElementById("calPrev").onclick = () => { state.calMonth--; render(); };
  document.getElementById("calNext").onclick = () => { state.calMonth++; render(); };
  viewEl.querySelectorAll(".cal-cell[data-date]").forEach((c) =>
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
      const exLines = s.exercises.map((e) =>
        `<div class="log-detail">• ${L(e.name)} — ${e.setsDone}/${e.sets} ${t().sets.toLowerCase()}</div>`
      ).join("");
      return `
        <div class="log-item" style="flex-direction:column;align-items:stretch;gap:4px">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="log-emoji">${s.icon}</span>
            <span class="log-name">${L(s.dayName)}</span>
            <span class="log-detail" style="margin-left:auto">${done}/${total}</span>
          </div>
          ${exLines}
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
  sessEdit = { date, idx, data: structuredClone(state.sessions[idx]) };
  renderSessionEdit();
}
function renderSessionEdit() {
  const s = sessEdit.data;
  const rows = s.exercises.map((e, i) => {
    const dots = Array.from({ length: Number(e.sets) || 0 }, (_, k) =>
      `<div class="set-dot ${k < e.setsDone ? "filled" : ""}" data-exi="${i}" data-set="${k + 1}">${k + 1}</div>`
    ).join("");
    return `
      <div class="log-edit-row">
        <div class="log-edit-head">
          <span class="log-name">${L(e.name)}</span>
          <button class="icon-btn" data-rm-ex="${i}" title="${t().deleteExercise}">🗑</button>
        </div>
        <div class="sets-label">${t().setsDone}: ${e.setsDone}/${e.sets}</div>
        <div class="set-dots">${dots}</div>
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
  backdrop.classList.add("open");
  const close = document.getElementById("modalClose");
  if (close) close.onclick = closeModal;
}
function closeModal() { if (backdrop) backdrop.classList.remove("open"); }

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

// Register service worker for offline / installable PWA.
if ("serviceWorker" in navigator) {
  // Reload once when a new service worker takes control, so updated files load immediately.
  let swReloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (swReloaded) return;
    swReloaded = true;
    location.reload();
  });
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("sw.js").then((reg) => reg.update()).catch(() => {})
  );
}

render();
