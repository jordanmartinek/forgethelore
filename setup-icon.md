# Setting Up Your Desktop Icon

## Step 1: Add the icon image

Save your chess king galaxy image as these files in the `public/icons/` folder:

- `public/icons/icon-512.png` — Full 512x512 version
- `public/icons/icon-192.png` — Resized to 192x192

You can use any image editor or online tool like https://www.iloveimg.com/resize-image to resize.

## Step 2: Install as Desktop App

1. Start the server: `node server.js`
2. Open Chrome or Edge and go to `http://localhost:3000`
3. Look for the **install icon** in the address bar (⊕ or ↓ icon on the right side)
4. Click it → "Install LoreForge Planner"
5. Check "Open as window" if prompted
6. Click **Install**

The app will now appear on your desktop with your custom chess king icon!

## Alternative: Manual Windows Shortcut

1. Right-click your Desktop → **New** → **Shortcut**
2. For the location, paste:
   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:3000
   ```
   (Or use your Edge path: `"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:3000`)
3. Name it: **LoreForge Planner**
4. Click Finish
5. Right-click the new shortcut → **Properties** → **Change Icon** → Browse to your `icon-512.png`

## How it works

The app uses a **Web App Manifest** (`public/manifest.json`) and **Service Worker** (`sw.js`) to register as an installable PWA. When installed:

- Your custom icon appears as the desktop shortcut icon
- The app opens in its own window (no browser chrome)
- The taskbar shows your icon
- It behaves like a native desktop app
