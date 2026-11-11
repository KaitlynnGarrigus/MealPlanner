import {
  boot, state, esc, ymd, parseYmd, addDays, startOfWeek, TYPES, setPlanSlot, openModal, toast,
  saveRecipe, deleteRecipe, ensureIngredient, fileToDataUrl
} from "./core.js";

const params = new URLSearchParams(location.search);
let weekStart = startOfWeek(params.get("date") ? parseYmd(params.get("date")) : new Date());
let filter = "all";

const SLOTS = [
  ["main", "Main course"],
  ["side", "Side (optional)"],
  ["veg", "Veggie (required)"]
];
const DAYNAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const recipeById = id => state.recipes.find(r => r.id === id);
const byType = t => state.recipes.filter(r => r.type === t).sort((a, b) => a.name.localeCompare(b.name));

function pick(slot, current, used = new Set()) {
  const pool = state.recipes.filter(r => r.type === slot);
  if (!pool.length) { if (slot !== "side") toast(`Add a ${TYPES[slot].short.toLowerCase()} recipe first`); return null; }
  let choices = pool.filter(r => r.id !== current && !used.has(r.id));
  if (!choices.length) choices = pool.filter(r => r.id !== current);
  if (!choices.length) choices = pool;
  return choices[Math.floor(Math.random() * choices.length)].id;
}

async function shuffleDay(key, used = {}) {
  for (const slot of ["main", "veg", "side"]) {
    const id = pick(slot, (state.plan[key] || {})[slot], used[slot]);
    if (id) { await setPlanSlot(key, slot, id); used[slot]?.add(id); }
  }
}

async function shuffleWeek() {
  if (!confirm("Shuffle all 7 days? This replaces your current choices for this week.")) return;
  const used = { main: new Set(), side: new Set(), veg: new Set() };
  for (let i = 0; i < 7; i++) await shuffleDay(ymd(addDays(weekStart, i)), used);
}

function dayCard(d) {
  const key = ymd(d);
  const plan = state.plan[key] || {};
  const isToday = key === ymd(new Date());
  const missing = [!recipeById(plan.main) && "main", !recipeById(plan.veg) && "veggie"].filter(Boolean);
  const slots = SLOTS.map(([slot, label]) => {
    const sel = recipeById(plan[slot]);
    const opts = byType(slot).map(r => `<option value="${r.id}" ${r.id === plan[slot] ? "selected" : ""}>${esc(r.name)}</option>`).join("");
    return `<div class="slot">
      <div class="slot-label">${label}</div>
      <div class="slot-row">
        ${sel?.photo ? `<img class="slot-thumb" src="${sel.photo}" alt="">` : ""}
        <select data-date="${key}" data-slot="${slot}"><option value="">— ${slot === "side" ? "none" : "choose"} —</option>${opts}</select>
        <button class="icon" title="Shuffle ${label}" data-act="shuffle" data-date="${key}" data-slot="${slot}">🔀</button>
      </div></div>`;
  }).join("");
  return `<div class="card day ${isToday ? "today" : ""}">
    <div class="day-head"><div><b>${DAYNAMES[(d.getDay() + 6) % 7]}</b> <span class="muted">${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></div>
      <div class="row" style="gap:.25rem"><button data-act="shuffle-day" data-date="${key}" title="Shuffle this day">🔀 Day</button><button class="icon" data-act="clear-day" data-date="${key}" title="Clear day">🗑</button></div></div>
    ${slots}
    ${missing.length && (plan.main || plan.side || plan.veg) ? `<div class="warn">Still needs: ${missing.join(" + ")}</div>` : ""}
  </div>`;
}

function recipeGrid() {
  const list = state.recipes.filter(r => filter === "all" || r.type === filter).sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) return `<div class="empty">No recipes here yet. Click “+ New recipe” to add your first one.</div>`;
  return `<div class="grid">${list.map(r => `
    <div class="card rcard" data-act="edit-recipe" data-id="${r.id}">
      ${r.photo ? `<img class="ph" src="${r.photo}" alt="">` : `<div class="ph">${TYPES[r.type]?.emoji || "🍴"}</div>`}
      <div class="body"><div class="name">${esc(r.name)}</div>
        <span class="pill ${r.type}">${TYPES[r.type]?.short}</span> <span class="muted">${(r.ingredients || []).length} ingredients</span></div>
    </div>`).join("")}</div>`;
}

function render(app) {
  const end = addDays(weekStart, 6);
  const label = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  app.innerHTML = `
    <div class="toolbar">
      <button data-act="prev">◀</button><div class="title">${label}</div><button data-act="next">▶</button>
      <button data-act="today">This week</button>
      <span class="grow"></span>
      <button class="primary" data-act="shuffle-week">🔀 Shuffle week</button>
    </div>
    <p class="muted" style="margin-top:-.4rem">Picking a recipe adds its ingredients to your cart; changing or removing it takes them back out.</p>
    <div class="week">${Array.from({ length: 7 }, (_, i) => dayCard(addDays(weekStart, i))).join("")}</div>

    <div class="toolbar" style="margin-top:2rem">
      <h2 style="margin:0">My recipes</h2><span class="grow"></span>
      <div class="seg">${[["all", "All"], ["main", "Mains"], ["side", "Sides"], ["veg", "Veggies"]].map(([k, l]) => `<button data-act="filter" data-k="${k}" class="${filter === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <button class="primary" data-act="new-recipe">+ New recipe</button>
    </div>
    ${recipeGrid()}`;

  app.onclick = async e => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const { act, date, slot, id, k } = t.dataset;
    try {
      if (act === "prev") { weekStart = addDays(weekStart, -7); render(app); }
      else if (act === "next") { weekStart = addDays(weekStart, 7); render(app); }
      else if (act === "today") { weekStart = startOfWeek(new Date()); render(app); }
      else if (act === "filter") { filter = k; render(app); }
      else if (act === "shuffle") { const n = pick(slot, (state.plan[date] || {})[slot]); if (n) await setPlanSlot(date, slot, n); }
      else if (act === "shuffle-day") await shuffleDay(date);
      else if (act === "shuffle-week") await shuffleWeek();
      else if (act === "clear-day") { for (const s of ["main", "side", "veg"]) await setPlanSlot(date, s, null); }
      else if (act === "new-recipe") openRecipeModal(null);
      else if (act === "edit-recipe") openRecipeModal(recipeById(id));
      render(app);
    } catch (err) { console.error(err); toast("Something went wrong: " + err.message); }
  };
  app.onchange = async e => {
    const s = e.target.closest("select[data-slot]"); if (!s) return;
    try { await setPlanSlot(s.dataset.date, s.dataset.slot, s.value || null); render(app); }
    catch (err) { toast("Couldn't save: " + err.message); }
  };
}

function openRecipeModal(rec) {
  let photo = rec?.photo || "";
  const m = openModal(rec ? "Edit recipe" : "New recipe", `
    <form id="rform">
      <label class="field">Recipe name<input id="r-name" required value="${esc(rec?.name || "")}" placeholder="e.g. Lemon herb chicken"></label>
      <label class="field">Type
        <select id="r-type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${rec?.type === k ? "selected" : ""}>${v.label}</option>`).join("")}</select></label>
      <div class="field"><span class="muted">Photo</span>
        <img id="r-prev" class="photo-prev" ${photo ? `src="${photo}"` : "hidden"} alt="">
        <div class="row"><input type="file" id="r-photo" accept="image/*"><button type="button" id="r-rmphoto" ${photo ? "" : "hidden"}>Remove</button></div></div>
      <div class="field"><span class="muted">Ingredients (everything here lands in your Ingredients page)</span>
        <div class="ing-head"><span>Ingredient</span><span>Qty to buy</span><span></span></div>
        <div id="r-ings"></div>
        <button type="button" id="r-add">+ Add ingredient</button></div>
      <label class="field">Notes / instructions<textarea id="r-notes">${esc(rec?.notes || "")}</textarea></label>
      <datalist id="ing-list">${state.ingredients.map(i => `<option value="${esc(i.name)}">`).join("")}</datalist>
      <div class="err" id="r-err"></div>
      <div class="modal-actions">${rec ? `<button type="button" class="danger left" id="r-del">Delete</button>` : ""}<button type="button" id="r-cancel">Cancel</button><button class="primary" type="submit" id="r-save">Save recipe</button></div>
    </form>`);
  const box = m.el.querySelector("#r-ings");
  const addRow = (name = "", qty = 1) => {
    const row = document.createElement("div");
    row.className = "ing-row";
    row.innerHTML = `<input class="ing-name" list="ing-list" placeholder="e.g. Chicken breast" value="${esc(name)}"><input class="ing-qty" type="number" min="1" step="1" value="${qty}"><button type="button" class="icon" aria-label="Remove">✕</button>`;
    row.querySelector("button").onclick = () => row.remove();
    box.appendChild(row);
  };
  const existing = (rec?.ingredients || []).map(l => ({ ing: state.ingredients.find(i => i.id === l.ingredientId), qty: l.qty })).filter(x => x.ing);
  existing.forEach(x => addRow(x.ing.name, x.qty));
  if (!existing.length) addRow();
  m.el.querySelector("#r-add").onclick = () => { addRow(); box.lastChild.querySelector("input").focus(); };
  m.el.querySelector("#r-cancel").onclick = m.close;

  const prev = m.el.querySelector("#r-prev"), rm = m.el.querySelector("#r-rmphoto");
  m.el.querySelector("#r-photo").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { photo = await fileToDataUrl(f, 1000, 0.72); prev.src = photo; prev.hidden = false; rm.hidden = false; }
    catch (err) { m.el.querySelector("#r-err").textContent = err.message; }
  };
  rm.onclick = () => { photo = ""; prev.hidden = true; rm.hidden = true; m.el.querySelector("#r-photo").value = ""; };

  if (rec) m.el.querySelector("#r-del").onclick = async () => {
    if (!confirm(`Delete “${rec.name}”? It will also be removed from your meal plan and cart.`)) return;
    await deleteRecipe(rec.id); m.close(); toast("Recipe deleted");
  };

  m.el.querySelector("#rform").onsubmit = async e => {
    e.preventDefault();
    const errEl = m.el.querySelector("#r-err"), btn = m.el.querySelector("#r-save");
    if (photo.length > 900000) { errEl.textContent = "That photo is too large; try a smaller one."; return; }
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      const merged = new Map();
      for (const row of box.querySelectorAll(".ing-row")) {
        const name = row.querySelector(".ing-name").value.trim();
        if (!name) continue;
        const qty = Math.max(1, parseInt(row.querySelector(".ing-qty").value, 10) || 1);
        const id = await ensureIngredient(name);
        merged.set(id, (merged.get(id) || 0) + qty);
      }
      const data = {
        name: m.el.querySelector("#r-name").value.trim(),
        type: m.el.querySelector("#r-type").value,
        photo, notes: m.el.querySelector("#r-notes").value.trim(),
        ingredients: [...merged].map(([ingredientId, qty]) => ({ ingredientId, qty }))
      };
      await saveRecipe(data, rec?.id);
      m.close(); toast("Recipe saved");
    } catch (err) {
      console.error(err);
      errEl.textContent = "Couldn't save: " + err.message;
      btn.disabled = false; btn.textContent = "Save recipe";
    }
  };
}

boot("planner", render);
