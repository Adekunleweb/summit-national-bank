/* ==========================================================================
   Summit National Bank — Admin Panel Logic
   Connects to the shared SummitDB (localStorage) for ALL data operations.
   Every approve/reject/credit action persists permanently and reflects
   instantly on the customer's dashboard.
   ========================================================================== */

'use strict';

/* ---------- Global State ---------- */
let currentView = 'dashboard';
let db = null;
let counts = null;       // cached pending counts (async-loaded in refresh)
let cachedWallets = {};  // cached crypto wallets (async-loaded in refresh)
let cachedChats = [];    // cached all-chats list (async-loaded in refresh)
let isRefreshing = false; // guard against overlapping refresh calls

/* ---------- Helpers ---------- */
function money(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function money0(n) {
  return '$' + Math.round(Number(n || 0)).toLocaleString('en-US');
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}
function fmtDate(ts) {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function initials(name) {
  return String(name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

/* ---------- Toast ---------- */
function toast(title, msg, type) {
  type = type || 'info';
  const icons = { success: '✓', error: '✕', info: 'ⓘ' };
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = '<span class="toast-icon">' + icons[type] + '</span><div class="toast-content"><div class="toast-title">' + esc(title) + '</div><div class="toast-msg">' + esc(msg) + '</div></div>';
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(100px)'; setTimeout(() => el.remove(), 300); }, 4000);
}

/* ============================================================
   AUTH
   ============================================================ */
function checkAuth() {
  const session = SummitDB.getSession();
  if (!session || session.type !== 'admin') {
    showLogin();
  } else {
    showApp(session);
  }
}

function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appShell').style.display = 'none';
}

function showApp(session) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appShell').style.display = 'flex';
  if (session.name) {
    document.getElementById('adminName').textContent = session.name;
    document.querySelector('.admin-avatar').textContent = initials(session.name);
  }
  refresh();
}

function adminLogout() {
  SummitDB.logout();
  showLogin();
  toast('Signed out', 'Admin session ended.', 'info');
}

/* ============================================================
   DATA REFRESH & RENDERING
   ============================================================ */
async function refresh() {
  if (isRefreshing) return;        // prevent overlapping refresh calls
  isRefreshing = true;
  try {
    // Load all data in parallel for efficiency
    // Note: getAll() returns db object directly (or null), others return {ok, ...}
    const [allDb, countRes, walletRes, chatRes] = await Promise.all([
      SummitDB.getAll(),
      SummitDB.getPendingCounts(),
      SummitDB.getCryptoWallets(),
      SummitDB.getAllChats()
    ]);
    if (allDb) { db = allDb; }
    // getPendingCounts() returns counts object directly (or default zero object)
    if (countRes) { counts = countRes; }
    cachedWallets = walletRes || {};
    cachedChats = chatRes || [];
    updateBadges();
    renderView(currentView);
  } catch (e) {
    console.error('Refresh failed:', e);
  } finally {
    isRefreshing = false;
  }
}

/* Update sidebar badge counts */
function updateBadges() {
  if (!counts) return;
  const map = { signups: counts.signups, loans: counts.loans, cards: counts.cards, deposits: counts.deposits, transactions: counts.transactions, crypto: counts.crypto, giftcards: counts.giftcards, chat: counts.chat };
  Object.keys(map).forEach(k => {
    const el = document.getElementById('badge-' + k);
    if (el) {
      el.textContent = map[k];
      el.classList.toggle('zero', map[k] === 0);
    }
  });
}

/* ---------- Navigation ---------- */
function go(view) {
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const titles = {
    dashboard: 'Dashboard', signups: 'Sign-Up Applications', loans: 'Loan Applications',
    cards: 'Credit Card Applications', deposits: 'Deposit Approvals', transactions: 'Pending Transactions',
    crypto: 'Crypto Deposits', giftcards: 'Gift Card Deposits', chat: 'Live Chat Support', wallets: 'Crypto Wallets',
    accounts: 'All Accounts', credit: 'Credit Account', customers: 'Customers', audit: 'Audit Log',
    email: 'Email Settings',
    settings: 'Bank Settings'
  };
  document.getElementById('viewTitle').textContent = titles[view] || 'Dashboard';
  renderView(view);
  if (window.innerWidth <= 860) closeSidebar();
}

/* Safe accessor for cached counts with zero defaults */
function cachedCountsSafe() {
  return counts || { signups: 0, loans: 0, cards: 0, deposits: 0, transactions: 0, crypto: 0, giftcards: 0, chat: 0 };
}

function renderView(view) {
  const c = document.getElementById('content');
  switch (view) {
    case 'dashboard': c.innerHTML = viewDashboard(); break;
    case 'signups': c.innerHTML = viewSignups(); break;
    case 'loans': c.innerHTML = viewLoans(); break;
    case 'cards': c.innerHTML = viewCards(); break;
    case 'deposits': c.innerHTML = viewDeposits(); break;
    case 'crypto': c.innerHTML = viewCrypto(); break;
    case 'giftcards': c.innerHTML = viewGiftCards(); break;
    case 'chat': c.innerHTML = viewChat(); if (activeChatCustomerId) renderChatPanel(activeChatCustomerId); break;
    case 'wallets': c.innerHTML = viewWallets(); break;
    case 'transactions': c.innerHTML = viewTransactions(); break;
    case 'accounts': c.innerHTML = viewAccounts(); break;
    case 'credit': c.innerHTML = viewCredit(); break;
    case 'customers': c.innerHTML = viewCustomers(); break;
    case 'audit': c.innerHTML = viewAudit(); break;
    case 'email': c.innerHTML = viewEmail(); break;
    case 'settings': c.innerHTML = viewSettings(); break;
    default: c.innerHTML = viewDashboard();
  }
}

/* ============================================================
   VIEW: DASHBOARD
   ============================================================ */
function viewDashboard() {
  const counts = cachedCountsSafe();
  const totalPending = counts.signups + counts.loans + counts.cards + counts.deposits + counts.transactions + counts.crypto + counts.giftcards + counts.chat;
  const totalCustomers = db.customers.length;
  const totalAccounts = db.accounts.length;
  const totalBalance = db.accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  const totalCards = db.cards.length;
  const activeCards = db.cards.filter(c => c.status === 'active').length;

  let html = '<div class="view-section">';
  html += '<div class="kpi-grid">';
  html += kpiCard('navy', 'S', totalPending, 'Pending Approvals', 'Across all queues', 'go(\'signups\')');
  html += kpiCard('gold', '☺', totalCustomers, 'Total Customers', 'Registered & active');
  html += kpiCard('blue', '☰', totalAccounts, 'Bank Accounts', 'All account types');
  html += kpiCard('green', '$', money0(totalBalance), 'Total Deposits', 'Aggregate balance');
  html += kpiCard('amber', '◙', totalCards, 'Credit Cards Issued', activeCards + ' active');
  html += '</div>';

  // Pending breakdown
  html += '<div class="panel"><div class="panel-header"><h3>Pending Approval Queue</h3><span class="ph-sub">Click a section to review</span></div><div class="panel-body">';
  html += queueRow('Sign-Up Applications', counts.signups, 'signups', '⊕', 'gold');
  html += queueRow('Loan Applications', counts.loans, 'loans', '$', 'blue');
  html += queueRow('Credit Card Applications', counts.cards, 'cards', '◙', 'amber');
  html += queueRow('Deposit Approvals', counts.deposits, 'deposits', '↓', 'green');
  html += queueRow('Crypto Deposits', counts.crypto, 'crypto', '₿', 'blue');
  html += queueRow('Gift Card Deposits', counts.giftcards, 'giftcards', '★', 'amber');
  html += queueRow('Live Chat Messages', counts.chat, 'chat', '✂', 'gold');
  html += queueRow('Pending Transactions', counts.transactions, 'transactions', '⇄', 'red');
  html += '</div></div>';

  // Recent audit
  html += '<div class="panel"><div class="panel-header"><h3>Recent Activity</h3><button class="btn btn-ghost btn-sm" onclick="go(\'audit\')">View All</button></div><div class="panel-body"><div class="audit-list">';
  const recent = db.audit.slice(-6).reverse();
  if (recent.length === 0) {
    html += emptyState('◷', 'No activity yet', 'Audit entries will appear here as actions are taken.');
  } else {
    recent.forEach(a => { html += auditItem(a); });
  }
  html += '</div></div></div>';
  html += '</div>';
  return html;
}

function kpiCard(iconColor, icon, value, label, sub, onclick) {
  return '<div class="kpi-card" onclick="' + (onclick || '') + '"><div class="kpi-top"><div class="kpi-icon ' + iconColor + '">' + icon + '</div></div><div class="kpi-value">' + value + '</div><div class="kpi-label">' + label + '</div><div class="kpi-sub">' + (sub || '') + '</div></div>';
}

function queueRow(label, count, view, icon, color) {
  return '<div class="customer-card" style="cursor:pointer" onclick="go(\'' + view + '\')"><div class="audit-icon ' + (color === 'gold' ? 'cre' : color === 'blue' ? 'oth' : color === 'amber' ? 'cre' : color === 'green' ? 'app' : 'rej') + '" style="width:42px;height:42px;font-size:18px">' + icon + '</div><div class="customer-card-info"><div class="customer-card-name">' + label + '</div><div class="customer-card-meta">' + (count === 0 ? 'No pending items' : count + ' pending' + (count === 1 ? ' item' : ' items')) + '</div></div><div>' + (count > 0 ? '<span class="badge badge-pending">' + count + ' pending</span>' : '<span class="badge badge-neutral">All clear</span>') + '</div></div>';
}

function emptyState(icon, title, msg) {
  return '<div class="empty-state"><div class="es-icon">' + icon + '</div><h4>' + esc(title) + '</h4><p>' + esc(msg) + '</p></div>';
}

function auditItem(a) {
  const iconMap = { app: '✓', rej: '✕', cre: '+', oth: '◷' };
  return '<div class="audit-item"><div class="audit-icon ' + (a.icon || 'oth') + '">' + (iconMap[a.icon] || '◷') + '</div><div class="audit-body"><div class="audit-text">' + a.text + '</div><div class="audit-meta">' + esc(a.time) + ' · by ' + esc(a.by || 'System') + '</div></div></div>';
}

/* ============================================================
   VIEW: SIGNUPS
   ============================================================ */
function viewSignups() {
  const list = db.applications.signups;
  const pending = list.filter(s => s.status === 'pending');
  const reviewed = list.filter(s => s.status !== 'pending');
  let html = '<div class="view-section">';
  html += '<div class="stat-row">';
  html += miniStat('Pending Review', pending.length);
  html += miniStat('Approved', list.filter(s => s.status === 'approved').length);
  html += miniStat('Rejected', list.filter(s => s.status === 'rejected').length);
  html += '</div>';

  html += '<div class="panel"><div class="panel-header"><h3>Pending Sign-Up Applications</h3><span class="ph-sub">' + pending.length + ' awaiting review</span></div><div class="panel-body table-wrap">';
  if (pending.length === 0) {
    html += emptyState('⊕', 'No pending sign-ups', 'New customer applications will appear here for approval.');
  } else {
    html += '<table class="data-table"><thead><tr><th>App ID</th><th>Applicant</th><th>Email</th><th>Account Type</th><th>Opening Deposit</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
    pending.forEach(s => {
      html += '<tr><td class="td-id">' + esc(s.id) + '</td><td class="td-name">' + esc(s.name) + '</td><td>' + esc(s.email) + '</td><td>' + esc(s.type) + '</td><td class="td-amount">' + money(s.deposit) + '</td><td>' + timeAgo(s.submitted) + '</td><td><span class="badge badge-pending">Pending</span></td><td class="td-actions"><button class="btn btn-ghost btn-sm" onclick="viewSignupDetail(\'' + s.id + '\')">Review</button> <button class="btn btn-success btn-sm" onclick="confirmApproveSignup(\'' + s.id + '\')">Approve</button></td></tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div></div>';

  if (reviewed.length > 0) {
    html += '<div class="panel"><div class="panel-header"><h3>Reviewed Applications</h3></div><div class="panel-body table-wrap"><table class="data-table"><thead><tr><th>App ID</th><th>Applicant</th><th>Email</th><th>Status</th><th>Processed</th></tr></thead><tbody>';
    reviewed.slice().reverse().forEach(s => {
      const badge = s.status === 'approved' ? '<span class="badge badge-approved">Approved</span>' : '<span class="badge badge-rejected">Rejected</span>';
      html += '<tr><td class="td-id">' + esc(s.id) + '</td><td class="td-name">' + esc(s.name) + '</td><td>' + esc(s.email) + '</td><td>' + badge + '</td><td>' + timeAgo(s.submitted) + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
  }
  html += '</div>';
  return html;
}

/* ============================================================
   VIEW: LOANS
   ============================================================ */
function viewLoans() {
  const list = db.applications.loans;
  const pending = list.filter(l => l.status === 'pending');
  const feePending = list.filter(l => l.status === 'fee_pending');
  const reviewed = list.filter(l => l.status !== 'pending' && l.status !== 'fee_pending');
  let html = '<div class="view-section"><div class="stat-row">';
  html += miniStat('Pending', pending.length);
  html += miniStat('Fee Pending', feePending.length);
  html += miniStat('Approved', list.filter(l => l.status === 'approved').length);
  html += miniStat('Rejected', list.filter(l => l.status === 'rejected').length);
  html += '</div>';

  html += '<div class="panel"><div class="panel-header"><h3>Pending Loan Applications</h3><span class="ph-sub">' + pending.length + ' awaiting review</span></div><div class="panel-body table-wrap">';
  if (pending.length === 0) {
    html += emptyState('$', 'No pending loans', 'Loan applications from customers will appear here.');
  } else {
    html += '<table class="data-table"><thead><tr><th>App ID</th><th>Applicant</th><th>Type</th><th>Amount</th><th>Rate</th><th>Term</th><th>Income</th><th>Actions</th></tr></thead><tbody>';
    pending.forEach(l => {
      html += '<tr><td class="td-id">' + esc(l.id) + '</td><td class="td-name">' + esc(l.name) + '</td><td>' + esc(l.type) + '</td><td class="td-amount">' + money0(l.amount) + '</td><td>' + esc(l.rate) + '</td><td>' + esc(l.term) + '</td><td>' + money0(l.income) + '</td><td class="td-actions"><button class="btn btn-ghost btn-sm" onclick="viewLoanDetail(\'' + l.id + '\')">Review</button> <button class="btn btn-success btn-sm" onclick="confirmApproveLoan(\'' + l.id + '\')">Approve</button></td></tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div></div>';

  // Fee Pending section - approved loans awaiting origination fee payment
  if (feePending.length > 0) {
    html += '<div class="panel"><div class="panel-header"><h3>Approved Loans — Awaiting Origination Fee</h3><span class="ph-sub">' + feePending.length + ' fee pending</span></div><div class="panel-body table-wrap">';
    html += '<table class="data-table"><thead><tr><th>App ID</th><th>Applicant</th><th>Type</th><th>Amount</th><th>Fee Required</th><th>Actions</th></tr></thead><tbody>';
    feePending.forEach(l => {
      html += '<tr><td class="td-id">' + esc(l.id) + '</td><td class="td-name">' + esc(l.name) + '</td><td>' + esc(l.type) + '</td><td class="td-amount">' + money0(l.amount) + '</td><td class="td-amount">' + money0(l.loanFee || 0) + '</td><td class="td-actions"><button class="btn btn-ghost btn-sm" onclick="editLoanFee(\'' + l.id + '\')">Edit Fee</button> <button class="btn btn-success btn-sm" onclick="confirmLoanFeePaid(\'' + l.id + '\')">Confirm Fee Paid</button></td></tr>';
    });
    html += '</tbody></table></div></div>';
  }

  if (reviewed.length > 0) {
    html += '<div class="panel"><div class="panel-header"><h3>Reviewed Loans</h3></div><div class="panel-body table-wrap"><table class="data-table"><thead><tr><th>App ID</th><th>Applicant</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead><tbody>';
    reviewed.slice().reverse().forEach(l => {
      const badge = l.status === 'approved' ? '<span class="badge badge-approved">Approved & Disbursed</span>' : '<span class="badge badge-rejected">Rejected</span>';
      html += '<tr><td class="td-id">' + esc(l.id) + '</td><td class="td-name">' + esc(l.name) + '</td><td>' + esc(l.type) + '</td><td class="td-amount">' + money0(l.amount) + '</td><td>' + badge + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
  }
  html += '</div>';
  return html;
}

/* ============================================================
   VIEW: CARDS
   ============================================================ */
function viewCards() {
  const list = db.applications.cards;
  const pending = list.filter(c => c.status === 'pending');
  const reviewed = list.filter(c => c.status !== 'pending');
  let html = '<div class="view-section"><div class="stat-row">';
  html += miniStat('Pending', pending.length);
  html += miniStat('Approved', list.filter(c => c.status === 'approved').length);
  html += miniStat('Rejected', list.filter(c => c.status === 'rejected').length);
  html += '</div>';

  html += '<div class="panel"><div class="panel-header"><h3>Pending Credit Card Applications</h3><span class="ph-sub">' + pending.length + ' awaiting review</span></div><div class="panel-body table-wrap">';
  if (pending.length === 0) {
    html += emptyState('◙', 'No pending card applications', 'Credit card requests will appear here.');
  } else {
    html += '<table class="data-table"><thead><tr><th>App ID</th><th>Applicant</th><th>Card Type</th><th>Requested Limit</th><th>Credit Score</th><th>Income</th><th>Actions</th></tr></thead><tbody>';
    pending.forEach(c => {
      html += '<tr><td class="td-id">' + esc(c.id) + '</td><td class="td-name">' + esc(c.name) + '</td><td>' + esc(c.cardType) + '</td><td class="td-amount">' + money0(c.reqLimit) + '</td><td>' + esc(c.score) + '</td><td>' + money0(c.income) + '</td><td class="td-actions"><button class="btn btn-ghost btn-sm" onclick="viewCardDetail(\'' + c.id + '\')">Review</button> <button class="btn btn-success btn-sm" onclick="confirmApproveCard(\'' + c.id + '\')">Approve</button></td></tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div></div>';

  // Issued cards
  if (db.cards.length > 0) {
    html += '<div class="panel"><div class="panel-header"><h3>Issued Credit Cards & Security Deposits</h3><span class="ph-sub">' + db.cards.length + ' total</span></div><div class="panel-body table-wrap"><table class="data-table"><thead><tr><th>Card ID</th><th>Cardholder</th><th>Card Type</th><th>Card Number</th><th>Limit</th><th>Sec. Deposit</th><th>Deposit Status</th><th>Shipping</th><th>Actions</th></tr></thead><tbody>';
    db.cards.forEach(c => {
      const dep = c.securityDeposit ? money0(c.securityDeposit) : '—';
      const depStatus = c.depositStatus || (c.securityDeposit > 0 ? 'required' : 'none');
      const shipped = c.shipped != null ? c.shipped : (c.securityDeposit > 0 ? false : true);
      let depStatusBadge;
      if (!c.securityDeposit || c.securityDeposit <= 0) depStatusBadge = '<span class="badge badge-neutral">N/A</span>';
      else if (depStatus === 'paid') depStatusBadge = '<span class="badge badge-approved">Paid</span>';
      else depStatusBadge = '<span class="badge badge-pending">Required</span>';
      const shipBadge = shipped ? '<span class="badge badge-approved">Shipped</span>' : '<span class="badge badge-pending">On Hold</span>';
      let actions = '<button class="btn btn-ghost btn-sm" onclick="editCardDeposit(\'' + c.id + '\')">Edit Deposit</button>';
      if (c.securityDeposit > 0 && depStatus !== 'paid') actions += ' <button class="btn btn-success btn-sm" onclick="confirmDepositPaid(\'' + c.id + '\')">Mark Paid</button>';
      html += '<tr><td class="td-id">' + esc(c.id) + '</td><td class="td-name">' + esc(c.name) + '</td><td>' + esc(c.cardType) + '</td><td class="td-id">••••' + esc(String(c.cardNo).slice(-4)) + '</td><td class="td-amount">' + money0(c.limit) + '</td><td class="td-amount">' + dep + '</td><td>' + depStatusBadge + '</td><td>' + shipBadge + '</td><td class="td-actions">' + actions + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
  }
  html += '</div>';
  return html;
}

/* ============================================================
   VIEW: DEPOSITS
   ============================================================ */
function viewDeposits() {
  const list = db.applications.deposits;
  const pending = list.filter(d => d.status === 'pending');
  const reviewed = list.filter(d => d.status !== 'pending');
  let html = '<div class="view-section"><div class="stat-row">';
  html += miniStat('Pending', pending.length);
  html += miniStat('Approved', list.filter(d => d.status === 'approved').length);
  html += miniStat('Rejected', list.filter(d => d.status === 'rejected').length);
  html += '</div>';

  html += '<div class="panel"><div class="panel-header"><h3>Pending Deposit Approvals</h3><span class="ph-sub">' + pending.length + ' awaiting review</span></div><div class="panel-body table-wrap">';
  if (pending.length === 0) {
    html += emptyState('↓', 'No pending deposits', 'Deposit requests from customers will appear here.');
  } else {
    html += '<table class="data-table"><thead><tr><th>App ID</th><th>Customer</th><th>Deposit Type</th><th>Amount</th><th>To Account</th><th>Source</th><th>Submitted</th><th>Actions</th></tr></thead><tbody>';
    pending.forEach(d => {
      html += '<tr><td class="td-id">' + esc(d.id) + '</td><td class="td-name">' + esc(d.name) + '</td><td>' + esc(d.depType) + '</td><td class="td-amount">' + money(d.amount) + '</td><td class="td-id">' + esc(d.acctNo) + '</td><td>' + esc(d.source) + '</td><td>' + timeAgo(d.submitted) + '</td><td class="td-actions"><button class="btn btn-ghost btn-sm" onclick="viewDepositDetail(\'' + d.id + '\')">Review</button> <button class="btn btn-success btn-sm" onclick="confirmApproveDeposit(\'' + d.id + '\')">Approve</button></td></tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div></div>';

  if (reviewed.length > 0) {
    html += '<div class="panel"><div class="panel-header"><h3>Reviewed Deposits</h3></div><div class="panel-body table-wrap"><table class="data-table"><thead><tr><th>App ID</th><th>Customer</th><th>Amount</th><th>Status</th></tr></thead><tbody>';
    reviewed.slice().reverse().forEach(d => {
      const badge = d.status === 'approved' ? '<span class="badge badge-approved">Approved</span>' : '<span class="badge badge-rejected">Rejected</span>';
      html += '<tr><td class="td-id">' + esc(d.id) + '</td><td class="td-name">' + esc(d.name) + '</td><td class="td-amount">' + money(d.amount) + '</td><td>' + badge + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
  }
  html += '</div>';
  return html;
}

/* ============================================================
   VIEW: CRYPTO DEPOSITS
   ============================================================ */
function viewCrypto() {
  const list = db.applications.crypto || [];
  const pending = list.filter(d => d.status === 'pending');
  const reviewed = list.filter(d => d.status !== 'pending');
  let html = '<div class="view-section"><div class="stat-row">';
  html += miniStat('Pending', pending.length);
  html += miniStat('Approved', list.filter(d => d.status === 'approved').length);
  html += miniStat('Rejected', list.filter(d => d.status === 'rejected').length);
  html += '</div>';

  html += '<div class="panel"><div class="panel-header"><h3>Pending Crypto Deposits</h3><span class="ph-sub">' + pending.length + ' awaiting review</span></div><div class="panel-body table-wrap">';
  if (pending.length === 0) {
    html += emptyState('\u20bf', 'No pending crypto deposits', 'Cryptocurrency deposit requests from customers will appear here.');
  } else {
    html += '<table class="data-table"><thead><tr><th>Ref ID</th><th>Customer</th><th>Coin</th><th>USD Amount</th><th>Network</th><th>To Account</th><th>Tx Hash</th><th>Submitted</th><th>Actions</th></tr></thead><tbody>';
    pending.forEach(d => {
      const hashDisplay = d.txHash ? esc(String(d.txHash).slice(0, 12)) + '…' : '—';
      html += '<tr><td class="td-id">' + esc(d.id) + '</td><td class="td-name">' + esc(d.name) + '</td><td>' + esc(d.coin) + '</td><td class="td-amount">' + money0(d.usdAmount) + '</td><td>' + esc(d.network || '—') + '</td><td class="td-id">' + esc(d.acctNo) + '</td><td class="td-id" title="' + esc(d.txHash || '') + '">' + hashDisplay + '</td><td>' + timeAgo(d.submitted) + '</td><td class="td-actions"><button class="btn btn-ghost btn-sm" onclick="viewCryptoDetail(\'' + d.id + '\')">Review</button> <button class="btn btn-success btn-sm" onclick="confirmApproveCrypto(\'' + d.id + '\')">Approve</button></td></tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div></div>';

  if (reviewed.length > 0) {
    html += '<div class="panel"><div class="panel-header"><h3>Reviewed Crypto Deposits</h3></div><div class="panel-body table-wrap"><table class="data-table"><thead><tr><th>Ref ID</th><th>Customer</th><th>Coin</th><th>Amount</th><th>Status</th></tr></thead><tbody>';
    reviewed.slice().reverse().forEach(d => {
      const badge = d.status === 'approved' ? '<span class="badge badge-approved">Approved</span>' : '<span class="badge badge-rejected">Rejected</span>';
      html += '<tr><td class="td-id">' + esc(d.id) + '</td><td class="td-name">' + esc(d.name) + '</td><td>' + esc(d.coin) + '</td><td class="td-amount">' + money0(d.usdAmount) + '</td><td>' + badge + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
  }
  html += '</div>';
  return html;
}

function viewCryptoDetail(id) {
  const d = (db.applications.crypto || []).find(x => x.id === id);
  if (!d) return;
  let body = detailSection('Crypto Deposit Request', [
    ['Reference ID', d.id, true],
    ['Customer', d.name],
    ['Email', d.email],
    ['Coin', d.coin],
    ['Network', d.network || '—'],
    ['USD Amount', money0(d.usdAmount)],
    ['Wallet Address Used', d.walletAddress || '—', true],
    ['Target Account', d.acctNo, true],
    ['Transaction Hash', d.txHash || '—', true],
    ['Submitted', fmtDate(d.submitted)],
    ['Status', d.status === 'pending' ? 'Pending Review' : d.status],
  ]);
  body += '<div class="drawer-actions"><button class="btn btn-success" onclick="closeDrawer();confirmApproveCrypto(\'' + d.id + '\')">Approve & Credit Account</button><button class="btn btn-danger" onclick="closeDrawer();confirmRejectCrypto(\'' + d.id + '\')">Reject</button></div>';
  openDrawer('Crypto: ' + d.name + ' (' + d.coin + ')', body);
}

function confirmApproveCrypto(id) {
  const d = (db.applications.crypto || []).find(x => x.id === id);
  if (!d) return;
  const body = '<p>Approve crypto deposit of <b>' + money0(d.usdAmount) + '</b> (' + esc(d.coin) + ') from <b>' + esc(d.name) + '</b>?</p><p style="margin-top:8px;font-size:14px;color:var(--gray-500)">This will credit ' + money0(d.usdAmount) + ' to account ' + esc(d.acctNo) + '.</p>';
  const footer = '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-success" onclick="doApproveCrypto(\'' + id + '\')">Approve Deposit</button>';
  openModal('Approve Crypto Deposit', body, footer);
}
async function doApproveCrypto(id) {
  const result = await SummitDB.approveCryptoDeposit(id);
  closeModal();
  if (result.ok) { toast('Crypto Deposit Approved', 'Customer account credited.', 'success'); refresh(); }
  else { toast('Error', result.error, 'error'); }
}
function confirmRejectCrypto(id) {
  const body = '<p>Reject this crypto deposit request?</p><div class="modal-field"><label>Rejection Reason</label><textarea id="rejectReason" rows="2" placeholder="e.g. Transaction not found on blockchain"></textarea></div>';
  const footer = '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-danger" onclick="doRejectCrypto(\'' + id + '\')">Reject</button>';
  openModal('Reject Crypto Deposit', body, footer);
}
async function doRejectCrypto(id) {
  const reason = document.getElementById('rejectReason').value.trim() || 'Not specified';
  const result = await SummitDB.rejectCryptoDeposit(id, reason);
  closeModal();
  if (result.ok) { toast('Crypto Deposit Rejected', '', 'info'); refresh(); }
  else { toast('Error', result.error, 'error'); }
}

/* ============================================================
   VIEW: CRYPTO WALLETS (admin can edit wallet addresses)
   ============================================================ */
function viewWallets() {
  const wallets = cachedWallets || {};
  const coins = Object.keys(wallets);
  let html = '<div class="view-section">';
  html += '<div class="panel"><div class="panel-header"><h3>Cryptocurrency Wallet Addresses</h3><span class="ph-sub">Customers copy these addresses when making crypto deposits</span></div><div class="panel-body" style="padding:24px">';
  html += '<p style="font-size:14px;color:var(--gray-500);margin-bottom:20px">Edit the deposit wallet address for each cryptocurrency. When a customer selects a coin, they will see and copy the address you configure here. Changes take effect immediately.</p>';
  coins.forEach(coin => {
    const w = wallets[coin];
    html += '<div class="wallet-edit-row">';
    html += '<div class="wallet-coin-label">' + esc(coin) + '</div>';
    html += '<input type="text" class="wallet-input" id="walletAddr_' + esc(coin) + '" value="' + esc(w.address) + '" placeholder="Enter ' + esc(coin) + ' wallet address">';
    html += '<input type="text" class="wallet-network-input" id="walletNet_' + esc(coin) + '" value="' + esc(w.network || '') + '" placeholder="Network (e.g. ERC-20, TRC-20, BEP-20)">';
    html += '<button class="btn btn-blue btn-sm" onclick="saveWallet(\'' + esc(coin) + '\')">Save</button>';
    html += '</div>';
  });
  html += '</div></div>';
  html += '<div class="panel"><div class="panel-header"><h3>Add New Cryptocurrency Wallet</h3></div><div class="panel-body" style="padding:24px">';
  html += '<div style="display:grid;grid-template-columns:1fr 2fr 1fr auto;gap:12px;align-items:end">';
  html += '<div class="field" style="margin:0"><label>Coin / Token</label><input type="text" id="newWalletCoin" placeholder="e.g. XRP"></div>';
  html += '<div class="field" style="margin:0"><label>Wallet Address</label><input type="text" id="newWalletAddr" placeholder="Deposit wallet address"></div>';
  html += '<div class="field" style="margin:0"><label>Network</label><input type="text" id="newWalletNet" placeholder="e.g. XRPL"></div>';
  html += '<button class="btn btn-primary" onclick="addWallet()">Add Wallet</button>';
  html += '</div></div></div>';
  html += '</div>';
  return html;
}

async function saveWallet(coin) {
  const addr = document.getElementById('walletAddr_' + coin).value.trim();
  const net = document.getElementById('walletNet_' + coin).value.trim();
  if (!addr) { toast('Error', 'Wallet address cannot be empty.', 'error'); return; }
  const result = await SummitDB.updateCryptoWallet(coin, addr, net);
  if (result.ok) { toast('Wallet Updated', esc(coin) + ' wallet address saved.', 'success'); refresh(); }
  else { toast('Error', result.error, 'error'); }
}

async function addWallet() {
  const coin = document.getElementById('newWalletCoin').value.trim().toUpperCase();
  const addr = document.getElementById('newWalletAddr').value.trim();
  const net = document.getElementById('newWalletNet').value.trim();
  if (!coin || !addr) { toast('Error', 'Coin name and wallet address are required.', 'error'); return; }
  const result = await SummitDB.addCryptoWallet(coin, addr, net);
  if (result.ok) {
    toast('Wallet Added', esc(coin) + ' wallet added successfully.', 'success');
    document.getElementById('newWalletCoin').value = '';
    document.getElementById('newWalletAddr').value = '';
    document.getElementById('newWalletNet').value = '';
    refresh();
  } else { toast('Error', result.error, 'error'); }
}

async function removeWallet(coin) {
  const result = await SummitDB.removeCryptoWallet(coin);
  if (result.ok) { toast('Wallet Removed', esc(coin) + ' wallet removed.', 'info'); refresh(); }
  else { toast('Error', result.error, 'error'); }
}

/* ============================================================
   VIEW: GIFT CARD DEPOSITS
   ============================================================ */
function viewGiftCards() {
  const list = db.applications.giftcards || [];
  const pending = list.filter(d => d.status === 'pending');
  const reviewed = list.filter(d => d.status !== 'pending');
  let html = '<div class="view-section"><div class="stat-row">';
  html += miniStat('Pending', pending.length);
  html += miniStat('Approved', list.filter(d => d.status === 'approved').length);
  html += miniStat('Rejected', list.filter(d => d.status === 'rejected').length);
  html += '</div>';

  html += '<div class="panel"><div class="panel-header"><h3>Pending Gift Card Deposits</h3><span class="ph-sub">' + pending.length + ' awaiting review</span></div><div class="panel-body table-wrap">';
  if (pending.length === 0) {
    html += emptyState('\u2605', 'No pending gift card deposits', 'Gift card deposit requests with pins and images will appear here.');
  } else {
    html += '<table class="data-table"><thead><tr><th>Ref ID</th><th>Customer</th><th>Brand</th><th>Card Value</th><th>Images</th><th>Submitted</th><th>Actions</th></tr></thead><tbody>';
    pending.forEach(d => {
      const imgCount = (d.images && d.images.length) ? d.images.length : 0;
      const imgBadge = imgCount > 0 ? '<span class="badge badge-info">' + imgCount + ' image' + (imgCount > 1 ? 's' : '') + '</span>' : '<span class="badge badge-neutral">None</span>';
      html += '<tr><td class="td-id">' + esc(d.id) + '</td><td class="td-name">' + esc(d.name) + '</td><td>' + esc(d.brand) + '</td><td class="td-amount">' + money0(d.value) + '</td><td>' + imgBadge + '</td><td>' + timeAgo(d.submitted) + '</td><td class="td-actions"><button class="btn btn-ghost btn-sm" onclick="viewGiftCardDetail(\'' + d.id + '\')">Review</button> <button class="btn btn-success btn-sm" onclick="confirmApproveGiftCard(\'' + d.id + '\')">Approve</button></td></tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div></div>';

  if (reviewed.length > 0) {
    html += '<div class="panel"><div class="panel-header"><h3>Reviewed Gift Card Deposits</h3></div><div class="panel-body table-wrap"><table class="data-table"><thead><tr><th>Ref ID</th><th>Customer</th><th>Brand</th><th>Value</th><th>Status</th></tr></thead><tbody>';
    reviewed.slice().reverse().forEach(d => {
      const badge = d.status === 'approved' ? '<span class="badge badge-approved">Approved</span>' : '<span class="badge badge-rejected">Rejected</span>';
      html += '<tr><td class="td-id">' + esc(d.id) + '</td><td class="td-name">' + esc(d.name) + '</td><td>' + esc(d.brand) + '</td><td class="td-amount">' + money0(d.value) + '</td><td>' + badge + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
  }
  html += '</div>';
  return html;
}

function viewGiftCardDetail(id) {
  const d = (db.applications.giftcards || []).find(x => x.id === id);
  if (!d) return;
  let body = detailSection('Gift Card Deposit Request', [
    ['Reference ID', d.id, true],
    ['Customer', d.name],
    ['Email', d.email],
    ['Gift Card Brand', d.brand],
    ['Card Value', money0(d.value)],
    ['Target Account', d.acctNo, true],
    ['Submitted', fmtDate(d.submitted)],
    ['Status', d.status === 'pending' ? 'Pending Review' : d.status],
  ]);
  // Show card pins
  body += '<div class="detail-section"><div class="detail-section-title">Card PIN(s)</div>';
  if (d.pins && d.pins.length > 0) {
    d.pins.forEach((p, i) => {
      body += '<div class="detail-row"><span class="detail-label">PIN ' + (i + 1) + '</span><span class="detail-value mono">' + esc(p) + '</span></div>';
    });
  } else {
    body += '<div style="font-size:13px;color:var(--gray-400);padding:8px 0">No pins provided.</div>';
  }
  body += '</div>';
  // Show uploaded images
  body += '<div class="detail-section"><div class="detail-section-title">Gift Card Images (' + (d.images ? d.images.length : 0) + ')</div>';
  if (d.images && d.images.length > 0) {
    body += '<div class="giftcard-images">';
    d.images.forEach((img, i) => {
      body += '<div class="giftcard-img-wrap"><img src="' + esc(img) + '" alt="Gift card image ' + (i + 1) + '" onclick="openImageFullscreen(\'' + esc(img) + '\')"><div class="giftcard-img-label">Image ' + (i + 1) + '</div></div>';
    });
    body += '</div>';
  } else {
    body += '<div style="font-size:13px;color:var(--gray-400);padding:8px 0">No images uploaded.</div>';
  }
  body += '</div>';
  body += '<div class="drawer-actions"><button class="btn btn-success" onclick="closeDrawer();confirmApproveGiftCard(\'' + d.id + '\')">Approve & Credit Account</button><button class="btn btn-danger" onclick="closeDrawer();confirmRejectGiftCard(\'' + d.id + '\')">Reject</button></div>';
  openDrawer('Gift Card: ' + d.name + ' (' + d.brand + ')', body);
}

function confirmApproveGiftCard(id) {
  const d = (db.applications.giftcards || []).find(x => x.id === id);
  if (!d) return;
  const body = '<p>Approve gift card deposit of <b>' + money0(d.value) + '</b> (' + esc(d.brand) + ') from <b>' + esc(d.name) + '</b>?</p><p style="margin-top:8px;font-size:14px;color:var(--gray-500)">This will credit ' + money0(d.value) + ' to account ' + esc(d.acctNo) + '.</p>';
  const footer = '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-success" onclick="doApproveGiftCard(\'' + id + '\')">Approve Deposit</button>';
  openModal('Approve Gift Card Deposit', body, footer);
}
async function doApproveGiftCard(id) {
  const result = await SummitDB.approveGiftCardDeposit(id);
  closeModal();
  if (result.ok) { toast('Gift Card Approved', 'Customer account credited.', 'success'); refresh(); }
  else { toast('Error', result.error, 'error'); }
}
function confirmRejectGiftCard(id) {
  const body = '<p>Reject this gift card deposit request?</p><div class="modal-field"><label>Rejection Reason</label><textarea id="rejectReason" rows="2" placeholder="e.g. Invalid or already redeemed gift card"></textarea></div>';
  const footer = '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-danger" onclick="doRejectGiftCard(\'' + id + '\')">Reject</button>';
  openModal('Reject Gift Card Deposit', body, footer);
}
async function doRejectGiftCard(id) {
  const reason = document.getElementById('rejectReason').value.trim() || 'Not specified';
  const result = await SummitDB.rejectGiftCardDeposit(id, reason);
  closeModal();
  if (result.ok) { toast('Gift Card Rejected', '', 'info'); refresh(); }
  else { toast('Error', result.error, 'error'); }
}

/* ============================================================
   VIEW: LIVE CHAT SUPPORT
   ============================================================ */
function viewChat() {
  const allChats = cachedChats || [];
  let html = '<div class="view-section">';
  if (allChats.length === 0) {
    html += '<div class="panel"><div class="panel-body">' + emptyState('\u2702', 'No chat conversations', 'When customers send messages via live chat, their conversations will appear here. You can respond to each customer individually.') + '</div></div>';
    html += '</div>';
    return html;
  }
  html += '<div class="chat-admin-layout">';
  // Left: customer list
  html += '<div class="chat-customer-list">';
  html += '<div class="chat-list-header">Conversations (' + allChats.length + ')</div>';
  allChats.forEach(c => {
    const lastText = c.lastMessage || '';
    const lastPreview = lastText.length > 40 ? lastText.substring(0, 40) + '…' : lastText;
    const lastFromTag = c.lastFrom === 'admin' ? 'You: ' : '';
    const unreadBadge = c.unread > 0 ? '<span class="chat-unread-dot">' + c.unread + '</span>' : '';
    html += '<div class="chat-customer-item" onclick="selectChatCustomer(\'' + esc(c.customerId) + '\')" id="chatItem_' + esc(c.customerId) + '">';
    html += '<div class="chat-customer-avatar">' + initials(c.name) + '</div>';
    html += '<div class="chat-customer-info"><div class="chat-customer-name">' + esc(c.name) + unreadBadge + '</div><div class="chat-customer-preview">' + esc(lastFromTag + lastPreview) + '</div></div>';
    html += '</div>';
  });
  html += '</div>';
  // Right: chat panel
  html += '<div class="chat-panel-admin" id="chatPanelAdmin">';
  html += '<div class="chat-panel-empty">Select a customer conversation to view and respond to their messages.</div>';
  html += '</div>';
  html += '</div>';
  html += '</div>';
  return html;
}

let activeChatCustomerId = null;

function selectChatCustomer(customerId) {
  activeChatCustomerId = customerId;
  // Mark as read by admin (async, fire-and-forget)
  SummitDB.markChatReadByAdmin(customerId);
  // Highlight selected item
  document.querySelectorAll('.chat-customer-item').forEach(el => el.classList.remove('active'));
  const item = document.getElementById('chatItem_' + customerId);
  if (item) item.classList.add('active');
  renderChatPanel(customerId);
  updateBadges();
}

async function renderChatPanel(customerId) {
  const panel = document.getElementById('chatPanelAdmin');
  if (!panel) return;
  const chat = await SummitDB.getChat(customerId);
  const customer = db.customers.find(c => c.id === customerId);
  const name = customer ? customer.name : 'Customer';
  const email = customer ? customer.email : '';
  let html = '<div class="chat-panel-header">';
  html += '<div class="chat-panel-customer"><div class="chat-panel-avatar">' + initials(name) + '</div><div><div class="chat-panel-name">' + esc(name) + '</div><div class="chat-panel-email">' + esc(email || customerId) + '</div></div></div>';
  html += '</div>';
  html += '<div class="chat-panel-body" id="chatPanelBody">';
  if (!chat || chat.length === 0) {
    html += '<div style="text-align:center;color:var(--gray-400);padding:40px;font-size:14px">No messages in this conversation.</div>';
  } else {
    chat.forEach(m => {
      const cls = m.from === 'admin' ? 'chat-msg-admin' : 'chat-msg-customer';
      const sender = m.from === 'admin' ? 'Support Agent' : esc(name);
      html += '<div class="chat-msg-row ' + cls + '"><div class="chat-msg-bubble"><div class="chat-msg-sender">' + esc(sender) + '</div><div class="chat-msg-text">' + esc(m.text) + '</div><div class="chat-msg-time">' + fmtDate(m.ts) + '</div></div></div>';
    });
  }
  html += '</div>';
  html += '<div class="chat-panel-input">';
  html += '<textarea id="adminChatInput" placeholder="Type your reply to ' + esc(name) + '…" rows="2"></textarea>';
  html += '<button class="btn btn-primary" onclick="sendAdminReply()">Send</button>';
  html += '</div>';
  panel.innerHTML = html;
  // Scroll to bottom
  const body = document.getElementById('chatPanelBody');
  if (body) body.scrollTop = body.scrollHeight;
  // Focus input and wire Enter key
  const input = document.getElementById('adminChatInput');
  if (input) {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAdminReply(); }
    });
    input.focus();
  }
}

async function sendAdminReply() {
  if (!activeChatCustomerId) return;
  const input = document.getElementById('adminChatInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  const result = await SummitDB.sendAdminMessage(activeChatCustomerId, text);
  if (result.ok) {
    input.value = '';
    renderChatPanel(activeChatCustomerId);
    refresh();
  } else {
    toast('Error', result.error, 'error');
  }
}

/* Open image in fullscreen modal */
function openImageFullscreen(src) {
  const body = '<img src="' + esc(src) + '" style="width:100%;border-radius:10px;display:block">';
  const footer = '<button class="btn btn-ghost" onclick="closeModal()">Close</button>';
  openModal('Gift Card Image', body, footer);
}

/* ============================================================
   VIEW: TRANSACTIONS
   ============================================================ */
function viewTransactions() {
  const list = db.applications.transactions;
  const pending = list.filter(t => t.status === 'pending');
  const processed = db.transactions;
  let html = '<div class="view-section"><div class="stat-row">';
  html += miniStat('Pending Approval', pending.length);
  html += miniStat('Processed (all-time)', processed.length);
  html += '</div>';

  html += '<div class="panel"><div class="panel-header"><h3>Pending Transactions</h3><span class="ph-sub">' + pending.length + ' awaiting approval</span></div><div class="panel-body table-wrap">';
  if (pending.length === 0) {
    html += emptyState('⇄', 'No pending transactions', 'Transfer and payment requests from customers will appear here.');
  } else {
    html += '<table class="data-table"><thead><tr><th>Txn ID</th><th>Customer</th><th>Type</th><th>Direction</th><th>Amount</th><th>Recipient</th><th>From Account</th><th>Submitted</th><th>Actions</th></tr></thead><tbody>';
    pending.forEach(t => {
      const dirBadge = t.direction === 'out' ? '<span class="badge badge-rejected">Outgoing</span>' : '<span class="badge badge-info">Incoming</span>';
      html += '<tr><td class="td-id">' + esc(t.id) + '</td><td class="td-name">' + esc(t.name) + '</td><td>' + esc(t.type) + '</td><td>' + dirBadge + '</td><td class="td-amount">' + money(t.amount) + '</td><td>' + esc(t.recipient) + '</td><td class="td-id">' + esc(t.acctNo) + '</td><td>' + timeAgo(t.submitted) + '</td><td class="td-actions"><button class="btn btn-ghost btn-sm" onclick="viewTxnDetail(\'' + t.id + '\')">Review</button> <button class="btn btn-success btn-sm" onclick="confirmApproveTxn(\'' + t.id + '\')">Approve</button></td></tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div></div>';

  // Processed transactions
  html += '<div class="panel"><div class="panel-header"><h3>Processed Transactions</h3><span class="ph-sub">' + processed.length + ' total</span></div><div class="panel-body table-wrap">';
  if (processed.length === 0) {
    html += emptyState('☰', 'No processed transactions', 'Approved transactions will appear here.');
  } else {
    html += '<table class="data-table"><thead><tr><th>Txn ID</th><th>Customer</th><th>Type</th><th>Direction</th><th>Amount</th><th>Recipient</th><th>Account</th><th>Date</th></tr></thead><tbody>';
    processed.slice().reverse().slice(0, 50).forEach(t => {
      const dirBadge = t.direction === 'out' ? '<span class="badge badge-neutral">Out</span>' : '<span class="badge badge-info">In</span>';
      const amtClass = t.direction === 'out' ? 'td-amount' : 'td-amount';
      const amtStr = (t.direction === 'out' ? '-' : '+') + money(t.amount);
      html += '<tr><td class="td-id">' + esc(t.id) + '</td><td class="td-name">' + esc(t.name) + '</td><td>' + esc(t.type) + '</td><td>' + dirBadge + '</td><td class="' + amtClass + '">' + amtStr + '</td><td>' + esc(t.recipient) + '</td><td class="td-id">' + esc(t.acctNo) + '</td><td>' + fmtDate(t.date) + '</td></tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div></div></div>';
  return html;
}

/* ============================================================
   VIEW: ALL ACCOUNTS
   ============================================================ */
function viewAccounts() {
  let html = '<div class="view-section"><div class="stat-row">';
  const totalBal = db.accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  html += miniStat('Total Accounts', db.accounts.length);
  html += miniStat('Total Balance', money0(totalBal));
  html += miniStat('Checking', db.accounts.filter(a => a.type === 'Checking').length);
  html += miniStat('Savings', db.accounts.filter(a => a.type.includes('Savings')).length);
  html += '</div>';

  html += '<div class="panel"><div class="panel-header"><h3>All Bank Accounts</h3><span class="ph-sub">' + db.accounts.length + ' accounts</span></div><div class="panel-body table-wrap">';
  if (db.accounts.length === 0) {
    html += emptyState('☰', 'No accounts yet', 'Accounts will appear here once sign-ups are approved.');
  } else {
    html += '<table class="data-table"><thead><tr><th>Account ID</th><th>Customer</th><th>Account Number</th><th>Type</th><th>Balance</th><th>Status</th><th>Opened</th><th>Actions</th></tr></thead><tbody>';
    db.accounts.forEach(a => {
      html += '<tr><td class="td-id">' + esc(a.id) + '</td><td class="td-name">' + esc(a.name) + '</td><td class="td-id">' + esc(a.acctNo) + '</td><td>' + esc(a.type) + '</td><td class="td-amount">' + money(a.balance) + '</td><td><span class="badge badge-active">Active</span></td><td>' + esc(a.opened) + '</td><td class="td-actions"><button class="btn btn-blue btn-sm" onclick="creditThisAccount(\'' + a.id + '\')">Credit</button></td></tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div></div></div>';
  return html;
}

/* ============================================================
   VIEW: CREDIT ACCOUNT (manual credit tool)
   ============================================================ */
function viewCredit() {
  let html = '<div class="view-section">';
  html += '<div class="panel"><div class="panel-header"><h3>Manual Account Credit</h3><span class="ph-sub">Credit any customer account instantly</span></div><div class="panel-body" style="padding:24px">';
  html += '<p style="font-size:14px;color:var(--gray-500);margin-bottom:20px">Select an account, enter an amount and reason. The credit is processed immediately, a transaction record is created, and the customer will see the updated balance on their dashboard.</p>';
  html += '<form id="creditForm" onsubmit="submitCredit(event)">';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">';
  html += '<div class="field" style="margin:0"><label>Select Account</label><select id="creditAcct" required>';
  db.accounts.forEach(a => {
    html += '<option value="' + esc(a.id) + '">' + esc(a.name) + ' — ' + esc(a.type) + ' (' + esc(a.acctNo) + ') — Bal: ' + money(a.balance) + '</option>';
  });
  html += '</select></div>';
  html += '<div class="field" style="margin:0"><label>Amount ($)</label><input type="number" id="creditAmount" placeholder="e.g. 500.00" step="0.01" min="0.01" required></div>';
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">';
  html += '<div class="field" style="margin:0"><label>Reason / Type</label><select id="creditReason"><option>Interest Payment</option><option>Bonus</option><option>Refund</option><option>Fee Reversal</option><option>Promotional Credit</option><option>Adjustment</option><option>Wire Transfer In</option><option>Other</option></select></div>';
  html += '<div class="field" style="margin:0"><label>Note (optional)</label><input type="text" id="creditNote" placeholder="Additional details"></div>';
  html += '</div>';
  html += '<button type="submit" class="btn btn-primary">Credit Account Now</button>';
  html += '</form></div></div>';

  // Recent credits
  const credits = db.transactions.filter(t => t.type === 'Interest Payment' || t.type === 'Bonus' || t.type === 'Refund' || t.type === 'Fee Reversal' || t.type === 'Promotional Credit' || t.type === 'Adjustment' || t.type === 'Wire Transfer In' || t.ref?.startsWith('MCR-'));
  html += '<div class="panel"><div class="panel-header"><h3>Recent Manual Credits</h3></div><div class="panel-body table-wrap">';
  if (credits.length === 0) {
    html += emptyState('+', 'No manual credits yet', 'Credit transactions will appear here.');
  } else {
    html += '<table class="data-table"><thead><tr><th>Txn ID</th><th>Customer</th><th>Reason</th><th>Amount</th><th>Note</th><th>Date</th></tr></thead><tbody>';
    credits.slice().reverse().slice(0, 20).forEach(t => {
      html += '<tr><td class="td-id">' + esc(t.id) + '</td><td class="td-name">' + esc(t.name) + '</td><td>' + esc(t.type) + '</td><td class="td-amount">+' + money(t.amount) + '</td><td>' + esc(t.recipient) + '</td><td>' + fmtDate(t.date) + '</td></tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div></div></div>';
  return html;
}

/* ============================================================
   VIEW: CUSTOMERS
   ============================================================ */
function viewCustomers() {
  let html = '<div class="view-section"><div class="stat-row">';
  html += miniStat('Total Customers', db.customers.length);
  html += miniStat('Active', db.customers.filter(c => c.status === 'active').length);
  html += miniStat('Frozen', db.customers.filter(c => c.status === 'frozen').length);
  html += '</div>';

  html += '<div class="panel"><div class="panel-header"><h3>All Customers</h3><span class="ph-sub">' + db.customers.length + ' registered</span></div><div class="panel-body">';
  if (db.customers.length === 0) {
    html += emptyState('☺', 'No customers yet', 'Customers will appear here once sign-ups are approved.');
  } else {
    db.customers.forEach(c => {
      const accts = db.accounts.filter(a => a.customerId === c.id);
      const cards = db.cards.filter(card => card.customerId === c.id);
      const totalBal = accts.reduce((s, a) => s + Number(a.balance || 0), 0);
      const statusBadge = c.status === 'active' ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-frozen">Frozen</span>';
      html += '<div class="customer-card"><div class="customer-avatar">' + initials(c.name) + '</div><div class="customer-card-info"><div class="customer-card-name">' + esc(c.name) + ' ' + statusBadge + '</div><div class="customer-card-meta">' + esc(c.email) + ' · ' + accts.length + ' accounts · ' + cards.length + ' cards · Total: ' + money0(totalBal) + '</div></div><div class="customer-card-actions"><button class="btn btn-ghost btn-sm" onclick="viewCustomerDetail(\'' + c.id + '\')">View</button> <button class="btn btn-' + (c.status === 'active' ? 'danger' : 'success') + ' btn-sm" onclick="confirmFreeze(\'' + c.id + '\')">' + (c.status === 'active' ? 'Freeze' : 'Unfreeze') + '</button></div></div>';
    });
  }
  html += '</div></div></div>';
  return html;
}

/* ============================================================
   VIEW: AUDIT LOG
   ============================================================ */
function viewAudit() {
  let html = '<div class="view-section"><div class="panel"><div class="panel-header"><h3>Audit Log</h3><span class="ph-sub">' + db.audit.length + ' entries</span></div><div class="panel-body"><div class="audit-list">';
  if (db.audit.length === 0) {
    html += emptyState('◷', 'No audit entries', 'All admin and system actions are logged here.');
  } else {
    db.audit.slice().reverse().forEach(a => { html += auditItem(a); });
  }
  html += '</div></div></div></div>';
  return html;
}


/* ============================================================
   VIEW: EMAIL SETTINGS
   ============================================================ */
function viewEmail() {
  let html = '<div class="view-section">';
  html += '<div class="panel"><div class="panel-header"><h3>\u2709 Email Notification System</h3><span class="ph-sub">Customer email alerts</span></div><div class="panel-body">';

  html += '<div style="padding:16px;background:#0a1628;border-radius:8px;margin-bottom:20px;border:1px solid #1e3a5f;">';
  html += '<h4 style="color:#d4af37;margin:0 0 10px 0;">How It Works</h4>';
  html += '<p style="color:#a0aec0;font-size:13px;line-height:1.6;margin:0;">Customers automatically receive professional email notifications from Summit National Bank for every account action, including: signup applications (received, approved, rejected), loan applications, credit card applications, deposit requests, transfers and payments, crypto deposits, gift card deposits, password changes, email changes, account freeze/unfreeze, manual credits, and admin chat replies.</p>';
  html += '</div>';

  html += '<div style="padding:16px;background:#1a1a2e;border-radius:8px;margin-bottom:20px;border-left:4px solid #d4af37;">';
  html += '<h4 style="color:#fff;margin:0 0 8px 0;">\u00f0\u009f\u0093\u00a7 Email Service: Resend</h4>';
  html += '<p style="color:#a0aec0;font-size:13px;line-height:1.6;margin:0 0 12px 0;">This system uses the <strong style="color:#d4af37;">Resend</strong> email service to send notifications. The free tier includes 3,000 emails per month \u2014 more than enough for a growing bank. Until an API key is configured, emails are logged to the server console only (no actual emails are sent).</p>';
  html += '<p style="color:#a0aec0;font-size:13px;line-height:1.6;margin:0;"><strong style="color:#fff;">Status:</strong> <span id="emailStatus" style="color:#f59e0b;">Checking...</span></p>';
  html += '</div>';

  html += '<h4 style="color:#fff;margin:20px 0 12px 0;">Test Email Configuration</h4>';
  html += '<p style="color:#a0aec0;font-size:13px;margin-bottom:12px;">Send a test email to verify the notification system is working. Enter an email address below and click "Send Test Email".</p>';
  html += '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:20px;">';
  html += '<input type="email" id="testEmailInput" placeholder="customer@example.com" style="flex:1;min-width:250px;padding:10px 14px;background:#0a1628;border:1px solid #1e3a5f;border-radius:6px;color:#fff;font-size:14px;" />';
  html += '<button onclick="sendTestEmail()" style="padding:10px 20px;background:#d4af37;color:#0a1628;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:14px;">Send Test Email</button>';
  html += '</div>';
  html += '<div id="testEmailResult" style="margin-bottom:20px;"></div>';

  html += '<h4 style="color:#fff;margin:24px 0 12px 0;">Setup Instructions</h4>';
  html += '<div style="padding:16px;background:#0f172a;border-radius:8px;border:1px solid #1e293b;font-size:13px;line-height:1.8;color:#a0aec0;">';
  html += '<p style="margin:0 0 10px 0;"><strong style="color:#d4af37;">Step 1:</strong> Go to <a href="https://resend.com" target="_blank" style="color:#60a5fa;">https://resend.com</a> and sign up for a free account.</p>';
  html += '<p style="margin:0 0 10px 0;"><strong style="color:#d4af37;">Step 2:</strong> Navigate to API Keys and click "Create API Key". Copy the key (starts with <code style="color:#d4af37;">re_</code>).</p>';
  html += '<p style="margin:0 0 10px 0;"><strong style="color:#d4af37;">Step 3:</strong> Go to your Vercel project settings \u2192 Environment Variables.</p>';
  html += '<p style="margin:0 0 10px 0;"><strong style="color:#d4af37;">Step 4:</strong> Add a new variable: Name = <code style="color:#d4af37;">RESEND_API_KEY</code>, Value = your API key. Set it for Production, Preview, and Development.</p>';
  html += '<p style="margin:0 0 10px 0;"><strong style="color:#d4af37;">Step 5:</strong> (Optional) Add <code style="color:#d4af37;">EMAIL_FROM</code> with a verified sender email.</p>';
  html += '<p style="margin:0 0 10px 0;"><strong style="color:#d4af37;">Step 6:</strong> Redeploy the project for the changes to take effect.</p>';
  html += '<p style="margin:0;"><strong style="color:#d4af37;">Step 7:</strong> Come back here and send a test email to verify everything works!</p>';
  html += '</div>';

  html += '</div></div></div>';
  html += '</div>';

  /* Check email status on render */
  setTimeout(checkEmailStatus, 100);

  return html;
}

async function checkEmailStatus() {
  const el = document.getElementById('emailStatus');
  if (!el) return;
  try {
    const r = await fetch('/api/admin/test-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: 'status-check@example.com' })
    });
    const data = await r.json();
    if (data.ok && data.message && data.message.includes('LOG-ONLY')) {
      el.innerHTML = '\u26a0 <span style="color:#f59e0b;">Log-only mode</span> \u2014 No RESEND_API_KEY configured. Emails are logged but not sent. See setup instructions below.';
    } else if (data.ok) {
      el.innerHTML = '\u2705 <span style="color:#10b981;">Active</span> \u2014 Email notifications are being sent via Resend.';
    } else {
      el.innerHTML = '\u26a0 <span style="color:#f59e0b;">' + (data.error || 'Unknown status') + '</span>';
    }
  } catch (e) {
    el.innerHTML = '\u26a0 <span style="color:#ef4444;">Could not check email status.</span>';
  }
}

async function sendTestEmail() {
  const input = document.getElementById('testEmailInput');
  const result = document.getElementById('testEmailResult');
  const email = input.value.trim();
  if (!email || !email.includes('@')) {
    result.innerHTML = '<div style="padding:12px;background:#3b1419;border-radius:6px;color:#fca5a5;font-size:13px;">\u26a0 Please enter a valid email address.</div>';
    return;
  }
  result.innerHTML = '<div style="padding:12px;background:#1e293b;border-radius:6px;color:#a0aec0;font-size:13px;">Sending test email...</div>';
  try {
    const r = await fetch('/api/admin/test-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: email })
    });
    const data = await r.json();
    if (data.ok) {
      if (data.message && data.message.includes('LOG-ONLY')) {
        result.innerHTML = '<div style="padding:12px;background:#2d2006;border-radius:6px;color:#fcd34d;font-size:13px;">\u26a0 Email system is in <strong>log-only mode</strong>. No RESEND_API_KEY is configured, so no actual email was sent. Follow the setup instructions below to activate real email sending.</div>';
      } else {
        result.innerHTML = '<div style="padding:12px;background:#064e3b;border-radius:6px;color:#6ee7b7;font-size:13px;">\u2705 Test email sent successfully to <strong>' + email + '</strong>. Check the inbox (and spam folder) to confirm delivery.</div>';
        toast('Test Email Sent', 'Check ' + email + ' for the test email.', 'success');
      }
    } else {
      result.innerHTML = '<div style="padding:12px;background:#3b1419;border-radius:6px;color:#fca5a5;font-size:13px;">\u26a0 ' + (data.error || 'Failed to send test email.') + '</div>';
    }
  } catch (e) {
    result.innerHTML = '<div style="padding:12px;background:#3b1419;border-radius:6px;color:#fca5a5;font-size:13px;">\u26a0 Error: ' + e.message + '</div>';
  }
}

function miniStat(label, value) {
  return '<div class="mini-stat"><div class="ms-label">' + esc(label) + '</div><div class="ms-value">' + value + '</div></div>';
}

/* ============================================================
   DETAIL DRAWERS
   ============================================================ */
function openDrawer(title, bodyHtml) {
  document.getElementById('drawerTitle').textContent = title;
  document.getElementById('drawerBody').innerHTML = bodyHtml;
  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
}
function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
}

function viewSignupDetail(id) {
  const s = db.applications.signups.find(x => x.id === id);
  if (!s) return;
  let body = detailSection('Applicant Information', [
    ['Application ID', s.id, true],
    ['Full Name', s.name],
    ['Email', s.email],
    ['Phone', s.phone],
    ['Date of Birth', s.dob],
    ['SSN (Last 4)', s.ssn, true],
    ['Complete SSN', s.ssnFull || '—', true],
    ['Address', s.address],
    ['Employer', s.employer || '—'],
  ]);
  if (s.selfie) {
    body += '<div class="detail-section"><div class="detail-section-title">Identity Selfie</div><div class="selfie-detail-wrap"><img src="' + esc(s.selfie) + '" class="selfie-detail-img" alt="Applicant selfie" onclick="openImageFullscreen(\'' + esc(s.selfie) + '\')"></div></div>';
  } else {
    body += '<div class="detail-section"><div class="detail-section-title">Identity Selfie</div><div style="font-size:13px;color:var(--gray-400);padding:8px 0">No selfie captured.</div></div>';
  }
  body += detailSection('Account Request', [
    ['Account Type', s.type],
    ['Opening Deposit', money(s.deposit)],
    ['Submitted', fmtDate(s.submitted)],
    ['Status', s.status === 'pending' ? 'Pending Review' : s.status],
  ]);
  body += '<div class="drawer-actions"><button class="btn btn-success" onclick="closeDrawer();confirmApproveSignup(\'' + s.id + '\')">Approve & Create Account</button><button class="btn btn-danger" onclick="closeDrawer();confirmRejectSignup(\'' + s.id + '\')">Reject</button></div>';
  openDrawer('Sign-Up: ' + s.name, body);
}

function viewLoanDetail(id) {
  const l = db.applications.loans.find(x => x.id === id);
  if (!l) return;
  let body = detailSection('Loan Application', [
    ['Application ID', l.id, true],
    ['Applicant', l.name],
    ['Email', l.email],
    ['Loan Type', l.type],
    ['Amount Requested', money0(l.amount)],
    ['Interest Rate', l.rate],
    ['Term', l.term],
  ]);
  body += detailSection('Financial Details', [
    ['Annual Income', money0(l.income)],
    ['Credit Score', l.score],
    ['Employer', l.employer || '—'],
    ['Purpose', l.purpose || '—'],
    ['Submitted', fmtDate(l.submitted)],
  ]);
  body += '<div class="drawer-actions"><button class="btn btn-success" onclick="closeDrawer();confirmApproveLoan(\'' + l.id + '\')">Approve Loan</button><button class="btn btn-danger" onclick="closeDrawer();confirmRejectLoan(\'' + l.id + '\')">Reject</button></div>';
  openDrawer('Loan: ' + l.name, body);
}

function viewCardDetail(id) {
  const c = db.applications.cards.find(x => x.id === id);
  if (!c) return;
  let body = detailSection('Card Application', [
    ['Application ID', c.id, true],
    ['Applicant', c.name],
    ['Email', c.email],
    ['Card Type', c.cardType],
    ['Requested Limit', money0(c.reqLimit)],
  ]);
  body += detailSection('Financial Profile', [
    ['Annual Income', money0(c.income)],
    ['Credit Score', c.score],
    ['Existing Debt', money0(c.existingDebt || 0)],
    ['Submitted', fmtDate(c.submitted)],
  ]);
  if (c.selfie) {
    body += '<div class="detail-section"><div class="detail-section-title">Identity Selfie</div><div class="selfie-detail-wrap"><img src="' + esc(c.selfie) + '" class="selfie-detail-img" alt="Applicant selfie" onclick="openImageFullscreen(\'' + esc(c.selfie) + '\')"></div></div>';
  } else {
    body += '<div class="detail-section"><div class="detail-section-title">Identity Selfie</div><div style="font-size:13px;color:var(--gray-400);padding:8px 0">No selfie captured.</div></div>';
  }
  body += '<div class="drawer-actions"><button class="btn btn-success" onclick="closeDrawer();confirmApproveCard(\'' + c.id + '\')">Approve & Issue Card</button><button class="btn btn-danger" onclick="closeDrawer();confirmRejectCard(\'' + c.id + '\')">Reject</button></div>';
  openDrawer('Card App: ' + c.name, body);
}

function viewDepositDetail(id) {
  const d = db.applications.deposits.find(x => x.id === id);
  if (!d) return;
  let body = detailSection('Deposit Request', [
    ['Application ID', d.id, true],
    ['Customer', d.name],
    ['Deposit Type', d.depType],
    ['Amount', money(d.amount)],
    ['Source', d.source],
    ['Target Account', d.acctNo, true],
    ['Account Type', d.acctType],
    ['Submitted', fmtDate(d.submitted)],
  ]);
  body += '<div class="drawer-actions"><button class="btn btn-success" onclick="closeDrawer();confirmApproveDeposit(\'' + d.id + '\')">Approve Deposit</button><button class="btn btn-danger" onclick="closeDrawer();confirmRejectDeposit(\'' + d.id + '\')">Reject</button></div>';
  openDrawer('Deposit: ' + d.name, body);
}

function viewTxnDetail(id) {
  const t = db.applications.transactions.find(x => x.id === id);
  if (!t) return;
  const acct = db.accounts.find(a => a.id === t.fromAcctId);
  let body = detailSection('Transaction Request', [
    ['Transaction ID', t.id, true],
    ['Customer', t.name],
    ['Type', t.type],
    ['Direction', t.direction === 'out' ? 'Outgoing (debit)' : 'Incoming (credit)'],
    ['Amount', money(t.amount)],
    ['Recipient / Description', t.recipient],
    ['From Account', t.acctNo, true],
    ['Reference', t.ref, true],
  ]);
  if (acct) {
    body += detailSection('Account Status', [
      ['Current Balance', money(acct.balance)],
      ['Balance After Txn', t.direction === 'out' ? money(acct.balance - t.amount) : money(acct.balance + t.amount)],
    ]);
  }
  body += '<div class="drawer-actions"><button class="btn btn-success" onclick="closeDrawer();confirmApproveTxn(\'' + t.id + '\')">Approve & Process</button><button class="btn btn-danger" onclick="closeDrawer();confirmRejectTxn(\'' + t.id + '\')">Reject</button></div>';
  openDrawer('Transaction: ' + t.name, body);
}

function viewCustomerDetail(id) {
  const c = db.customers.find(x => x.id === id);
  if (!c) return;
  const accts = db.accounts.filter(a => a.customerId === id);
  const cards = db.cards.filter(card => card.customerId === id);
  const txns = db.transactions.filter(t => t.customerId === id).slice().reverse().slice(0, 10);
  let body = detailSection('Customer Profile', [
    ['Customer ID', c.id, true],
    ['Name', c.name],
    ['Email', c.email],
    ['Phone', c.phone],
    ['Complete SSN', c.ssnFull || c.ssn || '—', true],
    ['Date of Birth', c.dob || '—'],
    ['Address', c.address || '—'],
    ['Employer', c.employer || '—'],
    ['Status', c.status === 'active' ? 'Active' : 'Frozen'],
    ['Member Since', fmtDate(c.createdAt)],
  ]);
  if (c.selfie) {
    body += '<div class="detail-section"><div class="detail-section-title">Identity Selfie</div><div class="selfie-detail-wrap"><img src="' + esc(c.selfie) + '" class="selfie-detail-img" alt="Customer selfie" onclick="openImageFullscreen(\'' + esc(c.selfie) + '\')"></div></div>';
  }
  body += '<div class="detail-section"><div class="detail-section-title">Accounts (' + accts.length + ')</div>';
  if (accts.length === 0) { body += '<div style="font-size:13px;color:var(--gray-400);padding:8px 0">No accounts.</div>'; }
  accts.forEach(a => {
    body += '<div class="detail-row"><span class="detail-label">' + esc(a.type) + '</span><span class="detail-value mono">' + esc(a.acctNo) + '<br>' + money(a.balance) + '</span></div>';
  });
  body += '</div>';
  body += '<div class="detail-section"><div class="detail-section-title">Credit Cards (' + cards.length + ')</div>';
  if (cards.length === 0) { body += '<div style="font-size:13px;color:var(--gray-400);padding:8px 0">No cards issued.</div>'; }
  cards.forEach(card => {
    body += '<div class="detail-row"><span class="detail-label">' + esc(card.cardType) + '</span><span class="detail-value mono">••••' + esc(String(card.cardNo).slice(-4)) + '<br>Limit: ' + money0(card.limit) + '</span></div>';
  });
  body += '</div>';
  body += '<div class="detail-section"><div class="detail-section-title">Recent Transactions</div>';
  if (txns.length === 0) { body += '<div style="font-size:13px;color:var(--gray-400);padding:8px 0">No transactions.</div>'; }
  txns.forEach(t => {
    body += '<div class="detail-row"><span class="detail-label">' + esc(t.type) + '</span><span class="detail-value">' + (t.direction === 'out' ? '-' : '+') + money(t.amount) + '</span></div>';
  });
  body += '</div>';
  openDrawer('Customer: ' + c.name, body);
}

function detailSection(title, rows) {
  let html = '<div class="detail-section"><div class="detail-section-title">' + esc(title) + '</div>';
  rows.forEach(r => {
    html += '<div class="detail-row"><span class="detail-label">' + esc(r[0]) + '</span><span class="detail-value' + (r[2] ? ' mono' : '') + '">' + esc(r[1]) + '</span></div>';
  });
  html += '</div>';
  return html;
}

/* ============================================================
   CONFIRM MODALS & ACTION HANDLERS
   ============================================================ */
function openModal(title, bodyHtml, footerHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalFooter').innerHTML = footerHtml;
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

/* --- Signup approve (with credit amount override) --- */
function confirmApproveSignup(id) {
  const s = db.applications.signups.find(x => x.id === id);
  if (!s) return;
  const body = '<p>You are about to approve the sign-up for <b>' + esc(s.name) + '</b>. This will:</p><ul style="margin:12px 0 12px 20px;font-size:14px;color:var(--gray-600)"><li>Create a customer login account (email: ' + esc(s.email) + ')</li><li>Open a ' + esc(s.type) + ' account</li><li>Credit the opening deposit</li><li>The customer can immediately log in with their chosen email and password</li></ul><div class="modal-field"><label>Opening Deposit Amount ($)</label><input type="number" id="approveSignupAmount" value="' + s.deposit + '" step="0.01" min="0"></div>';
  const footer = '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-success" onclick="doApproveSignup(\'' + id + '\')">Confirm Approval</button>';
  openModal('Approve Sign-Up', body, footer);
}
async function doApproveSignup(id) {
  const amt = parseFloat(document.getElementById('approveSignupAmount').value) || 0;
  const result = await SummitDB.approveSignup(id, amt);
  closeModal();
  if (result.ok) {
    toast('Sign-Up Approved', 'Customer account created and opening deposit credited.', 'success');
    refresh();
  } else {
    toast('Error', result.error, 'error');
  }
}
function confirmRejectSignup(id) {
  const body = '<p>Are you sure you want to <b style="color:var(--red-500)">reject</b> this sign-up application?</p><div class="modal-field"><label>Rejection Reason</label><textarea id="rejectReason" rows="2" placeholder="e.g. Incomplete documentation"></textarea></div>';
  const footer = '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-danger" onclick="doRejectSignup(\'' + id + '\')">Reject Application</button>';
  openModal('Reject Sign-Up', body, footer);
}
async function doRejectSignup(id) {
  const reason = document.getElementById('rejectReason').value.trim() || 'Not specified';
  const result = await SummitDB.rejectSignup(id, reason);
  closeModal();
  if (result.ok) { toast('Sign-Up Rejected', 'Application has been rejected.', 'info'); refresh(); }
  else { toast('Error', result.error, 'error'); }
}

/* --- Loan approve --- */
function confirmApproveLoan(id) {
  const l = db.applications.loans.find(x => x.id === id);
  if (!l) return;
  const settings = db.settings || {};
  const defaultFee = settings.defaultLoanFee != null ? settings.defaultLoanFee : 150;
  const feeEnabled = settings.loanFeeEnabled !== false;
  const body = '<p>You are about to approve a <b>' + esc(l.type) + '</b> loan for <b>' + esc(l.name) + '</b>.</p><p style="margin-top:10px">Loan amount: <b>' + money0(l.amount) + '</b></p>' +
    '<div class="modal-field"><label>Loan Origination Fee ($)</label><input type="number" id="approveLoanFee" value="' + defaultFee + '" step="10" min="0"><p style="font-size:12px;color:var(--gray-400);margin-top:4px">' +
    (feeEnabled ? 'The customer must pay this one-time origination fee before the loan funds are disbursed. The loan will be placed in "fee pending" status until the fee is confirmed paid. Enter 0 to disburse immediately with no fee.' : 'Loan fee is currently disabled in settings. Enter 0 or enable the fee in Bank Settings.') + '</p></div>';
  const footer = '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-success" onclick="doApproveLoan(\'' + id + '\')">Approve Loan</button>';
  openModal('Approve Loan', body, footer);
}
async function doApproveLoan(id) {
  const loanFee = parseFloat(document.getElementById('approveLoanFee').value) || 0;
  const result = await SummitDB.approveLoan(id, loanFee);
  closeModal();
  if (result.ok) {
    if (result.status === 'fee_pending') {
      toast('Loan Approved', 'Loan approved. Origination fee of $' + loanFee.toLocaleString() + ' is pending payment before disbursement.', 'success');
    } else {
      toast('Loan Approved', 'Funds disbursed to customer account.', 'success');
    }
    refresh();
  } else { toast('Error', result.error, 'error'); }
}
function confirmRejectLoan(id) {
  const body = '<p>Reject this loan application?</p><div class="modal-field"><label>Rejection Reason</label><textarea id="rejectReason" rows="2" placeholder="e.g. Insufficient income"></textarea></div>';
  const footer = '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-danger" onclick="doRejectLoan(\'' + id + '\')">Reject</button>';
  openModal('Reject Loan', body, footer);
}
async function doRejectLoan(id) {
  const reason = document.getElementById('rejectReason').value.trim() || 'Not specified';
  const result = await SummitDB.rejectLoan(id, reason);
  closeModal();
  if (result.ok) { toast('Loan Rejected', '', 'info'); refresh(); }
  else { toast('Error', result.error, 'error'); }
}

/* --- Loan fee pending: confirm fee paid & edit fee --- */
function confirmLoanFeePaid(id) {
  const l = db.applications.loans.find(x => x.id === id);
  if (!l) return;
  const body = '<p>Confirm that the loan origination fee of <b>' + money0(l.loanFee || 0) + '</b> has been paid by <b>' + esc(l.name) + '</b>?</p><p style="margin-top:10px;font-size:14px;color:var(--gray-500)">Once confirmed, the loan amount of <b>' + money0(l.amount) + '</b> will be disbursed to the customer\'s checking account and a Loan Disbursement transaction will be created.</p>';
  const footer = '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-success" onclick="doConfirmLoanFeePaid(\'' + id + '\')">Confirm Fee Paid & Disburse</button>';
  openModal('Confirm Origination Fee Paid', body, footer);
}
async function doConfirmLoanFeePaid(id) {
  const result = await SummitDB.confirmLoanFeePaid(id);
  closeModal();
  if (result.ok) { toast('Fee Confirmed', 'Loan funds disbursed to customer account.', 'success'); refresh(); }
  else { toast('Error', result.error, 'error'); }
}
function editLoanFee(id) {
  const l = db.applications.loans.find(x => x.id === id);
  if (!l) return;
  const body = '<p>Edit the loan origination fee for <b>' + esc(l.name) + '</b>\'s ' + esc(l.type) + ' loan ($' + money0(l.amount) + ').</p>' +
    '<div class="modal-field"><label>Loan Origination Fee ($)</label><input type="number" id="editLoanFeeAmt" value="' + (l.loanFee || 0) + '" step="10" min="0"><p style="font-size:12px;color:var(--gray-400);margin-top:4px">The customer must pay this fee before the loan funds are disbursed. Enter 0 to remove the fee requirement (funds will still need to be disbursed via "Confirm Fee Paid").</p></div>';
  const footer = '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="doEditLoanFee(\'' + id + '\')">Save Fee</button>';
  openModal('Edit Loan Origination Fee', body, footer);
}
async function doEditLoanFee(id) {
  const amt = parseFloat(document.getElementById('editLoanFeeAmt').value) || 0;
  const result = await SummitDB.updateLoanFee(id, amt);
  closeModal();
  if (result.ok) { toast('Fee Updated', 'Loan origination fee updated to $' + amt.toLocaleString() + '.', 'success'); refresh(); }
  else { toast('Error', result.error, 'error'); }
}

/* --- Card approve (with limit override) --- */
function confirmApproveCard(id) {
  const c = db.applications.cards.find(x => x.id === id);
  if (!c) return;
  const settings = db.settings || {};
  const defaultDeposit = settings.defaultCardSecurityDeposit != null ? settings.defaultCardSecurityDeposit : 250;
  const body = '<p>Approve credit card for <b>' + esc(c.name) + '</b>?</p><p style="margin-top:8px;font-size:14px;color:var(--gray-500)">Card type: ' + esc(c.cardType) + '</p>' +
    '<div class="modal-field"><label>Credit Limit ($)</label><input type="number" id="approveCardLimit" value="' + c.reqLimit + '" step="100" min="100"></div>' +
    '<div class="modal-field"><label>Refundable Security Deposit Required Before Shipping ($)</label><input type="number" id="approveCardDeposit" value="' + defaultDeposit + '" step="50" min="0" placeholder="e.g. 200"><p style="font-size:12px;color:var(--gray-400);margin-top:4px">Set a refundable deposit the customer must pay before their card is shipped. This deposit is fully refundable to the customer. The default value comes from Bank Settings. Enter 0 if no deposit is required.</p></div>';
  const footer = '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-success" onclick="doApproveCard(\'' + id + '\')">Approve & Issue</button>';
  openModal('Approve Credit Card', body, footer);
}
async function doApproveCard(id) {
  const limit = parseFloat(document.getElementById('approveCardLimit').value) || 0;
  const deposit = parseFloat(document.getElementById('approveCardDeposit').value) || 0;
  const result = await SummitDB.approveCard(id, limit, deposit);
  closeModal();
  if (result.ok) { toast('Card Approved', deposit > 0 ? 'Credit card issued. Refundable security deposit of $' + deposit.toLocaleString() + ' required before shipping.' : 'Credit card issued to customer.', 'success'); refresh(); }
  else { toast('Error', result.error, 'error'); }
}
function confirmRejectCard(id) {
  const body = '<p>Reject this credit card application?</p><div class="modal-field"><label>Rejection Reason</label><textarea id="rejectReason" rows="2" placeholder="e.g. Credit score too low"></textarea></div>';
  const footer = '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-danger" onclick="doRejectCard(\'' + id + '\')">Reject</button>';
  openModal('Reject Card Application', body, footer);
}
async function doRejectCard(id) {
  const reason = document.getElementById('rejectReason').value.trim() || 'Not specified';
  const result = await SummitDB.rejectCard(id, reason);
  closeModal();
  if (result.ok) { toast('Card Rejected', '', 'info'); refresh(); }
  else { toast('Error', result.error, 'error'); }
}

function editCardDeposit(id) {
  const c = db.cards.find(x => x.id === id);
  if (!c) return;
  const body = '<p>Edit the refundable security deposit for <b>' + esc(c.name) + '</b>\'s ' + esc(c.cardType) + ' card (•••• ' + esc(String(c.cardNo).slice(-4)) + ').</p>' +
    '<div class="modal-field"><label>Refundable Security Deposit Amount ($)</label><input type="number" id="editDepositAmt" value="' + (c.securityDeposit || 0) + '" step="50" min="0"><p style="font-size:12px;color:var(--gray-400);margin-top:4px">The customer will see this amount on their dashboard. This deposit is fully refundable. Enter 0 to remove the deposit requirement.</p></div>';
  const footer = '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="doEditDeposit(\'' + id + '\')">Save Deposit</button>';
  openModal('Edit Refundable Security Deposit', body, footer);
}
async function doEditDeposit(id) {
  const amt = parseFloat(document.getElementById('editDepositAmt').value) || 0;
  const result = await SummitDB.updateDeposit(id, amt);
  closeModal();
  if (result.ok) { toast('Deposit Updated', 'Refundable security deposit set to $' + amt.toLocaleString() + '.', 'success'); refresh(); }
  else { toast('Error', result.error, 'error'); }
}

function confirmDepositPaid(id) {
  const c = db.cards.find(x => x.id === id);
  if (!c) return;
  const body = '<p>Confirm that the refundable security deposit of <b>$' + (c.securityDeposit || 0).toLocaleString() + '</b> has been received for <b>' + esc(c.name) + '</b>\'s ' + esc(c.cardType) + ' card?</p><p style="margin-top:8px;font-size:14px;color:var(--gray-500)">This will mark the deposit as paid and the card as shipped. The customer will be emailed that their card is on the way. This deposit is refundable to the customer.</p>';
  const footer = '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-success" onclick="doConfirmDepositPaid(\'' + id + '\')">Confirm & Mark Shipped</button>';
  openModal('Confirm Refundable Security Deposit Paid', body, footer);
}
async function doConfirmDepositPaid(id) {
  const result = await SummitDB.confirmDepositPaid(id);
  closeModal();
  if (result.ok) { toast('Deposit Confirmed', 'Card marked as shipped. Customer notified.', 'success'); refresh(); }
  else { toast('Error', result.error, 'error'); }
}

/* --- Deposit approve --- */
function confirmApproveDeposit(id) {
  const d = db.applications.deposits.find(x => x.id === id);
  if (!d) return;
  const body = '<p>Approve deposit of <b>' + money(d.amount) + '</b> from <b>' + esc(d.name) + '</b>?</p><p style="margin-top:8px;font-size:14px;color:var(--gray-500)">This will credit the amount to account ' + esc(d.acctNo) + ' and create a transaction record.</p>';
  const footer = '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-success" onclick="doApproveDeposit(\'' + id + '\')">Approve Deposit</button>';
  openModal('Approve Deposit', body, footer);
}
async function doApproveDeposit(id) {
  const result = await SummitDB.approveDeposit(id);
  closeModal();
  if (result.ok) { toast('Deposit Approved', 'Customer account credited.', 'success'); refresh(); }
  else { toast('Error', result.error, 'error'); }
}
function confirmRejectDeposit(id) {
  const body = '<p>Reject this deposit request?</p><div class="modal-field"><label>Rejection Reason</label><textarea id="rejectReason" rows="2" placeholder="e.g. Unable to verify source"></textarea></div>';
  const footer = '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-danger" onclick="doRejectDeposit(\'' + id + '\')">Reject</button>';
  openModal('Reject Deposit', body, footer);
}
async function doRejectDeposit(id) {
  const reason = document.getElementById('rejectReason').value.trim() || 'Not specified';
  const result = await SummitDB.rejectDeposit(id, reason);
  closeModal();
  if (result.ok) { toast('Deposit Rejected', '', 'info'); refresh(); }
  else { toast('Error', result.error, 'error'); }
}

/* --- Transaction approve --- */
function confirmApproveTxn(id) {
  const t = db.applications.transactions.find(x => x.id === id);
  if (!t) return;
  const body = '<p>Approve ' + esc(t.type) + ' of <b>' + money(t.amount) + '</b> ' + (t.direction === 'out' ? 'from' : 'to') + ' <b>' + esc(t.name) + '</b>?</p><p style="margin-top:8px;font-size:14px;color:var(--gray-500)">Recipient: ' + esc(t.recipient) + '</p>';
  const footer = '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-success" onclick="doApproveTxn(\'' + id + '\')">Approve & Process</button>';
  openModal('Approve Transaction', body, footer);
}
async function doApproveTxn(id) {
  const result = await SummitDB.approveTransaction(id);
  closeModal();
  if (result.ok) { toast('Transaction Approved', 'Transaction processed successfully.', 'success'); refresh(); }
  else { toast('Error', result.error, 'error'); }
}
function confirmRejectTxn(id) {
  const body = '<p>Reject this transaction request?</p><div class="modal-field"><label>Rejection Reason</label><textarea id="rejectReason" rows="2" placeholder="e.g. Verification required"></textarea></div>';
  const footer = '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-danger" onclick="doRejectTxn(\'' + id + '\')">Reject</button>';
  openModal('Reject Transaction', body, footer);
}
async function doRejectTxn(id) {
  const reason = document.getElementById('rejectReason').value.trim() || 'Not specified';
  const result = await SummitDB.rejectTransaction(id, reason);
  closeModal();
  if (result.ok) { toast('Transaction Rejected', '', 'info'); refresh(); }
  else { toast('Error', result.error, 'error'); }
}

/* ============================================================
   MANUAL CREDIT & FREEZE
   ============================================================ */
async function submitCredit(e) {
  e.preventDefault();
  const acctId = document.getElementById('creditAcct').value;
  const amount = parseFloat(document.getElementById('creditAmount').value);
  const reason = document.getElementById('creditReason').value;
  const note = document.getElementById('creditNote').value;
  if (!acctId || !amount || amount <= 0) {
    toast('Invalid Input', 'Please select an account and enter a valid amount.', 'error');
    return;
  }
  const result = await SummitDB.creditAccount(acctId, amount, reason, note);
  if (result.ok) {
    toast('Account Credited', money(amount) + ' credited successfully. New balance: ' + money(result.newBalance), 'success');
    refresh();
  } else {
    toast('Error', result.error, 'error');
  }
}

function creditThisAccount(acctId) {
  go('credit');
  setTimeout(() => {
    const sel = document.getElementById('creditAcct');
    if (sel) sel.value = acctId;
    const amt = document.getElementById('creditAmount');
    if (amt) amt.focus();
  }, 100);
}

function confirmFreeze(customerId) {
  const c = db.customers.find(x => x.id === customerId);
  if (!c) return;
  const action = c.status === 'active' ? 'freeze' : 'unfreeze';
  const body = '<p>Are you sure you want to <b>' + action + '</b> the account for <b>' + esc(c.name) + '</b>?</p>' + (c.status === 'active' ? '<p style="margin-top:8px;font-size:14px;color:var(--red-500)">The customer will not be able to log in while frozen.</p>' : '<p style="margin-top:8px;font-size:14px;color:var(--green-600)">The customer will be able to log in again.</p>');
  const footer = '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-' + (c.status === 'active' ? 'danger' : 'success') + '" onclick="doFreeze(\'' + customerId + '\')">' + (c.status === 'active' ? 'Freeze Account' : 'Unfreeze Account') + '</button>';
  openModal(action.charAt(0).toUpperCase() + action.slice(1) + ' Customer', body, footer);
}
async function doFreeze(customerId) {
  const result = await SummitDB.toggleFreezeCustomer(customerId);
  closeModal();
  if (result.ok) { toast('Customer ' + (result.status === 'frozen' ? 'Frozen' : 'Unfrozen'), '', result.status === 'frozen' ? 'info' : 'success'); refresh(); }
  else { toast('Error', result.error, 'error'); }
}

/* ============================================================
   SIDEBAR TOGGLE (mobile)
   ============================================================ */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
}

/* ============================================================
   LOGIN FORM
   ============================================================ */
document.getElementById('loginForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const pass = document.getElementById('adminPass').value;
  const btn = document.getElementById('loginForm').querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
  const result = await SummitDB.adminLogin(pass);
  if (btn) { btn.disabled = false; btn.textContent = 'Sign In to Admin Panel'; }
  if (result.ok) {
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('adminPass').value = '';
    checkAuth();
    toast('Welcome back', 'Admin panel loaded successfully.', 'success');
  } else {
    const err = document.getElementById('loginError');
    err.textContent = result.error;
    err.style.display = 'block';
  }
});

/* ============================================================
   SIDEBAR NAV EVENT LISTENERS
   ============================================================ */
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', function () {
    go(this.dataset.view);
  });
});

/* ============================================================
   INIT & AUTO-REFRESH
   ============================================================ */
checkAuth();

/* SMART AUTO-REFRESH
   Polls the backend for changes every 30 seconds, but ONLY re-renders when:
   1. The data has actually changed (fingerprint comparison on pending counts + key data)
   2. The user is NOT actively interacting (no typing in fields, no modal open)
   This prevents the annoying 5-second full-page flicker while still
   catching new customer submissions in a timely manner. */
let lastAdminFingerprint = null;

function isUserInteractingAdmin() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return false;
}

function isModalOpenAdmin() {
  const overlay = document.getElementById('modalOverlay');
  if (overlay && overlay.classList.contains('open')) return true;
  // Also check for any open drawer
  const drawer = document.getElementById('drawerOverlay');
  if (drawer && drawer.classList.contains('open')) return true;
  return false;
}

async function smartRefreshAdmin() {
  // Don't refresh while admin is typing or a modal/drawer is open
  if (isUserInteractingAdmin() || isModalOpenAdmin()) return;

  // Don't refresh if not logged in
  if (document.getElementById('appShell').style.display === 'none') return;

  try {
    // Fetch fresh data
    const [allDb, countRes, walletRes, chatRes] = await Promise.all([
      SummitDB.getAll(),
      SummitDB.getPendingCounts(),
      SummitDB.getCryptoWallets(),
      SummitDB.getAllChats()
    ]);

    // Build fingerprint from counts + key data sizes to detect changes
    const fingerprint = JSON.stringify({
      counts: countRes,
      loans: allDb ? allDb.applications.loans.length : 0,
      cards: allDb ? allDb.applications.cards.length : 0,
      signups: allDb ? allDb.applications.signups.length : 0,
      deposits: allDb ? allDb.applications.deposits.length : 0,
      txns: allDb ? allDb.applications.transactions.length : 0,
      crypto: allDb ? allDb.applications.crypto.length : 0,
      giftcards: allDb ? allDb.applications.giftcards.length : 0,
      customers: allDb ? allDb.customers.length : 0,
      wallets: walletRes ? Object.keys(walletRes).length : 0,
      chats: chatRes ? chatRes.length : 0,
    });

    // Only re-render if something actually changed
    if (fingerprint === lastAdminFingerprint) return;

    lastAdminFingerprint = fingerprint;

    // Update data and re-render
    if (allDb) { db = allDb; }
    if (countRes) { counts = countRes; }
    cachedWallets = walletRes || {};
    cachedChats = chatRes || [];
    updateBadges();
    renderView(currentView);
  } catch (e) {
    console.error('smartRefreshAdmin error:', e);
  }
}

// Initialize fingerprint after first load, then poll every 30 seconds
setTimeout(() => {
  if (counts) {
    lastAdminFingerprint = JSON.stringify({
      counts: counts,
      loans: db ? db.applications.loans.length : 0,
      cards: db ? db.applications.cards.length : 0,
      signups: db ? db.applications.signups.length : 0,
      deposits: db ? db.applications.deposits.length : 0,
      txns: db ? db.applications.transactions.length : 0,
      crypto: db ? db.applications.crypto.length : 0,
      giftcards: db ? db.applications.giftcards.length : 0,
      customers: db ? db.customers.length : 0,
      wallets: Object.keys(cachedWallets).length,
      chats: cachedChats.length,
    });
  }
}, 2000);

setInterval(smartRefreshAdmin, 30000);

/* ============================================================
   VIEW: SETTINGS — Bank-wide configurable settings
   ============================================================ */
function viewSettings() {
  const s = db.settings || {};
  const defDeposit = s.defaultCardSecurityDeposit != null ? s.defaultCardSecurityDeposit : 250;
  const defFee = s.defaultLoanFee != null ? s.defaultLoanFee : 150;
  const feeEnabled = s.loanFeeEnabled !== false;
  const restrictEnabled = s.newUserDepositMethodsEnabled !== false;
  const allowedMethods = s.newUserDepositMethods || ['Crypto Deposit', 'Gift Card Deposit', 'Wire Transfer'];
  const allMethods = ['Crypto Deposit', 'Gift Card Deposit', 'Wire Transfer', 'ACH Transfer', 'Mobile Check Deposit', 'Cash Deposit'];
  const reason = s.newUserDepositRestrictionReason || '';
  const bankName = s.bankName || 'Summit National Bank';
  const bankPhone = s.bankPhone || '';
  const bankEmail = s.bankEmail || '';
  const procTime = s.processingTimeBusinessDays || '3-5 business days';
  const cardProcTime = s.cardProcessingTimeBusinessDays || '7-10 business days';

  let html = '<div class="view-section">';
  html += '<p style="font-size:14px;color:var(--gray-500);margin-bottom:20px">Configure bank-wide defaults for credit card security deposits, loan origination fees, and new user deposit restrictions. These settings apply to all customers and can be adjusted at any time.</p>';

  // Credit Card Settings
  html += '<div class="panel"><div class="panel-header"><h3>Credit Card Settings</h3></div><div class="panel-body" style="padding:24px">';
  html += '<div class="field"><label>Default Security Deposit for New Credit Cards ($)</label><input type="number" id="setCardDeposit" value="' + defDeposit + '" step="50" min="0"><p style="font-size:12px;color:var(--gray-400);margin-top:4px">This amount is pre-filled when approving a new credit card application. The deposit is refundable to the customer and must be paid before the card ships. Enter 0 for no default deposit.</p></div>';
  html += '<div class="field"><label>Card Processing Time (displayed to customers)</label><input type="text" id="setCardProcTime" value="' + esc(cardProcTime) + '" placeholder="e.g. 7-10 business days"></div>';
  html += '</div></div>';

  // Loan Fee Settings
  html += '<div class="panel"><div class="panel-header"><h3>Loan Origination Fee Settings</h3></div><div class="panel-body" style="padding:24px">';
  html += '<div class="field" style="margin-bottom:16px"><label style="display:flex;align-items:center;gap:10px;cursor:pointer"><input type="checkbox" id="setFeeEnabled" ' + (feeEnabled ? 'checked' : '') + ' style="width:18px;height:18px"> <span>Enable loan origination fee (loans stay pending until fee is paid)</span></label></div>';
  html += '<div class="field"><label>Default Loan Origination Fee ($)</label><input type="number" id="setLoanFee" value="' + defFee + '" step="10" min="0"><p style="font-size:12px;color:var(--gray-400);margin-top:4px">This amount is pre-filled when approving a loan. The loan will be placed in "fee pending" status until the fee is confirmed paid, at which point funds are disbursed. Enter 0 for no fee.</p></div>';
  html += '<div class="field"><label>Loan Processing Time (displayed to customers)</label><input type="text" id="setProcTime" value="' + esc(procTime) + '" placeholder="e.g. 3-5 business days"></div>';
  html += '</div></div>';

  // New User Deposit Restrictions
  html += '<div class="panel"><div class="panel-header"><h3>New User Deposit Restrictions</h3></div><div class="panel-body" style="padding:24px">';
  html += '<div class="field" style="margin-bottom:16px"><label style="display:flex;align-items:center;gap:10px;cursor:pointer"><input type="checkbox" id="setRestrictEnabled" ' + (restrictEnabled ? 'checked' : '') + ' style="width:18px;height:18px"> <span>Restrict deposit methods for new users</span></label><p style="font-size:12px;color:var(--gray-400);margin-top:4px">When enabled, new users (fewer than 3 approved transactions and no external withdrawals) can only use the allowed deposit methods below.</p></div>';
  html += '<div class="field"><label>Allowed Deposit Methods for New Users</label><div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:8px">';
  allMethods.forEach(m => {
    const checked = allowedMethods.includes(m) ? 'checked' : '';
    html += '<label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer"><input type="checkbox" class="set-method-chk" value="' + esc(m) + '" ' + checked + ' style="width:16px;height:16px"> ' + esc(m) + '</label>';
  });
  html += '</div></div>';
  html += '<div class="field"><label>Restriction Reason (shown to new users)</label><textarea id="setRestrictReason" rows="4" style="width:100%;padding:10px 14px;border:1px solid var(--gray-300);border-radius:8px;font-size:14px;font-family:inherit" placeholder="Explain why deposit methods are limited for new users...">' + esc(reason) + '</textarea><p style="font-size:12px;color:var(--gray-400);margin-top:4px">This message is displayed to new users on the deposit page when restrictions are active.</p></div>';
  html += '</div></div>';

  // Bank Contact Info
  html += '<div class="panel"><div class="panel-header"><h3>Bank Contact Information</h3></div><div class="panel-body" style="padding:24px">';
  html += '<div class="field"><label>Bank Name</label><input type="text" id="setBankName" value="' + esc(bankName) + '"></div>';
  html += '<div class="field"><label>Customer Service Phone</label><input type="text" id="setBankPhone" value="' + esc(bankPhone) + '" placeholder="e.g. 1-800-555-0142"></div>';
  html += '<div class="field"><label>Customer Service Email</label><input type="text" id="setBankEmail" value="' + esc(bankEmail) + '" placeholder="e.g. support@summitnationalbank.com"></div>';
  html += '</div></div>';

  // Save button
  html += '<div style="margin-top:20px"><button class="btn btn-primary" onclick="saveSettings()" style="padding:12px 32px;font-size:15px">Save All Settings</button></div>';
  html += '</div>';
  return html;
}

async function saveSettings() {
  const allowedMethods = [];
  document.querySelectorAll('.set-method-chk:checked').forEach(cb => allowedMethods.push(cb.value));
  const data = {
    defaultCardSecurityDeposit: parseFloat(document.getElementById('setCardDeposit').value) || 0,
    defaultLoanFee: parseFloat(document.getElementById('setLoanFee').value) || 0,
    loanFeeEnabled: document.getElementById('setFeeEnabled').checked,
    newUserDepositMethodsEnabled: document.getElementById('setRestrictEnabled').checked,
    newUserDepositMethods: allowedMethods,
    newUserDepositRestrictionReason: document.getElementById('setRestrictReason').value.trim(),
    bankName: document.getElementById('setBankName').value.trim(),
    bankPhone: document.getElementById('setBankPhone').value.trim(),
    bankEmail: document.getElementById('setBankEmail').value.trim(),
    processingTimeBusinessDays: document.getElementById('setProcTime').value.trim(),
    cardProcessingTimeBusinessDays: document.getElementById('setCardProcTime').value.trim(),
  };
  const result = await SummitDB.updateSettings(data);
  if (result.ok) { toast('Settings Saved', 'Bank settings updated successfully.', 'success'); refresh(); }
  else { toast('Error', result.error, 'error'); }
}
