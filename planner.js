import {
  boot, state, esc, ymd, parseYmd, addDays, startOfWeek, SLOT_META, LEFTOVERS, poolFor, setPlanSlot, toast
} from "./core.js";

const params = new URLSearchParams(location.search);
let weekStart = startOfWeek(params.get("date") ? parseYmd(params.get("date")) : new Date());
const openSections = new Set(); // "YYYY-MM-DD:breakfast" / ":lunch" — optional meals the user has opened but not filled yet

const DAYNAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const recipeById = id => state.recipes.find(r => r.id === id);
const byName = (a, b) => a.name.localeCompare(b.name);

function pick(slot, current, used = new Set()) {
  const pool = poolFor(slot);
  if (!pool.length) {
    toast(slot === "lunchHealthy" ? "Add a veggie / healthy option recipe first (Recipes tab)" : `Add a ${SLOT_META[slot].label.toLowerCase()} recipe first (Recipes tab)`);
    return null;
  }
  let choices = pool.filter(r => r.id !== current && !used.has(r.id));
  if (!choices.length) choices = pool.filter(r => r.id !== current);
  if (!choices.length) choices = pool;
  return choices[Math.floor(Math.random() * choices.length)].id;
}

async function setLunch(key, value) {
  await setPlanSlot(key, "lunch", value || null);
  if (!value) await setPlanSlot(key, "lunchHealthy", null); // no lunch → no healthy option needed
}

// Shuffle a day: dinner always; breakfast/lunch/healthy only if they're already on the day.
async function shuffleDay(key, used = {}) {
  const day = () => state.plan[key] || {};
  for (const slot of ["main", "veg", "side"]) {
    const id = pick(slot, day()[slot], used[slot]);
    if (id) { await setPlanSlot(key, slot, id); used[slot]?.add(id); }
  }
  if (day().breakfast || openSections.has(`${key}:breakfast`)) {
    const id = pick("breakfast", day().breakfast, used.breakfast);
    if (id) { await setPlanSlot(key, "breakfast", id); used.breakfast?.add(id); }
  }
  const lunchOn = day().lunch || openSections.has(`${key}:lunch`);
  if (lunchOn) {
    if (day().lunch !== LEFTOVERS) { // keep leftovers if that's what you chose
      const id = pick("lunch", day().lunch, used.lunch);
      if (id) { await setPlanSlot(key, "lunch", id); used.lunch?.add(id); }
    }
    const h = pick("lunchHealthy", day().lunchHealthy, used.lunchHealthy);
    if (h) { await setPlanSlot(key, "lunchHealthy", h); used.lunchHealthy?.add(h); }
  }
}

async function shuffleWeek() {
  if (!confirm("Shuffle all 7 days? This replaces your current dinner choices, and any breakfasts, lunches and healthy options you've already added.")) return;
  const used = { main: new Set(), side: new Set(), veg: new Set(), breakfast: new Set(), lunch: new Set(), lunchHealthy: new Set() };
  for (let i = 0; i < 7; i++) await shuffleDay(ymd(addDays(weekStart, i)), used);
}

const optionsHtml = (list, selected) => [...list].sort(byName).map(r => `<option value="${r.id}" ${r.id === selected ? "selected" : ""}>${esc(r.name)}</option>`).join("");

function slotRow(key, slot, label, plan, { extra = "", none = "none", required = false, note = "" } = {}) {
  const sel = recipeById(plan[slot]);
  return `<div class="slot">
    <div class="slot-label">${label}${sel ? ` · <a href="recipes.html?id=${sel.id}">view recipe</a>` : ""}</div>
    <div class="slot-row">
      ${sel?.photo ? `<img class="slot-thumb" src="${sel.photo}" alt="">` : ""}
      <select data-date="${key}" data-slot="${slot}"><option value="">— ${required ? "choose" : none} —</option>${extra}${optionsHtml(poolFor(slot), plan[slot])}</select>
      <button class="icon" title="Shuffle" data-act="shuffle" data-date="${key}" data-slot="${slot}">🔀</button>
    </div>${note}</div>`;
}

function dayCard(d) {
  const key = ymd(d);
  const plan = state.plan[key] || {};
  const isToday = key === ymd(new Date());

  const showBreakfast = plan.breakfast || openSections.has(`${key}:breakfast`);
  const showLunch = plan.lunch || plan.lunchHealthy || openSections.has(`${key}:lunch`);

  const prevMain = recipeById((state.plan[ymd(addDays(d, -1))] || {}).main);
  const leftoverNote = plan.lunch === LEFTOVERS
    ? `<div class="muted">♻️ Leftovers from ${prevMain ? esc(prevMain.name) : "last night's dinner"}</div>` : "";

  const dinnerMissing = [!recipeById(plan.main) && "main", !recipeById(plan.veg) && "veggie"].filter(Boolean);
  const anyDinner = plan.main || plan.side || plan.veg;
  const lunchNeedsHealthy = plan.lunch && !recipeById(plan.lunchHealthy);

  const head = (emoji, title, hint, removeMeal) => `<div class="meal-head"><span>${emoji} ${title} <span class="muted">${hint}</span></span>${removeMeal ? `<button class="icon" data-act="remove-meal" data-date="${key}" data-meal="${removeMeal}" title="Remove ${title.toLowerCase()}">✕</button>` : ""}</div>`;

  return `<div class="card day ${isToday ? "today" : ""}">
    <div class="day-head"><div><b>${DAYNAMES[(d.getDay() + 6) % 7]}</b> <span class="muted">${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></div>
      <div class="row" style="gap:.25rem"><button data-act="shuffle-day" data-date="${key}" title="Shuffle this day">🔀 Day</button><button class="icon" data-act="clear-day" data-date="${key}" title="Clear day">🗑</button></div></div>

    ${showBreakfast ? head("🍳", "Breakfast", "(optional)", "breakfast") + slotRow(key, "breakfast", "Breakfast", plan) : ""}

    ${showLunch ? head("🥪", "Lunch", "(optional)", "lunch")
        + slotRow(key, "lunch", "Lunch", plan, { extra: `<option value="${LEFTOVERS}" ${plan.lunch === LEFTOVERS ? "selected" : ""}>♻️ Leftovers</option>`, note: leftoverNote })
        + slotRow(key, "lunchHealthy", "Healthy option (required with lunch)", plan, { required: true })
        + (lunchNeedsHealthy ? `<div class="warn">Lunch still needs a healthy option</div>` : "") : ""}

    ${head("🍽️", "Dinner", "", null)}
    ${slotRow(key, "main", "Main course", plan, { required: true })}
    ${slotRow(key, "side", "Side (optional)", plan)}
    ${slotRow(key, "veg", "Veggie (required)", plan, { required: true })}
    ${dinnerMissing.length && anyDinner ? `<div class="warn">Dinner still needs: ${dinnerMissing.join(" + ")}</div>` : ""}

    ${!showBreakfast || !showLunch ? `<div class="add-row">
      ${showBreakfast ? "" : `<button data-act="add-meal" data-date="${key}" data-meal="breakfast">+ 🍳 Breakfast</button>`}
      ${showLunch ? "" : `<button data-act="add-meal" data-date="${key}" data-meal="lunch">+ 🥪 Lunch</button>`}
    </div>` : ""}
  </div>`;
}

function render(app) {
  const end = addDays(weekStart, 6);
  const label = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  app.innerHTML = `
    <div class="toolbar">
      <button data-act="prev">◀</button><div class="title">${label}</div><button data-act="next">▶</button>
      <button data-act="today">This week</button>
      <span class="grow"></span>
      <a class="btn" href="recipes.html">📖 Manage recipes</a>
      <button class="primary" data-act="shuffle-week">🔀 Shuffle week</button>
    </div>
    <p class="muted" style="margin-top:-.4rem">Every day has a dinner. Add breakfast or lunch to any day if you want. Lunch can be leftovers, and always needs a healthy option. Picking a recipe adds what it needs to your cart.</p>
    ${state.recipes.length ? "" : `<div class="card empty">You don't have any recipes yet. <a href="recipes.html">Add your first recipe</a> and it will show up in the dropdowns here.</div>`}
    <div class="week">${Array.from({ length: 7 }, (_, i) => dayCard(addDays(weekStart, i))).join("")}</div>`;

  app.onclick = async e => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const { act, date, slot, meal } = t.dataset;
    try {
      if (act === "prev") weekStart = addDays(weekStart, -7);
      else if (act === "next") weekStart = addDays(weekStart, 7);
      else if (act === "today") weekStart = startOfWeek(new Date());
      else if (act === "add-meal") openSections.add(`${date}:${meal}`);
      else if (act === "remove-meal") {
        openSections.delete(`${date}:${meal}`);
        if (meal === "breakfast") await setPlanSlot(date, "breakfast", null);
        else await setLunch(date, null);
      }
      else if (act === "shuffle") {
        const cur = (state.plan[date] || {})[slot];
        const n = pick(slot, cur === LEFTOVERS ? null : cur);
        if (n) await setPlanSlot(date, slot, n);
      }
      else if (act === "shuffle-day") await shuffleDay(date);
      else if (act === "shuffle-week") await shuffleWeek();
      else if (act === "clear-day") {
        for (const s of ["main", "side", "veg", "breakfast", "lunch", "lunchHealthy"]) await setPlanSlot(date, s, null);
        openSections.delete(`${date}:breakfast`); openSections.delete(`${date}:lunch`);
      }
      render(app);
    } catch (err) { console.error(err); toast("Something went wrong: " + err.message); }
  };
  app.onchange = async e => {
    const s = e.target.closest("select[data-slot]"); if (!s) return;
    try {
      const { date, slot } = s.dataset;
      if (slot === "lunch") await setLunch(date, s.value);
      else await setPlanSlot(date, slot, s.value || null);
      render(app);
    } catch (err) { toast("Couldn't save: " + err.message); }
  };
}

boot("planner", render);
