# App Icons

Place your LoreForge icon image here:

- `icon-512.png` — 512x512 PNG (for desktop shortcut and PWA)
- `icon-192.png` — 192x192 PNG (for mobile)
- `icon.svg`   — Already generated as fallback

The app will use these automatically via the web manifest.

## To create a Windows desktop shortcut:
1. Open Chrome/Edge and navigate to http://localhost:3000
2. Click the browser menu (⋮) → 'Install LoreForge Planner' or 'Create shortcut'
3. Check 'Open as window' → Click Create
4. The shortcut will appear on your desktop with the app icon

## To manually create a shortcut:
1. Right-click desktop → New → Shortcut
2. Location: `"C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:3000`
3. Name: LoreForge Planner
4. Right-click the shortcut → Properties → Change Icon → Browse to this icon
