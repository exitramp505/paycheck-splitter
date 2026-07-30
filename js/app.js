/* Nina's Paycheck Splitter */

let supabase = null;
let currentUser = null;
let presets = [];
let lastSplit = null;
let categoryChart = null;
let isSignup = false;

// MUST be on window so the HTML onclick handlers can call them
window.setAuthMode = function (signup) {
  isSignup = !!signup;
  var loginTab = document.getElementById('tab-login');
  var signupTab = document.getElementById('tab-signup');
  var submitBtn = document.getElementById('auth-submit');

  if (signup) {
    signupTab.className = 'flex-1 py-2.5 text-sm font-medium rounded-md bg-white shadow text-brand-700';
    loginTab.className = 'flex-1 py-2.5 text-sm font-medium rounded-md text-gray-600';
    if (submitBtn) submitBtn.textContent = 'Sign up';
  } else {
    loginTab.className = 'flex-1 py-2.5 text-sm font-medium rounded-md bg-white shadow text-brand-700';
    signupTab.className = 'flex-1 py-2.5 text-sm font-medium rounded-md text-gray-600';
    if (submitBtn) submitBtn.textContent = 'Log in';
  }

  var err = document.getElementById('auth-error');
  var msg = document.getElementById('auth-message');
  if (err) err.classList.add('hidden');
  if (msg) msg.classList.add('hidden');
};

window.handleAuthSubmit = async function () {
  var email = (document.getElementById('auth-email').value || '').trim();
  var password = document.getElementById('auth-password').value || '';
  var submitBtn = document.getElementById('auth-submit');

  if (!email || !password) {
    showAuthError('Please enter both email and password');
    return;
  }
  if (password.length < 6) {
    showAuthError('Password must be at least 6 characters');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = isSignup ? 'Creating account…' : 'Logging in…';
  document.getElementById('auth-error').classList.add('hidden');
  document.getElementById('auth-message').classList.add('hidden');

  try {
    if (!supabase) throw new Error('Supabase not connected. Check config.js');

    if (isSignup) {
      var result = await supabase.auth.signUp({
        email: email,
        password: password,
        options: { emailRedirectTo: window.location.origin }
      });
      if (result.error) throw result.error;
      if (result.data && result.data.session) {
        showAuthMessage('Account created! You are logged in.');
      } else {
        showAuthMessage('Account created! Check your email for a confirmation link, then log in.');
      }
    } else {
      var result2 = await supabase.auth.signInWithPassword({ email: email, password: password });
      if (result2.error) throw result2.error;
      showAuthMessage('Logged in successfully!');
    }
  } catch (err) {
    console.error(err);
    var message = (err && err.message) || 'Authentication failed';
    if (message.indexOf('Invalid login credentials') !== -1) message = 'Wrong email or password';
    if (message.indexOf('Email not confirmed') !== -1) message = 'Please confirm your email first';
    if (message.indexOf('User already registered') !== -1) message = 'Email already registered — try Log in';
    showAuthError(message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = isSignup ? 'Sign up' : 'Log in';
  }
};

document.addEventListener('DOMContentLoaded', async function () {
  var dateInput = document.getElementById('paycheck-date');
  if (dateInput) dateInput.valueAsDate = new Date();

  var logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function () {
      if (supabase) await supabase.auth.signOut();
      else location.reload();
    });
  }

  if (typeof SUPABASE_CONFIGURED === 'undefined' || !SUPABASE_CONFIGURED) {
    showAuthError('Supabase not configured.');
    initLocalMode();
    return;
  }

  try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  } catch (err) {
    console.error(err);
    showAuthError('Could not connect to Supabase');
    initLocalMode();
    return;
  }

  supabase.auth.onAuthStateChange(function (event, session) {
    if (session && session.user) {
      currentUser = session.user;
      showApp();
      loadPresets();
      loadHistory();
    } else {
      currentUser = null;
      showAuth();
    }
  });

  try {
    var sessionResult = await supabase.auth.getSession();
    if (sessionResult.data && sessionResult.data.session && sessionResult.data.session.user) {
      currentUser = sessionResult.data.session.user;
      showApp();
      loadPresets();
      loadHistory();
    } else {
      showAuth();
    }
  } catch (e) {
    showAuth();
  }

  bindAppEvents();
});

function initLocalMode() {
  currentUser = { id: 'local', email: 'local@demo' };
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-email').textContent = 'Local mode';
  document.getElementById('user-email').classList.remove('hidden');
  presets = JSON.parse(localStorage.getItem('ps_presets') || '[]');
  renderPresets();
  renderHistory(JSON.parse(localStorage.getItem('ps_history') || '[]'));
  bindAppEvents();
}

function saveLocalPresets() { localStorage.setItem('ps_presets', JSON.stringify(presets)); }
function saveLocalHistory(h) { localStorage.setItem('ps_history', JSON.stringify(h)); }

function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}
function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-email').textContent = (currentUser && currentUser.email) || '';
  document.getElementById('user-email').classList.remove('hidden');
}
function showAuthError(msg) {
  var el = document.getElementById('auth-error');
  var msgEl = document.getElementById('auth-message');
  el.textContent = msg;
  el.classList.remove('hidden');
  msgEl.classList.add('hidden');
}
function showAuthMessage(msg) {
  var el = document.getElementById('auth-message');
  var errEl = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  errEl.classList.add('hidden');
}

function bindAppEvents() {
  document.querySelectorAll('.nav-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.nav-tab').forEach(function (b) {
        b.classList.remove('active', 'border-brand-600', 'text-brand-700');
        b.classList.add('border-transparent', 'text-gray-500');
      });
      btn.classList.add('active', 'border-brand-600', 'text-brand-700');
      btn.classList.remove('border-transparent', 'text-gray-500');
      document.querySelectorAll('.tab-content').forEach(function (s) { s.classList.add('hidden'); });
      document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
      if (btn.dataset.tab === 'history') loadHistory();
    });
  });

  var calcBtn = document.getElementById('btn-calculate');
  if (calcBtn) calcBtn.addEventListener('click', calculateSplit);
  var saveBtn = document.getElementById('btn-save-split');
  if (saveBtn) saveBtn.addEventListener('click', saveSplit);
  var addBtn = document.getElementById('btn-add-preset');
  if (addBtn) addBtn.addEventListener('click', function () { openPresetModal(); });
  var cancelBtn = document.getElementById('btn-cancel-preset');
  if (cancelBtn) cancelBtn.addEventListener('click', closePresetModal);
  var form = document.getElementById('preset-form');
  if (form) form.addEventListener('submit', savePreset);
  var modal = document.getElementById('preset-modal');
  if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) closePresetModal(); });
}

function toast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(function () { el.classList.add('translate-y-20', 'opacity-0'); }, 3000);
}

async function loadPresets() {
  if (!supabase || (currentUser && currentUser.id === 'local')) {
    presets = JSON.parse(localStorage.getItem('ps_presets') || '[]');
    renderPresets();
    return;
  }
  var res = await supabase.from('presets').select('*').eq('user_id', currentUser.id).order('sort_order', { ascending: true });
  if (res.error) { toast(res.error.message); return; }
  presets = res.data || [];
  renderPresets();
}

function renderPresets() {
  var list = document.getElementById('presets-list');
  var empty = document.getElementById('presets-empty');
  list.innerHTML = '';
  if (!presets.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  presets.forEach(function (p, idx) {
    var row = document.createElement('div');
    row.className = 'flex items-center gap-3 p-3 bg-gray-50 rounded-lg border';
    var valText = p.type === 'fixed' ? ('$' + Number(p.value).toFixed(2) + ' fixed') : (Number(p.value) + '% of remaining');
    row.innerHTML = '<div class="flex-1"><div class="font-medium">' + escapeHtml(p.label) + '</div><div class="text-sm text-gray-500">' + valText + '</div></div>' +
      '<button data-a="edit" data-i="' + idx + '" class="text-sm text-brand-600 px-2">Edit</button>' +
      '<button data-a="del" data-i="' + idx + '" class="text-sm text-red-600 px-2">Delete</button>';
    list.appendChild(row);
  });

  list.querySelectorAll('[data-a]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var i = +btn.dataset.i;
      if (btn.dataset.a === 'edit') openPresetModal(presets[i]);
      if (btn.dataset.a === 'del') deletePreset(presets[i], i);
    });
  });
}

function openPresetModal(preset) {
  document.getElementById('modal-title').textContent = preset ? 'Edit Preset' : 'Add Preset';
  document.getElementById('preset-id').value = (preset && preset.id) || '';
  document.getElementById('preset-label').value = (preset && preset.label) || '';
  document.getElementById('preset-value').value = (preset && preset.value) != null ? preset.value : '';
  var t = (preset && preset.type) || 'fixed';
  document.querySelector('input[name="preset-type"][value="' + t + '"]').checked = true;
  document.getElementById('preset-modal').classList.remove('hidden');
}
function closePresetModal() {
  document.getElementById('preset-modal').classList.add('hidden');
  document.getElementById('preset-form').reset();
}

async function savePreset(e) {
  e.preventDefault();
  var id = document.getElementById('preset-id').value;
  var label = document.getElementById('preset-label').value.trim();
  var type = document.querySelector('input[name="preset-type"]:checked').value;
  var value = parseFloat(document.getElementById('preset-value').value);
  if (!label || isNaN(value) || value < 0) { toast('Fill all fields'); return; }

  if (currentUser && currentUser.id === 'local') {
    if (id) {
      var p = presets.find(function (x) { return x.id === id; });
      if (p) { p.label = label; p.type = type; p.value = value; }
    } else {
      presets.push({ id: crypto.randomUUID(), label: label, type: type, value: value, sort_order: presets.length });
    }
    saveLocalPresets();
    renderPresets();
    closePresetModal();
    toast('Saved');
    return;
  }

  if (id) {
    var u = await supabase.from('presets').update({ label: label, type: type, value: value }).eq('id', id);
    if (u.error) { toast(u.error.message); return; }
  } else {
    var ins = await supabase.from('presets').insert({ user_id: currentUser.id, label: label, type: type, value: value, sort_order: presets.length });
    if (ins.error) { toast(ins.error.message); return; }
  }
  closePresetModal();
  await loadPresets();
  toast('Saved');
}

async function deletePreset(preset, idx) {
  if (!confirm('Delete "' + preset.label + '"?')) return;
  if (currentUser && currentUser.id === 'local') {
    presets.splice(idx, 1);
    saveLocalPresets();
    renderPresets();
    toast('Deleted');
    return;
  }
  var d = await supabase.from('presets').delete().eq('id', preset.id);
  if (d.error) { toast(d.error.message); return; }
  await loadPresets();
  toast('Deleted');
}

function calculateSplit() {
  var amount = parseFloat(document.getElementById('paycheck-amount').value);
  if (isNaN(amount) || amount <= 0) { toast('Enter a valid amount'); return; }
  if (!presets.length) { toast('Add presets first'); return; }

  var remaining = amount;
  var allocations = [];
  for (var i = 0; i < presets.length; i++) {
    var p = presets[i];
    var allocated = p.type === 'fixed' ? Math.min(Number(p.value), remaining) : remaining * (Number(p.value) / 100);
    allocated = Math.round(allocated * 100) / 100;
    if (allocated > 0) {
      allocations.push({ label: p.label, type: p.type, value: p.value, amount: allocated });
      remaining -= allocated;
    }
  }
  remaining = Math.round(remaining * 100) / 100;

  lastSplit = {
    amount: amount,
    date: document.getElementById('paycheck-date').value || new Date().toISOString().slice(0, 10),
    notes: document.getElementById('paycheck-notes').value.trim(),
    allocations: allocations,
    remaining: remaining
  };
  renderSplitResults(lastSplit);
}

function renderSplitResults(split) {
  var el = document.getElementById('split-results');
  var html = '<div class="flex justify-between pb-3 border-b mb-3"><span class="text-sm text-gray-500">Paycheck</span><span class="text-xl font-bold">$' + split.amount.toFixed(2) + '</span></div>';
  split.allocations.forEach(function (a) {
    var badge = a.type === 'fixed'
      ? '<span class="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">$' + Number(a.value).toFixed(2) + '</span>'
      : '<span class="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">' + a.value + '%</span>';
    html += '<div class="flex justify-between py-2"><div class="flex gap-2 items-center"><span class="font-medium">' + escapeHtml(a.label) + '</span>' + badge + '</div><span class="font-semibold text-brand-700">$' + a.amount.toFixed(2) + '</span></div>';
  });
  if (split.remaining > 0.001) {
    html += '<div class="flex justify-between py-2 border-t border-dashed mt-2 pt-3"><span class="text-gray-500">Unallocated</span><span class="font-semibold">$' + split.remaining.toFixed(2) + '</span></div>';
  }
  el.innerHTML = html;
  document.getElementById('split-actions').classList.remove('hidden');
}

async function saveSplit() {
  if (!lastSplit) return;
  var record = { amount: lastSplit.amount, paycheck_date: lastSplit.date, notes: lastSplit.notes || null, allocations: lastSplit.allocations, remaining: lastSplit.remaining };

  if (currentUser && currentUser.id === 'local') {
    var history = JSON.parse(localStorage.getItem('ps_history') || '[]');
    history.unshift(Object.assign({ id: crypto.randomUUID(), created_at: new Date().toISOString() }, record));
    saveLocalHistory(history);
    toast('Saved');
    return;
  }

  var res = await supabase.from('paychecks').insert(Object.assign({ user_id: currentUser.id }, record));
  if (res.error) { toast(res.error.message); return; }
  toast('Saved to history');
}

async function loadHistory() {
  var history = [];
  if (currentUser && currentUser.id === 'local') {
    history = JSON.parse(localStorage.getItem('ps_history') || '[]');
  } else if (supabase) {
    var res = await supabase.from('paychecks').select('*').eq('user_id', currentUser.id).order('paycheck_date', { ascending: false });
    if (res.error) { toast(res.error.message); return; }
    history = res.data || [];
  }
  renderHistory(history);
}

function renderHistory(history) {
  var total = history.reduce(function (s, h) { return s + Number(h.amount); }, 0);
  document.getElementById('stat-total').textContent = '$' + total.toFixed(2);
  document.getElementById('stat-count').textContent = history.length;

  var catMap = {};
  history.forEach(function (h) {
    (h.allocations || []).forEach(function (a) {
      catMap[a.label] = (catMap[a.label] || 0) + Number(a.amount);
    });
    if (Number(h.remaining) > 0) catMap['Unallocated'] = (catMap['Unallocated'] || 0) + Number(h.remaining);
  });
  var categories = Object.keys(catMap).map(function (k) { return [k, catMap[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
  document.getElementById('stat-categories').textContent = categories.length;

  var totalsEl = document.getElementById('category-totals');
  totalsEl.innerHTML = categories.length
    ? categories.map(function (c) { return '<div class="flex justify-between py-2 border-b"><span>' + escapeHtml(c[0]) + '</span><span class="font-semibold text-brand-700">$' + c[1].toFixed(2) + '</span></div>'; }).join('')
    : '<p class="text-gray-400 text-center py-8">No history yet</p>';

  var chartEmpty = document.getElementById('chart-empty');
  var canvas = document.getElementById('category-chart');
  if (categoryChart) { categoryChart.destroy(); categoryChart = null; }
  if (!categories.length) {
    chartEmpty.classList.remove('hidden');
    canvas.classList.add('hidden');
  } else {
    chartEmpty.classList.add('hidden');
    canvas.classList.remove('hidden');
    categoryChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: categories.map(function (c) { return c[0]; }),
        datasets: [{ data: categories.map(function (c) { return c[1]; }), backgroundColor: ['#22c55e','#3b82f6','#a855f7','#f59e0b','#ef4444','#06b6d4'], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
  }

  var listEl = document.getElementById('history-list');
  if (!history.length) {
    listEl.innerHTML = '<p class="text-gray-400 text-center py-8">No saved paychecks yet</p>';
    return;
  }
  listEl.innerHTML = history.map(function (h) {
    var dateStr = h.paycheck_date || (h.created_at || '').slice(0, 10);
    var summary = (h.allocations || []).map(function (a) { return escapeHtml(a.label) + ': $' + Number(a.amount).toFixed(2); }).join(' · ');
    return '<div class="p-4 bg-gray-50 rounded-lg border"><div class="flex justify-between"><div><div class="font-semibold">$' + Number(h.amount).toFixed(2) + '</div><div class="text-sm text-gray-500">' + dateStr + '</div></div><button data-del="' + h.id + '" class="text-red-500 text-sm">Delete</button></div><div class="text-xs text-gray-500 mt-2">' + summary + '</div></div>';
  }).join('');
  listEl.querySelectorAll('[data-del]').forEach(function (btn) {
    btn.addEventListener('click', function () { deletePaycheck(btn.dataset.del); });
  });
}

async function deletePaycheck(id) {
  if (!confirm('Delete this record?')) return;
  if (currentUser && currentUser.id === 'local') {
    var history = JSON.parse(localStorage.getItem('ps_history') || '[]').filter(function (h) { return h.id !== id; });
    saveLocalHistory(history);
    renderHistory(history);
    toast('Deleted');
    return;
  }
  var res = await supabase.from('paychecks').delete().eq('id', id);
  if (res.error) { toast(res.error.message); return; }
  await loadHistory();
  toast('Deleted');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
