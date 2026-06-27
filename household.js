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
