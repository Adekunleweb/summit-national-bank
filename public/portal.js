/* ==========================================================================
   Summit National Bank — Customer Portal Logic
   Backend-powered: all data operations go through the API client.
   ========================================================================== */

const $ = (id) => document.getElementById(id);
const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (name) => name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
const fmtDate = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/* ---------- Auth guard ---------- */
const session = SummitDB.getSession();
if (!session || session.type !== 'customer') {
  window.location.href = 'login.html';
}

/* ---------- State ---------- */
let currentView = 'overview';
let cachedData = null;       // cached customer data (refreshed by renderAll)
let cachedWallets = null;     // cached crypto wallets
let isRendering = false;      // prevent overlapping render calls

const viewTitles = {
  overview: 'Overview', accounts: 'My Accounts', cards: 'Credit Cards',
  transactions: 'Transactions', transfer: 'Transfer & Pay', deposit: 'Make a Deposit',
  loan: 'Apply for Loan', cardapp: 'Apply for Card',
  crypto: 'Crypto Deposit', giftcard: 'Gift Card Deposit', chat: 'Live Chat', settings: 'Settings',
};

/* ---------- Navigation ---------- */
function go(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $('view-' + view).classList.add('active');
  document.querySelectorAll('.dnav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  $('pageTitle').textContent = viewTitles[view] || view;
  if (window.innerWidth <= 860) $('sidebar').classList.remove('open');
  window.scrollTo(0, 0);
}
document.querySelectorAll('.dnav-item').forEach(n => n.addEventListener('click', () => go(n.dataset.view)));

function logout() { SummitDB.logout(); window.location.href = 'login.html'; }

/* ---------- Toast ---------- */
function toast(kind, msg) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = '<span>' + (kind === 'success' ? '✓' : '✕') + '</span><span>' + msg + '</span>';
  $('toastWrap').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(120%)'; setTimeout(() => el.remove(), 250); }, 3500);
}
function showError(boxId, msg) {
  const b = $(boxId); if (!b) return;
  b.textContent = msg; b.classList.add('show');
  setTimeout(() => b.classList.remove('show'), 5000);
}

/* ---------- Modal ---------- */
function showModal(title, body) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = body;
  $('modalOverlay').classList.add('open');
}
function closeModal() { $('modalOverlay').classList.remove('open'); }

/* ==========================================================================
   RENDER — async, fetches from backend
   ========================================================================== */
async function renderAll() {
  if (isRendering) return;
  isRendering = true;
  try {
    const d = await SummitDB.getCustomerData(session.customerId);
    if (!d) {
      SummitDB.logout();
      window.location.href = 'login.html';
      return;
    }
    cachedData = d;

    // fetch crypto wallets if not cached
    if (!cachedWallets) {
      cachedWallets = await SummitDB.getCryptoWallets();
    }

    // user info
    $('userAv').textContent = initials(d.customer.name);
    $('userName').textContent = d.customer.name;
    $('userEmail').textContent = d.customer.email;
    $('greeting').textContent = 'Welcome back, ' + d.customer.name.split(' ')[0];
    const hour = new Date().getHours();
    $('greetingSub').textContent = (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') + ' — here\'s a summary of your accounts.';

    // notification ping if any pending
    const hasPending = d.pendingLoans.length + d.pendingCards.length + d.pendingDeposits.length + d.pendingTxns.length + d.pendingCrypto.length + d.pendingGiftcards.length > 0;
    $('notifPing').style.display = hasPending ? 'block' : 'none';

    // chat badge (unread replies from admin)
    const cb = $('chatBadgeCust');
    if (cb) {
      if (d.chatUnread > 0) { cb.style.display = 'inline-block'; cb.textContent = d.chatUnread; }
      else { cb.style.display = 'none'; }
    }

    renderAccounts(d);
    renderOverviewTxns(d);
    renderCards(d);
    renderTxns(d);
    renderPendingBanners(d);
    renderBankingServices(d);
    renderDepositView(d);
    populateAccountDropdowns(d);
    renderCryptoView(d);
    renderGiftCardView(d);
    renderChatView(d);
    renderSettingsView(d);
  } catch (e) {
    console.error('renderAll error:', e);
  } finally {
    isRendering = false;
  }
}

function acctCardHTML(a, featured) {
  return `<div class="acct-card ${featured ? 'featured' : ''}">
    <div class="ac-top"><span class="ac-type">${esc(a.type)}</span><span class="badge ${a.status === 'active' ? 'badge-approved' : 'badge-neutral'}">${a.status}</span></div>
    <div class="ac-bal">${money(a.balance)}</div>
    <div class="ac-num">Account ••••${a.acctNo.slice(-4)}</div>
  </div>`;
}

function renderAccounts(d) {
  const html = d.accounts.length ? d.accounts.map((a, i) => acctCardHTML(a, i === 0)).join('') : emptyState('No accounts yet', 'Your accounts will appear here once your application is approved.');
  $('overviewAccounts').innerHTML = html;
  $('accountsGrid').innerHTML = html;
}

function renderOverviewTxns(d) {
  const recent = d.txns.slice(0, 6);
  $('overviewTxns').innerHTML = recent.length ? recent.map(t => txnRow(t, true)).join('') : `<tr><td colspan="4"><div class="empty"><div class="em-ic">📋</div><h4>No transactions yet</h4><p>Your transaction history will appear here.</p></div></td></tr>`;
}

function txnRow(t, simple) {
  const dir = t.direction === 'in' ? 'pos' : 'neg';
  const sign = t.direction === 'in' ? '+' : '−';
  if (simple) {
    return `<tr><td><div class="cell-strong">${esc(t.recipient)}</div><div class="cell-sub">${esc(t.type)}</div></td><td>${esc(t.type)}</td><td class="cell-sub">${fmtDate(t.date)}</td><td style="text-align:right"><span class="amount ${dir}">${sign}${money(t.amount)}</span></td></tr>`;
  }
  return `<tr><td><div class="cell-strong">${esc(t.recipient)}</div></td><td>${esc(t.type)}</td><td class="mono">${esc(t.ref)}</td><td class="cell-sub">${fmtDate(t.date)}</td><td style="text-align:right"><span class="amount ${dir}">${sign}${money(t.amount)}</span></td></tr>`;
}

function renderTxns(d) {
  $('txnsTable').innerHTML = d.txns.length ? d.txns.map(t => txnRow(t, false)).join('') : `<tr><td colspan="5"><div class="empty"><div class="em-ic">📋</div><h4>No transactions yet</h4><p>Your completed transactions will appear here.</p></div></td></tr>`;

  const pending = d.pendingTxns;
  if (pending.length) {
    $('pendingTxnsPanel').style.display = 'block';
    $('pendingTxnsTable').innerHTML = pending.map(t => `<tr>
      <td><span class="cell-strong">${esc(t.type)}</span></td>
      <td>${esc(t.recipient)}</td>
      <td class="mono">${esc(t.ref)}</td>
      <td><span class="amount neg">${money(t.amount)}</span></td>
      <td><span class="badge badge-pending">Processing</span></td>
    </tr>`).join('');
  } else {
    $('pendingTxnsPanel').style.display = 'none';
  }
}

function renderCards(d) {
  // Security deposit summary banner
  const cardsWithDeposit = d.cards.filter(c => Number(c.securityDeposit || 0) > 0);
  const unpaidDeposits = cardsWithDeposit.filter(c => c.depositStatus !== 'paid');
  const totalUnpaid = unpaidDeposits.reduce((s, c) => s + Number(c.securityDeposit), 0);
  if ($('cardsDepositSummary')) {
    if (unpaidDeposits.length > 0) {
      $('cardsDepositSummary').innerHTML = `<div style="margin-bottom:18px;padding:18px 22px;border-radius:14px;background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1px solid #fcd34d;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="width:46px;height:46px;border-radius:12px;background:#d97706;display:grid;place-items:center;color:#fff;font-size:22px;flex-shrink:0">🔒</div>
        <div style="flex:1;min-width:220px">
          <div style="font-weight:800;color:#92400e;font-size:16px">Refundable Security Deposit Required</div>
          <div style="font-size:13px;color:#78350f;margin-top:3px;line-height:1.5">You have <b>${unpaidDeposits.length}</b> credit card${unpaidDeposits.length > 1 ? 's' : ''} with a refundable security deposit of <b>${money(totalUnpaid)}</b> outstanding. Your card${unpaidDeposits.length > 1 ? 's' : ''} will be shipped once the deposit${unpaidDeposits.length > 1 ? 's are' : ' is'} received and confirmed. This deposit is fully refundable.</div>
        </div>
      </div>`;
    } else {
      $('cardsDepositSummary').innerHTML = '';
    }
  }
  if (!d.cards.length) {
    $('cardsContainer').innerHTML = `<div class="panel"><div class="empty"><div class="em-ic">💳</div><h4>No credit cards yet</h4><p>You don't have any active credit cards. <a href="#" onclick="go('cardapp');return false" style="color:var(--blue-500);font-weight:600">Apply for one →</a></p></div></div>`;
    return;
  }
  $('cardsContainer').innerHTML = d.cards.map(c => {
    const dep = Number(c.securityDeposit || 0);
    let depositSection = '';
    if (dep > 0) {
      const paid = c.depositStatus === 'paid';
      depositSection = `
        <div style="margin-top:16px;padding:18px;border-radius:12px;background:${paid ? 'var(--green-50, #ecfdf5)' : 'var(--amber-50, #fffbeb)'};border:1px solid ${paid ? '#a7f3d0' : '#fcd34d'}">
          <div style="display:flex;align-items:center;gap:10px;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:38px;height:38px;border-radius:10px;background:${paid ? '#059669' : '#d97706'};display:grid;place-items:center;color:#fff;font-size:18px">${paid ? '✓' : '🔒'}</div>
              <div>
                <div style="font-size:13px;color:${paid ? '#065f46' : '#92400e'};font-weight:700;text-transform:uppercase;letter-spacing:.5px">Refundable Security Deposit ${paid ? '— Received' : 'Required'}</div>
                <div style="font-size:22px;font-weight:800;color:${paid ? '#059669' : '#92400e'};margin-top:2px">${money(dep)}</div>
              </div>
            </div>
            <div style="text-align:right">
              ${paid
                ? `<div style="font-size:13px;color:#065f46;font-weight:600">✓ Deposit confirmed</div><div style="font-size:12px;color:#059669;margin-top:2px">Your card has been shipped ✓</div>`
                : `<div style="font-size:13px;color:#92400e;font-weight:600">⚠ Payment required</div><div style="font-size:12px;color:#78350f;margin-top:2px">Your card will ship once the deposit is received</div>`}
            </div>
          </div>
          ${paid ? '' : `<div style="margin-top:14px;padding-top:14px;border-top:1px dashed #fcd34d;font-size:13px;color:#78350f;line-height:1.6">A refundable security deposit of <b>${money(dep)}</b> is required before your debit card can be shipped to your address on file. This deposit is fully refundable and will be returned to you per the terms of your card agreement. Please contact our customer support team or visit any Summit National Bank branch to arrange payment of your refundable security deposit. Once received and confirmed, your card will be dispatched within 7–10 business days.</div>`}
        </div>`;
    }
    return `
    <div class="panel" style="max-width:420px">
      <div style="padding:24px">
        <div class="ccard-vis">
          <div class="cv-top"><div class="cv-bank">Summit National</div><div class="cv-brand">VISA</div></div>
          <div class="cv-chip"></div>
          <div class="cv-no">${c.cardNo.replace(/(.{4})/g, '$1 ').trim()}</div>
          <div class="cv-row">
            <div><div class="cv-l">Cardholder</div><div class="cv-v">${esc(c.name.toUpperCase())}</div></div>
            <div><div class="cv-l">Expires</div><div class="cv-v">${c.expiry}</div></div>
            <div><div class="cv-l">Status</div><div class="cv-v" style="color:#4ade80">${c.status}</div></div>
          </div>
        </div>
        <div style="margin-top:18px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px">
          <div><div style="font-size:11px;color:var(--gray-400);text-transform:uppercase">Card type</div><div style="font-size:14px;font-weight:700;color:var(--navy-900);margin-top:3px">${esc(c.cardType)}</div></div>
          <div><div style="font-size:11px;color:var(--gray-400);text-transform:uppercase">Credit limit</div><div style="font-size:14px;font-weight:700;color:var(--navy-900);margin-top:3px">${money(c.limit)}</div></div>
          <div><div style="font-size:11px;color:var(--gray-400);text-transform:uppercase">Available</div><div style="font-size:14px;font-weight:700;color:var(--green-600);margin-top:3px">${money(c.limit - c.balance)}</div></div>
        </div>
        ${depositSection}
      </div>
    </div>`;
  }).join('');
}

function renderPendingBanners(d) {
  const items = [];
  if (d.pendingTxns.length) items.push({ icon: '⇄', txt: `<b>${d.pendingTxns.length} transfer request(s)</b> in processing`, view: 'transactions' });
  if (d.pendingDeposits.length) items.push({ icon: '📥', txt: `<b>${d.pendingDeposits.length} deposit(s)</b> under review`, view: 'deposit' });
  if (d.pendingLoans.length) items.push({ icon: '🏦', txt: `<b>${d.pendingLoans.length} loan application(s)</b> in underwriting review`, view: 'loan' });
  if (d.pendingCards.length) items.push({ icon: '💳', txt: `<b>${d.pendingCards.length} credit card application(s)</b> in processing`, view: 'cardapp' });
  if (d.feePendingLoans && d.feePendingLoans.length) items.push({ icon: '💳', txt: `<b>${d.feePendingLoans.length} approved loan(s)</b> awaiting origination fee payment`, view: 'loan' });
  $('pendingBanners').innerHTML = items.map(i => `<div class="pending-banner"><span class="pb-ic">${i.icon}</span><span class="pb-txt">${i.txt}</span><button class="btn btn-ghost btn-sm" onclick="go('${i.view}')">View</button></div>`).join('');
}

/* ==========================================================================
   BANKING SERVICES OVERVIEW — combined credit card + loan status cards
   ========================================================================== */
function renderBankingServices(d) {
  const wrap = $('bankingServices');
  if (!wrap) return;

  // --- CREDIT CARD STATUS ---
  let cardHTML = '';
  if (d.cards.length > 0) {
    cardHTML = d.cards.map(c => {
      const dep = Number(c.securityDeposit || 0);
      const depPending = dep > 0 && c.depositStatus !== 'paid';
      return `<div class="svc-item">
        <div class="svc-item-top">
          <div class="svc-icon svc-blue">💳</div>
          <div class="svc-info">
            <div class="svc-title">${esc(c.cardType)}</div>
            <div class="svc-sub">••••${esc(String(c.cardNo).slice(-4))} · Limit ${money(c.limit)}</div>
          </div>
          <span class="svc-badge svc-badge-ok">Active</span>
        </div>
        ${depPending ? `<div class="svc-note svc-note-warn">🔒 Refundable security deposit of ${money(dep)} required before card ships</div>` : ''}
      </div>`;
    }).join('');
  } else if (d.pendingCards.length > 0) {
    cardHTML = d.pendingCards.map(c => `<div class="svc-item">
      <div class="svc-item-top">
        <div class="svc-icon svc-blue">💳</div>
        <div class="svc-info">
          <div class="svc-title">${esc(c.cardType)}</div>
          <div class="svc-sub">Application ${esc(c.id)} · In processing</div>
        </div>
        <span class="svc-badge svc-badge-pending">Processing</span>
      </div>
      <div class="svc-note">Your application is under review. You will be notified once a decision is made.</div>
    </div>`).join('');
  } else {
    cardHTML = `<div class="svc-item svc-empty">
      <div class="svc-icon svc-blue">💳</div>
      <div class="svc-info">
        <div class="svc-title">No Credit Card</div>
        <div class="svc-sub">Apply for a Summit credit card today</div>
      </div>
      <button class="btn btn-blue btn-sm" onclick="go('cardapp')">Apply →</button>
    </div>`;
  }

  // --- LOAN STATUS ---
  let loanHTML = '';
  const feePending = d.feePendingLoans || [];
  if (feePending.length > 0) {
    loanHTML = feePending.map(l => `<div class="svc-item">
      <div class="svc-item-top">
        <div class="svc-icon svc-amber">🏦</div>
        <div class="svc-info">
          <div class="svc-title">${esc(l.type)} — Approved</div>
          <div class="svc-sub">${money(l.amount)} · Ref ${esc(l.id)}</div>
        </div>
        <span class="svc-badge svc-badge-warn">Fee Required</span>
      </div>
      <div class="svc-note svc-note-warn">
        <div style="font-weight:700;color:#92400e;margin-bottom:4px">Loan Origination Fee: ${money(l.loanFee)}</div>
        <div style="line-height:1.6">Your loan has been approved by our underwriting team. A one-time loan origination fee of <b>${money(l.loanFee)}</b> is required before the funds of <b>${money(l.amount)}</b> can be disbursed to your checking account. Please contact our loan department or visit any branch to arrange payment. Once the fee is confirmed, your funds will be released within 1–2 business days.</div>
      </div>
    </div>`).join('');
  } else if (d.pendingLoans.length > 0) {
    loanHTML = d.pendingLoans.map(l => `<div class="svc-item">
      <div class="svc-item-top">
        <div class="svc-icon svc-amber">🏦</div>
        <div class="svc-info">
          <div class="svc-title">${esc(l.type)}</div>
          <div class="svc-sub">${money(l.amount)} · Ref ${esc(l.id)}</div>
        </div>
        <span class="svc-badge svc-badge-pending">Under Review</span>
      </div>
      <div class="svc-note">Your loan application is currently in underwriting review. Our team is evaluating your request and you will be notified of the decision.</div>
    </div>`).join('');
  } else {
    const approvedLoanTxns = d.txns.filter(t => t.type === 'Loan Disbursement');
    if (approvedLoanTxns.length > 0) {
      loanHTML = `<div class="svc-item">
        <div class="svc-item-top">
          <div class="svc-icon svc-green">🏦</div>
          <div class="svc-info">
            <div class="svc-title">Loan Active</div>
            <div class="svc-sub">${approvedLoanTxns.length} loan(s) disbursed to your account</div>
          </div>
          <span class="svc-badge svc-badge-ok">Disbursed</span>
        </div>
      </div>`;
    } else {
      loanHTML = `<div class="svc-item svc-empty">
        <div class="svc-icon svc-amber">🏦</div>
        <div class="svc-info">
          <div class="svc-title">No Active Loan</div>
          <div class="svc-sub">Apply for a home, auto, or personal loan</div>
        </div>
        <button class="btn btn-blue btn-sm" onclick="go('loan')">Apply →</button>
      </div>`;
    }
  }

  wrap.innerHTML = `
    <div class="svc-grid">
      <div class="svc-card">
        <div class="svc-card-head"><h3>💳 Credit Card</h3><button class="btn btn-ghost btn-sm" onclick="go('cards')">Manage →</button></div>
        <div class="svc-card-body">${cardHTML}</div>
      </div>
      <div class="svc-card">
        <div class="svc-card-head"><h3>🏦 Loans</h3><button class="btn btn-ghost btn-sm" onclick="go('loan')">Apply →</button></div>
        <div class="svc-card-body">${loanHTML}</div>
      </div>
    </div>`;
}

function emptyState(title, sub) {
  return `<div class="panel"><div class="empty"><div class="em-ic">💳</div><h4>${title}</h4><p>${sub}</p></div></div>`;
}

/* ---------- Populate dropdowns ---------- */
function populateAccountDropdowns(d) {
  const opts = d.accounts.map(a => `<option value="${a.id}">${esc(a.type)} ••••${a.acctNo.slice(-4)} — ${money(a.balance)}</option>`).join('');
  $('transferFrom').innerHTML = opts;
  $('depositTo').innerHTML = opts;
  if ($('cryptoToAccount')) $('cryptoToAccount').innerHTML = opts || '<option value="">No accounts available</option>';
  if ($('giftToAccount')) $('giftToAccount').innerHTML = opts || '<option value="">No accounts available</option>';
}

/* ==========================================================================
   DEPOSIT VIEW — new user deposit restriction
   ========================================================================== */
function renderDepositView(d) {
  const sel = $('depositType');
  if (!sel) return;
  const settings = d.settings || {};
  const restrict = d.isNewUser && settings.newUserDepositMethodsEnabled !== false;
  const allOptions = [
    { value: 'ACH Transfer', label: 'ACH Transfer' },
    { value: 'Wire Transfer', label: 'Wire Transfer' },
    { value: 'Mobile Check Deposit', label: 'Mobile Check Deposit' },
    { value: 'Cash Deposit', label: 'Cash Deposit (at branch)' },
  ];
  if (restrict) {
    const allowed = settings.newUserDepositMethods || ['Crypto Deposit', 'Gift Card Deposit', 'Wire Transfer'];
    // Only show wire transfer from the standard options (crypto & gift card are separate nav items)
    const standardAllowed = allOptions.filter(o => allowed.includes(o.value));
    sel.innerHTML = standardAllowed.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
    // Show restriction notice
    let notice = $('depositRestrictionNotice');
    if (!notice) {
      const panel = sel.closest('.panel');
      if (panel) {
        notice = document.createElement('div');
        notice.id = 'depositRestrictionNotice';
        // Insert before the first form field, or at the top of the panel body
        const panelBody = panel.querySelector('.panel-body') || panel;
        const firstField = panelBody.querySelector('.field, .form-row, [style*="padding"]');
        if (firstField) {
          panelBody.insertBefore(notice, firstField);
        } else {
          panelBody.prepend(notice);
        }
      }
    }
    if (notice) {
      notice.innerHTML = `<div style="margin-bottom:18px;padding:18px 22px;border-radius:14px;background:linear-gradient(135deg,#eff6ff,#dbeafe);border:1px solid #93c5fd;display:flex;align-items:flex-start;gap:16px">
        <div style="width:46px;height:46px;border-radius:12px;background:#2563eb;display:grid;place-items:center;color:#fff;font-size:22px;flex-shrink:0">ℹ</div>
        <div style="flex:1">
          <div style="font-weight:800;color:#1e3a8a;font-size:15px;margin-bottom:6px">Deposit Method Restrictions</div>
          <div style="font-size:13px;color:#1e40af;line-height:1.7">${esc(settings.newUserDepositRestrictionReason || 'Some deposit methods are currently restricted for your account.')}</div>
          <div style="margin-top:10px;font-size:13px;color:#1e40af"><b>Available deposit methods:</b> ${allowed.map(a => esc(a)).join(', ')}. You can access these from the Crypto Deposit and Gift Card Deposit tabs, or use Wire Transfer below.</div>
        </div>
      </div>`;
      notice.style.display = 'block';
    }
  } else {
    sel.innerHTML = allOptions.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
    const notice = $('depositRestrictionNotice');
    if (notice) notice.style.display = 'none';
  }
}

/* ==========================================================================
   FORM SUBMISSIONS — all async
   ========================================================================== */
async function submitTransfer() {
  const data = {
    customerId: session.customerId,
    fromAcctId: $('transferFrom').value,
    type: $('transferType').value,
    recipient: $('transferRecipient').value.trim(),
    amount: parseFloat($('transferAmount').value) || 0,
    ref: $('transferRef').value.trim(),
    direction: 'out',
  };
  if (!cachedData) { showError('transferErr', 'Loading… please try again.'); return; }
  data.name = cachedData.customer.name;
  if (!data.fromAcctId) { showError('transferErr', 'Please select an account to transfer from.'); return; }
  if (!data.recipient) { showError('transferErr', 'Please enter a recipient.'); return; }
  if (data.amount <= 0) { showError('transferErr', 'Please enter a valid amount.'); return; }
  const acct = cachedData.accounts.find(a => a.id === data.fromAcctId);
  if (data.amount > acct.balance) { showError('transferErr', 'Insufficient funds. Your balance is ' + money(acct.balance) + '.'); return; }
  const res = await SummitDB.submitTransaction(data);
  if (!res.ok) { showError('transferErr', res.error); return; }
  toast('success', 'Transfer submitted for approval!');
  showModal('Transfer Submitted', `<div style="font-size:14px;line-height:1.7;color:var(--gray-700)">
    <p style="margin-bottom:14px">Your transfer request has been received and is now being processed by our payments team. Transfers are typically completed within 1–2 business days. You will receive an email confirmation once the transfer has been processed. Your reference number is shown below for your records.</p>
    <div style="background:var(--gray-50);padding:14px;border-radius:10px;font-size:13px">
      <div><b>Reference:</b> ${esc(res.id)}</div>
      <div><b>Type:</b> ${esc(data.type)}</div>
      <div><b>Amount:</b> ${money(data.amount)}</div>
      <div><b>Recipient:</b> ${esc(data.recipient)}</div>
    </div>
  </div>`);
  // clear form
  $('transferRecipient').value = ''; $('transferAmount').value = ''; $('transferRef').value = '';
  renderAll();
}

async function submitDepositRequest() {
  const data = {
    customerId: session.customerId,
    acctId: $('depositTo').value,
    depType: $('depositType').value,
    amount: parseFloat($('depositAmount').value) || 0,
    source: $('depositSource').value.trim(),
  };
  if (!cachedData) { showError('depositErr', 'Loading… please try again.'); return; }
  data.name = cachedData.customer.name;
  if (!data.acctId) { showError('depositErr', 'Please select an account.'); return; }
  if (data.amount <= 0) { showError('depositErr', 'Please enter a valid amount.'); return; }
  if (!data.source) { showError('depositErr', 'Please describe the deposit source.'); return; }
  const res = await SummitDB.submitDeposit(data);
  if (!res.ok) { showError('depositErr', res.error); return; }
  toast('success', 'Deposit request submitted!');
  showModal('Deposit Request Submitted', `<div style="font-size:14px;line-height:1.7;color:var(--gray-700)">
    <p style="margin-bottom:14px">Your deposit request has been received and is being processed. Funds will be credited to your account once verification is complete, typically within 1–2 business days. Your reference number is shown below for your records.</p>
    <div style="background:var(--gray-50);padding:14px;border-radius:10px;font-size:13px">
      <div><b>Reference:</b> ${esc(res.id)}</div>
      <div><b>Type:</b> ${esc(data.depType)}</div>
      <div><b>Amount:</b> ${money(data.amount)}</div>
      <div><b>Source:</b> ${esc(data.source)}</div>
    </div>
  </div>`);
  $('depositAmount').value = ''; $('depositSource').value = '';
  renderAll();
}

async function submitLoanApp() {
  if (!cachedData) { showError('loanErr', 'Loading… please try again.'); return; }
  const data = {
    customerId: session.customerId, name: cachedData.customer.name, email: cachedData.customer.email,
    type: $('loanType').value, amount: parseFloat($('loanAmount').value) || 0,
    rate: { 'Home Mortgage': 6.12, 'Auto Loan': 5.49, 'Personal Loan': 8.99, 'Home Equity Loan': 7.25 }[$('loanType').value] || 6.0,
    term: parseInt($('loanTerm').value),
    income: parseFloat($('loanIncome').value) || 0,
    score: parseInt($('loanScore').value) || 0,
    purpose: $('loanPurpose').value.trim(),
  };
  if (data.amount <= 0) { showError('loanErr', 'Please enter a valid loan amount.'); return; }
  if (data.income <= 0) { showError('loanErr', 'Please enter your annual income.'); return; }
  const res = await SummitDB.submitLoan(data);
  if (!res.ok) { showError('loanErr', res.error); return; }
  toast('success', 'Loan application received — underwriting review started');
  showModal('Loan Application Received', `<div style="font-size:14px;line-height:1.7;color:var(--gray-700)">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:14px 18px;border-radius:12px;background:linear-gradient(135deg,#eff6ff,#dbeafe);border:1px solid #93c5fd">
      <div style="width:44px;height:44px;border-radius:12px;background:#2563eb;display:grid;place-items:center;color:#fff;font-size:20px;flex-shrink:0">✓</div>
      <div><div style="font-weight:800;color:#1e3a8a;font-size:15px">Application Successfully Submitted</div><div style="font-size:13px;color:#1e40af">Status: In Underwriting Review</div></div>
    </div>
    <p style="margin-bottom:14px">Thank you for applying with Summit National Bank. Your loan application has been received and assigned to our underwriting team for review. During this process, we will verify your income, credit history, and the information provided in your application. You can expect a decision within 3–5 business days. Once approved, you will receive an email with your loan terms and next steps. Please keep your reference number for your records — you may be asked to provide it when contacting our loan department.</p>
    <div style="background:var(--gray-50);padding:16px;border-radius:10px;font-size:13px;margin-bottom:14px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--gray-400);margin-bottom:8px;font-weight:700">Application Details</div>
      <div><b>Application Reference:</b> <span class="mono" style="color:var(--navy-900);font-weight:700">${esc(res.id)}</span></div>
      <div><b>Loan type:</b> ${esc(data.type)}</div>
      <div><b>Amount:</b> ${money(data.amount)}</div>
      <div><b>Term:</b> ${data.term} years</div>
      <div><b>Est. rate:</b> ${data.rate}% APR</div>
      <div><b>Date submitted:</b> ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
    </div>
    <div style="font-size:13px;color:var(--gray-500);border-top:1px solid var(--gray-100);padding-top:14px">
      <b style="color:var(--gray-700)">What happens next:</b><br>
      1. Our underwriting team reviews your application (3–5 business days)<br>
      2. You receive an email notification with the decision<br>
      3. If approved, a loan origination fee may apply before disbursement<br>
      4. Loan funds are disbursed to your checking account
    </div>
  </div>`);
  $('loanAmount').value = ''; $('loanIncome').value = ''; $('loanScore').value = ''; $('loanPurpose').value = '';
  renderAll();
}

/* ---- Card application selfie capture ---- */
let cardSelfieStream = null;
let cardSelfieData = null;

function startCardSelfie() {
  const box = $('cardSelfieBox');
  const video = $('cardSelfieVideo');
  const placeholder = $('cardSelfiePlaceholder');
  const img = $('cardSelfieImg');
  const start = $('cardSelfieStart');
  const controls = $('cardSelfieControls');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showError('cardErr', 'Camera not available. Please use the Upload photo option.');
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
    .then(function(stream) {
      cardSelfieStream = stream;
      video.srcObject = stream;
      video.style.display = 'block';
      img.style.display = 'none';
      placeholder.style.display = 'none';
      start.style.display = 'none';
      controls.style.display = 'flex';
      $('cardSnapBtn').style.display = '';
      $('cardRetakeBtn').style.display = 'none';
    })
    .catch(function() {
      showError('cardErr', 'Could not access camera. Please use the Upload photo option.');
    });
}

function captureCardSelfie() {
  const video = $('cardSelfieVideo');
  if (!video.videoWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  cardSelfieData = canvas.toDataURL('image/jpeg', 0.8);
  stopCardSelfieStream();
  showCardSelfiePreview(cardSelfieData);
}

function stopCardSelfieStream() {
  if (cardSelfieStream) {
    cardSelfieStream.getTracks().forEach(function(t) { t.stop(); });
    cardSelfieStream = null;
  }
}

function handleCardSelfieUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    cardSelfieData = e.target.result;
    stopCardSelfieStream();
    showCardSelfiePreview(cardSelfieData);
  };
  reader.readAsDataURL(file);
}

function showCardSelfiePreview(src) {
  const video = $('cardSelfieVideo');
  const img = $('cardSelfieImg');
  const placeholder = $('cardSelfiePlaceholder');
  const controls = $('cardSelfieControls');
  video.style.display = 'none';
  img.src = src;
  img.style.display = 'block';
  placeholder.style.display = 'none';
  $('cardSnapBtn').style.display = 'none';
  $('cardRetakeBtn').style.display = '';
  controls.style.display = 'flex';
}

function retakeCardSelfie() {
  cardSelfieData = null;
  const img = $('cardSelfieImg');
  const video = $('cardSelfieVideo');
  const placeholder = $('cardSelfiePlaceholder');
  const controls = $('cardSelfieControls');
  const start = $('cardSelfieStart');
  img.style.display = 'none';
  video.style.display = 'none';
  placeholder.style.display = '';
  controls.style.display = 'none';
  start.style.display = 'flex';
}

async function submitCardApp() {
  if (!cachedData) { showError('cardErr', 'Loading… please try again.'); return; }
  const data = {
    customerId: session.customerId, name: cachedData.customer.name, email: cachedData.customer.email,
    cardType: $('cardTypeApp').value,
    reqLimit: parseFloat($('cardLimit').value) || 0,
    income: parseFloat($('cardIncome').value) || 0,
    score: parseInt($('cardScore').value) || 0,
    existingDebt: parseFloat($('cardDebt').value) || 0,
    selfie: cardSelfieData || null,
  };
  if (data.reqLimit < 500) { showError('cardErr', 'Please request a credit limit of at least $500.'); return; }
  if (data.income <= 0) { showError('cardErr', 'Please enter your annual income.'); return; }
  if (!data.selfie) { showError('cardErr', 'Please take or upload a selfie for identity verification.'); return; }
  const res = await SummitDB.submitCardApp(data);
  if (!res.ok) { showError('cardErr', res.error); return; }
  toast('success', 'Credit card application received — credit review started');
  showModal('Credit Card Application Received', `<div style="font-size:14px;line-height:1.7;color:var(--gray-700)">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:14px 18px;border-radius:12px;background:linear-gradient(135deg,#eff6ff,#dbeafe);border:1px solid #93c5fd">
      <div style="width:44px;height:44px;border-radius:12px;background:#2563eb;display:grid;place-items:center;color:#fff;font-size:20px;flex-shrink:0">✓</div>
      <div><div style="font-weight:800;color:#1e3a8a;font-size:15px">Application Successfully Submitted</div><div style="font-size:13px;color:#1e40af">Status: In Credit Department Review</div></div>
    </div>
    <p style="margin-bottom:14px">Thank you for applying for a Summit National Bank credit card. Your application has been received and assigned to our credit department for review. During this process, we will verify your identity, evaluate your credit history, income, and existing debt obligations. You can expect a decision within 5–7 business days. Once approved, your card will be issued and shipped to your address on file along with your cardholder agreement. Please keep your reference number for your records — our team may request it when contacting you about your application.</p>
    <div style="background:var(--gray-50);padding:16px;border-radius:10px;font-size:13px;margin-bottom:14px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--gray-400);margin-bottom:8px;font-weight:700">Application Details</div>
      <div><b>Application Reference:</b> <span class="mono" style="color:var(--navy-900);font-weight:700">${esc(res.id)}</span></div>
      <div><b>Card type:</b> ${esc(data.cardType)}</div>
      <div><b>Requested limit:</b> ${money(data.reqLimit)}</div>
      <div><b>Date submitted:</b> ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
    </div>
    <div style="font-size:13px;color:var(--gray-500);border-top:1px solid var(--gray-100);padding-top:14px">
      <b style="color:var(--gray-700)">What happens next:</b><br>
      1. Our credit department reviews your application (5–7 business days)<br>
      2. You receive an email notification with the decision<br>
      3. If approved, a security deposit may be required before card issuance<br>
      4. Your card is issued and shipped to your address on file
    </div>
  </div>`);
  $('cardLimit').value = ''; $('cardIncome').value = ''; $('cardScore').value = ''; $('cardDebt').value = '';
  retakeCardSelfie();
  renderAll();
}

/* ==========================================================================
   CRYPTO DEPOSIT
   ========================================================================== */
function renderCryptoView(d) {
  const sel = $('cryptoCoin');
  if (!sel) return;
  const wallets = cachedWallets || {};
  const coins = Object.keys(wallets);
  if (!coins.length) {
    sel.innerHTML = '<option value="">No wallets configured</option>';
    return;
  }
  // preserve selection if still valid
  const prev = sel.value;
  sel.innerHTML = coins.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if (prev && coins.includes(prev)) sel.value = prev;
  updateCryptoWalletDisplay();
  // pending deposits
  const pend = d.pendingCrypto;
  if (pend.length) {
    $('cryptoPendingWrap').style.display = 'block';
    $('cryptoPending').innerHTML = pend.map(c => `<tr><td><b>${esc(c.coin)}</b></td><td>${money(c.amount)}</td><td class="mono" style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${esc(c.txnHash || '—')}</td><td><span class="badge badge-pending">Awaiting confirmation</span></td></tr>`).join('');
  } else {
    $('cryptoPendingWrap').style.display = 'none';
  }
}

function updateCryptoWalletDisplay() {
  const coin = $('cryptoCoin').value;
  const wallets = cachedWallets || {};
  const w = wallets[coin];
  if (w) {
    $('cryptoWallet').value = w.address;
    $('cryptoNetwork').value = w.network || '';
  } else {
    $('cryptoWallet').value = '';
    $('cryptoNetwork').value = '';
  }
}

function copyWallet() {
  const addr = $('cryptoWallet').value;
  if (!addr) { toast('error', 'No wallet address to copy.'); return; }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(addr).then(() => toast('success', 'Wallet address copied!')).catch(() => fallbackCopy(addr));
  } else {
    fallbackCopy(addr);
  }
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('success', 'Wallet address copied!'); } catch (e) { toast('error', 'Could not copy. Please copy manually.'); }
  document.body.removeChild(ta);
}

async function submitCryptoDeposit() {
  if (!cachedData) { showError('cryptoErr', 'Loading… please try again.'); return; }
  const data = {
    customerId: session.customerId, name: cachedData.customer.name, email: cachedData.customer.email,
    coin: $('cryptoCoin').value,
    amount: parseFloat($('cryptoAmount').value) || 0,
    walletAddress: $('cryptoWallet').value,
    network: $('cryptoNetwork') ? $('cryptoNetwork').value : '',
    txnHash: $('cryptoHash').value.trim(),
    toAccount: $('cryptoToAccount').value,
  };
  if (!data.coin) { showError('cryptoErr', 'Please select a cryptocurrency.'); return; }
  if (data.amount <= 0) { showError('cryptoErr', 'Please enter a valid USD amount.'); return; }
  if (!data.walletAddress) { showError('cryptoErr', 'No wallet address available. Please contact support.'); return; }
  const res = await SummitDB.submitCryptoDeposit(data);
  if (!res.ok) { showError('cryptoErr', res.error); return; }
  toast('success', 'Crypto deposit submitted for confirmation!');
  showModal('Crypto Deposit Submitted', `<div style="font-size:14px;line-height:1.7;color:var(--gray-700)">
    <p style="margin-bottom:14px">Your crypto deposit has been submitted for blockchain verification. Our team will confirm the transaction on the blockchain network, typically within 30–60 minutes after the required network confirmations are complete. Once verified, the USD value will be credited to your selected account. Your reference number is shown below for your records.</p>
    <div style="background:var(--gray-50);padding:14px;border-radius:10px;font-size:13px">
      <div><b>Reference:</b> ${esc(res.id)}</div>
      <div><b>Coin:</b> ${esc(data.coin)}</div>
      <div><b>Amount (USD):</b> ${money(data.amount)}</div>
      <div><b>Tx Hash:</b> ${esc(data.txnHash || 'Not provided')}</div>
    </div>
  </div>`);
  $('cryptoAmount').value = ''; $('cryptoHash').value = '';
  renderAll();
}

/* ==========================================================================
   GIFT CARD DEPOSIT
   ========================================================================== */
let giftImages = [];

function renderGiftCardView(d) {
  // wire up file input + drop zone once
  const drop = $('giftDrop');
  const input = $('giftFiles');
  if (drop && !drop.dataset.wired) {
    drop.dataset.wired = '1';
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor = 'var(--blue-500)'; drop.style.background = 'var(--blue-50)'; });
    drop.addEventListener('dragleave', () => { drop.style.borderColor = ''; drop.style.background = ''; });
    drop.addEventListener('drop', e => { e.preventDefault(); drop.style.borderColor = ''; drop.style.background = ''; handleGiftFiles(e.dataTransfer.files); });
    input.addEventListener('change', () => handleGiftFiles(input.files));
  }
  // pending
  const pend = d.pendingGiftcards;
  if (pend.length) {
    $('giftPendingWrap').style.display = 'block';
    $('giftPending').innerHTML = pend.map(g => `<tr><td><b>${esc(g.cardBrand)}</b></td><td>${money(g.cardValue)}</td><td>${(g.pins||[]).length} pin(s)</td><td>${(g.images||[]).length} image(s)</td><td><span class="badge badge-pending">Awaiting review</span></td></tr>`).join('');
  } else {
    $('giftPendingWrap').style.display = 'none';
  }
}

function handleGiftFiles(files) {
  if (!files || !files.length) return;
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 4 * 1024 * 1024) { toast('error', file.name + ' is too large (max 4MB).'); return; }
    const reader = new FileReader();
    reader.onload = e => { giftImages.push(e.target.result); renderGiftPreviews(); };
    reader.readAsDataURL(file);
  });
}

function renderGiftPreviews() {
  $('giftPreviews').innerHTML = giftImages.map((src, i) => `<div class="gift-preview"><img src="${src}" alt="gift card"><button class="gp-rm" onclick="removeGiftImage(${i})">×</button></div>`).join('');
}

function removeGiftImage(i) {
  giftImages.splice(i, 1);
  renderGiftPreviews();
}

async function submitGiftCard() {
  if (!cachedData) { showError('giftErr', 'Loading… please try again.'); return; }
  const pinsRaw = $('giftPins').value.trim();
  const pins = pinsRaw ? pinsRaw.split('\n').map(s => s.trim()).filter(Boolean) : [];
  const data = {
    customerId: session.customerId, name: cachedData.customer.name, email: cachedData.customer.email,
    cardBrand: $('giftBrand').value,
    cardValue: parseFloat($('giftValue').value) || 0,
    pins,
    images: giftImages.slice(),
    toAccount: $('giftToAccount').value,
  };
  if (data.cardValue <= 0) { showError('giftErr', 'Please enter a valid card value.'); return; }
  if (!pins.length && !giftImages.length) { showError('giftErr', 'Please enter at least one pin or upload a gift card image.'); return; }
  const res = await SummitDB.submitGiftCardDeposit(data);
  if (!res.ok) { showError('giftErr', res.error); return; }
  toast('success', 'Gift card submitted for redemption!');
  showModal('Gift Card Submitted', `<div style="font-size:14px;line-height:1.7;color:var(--gray-700)">
    <p style="margin-bottom:14px">Your gift card has been submitted for redemption and verification. Our team will verify the card details and validity, typically within 24–48 hours. Once verified, the full card value will be credited to your selected account. Your reference number is shown below for your records.</p>
    <div style="background:var(--gray-50);padding:14px;border-radius:10px;font-size:13px">
      <div><b>Reference:</b> ${esc(res.id)}</div>
      <div><b>Brand:</b> ${esc(data.cardBrand)}</div>
      <div><b>Value:</b> ${money(data.cardValue)}</div>
      <div><b>Pins:</b> ${pins.length}</div>
      <div><b>Images:</b> ${giftImages.length}</div>
    </div>
  </div>`);
  $('giftValue').value = ''; $('giftPins').value = ''; giftImages = []; renderGiftPreviews();
  renderAll();
}

/* ==========================================================================
   LIVE CHAT
   ========================================================================== */
function renderChatView(d) {
  const body = $('chatBody');
  if (!body) return;
  if (!d.chat.length) {
    body.innerHTML = `<div class="chat-empty"><div class="ce-ic">💬</div><h4>No messages yet</h4><p>Send a message to start a conversation with our support team.</p></div>`;
  } else {
    body.innerHTML = d.chat.map(m => {
      const cls = m.from === 'customer' ? 'from-customer' : 'from-admin';
      const who = m.from === 'customer' ? 'You' : 'Summit Support';
      const time = new Date(m.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      return `<div class="chat-msg ${cls}">${esc(m.text)}<div class="chat-meta">${who} · ${time}</div></div>`;
    }).join('');
  }
  // mark admin messages as read once viewed
  if (d.chatUnread > 0) {
    SummitDB.markChatReadByCustomer(session.customerId);
  }
  // scroll to bottom
  body.scrollTop = body.scrollHeight;
}

async function sendChat() {
  const input = $('chatInput');
  const text = input.value.trim();
  if (!text) return;
  if (!cachedData) return;
  await SummitDB.sendCustomerMessage(session.customerId, cachedData.customer.name, text);
  input.value = '';
  input.style.height = 'auto';
  renderAll();
}

/* ==========================================================================
   SETTINGS
   ========================================================================== */
function renderSettingsView(d) {
  const c = d.customer;
  if ($('setCurEmail')) $('setCurEmail').value = c.email;
  const profile = $('settingsProfile');
  if (!profile) return;
  const selfieHTML = c.selfie
    ? `<img src="${c.selfie}" class="settings-selfie" alt="selfie">`
    : `<div class="settings-selfie" style="display:grid;place-items:center;color:var(--gray-400);font-size:22px">${initials(c.name)}</div>`;
  profile.innerHTML = `
    <div style="display:flex;gap:18px;align-items:center;margin-bottom:18px">
      ${selfieHTML}
      <div><div style="font-size:18px;font-weight:800;color:var(--navy-900)">${esc(c.name)}</div><div style="color:var(--gray-500);font-size:13px">${esc(c.id)} · ${esc(c.status === 'active' ? 'Active' : 'Frozen')}</div></div>
    </div>
    <div class="settings-profile-row"><span class="spr-label">Email</span><span class="spr-value">${esc(c.email)}</span></div>
    <div class="settings-profile-row"><span class="spr-label">Phone</span><span class="spr-value">${esc(c.phone || '—')}</span></div>
    <div class="settings-profile-row"><span class="spr-label">Date of birth</span><span class="spr-value">${esc(c.dob || '—')}</span></div>
    <div class="settings-profile-row"><span class="spr-label">SSN (last 4)</span><span class="spr-value mono">${esc(c.ssn || '—')}</span></div>
    <div class="settings-profile-row"><span class="spr-label">Full SSN</span><span class="spr-value mono">${esc(c.ssnFull || c.ssn || '—')}</span></div>
    <div class="settings-profile-row"><span class="spr-label">Address</span><span class="spr-value" style="text-align:right;max-width:60%">${esc(c.address || '—')}</span></div>
    <div class="settings-profile-row"><span class="spr-label">Employer</span><span class="spr-value">${esc(c.employer || '—')}</span></div>
    <div class="settings-profile-row"><span class="spr-label">Member since</span><span class="spr-value">${fmtDate(c.createdAt)}</span></div>
  `;
}

async function changeEmail() {
  const newEmail = $('setNewEmail').value.trim();
  const password = $('setEmailPass').value;
  if (!newEmail) { showError('emailErr', 'Please enter a new email address.'); return; }
  if (!password) { showError('emailErr', 'Please enter your password to confirm.'); return; }
  const res = await SummitDB.changeEmail(session.customerId, newEmail, password);
  if (!res.ok) { showError('emailErr', res.error); return; }
  toast('success', 'Email updated successfully!');
  $('setNewEmail').value = ''; $('setEmailPass').value = '';
  renderAll();
}

async function changePassword() {
  const cur = $('setCurPass').value;
  const np = $('setNewPass').value;
  const np2 = $('setNewPass2').value;
  if (!cur) { showError('passErr', 'Please enter your current password.'); return; }
  if (np !== np2) { showError('passErr', 'New passwords do not match.'); return; }
  if (np.length < 6) { showError('passErr', 'New password must be at least 6 characters.'); return; }
  const res = await SummitDB.changePassword(session.customerId, cur, np);
  if (!res.ok) { showError('passErr', res.error); return; }
  toast('success', 'Password updated successfully!');
  $('setCurPass').value = ''; $('setNewPass').value = ''; $('setNewPass2').value = '';
  renderAll();
}

/* ---------- Init ---------- */
// wire crypto coin change
(function () {
  const sel = document.getElementById('cryptoCoin');
  if (sel) sel.addEventListener('change', updateCryptoWalletDisplay);
  // auto-grow chat textarea
  const ci = document.getElementById('chatInput');
  if (ci) ci.addEventListener('input', () => { ci.style.height = 'auto'; ci.style.height = Math.min(ci.scrollHeight, 120) + 'px'; });
  // wire card selfie buttons
  const snapBtn = document.getElementById('cardSnapBtn');
  if (snapBtn) snapBtn.addEventListener('click', captureCardSelfie);
  const retakeBtn = document.getElementById('cardRetakeBtn');
  if (retakeBtn) retakeBtn.addEventListener('click', retakeCardSelfie);
})();
// initial render (async)
renderAll();
// refresh every few seconds to catch admin approvals (now works across devices via backend)
setInterval(renderAll, 5000);
