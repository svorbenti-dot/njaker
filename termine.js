/* termine.js – Gemeinsame Termine mit Realtime + ICS-Export */

let _termineHouseholdId = null;
let _termineChannel     = null;
let _termineData        = new Map();

// ─── Init ────────────────────────────────────────────────

async function _initTermineUser() {
  if (_termineHouseholdId) return;
  const { data: { user } } = await window.db.auth.getUser();
  const { data: profile } = await window.db
    .from('profiles')
    .select('household_id')
    .eq('id', user.id)
    .single();
  _termineHouseholdId = profile.household_id;
}

// ─── CRUD ────────────────────────────────────────────────

async function loadAppointments() {
  const { data, error } = await window.db
    .from('appointments')
    .select('*')
    .eq('household_id', _termineHouseholdId)
    .order('start_at', { ascending: true });
  if (error) { window.showToast('Fehler beim Laden der Termine'); return []; }
  return data || [];
}

async function createAppointment(title, startAt, recurrence, recurrenceEnd) {
  const row = {
    household_id: _termineHouseholdId,
    title,
    start_at:   new Date(startAt).toISOString(),
    recurrence: recurrence || 'once',
  };
  if (recurrenceEnd && recurrence !== 'once') row.recurrence_end = recurrenceEnd;
  const { error } = await window.db.from('appointments').insert(row);
  if (error) window.showToast('Fehler beim Anlegen des Termins');
}

async function deleteAppointment(id) {
  const { error } = await window.db.from('appointments').delete().eq('id', id);
  if (error) window.showToast('Fehler beim Löschen');
}

// ─── ICS ─────────────────────────────────────────────────

function _recurrenceLabel(rec) {
  return { once: 'Einmalig', weekly: 'Wöchentlich', monthly: 'Monatlich', yearly: 'Jährlich' }[rec] || rec;
}

function _buildRRULE(recurrence, recurrenceEnd) {
  if (!recurrence || recurrence === 'once') return '';
  const freq = { weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' }[recurrence];
  if (!freq) return '';
  if (recurrenceEnd) return `${freq};UNTIL=${String(recurrenceEnd).replace(/-/g, '')}`;
  return freq;
}

function exportTerminICS(id) {
  const termin = _termineData.get(id);
  if (!termin) return;
  const ics = generateICS({
    title:       termin.title,
    date:        termin.start_at,
    allDay:      false,
    rrule:       _buildRRULE(termin.recurrence, termin.recurrence_end),
    description: termin.recurrence !== 'once'
      ? `Wiederholung: ${_recurrenceLabel(termin.recurrence)}`
      : '',
  });
  const safeName = termin.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  downloadICS(`termin_${safeName}`, ics);
}

// ─── Icons ───────────────────────────────────────────────

function _iconDownload() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`;
}

// ─── Render ──────────────────────────────────────────────

function _renderTerminCard(termin) {
  const isPast = new Date(termin.start_at) < new Date();
  const badgeHtml = termin.recurrence !== 'once'
    ? `<span class="termin-badge">${_recurrenceLabel(termin.recurrence)}</span>`
    : '';
  return `
    <div class="termin-card${isPast ? ' termin-card--past' : ''}">
      <div class="termin-body">
        <span class="termin-title">${_escapeHTML(termin.title)}</span>
        <div class="termin-meta">
          <span class="termin-time">${_formatDateTime(termin.start_at)}</span>
          ${badgeHtml}
        </div>
      </div>
      <div class="termin-actions">
        <button class="termin-ics" onclick="exportTerminICS('${termin.id}')"
                aria-label="In Kalender exportieren" title="ICS herunterladen">
          ${_iconDownload()}
        </button>
        <button class="termin-delete" onclick="deleteAppointment('${termin.id}')"
                aria-label="Termin löschen">
          ${_iconTrash()}
        </button>
      </div>
    </div>`;
}

function _renderTermineList(termine) {
  const list = document.getElementById('termine-list');
  if (!list) return;
  _termineData = new Map(termine.map(t => [t.id, t]));
  if (!termine.length) {
    list.innerHTML = `<p class="termine-empty">Noch keine Termine – plant gemeinsam! 📅</p>`;
    return;
  }
  list.innerHTML = termine.map(_renderTerminCard).join('');
}

async function _submitTermin() {
  const titleEl  = document.getElementById('termin-title');
  const dtEl     = document.getElementById('termin-dt');
  const recEl    = document.getElementById('termin-recurrence');
  const recEndEl = document.getElementById('termin-recend');
  const btn      = document.querySelector('.termine-submit');

  const title = titleEl ? titleEl.value.trim() : '';
  const dt    = dtEl    ? dtEl.value           : '';
  if (!title) { if (titleEl) titleEl.focus(); return; }
  if (!dt)    { if (dtEl)    dtEl.focus();    return; }

  btn.disabled    = true;
  btn.textContent = '…';

  await createAppointment(
    title,
    dt,
    recEl    ? recEl.value    : 'once',
    recEndEl && recEl && recEl.value !== 'once' ? recEndEl.value || null : null,
  );

  titleEl.value = '';
  dtEl.value    = '';
  if (recEl)    recEl.value    = 'once';
  if (recEndEl) recEndEl.value = '';
  const recEndRow = document.getElementById('termin-recend-row');
  if (recEndRow) recEndRow.style.display = 'none';

  btn.disabled    = false;
  btn.textContent = 'Hinzufügen';
}

function _injectTermineStyles() {
  if (document.getElementById('termine-css')) return;
  const style = document.createElement('style');
  style.id = 'termine-css';
  style.textContent = `
    .termine-form {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-md);
      padding: var(--space-4);
      margin-bottom: var(--space-4);
      box-shadow: var(--shadow-sm);
    }
    .termine-input-row {
      display: flex;
      gap: var(--space-2);
      margin-bottom: var(--space-3);
    }
    .termine-input {
      flex: 1;
      min-height: 48px;
      padding: 0 var(--space-3);
      border: 1.5px solid var(--c-border);
      border-radius: var(--radius-sm);
      font-family: var(--font-sans);
      font-size: var(--text-base);
      background: var(--c-bg);
      color: var(--c-text);
      outline: none;
      transition: border-color 200ms ease;
    }
    .termine-input:focus { border-color: var(--c-primary); }
    .termine-dt {
      min-height: 48px;
      padding: 0 var(--space-2);
      border: 1.5px solid var(--c-border);
      border-radius: var(--radius-sm);
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      background: var(--c-bg);
      color: var(--c-text);
      outline: none;
      transition: border-color 200ms ease;
    }
    .termine-dt:focus { border-color: var(--c-primary); }

    .termine-actions-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-bottom: var(--space-2);
    }
    .termine-select {
      flex: 1;
      min-height: 48px;
      padding: 0 var(--space-3);
      border: 1.5px solid var(--c-border);
      border-radius: var(--radius-sm);
      font-family: var(--font-sans);
      font-size: var(--text-base);
      background: var(--c-bg);
      color: var(--c-text);
      outline: none;
      cursor: pointer;
    }
    .termine-select:focus { border-color: var(--c-primary); }

    .termine-submit {
      min-height: 48px;
      padding: 0 var(--space-4);
      background: var(--c-primary);
      color: #fff;
      border: none;
      border-radius: var(--radius-sm);
      font-family: var(--font-sans);
      font-size: var(--text-base);
      font-weight: 600;
      cursor: pointer;
      touch-action: manipulation;
      transition: background 200ms ease;
      flex-shrink: 0;
    }
    .termine-submit:hover:not(:disabled) { background: var(--c-primary-dark); }
    .termine-submit:disabled { opacity: 0.5; cursor: default; }

    .termin-recend-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .termin-recend-label {
      font-size: var(--text-sm);
      color: var(--c-text-muted);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .termin-recend-input {
      flex: 1;
      min-height: 48px;
      padding: 0 var(--space-2);
      border: 1.5px solid var(--c-border);
      border-radius: var(--radius-sm);
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      background: var(--c-bg);
      color: var(--c-text);
      outline: none;
    }
    .termin-recend-input:focus { border-color: var(--c-primary); }

    .termine-list { display: flex; flex-direction: column; gap: var(--space-2); }

    .termine-empty {
      text-align: center;
      color: var(--c-text-muted);
      padding: var(--space-12) 0;
      font-size: var(--text-base);
    }

    .termin-card {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-md);
      padding: var(--space-3);
      box-shadow: var(--shadow-sm);
      transition: opacity 0.15s ease;
    }
    .termin-card--past { opacity: 0.45; }

    .termin-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }
    .termin-title {
      font-size: var(--text-base);
      font-weight: 500;
      color: var(--c-text);
      word-break: break-word;
    }
    .termin-meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
    }
    .termin-time {
      font-size: var(--text-sm);
      color: var(--c-text-muted);
    }
    .termin-badge {
      font-size: var(--text-xs);
      font-weight: 600;
      color: #3d2500;
      background: var(--c-gold);
      padding: 2px 8px;
      border-radius: var(--radius-full);
    }

    .termin-actions {
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }
    .termin-ics,
    .termin-delete {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--c-text-muted);
      padding: 0;
      touch-action: manipulation;
    }
    .termin-ics svg    { width: 18px; height: 18px; }
    .termin-delete svg { width: 18px; height: 18px; }
    .termin-ics:hover    { color: var(--c-green); }
    .termin-delete:hover { color: var(--c-error); }
  `;
  document.head.appendChild(style);
}

// ─── Public API ──────────────────────────────────────────

async function initTermine(container) {
  _injectTermineStyles();
  await _initTermineUser();

  container.innerHTML = `
    <div class="termine-screen">
      <h1 class="screen-title">Termine</h1>
      <form class="termine-form" onsubmit="return false">
        <div class="termine-input-row">
          <input type="text" id="termin-title" class="termine-input"
                 placeholder="Titel …" autocomplete="off">
          <input type="datetime-local" id="termin-dt" class="termine-dt"
                 aria-label="Datum und Uhrzeit">
        </div>
        <div class="termine-actions-row">
          <select id="termin-recurrence" class="termine-select" aria-label="Wiederholung">
            <option value="once">Einmalig</option>
            <option value="weekly">Wöchentlich</option>
            <option value="monthly">Monatlich</option>
            <option value="yearly">Jährlich</option>
          </select>
          <button type="button" class="termine-submit" onclick="_submitTermin()">Hinzufügen</button>
        </div>
        <div id="termin-recend-row" class="termin-recend-row" style="display:none">
          <span class="termin-recend-label">Bis</span>
          <input type="date" id="termin-recend" class="termin-recend-input"
                 aria-label="Wiederholung bis">
        </div>
      </form>
      <div id="termine-list" class="termine-list"></div>
    </div>`;

  container.querySelector('#termin-recurrence').addEventListener('change', e => {
    const row = document.getElementById('termin-recend-row');
    if (row) row.style.display = e.target.value === 'once' ? 'none' : 'flex';
  });

  _renderTermineList(await loadAppointments());

  _termineChannel = window.db
    .channel('appointments-changes')
    .on('postgres_changes', {
      event:  '*',
      schema: 'public',
      table:  'appointments',
      filter: `household_id=eq.${_termineHouseholdId}`,
    }, async () => {
      _renderTermineList(await loadAppointments());
    })
    .subscribe();
}

function cleanupTermine() {
  if (_termineChannel) {
    window.db.removeChannel(_termineChannel);
    _termineChannel = null;
  }
}
