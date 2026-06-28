/* dashboard.js – Übersicht-Cockpit (Snapshot, kein Realtime) */

let _dashboardHouseholdId = null;

async function _initDashboardUser() {
  if (_dashboardHouseholdId) return;
  const { data: { user } } = await window.db.auth.getUser();
  const { data: profile }  = await window.db
    .from('profiles')
    .select('household_id')
    .eq('id', user.id)
    .single();
  _dashboardHouseholdId = profile.household_id;
}

async function _loadDashboardData() {
  const nowISO  = new Date().toISOString();
  const nowDate = new Date().toISOString().slice(0, 10);
  const cap     = new Date();
  cap.setMonth(cap.getMonth() + 3);
  const capDate = cap.toISOString().slice(0, 10);

  const [todosRes, apptRes, contrRes] = await Promise.all([
    window.db
      .from('todos')
      .select('*')
      .eq('household_id', _dashboardHouseholdId)
      .eq('completed', false)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(5),
    window.db
      .from('appointments')
      .select('*')
      .eq('household_id', _dashboardHouseholdId)
      .gte('start_at', nowISO)
      .order('start_at', { ascending: true })
      .limit(5),
    window.db
      .from('contracts')
      .select('*')
      .eq('household_id', _dashboardHouseholdId)
      .gte('end_date', nowDate)
      .lte('end_date', capDate)
      .order('end_date', { ascending: true }),
  ]);

  return {
    todos:        todosRes.data  || [],
    appointments: apptRes.data   || [],
    contracts:    (contrRes.data || []).filter(c => _needsReminder(c.start_date, c.end_date)),
  };
}

function _currentDateLabel() {
  return new Date().toLocaleDateString('de-DE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

const _DASH_REC = { weekly: 'Wöchentlich', monthly: 'Monatlich', yearly: 'Jährlich' };

function _renderTodosCard(todos) {
  const today = new Date().toISOString().slice(0, 10);
  const rows  = todos.length
    ? todos.map(t => {
        const overdue  = t.due_date && t.due_date < today;
        const dateLine = t.due_date
          ? `<span class="dash-sub${overdue ? ' dash-sub--err' : ''}">${_formatDate(t.due_date)}</span>`
          : '';
        return `<li class="dash-item${overdue ? ' dash-item--err' : ''}"><span class="dash-item-label">${_escapeHTML(t.title)}</span>${dateLine}</li>`;
      }).join('')
    : `<li class="dash-item dash-item--muted">Keine offenen Aufgaben — alles erledigt! 🎉</li>`;

  return `
    <div class="dash-card">
      <div class="dash-hd">
        <span class="dash-card-title">✅ Offene Aufgaben</span>
        ${todos.length ? `<span class="dash-cnt">${todos.length}</span>` : ''}
      </div>
      <ul class="dash-list">${rows}</ul>
      <button class="dash-more" onclick="setActiveTab('todos')">Alle anzeigen →</button>
    </div>`;
}

function _renderTermineCard(appointments) {
  const rows = appointments.length
    ? appointments.map(a => {
        const badge = a.recurrence && a.recurrence !== 'once'
          ? `<span class="dash-badge">${_DASH_REC[a.recurrence] || a.recurrence}</span>`
          : '';
        return `<li class="dash-item"><span class="dash-item-label">${_escapeHTML(a.title)} ${badge}</span><span class="dash-sub">${_formatDateTime(a.start_at)}</span></li>`;
      }).join('')
    : `<li class="dash-item dash-item--muted">Keine bevorstehenden Termine.</li>`;

  return `
    <div class="dash-card">
      <div class="dash-hd">
        <span class="dash-card-title">📅 Nächste Termine</span>
      </div>
      <ul class="dash-list">${rows}</ul>
      <button class="dash-more" onclick="setActiveTab('termine')">Alle anzeigen →</button>
    </div>`;
}

function _renderVertraegeCard(contracts) {
  const rows = contracts.length
    ? contracts.map(c => {
        const provider = c.provider ? ` · ${_escapeHTML(c.provider)}` : '';
        const cost     = c.monthly_cost != null
          ? ` · ${Number(c.monthly_cost).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/Mo.`
          : '';
        return `<li class="dash-item"><span class="dash-item-label">${_escapeHTML(c.name)}${provider}</span><span class="dash-sub dash-sub--warn">Ende: ${_formatDate(c.end_date)}${cost}</span></li>`;
      }).join('')
    : `<li class="dash-item dash-item--muted">Alles im grünen Bereich ✅</li>`;

  return `
    <div class="dash-card">
      <div class="dash-hd">
        <span class="dash-card-title">📄 Bald kündigen</span>
      </div>
      <ul class="dash-list">${rows}</ul>
      <button class="dash-more" onclick="setActiveTab('vertraege')">Alle Verträge →</button>
    </div>`;
}

function _renderGarantienCard() {
  return `
    <div class="dash-card dash-card--dim">
      <div class="dash-hd">
        <span class="dash-card-title">🔧 Garantien</span>
      </div>
      <p class="dash-placeholder-txt">Garantie-Tracking kommt in Stufe 3.</p>
    </div>`;
}

function _injectDashboardStyles() {
  if (document.getElementById('dashboard-css')) return;
  const style = document.createElement('style');
  style.id = 'dashboard-css';
  style.textContent = `
    .dash-screen            { padding-bottom: var(--space-4); }
    .dash-greeting          { margin-bottom: var(--space-5); }
    .dash-greeting-title    { font-size: var(--text-xl); font-weight: 700; color: var(--c-text); margin: 0 0 4px; }
    .dash-greeting-date     { font-size: var(--text-sm); color: var(--c-text-muted); margin: 0; }
    .dash-cards             { display: flex; flex-direction: column; gap: 12px; }
    .dash-card              { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: 16px; padding: 16px; box-shadow: var(--shadow-sm); }
    .dash-card--dim         { opacity: 0.45; pointer-events: none; }
    .dash-hd                { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3); }
    .dash-card-title        { font-size: var(--text-base); font-weight: 700; color: var(--c-text); }
    .dash-cnt               { font-size: var(--text-xs); font-weight: 700; color: #fff; background: var(--c-primary); border-radius: var(--radius-full); padding: 2px 9px; }
    .dash-list              { list-style: none; padding: 0; margin: 0 0 var(--space-3); display: flex; flex-direction: column; gap: 10px; }
    .dash-item              { display: flex; flex-direction: column; gap: 2px; font-size: var(--text-sm); color: var(--c-text); }
    .dash-item--muted       { color: var(--c-text-muted); font-style: italic; }
    .dash-item--err .dash-item-label { color: var(--c-primary); font-weight: 600; }
    .dash-item-label        { word-break: break-word; }
    .dash-sub               { font-size: var(--text-xs); color: var(--c-text-muted); }
    .dash-sub--err          { color: var(--c-error); font-weight: 600; }
    .dash-sub--warn         { color: var(--c-primary); font-weight: 500; }
    .dash-badge             { font-size: var(--text-xs); font-weight: 600; color: #3d2500; background: var(--c-gold); padding: 1px 6px; border-radius: var(--radius-full); vertical-align: middle; }
    .dash-more              { background: none; border: none; padding: 0; font-family: var(--font-sans); font-size: var(--text-sm); font-weight: 700; color: var(--c-primary); cursor: pointer; touch-action: manipulation; min-height: 44px; display: flex; align-items: center; }
    .dash-more:hover        { opacity: 0.75; }
    .dash-placeholder-txt   { font-size: var(--text-sm); color: var(--c-text-muted); margin: 0; }
  `;
  document.head.appendChild(style);
}

async function initDashboard(container) {
  _injectDashboardStyles();
  await _initDashboardUser();

  container.innerHTML = `
    <div class="dash-screen">
      <div class="dash-greeting">
        <p class="dash-greeting-title">Hallo zusammen! 👋</p>
        <p class="dash-greeting-date">${_currentDateLabel()}</p>
      </div>
      <div class="dash-cards" id="dash-cards">
        <div class="dash-card"><p class="dash-placeholder-txt" style="margin:0">Wird geladen …</p></div>
      </div>
    </div>`;

  const data  = await _loadDashboardData();
  const cards = document.getElementById('dash-cards');
  if (cards) {
    cards.innerHTML =
      _renderTodosCard(data.todos)          +
      _renderTermineCard(data.appointments) +
      _renderVertraegeCard(data.contracts)  +
      _renderGarantienCard();
  }
}

function cleanupDashboard() {
  // Kein Realtime-Kanal – Snapshot only
}
