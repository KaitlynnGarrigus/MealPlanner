import {
  boot, state, esc, money, toast, cartLines, lineTotal, setCartQty, toggleChecked, removeFromCart, clearCart, addToCart
} from "./core.js";

function render(app) {
  const lines = cartLines();
  const total = lines.reduce((s, l) => s + lineTotal(l), 0);
  const remaining = lines.filter(l => !l.item.checked).reduce((s, l) => s + lineTotal(l), 0);
  const noPrice = lines.filter(l => !l.ing.price).length;

  // group by store section, in the order set on the Ingredients page
  const order = state.settings.sections || [];
  const map = new Map(order.map(o => [o, []]));
  lines.sort((a, b) => a.ing.name.localeCompare(b.ing.name)).forEach(l => {
    const k = l.ing.section || "Uncategorized";
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(l);
  });
  const groups = [...map].filter(([, items]) => items.length);

  const row = ({ item, ing }) => `<li class="cart-row ${item.checked ? "done" : ""}">
    <input type="checkbox" data-act="check" data-id="${item.id}" ${item.checked ? "checked" : ""} aria-label="Got ${esc(ing.name)}">
    ${ing.photo ? `<img class="thumb" src="${ing.photo}" alt="">` : `<div class="thumb" style="display:flex;align-items:center;justify-content:center">🥕</div>`}
    <div class="grow"><div class="name">${ing.link ? `<a href="${esc(ing.link)}" target="_blank" rel="noopener noreferrer">${esc(ing.name)}</a>` : esc(ing.name)}</div>
      <div class="muted">${ing.price ? money(ing.price) + " each" : "no price"}${ing.unit ? " · " + esc(ing.unit) : ""}</div></div>
    <div class="qty"><button class="icon" data-act="dec" data-id="${item.id}">−</button><b>${item.qty}</b><button class="icon" data-act="inc" data-id="${item.id}">+</button></div>
    <div class="line">${ing.price ? money(lineTotal({ item, ing })) : "—"}</div>
    <button class="icon" data-act="remove" data-id="${item.id}" aria-label="Remove">✕</button></li>`;

  app.innerHTML = `
    <div class="toolbar"><h1 style="margin:0">My cart</h1><span class="grow"></span>
      <button data-act="clear-checked" ${lines.some(l => l.item.checked) ? "" : "disabled"}>Clear checked</button>
      <button class="danger" data-act="clear-all" ${lines.length ? "" : "disabled"}>Empty cart</button></div>
    <div class="card totals">
      <div><div class="muted">Total</div><div class="big">${money(total)}</div></div>
      <div><div class="muted">Still to buy</div><div class="big">${money(remaining)}</div></div>
      <div><div class="muted">Items</div><div class="big">${lines.length}</div></div>
      ${noPrice ? `<div class="warn" style="align-self:center">${noPrice} item${noPrice > 1 ? "s have" : " has"} no price yet — add one on the Ingredients page.</div>` : ""}
    </div>
    ${groups.length ? groups.map(([name, items]) => `<div class="card cart-group"><h3><span>${esc(name)}</span><span class="muted">${money(items.reduce((s, l) => s + lineTotal(l), 0))}</span></h3>
        <ul class="cart-list">${items.map(row).join("")}</ul></div>`).join("")
      : `<div class="empty">Your cart is empty. Add recipes to a day in the Planner and their ingredients show up here.</div>`}
    <div class="card row"><b>Add something else:</b>
      <select id="add-sel"><option value="">Choose an ingredient…</option>${[...state.ingredients].sort((a, b) => a.name.localeCompare(b.name)).map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join("")}</select>
      <button id="add-btn">Add</button></div>`;

  app.querySelector("#add-btn").onclick = async () => {
    const id = app.querySelector("#add-sel").value; if (!id) return;
    await addToCart(id, 1); render(app);
  };
  app.onclick = async e => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const { act, id } = t.dataset;
    const cur = state.cart.find(c => c.id === id);
    try {
      if (act === "check") await toggleChecked(id);
      else if (act === "inc") await setCartQty(id, cur.qty + 1);
      else if (act === "dec") await setCartQty(id, cur.qty - 1);
      else if (act === "remove") await removeFromCart(id);
      else if (act === "clear-checked") await clearCart(true);
      else if (act === "clear-all") { if (!confirm("Remove everything from your cart?")) return; await clearCart(false); }
      render(app);
    } catch (err) { toast("Something went wrong: " + err.message); }
  };
}

boot("cart", render);
