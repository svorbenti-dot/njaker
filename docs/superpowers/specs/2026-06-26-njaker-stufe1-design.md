# NjaKër – Stufe 1: Grundgerüst & Haushalt-Funktion

**Datum:** 2026-06-26  
**Status:** Freigegeben  
**Stack:** Vanilla JS/HTML/CSS · Supabase · GitHub Pages PWA

---

## 1. Projektkontext

NjaKër ist eine Partner-Organisations-App für zwei Personen (Haushalt). Sie wird primär mobil genutzt und als PWA auf GitHub Pages gehostet. Supabase übernimmt Datenbank, Auth, Storage und Realtime.

Stufe 1 legt das vollständige Grundgerüst mit funktionierender Auth und Haushalt-Verwaltung. Spätere Stufen hängen weitere Bereiche (Verträge, Todos, Termine, Kosten, Putzplan, Garantien, Geschenke) in die bestehende Navigation ein.

---

## 2. Dateistruktur

```
/
├── index.html          # App-Shell, importiert alle Scripts + Styles
├── config.js           # SUPABASE_URL + SUPABASE_KEY (committed, anon/publishable key)
├── app.js              # Init, Auth-State-Listener, Hash-Router
├── auth.js             # Login / Register (Supabase Auth)
├── household.js        # Haushalt anlegen / beitreten
├── css/
│   ├── vars.css        # CSS Custom Properties (Farben, Typo, Abstände, Breakpoints)
│   └── app.css         # Alle Stile (global, screens, komponenten)
├── manifest.json       # PWA-Manifest (name, icons, theme_color, display: standalone)
├── sw.js               # Service Worker (Cache-First für Shell, Network-First für API)
└── icons/              # PWA-Icons (192×192, 512×512 als PNG)
```

---

## 3. Supabase-Integration

- Client via CDN: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`
- `config.js` exportiert zwei Konstanten in den globalen Scope; `app.js` ruft `supabase.createClient(SUPABASE_URL, SUPABASE_KEY)` auf und speichert das Ergebnis als `window.db`
- `db` wird von allen anderen Modulen genutzt
- Anon/Publishable-Key ist client-seitig sicher; Datenzugriff wird durch RLS auf Supabase-Seite kontrolliert

**Relevante Tabellen (Stufe 1):**

| Tabelle | Relevante Spalten |
|---|---|
| `households` | `id`, `name`, `invite_code` (6 Zeichen, Großbuchstaben), `created_at` |
| `profiles` | `id` (= `auth.user.id`), `household_id` (FK → households), `display_name` |

---

## 4. Auth-Flow

```
App startet
  └─ supabase.auth.getSession()
       ├─ Kein User → Screen: #/auth (Login/Register)
       └─ User vorhanden
            └─ profiles laden (SELECT WHERE id = user.id)
                 ├─ household_id = null → Screen: #/household
                 └─ household_id gesetzt → Screen: #/home
```

- `onAuthStateChange` überwacht Sitzungsänderungen und aktualisiert den Router
- Nach erfolgreicher Registrierung: automatischer Login (Supabase-Standard), dann weiter zu `#/household`
- Logout: Session löschen → `#/auth`

---

## 5. Screens

### 5.1 Auth-Screen (`#/auth`)

**Elemente:**
- App-Name „NjaKër" als Wordmark (h1, 32px, Terrakotta)
- Dezenter geometrischer SVG-Akzent unter dem Wordmark
- Toggle-Tabs: „Anmelden" / „Registrieren" (Pill-Form, 48px Höhe)
- Formular:
  - E-Mail: `<input type="email" autocomplete="email">`
  - Passwort: `<input type="password" autocomplete="current-password">` + Show/Hide-Toggle (48×48px Touch-Target)
  - Bei Register zusätzlich: Anzeigename `<input type="text" autocomplete="name">`
- Primary-Button: volle Breite, 52px Höhe, Terrakotta
- Loading-State: Button deaktiviert + Spinner während Auth
- Fehlerausgabe: Toast unten (3 Sekunden, `role="alert"`)

**Verhalten:**
- Anmelden: `auth.signInWithPassword({email, password})` → bei Erfolg Router aktualisiert
- Registrieren: `auth.signUp({email, password})` → `profiles` INSERT mit `display_name` → Router

### 5.2 Haushalt-Screen (`#/household`)

Nur erreichbar wenn `household_id = null`.

**Zwei Optionskarten (gleichwertig nebeneinander auf ≥480px, gestapelt auf <480px):**

**Karte A – Haushalt anlegen:**
- Input: Haushalt-Name (z. B. „Familie Müller")
- Button (Terrakotta): „Anlegen"
- Nach Klick:
  1. 6-stelligen Code generieren: Zufalls-String aus `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (kein O/0/I/1)
  2. `households` INSERT `{name, invite_code}`
  3. `profiles` UPDATE `{household_id}`
  4. Zeige Code groß in Gold (#D4A017), Monospace, mit Copy-Button (Clipboard API)
  5. Button „Weiter" → `#/home`

**Karte B – Haushalt beitreten:**
- Input: 6-stelliger Code (auto-uppercase, maxlength=6)
- Button (Smaragd): „Beitreten"
- Nach Klick:
  1. `households` SELECT WHERE `invite_code = eingabe`
  2. Gefunden → `profiles` UPDATE `{household_id}` → `#/home`
  3. Nicht gefunden → Fehler unter dem Input-Feld

### 5.3 Home-Screen (`#/home`)

- Bottom-Navigation (fest am unteren Rand, Höhe 64px + Safe-Area-Inset)
- 5 Tabs: **Übersicht · Todos · Termine · Haushalt · Mehr**
- Aktiver Tab: Terrakotta, inaktiv: Muted (#6B6457)
- Icons: SVG (Lucide-Icons, inline oder als Symbol-Sprite)
- Touch-Targets: mindestens 48×48px pro Tab
- Hauptbereich: Platzhalter-Inhalt je Tab, bereit für Stufe 2

---

## 6. PWA

- `manifest.json`: `display: "standalone"`, `theme_color: "#C4522A"`, `background_color: "#F5F0E8"`, Icons 192 + 512px
- `sw.js`: Cache-First für App-Shell (HTML, CSS, JS, Icons), Network-First für Supabase-Requests
- `<meta name="viewport" content="width=device-width, initial-scale=1">` — Zoom niemals deaktiviert
- iOS: `<meta name="apple-mobile-web-app-capable">`, Status-Bar-Style

---

## 7. Design-System (CSS Custom Properties in `vars.css`)

```css
/* Farben */
--c-bg: #F5F0E8;
--c-surface: #FDFAF4;
--c-primary: #C4522A;
--c-primary-dark: #A03E1E;
--c-gold: #D4A017;
--c-green: #1B5E3B;
--c-green-dark: #144830;
--c-text: #1A1A1A;
--c-text-muted: #6B6457;
--c-border: #E0D9CC;
--c-error: #B91C1C;
--c-success: #15803D;

/* Typografie */
--font-sans: 'Plus Jakarta Sans', system-ui, sans-serif;
--text-xs: 0.75rem;   /* 12px */
--text-sm: 0.875rem;  /* 14px */
--text-base: 1rem;    /* 16px – Minimum Body, verhindert iOS-Auto-Zoom */
--text-lg: 1.125rem;  /* 18px */
--text-xl: 1.375rem;  /* 22px */
--text-2xl: 1.75rem;  /* 28px */
--text-3xl: 2rem;     /* 32px */

/* Abstände (8dp-Raster) */
--space-1: 0.25rem;  /* 4px */
--space-2: 0.5rem;   /* 8px */
--space-3: 0.75rem;  /* 12px */
--space-4: 1rem;     /* 16px */
--space-6: 1.5rem;   /* 24px */
--space-8: 2rem;     /* 32px */
--space-12: 3rem;    /* 48px */
--space-16: 4rem;    /* 64px */

/* Radien */
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 16px;
--radius-xl: 24px;
--radius-full: 9999px;

/* Schatten */
--shadow-sm: 0 1px 3px rgba(26,26,26,0.08);
--shadow-md: 0 4px 12px rgba(26,26,26,0.10);

/* Layout */
--max-width: 440px;    /* Schmale Spalte auf Desktop */
--bottom-nav-h: 64px;
```

---

## 8. Mobile-First-Anforderungen

- Basis-Zielgröße: 360–390px Viewport-Breite
- Alle Touch-Targets: **mindestens 48×48px** (Inputs, Buttons, Nav-Tabs, Icon-Buttons)
- Body-Schriftgröße mindestens **16px** (verhindert iOS Auto-Zoom bei Focus)
- Auf Desktop: App zentriert in `max-width: 440px`, Rest Creme-Hintergrund
- Kein horizontaler Scroll auf keiner Breite
- Bottom-Nav: `position: fixed; bottom: 0` + `padding-bottom: env(safe-area-inset-bottom)` für iPhone-Notch
- Hauptinhalt: `padding-bottom` gleich Bottom-Nav-Höhe + Safe-Area, damit nichts verdeckt wird
- `touch-action: manipulation` auf Buttons (eliminiert 300ms Tap-Delay)

---

## 9. Abgrenzung (nicht in Stufe 1)

- Verträge, Todos, Termine, Kosten, Putzplan, Garantien, Geschenklisten → Stufe 2+
- Realtime-Sync → Stufe 2+
- Avatar/Profilbild-Upload → später
- E-Mail-Bestätigung / Magic Links → optional, nach Bedarf
- Dark Mode → nach Bedarf
