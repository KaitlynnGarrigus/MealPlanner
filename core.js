// Shared logic: Firebase, auth, live data, units, cart/plan logic, small UI helpers.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

/* ---------- tiny helpers ---------- */
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const money = n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
export const fmtNum = n => String(Math.round((n || 0) * 100) / 100);
export const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parseYmd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const startOfWeek = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }; // Monday
export const TYPES = {
  main: { label: "Main course", short: "Main", emoji: "🍽️" },
  side: { label: "Side", short: "Side", emoji: "🥔" },
  veg: { label: "Veggie", short: "Veggie", emoji: "🥦" }
};
export const MEALS = {
  breakfast: { label: "Breakfast", emoji: "🍳" },
  lunch: { label: "Lunch", emoji: "🥪" },
  dinner: { label: "Dinner", emoji: "🍽️" }
};
export const LEFTOVERS = "leftovers"; // special value for the lunch slot
export const mealOf = r => r.meal || "dinner"; // recipes saved before meals existed are dinners
export const SLOT_META = {
  breakfast: { label: "Breakfast", emoji: "🍳" },
  lunch: { label: "Lunch", emoji: "🥪" },
  lunchHealthy: { label: "Lunch healthy option", emoji: "🥗" },
  main: { label: "Dinner main", emoji: "🍽️" },
  side: { label: "Dinner side", emoji: "🥔" },
  veg: { label: "Dinner veggie", emoji: "🥦" }
};
export const DEFAULT_CATEGORIES = ["Produce", "Protein", "Dairy & Eggs", "Grains & Pasta", "Canned Goods", "Sauces & Condiments", "Spices", "Frozen", "Other"];
export const DEFAULT_SECTIONS = ["Produce", "Meat & Seafood", "Dairy & Eggs", "Bakery", "Canned & Dry Goods", "Frozen", "Spices & Baking", "Beverages", "Other"];

export function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

export function openModal(title, html, opts = {}) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal ${opts.wide ? "wide" : ""}" role="dialog" aria-modal="true"><div class="modal-head"><h2>${esc(title)}</h2><button class="icon" data-close aria-label="Close">✕</button></div><div class="modal-body">${html}</div></div>`;
  const close = () => { overlay.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = e => { if (e.key === "Escape") close(); };
  overlay.addEventListener("mousedown", e => { if (e.target === overlay) close(); });
  overlay.querySelector("[data-close]").onclick = close;
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  return { el: overlay.querySelector(".modal-body"), close };
}

// Resize + compress a photo so it fits comfortably inside a Firestore document (1 MB limit).
export function fileToDataUrl(file, max = 800, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * s), h = Math.round(img.height * s);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Could not read that image"));
    img.src = url;
  });
}

/* ---------- units ---------- */
// Weight converts to grams, volume to ml. Each count-type unit (can, bunch, ...) only matches itself.
const W = "weight", V = "volume";
export const UNITS = {
  oz: { dim: W, f: 28.3495 }, lb: { dim: W, f: 453.592 }, g: { dim: W, f: 1 }, kg: { dim: W, f: 1000 },
  tsp: { dim: V, f: 4.92892 }, tbsp: { dim: V, f: 14.7868 }, "fl oz": { dim: V, f: 29.5735 }, cup: { dim: V, f: 236.588 },
  pt: { dim: V, f: 473.176 }, qt: { dim: V, f: 946.353 }, gal: { dim: V, f: 3785.41 }, ml: { dim: V, f: 1 }, l: { dim: V, f: 1000 },
  each: { dim: "each", f: 1 }, can: { dim: "can", f: 1 }, bunch: { dim: "bunch", f: 1 }, clove: { dim: "clove", f: 1 },
  head: { dim: "head", f: 1 }, slice: { dim: "slice", f: 1 }, stick: { dim: "stick", f: 1 }, bottle: { dim: "bottle", f: 1 },
  jar: { dim: "jar", f: 1 }, bag: { dim: "bag", f: 1 }, pkg: { dim: "pkg", f: 1 }
};
export const UNIT_GROUPS = [
  ["Weight", ["oz", "lb", "g", "kg"]],
  ["Volume", ["tsp", "tbsp", "fl oz", "cup", "pt", "qt", "gal", "ml", "l"]],
  ["Count", ["each", "can", "bunch", "clove", "head", "slice", "stick", "bottle", "jar", "bag", "pkg"]]
];
export const unitOptions = sel => UNIT_GROUPS.map(([g, us]) => `<optgroup label="${g}">${us.map(u => `<option value="${esc(u)}" ${u === sel ? "selected" : ""}>${u}</option>`).join("")}</optgroup>`).join("");
export const unitDef = u => UNITS[u] || UNITS.each;
export const sameDim = (a, b) => unitDef(a).dim === unitDef(b).dim;
const isMeasure = u => [W, V].includes(unitDef(u).dim);

/* ---------- firebase + live state ---------- */
const configured = !String(firebaseConfig.apiKey).startsWith("PASTE");
let app, auth, db;
if (configured) { app = initializeApp(firebaseConfig); auth = getAuth(app); db = getFirestore(app); }

export const state = {
  user: null, recipes: [], ingredients: [], plan: {}, cart: [],
  settings: { categories: DEFAULT_CATEGORIES, sections: DEFAULT_SECTIONS }
};
const ready = {};
let unsubs = [];
let renderFn = null;
let pending = false;
const SLOT_KEYS = ["main", "side", "veg", "breakfast", "lunch", "lunchHealthy"];

// Which recipes can go in a given day slot.
export function poolFor(slot) {
  const r = state.recipes;
  if (slot === "breakfast") return r.filter(x => mealOf(x) === "breakfast");
  if (slot === "lunch") return r.filter(x => mealOf(x) === "lunch" && x.type !== "veg");
  if (slot === "lunchHealthy") return r.filter(x => x.type === "veg" && ["lunch", "dinner"].includes(mealOf(x)));
  return r.filter(x => mealOf(x) === "dinner" && x.type === slot); // main / side / veg
}

const ucol = name => collection(db, "users", state.user.uid, name);
const uref = (name, id) => doc(db, "users", state.user.uid, name, id);

function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    updateNav();
    if (renderFn && ["recipes", "ingredients", "plan", "cart", "settings"].every(k => ready[k])) renderFn(document.getElementById("app"));
  });
}

// Cart docs from the first version only had `qty` (packages); convert them on the fly.
function normCart(d) {
  const x = { id: d.id, ...d.data() };
  if (x.needBase == null) { x.manual = x.qty || 1; x.needBase = 0; }
  x.manual = x.manual || 0; x.override = x.override ?? null; x.checked = !!x.checked;
  return x;
}

function subscribe() {
  const listen = (name, assign) => unsubs.push(onSnapshot(ucol(name), snap => { assign(snap); ready[name] = true; schedule(); }, err => { console.error(err); toast("Database error: " + err.message); }));
  listen("recipes", s => state.recipes = s.docs.map(d => ({ id: d.id, ...d.data() })));
  listen("ingredients", s => state.ingredients = s.docs.map(d => ({ id: d.id, ...d.data() })));
  listen("plan", s => { state.plan = {}; s.docs.forEach(d => state.plan[d.id] = d.data()); });
  listen("cart", s => state.cart = s.docs.map(normCart));
  unsubs.push(onSnapshot(uref("meta", "settings"), snap => {
    if (!snap.exists()) { setDoc(uref("meta", "settings"), { categories: DEFAULT_CATEGORIES, sections: DEFAULT_SECTIONS }); return; }
    const d = snap.data();
    state.settings = { categories: d.categories || DEFAULT_CATEGORIES, sections: d.sections || DEFAULT_SECTIONS };
    ready.settings = true; schedule();
  }));
}

/* ---------- page boot, nav, login ---------- */
const PAGES = [
  ["planner", "planner.html", "🍽️ Planner"],
  ["recipes", "recipes.html", "📖 Recipes"],
  ["calendar", "calendar.html", "📅 Calendar"],
  ["ingredients", "ingredients.html", "🥕 Ingredients"],
  ["cart", "cart.html", "🛒 Cart"]
];

function renderNav(page) {
  document.getElementById("nav").innerHTML = `
    <a class="brand" href="planner.html">🥘 Meal Planner</a>
    <nav>${PAGES.map(([id, href, label]) => `<a href="${href}" class="${id === page ? "active" : ""}">${label}${id === "cart" ? '<span class="badge" id="cartBadge" hidden></span>' : ""}</a>`).join("")}</nav>
    <div class="user" id="user"></div>`;
}

function updateNav() {
  const u = document.getElementById("user");
  if (u) {
    u.innerHTML = state.user ? `<span>${esc(state.user.email || "Signed in")}</span><button id="signout">Sign out</button>` : "";
    const b = document.getElementById("signout");
    if (b) b.onclick = () => signOut(auth);
  }
  const badge = document.getElementById("cartBadge");
  if (badge) {
    const n = state.cart.filter(c => !c.checked).length;
    badge.hidden = !n; badge.textContent = n;
  }
}

function showSetup(app) {
  app.innerHTML = `<div class="card login"><h2>One-time setup needed</h2>
    <p>Open <code>firebase-config.js</code> and paste in your Firebase web app config. The README walks through it step by step.</p></div>`;
}

function showLogin(app) {
  app.innerHTML = `<form class="card login" id="loginForm">
    <h2>Sign in to your meal planner</h2>
    <label class="field">Email<input type="email" id="email" required autocomplete="email"></label>
    <label class="field">Password<input type="password" id="password" required minlength="6" autocomplete="current-password"></label>
    <div class="err" id="err"></div>
    <div class="row"><button class="primary" type="submit">Sign in</button><button type="button" id="signup">Create account</button></div>
    <p class="row"><button type="button" id="google">Continue with Google</button><button type="button" id="reset" class="muted" style="border:0;background:none;text-decoration:underline">Forgot password?</button></p>
  </form>`;
  const err = m => document.getElementById("err").textContent = m || "";
  const nice = e => ({
    "auth/invalid-credential": "Wrong email or password.", "auth/user-not-found": "No account with that email.",
    "auth/wrong-password": "Wrong email or password.", "auth/email-already-in-use": "That email already has an account — try signing in.",
    "auth/weak-password": "Password must be at least 6 characters.", "auth/invalid-email": "That email doesn't look right.",
    "auth/popup-closed-by-user": "", "auth/unauthorized-domain": "This site's domain isn't authorized in Firebase (Authentication → Settings → Authorized domains)."
  }[e.code] ?? e.message);
  const creds = () => [document.getElementById("email").value.trim(), document.getElementById("password").value];
  document.getElementById("loginForm").onsubmit = async e => { e.preventDefault(); err(); try { await signInWithEmailAndPassword(auth, ...creds()); } catch (x) { err(nice(x)); } };
  document.getElementById("signup").onclick = async () => { err(); try { await createUserWithEmailAndPassword(auth, ...creds()); } catch (x) { err(nice(x)); } };
  document.getElementById("google").onclick = async () => { err(); try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (x) { err(nice(x)); } };
  document.getElementById("reset").onclick = async () => {
    const [email] = creds(); if (!email) return err("Enter your email first.");
    try { await sendPasswordResetEmail(auth, email); err(""); toast("Password reset email sent"); } catch (x) { err(nice(x)); }
  };
}

export function boot(page, render) {
  renderNav(page);
  renderFn = render;
  const appEl = document.getElementById("app");
  if (!configured) return showSetup(appEl);
  onAuthStateChanged(auth, user => {
    unsubs.forEach(u => u()); unsubs = [];
    Object.keys(ready).forEach(k => delete ready[k]);
    state.user = user;
    updateNav();
    if (!user) return showLogin(appEl);
    appEl.innerHTML = `<p class="muted">Loading your data…</p>`;
    subscribe();
  });
}

/* ---------- settings lists (categories / store sections) ---------- */
export async function setList(kind, arr) {
  state.settings[kind] = arr;
  await setDoc(uref("meta", "settings"), { [kind]: arr }, { merge: true });
}
export async function ensureInList(kind, value) {
  const v = (value || "").trim();
  if (!v || state.settings[kind].some(x => x.toLowerCase() === v.toLowerCase())) return;
  await setList(kind, [...state.settings[kind], v]);
}

/* ---------- package math ---------- */
// A recipe line is { ingredientId, amount, unit }. (Older lines have `qty` instead of `amount`.)
export const lineAmount = l => l.amount ?? l.qty ?? 1;
export const lineUnit = (l, ing) => l.unit || ing?.packUnit || "each";
// Size of one package in base units (g / ml / count). 0 = package size not set yet.
export const packBase = ing => (ing.packSize > 0 ? ing.packSize * unitDef(ing.packUnit || "each").f : 0);
export const packUnitOf = ing => ing.packUnit || "each";
export const toPackUnit = (ing, base) => base / unitDef(packUnitOf(ing)).f;
export const lineMismatch = (line, ing) => packBase(ing) > 0 && !sameDim(lineUnit(line, ing), packUnitOf(ing));

// How much of the ingredient a recipe line needs, in base units.
export function contribution(line, ing) {
  const amt = lineAmount(line), pb = packBase(ing), u = lineUnit(line, ing);
  if (pb > 0) return sameDim(u, packUnitOf(ing)) ? amt * unitDef(u).f : pb; // can't convert → assume 1 package
  return isMeasure(u) ? 1 : amt; // package size unknown: measured amounts count as 1 package, counts as-is
}

// Packages to buy for a cart item.
export function packagesFor(item, ing) {
  if (item.override != null) return item.override;
  const pb = packBase(ing), need = item.needBase || 0;
  const auto = need <= 1e-9 ? 0 : Math.ceil((pb > 0 ? need / pb : need) - 1e-9);
  return auto + (item.manual || 0);
}

// Leftover numbers for buying `packs` packages when `needBase` is actually used.
export function usage(ing, needBase, packs) {
  const pb = packBase(ing);
  if (!(pb > 0)) return null;
  const bought = packs * pb, price = ing.price || 0;
  const leftover = Math.max(0, bought - needBase);
  return {
    bought, leftover, needed: needBase,
    pct: bought > 0 ? leftover / bought : 0,
    leftoverValue: leftover / pb * price,
    usedValue: Math.min(needBase, bought) / pb * price,
    boughtText: `${fmtNum(toPackUnit(ing, bought))} ${packUnitOf(ing)}`,
    neededText: `${fmtNum(toPackUnit(ing, needBase))} ${packUnitOf(ing)}`,
    leftoverText: `${fmtNum(toPackUnit(ing, leftover))} ${packUnitOf(ing)}`
  };
}

// Per-ingredient breakdown for one recipe, assuming you buy whole packages just for it.
export function recipeAnalysis(recipe) {
  const rows = [];
  for (const line of recipe.ingredients || []) {
    const ing = state.ingredients.find(i => i.id === line.ingredientId);
    if (!ing) continue;
    const need = contribution(line, ing), pb = packBase(ing);
    const packs = Math.max(1, Math.ceil((pb > 0 ? need / pb : need) - 1e-9));
    const u = usage(ing, need, packs);
    rows.push({
      line, ing, packs, usage: u, mismatch: lineMismatch(line, ing), noSize: !(pb > 0),
      packCost: packs * (ing.price || 0),
      usedCost: u ? u.usedValue : packs * (ing.price || 0)
    });
  }
  return {
    rows,
    usedCost: rows.reduce((s, r) => s + r.usedCost, 0),
    packCost: rows.reduce((s, r) => s + r.packCost, 0),
    leftoverValue: rows.reduce((s, r) => s + (r.usage?.leftoverValue || 0), 0)
  };
}

export const recipesUsing = ingredientId => state.recipes.filter(r => (r.ingredients || []).some(l => l.ingredientId === ingredientId));

/* ---------- ingredients ---------- */
export const findIngredient = name => state.ingredients.find(i => i.name.toLowerCase() === name.trim().toLowerCase());

export async function ensureIngredient(name, unit) {
  const hit = findIngredient(name);
  if (hit) return hit.id;
  const ref = doc(ucol("ingredients"));
  const data = { name: name.trim(), category: "", section: "", price: 0, packSize: 0, packUnit: unit || "each", unit: "", link: "", photo: "" };
  await setDoc(ref, data);
  state.ingredients.push({ id: ref.id, ...data });
  return ref.id;
}

export async function saveIngredient(data, id) {
  const old = id ? state.ingredients.find(x => x.id === id) : null;
  const ref = id ? uref("ingredients", id) : doc(ucol("ingredients"));
  await setDoc(ref, data);
  const rec = { id: ref.id, ...data };
  const i = state.ingredients.findIndex(x => x.id === ref.id);
  if (i >= 0) state.ingredients[i] = rec; else state.ingredients.push(rec);
  await ensureInList("categories", data.category);
  await ensureInList("sections", data.section);
  if (old && ((old.packSize || 0) !== (data.packSize || 0) || packUnitOf(old) !== packUnitOf(data))) await recomputeNeed(ref.id);
  return ref.id;
}

export async function deleteIngredient(id) {
  const batch = writeBatch(db);
  batch.delete(uref("ingredients", id));
  batch.delete(uref("cart", id));
  state.cart = state.cart.filter(c => c.id !== id);
  state.recipes.forEach(r => {
    if ((r.ingredients || []).some(l => l.ingredientId === id)) {
      batch.update(uref("recipes", r.id), { ingredients: r.ingredients.filter(l => l.ingredientId !== id) });
    }
  });
  await batch.commit();
}

/* ---------- cart ---------- */
// Cart item: { id (= ingredient id), needBase (from planned meals), manual (extra packages added by hand), override (packages, or null), checked }
export const cartLines = () => state.cart
  .map(item => ({ item, ing: state.ingredients.find(i => i.id === item.id) }))
  .filter(x => x.ing);
export const linePackages = ({ item, ing }) => packagesFor(item, ing);
export const lineTotal = l => (l.ing.price || 0) * packagesFor(l.item, l.ing);

const writeCartItem = c => setDoc(uref("cart", c.id), {
  ingredientId: c.id, needBase: c.needBase || 0, manual: c.manual || 0, override: c.override ?? null, checked: !!c.checked
});

export async function addToCart(ingredientId, n = 1) {
  let cur = state.cart.find(c => c.id === ingredientId);
  if (cur) { cur.manual = (cur.manual || 0) + n; cur.override = null; cur.checked = false; }
  else { cur = { id: ingredientId, needBase: 0, manual: n, override: null, checked: false }; state.cart.push(cur); }
  await writeCartItem(cur);
}
export async function setCartQty(id, qty) {
  if (qty <= 0) return removeFromCart(id);
  const cur = state.cart.find(c => c.id === id); if (!cur) return;
  cur.override = qty;
  await writeCartItem(cur);
}
export async function resetCartQty(id) {
  const cur = state.cart.find(c => c.id === id); if (!cur) return;
  cur.override = null;
  await writeCartItem(cur);
}
export async function toggleChecked(id) {
  const cur = state.cart.find(c => c.id === id); if (!cur) return;
  cur.checked = !cur.checked;
  await writeCartItem(cur);
}
export async function removeFromCart(id) {
  state.cart = state.cart.filter(c => c.id !== id);
  await deleteDoc(uref("cart", id));
}
export async function clearCart(onlyChecked) {
  const targets = state.cart.filter(c => !onlyChecked || c.checked);
  state.cart = state.cart.filter(c => !targets.includes(c));
  for (let i = 0; i < targets.length; i += 400) {
    const batch = writeBatch(db);
    targets.slice(i, i + 400).forEach(c => batch.delete(uref("cart", c.id)));
    await batch.commit();
  }
}

// Add (+1) or remove (-1) one serving of a recipe's ingredients to/from the cart.
async function adjustCart(recipeId, sign) {
  const r = state.recipes.find(x => x.id === recipeId);
  if (!r) return;
  const batch = writeBatch(db);
  let touched = false;
  for (const line of r.ingredients || []) {
    const ing = state.ingredients.find(i => i.id === line.ingredientId);
    if (!ing) continue;
    const cur = state.cart.find(c => c.id === ing.id);
    const need = Math.max(0, (cur?.needBase || 0) + sign * contribution(line, ing));
    const next = { id: ing.id, needBase: need, manual: cur?.manual || 0, override: null, checked: sign > 0 ? false : !!cur?.checked };
    const ref = uref("cart", ing.id);
    touched = true;
    if (need <= 1e-9 && !next.manual) {
      batch.delete(ref);
      state.cart = state.cart.filter(c => c.id !== ing.id);
    } else {
      batch.set(ref, { ingredientId: ing.id, needBase: need, manual: next.manual, override: null, checked: next.checked });
      if (cur) Object.assign(cur, next); else state.cart.push(next);
    }
  }
  if (touched) await batch.commit();
}

// Rebuild one ingredient's planned amount from the meal plan (used when its package size/unit changes).
async function recomputeNeed(ingredientId) {
  const cur = state.cart.find(c => c.id === ingredientId);
  const ing = state.ingredients.find(i => i.id === ingredientId);
  if (!cur || !ing) return;
  let need = 0;
  for (const day of Object.values(state.plan)) {
    for (const s of SLOT_KEYS) {
      const r = state.recipes.find(x => x.id === day[s]);
      if (!r) continue;
      for (const l of r.ingredients || []) if (l.ingredientId === ingredientId) need += contribution(l, ing);
    }
  }
  cur.needBase = need; cur.override = null;
  await writeCartItem(cur);
}

/* ---------- meal plan ---------- */
export async function setPlanSlot(date, slot, newId) {
  const cur = state.plan[date] || {};
  const old = cur[slot] || null;
  newId = newId || null;
  if (old === newId) return;
  state.plan[date] = { ...cur, [slot]: newId };
  if (old) await adjustCart(old, -1);
  if (newId) await adjustCart(newId, +1);
  await setDoc(uref("plan", date), { [slot]: newId }, { merge: true });
}

const planUses = id => Object.values(state.plan).reduce((n, day) => n + SLOT_KEYS.filter(s => day[s] === id).length, 0);

/* ---------- recipes ---------- */
export async function saveRecipe(data, id) {
  const uses = id ? planUses(id) : 0;
  for (let i = 0; i < uses; i++) await adjustCart(id, -1); // take out old ingredient list
  const ref = id ? uref("recipes", id) : doc(ucol("recipes"));
  await setDoc(ref, data);
  const rec = { id: ref.id, ...data };
  const i = state.recipes.findIndex(r => r.id === ref.id);
  if (i >= 0) state.recipes[i] = rec; else state.recipes.push(rec);
  for (let k = 0; k < uses; k++) await adjustCart(ref.id, +1); // put the new list back
  return ref.id;
}

export async function deleteRecipe(id) {
  for (const [date, day] of Object.entries(state.plan)) {
    for (const slot of SLOT_KEYS) if (day[slot] === id) await setPlanSlot(date, slot, null);
  }
  await deleteDoc(uref("recipes", id));
  state.recipes = state.recipes.filter(r => r.id !== id);
}
