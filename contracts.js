/* contracts.js – Verträge mit PDF-Upload + ICS-Kündigungserinnerung */

let _contractsHouseholdId = null;
let _contractsChannel     = null;
let _contractsData        = new Map();

// ─── Init ────────────────────────────────────────────────

async function _initContractsUser() {
  if (_contractsHouseholdId) return;
  const { data: { user } } = await window.db.auth.getUser();
  const { data: profile } = await window.db
    .from('profiles')
    .select('household_id')
    .eq('id', user.id)
    .single();
  _contractsHouseholdId = profile.household_id;
}

// ─── CRUD ────────────────────────────────────────────────

async function loadContracts() {
  const { data, error } = await window.db
    .from('contracts')
    .select('*')
    .eq('household_id', _contractsHouseholdId)
    .order('end_date', { ascending: true, nullsFirst: false });
  if (error) { window.showToast('Fehler beim Laden der Verträge'); return []; }
  return data || [];
}

async function createContract(fields, pdfFile) {
  const costRaw = fields.monthly_cost;
  const row = {
    household_id:  _contractsHouseholdId,
    name:          fields.name,
    provider:      fields.provider      || null,
    category:      fields.category      || 'other',
    start_date:    fields.start_date    || null,
    end_date:      fields.end_date      || null,
    notice_period: fields.notice_period || null,
    monthly_cost:  costRaw !== '' && costRaw != null
                     ? parseFloat(String(costRaw).replace(',', '.'))
                     : null,
  };

  const { data, error } = await window.db.from('contracts').insert(row).select().single();
  if (error) { window.showToast('Fehler beim Anlegen des Vertrags'); return; }
  if (pdfFile && data) await _uploadContractPDF(data.id, pdfFile);
}

async function _uploadContractPDF(contractId, file) {
  const path = `${_contractsHouseholdId}/${contractId}/${file.name}`;
  const { error } = await window.db.storage.from('contract-pdfs').upload(path, file);
  if (error) { window.showToast('PDF konnte nicht hochgeladen werden'); return; }
  await window.db.from('contracts').update({ pdf_path: path }).eq('id', contractId);
}

async function deleteContract(id) {
  const contract = _contractsData.get(id);
  if (contract?.pdf_path) {
    await window.db.storage.from('contract-pdfs').remove([contract.pdf_path]);
  }
  const { error } = await window.db.from('contracts').delete().eq('id', id);
  if (error) window.showToast('Fehler beim Löschen');
}

// ─── PDF (privater Bucket) ───────────────────────────────

async function openContractPDF(id) {
  const contract = _contractsData.get(id);
  if (!contract?.pdf_path) return;
  const { data, error } = await window.db.storage
    .from('contract-pdfs')
    .createSignedUrl(contract.pdf_path, 3600);
  if (error || !data?.signedUrl) { window.showToast('PDF konnte nicht geöffnet werden'); return; }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

// ─── ICS ─────────────────────────────────────────────────

function exportContractICS(id) {
  const contract = _contractsData.get(id);
  if (!contract || !_needsReminder(contract.start_date, contract.end_date)) return;
  const reminder = _reminderDate(contract.end_date);
  const ics = generateICS({
    title:       `Vertrag kündigen: ${contract.name}`,
    date:        reminder,
    allDay:      true,
    description: `Kündigungsfrist: ${contract.notice_period || '—'}\nVertragsende: ${_formatDate(contract.end_date)}\nAnbieter: ${contract.provider || '—'}`,
  });
  const safeName = contract.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  downloadICS(`kuendigung_${safeName}`, ics);
}

// ─── Kategorie ───────────────────────────────────────────

const _CAT_LABELS = {
  insurance: 'Versicherung',
  telecom:   'Telekommunikation',
  streaming: 'Streaming',
  utilities: 'Strom & Gas',
  other:     'Sonstiges',
};

const _CAT_CLASSES = {
  insurance: 'cbadge-insurance',
  telecom:   'cbadge-telecom',
  streaming: 'cbadge-streaming',
  utilities: 'cbadge-utilities',
  other:     'cbadge-other',
};

function _categoryLabel(cat) { return _CAT_LABELS[cat] || cat; }

// ─── Ablauf-Prüfung ──────────────────────────────────────

function _isExpiringSoon(endDate) {
  if (!endDate) return false;
  const now   = new Date();
  const end   = new Date(endDate);
  const limit = new Date();
  limit.setMonth(limit.getMonth() + 3);
  return end >= now && end <= limit;
}

// ─── Icons ───────────────────────────────────────────────

function _iconPDF() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>`;
}

function _iconBell() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
}

// ─── Render ──────────────────────────────────────────────

function _renderContractCard(contract) {
  const soon     = _isExpiringSoon(contract.end_date);
  const needsICS = _needsReminder(contract.start_date, contract.end_date);
  const badgeCls = _CAT_CLASSES[contract.category] || 'cbadge-other';

  const metaParts = [
    (contract.start_date || contract.end_date)
      ? `<span>${_formatDate(contract.start_date)} – ${_formatDate(contract.end_date)}</span>`
      : '',
    contract.monthly_cost != null
      ? `<span>${Number(contract.monthly_cost).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/Monat</span>`
      : '',
    contract.notice_period
      ? `<span>Kündigung: ${_escapeHTML(contract.notice_period)}</span>`
      : '',
  ].filter(Boolean).join('');

  const pdfBtn = contract.pdf_path
    ? `<button class="contract-btn" onclick="openContractPDF('${contract.id}')" aria-label="PDF öffnen" title="PDF öffnen">${_iconPDF()}</button>`
    : '';

  const icsBtn = needsICS
    ? `<button class="contract-btn contract-btn--ics" onclick="exportContractICS('${contract.id}')" aria-label="Kündigungserinnerung herunterladen" title="ICS-Erinnerung">${_iconBell()}</button>`
    : '';

  return `
    <div class="contract-card${soon ? ' contract-card--soon' : ''}">
      <div class="contract-top">
        <div class="contract-info">
          <span class="contract-name">${_escapeHTML(contract.name)}</span>
          ${contract.provider ? `<span class="contract-provider">${_escapeHTML(contract.provider)}</span>` : ''}
        </div>
        <span class="contract-badge ${badgeCls}">${_categoryLabel(contract.category)}</span>
      </div>
      ${metaParts ? `<div class="contract-meta">${metaParts}</div>` : ''}
      <div class="contract-actions">
        ${pdfBtn}${icsBtn}
        <button class="contract-btn contract-btn--delete" onclick="deleteContract('${contract.id}')" aria-label="Vertrag löschen">${_iconTrash()}</button>
      </div>
    </div>`;
}

function _renderContractsList(contracts) {
  const list = document.getElementById('contracts-list');
  if (!list) return;
  _contractsData = new Map(contracts.map(c => [c.id, c]));
  if (!contracts.length) {
    list.innerHTML = `<p class="contracts-empty">Noch keine Verträge erfasst 📋</p>`;
    return;
  }
  list.innerHTML = contracts.map(_renderContractCard).join('');
}

async function _submitContract() {
  const btn      = document.querySelector('.contracts-submit');
  const nameEl   = document.getElementById('contract-name');
  const provEl   = document.getElementById('contract-provider');
  const catEl    = document.getElementById('contract-category');
  const startEl  = document.getElementById('contract-start');
  const endEl    = document.getElementById('contract-end');
  const noticeEl = document.getElementById('contract-notice');
  const costEl   = document.getElementById('contract-cost');
  const fileEl   = document.getElementById('contract-pdf');

  const name = nameEl ? nameEl.value.trim() : '';
  if (!name) { if (nameEl) nameEl.focus(); return; }

  btn.disabled    = true;
  btn.textContent = '…';

  await createContract({
    name,
    provider:      provEl?.value.trim()   || null,
    category:      catEl?.value           || 'other',
    start_date:    startEl?.value         || null,
    end_date:      endEl?.value           || null,
    notice_period: noticeEl?.value.trim() || null,
    monthly_cost:  costEl?.value          || null,
  }, fileEl?.files[0] || null);

  if (nameEl)   nameEl.value   = '';
  if (provEl)   provEl.value   = '';
  if (catEl)    catEl.value    = 'insurance';
  if (startEl)  startEl.value  = '';
  if (endEl)    endEl.value    = '';
  if (noticeEl) noticeEl.value = '';
  if (costEl)   costEl.value   = '';
  if (fileEl)   fileEl.value   = '';
  const fnEl = document.getElementById('contract-filename');
  if (fnEl) fnEl.textContent = '';

  btn.disabled    = false;
  btn.textContent = 'Hinzufügen';
}

function _injectContractsStyles() {
  if (document.getElementById('contracts-css')) return;
  const style = document.createElement('style');
  style.id = 'contracts-css';
  style.textContent = `
    .contracts-form {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-md);
      padding: var(--space-4);
      margin-bottom: var(--space-4);
      box-shadow: var(--shadow-sm);
    }
    .cf-row {
      margin-bottom: var(--space-2);
    }
    .cf-row--2col {
      display: flex;
      gap: var(--space-2);
    }
    .cf-row--2col .cf-input {
      flex: 1;
      min-width: 0;
    }
    .cf-input {
      display: block;
      width: 100%;
      box-sizing: border-box;
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
    .cf-input:focus { border-color: var(--c-primary); }
    .cf-input[type="date"] { padding: 0 var(--space-2); font-size: var(--text-sm); }
    .cf-input[type="number"] { padding: 0 var(--space-2); }
    .cf-select {
      display: block;
      width: 100%;
      box-sizing: border-box;
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
    .cf-select:focus { border-color: var(--c-primary); }

    .cf-row--file {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .cf-file-label {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      min-height: 48px;
      padding: 0 var(--space-3);
      border: 1.5px solid var(--c-border);
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: var(--text-sm);
      color: var(--c-text-muted);
      background: var(--c-bg);
      touch-action: manipulation;
      transition: border-color 200ms ease;
      flex-shrink: 0;
    }
    .cf-file-label:hover { border-color: var(--c-primary); }
    .cf-file-label svg { width: 16px; height: 16px; }
    .cf-file-input { display: none; }
    .cf-filename {
      flex: 1;
      min-width: 0;
      font-size: var(--text-xs);
      color: var(--c-text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .contracts-submit {
      display: block;
      width: 100%;
      box-sizing: border-box;
      min-height: 48px;
      margin-top: var(--space-3);
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
    }
    .contracts-submit:hover:not(:disabled) { background: var(--c-primary-dark); }
    .contracts-submit:disabled { opacity: 0.5; cursor: default; }

    .contracts-list { display: flex; flex-direction: column; gap: var(--space-2); }

    .contracts-empty {
      text-align: center;
      color: var(--c-text-muted);
      padding: var(--space-12) 0;
      font-size: var(--text-base);
    }

    .contract-card {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-md);
      padding: var(--space-3);
      box-shadow: var(--shadow-sm);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .contract-card--soon { border-color: var(--c-primary); }

    .contract-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: var(--space-2);
    }
    .contract-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .contract-name {
      font-size: var(--text-base);
      font-weight: 600;
      color: var(--c-text);
      word-break: break-word;
    }
    .contract-provider {
      font-size: var(--text-sm);
      color: var(--c-text-muted);
    }

    .contract-badge {
      font-size: var(--text-xs);
      font-weight: 600;
      padding: 3px 8px;
      border-radius: var(--radius-full);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .cbadge-insurance { background: var(--c-green);    color: #fff; }
    .cbadge-telecom   { background: var(--c-gold);     color: #3d2500; }
    .cbadge-streaming { background: var(--c-primary);  color: #fff; }
    .cbadge-utilities { background: #14432A;            color: #fff; }
    .cbadge-other     { background: var(--c-border);   color: var(--c-text-muted); }

    .contract-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 4px var(--space-3);
      font-size: var(--text-sm);
      color: var(--c-text-muted);
    }

    .contract-actions {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 0;
    }
    .contract-btn {
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
    .contract-btn svg          { width: 18px; height: 18px; }
    .contract-btn:hover        { color: var(--c-green); }
    .contract-btn--ics:hover   { color: var(--c-gold); }
    .contract-btn--delete:hover { color: var(--c-error); }

    .mehr-household-btn {
      display: block;
      width: 100%;
      min-height: 48px;
      margin-bottom: var(--space-3);
      background: var(--c-surface);
      color: var(--c-text);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-sm);
      font-family: var(--font-sans);
      font-size: var(--text-base);
      cursor: pointer;
      touch-action: manipulation;
      transition: border-color 200ms ease;
    }
    .mehr-household-btn:hover { border-color: var(--c-primary); }
  `;
  document.head.appendChild(style);
}

// ─── Public API ──────────────────────────────────────────

async function initContracts(container) {
  _injectContractsStyles();
  await _initContractsUser();

  container.innerHTML = `
    <div class="contracts-screen">
      <h1 class="screen-title">Verträge</h1>
      <form class="contracts-form" onsubmit="return false">
        <div class="cf-row">
          <input type="text" id="contract-name" class="cf-input"
                 placeholder="Vertragsname …" autocomplete="off">
        </div>
        <div class="cf-row">
          <input type="text" id="contract-provider" class="cf-input"
                 placeholder="Anbieter …" autocomplete="off">
        </div>
        <div class="cf-row">
          <select id="contract-category" class="cf-select" aria-label="Kategorie">
            <option value="insurance">Versicherung</option>
            <option value="telecom">Telekommunikation</option>
            <option value="streaming">Streaming</option>
            <option value="utilities">Strom &amp; Gas</option>
            <option value="other">Sonstiges</option>
          </select>
        </div>
        <div class="cf-row cf-row--2col">
          <input type="date" id="contract-start" class="cf-input" aria-label="Vertragsbeginn">
          <input type="date" id="contract-end"   class="cf-input" aria-label="Vertragsende">
        </div>
        <div class="cf-row cf-row--2col">
          <input type="text"   id="contract-notice" class="cf-input"
                 placeholder="Kündigungsfrist …" autocomplete="off">
          <input type="number" id="contract-cost" class="cf-input"
                 placeholder="€/Monat" min="0" step="0.01" aria-label="Monatliche Kosten in Euro">
        </div>
        <div class="cf-row cf-row--file">
          <label class="cf-file-label">
            ${_iconPaperclip()}
            <span>PDF</span>
            <input type="file" id="contract-pdf" class="cf-file-input" accept=".pdf">
          </label>
          <span id="contract-filename" class="cf-filename"></span>
        </div>
        <button type="button" class="contracts-submit" onclick="_submitContract()">Hinzufügen</button>
      </form>
      <div id="contracts-list" class="contracts-list"></div>
    </div>`;

  container.querySelector('#contract-pdf').addEventListener('change', e => {
    const f  = e.target.files[0];
    const el = document.getElementById('contract-filename');
    if (el) el.textContent = f ? f.name : '';
  });

  _renderContractsList(await loadContracts());

  _contractsChannel = window.db
    .channel('contracts-changes')
    .on('postgres_changes', {
      event:  '*',
      schema: 'public',
      table:  'contracts',
      filter: `household_id=eq.${_contractsHouseholdId}`,
    }, async () => {
      _renderContractsList(await loadContracts());
    })
    .subscribe();
}

function cleanupContracts() {
  if (_contractsChannel) {
    window.db.removeChannel(_contractsChannel);
    _contractsChannel = null;
  }
}
