# Meal Planner

A personal recipe + meal-planning site that runs on **GitHub Pages** and saves everything (recipes, photos, ingredients, plan, cart) to **Firebase** behind your login.

- **Planner** – pick a main, optional side, and required veggie per day, with shuffle buttons (per slot, per day, or the whole week). Recipes live at the bottom of this page.
- **Calendar** – week or month view of your plan; click a day to edit it.
- **Ingredients** – everything from your recipes, grouped by category or by store section. Add photo, store link, price. Create your own categories and sections.
- **Cart** – ingredients from planned recipes are added automatically (and removed again if you change the plan). Checklist grouped by store section with running totals.

No build step: plain HTML + JavaScript.

## Setup (about 10 minutes)

### 1. Create the Firebase project
1. Go to <https://console.firebase.google.com> → **Add project** (Analytics not needed).
2. **Build → Authentication → Get started** → enable **Email/Password** (and **Google** if you want that button).
3. **Build → Firestore Database → Create database** → production mode → pick a region near you.
4. In Firestore, open the **Rules** tab, paste the contents of `firestore.rules`, and **Publish**.
   (Photos are stored inside Firestore as compressed images, so you do **not** need Firebase Storage.)
5. **Project settings (gear) → Your apps → Web (`</>`)** → register an app → copy the `firebaseConfig` values.

### 2. Add your config
Open `js/firebase-config.js` and replace the `PASTE_...` values with your config.

### 3. Put it on GitHub
1. Create a new repository (e.g. `meal-planner`) and upload all these files to the root (keep the `css/` and `js/` folders).
2. Repo **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)` → Save.
3. After a minute your site is at `https://<your-username>.github.io/meal-planner/`.

### 4. Authorize your site for login
Firebase console → **Authentication → Settings → Authorized domains** → **Add domain** → `<your-username>.github.io`.

### 5. Use it
Open the site, click **Create account**, and start adding recipes on the Planner page.

## Notes
- Your Firebase config is public by design; your data is protected by login plus the rules in `firestore.rules` (each user can only access their own data).
- Photos are resized in your browser (recipes ~1000px, ingredients ~500px) to stay under Firestore's 1 MB-per-document limit.
- "Qty to buy" on a recipe line is how many of that item go in the cart when the recipe is planned (e.g. 2 cans of beans).
- Test locally with any static server (e.g. `python3 -m http.server`) – opening files directly with `file://` won't work with JS modules. Add `localhost` to Firebase's authorized domains for that.
