/* todos.js – Shared To-Do-Liste mit Realtime */

let _householdId  = null;
let _currentUser  = null;
let _todosChannel = null;

// ─── Init ────────────────────────────────────────────────

async function _initTodosUser() {
  if (_householdId) return;
  const { data: { user } } = await window.db.auth.getUser();
  _currentUser = user;
  const { data: profile } = await window.db
    .from('profiles')
    .select('household_id')
    .eq('id', user.id)
    .single();
  _householdId = profile.household_id;
}

// ─── CRUD ────────────────────────────────────────────────

async function loadTodos() {
  const { data, error } = await window.db
    .from('todos')
    .select('*')
    .eq('household_id', _householdId)
    .order('completed', { ascending: true })
    .order('due_date',  { ascending: true, nullsFirst: false });
  if (error) { window.showToast('Fehler beim Laden der Todos'); return []; }
  return data || [];
}

async function createTodo(title, dueDate, file) {
  const row = {
    household_id: _householdId,
    title,
    created_by: _currentUser.id,
    completed: false,
  };
  if (dueDate) row.due_date = dueDate;

  const { data, error } = await window.db.from('todos').insert(row).select().single();
  if (error) { window.showToast('Fehler beim Anlegen des Todos'); return; }
  if (file) await _uploadAttachment(data.id, file);
}

async function _uploadAttachment(todoId, file) {
  const path = `${_householdId}/${todoId}/${file.name}`;
  const { error } = await window.db.storage.from('todo-attachments').upload(path, file);
  if (error) { window.showToast('Anhang konnte nicht hochgeladen werden'); return; }
  const { data: urlData } = window.db.storage.from('todo-attachments').getPublicUrl(path);
  await window.db.from('todos')
    .update({ attachment_url: urlData.publicUrl, attachment_name: file.name })
    .eq('id', todoId);
}

async function toggleTodo(id, completed) {
  const { error } = await window.db.from('todos').update({ completed: !completed }).eq('id', id);
  if (error) window.showToast('Fehler beim Aktualisieren');
}

async function deleteTodo(id) {
  const { data } = await window.db.from('todos')
    .select('attachment_name')
    .eq('id', id)
    .maybeSingle();
  if (data?.attachment_name) {
    const path = `${_householdId}/${id}/${data.attachment_name}`;
    await window.db.storage.from('todo-attachments').remove([path]);
  }
  const { error } = await window.db.from('todos').delete().eq('id', id);
  if (error) window.showToast('Fehler beim Löschen');
}

// ─── Icons ───────────────────────────────────────────────

function _iconCircleCheck() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>`;
}

function _iconCircle() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg>`;
}

function _iconTrash() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
}

function _iconPaperclip() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
}

// ─── Render ──────────────────────────────────────────────

function _renderTodoCard(todo) {
  const today   = new Date().toISOString().slice(0, 10);
  const overdue = !todo.completed && todo.due_date && todo.due_date < today;

  const dueDateHtml = todo.due_date
    ? `<span class="todo-due${overdue ? ' todo-due--overdue' : ''}">${_formatDate(todo.due_date)}</span>`
    : '';

  const attachHtml = todo.attachment_url
    ? `<a class="todo-attachment" href="${_escapeHTML(todo.attachment_url)}" target="_blank" rel="noopener noreferrer">${_iconPaperclip()} ${_escapeHTML(todo.attachment_name || 'Anhang')}</a>`
    : '';

  return `
    <div class="todo-card${todo.completed ? ' todo-card--done' : ''}">
      <button class="todo-check" onclick="toggleTodo('${todo.id}', ${todo.completed})"
              aria-label="${todo.completed ? 'Als offen markieren' : 'Als erledigt markieren'}">
        ${todo.completed ? _iconCircleCheck() : _iconCircle()}
      </button>
      <div class="todo-body">
        <span class="todo-title">${_escapeHTML(todo.title)}</span>
        <div class="todo-meta">${dueDateHtml}${attachHtml}</div>
      </div>
      <button class="todo-delete" onclick="deleteTodo('${todo.id}')" aria-label="Todo löschen">
        ${_iconTrash()}
      </button>
    </div>`;
}

function _renderList(todos) {
  const list = document.getElementById('todos-list');
  if (!list) return;
  if (!todos.length) {
    list.innerHTML = `<p class="todos-empty">Noch keine Aufgaben – legt los!</p>`;
    return;
  }
  list.innerHTML = todos.map(_renderTodoCard).join('');
}

async function _submitTodo() {
  const titleEl = document.getElementById('todo-title');
  const dateEl  = document.getElementById('todo-date');
  const fileEl  = document.getElementById('todo-file');
  const btn     = document.querySelector('.todos-submit');

  const title = titleEl ? titleEl.value.trim() : '';
  if (!title) { if (titleEl) titleEl.focus(); return; }

  btn.disabled = true;
  btn.textContent = '…';

  await createTodo(title, dateEl.value || null, fileEl.files[0] || null);

  titleEl.value = '';
  dateEl.value  = '';
  fileEl.value  = '';
  const nameEl = document.getElementById('todo-filename');
  if (nameEl) nameEl.textContent = '';
  btn.disabled = false;
  btn.textContent = 'Hinzufügen';
}

function _injectStyles() {
  if (document.getElementById('todos-css')) return;
  const style = document.createElement('style');
  style.id = 'todos-css';
  style.textContent = `
    .screen-title {
      font-size: var(--text-xl);
      font-weight: 700;
      color: var(--c-text);
      margin-bottom: var(--space-4);
    }

    .todos-form {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-md);
      padding: var(--space-4);
      margin-bottom: var(--space-4);
      box-shadow: var(--shadow-sm);
    }
    .todos-input-row {
      display: flex;
      gap: var(--space-2);
      margin-bottom: var(--space-3);
    }
    .todos-input {
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
    .todos-input:focus { border-color: var(--c-primary); }
    .todos-date {
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
    .todos-date:focus { border-color: var(--c-primary); }

    .todos-actions-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .todos-file-label {
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
    .todos-file-label:hover { border-color: var(--c-primary); }
    .todos-file-label svg { width: 16px; height: 16px; }
    .todos-file-input { display: none; }
    .todos-filename {
      flex: 1;
      min-width: 0;
      font-size: var(--text-xs);
      color: var(--c-text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .todos-submit {
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
    .todos-submit:hover:not(:disabled) { background: var(--c-primary-dark); }
    .todos-submit:disabled { opacity: 0.5; cursor: default; }

    .todos-list { display: flex; flex-direction: column; gap: var(--space-2); }

    .todos-empty {
      text-align: center;
      color: var(--c-text-muted);
      padding: var(--space-12) 0;
      font-size: var(--text-base);
    }

    .todo-card {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-md);
      padding: var(--space-2) var(--space-3) var(--space-2) var(--space-2);
      box-shadow: var(--shadow-sm);
      transition: opacity 0.15s ease;
    }
    .todo-card--done { opacity: 0.55; }
    .todo-card--done .todo-title { text-decoration: line-through; }

    .todo-check {
      width: 48px;
      height: 48px;
      min-width: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--c-text-muted);
      padding: 0;
      touch-action: manipulation;
      flex-shrink: 0;
    }
    .todo-check svg { width: 24px; height: 24px; }
    .todo-card--done .todo-check { color: var(--c-success); }

    .todo-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }
    .todo-title {
      font-size: var(--text-base);
      font-weight: 500;
      color: var(--c-text);
      word-break: break-word;
    }
    .todo-meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
    }

    .todo-due {
      font-size: var(--text-xs);
      color: var(--c-text-muted);
      background: var(--c-bg);
      padding: 2px 8px;
      border-radius: var(--radius-full);
      border: 1px solid var(--c-border);
    }
    .todo-due--overdue {
      color: var(--c-error);
      background: #FEE2E2;
      border-color: #FECACA;
      font-weight: 600;
    }

    .todo-attachment {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: var(--text-xs);
      color: var(--c-green);
      text-decoration: none;
      max-width: 160px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .todo-attachment svg { width: 12px; height: 12px; flex-shrink: 0; }
    .todo-attachment:hover { text-decoration: underline; }

    .todo-delete {
      width: 48px;
      height: 48px;
      min-width: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--c-text-muted);
      padding: 0;
      touch-action: manipulation;
      flex-shrink: 0;
    }
    .todo-delete svg { width: 18px; height: 18px; }
    .todo-delete:hover { color: var(--c-error); }
  `;
  document.head.appendChild(style);
}

// ─── Public API ──────────────────────────────────────────

async function initTodos(container) {
  _injectStyles();
  await _initTodosUser();

  container.innerHTML = `
    <div class="todos-screen">
      <h1 class="screen-title">Todos</h1>
      <form class="todos-form" onsubmit="return false">
        <div class="todos-input-row">
          <input type="text" id="todo-title" class="todos-input"
                 placeholder="Neue Aufgabe …" autocomplete="off">
          <input type="date" id="todo-date" class="todos-date"
                 aria-label="Fälligkeitsdatum">
        </div>
        <div class="todos-actions-row">
          <label class="todos-file-label">
            ${_iconPaperclip()}
            <span>Anhang</span>
            <input type="file" id="todo-file" class="todos-file-input">
          </label>
          <span id="todo-filename" class="todos-filename"></span>
          <button type="button" class="todos-submit" onclick="_submitTodo()">Hinzufügen</button>
        </div>
      </form>
      <div id="todos-list" class="todos-list"></div>
    </div>`;

  container.querySelector('#todo-file').addEventListener('change', e => {
    const f = e.target.files[0];
    const nameEl = document.getElementById('todo-filename');
    if (nameEl) nameEl.textContent = f ? f.name : '';
  });

  _renderList(await loadTodos());

  _todosChannel = window.db
    .channel('todos-changes')
    .on('postgres_changes', {
      event:  '*',
      schema: 'public',
      table:  'todos',
      filter: `household_id=eq.${_householdId}`,
    }, async () => {
      _renderList(await loadTodos());
    })
    .subscribe();
}

function cleanupTodos() {
  if (_todosChannel) {
    window.db.removeChannel(_todosChannel);
    _todosChannel = null;
  }
}
