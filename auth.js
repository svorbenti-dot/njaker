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
