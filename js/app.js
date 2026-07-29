/* Paycheck Splitter – main application logic */

let supabase = null;
let currentUser = null;
let presets = [];
let lastSplit = null; // { amount, date, notes, allocations, remaining }
let categoryChart = null;

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', async () => {
  // Set default date to today
  document.getElementById('paycheck-date').valueAsDate = new Date();

  if (!SUPABASE_CONFIGURED) {
    showAuthError('Supabase is not configured. Open js/config.js and add your Project URL + anon key. See README.');
    // Still allow demo mode with localStorage fallback
    initLocalMode();
    return;
  }

  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Auth state listener
  supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      currentUser = session.user;
      showApp();
      loadPresets();
      loadHistory();
    } else {
      currentUser = null;
      showAuth();
    }
  });

  // Check existing session
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    showApp();
    loadPresets();
    loadHistory();
  } else {
    showAuth();
  }

  bindAuthEvents();
  bindAppEvents();
});

// ---------- Local-only fallback (no Supabase) ----------
function initLocalMode() {
  currentUser = { id: 'local', email: 'local@demo' };
  // Hide auth, show app immediately
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-email').textContent = 'Local mode (data stays in browser)';
  document.getElementById('user-email').classList.remove('hidden');

  // Load from localStorage
  presets = JSON.parse(localStorage.getItem('ps_presets') || '[]');
  renderPresets();
  renderHistory(JSON.parse(localStorage.getItem('ps_history') || '[]'));
  bindAppEvents();
}

function saveLocalPresets() {
  localStorage.setItem('ps_presets', JSON.stringify(presets));
}
function saveLocalHistory(history) {
  localStorage.setItem('ps_history', JSON.stringify(history));
}

// ---------- Auth UI ----------
function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}
function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-email').textContent = currentUser?.email || '';
  document.getElementById('user-email').classList.remove('hidden');
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  document.getElementById('auth-message').classList.add('hidden');
}
function showAuthMessage(msg) {
  const el = document.getElementById('auth-message');
  el.textContent = msg;
  el.classList.remove('hidden');
  document.getElementById('auth-error').classList.add('hidden');
}

function bindAuthEvents() {
  let isSignup = false;
  document.getElementById('tab-login').addEventListener('click', () => {
    isSignup = false;
    document.getElementById('tab-login').classList.add('bg-white', 'shadow', 'text-brand-700');
    document.getElementById('tab-login').classList.remove('text-gray-600');
    document.getElementById('tab-signup').classList.remove('bg-white', 'shadow', 'text-brand-700');
    document.getElementById('tab-signup').classList.add('text-gray-600');
    document.getElementById('auth-submit').textContent = 'Log in';
  });
  document.getElementById('tab-signup').addEventListener('click', () => {
    isSignup = true;
    document.getElementById('tab-signup').classList.add('bg-white', 'shadow', 'text-brand-700');
    document.getElementById('tab-signup').classList.remove('text-gray-600');
    document.getElementById('tab-login').classList.remove('bg-white', 'shadow', 'text-brand-700');
    document.getElementById('tab-login').classList.add('text-gray-600');
    document.getElementById('auth-submit').textContent = 'Sign up';
  });

  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const btn = document.getElementById('auth-submit');
    btn.disabled = true;
    btn.textContent = '…';

    try {
      if (isSignup) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        showAuthMessage('Check your email for a confirmation link, then log in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      showAuthError(err.message || 'Authentication failed');
    } finally {
      btn.disabled = false;
      btn.textContent = isSignup ? 'Sign up' : 'Log in';
    }
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    if (supabase) await supabase.auth.signOut();
    else location.reload(); // local mode
  });
}

// ---------- App navigation ----------
function bindAppEvents() {
  // Tabs
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(b => {
        b.classList.remove('active', 'border-brand-600', 'text-brand-700');
        b.classList.add('border-transparent', 'text-gray-500');
      });
      btn.classList.add('active', 'border-brand-600', 'text-brand-700');
      btn.classList.remove('border-transparent', 'text-gray-500');

      document.querySelectorAll('.tab-content').forEach(s => s.classList.add('hidden'));
      document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');

      if (btn.dataset.tab === 'history') loadHistory();
    });
  });

  // Calculate
  document.getElementById('btn-calculate').addEventListener('click', calculateSplit);

  // Save split
  document.getElementById('btn-save-split').addEventListener('click', saveSplit);

  // Presets
  document.getElementById('btn-add-preset').addEventListener('click', () => openPresetModal());
  document.getElementById('btn-cancel-preset').addEventListener('click', closePresetModal);
  document.getElementById('preset-form').addEventListener('submit', savePreset);
  document.getElementById('preset-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closePresetModal();
  });
}

// ---------- Toast ----------
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => el.classList.add('translate-y-20', 'opacity-0'), 3000);
}

// ---------- Presets ----------
async function loadPresets() {
  if (!supabase || currentUser?.id === 'local') {
    presets = JSON.parse(localStorage.getItem('ps_presets') || '[]');
    renderPresets();
    return;
  }
  const { data, error } = await supabase
    .from('presets')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('sort_order', { ascending: true });
  if (error) {
    console.error(error);
    toast('Could not load presets');
    return;
  }
  presets = data || [];
  renderPresets();
}

function renderPresets() {
  const list = document.getElementById('presets-list');
  const empty = document.getElementById('presets-empty');
  list.innerHTML = '';

  if (!presets.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  presets.forEach((p, idx) => {
    const isFixed = p.type === 'fixed';
    const row = document.createElement('div');
    row.className = 'flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100 group';
    row.innerHTML = `
      <div class="flex flex-col gap-0.5 text-gray-400">
        <button data-action="up" data-idx="${idx}" class="hover:text-brand-600 ${idx === 0 ? 'opacity-30 pointer-events-none' : ''}" title="Move up">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>
        </button>
        <button data-action="down" data-idx="${idx}" class="hover:text-brand-600 ${idx === presets.length - 1 ? 'opacity-30 pointer-events-none' : ''}" title="Move down">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
        </button>
      </div>
      <div class="flex-1 min-w-0">
        <div class="font-medium truncate">${escapeHtml(p.label)}</div>
        <div class="text-sm text-gray-500">
          ${isFixed ? `$${Number(p.value).toFixed(2)} fixed` : `${Number(p.value)}% of remaining`}
        </div>
      </div>
      <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition">
        <button data-action="edit" data-idx="${idx}" class="p-1.5 text-gray-500 hover:text-brand-600 rounded" title="Edit">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
        </button>
        <button data-action="delete" data-idx="${idx}" class="p-1.5 text-gray-500 hover:text-red-600 rounded" title="Delete">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = +btn.dataset.idx;
      const action = btn.dataset.action;
      if (action === 'up') movePreset(idx, -1);
      else if (action === 'down') movePreset(idx, 1);
      else if (action === 'edit') openPresetModal(presets[idx]);
      else if (action === 'delete') deletePreset(presets[idx], idx);
    });
  });
}

async function movePreset(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= presets.length) return;
  [presets[idx], presets[newIdx]] = [presets[newIdx], presets[idx]];
  // Update sort_order
  presets.forEach((p, i) => p.sort_order = i);
  renderPresets();
  await persistPresetOrder();
}

async function persistPresetOrder() {
  if (currentUser?.id === 'local') {
    saveLocalPresets();
    return;
  }
  // Update each
  for (const p of presets) {
    await supabase.from('presets').update({ sort_order: p.sort_order }).eq('id', p.id);
  }
}

function openPresetModal(preset = null) {
  document.getElementById('modal-title').textContent = preset ? 'Edit Preset' : 'Add Preset';
  document.getElementById('preset-id').value = preset?.id || '';
  document.getElementById('preset-label').value = preset?.label || '';
  document.getElementById('preset-value').value = preset?.value ?? '';
  const type = preset?.type || 'fixed';
  document.querySelector(`input[name="preset-type"][value="${type}"]`).checked = true;
  document.getElementById('preset-modal').classList.remove('hidden');
  document.getElementById('preset-label').focus();
}

function closePresetModal() {
  document.getElementById('preset-modal').classList.add('hidden');
  document.getElementById('preset-form').reset();
}

async function savePreset(e) {
  e.preventDefault();
  const id = document.getElementById('preset-id').value;
  const label = document.getElementById('preset-label').value.trim();
  const type = document.querySelector('input[name="preset-type"]:checked').value;
  const value = parseFloat(document.getElementById('preset-value').value);

  if (!label || isNaN(value) || value < 0) {
    toast('Please fill all fields correctly');
    return;
  }

  if (currentUser?.id === 'local') {
    if (id) {
      const p = presets.find(x => x.id === id);
      if (p) { p.label = label; p.type = type; p.value = value; }
    } else {
      presets.push({
        id: crypto.randomUUID(),
        label, type, value,
        sort_order: presets.length
      });
    }
    saveLocalPresets();
    renderPresets();
    closePresetModal();
    toast(id ? 'Preset updated' : 'Preset added');
    return;
  }

  if (id) {
    const { error } = await supabase.from('presets').update({ label, type, value }).eq('id', id);
    if (error) { toast(error.message); return; }
  } else {
    const { error } = await supabase.from('presets').insert({
      user_id: currentUser.id,
      label, type, value,
      sort_order: presets.length
    });
    if (error) { toast(error.message); return; }
  }
  closePresetModal();
  await loadPresets();
  toast(id ? 'Preset updated' : 'Preset added');
}

async function deletePreset(preset, idx) {
  if (!confirm(`Delete preset "${preset.label}"?`)) return;
  if (currentUser?.id === 'local') {
    presets.splice(idx, 1);
    presets.forEach((p, i) => p.sort_order = i);
    saveLocalPresets();
    renderPresets();
    toast('Preset deleted');
    return;
  }
  const { error } = await supabase.from('presets').delete().eq('id', preset.id);
  if (error) { toast(error.message); return; }
  await loadPresets();
  toast('Preset deleted');
}

// ---------- Calculate Split ----------
function calculateSplit() {
  const amount = parseFloat(document.getElementById('paycheck-amount').value);
  if (isNaN(amount) || amount <= 0) {
    toast('Enter a valid paycheck amount');
    return;
  }
  if (!presets.length) {
    toast('Add some presets first');
    return;
  }

  let remaining = amount;
  const allocations = [];

  // Process in order
  for (const p of presets) {
    let allocated = 0;
    if (p.type === 'fixed') {
      allocated = Math.min(Number(p.value), remaining);
    } else {
      // percent of *current remaining*
      allocated = remaining * (Number(p.value) / 100);
    }
    allocated = Math.round(allocated * 100) / 100; // cents
    if (allocated > 0) {
      allocations.push({
        label: p.label,
        type: p.type,
        value: p.value,
        amount: allocated
      });
      remaining -= allocated;
    }
  }
  remaining = Math.round(remaining * 100) / 100;

  lastSplit = {
    amount,
    date: document.getElementById('paycheck-date').value || new Date().toISOString().slice(0, 10),
    notes: document.getElementById('paycheck-notes').value.trim(),
    allocations,
    remaining
  };

  renderSplitResults(lastSplit);
}

function renderSplitResults(split) {
  const el = document.getElementById('split-results');
  let html = `
    <div class="flex justify-between items-center pb-3 border-b border-gray-100 mb-3">
      <span class="text-sm text-gray-500">Paycheck</span>
      <span class="text-xl font-bold">$${split.amount.toFixed(2)}</span>
    </div>
  `;

  split.allocations.forEach(a => {
    const badge = a.type === 'fixed'
      ? `<span class="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">$${Number(a.value).toFixed(2)}</span>`
      : `<span class="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">${a.value}%</span>`;
    html += `
      <div class="flex items-center justify-between py-2">
        <div class="flex items-center gap-2">
          <span class="font-medium">${escapeHtml(a.label)}</span>
          ${badge}
        </div>
        <span class="font-semibold text-brand-700">$${a.amount.toFixed(2)}</span>
      </div>
    `;
  });

  if (split.remaining > 0.001) {
    html += `
      <div class="flex items-center justify-between py-2 border-t border-dashed border-gray-200 mt-2 pt-3">
        <span class="text-gray-500 font-medium">Unallocated</span>
        <span class="font-semibold text-gray-600">$${split.remaining.toFixed(2)}</span>
      </div>
    `;
  } else if (split.remaining < -0.001) {
    html += `
      <div class="flex items-center justify-between py-2 border-t border-dashed border-red-200 mt-2 pt-3">
        <span class="text-red-500 font-medium">Over-allocated</span>
        <span class="font-semibold text-red-600">$${Math.abs(split.remaining).toFixed(2)}</span>
      </div>
    `;
  }

  el.innerHTML = html;
  document.getElementById('split-actions').classList.remove('hidden');
}

// ---------- Save Split ----------
async function saveSplit() {
  if (!lastSplit) return;

  const record = {
    amount: lastSplit.amount,
    paycheck_date: lastSplit.date,
    notes: lastSplit.notes || null,
    allocations: lastSplit.allocations,
    remaining: lastSplit.remaining
  };

  if (currentUser?.id === 'local') {
    const history = JSON.parse(localStorage.getItem('ps_history') || '[]');
    history.unshift({
      id: crypto.randomUUID(),
      ...record,
      created_at: new Date().toISOString()
    });
    saveLocalHistory(history);
    toast('Split saved to history');
    document.getElementById('btn-save-split').disabled = true;
    setTimeout(() => document.getElementById('btn-save-split').disabled = false, 1500);
    return;
  }

  const { error } = await supabase.from('paychecks').insert({
    user_id: currentUser.id,
    ...record
  });
  if (error) {
    toast(error.message);
    return;
  }
  toast('Split saved to history');
  document.getElementById('btn-save-split').disabled = true;
  setTimeout(() => document.getElementById('btn-save-split').disabled = false, 1500);
}

// ---------- History & Reports ----------
async function loadHistory() {
  let history = [];
  if (currentUser?.id === 'local') {
    history = JSON.parse(localStorage.getItem('ps_history') || '[]');
  } else if (supabase) {
    const { data, error } = await supabase
      .from('paychecks')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('paycheck_date', { ascending: false });
    if (error) {
      console.error(error);
      toast('Could not load history');
      return;
    }
    history = data || [];
  }
  renderHistory(history);
}

function renderHistory(history) {
  // Stats
  const total = history.reduce((s, h) => s + Number(h.amount), 0);
  document.getElementById('stat-total').textContent = '$' + total.toFixed(2);
  document.getElementById('stat-count').textContent = history.length;

  // Aggregate by category
  const catMap = {};
  history.forEach(h => {
    (h.allocations || []).forEach(a => {
      catMap[a.label] = (catMap[a.label] || 0) + Number(a.amount);
    });
    if (Number(h.remaining) > 0) {
      catMap['Unallocated'] = (catMap['Unallocated'] || 0) + Number(h.remaining);
    }
  });
  const categories = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  document.getElementById('stat-categories').textContent = categories.length;

  // Category totals list
  const totalsEl = document.getElementById('category-totals');
  if (!categories.length) {
    totalsEl.innerHTML = '<p class="text-gray-400 text-center py-8">No history yet</p>';
  } else {
    totalsEl.innerHTML = categories.map(([label, amt]) => `
      <div class="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
        <span class="font-medium truncate">${escapeHtml(label)}</span>
        <span class="font-semibold text-brand-700">$${amt.toFixed(2)}</span>
      </div>
    `).join('');
  }

  // Chart
  const chartEmpty = document.getElementById('chart-empty');
  const canvas = document.getElementById('category-chart');
  if (categoryChart) {
    categoryChart.destroy();
    categoryChart = null;
  }
  if (!categories.length) {
    chartEmpty.classList.remove('hidden');
    canvas.classList.add('hidden');
  } else {
    chartEmpty.classList.add('hidden');
    canvas.classList.remove('hidden');
    const colors = [
      '#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444',
      '#06b6d4', '#ec4899', '#84cc16', '#6366f1', '#14b8a6'
    ];
    categoryChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: categories.map(c => c[0]),
        datasets: [{
          data: categories.map(c => c[1]),
          backgroundColor: colors.slice(0, categories.length),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12 } }
        }
      }
    });
  }

  // History list
  const listEl = document.getElementById('history-list');
  if (!history.length) {
    listEl.innerHTML = '<p class="text-gray-400 text-center py-8">No saved paychecks yet</p>';
    return;
  }
  listEl.innerHTML = history.map(h => {
    const dateStr = h.paycheck_date || (h.created_at || '').slice(0, 10);
    const allocSummary = (h.allocations || []).map(a =>
      `${escapeHtml(a.label)}: $${Number(a.amount).toFixed(2)}`
    ).join(' · ');
    return `
      <div class="p-4 bg-gray-50 rounded-lg border border-gray-100">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="font-semibold">$${Number(h.amount).toFixed(2)}</div>
            <div class="text-sm text-gray-500 mt-0.5">${dateStr}${h.notes ? ' · ' + escapeHtml(h.notes) : ''}</div>
          </div>
          <button data-delete-id="${h.id}" class="text-gray-400 hover:text-red-600 p-1" title="Delete">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="text-xs text-gray-500 mt-2 leading-relaxed">${allocSummary || 'No allocations'}</div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('[data-delete-id]').forEach(btn => {
    btn.addEventListener('click', () => deletePaycheck(btn.dataset.deleteId));
  });
}

async function deletePaycheck(id) {
  if (!confirm('Delete this paycheck record?')) return;
  if (currentUser?.id === 'local') {
    let history = JSON.parse(localStorage.getItem('ps_history') || '[]');
    history = history.filter(h => h.id !== id);
    saveLocalHistory(history);
    renderHistory(history);
    toast('Deleted');
    return;
  }
  const { error } = await supabase.from('paychecks').delete().eq('id', id);
  if (error) { toast(error.message); return; }
  await loadHistory();
  toast('Deleted');
}

// ---------- Helpers ----------
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
