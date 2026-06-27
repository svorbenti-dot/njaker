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
