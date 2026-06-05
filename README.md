# Kroger Ingredient Linker

A Node.js/Express app that lets you search Kroger products and link them to ingredients in your Notion database. Designed to be hosted on Vercel.

## What it does

- Loads all ingredients from your Notion Ingredients database
- For each ingredient, lets you search Kroger's product catalog
- You pick the exact product → it saves the Product ID, name, and image back to Notion
- Optionally find your local Kroger store for accurate pricing
- Progress bar tracks how many ingredients are linked

---

## Setup

### 1. Clone or download this project

```bash
git clone <your-repo-url>
cd kroger-linker
npm install
```

### 2. Get your credentials

**Notion:**
1. Go to [notion.so/my-integrations](https://notion.so/my-integrations)
2. Click "New integration" → give it a name → Submit
3. Copy the `ntn_...` token
4. Open your Food page in Notion → click `...` (top right) → Connections → add your integration

**Kroger:**
1. Go to [developer.kroger.com](https://developer.kroger.com)
2. Create an account → Create a new app
3. Copy your **Client ID** and **Client Secret**
4. For "Redirect URI" enter `https://your-app.vercel.app/callback` (doesn't need to work, just required)

### 3. Configure environment variables

Copy the example file:
```bash
cp .env.example .env
```

Edit `.env`:
```
NOTION_TOKEN=ntn_xxxxxxxxxxxxxxxxxxxx
NOTION_INGREDIENTS_DB_ID=92eecf3137ff4439a7d2e2b3b0a207ef
KROGER_CLIENT_ID=your_client_id_here
KROGER_CLIENT_SECRET=your_client_secret_here
```

> The `NOTION_INGREDIENTS_DB_ID` is already filled in with your database ID.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deploy to Vercel

### Option A: Vercel CLI (fastest)

```bash
npm install -g vercel
vercel
```

Follow the prompts. When it asks about environment variables, add them one by one, or do it in the next step.

### Option B: Vercel Dashboard

1. Push this project to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → "Add New Project"
3. Import your GitHub repo
4. Before deploying, go to **Settings → Environment Variables** and add:
   - `NOTION_TOKEN`
   - `NOTION_INGREDIENTS_DB_ID` → `92eecf3137ff4439a7d2e2b3b0a207ef`
   - `KROGER_CLIENT_ID`
   - `KROGER_CLIENT_SECRET`
5. Click **Deploy**

### Setting env vars via CLI (if you used Option A)

```bash
vercel env add NOTION_TOKEN
vercel env add NOTION_INGREDIENTS_DB_ID
vercel env add KROGER_CLIENT_ID
vercel env add KROGER_CLIENT_SECRET
vercel --prod  # redeploy with the new vars
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notion/ingredients` | Fetch all ingredients from Notion |
| PATCH | `/api/notion/ingredients/:id` | Save Kroger product to an ingredient |
| GET | `/api/kroger/search?q=chicken` | Search Kroger products |
| GET | `/api/kroger/locations?zip=30301` | Find nearby Kroger stores |

---

## Project Structure

```
kroger-linker/
├── server.js                  # Express entry point
├── vercel.json                # Vercel routing config
├── package.json
├── .env.example               # Copy to .env and fill in
├── api/
│   ├── notion.js              # Notion API proxy routes
│   └── kroger.js              # Kroger API proxy + token caching
└── public/
    ├── index.html             # App shell
    └── src/
        ├── style.css          # Styles
        └── app.js             # Frontend logic
```

---

## Next Steps (Cart Builder)

Once your ingredients are linked, the next phase is building the Meal → Cart feature:
- Select meals from your Notion Meals database
- App collects all ingredient IDs for those meals
- Uses Kroger's cart API (requires user OAuth) to add products to your cart

This will require adding Kroger OAuth so the app can act on your behalf to modify your cart.
