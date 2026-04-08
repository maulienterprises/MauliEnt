# Mauli Enterprises — Invoice Tracker

A single-file web app for managing customers, invoices, payments, and credit notes. Hosted on GitHub Pages, with all data stored in Firebase Firestore.

---

## Live App

```
https://maulienterprises.github.io/MauliEnt/
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Single HTML file — no build tools, no frameworks |
| Hosting | GitHub Pages |
| Database | Firebase Firestore (real-time sync) |
| Auth | Firebase Anonymous Auth (invisible to users) |
| Offline | Service Worker (sw.js) |

---

## Features

### 👥 Customers
- Add, edit, delete customers
- Fields: Name, Phone, Email, Company, **Pincode**, Address, GST
- WhatsApp Reminders and Email Reminders checkboxes per customer
- Filter by status: All / Pending / Partial / Paid / Overdue
- Import from Excel (see template below)
- Export to Excel

### 🧾 Invoices
- Create, edit, delete invoices linked to customers
- Duplicate invoice number detection
- Filter by status and month
- Import from Excel

### 💳 Payments
- Record payments against invoices
- Multiple methods: Cash, UPI, NEFT/IMPS, Cheque, Cash Discount, Cancelled
- Correction log when editing a paid entry

### ⚠ Overdue
- Auto-detects invoices past due date with outstanding balance
- Shows days overdue

### 🔔 Bulk Reminders
- Click the 🔔 bell icon on any customer row
- Modal shows all **outstanding invoices** for that customer with checkboxes
- **Select All** or pick specific invoices
- Shows running total of selected dues
- Message includes: Invoice No, Date, Amount, Due Amount per invoice + Grand Total
- Send via **WhatsApp** (opens wa.me link) or **Email** (opens mailto)

### 📝 Credit Notes *(Manager/Dev only)*
- Issue credit notes against invoices
- Reasons: Goods Return, Discount, Price Correction, Damaged Goods, Other
- Credit amount reduces invoice balance

### 📒 Customer Ledger *(Manager/Dev only)*
- Full invoice + payment view per customer
- Filter by customer, month, payment status
- Export to Excel

### 📋 Activity Log *(Dev only)*
- Tracks all create / edit / delete / login events
- Shows user, action, timestamp

### 👤 User Management *(Dev only)*
- Add, edit, deactivate, delete users
- Roles: Developer, Admin, Employee
- Passwords hashed with PBKDF2 (310,000 iterations)
- All user changes sync to Firestore instantly — no manual export needed

### 💾 Backup & Restore
- Full backup as ZIP (customers, invoices, payments, log, users)
- Selective backup per collection
- Restore from ZIP

---

## User Roles

| Role | Access |
|---|---|
| **Dev** | All tabs including Users, Backup, Activity Log |
| **Admin** | Dashboard, Customers, Invoices, Payments, Overdue, Credit Notes, Ledger |
| **Employee** | Invoices tab only |

---

## Firebase Setup

### 1. Enable Anonymous Authentication
Go to **Firebase Console → Authentication → Sign-in method → Anonymous → Enable**

This is required — the app signs in anonymously on login so Firestore rules can block unauthenticated access.

### 2. Firestore Security Rules
Go to **Firestore Database → Rules** and publish:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

This means: only sessions that have completed the app's login can read/write. External access is blocked even if someone finds the Firebase project ID in the source.

---

## First-Time Setup (New Device / Browser)

### How user login works — 3-tier fallback

```
1. Firestore  →  loads all users (works after first login on any device)
        ↓ fails (no auth yet or Firestore down)
2. users.json →  seed file on GitHub (one-time bootstrap)
        ↓ not found
3. localStorage cache  →  emergency fallback (survives if users.json deleted)
```

**First login ever:**
- Sign in with your dev credentials from `users.json`
- App reads `users.json` → pushes all users to Firestore → caches in localStorage
- From now on, all logins on all devices use Firestore

**After first login:**
- `users.json` can be **deleted** from the repo — it is no longer needed
- All user changes (add/edit/delete) sync to Firestore automatically
- localStorage cache provides emergency fallback if Firestore is temporarily unreachable

---

## Files in Repository

| File | Purpose |
|---|---|
| `index.html` | The entire app — all HTML, CSS, JS in one file |
| `sw.js` | Service worker for offline support |
| `manifest.json` | PWA manifest (app name, icons) |
| `logo.png` | App logo (optional — app works without it) |
| `logo.ico` | Favicon (optional) |
| `users.json` | **Bootstrap only** — seed file for first login. Can be deleted after first successful login. |
| `Customers_Import_Template.xlsx` | Excel template for bulk customer import |

---

## Customer Import via Excel

Use the provided `Customers_Import_Template.xlsx` template.

### Columns

| Column | Required | Notes |
|---|---|---|
| Name | ✅ Yes | Customer full name |
| Phone | ✅ Yes | Mobile number |
| Email | No | |
| Company | No | |
| Pincode | No | Area pincode |
| Address | No | Full address |
| GST | No | GST number |
| WhatsappReminder | No | Enter `Yes` or `No` |
| EmailReminder | No | Enter `Yes` or `No` |

- `WhatsappReminder` and `EmailReminder` columns accept **Yes** or **No** (case-insensitive)
- Rows missing Name or Phone are skipped
- Imported customers are saved to Firestore immediately

---

## Reminder Message Format

When you click 🔔 on a customer and send a reminder, the message looks like:

```
Dear [Customer Name],

This is a payment reminder from Mauli Enterprises.

Outstanding Invoices:
  • Inv# INV-001  |  Date: 01/01/2025  |  Amt: ₹10,000.00  |  Due: ₹5,000.00
  • Inv# INV-004  |  Date: 15/02/2025  |  Amt: ₹8,000.00   |  Due: ₹8,000.00

Total Amount Due: ₹13,000.00

Kindly arrange the payment at the earliest.

Thank you,
Mauli Enterprises
```

---

## Security Notes

- Passwords are never stored in plain text — PBKDF2 with SHA-256, 310,000 iterations
- Firebase Anonymous Auth tokens are issued at login and revoked at logout
- Firestore rules require `request.auth != null` — unauthenticated requests are blocked
- `users.json` contains hashed passwords only — safe to have in a public repo, but delete after first login for cleanliness
- Session auto-expires after 5 minutes of inactivity (30-second warning shown)
- Account lockout after 5 failed login attempts (5-minute cooldown)

---

## Known Non-Issues

| Message | Meaning |
|---|---|
| `logo.png 404` | Logo file not uploaded — app works fine without it |
| `Tracking Prevention blocked access` | Browser privacy feature blocking Firebase analytics (harmless) |
| `ERR_BLOCKED_BY_CLIENT` | Ad blocker or browser extension blocking Firebase WebSocket — disable for this site |
