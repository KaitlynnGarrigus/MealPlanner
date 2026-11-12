import {
  boot, state, esc, money, fmtNum, TYPES, MEALS, mealOf, openModal, toast, fileToDataUrl, saveRecipe, deleteRecipe,
  ensureIngredient, findIngredient, lineAmount, lineUnit, unitOptions, recipeAnalysis
} from "./core.js";

let filter = "all";
let mealFilter = "all";
let query = "";
let openedFromUrl = false;
const recipeById = id => state.recipes.find(r => r.id === id);

function grid() {
  const q = query.trim().toLowerCase();
  const list = state.recipes
    .filter(r => (mealFilter === "all" || mealOf(r) === mealFilter) && (filter === "all" || r.type === filter) && (!q || r.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) return `<div class="empty">${state.recipes.length ? "No recipes match." : "No recipes yet. Click “+ New recipe” to add your first one."}</div>`;
  return `<div class="grid">${list.map(r => `
    <div class="card rcard" data-act="view" data-id="${r.id}">
      ${r.photo ? `<img class="ph" src="${r.photo}" alt="">` : `<div class="ph">${TYPES[r.type]?.emoji || "🍴"}</div>`}
      <div class="body"><div class="name">${esc(r.name)}</div>
        <span class="pill meal">${MEALS[mealOf(r)].emoji} ${MEALS[mealOf(r)].label}</span> ${mealOf(r) !== "breakfast" ? `<span class="pill ${r.type}">${TYPES[r.type]?.short}</span>` : ""} <span class="muted">${(r.ingredients || []).length} ingredients</span></div>
    </div>`).join("")}</div>`;
}

function render(app) {
  const counts = t => state.recipes.filter(r => t === "all" || r.type === t).length;
  app.innerHTML = `
    <div class="toolbar">
      <h1 style="margin:0">Recipes <span class="muted">(${state.recipes.length})</span></h1>
      <span class="grow"></span>
      <input type="search" id="q" placeholder="Search recipes…" value="${esc(query)}">
      <div class="seg">${[["all", "All meals"], ["breakfast", "🍳 Breakfast"], ["lunch", "🥪 Lunch"], ["dinner", "🍽️ Dinner"]].map(([k, l]) => `<button data-act="mfilter" data-k="${k}" class="${mealFilter === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="seg">${[["all", "Any type"], ["main", "Mains"], ["side", "Sides"], ["veg", "Veggies"]].map(([k, l]) => `<button data-act="filter" data-k="${k}" class="${filter === k ? "on" : ""}">${l} ${counts(k)}</button>`).join("")}</div>
      <button class="primary" data-act="new">+ New recipe</button>
    </div>
    <div id="rgrid">${grid()}</div>`;

  const q = app.querySelector("#q");
  q.oninput = () => { query = q.value; app.querySelector("#rgrid").innerHTML = grid(); };
  app.onclick = e => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const { act, id, k } = t.dataset;
    if (act === "filter") { filter = k; render(app); }
    else if (act === "mfilter") { mealFilter = k; render(app); }
    else if (act === "new") openForm(null);
    else if (act === "view") openDetail(recipeById(id));
  };

  if (!openedFromUrl) {
    openedFromUrl = true;
    const id = new URLSearchParams(location.search).get("id");
    if (id && recipeById(id)) { openDetail(recipeById(id)); history.replaceState(null, "", location.pathname); }
  }
}

/* ---------- detail view with leftover math ---------- */
function openDetail(r) {
  const a = recipeAnalysis(r);
  const rows = a.rows.map(({ line, ing, usage: u, mismatch, noSize, packCost, usedCost, packs }) => `<tr>
      <td><a class="ing-chip" href="ingredients.html?id=${ing.id}">${ing.photo ? `<img src="${ing.photo}" alt="">` : `<span class="ph">🥕</span>`}${esc(ing.name)} ↗</a></td>
      <td>${fmtNum(lineAmount(line))} ${esc(lineUnit(line, ing))}</td>
      <td>${noSize ? `<a class="warn" href="ingredients.html?id=${ing.id}">set package size</a>` : `${packs} × ${fmtNum(ing.packSize)} ${esc(ing.packUnit)}`}${ing.price ? `<div class="muted">${money(ing.price)} each</div>` : ""}</td>
      <td>${u ? `${u.leftoverText}<div class="muted">${Math.round(u.pct * 100)}% left over</div>` : "—"}${mismatch ? `<div class="warn">units don't match package</div>` : ""}</td>
      <td>${money(usedCost)}<div class="muted">pack${packs > 1 ? "s" : ""}: ${money(packCost)}</div></td></tr>`).join("");
  const m = openModal(r.name, `
    ${r.photo ? `<img class="photo-prev" src="${r.photo}" alt="" style="max-height:260px">` : ""}
    <p><span class="pill meal">${MEALS[mealOf(r)].emoji} ${MEALS[mealOf(r)].label}</span> ${mealOf(r) !== "breakfast" ? `<span class="pill ${r.type}">${TYPES[r.type]?.label}</span>` : ""}</p>
    ${a.rows.length ? `<div class="tablewrap"><table class="rtable"><thead><tr><th>Ingredient</th><th>Uses</th><th>Package</th><th>Leftover</th><th>Cost used</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="card totals" style="margin-top:.8rem;box-shadow:none">
        <div><div class="muted">Cost of what you use</div><div class="big">${money(a.usedCost)}</div></div>
        <div><div class="muted">If you buy packs just for this</div><div class="big">${money(a.packCost)}</div></div>
        <div><div class="muted">Leftover value</div><div class="big">${money(a.leftoverValue)}</div></div></div>
      <p class="muted">Costs assume whole packages bought for this recipe alone. In your Cart, packages are shared across all planned meals, so leftovers are usually smaller there.</p>`
      : `<p class="muted">No ingredients yet. Click Edit to add some.</p>`}
    ${r.notes ? `<h3>Notes</h3><p style="white-space:pre-wrap">${esc(r.notes)}</p>` : ""}
    <div class="modal-actions"><button id="d-close">Close</button><button class="primary" id="d-edit">Edit recipe</button></div>`, { wide: true });
  m.el.querySelector("#d-close").onclick = m.close;
  m.el.querySelector("#d-edit").onclick = () => { m.close(); openForm(r); };
}

/* ---------- create / edit form ---------- */
function openForm(rec) {
  let photo = rec?.photo || "";
  const m = openModal(rec ? "Edit recipe" : "New recipe", `
    <form id="rform">
      <label class="field">Recipe name<input id="r-name" required value="${esc(rec?.name || "")}" placeholder="e.g. Lemon herb chicken"></label>
      <label class="field">Meal
        <select id="r-meal">${Object.entries(MEALS).map(([k, v]) => `<option value="${k}" ${(rec ? mealOf(rec) : "dinner") === k ? "selected" : ""}>${v.emoji} ${v.label}</option>`).join("")}</select></label>
      <label class="field" id="r-typewrap">Type
        <select id="r-type">
          <option value="main" ${rec?.type === "main" ? "selected" : ""}>Main course</option>
          <option value="side" ${rec?.type === "side" ? "selected" : ""}>Side</option>
          <option value="veg" ${rec?.type === "veg" ? "selected" : ""}>Veggie / healthy option</option>
        </select>
        <span class="muted" id="r-typehint"></span></label>
      <div class="field"><span class="muted">Photo</span>
        <img id="r-prev" class="photo-prev" ${photo ? `src="${photo}"` : "hidden"} alt="">
        <div class="row"><input type="file" id="r-photo" accept="image/*"><button type="button" id="r-rmphoto" ${photo ? "" : "hidden"}>Remove</button></div></div>
      <div class="field"><span class="muted">Ingredients — how much this recipe uses. Pick an existing ingredient or type a new one (↗ opens it on the Ingredients page).</span>
        <div class="ing-head"><span>Ingredient</span><span>Amount</span><span>Unit</span><span></span><span></span></div>
        <div id="r-ings"></div>
        <button type="button" id="r-add">+ Add ingredient</button></div>
      <label class="field">Notes / instructions<textarea id="r-notes">${esc(rec?.notes || "")}</textarea></label>
      <datalist id="ing-list">${state.ingredients.map(i => `<option value="${esc(i.name)}">`).join("")}</datalist>
      <div class="err" id="r-err"></div>
      <div class="modal-actions">${rec ? `<button type="button" class="danger left" id="r-del">Delete</button>` : ""}<button type="button" id="r-cancel">Cancel</button><button class="primary" type="submit" id="r-save">Save recipe</button></div>
    </form>`, { wide: true });

  const box = m.el.querySelector("#r-ings");
  const setLink = (row, ing) => {
    const a = row.querySelector(".ing-link");
    if (ing) { a.href = `ingredients.html?id=${ing.id}`; a.hidden = false; } else a.hidden = true;
  };
  const addRow = (name = "", amount = 1, unit = "each", known = null) => {
    const row = document.createElement("div");
    row.className = "ing-row";
    row.innerHTML = `<input class="ing-name" list="ing-list" placeholder="e.g. Chicken breast" value="${esc(name)}">
      <input class="ing-amt" type="number" min="0" step="any" value="${amount}">
      <select class="ing-unit">${unitOptions(unit)}</select>
      <a class="ing-link btn icon" target="_blank" rel="noopener" title="Open on Ingredients page" hidden>↗</a>
      <button type="button" class="icon" aria-label="Remove">✕</button>`;
    row.querySelector("button").onclick = () => row.remove();
    row.querySelector(".ing-unit").onchange = e => { e.target.dataset.touched = "1"; };
    row.querySelector(".ing-name").onchange = e => {
      const ing = findIngredient(e.target.value);
      setLink(row, ing);
      const sel = row.querySelector(".ing-unit");
      if (ing && !sel.dataset.touched) sel.value = ing.packUnit || "each";
    };
    setLink(row, known);
    box.appendChild(row);
  };
  const lines = (rec?.ingredients || []).map(l => ({ l, ing: state.ingredients.find(i => i.id === l.ingredientId) })).filter(x => x.ing);
  lines.forEach(({ l, ing }) => addRow(ing.name, lineAmount(l), lineUnit(l, ing), ing));
  if (!lines.length) addRow();
  m.el.querySelector("#r-add").onclick = () => { addRow(); box.lastChild.querySelector("input").focus(); };
  m.el.querySelector("#r-cancel").onclick = m.close;

  const mealSel = m.el.querySelector("#r-meal"), typeWrap = m.el.querySelector("#r-typewrap"), hint = m.el.querySelector("#r-typehint");
  const syncMeal = () => {
    typeWrap.hidden = mealSel.value === "breakfast"; // breakfasts are just one recipe each
    hint.textContent = mealSel.value === "lunch"
      ? "Lunch mains/sides are picked as the lunch. “Veggie / healthy option” recipes fill the required healthy option with lunch."
      : mealSel.value === "dinner" ? "Dinner days need a main and a veggie; a side is optional." : "";
  };
  mealSel.onchange = syncMeal;
  syncMeal();

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
    errEl.textContent = "";
    if (photo.length > 900000) { errEl.textContent = "That photo is too large; try a smaller one."; return; }
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      const out = [];
      for (const row of box.querySelectorAll(".ing-row")) {
        const name = row.querySelector(".ing-name").value.trim();
        if (!name) continue;
        const amount = parseFloat(row.querySelector(".ing-amt").value);
        if (!(amount > 0)) throw new Error(`Enter an amount for “${name}”.`);
        const unit = row.querySelector(".ing-unit").value;
        out.push({ ingredientId: await ensureIngredient(name, unit), amount, unit });
      }
      await saveRecipe({
        name: m.el.querySelector("#r-name").value.trim(),
        meal: m.el.querySelector("#r-meal").value,
        type: m.el.querySelector("#r-meal").value === "breakfast" ? "main" : m.el.querySelector("#r-type").value,
        photo, notes: m.el.querySelector("#r-notes").value.trim(), ingredients: out
      }, rec?.id);
      m.close(); toast("Recipe saved");
    } catch (err) {
      console.error(err);
      errEl.textContent = err.message.startsWith("Enter") ? err.message : "Couldn't save: " + err.message;
      btn.disabled = false; btn.textContent = "Save recipe";
    }
  };
}

boot("recipes", render);
