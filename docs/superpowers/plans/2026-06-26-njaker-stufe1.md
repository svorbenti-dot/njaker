# NjaKër Stufe 1 – Implementierungsplan

> **Ausführung:** Task für Task in der Hauptsession – kein Subagent-Bulk-Run.

**Goal:** Lauffähige PWA auf GitHub Pages mit Supabase Auth, Haushalt anlegen/beitreten und Bottom-Navigation als Grundgerüst für weitere Stufen.

**Architecture:** Vanilla JS/HTML/CSS ohne Build-Schritt. Supabase-Client via CDN als `window.db`. Hash-basiertes Routing (`#/auth`, `#/household`, `#/home`) für GitHub-Pages-Kompatibilität.

**Tech Stack:** HTML5 · CSS Custom Properties · Vanilla JS (ES2020) · Supabase JS v2 (CDN) · PWA · GitHub Pages

## Global Constraints

- Kein Build-Schritt – alles läuft direkt im Browser
- Supabase CDN: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`
- Supabase-Client global als `window.db` (initialisiert in `app.js`)
- `showToast(message)` global als `window.showToast` (definiert in `app.js`)
- `navigate(hash)` global als `window.navigate` (definiert in `app.js`)
- Alle Touch-Targets mind. 48 × 48 px; Body-Font mind. 16 px; kein horizontaler Scroll
- Desktop: App zentriert in `max-width: 440px` mit Creme-Hintergrund drumherum
- Bottom-Nav: `position: fixed` + `env(safe-area-inset-bottom)`
- `touch-action: manipulation` auf allen Buttons
- Invite-Code-Zeichensatz: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (kein O/0/I/1)
- `config.js` ist committed (publishable/anon key, RLS schützt die Daten)
- E-Mail-Bestätigung in Supabase deaktiviert (Task 0)

---

## Datei-Übersicht

| Datei | Erstellt in | Verantwortung |
|---|---|---|
| `.gitignore` | Task 1 | `.env` + OS-Dateien ausschließen |
| `css/vars.css` | Task 2 | Alle CSS Custom Properties |
| `css/app.css` | Task 2–6 | Alle Stile (schrittweise ergänzt) |
| `index.html` | Task 3 | App-Shell, Imports |
| `config.js` | Task 3 | Supabase-Credentials |
| `app.js` | Task 3 | Init, Router, showToast, getRoute |
| `auth.js` | Task 4 | renderAuth, handleAuthSubmit, switchAuthTab |
| `household.js` | Task 5 | renderHousehold, createHousehold, joinHousehold |
| `home.js` | Task 6 | renderHome, setActiveTab, logout |
| `manifest.json` | Task 7 | PWA-Manifest |
| `sw.js` | Task 7 | Service Worker |
| `icons/icon.svg` | Task 7 | App-Icon |

---

## Task 0: Supabase konfigurieren (manuell im Dashboard)

**Du führst diese Schritte selbst aus – kein Code wird hier geschrieben.**

### 0a – E-Mail-Bestätigung deaktivieren

Supabase verlangt standardmäßig eine E-Mail-Bestätigung. Ohne sie ist nach `signUp` keine Session vorhanden, und das Profil-INSERT schlägt wegen RLS fehl. Für eine 2-Personen-App ist die Bestätigung unnötig.

- [ ] Supabase Dashboard öffnen → Projekt wählen
- [ ] Linke Sidebar: **Authentication** → **Settings** (oder „Email")
- [ ] Abschnitt **Email** → Toggle **"Confirm email"** → **OFF**
- [ ] Speichern

Nach dieser Änderung loggt Supabase Nutzer nach `signUp` sofort automatisch ein.

### 0b – RLS-Policies erstellen

Supabase hat RLS aktiv, aber ohne Policies blockt die Datenbank jeden Zugriff. Führe das folgende SQL im **SQL-Editor** aus (Dashboard → SQL Editor → New query → einfügen → Run):

```sql
-- ─── profiles ──────────────────────────────────────────────────
-- Nutzer darf nur die eigene Zeile lesen
CREATE POLICY "profiles: select own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Nutzer darf nur die eigene Zeile anlegen
CREATE POLICY "profiles: insert own"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Nutzer darf nur die eigene Zeile aktualisieren
CREATE POLICY "profiles: update own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- ─── households ────────────────────────────────────────────────
-- Jeder eingeloggte Nutzer darf Haushalte lesen
-- (nötig, damit ein beitretender Nutzer per Invite-Code suchen kann)
CREATE POLICY "households: select authenticated"
  ON households FOR SELECT
  USING (auth.role() = 'authenticated');

-- Jeder eingeloggte Nutzer darf einen Haushalt anlegen
CREATE POLICY "households: insert authenticated"
  ON households FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Nur Mitglieder dürfen den eigenen Haushalt ändern
CREATE POLICY "households: update members"
  ON households FOR UPDATE
  USING (
    id IN (
      SELECT household_id FROM profiles WHERE id = auth.uid()
    )
  );
```

- [ ] SQL-Editor öffnen (Dashboard → SQL Editor)
- [ ] Obiges SQL einfügen und **Run** klicken
- [ ] Prüfen: Keine Fehler, alle 6 Policies angelegt (Table Editor → profiles/households → Policies)

> Die anderen Tabellen (contracts, appointments, todos, chores, gift_ideas, warranties, attachments) bekommen ihre Policies in Stufe 2, wenn die zugehörigen Features gebaut werden.

---

## Task 1: Git-Repo initialisieren

**Files:** `.gitignore` (aktualisieren)

- [ ] **Schritt 1: Git initialisieren**

```bash
cd C:\Users\svorb\njaker
git init
```

Erwartung: `Initialized empty Git repository in …/njaker/.git/`

- [ ] **Schritt 2: .gitignore aktualisieren**

Datei `C:\Users\svorb\njaker\.gitignore` ersetzen:

```
.env
.DS_Store
Thumbs.db
desktop.ini
```

- [ ] **Schritt 3: Verzeichnisse anlegen**

```bash
mkdir css
mkdir icons
```

- [ ] **Schritt 4: Committen**

```bash
git add .gitignore
git commit -m "chore: init repo with gitignore"
```

---

## Task 2: Design-System (vars.css + app.css)

**Files:** `css/vars.css` (neu), `css/app.css` (neu)

- [ ] **Schritt 1: css/vars.css schreiben**

```css
/* css/vars.css */
:root {
  /* Farben */
  --c-bg:           #F5F0E8;
  --c-surface:      #FDFAF4;
  --c-primary:      #C4522A;
  --c-primary-dark: #A03E1E;
  --c-gold:         #D4A017;
  --c-green:        #1B5E3B;
  --c-green-dark:   #144830;
  --c-text:         #1A1A1A;
  --c-text-muted:   #6B6457;
  --c-border:       #E0D9CC;
  --c-error:        #B91C1C;
  --c-success:      #15803D;

  /* Typografie */
  --font-sans: 'Plus Jakarta Sans', system-ui, sans-serif;
  --text-xs:   0.75rem;
  --text-sm:   0.875rem;
  --text-base: 1rem;
  --text-lg:   1.125rem;
  --text-xl:   1.375rem;
  --text-2xl:  1.75rem;
  --text-3xl:  2rem;

  /* Abstände (8dp-Raster) */
  --space-1:  0.25rem;
  --space-2:  0.5rem;
  --space-3:  0.75rem;
  --space-4:  1rem;
  --space-6:  1.5rem;
  --space-8:  2rem;
  --space-12: 3rem;
  --space-16: 4rem;

  /* Radien */
  --radius-sm:   8px;
  --radius-md:   12px;
  --radius-lg:   16px;
  --radius-full: 9999px;

  /* Schatten */
  --shadow-sm: 0 1px 3px rgba(26, 26, 26, 0.08);
  --shadow-md: 0 4px 12px rgba(26, 26, 26, 0.10);

  /* Layout */
  --max-width:    440px;
  --bottom-nav-h: 64px;
}
```

- [ ] **Schritt 2: css/app.css schreiben**

```css
/* css/app.css */

/* ─── Reset & Base ───────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html { font-size: 16px; -webkit-text-size-adjust: 100%; }

body {
  font-family: var(--font-sans);
  background: var(--c-bg);
  color: var(--c-text);
  min-height: 100dvh;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
}

button, input { font-family: inherit; font-size: inherit; }

/* ─── App-Layout ─────────────────────────────────────── */
#app { min-height: 100dvh; display: flex; flex-direction: column; }
#screen-container { flex: 1; display: flex; flex-direction: column; }

@media (min-width: 600px) {
  body { background: #E8E3D9; display: flex; justify-content: center; }
  #app {
    width: 100%;
    max-width: var(--max-width);
    min-height: 100dvh;
    background: var(--c-bg);
    box-shadow: 0 0 48px rgba(0, 0, 0, 0.12);
  }
}

/* ─── Utilities ──────────────────────────────────────── */
.hidden { display: none !important; }
.text-muted { color: var(--c-text-muted); font-size: var(--text-base); line-height: 1.6; }

/* ─── Formular-Elemente (geteilt) ────────────────────── */
.field-group { margin-bottom: var(--space-4); }

.field-group label {
  display: block;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--c-text);
  margin-bottom: var(--space-2);
}

.field-group input {
  width: 100%;
  height: 52px;
  padding: 0 var(--space-4);
  border: 1.5px solid var(--c-border);
  border-radius: var(--radius-md);
  background: var(--c-surface);
  font-size: var(--text-base);
  color: var(--c-text);
  outline: none;
  transition: border-color 200ms ease;
  -webkit-appearance: none;
}

.field-group input:focus { border-color: var(--c-primary); }

.field-error {
  display: block;
  color: var(--c-error);
  font-size: var(--text-sm);
  margin-top: var(--space-2);
}

/* ─── Buttons (geteilt) ──────────────────────────────── */
.btn-primary {
  width: 100%;
  height: 52px;
  background: var(--c-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  touch-action: manipulation;
  transition: background 200ms ease;
  margin-top: var(--space-6);
}
.btn-primary:hover     { background: var(--c-primary-dark); }
.btn-primary:active    { opacity: 0.9; }
.btn-primary:disabled  { opacity: 0.55; cursor: not-allowed; }

.btn-secondary {
  width: 100%;
  height: 52px;
  background: transparent;
  color: var(--c-green);
  border: 2px solid var(--c-green);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: manipulation;
  transition: background 200ms ease, color 200ms ease;
  margin-top: var(--space-4);
}
.btn-secondary:hover { background: var(--c-green); color: #fff; }

.btn-logout {
  margin-top: var(--space-8);
  padding: 0 var(--space-8);
  min-height: 48px;
  background: transparent;
  color: var(--c-error);
  border: 1.5px solid var(--c-error);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
  transition: background 200ms ease, color 200ms ease;
}
.btn-logout:hover { background: var(--c-error); color: #fff; }

/* ─── Spinner ────────────────────────────────────────── */
.spinner {
  width: 20px;
  height: 20px;
  border: 2.5px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ─── Loading-Screen ─────────────────────────────────── */
.loading-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
}
.loading-screen .spinner {
  width: 36px;
  height: 36px;
  border-color: rgba(196, 82, 42, 0.25);
  border-top-color: var(--c-primary);
}

/* ─── Toast ──────────────────────────────────────────── */
.toast {
  position: fixed;
  bottom: calc(var(--bottom-nav-h) + env(safe-area-inset-bottom) + var(--space-4));
  left: 50%;
  transform: translateX(-50%);
  max-width: calc(var(--max-width) - var(--space-8));
  background: var(--c-text);
  color: #fff;
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: 500;
  white-space: nowrap;
  z-index: 200;
  pointer-events: none;
  animation: toastIn 0.2s ease;
}
@keyframes toastIn {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* ─── Auth-Screen ────────────────────────────────────── */
.auth-screen {
  min-height: 100dvh;
  padding: 0 var(--space-6) var(--space-8);
  display: flex;
  flex-direction: column;
  background: var(--c-bg);
}

.auth-header {
  text-align: center;
  padding-top: var(--space-16);
  margin-bottom: var(--space-8);
}

.wordmark {
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--c-primary);
  letter-spacing: -0.02em;
  margin-bottom: var(--space-3);
}

.geo-accent { display: flex; justify-content: center; margin-top: var(--space-3); }

.auth-tabs {
  display: flex;
  background: var(--c-border);
  border-radius: var(--radius-full);
  padding: 4px;
  margin-bottom: var(--space-6);
  flex-shrink: 0;
}

.auth-tab {
  flex: 1;
  height: 48px;
  border: none;
  background: transparent;
  border-radius: var(--radius-full);
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--c-text-muted);
  cursor: pointer;
  transition: background 200ms ease, color 200ms ease;
  touch-action: manipulation;
}
.auth-tab.active {
  background: var(--c-surface);
  color: var(--c-text);
  box-shadow: var(--shadow-sm);
}

.auth-form { display: flex; flex-direction: column; flex: 1; }

.password-wrapper { position: relative; }
.password-wrapper input { padding-right: 56px; }

.pw-toggle {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--c-text-muted);
  touch-action: manipulation;
}

/* ─── Haushalt-Screen ────────────────────────────────── */
.household-screen {
  min-height: 100dvh;
  padding: 0 var(--space-6) var(--space-8);
  background: var(--c-bg);
}

.household-header {
  text-align: center;
  padding-top: var(--space-12);
  margin-bottom: var(--space-8);
}
.household-header h1 {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--c-text);
  margin-bottom: var(--space-3);
}

.household-cards { display: flex; flex-direction: column; gap: var(--space-4); }

.household-card {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  box-shadow: var(--shadow-sm);
}
.household-card h2 {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--c-text);
  margin-bottom: var(--space-4);
}

.invite-code-display {
  margin: var(--space-4) 0;
  padding: var(--space-4);
  background: var(--c-bg);
  border-radius: var(--radius-md);
  text-align: center;
  border: 2px dashed var(--c-gold);
}
.code-label { font-size: var(--text-sm); color: var(--c-text-muted); margin-bottom: var(--space-2); }
.code-value {
  font-family: 'Courier New', monospace;
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--c-gold);
  letter-spacing: 0.25em;
  margin-bottom: var(--space-3);
}

.btn-copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: 0 var(--space-4);
  min-height: 48px;
  background: var(--c-gold);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
}
.btn-copy:active { opacity: 0.85; }

/* ─── Home-Screen & Bottom-Nav ───────────────────────── */
.home-screen {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--c-bg);
}

.tab-content {
  flex: 1;
  padding: var(--space-6);
  padding-bottom: calc(var(--bottom-nav-h) + env(safe-area-inset-bottom) + var(--space-4));
  overflow-y: auto;
}

.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  text-align: center;
  gap: var(--space-3);
}
.placeholder h2 { font-size: var(--text-xl); font-weight: 600; color: var(--c-text); }
.placeholder p  { color: var(--c-text-muted); font-size: var(--text-base); }

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: var(--max-width);
  height: calc(var(--bottom-nav-h) + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--c-surface);
  border-top: 1px solid var(--c-border);
  display: flex;
  align-items: stretch;
  z-index: 10;
  box-shadow: 0 -2px 12px rgba(26, 26, 26, 0.07);
}

.nav-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border: none;
  background: transparent;
  color: var(--c-text-muted);
  cursor: pointer;
  touch-action: manipulation;
  padding: var(--space-2) var(--space-1);
  transition: color 200ms ease;
  min-width: 0;
}
.nav-tab.active { color: var(--c-primary); }
.nav-tab svg   { width: 24px; height: 24px; flex-shrink: 0; }
.nav-label     { font-size: 10px; font-weight: 500; line-height: 1; white-space: nowrap; }
```

- [ ] **Schritt 3: Committen**

```bash
git add css/vars.css css/app.css
git commit -m "feat: add design system (vars + styles)"
```

---

## Task 3: App-Shell (index.html + config.js + app.js)

**Files:** `index.html`, `config.js`, `app.js`

**Produces:** `window.db`, `window.navigate(hash)`, `window.showToast(message)`

- [ ] **Schritt 1: index.html schreiben**

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#C4522A">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="NjaKër">
  <meta name="description" content="Partner-Organisations-App">
  <title>NjaKër</title>
  <link rel="manifest" href="manifest.json">
  <link rel="apple-touch-icon" href="icons/icon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/vars.css">
  <link rel="stylesheet" href="css/app.css">
</head>
<body>
  <div id="app">
    <div id="screen-container"></div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="config.js"></script>
  <script src="auth.js"></script>
  <script src="household.js"></script>
  <script src="home.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Schritt 2: config.js schreiben**

```js
const SUPABASE_URL = 'https://chsisunrtnkwlsqlwkvh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_B_nXZY59UJ24CikRrjxauQ_rFda-OEB';
```

- [ ] **Schritt 3: app.js schreiben**

```js
/* app.js – Init, Router, globale Utilities */
const { createClient } = window.supabase;
window.db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Toast ──────────────────────────────────────────────
let _toastTimer;
window.showToast = function (message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  clearTimeout(_toastTimer);

  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-live', 'polite');
  el.textContent = message;
  document.body.appendChild(el);
  _toastTimer = setTimeout(() => el.remove(), 3000);
};

// ─── Router ─────────────────────────────────────────────
let _currentHash = null;

window.navigate = function (hash) {
  if (_currentHash === hash) return;
  _currentHash = hash;
  window.location.hash = hash;

  const container = document.getElementById('screen-container');
  switch (hash) {
    case '#/auth':      renderAuth(container);      break;
    case '#/household': renderHousehold(container); break;
    case '#/home':      renderHome(container);      break;
    default:            navigate('#/auth');
  }
};

// ─── Route bestimmen ────────────────────────────────────
async function getRoute(session) {
  if (!session) return '#/auth';
  const { data: profile } = await window.db
    .from('profiles')
    .select('household_id')
    .eq('id', session.user.id)
    .maybeSingle();
  return profile?.household_id ? '#/home' : '#/household';
}

// ─── Init ────────────────────────────────────────────────
async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  document.getElementById('screen-container').innerHTML =
    '<div class="loading-screen"><div class="spinner"></div></div>';

  window.db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') { navigate('#/auth'); return; }
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      navigate(await getRoute(session));
    }
  });
}

init();
```

- [ ] **Schritt 4: Verifizieren**

Öffne `index.html` in Chrome. In der Console:
```js
typeof window.db       // "object"
typeof window.navigate // "function"
typeof window.showToast // "function"
```

Seite zeigt Spinner → wechselt zu `#/auth` (auth.js noch leer, also Fehler im nächsten Step erwartet).

- [ ] **Schritt 5: Committen**

```bash
git add index.html config.js app.js
git commit -m "feat: app shell, supabase init, router"
```

---

## Task 4: Auth-Screen (auth.js)

**Files:** `auth.js`

**Produces:** `renderAuth(container)`

**Voraussetzung:** E-Mail-Bestätigung in Supabase ist deaktiviert (Task 0a).

- [ ] **Schritt 1: auth.js schreiben**

```js
/* auth.js – Login und Registrierung */
let _authMode = 'login';
let _pwVisible = false;

function renderAuth(container) {
  _authMode = 'login';
  _pwVisible = false;

  container.innerHTML = `
    <div class="auth-screen">
      <div class="auth-header">
        <h1 class="wordmark">NjaKër</h1>
        <div class="geo-accent" aria-hidden="true">
          <svg width="72" height="14" viewBox="0 0 72 14" fill="none">
            <line x1="0" y1="7" x2="72" y2="7" stroke="#E0D9CC" stroke-width="1"/>
            <polygon points="7,0 14,7 7,14 0,7"  fill="#D4A017" opacity="0.45"/>
            <polygon points="36,0 43,7 36,14 29,7" fill="#C4522A" opacity="0.3"/>
            <polygon points="65,0 72,7 65,14 58,7" fill="#D4A017" opacity="0.45"/>
          </svg>
        </div>
      </div>

      <div class="auth-tabs" role="tablist">
        <button class="auth-tab active" id="tab-login" role="tab"
                aria-selected="true" onclick="switchAuthTab('login')">Anmelden</button>
        <button class="auth-tab" id="tab-register" role="tab"
                aria-selected="false" onclick="switchAuthTab('register')">Registrieren</button>
      </div>

      <form class="auth-form" id="auth-form" onsubmit="handleAuthSubmit(event)" novalidate>
        <div class="field-group hidden" id="field-name">
          <label for="input-name">Anzeigename</label>
          <input type="text" id="input-name" name="name"
                 autocomplete="name" placeholder="Dein Name">
        </div>

        <div class="field-group">
          <label for="input-email">E-Mail</label>
          <input type="email" id="input-email" name="email"
                 autocomplete="email" placeholder="name@beispiel.de" required>
        </div>

        <div class="field-group">
          <label for="input-password">Passwort</label>
          <div class="password-wrapper">
            <input type="password" id="input-password" name="password"
                   autocomplete="current-password" placeholder="••••••••" required>
            <button type="button" class="pw-toggle" id="pw-toggle-btn"
                    aria-label="Passwort anzeigen" onclick="togglePassword()">
              <svg id="pw-icon-show" width="20" height="20" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <svg id="pw-icon-hide" width="20" height="20" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round" class="hidden">
                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
                <line x1="2" x2="22" y1="2" y2="22"/>
              </svg>
            </button>
          </div>
        </div>

        <button type="submit" class="btn-primary" id="auth-submit">
          <span id="auth-btn-label">Anmelden</span>
          <span class="spinner hidden" id="auth-spinner"></span>
        </button>
      </form>
    </div>
  `;
}

function switchAuthTab(mode) {
  _authMode = mode;
  const isReg = mode === 'register';
  document.getElementById('tab-login').classList.toggle('active', !isReg);
  document.getElementById('tab-login').setAttribute('aria-selected', String(!isReg));
  document.getElementById('tab-register').classList.toggle('active', isReg);
  document.getElementById('tab-register').setAttribute('aria-selected', String(isReg));
  document.getElementById('field-name').classList.toggle('hidden', !isReg);
  document.getElementById('auth-btn-label').textContent = isReg ? 'Konto erstellen' : 'Anmelden';
  document.getElementById('input-password').autocomplete = isReg ? 'new-password' : 'current-password';
}

function togglePassword() {
  _pwVisible = !_pwVisible;
  document.getElementById('input-password').type = _pwVisible ? 'text' : 'password';
  document.getElementById('pw-icon-show').classList.toggle('hidden', _pwVisible);
  document.getElementById('pw-icon-hide').classList.toggle('hidden', !_pwVisible);
  document.getElementById('pw-toggle-btn').setAttribute(
    'aria-label', _pwVisible ? 'Passwort verbergen' : 'Passwort anzeigen'
  );
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email    = document.getElementById('input-email').value.trim();
  const password = document.getElementById('input-password').value;
  const btn      = document.getElementById('auth-submit');
  const spinner  = document.getElementById('auth-spinner');
  const label    = document.getElementById('auth-btn-label');

  btn.disabled = true;
  spinner.classList.remove('hidden');
  label.classList.add('hidden');

  const restore = () => {
    btn.disabled = false;
    spinner.classList.add('hidden');
    label.classList.remove('hidden');
  };

  if (_authMode === 'login') {
    const { error } = await window.db.auth.signInWithPassword({ email, password });
    if (error) { showToast(error.message); restore(); }
    // Erfolg: onAuthStateChange navigiert automatisch

  } else {
    const name = (document.getElementById('input-name')?.value || '').trim();
    const { data, error } = await window.db.auth.signUp({ email, password });
    if (error) { showToast(error.message); restore(); return; }

    if (data.user) {
      await window.db.from('profiles').upsert({
        id: data.user.id,
        display_name: name || email.split('@')[0],
      });
    }
    restore();
    // Erfolg: onAuthStateChange navigiert automatisch (E-Mail-Bestätigung ist deaktiviert)
  }
}
```

- [ ] **Schritt 2: Verifizieren**

1. App zeigt Auth-Screen mit Wordmark und geometrischem Akzent.
2. Tab-Wechsel klappt (Anzeigename erscheint/verschwindet).
3. Auge-Icon toggelt Passwortsichtbarkeit.
4. Test-Account registrieren → Spinner → Redirect zu `#/household`.
5. In Supabase Dashboard: Authentication → Users zeigt den neuen Account.
6. In Table Editor: `profiles` hat eine Zeile für den User.
7. Abmelden (`await window.db.auth.signOut()` in DevTools Console) → `#/auth`.
8. Mit denselben Daten anmelden → `#/household`.

- [ ] **Schritt 3: Committen**

```bash
git add auth.js
git commit -m "feat: auth screen (login/register)"
```

---

## Task 5: Haushalt-Screen (household.js)

**Files:** `household.js`

**Produces:** `renderHousehold(container)`

- [ ] **Schritt 1: household.js schreiben**

```js
/* household.js – Haushalt anlegen oder beitreten */

function renderHousehold(container) {
  container.innerHTML = `
    <div class="household-screen">
      <div class="household-header">
        <h1>Euer Haushalt</h1>
        <p class="text-muted">Legt gemeinsam einen Haushalt an<br>oder tretet einem bestehenden bei.</p>
      </div>

      <div class="household-cards">
        <div class="household-card">
          <h2>Haushalt anlegen</h2>
          <div class="field-group">
            <label for="household-name">Name des Haushalts</label>
            <input type="text" id="household-name" placeholder="z. B. Familie Müller" autocomplete="off">
          </div>

          <div class="invite-code-display hidden" id="invite-code-display">
            <p class="code-label">Euer Einladungs-Code:</p>
            <p class="code-value" id="invite-code-value"></p>
            <button class="btn-copy" onclick="copyInviteCode()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
              </svg>
              Code kopieren
            </button>
          </div>

          <button class="btn-primary" id="create-btn" onclick="createHousehold()">Anlegen</button>
          <button class="btn-secondary hidden" id="continue-btn" onclick="navigate('#/home')">
            Weiter zur App →
          </button>
        </div>

        <div class="household-card">
          <h2>Per Code beitreten</h2>
          <div class="field-group">
            <label for="join-code">Einladungs-Code</label>
            <input type="text" id="join-code" placeholder="ABC123" maxlength="6"
                   autocomplete="off"
                   style="text-transform:uppercase;letter-spacing:0.2em;font-size:1.25rem;font-weight:700;"
                   oninput="this.value = this.value.toUpperCase()">
            <span class="field-error hidden" id="join-error"></span>
          </div>
          <button class="btn-secondary" onclick="joinHousehold()">Beitreten</button>
        </div>
      </div>
    </div>
  `;
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function createHousehold() {
  const name = document.getElementById('household-name').value.trim();
  if (!name) { document.getElementById('household-name').focus(); return; }

  const btn = document.getElementById('create-btn');
  btn.disabled = true;
  btn.textContent = '…';

  const { data: { user } } = await window.db.auth.getUser();
  const code = generateInviteCode();

  const { data: household, error } = await window.db
    .from('households')
    .insert({ name, invite_code: code })
    .select('id')
    .single();

  if (error) {
    showToast('Fehler: ' + error.message);
    btn.disabled = false;
    btn.textContent = 'Anlegen';
    return;
  }

  const { error: pErr } = await window.db
    .from('profiles')
    .update({ household_id: household.id })
    .eq('id', user.id);

  if (pErr) {
    showToast('Profil konnte nicht aktualisiert werden.');
    btn.disabled = false;
    btn.textContent = 'Anlegen';
    return;
  }

  document.getElementById('invite-code-value').textContent = code;
  document.getElementById('invite-code-display').classList.remove('hidden');
  document.getElementById('continue-btn').classList.remove('hidden');
  btn.classList.add('hidden');
}

async function copyInviteCode() {
  const code = document.getElementById('invite-code-value').textContent;
  try {
    await navigator.clipboard.writeText(code);
    showToast('Code kopiert!');
  } catch {
    showToast('Code: ' + code);
  }
}

async function joinHousehold() {
  const code    = document.getElementById('join-code').value.trim().toUpperCase();
  const errorEl = document.getElementById('join-error');
  errorEl.classList.add('hidden');

  if (code.length !== 6) {
    errorEl.textContent = 'Bitte 6-stelligen Code eingeben.';
    errorEl.classList.remove('hidden');
    return;
  }

  const { data: household } = await window.db
    .from('households')
    .select('id')
    .eq('invite_code', code)
    .maybeSingle();

  if (!household) {
    errorEl.textContent = 'Code nicht gefunden. Bitte prüfen.';
    errorEl.classList.remove('hidden');
    return;
  }

  const { data: { user } } = await window.db.auth.getUser();
  const { error } = await window.db
    .from('profiles')
    .update({ household_id: household.id })
    .eq('id', user.id);

  if (error) { showToast('Fehler: ' + error.message); return; }

  navigate('#/home');
}
```

- [ ] **Schritt 2: Verifizieren**

1. Eingeloggter Nutzer ohne Haushalt → `#/household` erscheint.
2. „Anlegen" ohne Name → Fokus springt ins Namens-Feld.
3. Name eingeben → „Anlegen" → Code erscheint in Gold.
4. „Code kopieren" → Toast „Code kopiert!".
5. „Weiter" → `#/home`.
6. Supabase Dashboard: `households` hat Eintrag, `profiles.household_id` gesetzt.
7. Zweiten Account anlegen → Code eingeben → „Beitreten" → `#/home`.
8. Falscher Code → Fehlermeldung unter dem Feld.

- [ ] **Schritt 3: Committen**

```bash
git add household.js
git commit -m "feat: household create/join screen"
```

---

## Task 6: Home-Screen + Bottom-Nav (home.js)

**Files:** `home.js`

**Produces:** `renderHome(container)`, `setActiveTab(tabId)`, `logout()`

- [ ] **Schritt 1: home.js schreiben**

```js
/* home.js – Home-Screen mit Bottom-Navigation */

const NAV_ITEMS = [
  {
    id: 'uebersicht', label: 'Übersicht',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  },
  {
    id: 'todos', label: 'Todos',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 11 12 14 22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  },
  {
    id: 'termine', label: 'Termine',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
      <line x1="16" x2="16" y1="2" y2="6"/>
      <line x1="8" x2="8" y1="2" y2="6"/>
      <line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  },
  {
    id: 'haushalt', label: 'Haushalt',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  },
  {
    id: 'mehr', label: 'Mehr',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="1"/>
      <circle cx="19" cy="12" r="1"/>
      <circle cx="5" cy="12" r="1"/></svg>`,
  },
];

let _activeTab = 'uebersicht';

function renderHome(container) {
  container.innerHTML = `
    <div class="home-screen">
      <main class="tab-content" id="tab-content" role="main">
        ${_tabContent(_activeTab)}
      </main>
      <nav class="bottom-nav" aria-label="Hauptnavigation">
        ${NAV_ITEMS.map(item => `
          <button class="nav-tab${item.id === _activeTab ? ' active' : ''}"
                  onclick="setActiveTab('${item.id}')"
                  aria-label="${item.label}"
                  aria-current="${item.id === _activeTab ? 'page' : 'false'}">
            ${item.icon}
            <span class="nav-label">${item.label}</span>
          </button>
        `).join('')}
      </nav>
    </div>
  `;
}

function setActiveTab(tabId) {
  _activeTab = tabId;
  document.querySelectorAll('.nav-tab').forEach((btn, i) => {
    const active = NAV_ITEMS[i].id === tabId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  });
  const content = document.getElementById('tab-content');
  if (content) content.innerHTML = _tabContent(tabId);
}

function _tabContent(tabId) {
  if (tabId === 'mehr') {
    return `
      <div class="placeholder">
        <h2>Mehr</h2>
        <p>Verträge · Putzplan · Garantien · Geschenke<br>kommen in Stufe 2.</p>
        <button class="btn-logout" onclick="logout()">Abmelden</button>
      </div>
    `;
  }
  const titles = {
    uebersicht: ['Übersicht',  'Dein Überblick kommt in Stufe 2.'],
    todos:      ['Todos',      'Eure Aufgabenliste kommt in Stufe 2.'],
    termine:    ['Termine',    'Euer Kalender kommt in Stufe 2.'],
    haushalt:   ['Haushalt',   'Haushaltsverwaltung kommt in Stufe 2.'],
  };
  const [title, text] = titles[tabId] || [tabId, ''];
  return `<div class="placeholder"><h2>${title}</h2><p>${text}</p></div>`;
}

async function logout() {
  await window.db.auth.signOut();
  // onAuthStateChange in app.js navigiert zu #/auth
}
```

- [ ] **Schritt 2: Verifizieren**

1. Eingeloggter Nutzer mit Haushalt → `#/home` mit Bottom-Nav.
2. Alle 5 Tabs wechseln Inhalt + aktiven Zustand korrekt.
3. Tab „Mehr" zeigt „Abmelden"-Button.
4. „Abmelden" klicken → Redirect zu `#/auth`.
5. DevTools → Responsive Mode 360 px: kein horizontaler Scroll, Nav bleibt sichtbar.
6. Desktop-Breite: App erscheint zentriert in schmaler Spalte.

- [ ] **Schritt 3: Committen**

```bash
git add home.js
git commit -m "feat: home screen, bottom nav, logout"
```

---

## Task 7: PWA-Assets (manifest.json + sw.js + icon)

**Files:** `manifest.json`, `sw.js`, `icons/icon.svg`

- [ ] **Schritt 1: icons/icon.svg schreiben**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="40" fill="#C4522A"/>
  <text x="96" y="140" font-family="system-ui,-apple-system,sans-serif"
        font-size="108" font-weight="700" fill="#F5F0E8"
        text-anchor="middle">N</text>
  <circle cx="140" cy="52" r="10" fill="#D4A017"/>
</svg>
```

- [ ] **Schritt 2: manifest.json schreiben**

```json
{
  "name": "NjaKër",
  "short_name": "NjaKër",
  "description": "Partner-Organisations-App für zwei Personen",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait-primary",
  "theme_color": "#C4522A",
  "background_color": "#F5F0E8",
  "lang": "de",
  "icons": [
    {
      "src": "icons/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Schritt 3: sw.js schreiben**

```js
/* sw.js – Service Worker für NjaKër */
const CACHE = 'njaker-v1';
const SHELL = [
  './', './index.html', './config.js', './app.js',
  './auth.js', './household.js', './home.js',
  './css/vars.css', './css/app.css',
  './manifest.json', './icons/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Supabase + Google Fonts: immer live
  if (url.hostname.endsWith('supabase.co') ||
      url.hostname.endsWith('supabase.io') ||
      url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com' ||
      url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // Shell: Cache-First
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok && e.request.method === 'GET') {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      }
      return res;
    }))
  );
});
```

- [ ] **Schritt 4: Verifizieren (lokaler Webserver nötig)**

Service Worker funktioniert nur auf `localhost` oder HTTPS, nicht auf `file://`.

Wenn Node verfügbar: `npx serve .` → `http://localhost:3000` öffnen.  
Alternativ: VS Code Live Server → Port merken.

In Chrome DevTools:
- Application → Manifest: Name, Theme-Color, Icon korrekt ✓
- Application → Service Workers: „activated and is running" ✓
- Application → Cache Storage: `njaker-v1` mit allen Shell-Dateien ✓
- Network → Offline → Seite neu laden → App erscheint ✓

- [ ] **Schritt 5: Committen**

```bash
git add manifest.json sw.js icons/icon.svg
git commit -m "feat: PWA manifest, service worker, icon"
```

---

## Task 8: GitHub Pages deployen

**Du führst Schritt 1 und 3 selbst aus (GitHub-Konto nötig).**

- [ ] **Schritt 1: Leeres Repository auf GitHub anlegen**

github.com → New Repository → Name: `njaker` → Public → kein README/gitignore → Create.

- [ ] **Schritt 2: Remote hinzufügen und pushen**

```bash
git remote add origin https://github.com/DEIN-USERNAME/njaker.git
git branch -M main
git push -u origin main
```

- [ ] **Schritt 3: GitHub Pages aktivieren**

Repository → Settings → Pages → Source: **Deploy from a branch** → Branch: `main` → `/root` → Save.

Warte ~1–2 Minuten.

- [ ] **Schritt 4: Verifizieren**

URL: `https://DEIN-USERNAME.github.io/njaker/`

1. Auth-Screen erscheint korrekt.
2. Registrieren / Anmelden funktioniert.
3. Haushalt anlegen → Code erscheint.
4. Home-Screen + Bottom-Nav funktioniert.
5. „Abmelden" → zurück zum Auth-Screen.
6. Android Chrome: „Zum Startbildschirm" → App installierbar.
7. iOS Safari: Teilen → „Zum Home-Bildschirm" → App installierbar.
