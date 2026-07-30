# Paycheck Splitter

A simple web app that lets you enter a paycheck amount and split it with a mix of **fixed dollar amounts** and **percentages of the full paycheck**. Every split can be saved so you can see totals per category over time.

- **Frontend**: plain HTML + Tailwind + vanilla JS (no build step)
- **Backend / DB**: [Supabase](https://supabase.com) (Postgres + Auth)
- **Hosting**: [Netlify](https://netlify.com) (or any static host)
- Works offline in **local mode** (data stored in the browser) until you connect Supabase

## Features

- **Split Paycheck** – enter amount → calculate → see breakdown → save
- **Presets** – add / edit / reorder / delete. Labels free-form. Mix of fixed `$` and `%`
- Percentages are calculated from the **full paycheck first**, then fixed amounts are deducted from what remains
- **History & Reports** – totals by category, doughnut chart, list of past paychecks
- Email + password auth via Supabase

## Quick start (local demo – no account needed)

1. Open `index.html` in a browser **or** serve the folder:
   ```bash
   npx serve .
   ```
2. The app runs in **local mode**. Everything is saved in `localStorage`.

## Full setup with Supabase + Netlify

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**
2. After it finishes provisioning, open **SQL Editor** → New query
3. Paste the contents of `supabase-schema.sql` and run it
4. Go to **Project Settings → API**
   - Copy **Project URL**
   - Copy **anon public** key

### 2. Configure the app

Open `js/config.js` and replace the placeholders:

```js
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

### 3. Push to GitHub (already done if you forked / cloned this repo)

```bash
git clone https://github.com/exitramp505/paycheck-splitter.git
cd paycheck-splitter
# edit js/config.js with your keys
git add .
git commit -m "Add Supabase keys"
git push
```

> **Security note**: the anon key is public by design. Row Level Security (RLS) in the schema makes sure users can only read/write their own rows.

### 4. Deploy on Netlify

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**
2. Connect the GitHub repo `paycheck-splitter`
3. Build settings:
   - **Build command**: leave empty
   - **Publish directory**: `.`  (root)
4. Click **Deploy site**

Optional – store keys as environment variables and inject them at build time if you prefer not to commit them. For this static app the simplest is to keep them in `config.js` (they are already public).

### 5. Use the app

1. Open the Netlify URL
2. Sign up with any email + password (Supabase will send a confirmation email unless you disable email confirmation in Auth settings)
3. Create presets (e.g. Rent $1 200 fixed, Savings 20 %, Groceries 15 %, Fun 10 %)
4. Enter a paycheck → Calculate → Save

## How the split algorithm works

Presets are processed **top → bottom** (you can reorder them with the arrows).

```
remaining = paycheck_amount

for each percentage preset:
  allocated = paycheck_amount * (preset.value / 100)
  remaining -= allocated

for each fixed preset:
  allocated = min(preset.value, remaining)
  remaining -= allocated
```

Anything left over is shown as **Unallocated**.

## Project structure

```
├── index.html              # single page
├── css/styles.css          # tiny extras
├── js/
│   ├── config.js           # Supabase URL + key
│   └── app.js              # all logic
├── supabase-schema.sql     # run once in Supabase
└── README.md
```

## License

MIT – do whatever you want with it.
