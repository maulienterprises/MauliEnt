# Mauli Enterprises — Invoice Tracker

## Folder Structure
```
Mauli Enterprises/          ← Main folder
├── index.html              ← Main application
├── README.md               ← This file
└── Database/
    ├── user-manager.html   ← User creation tool (local use only)
    ├── manifest.json       ← PWA manifest
    ├── sw.js               ← Service worker (offline support)
    ├── logo.png            ← YOUR LOGO (place it here)
    └── users.db            ← Created by user-manager.html (place here before upload)
```

---

## STEP 1 — Create Users (Do this FIRST, on your computer)

1. Open `Database/user-manager.html` in Chrome or Firefox (just double-click it)
2. Add all users with their names, usernames, passwords, and roles
3. Click **"Download users.db"**
4. Save the downloaded `users.db` file inside the `Database/` folder

> ⚠ **Do NOT upload user-manager.html to GitHub.** Only `users.db` goes to GitHub.

---

## STEP 2 — Add Your Logo

- Place your logo file as `logo.png` inside the `Database/` folder
- Recommended size: 512×512 pixels, PNG format

---

## STEP 3 — Deploy to GitHub Pages

### First Time Setup:

1. Go to **github.com** and sign in (create account if needed)
2. Click the **+** button → **New repository**
3. Name it: `mauli-tracker` (or any name you like)
4. Set to **Public**, click **Create repository**
5. Click **"uploading an existing file"** link
6. Drag and drop the entire contents of the `Mauli Enterprises` folder
   (Upload all files AND the Database folder with all its contents)
7. Click **Commit changes**
8. Go to **Settings** → **Pages**
9. Under "Source", select **Deploy from a branch** → **main** → **/ (root)**
10. Click **Save**
11. Wait 2–3 minutes, then your app is live at:
    `https://YOUR-USERNAME.github.io/mauli-tracker`

### To Update Files Later:
1. Go to your repository on github.com
2. Click **Add file** → **Upload files**
3. Upload only the changed files
4. Click **Commit changes**

---

## STEP 4 — Set Up Auto-Sync (GitHub Backup)

This saves your invoice data automatically to GitHub.

1. Open your app and **sign in as Developer**
2. A setup prompt will appear automatically, OR open it from Settings
3. Enter:
   - **GitHub Username**: your GitHub username
   - **Repository Name**: `mauli-tracker` (same repo)
   - **Personal Access Token**: Get from GitHub → Settings → Developer Settings → Personal access tokens → Tokens (classic) → Generate new token → give `repo` permission → copy the token
4. Click **Save & Sync Now**
5. From now on, data syncs automatically every time you make changes (when online)

> 🔐 Your token is encrypted with AES-256 and stored only in your browser. It never goes into the repo files.

---

## STEP 5 — Install as App on Android Phone

1. Open your app URL in Chrome on Android
2. Tap the 3-dot menu → **"Add to Home Screen"**
3. It installs like a real app with your logo!

---

## User Roles

| Role | Label | Access |
|------|-------|--------|
| Developer | Dev | Everything including Activity Log, edit paid invoices, bulk import, GitHub setup |
| Administrator | Admin | Dashboard, Customers, Invoices, Payments, Overdues, Export |
| Employee | Emp | Invoices only (add, view) |

---

## Excel Import Templates

Three ready-to-use templates are in the main folder:

| File | Use For |
|------|---------|
| `Customers_Import_Template.xlsx` | Bulk add customers |
| `Invoices_Import_Template.xlsx` | Bulk add invoices |
| `Payments_Import_Template.xlsx` | Bulk add payments |

Open each file and check the **Help** sheet for column-by-column instructions.
Only **Developer** role can import Excel files.

---

## .env Style — Git Credentials Security

Your GitHub token is stored with this approach:
- Token entered in-app only (never in any file)
- Encrypted with AES-256-GCM using master password `Anahita @#83`
- Stored in browser localStorage only
- Never committed to any file in the repo
- **To use on a new device**: just re-enter the token once in the app

---

## Default Login (Before you create users.db)

If `users.db` is not yet placed in the Database folder, the app falls back to these seed users:

| Username | Password | Role |
|----------|----------|------|
| ganesh | ganesh123 | Dev |
| manager | manager123 | Admin |
| staff | staff123 | Emp |

> Change these by creating proper users in `user-manager.html` and uploading `users.db`.

---

*Built for Mauli Enterprises*
