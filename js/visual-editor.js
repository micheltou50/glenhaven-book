/* ── visual-editor.js — live inline site editor ──
 *
 * Activated via ?edit=true on any page.
 * Shows editable highlights on hover, click to edit inline.
 * Saves directly to /api/config endpoint.
 */

import { CONFIG } from './config.js';

const ADMIN_PWD_KEY = 'gh_admin_pwd';

// Only activate if ?edit=true is in the URL
const params = new URLSearchParams(window.location.search);
if (params.get('edit') === 'true') {
  initVisualEditor();
}

async function initVisualEditor() {
  // Check for stored password or prompt login
  let password = sessionStorage.getItem(ADMIN_PWD_KEY) || '';
  if (!password) {
    password = await showLoginModal();
    if (!password) return; // user cancelled
  }

  // Verify password
  const valid = await verifyPassword(password);
  if (!valid) {
    sessionStorage.removeItem(ADMIN_PWD_KEY);
    password = await showLoginModal('Incorrect password. Try again.');
    if (!password) return;
    const valid2 = await verifyPassword(password);
    if (!valid2) { alert('Invalid password.'); return; }
  }

  sessionStorage.setItem(ADMIN_PWD_KEY, password);

  // Load current config
  let currentConfig = null;
  try {
    const res = await fetch(CONFIG.CONFIG_URL);
    const data = await res.json();
    currentConfig = data.config || {};
  } catch (e) {
    console.error('[visual-editor] Could not load config:', e);
    return;
  }

  // Inject editor UI
  injectStyles();
  injectToolbar(currentConfig, password);
  activateEditableElements(currentConfig, password);
}

// ── Login Modal ──────────────────────────────────────────────

function showLoginModal(msg) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 've-login-overlay';
    overlay.innerHTML = `
      <div class="ve-login-box">
        <h3>Edit Mode</h3>
        <p>${msg || 'Enter your admin password to edit this page live.'}</p>
        <input type="password" class="ve-login-input" placeholder="Admin password" autofocus />
        <div class="ve-login-btns">
          <button class="ve-btn ve-btn-cancel">Cancel</button>
          <button class="ve-btn ve-btn-go">Sign In</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('.ve-login-input');
    const submit = () => { const v = input.value.trim(); overlay.remove(); resolve(v || null); };
    overlay.querySelector('.ve-btn-go').addEventListener('click', submit);
    overlay.querySelector('.ve-btn-cancel').addEventListener('click', () => { overlay.remove(); resolve(null); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    setTimeout(() => input.focus(), 50);
  });
}

async function verifyPassword(pwd) {
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': pwd },
      body: JSON.stringify({ _ping: true }),
    });
    return res.status !== 401;
  } catch (e) {
    return false;
  }
}

// ── Toolbar ──────────────────────────────────────────────────

function injectToolbar(config, password) {
  const bar = document.createElement('div');
  bar.className = 've-toolbar';
  bar.innerHTML = `
    <div class="ve-toolbar-left">
      <span class="ve-toolbar-dot"></span>
      <span class="ve-toolbar-label">Edit Mode</span>
    </div>
    <div class="ve-toolbar-right">
      <button class="ve-btn ve-btn-sm ve-btn-admin" title="Open full admin panel">Admin Panel</button>
      <button class="ve-btn ve-btn-sm ve-btn-exit" title="Exit edit mode">Exit</button>
    </div>
  `;
  document.body.appendChild(bar);

  bar.querySelector('.ve-btn-exit').addEventListener('click', () => {
    const url = new URL(window.location);
    url.searchParams.delete('edit');
    window.location.href = url.toString();
  });

  bar.querySelector('.ve-btn-admin').addEventListener('click', () => {
    window.open('admin.html', '_blank');
  });
}

// ── Editable Elements ────────────────────────────────────────

function activateEditableElements(config, password) {
  const editables = document.querySelectorAll('[data-edit-field]');

  editables.forEach(el => {
    el.classList.add('ve-editable');

    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openEditor(el, config, password);
    });
  });

  // Also make images editable
  const editableImgs = document.querySelectorAll('[data-edit-photo]');
  editableImgs.forEach(el => {
    el.classList.add('ve-editable', 've-editable-img');
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPhotoEditor(el, config, password);
    });
  });
}

// ── Inline Text Editor ───────────────────────────────────────

let activeEditor = null;

function openEditor(el, config, password) {
  closeEditor();

  const field = el.dataset.editField;
  const editType = el.dataset.editType || 'text'; // text, textarea, number, color
  const currentVal = getNestedValue(config, field) || el.textContent.trim();

  const editor = document.createElement('div');
  editor.className = 've-editor';

  const rect = el.getBoundingClientRect();
  const top = rect.bottom + window.scrollY + 8;
  const left = Math.max(8, Math.min(rect.left + window.scrollX, window.innerWidth - 340));

  editor.style.top = top + 'px';
  editor.style.left = left + 'px';

  let inputHTML = '';
  if (editType === 'textarea') {
    inputHTML = `<textarea class="ve-editor-input ve-editor-textarea">${escapeHTML(currentVal)}</textarea>`;
  } else if (editType === 'color') {
    inputHTML = `<input type="color" class="ve-editor-input ve-editor-color" value="${currentVal}" />`;
  } else if (editType === 'number') {
    inputHTML = `<input type="number" class="ve-editor-input" value="${currentVal}" />`;
  } else {
    inputHTML = `<input type="text" class="ve-editor-input" value="${escapeAttr(currentVal)}" />`;
  }

  editor.innerHTML = `
    <div class="ve-editor-header">
      <span class="ve-editor-field">${field.split('.').pop()}</span>
      <button class="ve-editor-close">&times;</button>
    </div>
    ${inputHTML}
    <div class="ve-editor-footer">
      <button class="ve-btn ve-btn-sm ve-btn-save">Save</button>
    </div>
  `;

  document.body.appendChild(editor);
  activeEditor = editor;

  const input = editor.querySelector('.ve-editor-input');
  setTimeout(() => input.focus(), 50);

  // Close
  editor.querySelector('.ve-editor-close').addEventListener('click', closeEditor);

  // Save
  editor.querySelector('.ve-btn-save').addEventListener('click', async () => {
    const newVal = input.value;
    const saveBtn = editor.querySelector('.ve-btn-save');
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    const success = await saveField(config, field, newVal, password);
    if (success) {
      // Update the DOM element
      if (editType === 'color') {
        // color changes need special handling
      } else {
        el.textContent = newVal;
      }
      setNestedValue(config, field, newVal);
      closeEditor();
      showToast('Saved!');
    } else {
      saveBtn.textContent = 'Error!';
      setTimeout(() => { saveBtn.textContent = 'Save'; saveBtn.disabled = false; }, 1500);
    }
  });

  // Save on Enter (for single-line inputs)
  if (editType !== 'textarea') {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') editor.querySelector('.ve-btn-save').click();
      if (e.key === 'Escape') closeEditor();
    });
  }
}

function closeEditor() {
  if (activeEditor) { activeEditor.remove(); activeEditor = null; }
}

// Close editor on outside click
document.addEventListener('click', (e) => {
  if (activeEditor && !activeEditor.contains(e.target) && !e.target.closest('.ve-editable')) {
    closeEditor();
  }
});

// ── Photo Editor ─────────────────────────────────────────────

function openPhotoEditor(el, config, password) {
  closeEditor();

  const field = el.dataset.editPhoto;
  const photos = config.photos || [];

  const editor = document.createElement('div');
  editor.className = 've-editor ve-editor-photo';

  const rect = el.getBoundingClientRect();
  const top = rect.bottom + window.scrollY + 8;
  const left = Math.max(8, Math.min(rect.left + window.scrollX, window.innerWidth - 400));

  editor.style.top = top + 'px';
  editor.style.left = left + 'px';

  editor.innerHTML = `
    <div class="ve-editor-header">
      <span class="ve-editor-field">Choose photo</span>
      <button class="ve-editor-close">&times;</button>
    </div>
    <div class="ve-photo-grid">
      ${photos.map((url, i) => `<div class="ve-photo-thumb${url === el.src ? ' active' : ''}" data-url="${escapeAttr(url)}"><img src="${url}" /></div>`).join('')}
    </div>
    <div class="ve-editor-footer">
      <input type="text" class="ve-editor-input" placeholder="Or paste image URL..." value="" />
      <button class="ve-btn ve-btn-sm ve-btn-save">Save</button>
    </div>
  `;

  document.body.appendChild(editor);
  activeEditor = editor;

  let selectedUrl = el.src;

  editor.querySelectorAll('.ve-photo-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      editor.querySelectorAll('.ve-photo-thumb').forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
      selectedUrl = thumb.dataset.url;
      editor.querySelector('.ve-editor-input').value = '';
    });
  });

  editor.querySelector('.ve-editor-close').addEventListener('click', closeEditor);

  editor.querySelector('.ve-btn-save').addEventListener('click', async () => {
    const urlInput = editor.querySelector('.ve-editor-input').value.trim();
    const finalUrl = urlInput || selectedUrl;
    const saveBtn = editor.querySelector('.ve-btn-save');
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    const success = await saveField(config, field, finalUrl, password);
    if (success) {
      el.src = finalUrl;
      setNestedValue(config, field, finalUrl);
      closeEditor();
      showToast('Photo updated!');
    } else {
      saveBtn.textContent = 'Error!';
      setTimeout(() => { saveBtn.textContent = 'Save'; saveBtn.disabled = false; }, 1500);
    }
  });
}

// ── Save to Backend ──────────────────────────────────────────

async function saveField(config, fieldPath, value, password) {
  // Build a full config object with the updated field
  const updated = JSON.parse(JSON.stringify(config));
  setNestedValue(updated, fieldPath, value);

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
      body: JSON.stringify(updated),
    });
    if (res.status === 401) {
      alert('Session expired. Please re-enter your password.');
      sessionStorage.removeItem(ADMIN_PWD_KEY);
      window.location.reload();
      return false;
    }
    const data = await res.json();
    return data.success === true;
  } catch (e) {
    console.error('[visual-editor] Save error:', e);
    return false;
  }
}

// ── Toast ────────────────────────────────────────────────────

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 've-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 2000);
}

// ── Helpers ──────────────────────────────────────────────────

function getNestedValue(obj, path) {
  return path.split('.').reduce((o, k) => (o && o[k] != null) ? o[k] : null, obj);
}

function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!o[keys[i]]) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

function escapeHTML(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Styles ───────────────────────────────────────────────────

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* ── Visual Editor Styles ── */

    .ve-toolbar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
      background: #111; color: #fff; padding: .5rem 1.25rem;
      display: flex; align-items: center; justify-content: space-between;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: .82rem; box-shadow: 0 2px 12px rgba(0,0,0,.2);
    }
    .ve-toolbar-left { display: flex; align-items: center; gap: .6rem; }
    .ve-toolbar-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; animation: ve-pulse 2s infinite; }
    @keyframes ve-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
    .ve-toolbar-label { font-weight: 600; }
    .ve-toolbar-right { display: flex; gap: .5rem; }

    .ve-btn { border: none; cursor: pointer; font-size: .8rem; font-weight: 600; border-radius: 6px; padding: .45rem .85rem; transition: all .15s; }
    .ve-btn-sm { padding: .35rem .7rem; font-size: .75rem; }
    .ve-btn-save { background: #22c55e; color: #fff; }
    .ve-btn-save:hover { background: #16a34a; }
    .ve-btn-cancel { background: transparent; color: #666; border: 1px solid #ddd; }
    .ve-btn-cancel:hover { background: #f5f5f5; }
    .ve-btn-go { background: #111; color: #fff; }
    .ve-btn-go:hover { background: #333; }
    .ve-btn-exit { background: rgba(255,255,255,.15); color: #fff; }
    .ve-btn-exit:hover { background: rgba(255,255,255,.25); }
    .ve-btn-admin { background: rgba(255,255,255,.1); color: #ccc; }
    .ve-btn-admin:hover { background: rgba(255,255,255,.2); color: #fff; }

    /* Push page content down for toolbar */
    body.ve-active { padding-top: 44px !important; }

    /* Editable element highlights */
    .ve-editable {
      outline: 2px dashed transparent;
      outline-offset: 4px;
      transition: outline-color .15s, background .15s;
      cursor: pointer !important;
      position: relative;
    }
    .ve-editable:hover {
      outline-color: #22c55e;
      background: rgba(34, 197, 94, 0.05);
    }
    .ve-editable:hover::after {
      content: attr(data-edit-label);
      position: absolute; top: -22px; left: 0;
      background: #111; color: #fff; font-size: .65rem;
      padding: 2px 6px; border-radius: 3px;
      white-space: nowrap; pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      z-index: 99998;
    }
    .ve-editable-img:hover {
      outline-color: #3b82f6;
      background: rgba(59, 130, 246, 0.08);
    }

    /* Editor popover */
    .ve-editor {
      position: absolute; z-index: 99999;
      background: #fff; border: 1px solid #e5e5e5;
      border-radius: 12px; padding: 1rem;
      box-shadow: 0 8px 30px rgba(0,0,0,.12), 0 2px 8px rgba(0,0,0,.06);
      width: 320px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .ve-editor-photo { width: 380px; }
    .ve-editor-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: .6rem; }
    .ve-editor-field { font-size: .7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #888; }
    .ve-editor-close { background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #999; padding: 0 4px; }
    .ve-editor-close:hover { color: #111; }
    .ve-editor-input { width: 100%; border: 1.5px solid #e5e5e5; border-radius: 8px; padding: .5rem .7rem; font-size: .85rem; outline: none; box-sizing: border-box; }
    .ve-editor-input:focus { border-color: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,.1); }
    .ve-editor-textarea { min-height: 80px; resize: vertical; font-family: inherit; }
    .ve-editor-color { height: 40px; padding: 4px; cursor: pointer; }
    .ve-editor-footer { display: flex; gap: .5rem; align-items: center; margin-top: .6rem; justify-content: flex-end; }

    /* Photo grid */
    .ve-photo-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
      max-height: 200px; overflow-y: auto; margin-bottom: .6rem;
    }
    .ve-photo-thumb {
      aspect-ratio: 1; border-radius: 6px; overflow: hidden; cursor: pointer;
      border: 3px solid transparent; transition: border-color .15s;
    }
    .ve-photo-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .ve-photo-thumb:hover { border-color: #bbb; }
    .ve-photo-thumb.active { border-color: #22c55e; }

    /* Toast */
    .ve-toast {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(20px);
      background: #111; color: #fff; padding: .6rem 1.2rem; border-radius: 8px;
      font-size: .82rem; font-weight: 500; opacity: 0; transition: all .3s;
      z-index: 999999; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .ve-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

    /* Login modal */
    .ve-login-overlay {
      position: fixed; inset: 0; z-index: 999999;
      background: rgba(0,0,0,.5); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .ve-login-box {
      background: #fff; border-radius: 16px; padding: 2rem;
      width: 340px; box-shadow: 0 20px 60px rgba(0,0,0,.2);
    }
    .ve-login-box h3 { margin: 0 0 .4rem; font-size: 1.1rem; }
    .ve-login-box p { margin: 0 0 1rem; font-size: .82rem; color: #666; }
    .ve-login-input { width: 100%; border: 1.5px solid #e5e5e5; border-radius: 8px; padding: .6rem .8rem; font-size: .9rem; outline: none; box-sizing: border-box; margin-bottom: .8rem; }
    .ve-login-input:focus { border-color: #111; }
    .ve-login-btns { display: flex; gap: .5rem; justify-content: flex-end; }
  `;
  document.head.appendChild(style);
  document.body.classList.add('ve-active');
}
