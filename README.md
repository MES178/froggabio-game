# FroggaBio — Match the Cards

A mobile-first memory card matching game for FroggaBio trade show booths. Visitors open the link on their phone, match 5 pairs of product cards against a 45-second timer, and win a prize they show to a FroggaBio rep at the booth.

Pure HTML5 + CSS3 + vanilla JavaScript. No frameworks, no build step, no backend, no external dependencies — works fully offline once loaded.

## Run locally

Option 1 — just open the file:

1. Double-click `index.html` (or drag it into a browser).

Option 2 — VS Code Live Server (recommended for mobile testing):

1. Open this folder in VS Code.
2. Install the "Live Server" extension.
3. Right-click `index.html` → **Open with Live Server**.
4. To test on a phone, open `http://<your-computer-ip>:5500` on the phone (same Wi-Fi network).

> Tip: to play again after winning or using all attempts, clear the site's data (DevTools → Application → Local Storage → delete `fb_game_attempts`, `fb_game_won`, `fb_game_prize`) or open a private/incognito window.

## Deploy to GitHub Pages

1. Create a GitHub repository (e.g. `froggabio-game`) and push this folder's contents to the `main` branch:
   ```bash
   git init
   git add .
   git commit -m "FroggaBio card matching game"
   git branch -M main
   git remote add origin https://github.com/<your-account>/froggabio-game.git
   git push -u origin main
   ```
2. In the repository: **Settings → Pages → Build and deployment** → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → **Save**.
3. After a minute the game is live at `https://<your-account>.github.io/froggabio-game/`. Use this URL in the HubSpot email / QR code.

## Configure between events

Everything that changes between events lives in the `CONFIG` object at the **top of `js/game.js`**:

| Setting | Meaning |
|---|---|
| `timerSeconds` | Total game time (default 45) |
| `vipThresholdSeconds` | Finish in ≤ this many seconds → VIP prize; otherwise regular prize |
| `maxAttempts` | Total attempts per device/browser (default 3) |
| `showCongratsScreen` | `false` (default): after a win, "Proceed" goes straight to the voucher screen; set to `true` to bring back the intermediate "Congratulations" claim screen |
| `prizes.vip.name` / `prizes.regular.name` | Prize names shown on the win, claim, and voucher screens |
| `prizes.*.validUntil` | Voucher expiry text (free-form string) |
| `prizes.*.terms` | Optional terms text shown in the voucher box |
| `contact.website` / `phone` / `email` / `promotions` | Targets of the footer buttons and icons |

No other file needs editing.

## Replace placeholder images

Replace the files in `/images/` keeping the **same filenames** (PNG):

| File | Used for |
|---|---|
| `logo.png` | FroggaBio logo, top of every screen |
| `card-back.png` | Face-down card design (green FroggaBio shield/frog) |
| `product-1.png` … `product-5.png` | The 5 card pair images |

Square-ish images around 200×200px or larger work best; they are scaled to fit the cards automatically.

## How attempt limiting works

Attempts are tracked in the browser's `localStorage` (per device/browser):

- Each timeout increments `fb_game_attempts`; after `maxAttempts` losses, no retry is offered.
- A win sets `fb_game_won` and locks out further plays. The won prize tier is also stored, so if a winner accidentally reloads the page they can still reopen their voucher from the "already completed" screen via **View your prize**.
- This is intentionally lightweight — clearing browser data resets it, which is acceptable for the exhibition use case.
