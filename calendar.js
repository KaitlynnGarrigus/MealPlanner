import { boot, state, esc, ymd, addDays, startOfWeek, SLOT_META, LEFTOVERS } from "./core.js";

let view = localStorage.getItem("calView") || "week";
let anchor = new Date();
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ORDER = ["breakfast", "lunch", "lunchHealthy", "main", "side", "veg"];
const recipeById = id => state.recipes.find(r => r.id === id);

// Everything planned for a day, in meal order. Leftovers show what they're from.
function meals(date) {
  const p = state.plan[ymd(date)] || {};
  const prev = recipeById((state.plan[ymd(addDays(date, -1))] || {}).main);
  const out = [];
  for (const slot of ORDER) {
    if (slot === "lunch" && p.lunch === LEFTOVERS) {
      out.push({ slot, name: prev ? `Leftovers: ${prev.name}` : "Leftovers", r: prev || null });
      continue;
    }
    const r = recipeById(p[slot]);
    if (r) out.push({ slot, name: r.name, r });
  }
  return out;
}

function weekCard(d) {
  const key = ymd(d);
  const list = meals(d);
  return `<div class="card day ${key === ymd(new Date()) ? "today" : ""}" data-go="${key}" style="cursor:pointer">
    <div class="day-head"><div><b>${DOW[(d.getDay() + 6) % 7]}</b> <span class="muted">${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></div></div>
    ${list.length ? list.map(({ slot, name, r }) => `<div class="wmeal">${r?.photo ? `<img src="${r.photo}" alt="">` : `<div class="ph">${slot === "lunch" && !r ? "♻️" : SLOT_META[slot].emoji}</div>`}
        <div><div class="muted" style="font-size:.72rem">${SLOT_META[slot].label}</div><div>${esc(name)}</div></div></div>`).join("") : `<div class="muted">Nothing planned</div>`}
  </div>`;
}

function monthCell(d, month) {
  const key = ymd(d);
  return `<div class="cal-cell ${d.getMonth() !== month ? "out" : ""} ${key === ymd(new Date()) ? "today" : ""}" data-go="${key}">
    <div class="dnum">${d.getDate()}</div>
    ${meals(d).map(({ slot, name }) => `<div class="chip ${slot}" title="${esc(SLOT_META[slot].label + ": " + name)}">${slot === "lunch" && name.startsWith("Leftovers") ? "♻️" : SLOT_META[slot].emoji} ${esc(name)}</div>`).join("")}
  </div>`;
}

function render(app) {
  let label, body;
  if (view === "week") {
    const s = startOfWeek(anchor), e = addDays(s, 6);
    label = `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    body = `<div class="cal-week">${Array.from({ length: 7 }, (_, i) => weekCard(addDays(s, i))).join("")}</div>`;
  } else {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const s = startOfWeek(first);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const weeks = Math.ceil(((last - s) / 86400000 + 1) / 7);
    label = anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    body = `<div class="cal-month">${DOW.map(d => `<div class="cal-dow">${d}</div>`).join("")}${Array.from({ length: weeks * 7 }, (_, i) => monthCell(addDays(s, i), anchor.getMonth())).join("")}</div>`;
  }
  app.innerHTML = `
    <div class="toolbar">
      <button data-act="prev">◀</button><div class="title">${label}</div><button data-act="next">▶</button>
      <button data-act="today">Today</button><span class="grow"></span>
      <div class="seg"><button data-act="view" data-v="week" class="${view === "week" ? "on" : ""}">Week</button><button data-act="view" data-v="month" class="${view === "month" ? "on" : ""}">Month</button></div>
    </div>
    <p class="muted" style="margin-top:-.4rem">Click a day to edit it in the Planner.</p>
    ${body}`;

  app.onclick = e => {
    const go = e.target.closest("[data-go]");
    if (go && !e.target.closest("[data-act]")) { location.href = `planner.html?date=${go.dataset.go}`; return; }
    const t = e.target.closest("[data-act]"); if (!t) return;
    const step = view === "week" ? 7 : 0;
    if (t.dataset.act === "prev") anchor = view === "week" ? addDays(anchor, -step) : new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
    else if (t.dataset.act === "next") anchor = view === "week" ? addDays(anchor, step) : new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    else if (t.dataset.act === "today") anchor = new Date();
    else if (t.dataset.act === "view") { view = t.dataset.v; localStorage.setItem("calView", view); }
    render(app);
  };
}

boot("calendar", render);
