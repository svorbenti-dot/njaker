# NjaKër Stufe 2 – Implementierungsplan

> **Ausführung:** Task für Task in der Hauptsession – kein Subagent-Bulk-Run. Nach jedem Task stoppen und auf Freigabe warten.

**Goal:** Vier vollständige Features in die bestehende PWA einbauen: Shared To-Dos (mit Dateianhang + Realtime), Termine (mit ICS-Export + Wiederholung), Verträge (mit PDF-Upload + ICS-Kündigungserinnerung), Dashboard/Cockpit – alle über die bestehende Bottom-Navigation erreichbar.

**Architecture:** Jedes Feature = eine eigene JS-Datei mit globalen Funktionen (vanilla JS, kein Build-Schritt). `ics.js` liefert gemeinsam genutzte Hilfsfunktionen. `home.js` delegiert Tab-Rendering an die jeweiligen Modul-Funktionen. CSS-Ergänzungen kommen in `css/app.css`.

**Tech Stack:** Vanilla JS (ES2020) · HTML5 · CSS Custom Properties · Supabase JS v2 (CDN) · Supabase Storage · PWA · GitHub Pages

## Global Constraints

- Kein Build-Schritt – alles läuft direkt im Browser
- Supabase CDN: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`
- Globale Variablen aus Stufe 1: `window.db` (Supabase-Client), `window.showToast(msg)`, `window.navigate(hash)`
- Alle Touch-Targets mind. 48 × 48 px; Body-Font mind. 16 px; kein horizontaler Scroll
- Keine externen Bibliotheken außer Supabase CDN
- Supabase Storage: öffentliche Buckets (`public: true`), Pfade sind UUID-basiert (effektiv nicht ratbar)
- Invite-Code-Zeichensatz (unverändert): `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
- Script-Ladereihenfolge in index.html: Supabase CDN → config.js → ics.js → auth.js → household.js → todos.js → termine.js → contracts.js → dashboard.js → home.js → app.js

---

## Datei-Übersicht

| Datei | Status | Verantwortung |
|---|---|---|
| `ics.js` | Neu (Task 1) | ICS-Generator, downloadICS, _escapeHTML, _formatDate, _formatDateTime, _needsReminder, _reminderDate |
| `todos.js` | Neu (Task 2) | renderTodos, createTodo, toggleTodo, deleteTodo, uploadAttachment, Realtime |
| `termine.js` | Neu (Task 3) | renderTermine, createTermin, deleteTermin, exportTerminICS |
| `contracts.js` | Neu (Task 4) | renderContracts, createContract, deleteContract, exportContractICS, PDF-Upload |
| `dashboard.js` | Neu (Task 5) | renderDashboard, lädt aggregierte Daten aus todos/appointments/contracts |
| `home.js` | Ändern (Task 6) | Tab „Haushalt" → „Verträge", _renderActiveTab() delegiert an Module, _cleanupTodos() |
| `css/app.css` | Ändern (Task 6) | Neue Komponenten: feature-screen, fab, item-card, todo-form, badge, due-chip, dashboard-card |
| `index.html` | Ändern (Task 1–5) | Pro Task ein neuer `<script>`-Tag |
| `sw.js` | Ändern (Task 7) | CACHE → 'njaker-v2', SHELL um neue JS-Files erweitert |

---

## Task 0: Supabase-Konfiguration (manuell im Dashboard)

**Du führst diese Schritte selbst aus – kein Code wird geschrieben.**

### 0a – Tabellen-Spalten hinzufügen

Supabase Dashboard → SQL Editor → New query → folgenden Block einfügen → Run:

```sql
-- ─── todos ───────────────────────────────────────────────
ALTER TABLE todos
  ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES households(id),
  ADD COLUMN IF NOT EXISTS title        text,
  ADD COLUMN IF NOT EXISTS due_date     date,
  ADD COLUMN IF NOT EXISTS completed    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by   uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS attachment_url  text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS created_at   timestamptz DEFAULT now();

-- ─── appointments ────────────────────────────────────────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS household_id   uuid REFERENCES households(id),
  ADD COLUMN IF NOT EXISTS title          text,
  ADD COLUMN IF NOT EXISTS start_at       timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence     text CHECK (recurrence IN ('once','weekly','monthly','yearly')),
  ADD COLUMN IF NOT EXISTS recurrence_end date,
  ADD COLUMN IF NOT EXISTS created_at     timestamptz DEFAULT now();

-- ─── contracts ───────────────────────────────────────────
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS household_id  uuid REFERENCES households(id),
  ADD COLUMN IF NOT EXISTS name          text,
  ADD COLUMN IF NOT EXISTS provider      text,
  ADD COLUMN IF NOT EXISTS category      text CHECK (category IN ('insurance','telecom','utilities','streaming','other')),
  ADD COLUMN IF NOT EXISTS start_date    date,
  ADD COLUMN IF NOT EXISTS end_date      date,
  ADD COLUMN IF NOT EXISTS notice_period text,
  ADD COLUMN IF NOT EXISTS monthly_cost  numeric(10,2),
  ADD COLUMN IF NOT EXISTS pdf_url       text,
  ADD COLUMN IF NOT EXISTS created_at    timestamptz DEFAULT now();
```

### 0b – RLS-Policies anlegen

Neues SQL-Query → einfügen → Run:

```sql
-- ─── todos ───────────────────────────────────────────────
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "todos: household members"
  ON todos
  USING (household_id IN (
    SELECT household_id FROM profiles WHERE id = auth.uid()
  ))
  WITH CHECK (household_id IN (
    SELECT household_id FROM profiles WHERE id = auth.uid()
  ));

-- ─── appointments ────────────────────────────────────────
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appointments: household members"
  ON appointments
  USING (household_id IN (
    SELECT household_id FROM profiles WHERE id = auth.uid()
  ))
  WITH CHECK (household_id IN (
    SELECT household_id FROM profiles WHERE id = auth.uid()
  ));

-- ─── contracts ───────────────────────────────────────────
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contracts: household members"
  ON contracts
  USING (household_id IN (
    SELECT household_id FROM profiles WHERE id = auth.uid()
  ))
  WITH CHECK (household_id IN (
    SELECT household_id FROM profiles WHERE id = auth.uid()
  ));
```

### 0c – Storage-Buckets anlegen

Dashboard → Storage → New bucket:

1. Name: `todo-attachments` · Public: **ON** · Allowed MIME types: `image/*,application/pdf` · Max upload size: 10 MB → Create
2. Name: `contract-pdfs` · Public: **ON** · Allowed MIME types: `application/pdf` · Max upload size: 25 MB → Create

Für beide Buckets unter Policies → New policy → Custom → Folgendes SQL (bucket-Name anpassen):

```sql
-- INSERT
CREATE POLICY "authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'todo-attachments');

-- SELECT
CREATE POLICY "authenticated read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'todo-attachments');

-- DELETE
CREATE POLICY "authenticated delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'todo-attachments');
```

(Für `contract-pdfs` dieselben drei Policies, bucket_id entsprechend ändern.)

- [ ] SQL 0a ausführen (todos/appointments/contracts Spalten)
- [ ] SQL 0b ausführen (RLS-Policies)
- [ ] Bucket `todo-attachments` angelegt (public, 10 MB)
- [ ] Bucket `contract-pdfs` angelegt (public, 25 MB)
- [ ] Storage-Policies für beide Buckets angelegt

---

## Task 1: ics.js — ICS-Generator + geteilte Hilfsfunktionen

**Files:**
- Erstellen: `ics.js`
- Ändern: `index.html` (ein `<script>`-Tag einfügen)

**Produces:** `generateICS()`, `downloadICS()`, `_escapeHTML()`, `_formatDate()`, `_formatDateTime()`, `_needsReminder()`, `_reminderDate()` — alle global verfügbar für todos.js, termine.js, contracts.js, dashboard.js.

- [ ] **Schritt 1: ics.js schreiben**

Datei `ics.js` im Projektroot anlegen:

```js
/* ics.js – ICS-Generator + geteilte Hilfsfunktionen */

function _pad(n) { return String(n).padStart(2, '0'); }

function _toICSDate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}${_pad(d.getMonth() + 1)}${_pad(d.getDate())}`;
}

function _uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}@njaker`;
}

function _escapeICS(str) {
  return String(str || '').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

// title, date (Date|string), description (string), rrule (string, optional)
function generateICS({ title, date, description = '', rrule = '' }) {
  const dtstart = _toICSDate(date);
  const dtend = (() => {
    const d = new Date(date); d.setDate(d.getDate() + 1); return _toICSDate(d);
  })();
  // 17:00 UTC = 18:00 CET (winter) auf dem Erinnerungstag
  const alarm = `${dtstart}T170000Z`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NjaKer//NjaKer//DE',
    'BEGIN:VEVENT',
    `UID:${_uid()}`,
    `DTSTART;VALUE=DATE:${dtstart}`,
    `DTEND;VALUE=DATE:${dtend}`,
    `SUMMARY:${_escapeICS(title)}`,
    `DESCRIPTION:${_escapeICS(description)}`,
  ];
  if (rrule) lines.push(`RRULE:${rrule}`);
  lines.push(
    'BEGIN:VALARM',
    `TRIGGER;VALUE=DATE-TIME:${alarm}`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${_escapeICS(title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  );
  return lines.join('\r\n');
}

function downloadICS(filename, icsString) {
  const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Datum-Utilities (genutzt von allen Feature-Modulen) ─────────────
function _formatDate(iso) {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function _formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function _escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Vertrags-Erinnerungslogik (genutzt von contracts.js + dashboard.js) ──
function _needsReminder(startDate, endDate) {
  if (!startDate || !endDate) return false;
  return (new Date(endDate) - new Date(startDate)) >= 2 * 365.25 * 24 * 3600 * 1000;
}

function _reminderDate(endDate) {
  const d = new Date(endDate);
  d.setMonth(d.getMonth() - 3);
  d.setDate(d.getDate() - 14);
  return d;
}
```

- [ ] **Schritt 2: Script-Tag in index.html einfügen**

In `index.html` den Block `<script src="config.js">` suchen und `ics.js` direkt danach einfügen, sodass der Block so aussieht:

```html
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="config.js"></script>
  <script src="ics.js"></script>
  <script src="auth.js"></script>
  <script src="household.js"></script>
  <script src="home.js"></script>
  <script src="app.js"></script>
```

- [ ] **Schritt 3: Im Browser testen**

App mit `npx serve .` (oder VS Code Live Server) öffnen → einloggen → Browser-Konsole:

```js
generateICS({ title: 'Test', date: new Date(), description: 'Hallo' })
// Erwartet: String beginnt mit "BEGIN:VCALENDAR\r\nVERSION:2.0"

downloadICS('test', generateICS({ title: 'Test', date: new Date() }))
// Erwartet: .ics-Datei wird heruntergeladen
```

- [ ] **Schritt 4: Committen**

```bash
git add ics.js index.html
git commit -m "feat: add ICS generator and shared date utilities"
```

---

## Task 2: todos.js — Shared To-Dos

**Files:**
- Erstellen: `todos.js`
- Ändern: `index.html` (Script-Tag)

**Consumes:** `window.db`, `window.showToast`, `_escapeHTML`, `_formatDate` (aus ics.js)
**Produces:** `renderTodos(container)`, `createTodo()`, `toggleTodo(id, completed)`, `deleteTodo(id)`, `showTodoForm()`, `hideTodoForm()`, `_cleanupTodos()` — global.

- [ ] **Schritt 1: todos.js schreiben**

```js
/* todos.js – Shared To-Dos mit Dateianhang + Realtime */

let _todosHouseholdId = null;
let _todosChannel = null;
let _cachedTodos = [];

async function _getTodosHouseholdId() {
  if (_todosHouseholdId) return _todosHouseholdId;
  const { data: { user } } = await window.db.auth.getUser();
  const { data: profile } = await window.db
    .from('profiles').select('household_id').eq('id', user.id).single();
  _todosHouseholdId = profile.household_id;
  return _todosHouseholdId;
}

function _cleanupTodos() {
  if (_todosChannel) { _todosChannel.unsubscribe(); _todosChannel = null; }
}

async function renderTodos(container) {
  container.innerHTML = `
    <div class="feature-screen">
      <div class="feature-header">
        <h1>Todos</h1>
      </div>

      <div class="inline-form hidden" id="todo-form">
        <div class="field-group">
          <label for="todo-title">Titel *</label>
          <input type="text" id="todo-title" placeholder="Was muss erledigt werden?" autocomplete="off">
        </div>
        <div class="field-group">
          <label for="todo-due">Fälligkeitsdatum (optional)</label>
          <input type="date" id="todo-due">
        </div>
        <div class="field-group">
          <label for="todo-attachment">Anhang – Foto oder PDF (optional)</label>
          <input type="file" id="todo-attachment" accept="image/*,.pdf">
        </div>
        <div class="form-actions">
          <button class="btn-secondary" onclick="hideTodoForm()">Abbrechen</button>
          <button class="btn-primary" id="todo-save-btn" onclick="createTodo()">Speichern</button>
        </div>
      </div>

      <div id="todos-list" class="items-list">
        <div class="spinner-wrap"><div class="spinner"></div></div>
      </div>
    </div>

    <button class="fab" onclick="showTodoForm()" aria-label="Todo hinzufügen">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  `;

  const householdId = await _getTodosHouseholdId();
  await _loadAndRenderTodos(householdId);
  _subscribeToTodos(householdId);
}

async function _loadAndRenderTodos(householdId) {
  const hid = householdId || _todosHouseholdId;
  const { data, error } = await window.db
    .from('todos')
    .select('*')
    .eq('household_id', hid)
    .order('completed', { ascending: true })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) { showToast('Todos konnten nicht geladen werden.'); return; }
  _cachedTodos = data || [];
  _renderTodosList(_cachedTodos);
}

function _renderTodosList(todos) {
  const list = document.getElementById('todos-list');
  if (!list) return;

  if (todos.length === 0) {
    list.innerHTML = '<p class="empty-state">Keine Todos. Füge das erste hinzu!</p>';
    return;
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);

  list.innerHTML = todos.map(todo => {
    const due = todo.due_date ? new Date(`${todo.due_date}T00:00:00`) : null;
    const overdue = due && due < today && !todo.completed;
    const soon = due && !overdue && (due - today) / 86400000 <= 3 && !todo.completed;

    return `
      <div class="item-card ${todo.completed ? 'item-completed' : ''}">
        <label class="checkbox-wrap">
          <input type="checkbox" ${todo.completed ? 'checked' : ''}
                 onchange="toggleTodo('${todo.id}', this.checked)"
                 aria-label="${_escapeHTML(todo.title)} abhaken">
          <span class="checkmark"></span>
        </label>
        <div class="item-body">
          <span class="item-title">${_escapeHTML(todo.title)}</span>
          ${due ? `<span class="due-chip${overdue ? ' due-overdue' : soon ? ' due-soon' : ''}">${_formatDate(todo.due_date)}</span>` : ''}
        </div>
        ${todo.attachment_url ? `
          <a class="icon-btn" href="${todo.attachment_url}" target="_blank" rel="noopener"
             aria-label="Anhang öffnen: ${_escapeHTML(todo.attachment_name || 'Datei')}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </a>` : ''}
        <button class="delete-btn" onclick="deleteTodo('${todo.id}')"
                aria-label="${_escapeHTML(todo.title)} löschen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
          </svg>
        </button>
      </div>
    `;
  }).join('');
}

function _subscribeToTodos(householdId) {
  _todosChannel = window.db
    .channel('todos-realtime')
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'todos',
      filter: `household_id=eq.${householdId}`,
    }, () => _loadAndRenderTodos(householdId))
    .subscribe();
}

function showTodoForm() {
  const form = document.getElementById('todo-form');
  if (form) { form.classList.remove('hidden'); document.getElementById('todo-title').focus(); }
}

function hideTodoForm() {
  const form = document.getElementById('todo-form');
  if (!form) return;
  form.classList.add('hidden');
  document.getElementById('todo-title').value = '';
  document.getElementById('todo-due').value = '';
  document.getElementById('todo-attachment').value = '';
}

async function createTodo() {
  const title = document.getElementById('todo-title').value.trim();
  if (!title) { document.getElementById('todo-title').focus(); return; }

  const due = document.getElementById('todo-due').value || null;
  const file = document.getElementById('todo-attachment').files[0] || null;

  const btn = document.getElementById('todo-save-btn');
  btn.disabled = true; btn.textContent = '…';

  const householdId = await _getTodosHouseholdId();
  const { data: { user } } = await window.db.auth.getUser();

  const { data: todo, error } = await window.db
    .from('todos')
    .insert({ household_id: householdId, title, due_date: due, created_by: user.id })
    .select('id').single();

  if (error) {
    showToast('Fehler: ' + error.message);
    btn.disabled = false; btn.textContent = 'Speichern';
    return;
  }

  if (file) await _uploadAttachment(todo.id, file, householdId);

  hideTodoForm();
  btn.disabled = false; btn.textContent = 'Speichern';
  // Realtime-Subscription löst _loadAndRenderTodos() aus
}

async function _uploadAttachment(todoId, file, householdId) {
  const ext = file.name.split('.').pop();
  const path = `${householdId}/${todoId}/${Date.now()}.${ext}`;
  const { error } = await window.db.storage.from('todo-attachments').upload(path, file);
  if (error) { showToast('Anhang konnte nicht hochgeladen werden.'); return; }

  const { data: { publicUrl } } = window.db.storage
    .from('todo-attachments').getPublicUrl(path);

  await window.db.from('todos')
    .update({ attachment_url: publicUrl, attachment_name: file.name })
    .eq('id', todoId);
}

async function toggleTodo(id, completed) {
  const { error } = await window.db.from('todos').update({ completed }).eq('id', id);
  if (error) showToast('Fehler beim Aktualisieren.');
  // Realtime-Subscription löst _loadAndRenderTodos() aus
}

async function deleteTodo(id) {
  const { error } = await window.db.from('todos').delete().eq('id', id);
  if (error) showToast('Fehler beim Löschen: ' + error.message);
}
```

- [ ] **Schritt 2: Script-Tag in index.html einfügen**

```html
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="config.js"></script>
  <script src="ics.js"></script>
  <script src="auth.js"></script>
  <script src="household.js"></script>
  <script src="todos.js"></script>
  <script src="home.js"></script>
  <script src="app.js"></script>
```

- [ ] **Schritt 3: Committen**

```bash
git add todos.js index.html
git commit -m "feat: add shared todos with file attachment and realtime sync"
```

---

## Task 3: termine.js — Termine mit ICS-Export

**Files:**
- Erstellen: `termine.js`
- Ändern: `index.html` (Script-Tag)

**Consumes:** `window.db`, `window.showToast`, `generateICS`, `downloadICS`, `_escapeHTML`, `_formatDateTime` (aus ics.js)
**Produces:** `renderTermine(container)`, `createTermin()`, `deleteTermin(id)`, `showTerminForm()`, `hideTerminForm()`, `toggleRecurrenceEnd()`, `exportTerminICS(id)` — global.

- [ ] **Schritt 1: termine.js schreiben**

```js
/* termine.js – Termine mit Wiederholung + ICS-Export */

let _termineHouseholdId = null;
let _cachedTermine = [];

const RECURRENCE_LABELS = {
  once: 'Einmalig', weekly: 'Wöchentlich', monthly: 'Monatlich', yearly: 'Jährlich',
};

async function _getTermineHouseholdId() {
  if (_termineHouseholdId) return _termineHouseholdId;
  const { data: { user } } = await window.db.auth.getUser();
  const { data: profile } = await window.db
    .from('profiles').select('household_id').eq('id', user.id).single();
  _termineHouseholdId = profile.household_id;
  return _termineHouseholdId;
}

async function renderTermine(container) {
  container.innerHTML = `
    <div class="feature-screen">
      <div class="feature-header">
        <h1>Termine</h1>
      </div>

      <div class="inline-form hidden" id="termin-form">
        <div class="field-group">
          <label for="termin-title">Titel *</label>
          <input type="text" id="termin-title" placeholder="z. B. Zahnarzt" autocomplete="off">
        </div>
        <div class="form-row">
          <div class="field-group">
            <label for="termin-date">Datum *</label>
            <input type="date" id="termin-date">
          </div>
          <div class="field-group">
            <label for="termin-time">Uhrzeit</label>
            <input type="time" id="termin-time">
          </div>
        </div>
        <div class="field-group">
          <label for="termin-recurrence">Wiederholung</label>
          <select id="termin-recurrence" onchange="toggleRecurrenceEnd()">
            <option value="once">Einmalig</option>
            <option value="weekly">Wöchentlich</option>
            <option value="monthly">Monatlich</option>
            <option value="yearly">Jährlich</option>
          </select>
        </div>
        <div class="field-group hidden" id="recurrence-end-group">
          <label for="termin-end">Wiederholen bis (optional)</label>
          <input type="date" id="termin-end">
        </div>
        <div class="form-actions">
          <button class="btn-secondary" onclick="hideTerminForm()">Abbrechen</button>
          <button class="btn-primary" id="termin-save-btn" onclick="createTermin()">Speichern</button>
        </div>
      </div>

      <div id="termine-list" class="items-list">
        <div class="spinner-wrap"><div class="spinner"></div></div>
      </div>
    </div>

    <button class="fab" onclick="showTerminForm()" aria-label="Termin hinzufügen">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  `;

  const householdId = await _getTermineHouseholdId();
  await _loadAndRenderTermine(householdId);
}

async function _loadAndRenderTermine(householdId) {
  const { data, error } = await window.db
    .from('appointments')
    .select('*')
    .eq('household_id', householdId || _termineHouseholdId)
    .order('start_at', { ascending: true });

  if (error) { showToast('Termine konnten nicht geladen werden.'); return; }
  _cachedTermine = data || [];

  const list = document.getElementById('termine-list');
  if (!list) return;

  if (_cachedTermine.length === 0) {
    list.innerHTML = '<p class="empty-state">Keine Termine eingetragen.</p>';
    return;
  }

  const now = new Date();
  list.innerHTML = _cachedTermine.map(t => `
    <div class="item-card ${new Date(t.start_at) < now ? 'item-past' : ''}">
      <div class="item-body">
        <span class="item-title">${_escapeHTML(t.title)}</span>
        <span class="item-meta">${_formatDateTime(t.start_at)}</span>
        ${t.recurrence !== 'once'
          ? `<span class="badge badge-recurrence">${RECURRENCE_LABELS[t.recurrence]}</span>`
          : ''}
      </div>
      <div class="item-actions">
        <button class="icon-btn" onclick="exportTerminICS('${t.id}')"
                aria-label="Termin als ICS herunterladen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        <button class="delete-btn" onclick="deleteTermin('${t.id}')"
                aria-label="${_escapeHTML(t.title)} löschen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

function toggleRecurrenceEnd() {
  const rec = document.getElementById('termin-recurrence').value;
  document.getElementById('recurrence-end-group').classList.toggle('hidden', rec === 'once');
}

function showTerminForm() {
  const form = document.getElementById('termin-form');
  if (form) { form.classList.remove('hidden'); document.getElementById('termin-title').focus(); }
}

function hideTerminForm() {
  const form = document.getElementById('termin-form');
  if (!form) return;
  form.classList.add('hidden');
  ['termin-title', 'termin-date', 'termin-time', 'termin-end'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const sel = document.getElementById('termin-recurrence');
  if (sel) sel.value = 'once';
  document.getElementById('recurrence-end-group').classList.add('hidden');
}

async function createTermin() {
  const title = document.getElementById('termin-title').value.trim();
  const date  = document.getElementById('termin-date').value;
  const time  = document.getElementById('termin-time').value || '09:00';
  if (!title || !date) { showToast('Titel und Datum sind Pflichtfelder.'); return; }

  const recurrence    = document.getElementById('termin-recurrence').value;
  const recurrenceEnd = document.getElementById('termin-end').value || null;

  const btn = document.getElementById('termin-save-btn');
  btn.disabled = true; btn.textContent = '…';

  const householdId = await _getTermineHouseholdId();
  const start_at = new Date(`${date}T${time}`).toISOString();

  const { error } = await window.db.from('appointments').insert({
    household_id: householdId, title, start_at, recurrence,
    recurrence_end: recurrenceEnd,
  });

  if (error) {
    showToast('Fehler: ' + error.message);
    btn.disabled = false; btn.textContent = 'Speichern';
    return;
  }

  hideTerminForm();
  btn.disabled = false; btn.textContent = 'Speichern';
  await _loadAndRenderTermine(householdId);
}

async function deleteTermin(id) {
  const { error } = await window.db.from('appointments').delete().eq('id', id);
  if (error) { showToast('Fehler: ' + error.message); return; }
  await _loadAndRenderTermine();
}

function exportTerminICS(id) {
  const t = _cachedTermine.find(x => x.id === id);
  if (!t) return;

  const rruleMap = { weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' };
  let rrule = '';
  if (t.recurrence !== 'once') {
    rrule = rruleMap[t.recurrence] || '';
    if (rrule && t.recurrence_end) rrule += `;UNTIL=${t.recurrence_end.replace(/-/g, '')}`;
  }

  const icsString = generateICS({
    title: t.title,
    date: new Date(t.start_at),
    description: t.recurrence !== 'once'
      ? `Wiederholt sich: ${RECURRENCE_LABELS[t.recurrence]}`
      : '',
    rrule,
  });

  downloadICS(`Termin-${t.title.replace(/[^a-zA-Z0-9]/g, '-')}`, icsString);
}
```

- [ ] **Schritt 2: Script-Tag in index.html einfügen**

```html
  <script src="ics.js"></script>
  <script src="auth.js"></script>
  <script src="household.js"></script>
  <script src="todos.js"></script>
  <script src="termine.js"></script>
  <script src="home.js"></script>
  <script src="app.js"></script>
```

- [ ] **Schritt 3: Committen**

```bash
git add termine.js index.html
git commit -m "feat: add appointments screen with recurring options and ICS export"
```

---

## Task 4: contracts.js — Verträge mit PDF-Upload + ICS-Kündigung

**Files:**
- Erstellen: `contracts.js`
- Ändern: `index.html` (Script-Tag)

**Consumes:** `window.db`, `window.showToast`, `generateICS`, `downloadICS`, `_escapeHTML`, `_formatDate`, `_needsReminder`, `_reminderDate` (aus ics.js)
**Produces:** `renderContracts(container)`, `createContract()`, `deleteContract(id)`, `showContractForm()`, `hideContractForm()`, `exportContractICS(id)` — global.

- [ ] **Schritt 1: contracts.js schreiben**

```js
/* contracts.js – Vertrags-Manager mit PDF-Upload + ICS-Kündigungserinnerung */

let _contractsHouseholdId = null;
let _cachedContracts = [];

const CONTRACT_CATEGORIES = {
  insurance: 'Versicherung',
  telecom:   'Telekommunikation',
  utilities: 'Strom & Gas',
  streaming: 'Streaming',
  other:     'Sonstiges',
};

async function _getContractsHouseholdId() {
  if (_contractsHouseholdId) return _contractsHouseholdId;
  const { data: { user } } = await window.db.auth.getUser();
  const { data: profile } = await window.db
    .from('profiles').select('household_id').eq('id', user.id).single();
  _contractsHouseholdId = profile.household_id;
  return _contractsHouseholdId;
}

async function renderContracts(container) {
  container.innerHTML = `
    <div class="feature-screen">
      <div class="feature-header">
        <h1>Verträge</h1>
      </div>

      <div class="inline-form hidden" id="contract-form">
        <div class="field-group">
          <label for="contract-name">Vertragsname *</label>
          <input type="text" id="contract-name" placeholder="z. B. Handy-Vertrag" autocomplete="off">
        </div>
        <div class="field-group">
          <label for="contract-provider">Anbieter</label>
          <input type="text" id="contract-provider" placeholder="z. B. Telekom" autocomplete="off">
        </div>
        <div class="field-group">
          <label for="contract-category">Kategorie</label>
          <select id="contract-category">
            <option value="insurance">Versicherung</option>
            <option value="telecom">Telekommunikation</option>
            <option value="utilities">Strom & Gas</option>
            <option value="streaming">Streaming</option>
            <option value="other">Sonstiges</option>
          </select>
        </div>
        <div class="form-row">
          <div class="field-group">
            <label for="contract-start">Vertragsbeginn *</label>
            <input type="date" id="contract-start">
          </div>
          <div class="field-group">
            <label for="contract-end">Vertragsende *</label>
            <input type="date" id="contract-end">
          </div>
        </div>
        <div class="field-group">
          <label for="contract-notice">Kündigungsfrist</label>
          <input type="text" id="contract-notice" placeholder="z. B. 3 Monate" autocomplete="off">
        </div>
        <div class="field-group">
          <label for="contract-cost">Monatliche Kosten (€)</label>
          <input type="number" id="contract-cost" placeholder="0.00" step="0.01" min="0"
                 inputmode="decimal">
        </div>
        <div class="field-group">
          <label for="contract-pdf">Vertragsdokument – PDF (optional)</label>
          <input type="file" id="contract-pdf" accept=".pdf,application/pdf">
        </div>
        <div class="form-actions">
          <button class="btn-secondary" onclick="hideContractForm()">Abbrechen</button>
          <button class="btn-primary" id="contract-save-btn" onclick="createContract()">Speichern</button>
        </div>
      </div>

      <div id="contracts-list" class="items-list">
        <div class="spinner-wrap"><div class="spinner"></div></div>
      </div>
    </div>

    <button class="fab" onclick="showContractForm()" aria-label="Vertrag hinzufügen">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  `;

  const householdId = await _getContractsHouseholdId();
  await _loadAndRenderContracts(householdId);
}

async function _loadAndRenderContracts(householdId) {
  const { data, error } = await window.db
    .from('contracts')
    .select('*')
    .eq('household_id', householdId || _contractsHouseholdId)
    .order('end_date', { ascending: true });

  if (error) { showToast('Verträge konnten nicht geladen werden.'); return; }
  _cachedContracts = data || [];

  const list = document.getElementById('contracts-list');
  if (!list) return;

  if (_cachedContracts.length === 0) {
    list.innerHTML = '<p class="empty-state">Keine Verträge eingetragen.</p>';
    return;
  }

  list.innerHTML = _cachedContracts.map(c => {
    const hasReminder = _needsReminder(c.start_date, c.end_date);
    const cost = c.monthly_cost
      ? Number(c.monthly_cost).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
      : null;

    return `
      <div class="item-card">
        <div class="item-body">
          <span class="item-title">${_escapeHTML(c.name)}</span>
          <span class="item-meta">
            ${c.provider ? _escapeHTML(c.provider) : ''}
            ${cost ? `· ${cost}/Monat` : ''}
          </span>
          <div class="item-tags">
            <span class="badge badge-category">${CONTRACT_CATEGORIES[c.category] || c.category}</span>
            <span class="item-meta">bis ${_formatDate(c.end_date)}</span>
          </div>
        </div>
        <div class="item-actions">
          ${hasReminder ? `
            <button class="icon-btn" onclick="exportContractICS('${c.id}')"
                    title="Kündigungserinnerung als ICS"
                    aria-label="Kündigungserinnerung als Kalender-Datei herunterladen">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
                <line x1="16" x2="16" y1="2" y2="6"/>
                <line x1="8" x2="8" y1="2" y2="6"/>
                <line x1="3" x2="21" y1="10" y2="10"/>
                <line x1="8" x2="8" y1="14" y2="14"/>
              </svg>
            </button>` : ''}
          ${c.pdf_url ? `
            <a class="icon-btn" href="${c.pdf_url}" target="_blank" rel="noopener"
               aria-label="Vertragsdokument öffnen">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </a>` : ''}
          <button class="delete-btn" onclick="deleteContract('${c.id}')"
                  aria-label="${_escapeHTML(c.name)} löschen">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function showContractForm() {
  const form = document.getElementById('contract-form');
  if (form) { form.classList.remove('hidden'); document.getElementById('contract-name').focus(); }
}

function hideContractForm() {
  const form = document.getElementById('contract-form');
  if (!form) return;
  form.classList.add('hidden');
  ['contract-name','contract-provider','contract-start','contract-end',
   'contract-notice','contract-cost'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const cat = document.getElementById('contract-category');
  if (cat) cat.value = 'insurance';
  document.getElementById('contract-pdf').value = '';
}

async function createContract() {
  const name      = document.getElementById('contract-name').value.trim();
  const startDate = document.getElementById('contract-start').value;
  const endDate   = document.getElementById('contract-end').value;
  if (!name || !startDate || !endDate) {
    showToast('Name, Vertragsbeginn und Vertragsende sind Pflichtfelder.');
    return;
  }

  const btn = document.getElementById('contract-save-btn');
  btn.disabled = true; btn.textContent = '…';

  const householdId = await _getContractsHouseholdId();
  const costVal = document.getElementById('contract-cost').value;

  const { data: contract, error } = await window.db.from('contracts').insert({
    household_id:  householdId,
    name,
    provider:      document.getElementById('contract-provider').value.trim() || null,
    category:      document.getElementById('contract-category').value,
    start_date:    startDate,
    end_date:      endDate,
    notice_period: document.getElementById('contract-notice').value.trim() || null,
    monthly_cost:  costVal ? parseFloat(costVal) : null,
  }).select('id').single();

  if (error) {
    showToast('Fehler: ' + error.message);
    btn.disabled = false; btn.textContent = 'Speichern';
    return;
  }

  const pdfFile = document.getElementById('contract-pdf').files[0];
  if (pdfFile) await _uploadContractPDF(contract.id, pdfFile, householdId);

  hideContractForm();
  btn.disabled = false; btn.textContent = 'Speichern';
  await _loadAndRenderContracts(householdId);
}

async function _uploadContractPDF(contractId, file, householdId) {
  const path = `${householdId}/${contractId}/${Date.now()}.pdf`;
  const { error } = await window.db.storage.from('contract-pdfs').upload(path, file);
  if (error) { showToast('PDF konnte nicht hochgeladen werden.'); return; }

  const { data: { publicUrl } } = window.db.storage
    .from('contract-pdfs').getPublicUrl(path);

  await window.db.from('contracts').update({ pdf_url: publicUrl }).eq('id', contractId);
}

async function deleteContract(id) {
  const { error } = await window.db.from('contracts').delete().eq('id', id);
  if (error) { showToast('Fehler: ' + error.message); return; }
  _cachedContracts = _cachedContracts.filter(c => c.id !== id);
  await _loadAndRenderContracts();
}

function exportContractICS(id) {
  const c = _cachedContracts.find(x => x.id === id);
  if (!c) return;

  const remDate = _reminderDate(c.end_date);
  const descParts = [
    c.notice_period ? `Kündigungsfrist: ${c.notice_period}` : '',
    `Vertragsende: ${_formatDate(c.end_date)}`,
    c.provider ? `Anbieter: ${c.provider}` : '',
  ].filter(Boolean);

  const icsString = generateICS({
    title:       `Vertrag kündigen: ${c.name}`,
    date:        remDate,
    description: descParts.join(' · '),
  });

  downloadICS(`Kuendigung-${c.name.replace(/[^a-zA-Z0-9]/g, '-')}`, icsString);
}
```

- [ ] **Schritt 2: Script-Tag in index.html einfügen**

```html
  <script src="ics.js"></script>
  <script src="auth.js"></script>
  <script src="household.js"></script>
  <script src="todos.js"></script>
  <script src="termine.js"></script>
  <script src="contracts.js"></script>
  <script src="home.js"></script>
  <script src="app.js"></script>
```

- [ ] **Schritt 3: Committen**

```bash
git add contracts.js index.html
git commit -m "feat: add contracts screen with PDF upload and ICS cancellation reminder"
```

---

## Task 5: dashboard.js — Cockpit/Übersicht

**Files:**
- Erstellen: `dashboard.js`
- Ändern: `index.html` (Script-Tag)

**Consumes:** `window.db`, `_escapeHTML`, `_formatDate`, `_formatDateTime`, `_needsReminder`, `_reminderDate` (aus ics.js)
**Produces:** `renderDashboard(container)` — global.

- [ ] **Schritt 1: dashboard.js schreiben**

```js
/* dashboard.js – Cockpit / Übersicht */

let _dashHouseholdId = null;

async function _getDashHouseholdId() {
  if (_dashHouseholdId) return _dashHouseholdId;
  const { data: { user } } = await window.db.auth.getUser();
  const { data: profile } = await window.db
    .from('profiles').select('household_id').eq('id', user.id).single();
  _dashHouseholdId = profile.household_id;
  return _dashHouseholdId;
}

async function renderDashboard(container) {
  container.innerHTML = `
    <div class="feature-screen">
      <div class="feature-header"><h1>Übersicht</h1></div>
      <div id="dashboard-cards" class="dashboard-cards">
        <div class="spinner-wrap"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  const householdId = await _getDashHouseholdId();
  const [todos, termine, contracts] = await Promise.all([
    _fetchDashTodos(householdId),
    _fetchDashTermine(householdId),
    _fetchDashContracts(householdId),
  ]);

  const cards = document.getElementById('dashboard-cards');
  if (!cards) return;
  cards.innerHTML =
    _todosCard(todos) +
    _termineCard(termine) +
    _contractsCard(contracts) +
    _garantienCard();
}

async function _fetchDashTodos(householdId) {
  const in14 = new Date();
  in14.setDate(in14.getDate() + 14);
  const { data } = await window.db
    .from('todos')
    .select('id, title, due_date')
    .eq('household_id', householdId)
    .eq('completed', false)
    .not('due_date', 'is', null)
    .lte('due_date', in14.toISOString().slice(0, 10))
    .order('due_date', { ascending: true })
    .limit(5);
  return data || [];
}

async function _fetchDashTermine(householdId) {
  const { data } = await window.db
    .from('appointments')
    .select('id, title, start_at, recurrence')
    .eq('household_id', householdId)
    .gt('start_at', new Date().toISOString())
    .order('start_at', { ascending: true })
    .limit(5);
  return data || [];
}

async function _fetchDashContracts(householdId) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await window.db
    .from('contracts')
    .select('id, name, start_date, end_date, notice_period')
    .eq('household_id', householdId)
    .gt('end_date', today);

  if (!data) return [];
  const in60 = new Date(); in60.setDate(in60.getDate() + 60);
  return data
    .filter(c => _needsReminder(c.start_date, c.end_date) && _reminderDate(c.end_date) <= in60)
    .sort((a, b) => _reminderDate(a.end_date) - _reminderDate(b.end_date));
}

function _todosCard(todos) {
  const body = todos.length === 0
    ? '<p class="card-empty">Keine fälligen Todos in den nächsten 14 Tagen.</p>'
    : todos.map(t => `
        <div class="dash-item">
          <span>${_escapeHTML(t.title)}</span>
          <span class="item-meta">${_formatDate(t.due_date)}</span>
        </div>`).join('');
  return `<div class="dash-card">
    <h2 class="dash-card-title">Todos</h2>${body}
  </div>`;
}

function _termineCard(termine) {
  const body = termine.length === 0
    ? '<p class="card-empty">Keine bevorstehenden Termine.</p>'
    : termine.map(t => `
        <div class="dash-item">
          <span>${_escapeHTML(t.title)}</span>
          <span class="item-meta">${_formatDateTime(t.start_at)}</span>
        </div>`).join('');
  return `<div class="dash-card">
    <h2 class="dash-card-title">Termine</h2>${body}
  </div>`;
}

function _contractsCard(contracts) {
  const body = contracts.length === 0
    ? '<p class="card-empty">Keine Kündigungen in den nächsten 60 Tagen.</p>'
    : contracts.map(c => {
        const rem = _reminderDate(c.end_date);
        return `
          <div class="dash-item">
            <span>${_escapeHTML(c.name)}</span>
            <span class="item-meta">kündigen bis ${_formatDate(rem.toISOString().slice(0, 10))}</span>
          </div>`;
      }).join('');
  return `<div class="dash-card dash-card-alert">
    <h2 class="dash-card-title">Kündigungen</h2>${body}
  </div>`;
}

function _garantienCard() {
  return `<div class="dash-card dash-card-placeholder">
    <h2 class="dash-card-title">Garantien</h2>
    <p class="card-empty">Garantie-Verwaltung kommt in Stufe 3.</p>
  </div>`;
}
```

- [ ] **Schritt 2: Script-Tag in index.html einfügen**

```html
  <script src="ics.js"></script>
  <script src="auth.js"></script>
  <script src="household.js"></script>
  <script src="todos.js"></script>
  <script src="termine.js"></script>
  <script src="contracts.js"></script>
  <script src="dashboard.js"></script>
  <script src="home.js"></script>
  <script src="app.js"></script>
```

- [ ] **Schritt 3: Committen**

```bash
git add dashboard.js index.html
git commit -m "feat: add dashboard with todos, appointments, contracts and warranties placeholder"
```

---

## Task 6: home.js aktualisieren + CSS-Erweiterungen

**Files:**
- Ersetzen: `home.js` (Tab-Umbenennung, Delegation an Module, Cleanup)
- Erweitern: `css/app.css` (alle neuen Komponenten-Styles)

Nach diesem Task ist die komplette Stufe 2 im Browser testbar.

- [ ] **Schritt 1: home.js vollständig ersetzen**

```js
/* home.js – Home-Screen mit Bottom-Navigation (Stufe 2) */

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
    id: 'vertraege', label: 'Verträge',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/></svg>`,
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
      <main class="tab-content" id="tab-content" role="main"></main>
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
  _renderActiveTab();
}

function setActiveTab(tabId) {
  _activeTab = tabId;
  if (typeof _cleanupTodos === 'function') _cleanupTodos();
  document.querySelectorAll('.nav-tab').forEach((btn, i) => {
    const active = NAV_ITEMS[i].id === tabId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  });
  _renderActiveTab();
}

function _renderActiveTab() {
  const content = document.getElementById('tab-content');
  if (!content) return;
  switch (_activeTab) {
    case 'uebersicht': renderDashboard(content);  break;
    case 'todos':      renderTodos(content);       break;
    case 'termine':    renderTermine(content);     break;
    case 'vertraege':  renderContracts(content);   break;
    case 'mehr':       _renderMehr(content);       break;
  }
}

function _renderMehr(content) {
  content.innerHTML = `
    <div class="placeholder">
      <h2>Mehr</h2>
      <p>Garantien · Putzplan · Geschenke<br>kommen in Stufe 3.</p>
      <button class="btn-logout" onclick="logout()">Abmelden</button>
    </div>
  `;
}

async function logout() {
  await window.db.auth.signOut();
}
```

- [ ] **Schritt 2: CSS-Erweiterungen an css/app.css anhängen**

Am Ende von `css/app.css` folgenden Block hinzufügen:

```css
/* ═══════════════════════════════════════════════════════════
   STUFE 2 – Feature-Screens
═══════════════════════════════════════════════════════════ */

/* ─── Feature-Screen-Wrapper ─────────────────────────────── */
.feature-screen {
  padding: var(--space-4) var(--space-4) var(--space-8);
  min-height: 100%;
}

.feature-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}

.feature-header h1 {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--c-text);
}

/* ─── FAB (Floating Action Button) ──────────────────────── */
.fab {
  position: fixed;
  bottom: calc(72px + env(safe-area-inset-bottom) + 16px);
  right: calc(50% - min(440px, 100vw) / 2 + 16px);
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--c-primary);
  color: var(--c-bg);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(196, 82, 42, 0.35);
  touch-action: manipulation;
  transition: transform 150ms ease, box-shadow 150ms ease;
  z-index: 20;
}
.fab:active { transform: scale(0.94); box-shadow: 0 2px 8px rgba(196, 82, 42, 0.25); }

@media (min-width: 600px) {
  .fab { right: calc(50% - 220px + 16px); }
}

/* ─── Inline-Formular (geteilt: todos, termine, contracts) ─ */
.inline-form {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  margin-bottom: var(--space-4);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

/* ─── Items-Liste ────────────────────────────────────────── */
.items-list { display: flex; flex-direction: column; gap: var(--space-2); }

.spinner-wrap {
  display: flex;
  justify-content: center;
  padding: var(--space-8) 0;
}

.empty-state {
  text-align: center;
  color: var(--c-text-muted);
  padding: var(--space-8) var(--space-4);
  font-size: var(--text-base);
}

/* ─── Item-Card ──────────────────────────────────────────── */
.item-card {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-3);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 56px;
}

.item-card.item-completed { opacity: 0.55; }
.item-card.item-completed .item-title { text-decoration: line-through; }
.item-card.item-past { opacity: 0.5; }

.item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-title {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--c-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  font-size: var(--text-sm);
  color: var(--c-text-muted);
}

.item-tags {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: 2px;
  flex-wrap: wrap;
}

.item-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
}

/* ─── Custom Checkbox ────────────────────────────────────── */
.checkbox-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  cursor: pointer;
  width: 24px;
  height: 24px;
}

.checkbox-wrap input[type="checkbox"] {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
}

.checkmark {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 2px solid var(--c-border);
  background: var(--c-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 150ms, border-color 150ms;
  flex-shrink: 0;
}

.checkbox-wrap input:checked ~ .checkmark {
  background: var(--c-primary);
  border-color: var(--c-primary);
}

.checkbox-wrap input:checked ~ .checkmark::after {
  content: '';
  display: block;
  width: 5px;
  height: 9px;
  border: 2px solid #fff;
  border-top: none;
  border-left: none;
  transform: rotate(45deg) translate(-1px, -1px);
}

/* ─── Fälligkeits-Chip ───────────────────────────────────── */
.due-chip {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  color: var(--c-text-muted);
  line-height: 1.6;
}

.due-chip.due-soon {
  background: #FFF3CD;
  border-color: #D4A017;
  color: #856404;
}

.due-chip.due-overdue {
  background: #F8D7DA;
  border-color: #D9534F;
  color: #842029;
}

/* ─── Badges ─────────────────────────────────────────────── */
.badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 20px;
  line-height: 1.6;
}

.badge-recurrence {
  background: #E8F4FD;
  color: #1a5276;
  border: 1px solid #AED6F1;
}

.badge-category {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  color: var(--c-text-muted);
}

/* ─── Icon-Button + Delete-Button ────────────────────────── */
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--c-border);
  background: var(--c-surface);
  color: var(--c-text-muted);
  cursor: pointer;
  text-decoration: none;
  touch-action: manipulation;
  transition: background 150ms;
  flex-shrink: 0;
}
.icon-btn:active { background: var(--c-border); }

.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--c-text-muted);
  cursor: pointer;
  touch-action: manipulation;
  transition: color 150ms, background 150ms;
  flex-shrink: 0;
}
.delete-btn:active { color: #C0392B; background: #F8D7DA; }

/* ─── Dashboard ──────────────────────────────────────────── */
.dashboard-cards {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.dash-card {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}

.dash-card-placeholder {
  opacity: 0.55;
  border-style: dashed;
}

.dash-card-alert {
  border-color: #D4A017;
  background: #FFFBEA;
}

.dash-card-title {
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--c-text);
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--c-border);
}

.dash-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--c-border);
  font-size: var(--text-sm);
}

.dash-item:last-child { border-bottom: none; }

.dash-item span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-empty {
  color: var(--c-text-muted);
  font-size: var(--text-sm);
  padding: var(--space-2) 0;
}
```

- [ ] **Schritt 3: Im Browser testen**

App neu laden (STRG+SHIFT+R) → einloggen → alle 5 Tabs prüfen:

| Tab | Erwartetes Verhalten |
|---|---|
| Übersicht | Dashboard mit 4 Karten: Todos, Termine, Kündigungen, Garantien (Platzhalter) |
| Todos | Liste + FAB "+"-Button öffnet Formular, Todo anlegen, Checkbox abhaken |
| Termine | Liste + FAB, Termin anlegen, ICS-Download-Button erscheint |
| Verträge | Liste + FAB, Vertrag anlegen, ICS-Button nur bei ≥2 Jahren Laufzeit |
| Mehr | Platzhalter + Abmelden-Knopf |

- [ ] **Schritt 4: Committen**

```bash
git add home.js css/app.css
git commit -m "feat: wire Stufe 2 screens into navigation, rename Haushalt tab to Vertraege"
```

---

## Task 7: sw.js aktualisieren — PWA-Cache für Stufe 2

**Files:**
- Ändern: `sw.js` (neue Cache-Version + neue Files in SHELL)

- [ ] **Schritt 1: sw.js vollständig ersetzen**

```js
/* sw.js – Service Worker für NjaKër (Stufe 2) */
const CACHE = 'njaker-v2';
const SHELL = [
  './', './index.html', './config.js',
  './ics.js', './app.js',
  './auth.js', './household.js', './home.js',
  './todos.js', './termine.js', './contracts.js', './dashboard.js',
  './css/vars.css', './css/app.css',
  './manifest.json', './icons/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
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

  if (url.hostname.endsWith('supabase.co') ||
      url.hostname.endsWith('supabase.io') ||
      url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com' ||
      url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

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

- [ ] **Schritt 2: Committen**

```bash
git add sw.js
git commit -m "chore: update PWA cache to njaker-v2 with Stufe 2 files"
```

---

## Task 8: Testen + deployen

- [ ] **Schritt 1: Vollständige manuelle Checkliste**

In Chrome DevTools (F12 → Application → Service Workers): bestehenden SW deregistrieren → Seite neu laden → prüfen, ob `njaker-v2` registriert wird.

**Todos:**
- [ ] Todo ohne Fälligkeitsdatum anlegen → erscheint in Liste
- [ ] Todo mit Fälligkeitsdatum (gestern) anlegen → Chip erscheint rot
- [ ] Todo mit Fälligkeitsdatum (in 2 Tagen) → Chip erscheint orange
- [ ] Todo abhaken → Liste sortiert sich (abgehakte ans Ende)
- [ ] Todo mit Foto-Anhang anlegen → Büroklammer-Icon erscheint, Link öffnet Bild
- [ ] Todo löschen → verschwindet aus Liste
- [ ] Zweites Gerät / zweiter Tab: Todo anlegen → erscheint live im ersten Tab (Realtime)

**Termine:**
- [ ] Einmaligen Termin anlegen → erscheint in Liste
- [ ] Wiederkehrenden Termin (wöchentlich, bis-Datum) anlegen → Wiederholungs-Badge erscheint
- [ ] ICS-Button → `.ics`-Datei wird heruntergeladen → in Kalender-App importieren: Titel, Datum, Alarm korrekt
- [ ] Termin löschen

**Verträge:**
- [ ] Vertrag mit Laufzeit < 2 Jahre anlegen → kein ICS-Button
- [ ] Vertrag mit Laufzeit ≥ 2 Jahre anlegen → ICS-Button erscheint
- [ ] ICS herunterladen → Datum = Vertragsende − 3 Monate − 14 Tage, Alarm 18:00
- [ ] Vertrag mit PDF anlegen → PDF-Icon erscheint, Klick öffnet PDF
- [ ] Vertrag löschen

**Dashboard:**
- [ ] Todo mit Fälligkeit in 3 Tagen → erscheint in Todos-Karte
- [ ] Nächster Termin → erscheint in Termine-Karte
- [ ] Vertrag mit Kündigungsdatum in < 60 Tagen → erscheint in Kündigungen-Karte
- [ ] Garantien-Karte → Platzhalter-Text, ausgegraut

- [ ] **Schritt 2: Pushen**

```bash
git push
```

GitHub Pages aktualisiert sich automatisch innerhalb 1–3 Minuten. Unter `https://svorbenti-dot.github.io/njaker/` die App live testen.
