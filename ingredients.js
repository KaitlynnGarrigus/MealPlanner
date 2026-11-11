import {
  boot, state, esc, money, openModal, toast, fileToDataUrl, saveIngredient, deleteIngredient,
  addToCart, setList
} from "./core.js";

let view = localStorage.getItem("ingView") || "category"; // "category" | "section"
let query = "";

function groups() {
  const field = view === "category" ? "category" : "section";
  const order = state.settings[view === "category" ? "categories" : "sections"] || [];
  const map = new Map(order.map(o => [o, []]));
  const q = query.trim().toLowerCase();
  state.ingredients
    .filter(i => !q || i.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(i => {
      const k = i[field] || "Uncategorized";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(i);
    });
  return [...map].filter(([, items]) => items.length);
}

function card(i) {
  const inCart = state.cart.find(c => c.id === i.id);
  return `<div class="card icard">
    ${i.photo ? `<img class="thumb" src="${i.photo}" alt="">` : `<div class="thumb">🥕</div>`}
    <div class="grow">
      <div class="name">${esc(i.name)} ${inCart ? `<span class="pill" style="background:#d3ebd7">in cart ×${inCart.qty}</span>` : ""}</div>
      <div class="muted">${i.price ? money(i.price) : "No price yet"}${i.unit ? " · " + esc(i.unit) : ""}</div>
      <div class="acts">
        <button data-act="cart" data-id="${i.id}">+ Cart</button>
        <button data-act="edit" data-id="${i.id}">Edit</button>
        ${i.link ? `<a class="btn" href="${esc(i.link)}" target="_blank" rel="noopener noreferrer">Store ↗</a>` : ""}
      </div>
    </div></div>`;
}

function render(app) {
  const gs = groups();
  app.innerHTML = `
    <div class="toolbar">
      <input type="search" id="q" placeholder="Search ingredients…" value="${esc(query)}">
      <div class="seg"><button data-act="view" data-v="category" class="${view === "category" ? "on" : ""}">By category</button><button data-act="view" data-v="section" class="${view === "section" ? "on" : ""}">By store section</button></div>
      <span class="grow"></span>
      <button data-act="manage" data-k="categories">Categories…</button>
      <button data-act="manage" data-k="sections">Store sections…</button>
      <button class="primary" data-act="new">+ Ingredient</button>
    </div>
    ${gs.length ? gs.map(([name, items]) => `<div class="group"><h2>${esc(name)} <span class="muted">${items.length}</span></h2>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">${items.map(card).join("")}</div></div>`).join("")
      : `<div class="empty">${state.ingredients.length ? "No ingredients match your search." : "Ingredients appear here automatically when you add them to a recipe. You can also add one with “+ Ingredient”."}</div>`}`;

  const q = app.querySelector("#q");
  q.oninput = () => { query = q.value; const pos = q.selectionStart; render(app); const n = app.querySelector("#q"); n.focus(); n.setSelectionRange(pos, pos); };

  app.onclick = async e => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const { act, id, v, k } = t.dataset;
    if (act === "view") { view = v; localStorage.setItem("ingView", v); render(app); }
    else if (act === "new") openIngredientModal(null);
    else if (act === "edit") openIngredientModal(state.ingredients.find(i => i.id === id));
    else if (act === "cart") { await addToCart(id, 1); toast("Added to cart"); render(app); }
    else if (act === "manage") openListModal(k);
  };
}

function openIngredientModal(ing) {
  let photo = ing?.photo || "";
  const m = openModal(ing ? "Edit ingredient" : "New ingredient", `
    <form id="iform">
      <label class="field">Name<input id="i-name" required value="${esc(ing?.name || "")}"></label>
      <div class="row">
        <label class="field grow">Category<input id="i-cat" list="cat-list" value="${esc(ing?.category || "")}" placeholder="Type to pick or create new"></label>
        <label class="field grow">Store section<input id="i-sec" list="sec-list" value="${esc(ing?.section || "")}" placeholder="Type to pick or create new"></label>
      </div>
      <datalist id="cat-list">${state.settings.categories.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
      <datalist id="sec-list">${state.settings.sections.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
      <div class="row">
        <label class="field grow">Price ($)<input id="i-price" type="number" min="0" step="0.01" value="${ing?.price || ""}"></label>
        <label class="field grow">Size / unit (optional)<input id="i-unit" value="${esc(ing?.unit || "")}" placeholder="e.g. 16 oz"></label>
      </div>
      <label class="field">Link to store<input id="i-link" type="url" value="${esc(ing?.link || "")}" placeholder="https://…"></label>
      <div class="field"><span class="muted">Photo</span>
        <img id="i-prev" class="photo-prev" ${photo ? `src="${photo}"` : "hidden"} alt="">
        <div class="row"><input type="file" id="i-photo" accept="image/*"><button type="button" id="i-rm" ${photo ? "" : "hidden"}>Remove</button></div></div>
      <div class="err" id="i-err"></div>
      <div class="modal-actions">${ing ? `<button type="button" class="danger left" id="i-del">Delete</button>` : ""}<button type="button" id="i-cancel">Cancel</button><button class="primary" type="submit">Save</button></div>
    </form>`);
  const prev = m.el.querySelector("#i-prev"), rm = m.el.querySelector("#i-rm");
  m.el.querySelector("#i-cancel").onclick = m.close;
  m.el.querySelector("#i-photo").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { photo = await fileToDataUrl(f, 500, 0.72); prev.src = photo; prev.hidden = false; rm.hidden = false; }
    catch (err) { m.el.querySelector("#i-err").textContent = err.message; }
  };
  rm.onclick = () => { photo = ""; prev.hidden = true; rm.hidden = true; m.el.querySelector("#i-photo").value = ""; };
  if (ing) m.el.querySelector("#i-del").onclick = async () => {
    if (!confirm(`Delete “${ing.name}”? It will be removed from recipes and your cart too.`)) return;
    await deleteIngredient(ing.id); m.close(); toast("Ingredient deleted");
  };
  m.el.querySelector("#iform").onsubmit = async e => {
    e.preventDefault();
    const name = m.el.querySelector("#i-name").value.trim();
    const dupe = state.ingredients.find(i => i.name.toLowerCase() === name.toLowerCase() && i.id !== ing?.id);
    if (dupe) { m.el.querySelector("#i-err").textContent = "You already have an ingredient with that name."; return; }
    try {
      await saveIngredient({
        name, photo,
        category: m.el.querySelector("#i-cat").value.trim(),
        section: m.el.querySelector("#i-sec").value.trim(),
        price: parseFloat(m.el.querySelector("#i-price").value) || 0,
        unit: m.el.querySelector("#i-unit").value.trim(),
        link: m.el.querySelector("#i-link").value.trim()
      }, ing?.id);
      m.close(); toast("Saved");
    } catch (err) { m.el.querySelector("#i-err").textContent = "Couldn't save: " + err.message; }
  };
}

function openListModal(kind) {
  const title = kind === "categories" ? "Categories" : "Store sections (in the order you walk the store)";
  const m = openModal(title, `<div class="list-edit"><ul id="l"></ul>
    <div class="row"><input id="l-new" placeholder="Add new…" class="grow"><button class="primary" id="l-add">Add</button></div>
    <p class="muted">Use ▲▼ to reorder. Removing one doesn't delete ingredients; they just show up as “Uncategorized”.</p></div>`);
  const draw = () => {
    const list = state.settings[kind];
    m.el.querySelector("#l").innerHTML = list.map((n, i) => `<li><span>${esc(n)}</span>
      <button class="icon" data-a="up" data-i="${i}" ${i === 0 ? "disabled" : ""}>▲</button>
      <button class="icon" data-a="down" data-i="${i}" ${i === list.length - 1 ? "disabled" : ""}>▼</button>
      <button class="icon danger" data-a="del" data-i="${i}">✕</button></li>`).join("");
  };
  draw();
  m.el.onclick = async e => {
    const b = e.target.closest("[data-a]");
    if (b) {
      const i = +b.dataset.i, list = [...state.settings[kind]];
      if (b.dataset.a === "del") list.splice(i, 1);
      else { const j = b.dataset.a === "up" ? i - 1 : i + 1;[list[i], list[j]] = [list[j], list[i]]; }
      await setList(kind, list); draw();
    }
  };
  const add = async () => {
    const inp = m.el.querySelector("#l-new"), v = inp.value.trim(); if (!v) return;
    if (state.settings[kind].some(x => x.toLowerCase() === v.toLowerCase())) return toast("Already in the list");
    await setList(kind, [...state.settings[kind], v]); inp.value = ""; draw();
  };
  m.el.querySelector("#l-add").onclick = add;
  m.el.querySelector("#l-new").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); add(); } };
}

boot("ingredients", render);
