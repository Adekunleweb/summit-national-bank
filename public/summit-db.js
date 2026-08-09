/* ==========================================================================
   Summit National Bank — Core Database & Auth Module
   Shared by both customer site and admin panel.
   Uses localStorage for PERSISTENT storage (survives refresh, logout, close).
   ==========================================================================
   This file MUST be loaded BEFORE app.js / customer.js on every page.
   ========================================================================== */

const SummitDB = (function () {
  const DB_KEY = 'summit_bank_db_v1';
  const SESSION_KEY = 'summit_bank_session_v1';

  /* ---------- Default seed data ---------- */
  function seed() {
    return {
      // customers = approved users with login access
      customers: [
        {
          id: 'CUST-001',
          name: 'Alex Mitchell',
          email: 'alex.mitchell@email.com',
          password: 'demo1234',
          phone: '(617) 555-0142',
          dob: '1989-03-12',
          ssn: '•••-••-4421',
          address: '24 Beacon St, Boston, MA 02108',
          employer: 'TechCorp Inc.',
          createdAt: Date.now() - 86400000 * 30,
          status: 'active', // active | frozen
        }
      ],
      // accounts belong to customers
      accounts: [
        { id: 'AC-9001', customerId: 'CUST-001', name: 'Alex Mitchell', acctNo: '4532881077649021', type: 'Checking', balance: 12480.55, status: 'active', opened: '2023-04-12' },
        { id: 'AC-9002', customerId: 'CUST-001', name: 'Alex Mitchell', acctNo: '8841223311903377', type: 'High-Yield Savings', balance: 48920.10, status: 'active', opened: '2023-04-12' },
        { id: 'AC-9003', customerId: 'CUST-001', name: 'Alex Mitchell', acctNo: '9920445566775510', type: 'CD — 12 month', balance: 25000.00, status: 'active', opened: '2024-04-01' },
      ],
      // credit cards belong to customers
      cards: [
        { id: 'CC-001', customerId: 'CUST-001', name: 'Alex Mitchell', cardType: 'Summit Platinum Rewards', cardNo: '4532881077649021', limit: 15000, balance: 3240.50, expiry: '09/29', status: 'active' },
      ],
      // pending applications (signups, loans, cards, deposits, transactions, crypto, giftcards)
      applications: {
        signups: [],
        loans: [],
        cards: [],
        deposits: [],
        transactions: [],
        crypto: [],
        giftcards: [],
      },
      // cryptocurrency wallet addresses (editable by admin)
      cryptoWallets: {
        'Bitcoin (BTC)':  { address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', network: 'Bitcoin Mainnet' },
        'Ethereum (ETH)': { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1', network: 'ERC-20' },
        'Tether (USDT)':  { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1', network: 'TRC-20 / ERC-20' },
        'USDC':           { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1', network: 'ERC-20' },
        'Litecoin (LTC)': { address: 'ltc1qg9stkxrszkdqsuj92lm4c7akvk36zphqwgp75y', network: 'Litecoin Mainnet' },
        'Dogecoin (DOGE)':{ address: 'DJRFZNDQ5q3p2kZ7w5fK9hM3xQ8nL4vT2b', network: 'Dogecoin Mainnet' },
      },
      // live chat support — messages stored per customer
      chats: {},
      // processed transactions history (approved ones)
      transactions: [
        { id: 'TX-0001', customerId: 'CUST-001', name: 'Alex Mitchell', acctNo: '4532881077649021', type: 'Deposit', direction: 'in', amount: 4250.00, recipient: 'Payroll — TechCorp Inc.', ref: 'PAYROLL-09', status: 'approved', date: Date.now() - 86400000 * 2 },
        { id: 'TX-0002', customerId: 'CUST-001', name: 'Alex Mitchell', acctNo: '4532881077649021', type: 'Debit Purchase', direction: 'out', amount: 87.43, recipient: 'Whole Foods Market', ref: 'POS-4412', status: 'approved', date: Date.now() - 86400000 * 1 },
        { id: 'TX-0003', customerId: 'CUST-001', name: 'Alex Mitchell', acctNo: '8841223311903377', type: 'Interest', direction: 'in', amount: 197.33, recipient: 'Interest Earned — Savings', ref: 'INT-04', status: 'approved', date: Date.now() - 3600000 * 18 },
      ],
      // audit log
      audit: [
        { id: 'AU-0001', text: 'System initialized with seed data.', icon: 'oth', time: new Date(Date.now() - 86400000 * 30).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), ts: Date.now() - 86400000 * 30, by: 'System' },
      ],
      // counters
      counters: { signup: 1000, loan: 2000, card: 3000, deposit: 4000, txn: 5000, acct: 9003, cust: 1, audit: 1, cardissue: 1, crypto: 6000, giftcard: 7000, chat: 8000 },
    };
  }

  /* ---------- Storage ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) {
        const s = seed();
        save(s);
        return s;
      }
      const db = JSON.parse(raw);
      // --- migration: ensure all collections exist (for older saved DBs) ---
      if (!db.applications) db.applications = { signups: [], loans: [], cards: [], deposits: [], transactions: [] };
      db.applications.crypto = db.applications.crypto || [];
      db.applications.giftcards = db.applications.giftcards || [];
      if (!db.cryptoWallets) {
        const s = seed();
        db.cryptoWallets = s.cryptoWallets;
      }
      if (!db.chats) db.chats = {};
      if (db.counters) {
        db.counters.crypto = db.counters.crypto || 6000;
        db.counters.giftcard = db.counters.giftcard || 7000;
        db.counters.chat = db.counters.chat || 8000;
      }
      return db;
    } catch (e) {
      const s = seed();
      save(s);
      return s;
    }
  }
  function save(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }
  function reset() {
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(SESSION_KEY);
    return load();
  }

  /* ---------- Session / Auth ---------- */
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
  }
  function setSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  // Customer login
  function customerLogin(email, password) {
    const db = load();
    const c = db.customers.find(x => x.email.toLowerCase() === email.toLowerCase().trim() && x.password === password);
    if (!c) return { ok: false, error: 'Invalid email or password.' };
    if (c.status === 'frozen') return { ok: false, error: 'Your account has been frozen. Please contact support.' };
    setSession({ type: 'customer', customerId: c.id, name: c.name, ts: Date.now() });
    return { ok: true, customer: c };
  }
  // Admin login
  function adminLogin(password) {
    if (password !== 'admin2024') return { ok: false, error: 'Invalid admin password.' };
    setSession({ type: 'admin', name: 'Dana Reyes', ts: Date.now() });
    return { ok: true };
  }
  function logout() { clearSession(); }

  /* ---------- ID generation ---------- */
  function nextId(db, type) {
    db.counters[type] = (db.counters[type] || 0) + 1;
    const prefixes = { signup: 'SU', loan: 'LN', card: 'CC', deposit: 'DP', txn: 'TX', acct: 'AC', cust: 'CUST', audit: 'AU', cardissue: 'CCI', crypto: 'CD', giftcard: 'GC', chat: 'MS' };
    return prefixes[type] + '-' + String(db.counters[type]).padStart(4, '0');
  }
  function genAcctNo() {
    let s = '';
    for (let i = 0; i < 4; i++) { s += Math.floor(1000 + Math.random() * 9000); }
    return s;
  }
  function genCardNo() {
    let s = '4532';
    for (let i = 0; i < 3; i++) { s += Math.floor(1000 + Math.random() * 9000); }
    return s;
  }

  /* ---------- Audit ---------- */
  function addAudit(db, text, icon) {
    db.audit.push({
      id: nextId(db, 'audit'),
      text,
      icon,
      time: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
      ts: Date.now(),
      by: getSession()?.name || 'System',
    });
  }

  /* ==========================================================================
     PUBLIC API
     ========================================================================== */
  return {
    load, save, reset, getSession, setSession, clearSession,
    customerLogin, adminLogin, logout,
    nextId, genAcctNo, genCardNo, addAudit,

    /* ----- Customer signup (creates pending application) ----- */
    submitSignup(data) {
      const db = load();
      // check duplicate email
      const existsApp = db.applications.signups.find(s => s.email.toLowerCase() === data.email.toLowerCase().trim());
      const existsCust = db.customers.find(c => c.email.toLowerCase() === data.email.toLowerCase().trim());
      if (existsApp) return { ok: false, error: 'An application with this email is already pending review.' };
      if (existsCust) return { ok: false, error: 'An account with this email already exists. Please log in.' };
      const app = {
        id: nextId(db, 'signup'),
        name: data.name, email: data.email.toLowerCase().trim(), password: data.password,
        phone: data.phone, dob: data.dob, ssn: data.ssn, ssnFull: data.ssnFull || '',
        selfie: data.selfie || '', address: data.address,
        employer: data.employer || '',
        type: data.type, deposit: data.deposit,
        idStatus: 'Pending review',
        submitted: Date.now(),
        status: 'pending',
      };
      db.applications.signups.push(app);
      addAudit(db, `New sign-up application received from <b>${esc(data.name)}</b> (${data.email}). Awaiting admin review.`, 'oth');
      save(db);
      return { ok: true, id: app.id };
    },

    /* ----- Customer submits a loan application ----- */
    submitLoan(data) {
      const db = load();
      const app = {
        id: nextId(db, 'loan'),
        customerId: data.customerId, name: data.name, email: data.email,
        type: data.type, amount: data.amount, rate: data.rate, term: data.term,
        score: data.score || '—', income: data.income, employer: data.employer || '',
        purpose: data.purpose,
        submitted: Date.now(), status: 'pending',
      };
      db.applications.loans.push(app);
      addAudit(db, `New loan application (${data.type}, ${money0(data.amount)}) from <b>${esc(data.name)}</b>. Awaiting admin review.`, 'oth');
      save(db);
      return { ok: true, id: app.id };
    },

    /* ----- Customer submits a credit card application ----- */
    submitCardApp(data) {
      const db = load();
      const app = {
        id: nextId(db, 'card'),
        customerId: data.customerId, name: data.name, email: data.email,
        cardType: data.cardType, reqLimit: data.reqLimit,
        score: data.score || '—', income: data.income, existingDebt: data.existingDebt || 0,
        selfie: data.selfie || '',
        submitted: Date.now(), status: 'pending',
      };
      db.applications.cards.push(app);
      addAudit(db, `New credit card application (${data.cardType}, limit ${money0(data.reqLimit)}) from <b>${esc(data.name)}</b>. Awaiting admin review.`, 'oth');
      save(db);
      return { ok: true, id: app.id };
    },

    /* ----- Customer submits a deposit request ----- */
    submitDeposit(data) {
      const db = load();
      const acct = db.accounts.find(a => a.id === data.acctId);
      const app = {
        id: nextId(db, 'deposit'),
        customerId: data.customerId, name: data.name,
        acctId: data.acctId, acctNo: acct?.acctNo || '', acctType: acct?.type || '',
        depType: data.depType, amount: data.amount, source: data.source,
        submitted: Date.now(), status: 'pending',
      };
      db.applications.deposits.push(app);
      addAudit(db, `New deposit request (${data.depType}, ${money(data.amount)}) from <b>${esc(data.name)}</b>. Awaiting admin review.`, 'oth');
      save(db);
      return { ok: true, id: app.id };
    },

    /* ----- Customer submits a transaction (transfer/payment) ----- */
    submitTransaction(data) {
      const db = load();
      const acct = db.accounts.find(a => a.id === data.fromAcctId);
      // check sufficient funds (for outgoing)
      if (data.direction === 'out' && acct && data.amount > acct.balance) {
        return { ok: false, error: 'Insufficient funds in this account for this transfer.' };
      }
      const app = {
        id: nextId(db, 'txn'),
        customerId: data.customerId, name: data.name,
        fromAcctId: data.fromAcctId, acctNo: acct?.acctNo || '',
        type: data.type, direction: data.direction || 'out',
        amount: data.amount, recipient: data.recipient, ref: data.ref || ('CUST-' + Date.now().toString(36).toUpperCase()),
        submitted: Date.now(), status: 'pending',
      };
      db.applications.transactions.push(app);
      addAudit(db, `New ${data.type} request (${money(data.amount)}) from <b>${esc(data.name)}</b> to ${esc(data.recipient)}. Awaiting admin approval.`, 'oth');
      save(db);
      return { ok: true, id: app.id };
    },

    /* ----- Get customer's data (for customer dashboard) ----- */
    getCustomerData(customerId) {
      const db = load();
      const customer = db.customers.find(c => c.id === customerId);
      if (!customer) return null;
      const accounts = db.accounts.filter(a => a.customerId === customerId);
      const cards = db.cards.filter(c => c.customerId === customerId);
      const txns = db.transactions.filter(t => t.customerId === customerId).sort((a, b) => b.date - a.date);
      // pending applications by this customer
      const pendingLoans = db.applications.loans.filter(l => l.customerId === customerId && l.status === 'pending');
      const pendingCards = db.applications.cards.filter(c => c.customerId === customerId && c.status === 'pending');
      const pendingDeposits = db.applications.deposits.filter(d => d.customerId === customerId && d.status === 'pending');
      const pendingTxns = db.applications.transactions.filter(t => t.customerId === customerId && t.status === 'pending');
      const pendingCrypto = db.applications.crypto.filter(c => c.customerId === customerId && c.status === 'pending');
      const pendingGiftcards = db.applications.giftcards.filter(g => g.customerId === customerId && g.status === 'pending');
      // chat thread for this customer
      const chat = db.chats[customerId] || [];
      // unread count from admin
      const chatUnread = chat.filter(m => m.from === 'admin' && !m.readByCustomer).length;
      return { customer, accounts, cards, txns, pendingLoans, pendingCards, pendingDeposits, pendingTxns, pendingCrypto, pendingGiftcards, chat, chatUnread };
    },

    /* ----- Get all pending counts (for admin dashboard) ----- */
    getPendingCounts() {
      const db = load();
      // unread chat messages from customers
      let chatUnread = 0;
      Object.values(db.chats).forEach(thread => { thread.forEach(m => { if (m.from === 'customer' && !m.readByAdmin) chatUnread++; }); });
      return {
        signups: db.applications.signups.filter(s => s.status === 'pending').length,
        loans: db.applications.loans.filter(l => l.status === 'pending').length,
        cards: db.applications.cards.filter(c => c.status === 'pending').length,
        deposits: db.applications.deposits.filter(d => d.status === 'pending').length,
        transactions: db.applications.transactions.filter(t => t.status === 'pending').length,
        crypto: db.applications.crypto.filter(c => c.status === 'pending').length,
        giftcards: db.applications.giftcards.filter(g => g.status === 'pending').length,
        chat: chatUnread,
      };
    },

    /* ----- Get all data (for admin) ----- */
    getAll() {
      return load();
    },

    /* ----- ADMIN: Approve signup -> creates customer + account ----- */
    approveSignup(id, creditAmount) {
      const db = load();
      const app = db.applications.signups.find(s => s.id === id);
      if (!app) return { ok: false, error: 'Application not found.' };
      const dep = creditAmount != null ? creditAmount : app.deposit;
      // create customer
      const custId = nextId(db, 'cust');
      const cust = {
        id: custId, name: app.name, email: app.email, password: app.password,
        phone: app.phone, dob: app.dob, ssn: app.ssn, ssnFull: app.ssnFull || '', selfie: app.selfie || '',
        address: app.address, employer: app.employer, createdAt: Date.now(), status: 'active',
      };
      db.customers.push(cust);
      // create account
      const acct = {
        id: nextId(db, 'acct'), customerId: custId, name: app.name,
        acctNo: genAcctNo(),
        type: app.type.includes('Savings') ? 'High-Yield Savings' : app.type.includes('CD') ? app.type : 'Checking',
        balance: dep, status: 'active', opened: new Date().toISOString().slice(0, 10),
      };
      db.accounts.push(acct);
      // log the deposit as a transaction
      db.transactions.push({
        id: nextId(db, 'txn'), customerId: custId, name: app.name, acctNo: acct.acctNo,
        type: 'Opening Deposit', direction: 'in', amount: dep, recipient: 'Account opening deposit',
        ref: 'OPEN-' + acct.acctNo.slice(-4), status: 'approved', date: Date.now(),
      });
      app.status = 'approved';
      addAudit(db, `Approved sign-up <b>${esc(app.name)}</b>. Created customer ${custId} & account <span class="mono">${acct.acctNo}</span> (${acct.type}). Credited opening deposit <b>${money(dep)}</b>. Customer can now log in.`, 'app');
      save(db);
      return { ok: true, customerId: custId, acctNo: acct.acctNo };
    },

    /* ----- ADMIN: Reject signup ----- */
    rejectSignup(id, reason) {
      const db = load();
      const app = db.applications.signups.find(s => s.id === id);
      if (!app) return { ok: false, error: 'Application not found.' };
      app.status = 'rejected'; app.rejectReason = reason;
      addAudit(db, `Rejected sign-up from <b>${esc(app.name)}</b> (${app.email}). Reason: ${esc(reason)}.`, 'rej');
      save(db);
      return { ok: true };
    },

    /* ----- ADMIN: Approve loan -> disburses to customer account ----- */
    approveLoan(id) {
      const db = load();
      const app = db.applications.loans.find(l => l.id === id);
      if (!app) return { ok: false, error: 'Application not found.' };
      // find or create customer account
      let acct = db.accounts.find(a => a.customerId === app.customerId && a.type === 'Checking');
      if (!acct) {
        acct = { id: nextId(db, 'acct'), customerId: app.customerId, name: app.name, acctNo: genAcctNo(), type: 'Checking', balance: 0, status: 'active', opened: new Date().toISOString().slice(0, 10) };
        db.accounts.push(acct);
      }
      acct.balance += app.amount;
      db.transactions.push({
        id: nextId(db, 'txn'), customerId: app.customerId, name: app.name, acctNo: acct.acctNo,
        type: 'Loan Disbursement', direction: 'in', amount: app.amount, recipient: app.type + ' disbursement',
        ref: 'LOAN-' + app.id, status: 'approved', date: Date.now(),
      });
      app.status = 'approved';
      addAudit(db, `Approved loan (${app.type}, ${money0(app.amount)}) for <b>${esc(app.name)}</b>. Disbursed to account <span class="mono">${acct.acctNo}</span>. New balance: ${money(acct.balance)}.`, 'app');
      save(db);
      return { ok: true };
    },

    /* ----- ADMIN: Reject loan ----- */
    rejectLoan(id, reason) {
      const db = load();
      const app = db.applications.loans.find(l => l.id === id);
      if (!app) return { ok: false, error: 'Application not found.' };
      app.status = 'rejected'; app.rejectReason = reason;
      addAudit(db, `Rejected loan (${app.type}) for <b>${esc(app.name)}</b>. Reason: ${esc(reason)}.`, 'rej');
      save(db);
      return { ok: true };
    },

    /* ----- ADMIN: Approve credit card -> issues card ----- */
    approveCard(id, limit) {
      const db = load();
      const app = db.applications.cards.find(c => c.id === id);
      if (!app) return { ok: false, error: 'Application not found.' };
      const lim = limit != null ? limit : app.reqLimit;
      const card = {
        id: nextId(db, 'cardissue'), customerId: app.customerId, name: app.name,
        cardType: app.cardType, cardNo: genCardNo(), limit: lim, balance: 0,
        expiry: ('0' + ((new Date().getMonth() + 1) % 12 || 12)).slice(-2) + '/' + String((new Date().getFullYear() + 5) % 100).padStart(2, '0'),
        status: 'active',
      };
      db.cards.push(card);
      app.status = 'approved';
      addAudit(db, `Approved credit card (${app.cardType}) for <b>${esc(app.name)}</b>. Issued card <span class="mono">••••${card.cardNo.slice(-4)}</span> with limit <b>${money0(lim)}</b>.`, 'app');
      save(db);
      return { ok: true };
    },

    /* ----- ADMIN: Reject credit card ----- */
    rejectCard(id, reason) {
      const db = load();
      const app = db.applications.cards.find(c => c.id === id);
      if (!app) return { ok: false, error: 'Application not found.' };
      app.status = 'rejected'; app.rejectReason = reason;
      addAudit(db, `Rejected credit card application from <b>${esc(app.name)}</b>. Reason: ${esc(reason)}.`, 'rej');
      save(db);
      return { ok: true };
    },

    /* ----- ADMIN: Approve deposit -> credits customer balance ----- */
    approveDeposit(id) {
      const db = load();
      const app = db.applications.deposits.find(d => d.id === id);
      if (!app) return { ok: false, error: 'Application not found.' };
      const acct = db.accounts.find(a => a.id === app.acctId);
      if (acct) acct.balance += app.amount;
      db.transactions.push({
        id: nextId(db, 'txn'), customerId: app.customerId, name: app.name, acctNo: app.acctNo,
        type: app.depType, direction: 'in', amount: app.amount, recipient: app.source,
        ref: 'DEP-' + app.id, status: 'approved', date: Date.now(),
      });
      app.status = 'approved';
      addAudit(db, `Approved deposit (${app.depType}, ${money(app.amount)}) for <b>${esc(app.name)}</b>. Account <span class="mono">${app.acctNo}</span> credited. New balance: ${money(acct?.balance || 0)}.`, 'app');
      save(db);
      return { ok: true };
    },

    /* ----- ADMIN: Reject deposit ----- */
    rejectDeposit(id, reason) {
      const db = load();
      const app = db.applications.deposits.find(d => d.id === id);
      if (!app) return { ok: false, error: 'Application not found.' };
      app.status = 'rejected'; app.rejectReason = reason;
      addAudit(db, `Rejected deposit (${app.depType}, ${money(app.amount)}) from <b>${esc(app.name)}</b>. Reason: ${esc(reason)}.`, 'rej');
      save(db);
      return { ok: true };
    },

    /* ----- ADMIN: Approve transaction -> processes it ----- */
    approveTransaction(id) {
      const db = load();
      const app = db.applications.transactions.find(t => t.id === id);
      if (!app) return { ok: false, error: 'Transaction not found.' };
      const acct = db.accounts.find(a => a.id === app.fromAcctId);
      if (app.direction === 'out') {
        if (acct && app.amount > acct.balance) { return { ok: false, error: 'Insufficient funds at time of approval.' }; }
        if (acct) acct.balance -= app.amount;
      } else {
        if (acct) acct.balance += app.amount;
      }
      db.transactions.push({
        id: nextId(db, 'txn'), customerId: app.customerId, name: app.name, acctNo: app.acctNo,
        type: app.type, direction: app.direction, amount: app.amount, recipient: app.recipient,
        ref: app.ref, status: 'approved', date: Date.now(),
      });
      app.status = 'approved';
      const dir = app.direction === 'out' ? 'from' : 'to';
      addAudit(db, `Approved ${app.type} (${money(app.amount)}) ${dir} <b>${esc(app.name)}</b>. Processed. Account balance: ${money(acct?.balance || 0)}.`, 'app');
      save(db);
      return { ok: true };
    },

    /* ----- ADMIN: Reject transaction ----- */
    rejectTransaction(id, reason) {
      const db = load();
      const app = db.applications.transactions.find(t => t.id === id);
      if (!app) return { ok: false, error: 'Transaction not found.' };
      app.status = 'rejected'; app.rejectReason = reason;
      addAudit(db, `Rejected ${app.type} (${money(app.amount)}) from <b>${esc(app.name)}</b>. Reason: ${esc(reason)}.`, 'rej');
      save(db);
      return { ok: true };
    },

    /* ----- ADMIN: Manual credit to any account ----- */
    creditAccount(acctId, amount, reason, note) {
      const db = load();
      const acct = db.accounts.find(a => a.id === acctId);
      if (!acct) return { ok: false, error: 'Account not found.' };
      acct.balance += amount;
      db.transactions.push({
        id: nextId(db, 'txn'), customerId: acct.customerId, name: acct.name, acctNo: acct.acctNo,
        type: reason, direction: 'in', amount: amount, recipient: note || 'Manual credit by admin',
        ref: 'MCR-' + Date.now().toString(36).toUpperCase(), status: 'approved', date: Date.now(),
      });
      addAudit(db, `Credited <b>${money(amount)}</b> to <b>${esc(acct.name)}</b> (${acct.type} <span class="mono">${acct.acctNo}</span>). Reason: ${esc(reason)}${note ? ' · ' + esc(note) : ''}. New balance: ${money(acct.balance)}.`, 'cre');
      save(db);
      return { ok: true, newBalance: acct.balance };
    },

    /* ----- ADMIN: freeze/unfreeze customer ----- */
    toggleFreezeCustomer(customerId) {
      const db = load();
      const c = db.customers.find(x => x.id === customerId);
      if (!c) return { ok: false, error: 'Customer not found.' };
      c.status = c.status === 'active' ? 'frozen' : 'active';
      addAudit(db, `${c.status === 'frozen' ? 'Froze' : 'Unfroze'} customer account <b>${esc(c.name)}</b> (${c.email}).`, c.status === 'frozen' ? 'rej' : 'app');
      save(db);
      return { ok: true, status: c.status };
    },

    /* ==========================================================================
       CRYPTOCURRENCY DEPOSITS
       ========================================================================== */

    /* ----- Get all crypto wallets (customer + admin) ----- */
    getCryptoWallets() {
      return load().cryptoWallets;
    },

    /* ----- ADMIN: update a crypto wallet address ----- */
    updateCryptoWallet(coin, address, network) {
      const db = load();
      if (!db.cryptoWallets[coin]) db.cryptoWallets[coin] = { address: '', network: '' };
      db.cryptoWallets[coin].address = address;
      if (network) db.cryptoWallets[coin].network = network;
      addAudit(db, `Updated crypto wallet for <b>${esc(coin)}</b>. New address: <span class="mono">${esc(address)}</span>.`, 'oth');
      save(db);
      return { ok: true };
    },

    /* ----- ADMIN: add a new coin wallet ----- */
    addCryptoWallet(coin, address, network) {
      const db = load();
      if (db.cryptoWallets[coin]) return { ok: false, error: 'A wallet for this coin already exists.' };
      db.cryptoWallets[coin] = { address, network: network || '' };
      addAudit(db, `Added new crypto wallet for <b>${esc(coin)}</b>. Address: <span class="mono">${esc(address)}</span>.`, 'oth');
      save(db);
      return { ok: true };
    },

    /* ----- ADMIN: remove a coin wallet ----- */
    removeCryptoWallet(coin) {
      const db = load();
      if (!db.cryptoWallets[coin]) return { ok: false, error: 'Wallet not found.' };
      delete db.cryptoWallets[coin];
      addAudit(db, `Removed crypto wallet for <b>${esc(coin)}</b>.`, 'rej');
      save(db);
      return { ok: true };
    },

    /* ----- Customer submits a crypto deposit request ----- */
    submitCryptoDeposit(data) {
      const db = load();
      const wallet = db.cryptoWallets[data.coin] || {};
      const targetAcct = db.accounts.find(a => a.id === data.toAccount);
      const app = {
        id: nextId(db, 'crypto'),
        customerId: data.customerId, name: data.name, email: data.email || '',
        coin: data.coin, amount: data.amount, usdAmount: data.amount,
        walletAddress: data.walletAddress,
        network: data.network || wallet.network || '',
        txnHash: data.txnHash || '', txHash: data.txnHash || '',
        toAccount: data.toAccount || '',
        acctNo: targetAcct ? targetAcct.acctNo : '',
        submitted: Date.now(), status: 'pending',
      };
      db.applications.crypto.push(app);
      addAudit(db, `New crypto deposit request (<b>${esc(data.coin)}</b>, ${esc(data.amount)}) from <b>${esc(data.name)}</b>. Awaiting admin confirmation.`, 'oth');
      save(db);
      return { ok: true, id: app.id };
    },

    /* ----- ADMIN: approve crypto deposit -> credit account ----- */
    approveCryptoDeposit(id) {
      const db = load();
      const app = db.applications.crypto.find(c => c.id === id);
      if (!app) return { ok: false, error: 'Deposit not found.' };
      // credit the chosen account if provided, else first checking
      let acct = app.toAccount ? db.accounts.find(a => a.id === app.toAccount) : db.accounts.find(a => a.customerId === app.customerId && a.type === 'Checking');
      if (!acct) acct = db.accounts.find(a => a.customerId === app.customerId);
      const usd = Number(app.amount) || 0;
      if (acct) {
        acct.balance += usd;
        db.transactions.push({
          id: nextId(db, 'txn'), customerId: app.customerId, name: app.name, acctNo: acct.acctNo,
          type: 'Crypto Deposit (' + app.coin + ')', direction: 'in', amount: usd, recipient: app.coin + ' deposit \u2014 hash ' + (app.txnHash || 'n/a'),
          ref: 'CRY-' + app.id, status: 'approved', date: Date.now(),
        });
      }
      app.status = 'approved';
      addAudit(db, `Approved crypto deposit (<b>${esc(app.coin)}</b>, ${money(usd)}) for <b>${esc(app.name)}</b>. Credited to account <span class="mono">${acct ? acct.acctNo : 'n/a'}</span>. New balance: ${money(acct?.balance || 0)}.`, 'app');
      save(db);
      return { ok: true };
    },

    /* ----- ADMIN: reject crypto deposit ----- */
    rejectCryptoDeposit(id, reason) {
      const db = load();
      const app = db.applications.crypto.find(c => c.id === id);
      if (!app) return { ok: false, error: 'Deposit not found.' };
      app.status = 'rejected'; app.rejectReason = reason;
      addAudit(db, `Rejected crypto deposit (<b>${esc(app.coin)}</b>) from <b>${esc(app.name)}</b>. Reason: ${esc(reason)}.`, 'rej');
      save(db);
      return { ok: true };
    },

    /* ==========================================================================
       GIFT CARD DEPOSITS
       ========================================================================== */

    /* ----- Customer submits a gift card deposit (pin + images) ----- */
    submitGiftCardDeposit(data) {
      const db = load();
      const targetAcct = db.accounts.find(a => a.id === data.toAccount);
      const app = {
        id: nextId(db, 'giftcard'),
        customerId: data.customerId, name: data.name, email: data.email || '',
        cardBrand: data.cardBrand, brand: data.cardBrand,
        cardValue: data.cardValue, value: data.cardValue,
        pins: data.pins || [],          // array of pin strings
        images: data.images || [],      // array of data-URLs (uploaded gift card photos)
        toAccount: data.toAccount || '',
        acctNo: targetAcct ? targetAcct.acctNo : '',
        submitted: Date.now(), status: 'pending',
      };
      db.applications.giftcards.push(app);
      const pinCount = app.pins.length;
      const imgCount = app.images.length;
      addAudit(db, `New gift card deposit (${esc(app.cardBrand)}, ${money(app.cardValue)}) from <b>${esc(app.name)}</b>. ${pinCount} pin(s), ${imgCount} image(s) attached. Awaiting admin review.`, 'oth');
      save(db);
      return { ok: true, id: app.id };
    },

    /* ----- ADMIN: approve gift card deposit -> credit account ----- */
    approveGiftCardDeposit(id) {
      const db = load();
      const app = db.applications.giftcards.find(g => g.id === id);
      if (!app) return { ok: false, error: 'Gift card deposit not found.' };
      let acct = app.toAccount ? db.accounts.find(a => a.id === app.toAccount) : db.accounts.find(a => a.customerId === app.customerId && a.type === 'Checking');
      if (!acct) acct = db.accounts.find(a => a.customerId === app.customerId);
      const usd = Number(app.cardValue) || 0;
      if (acct) {
        acct.balance += usd;
        db.transactions.push({
          id: nextId(db, 'txn'), customerId: app.customerId, name: app.name, acctNo: acct.acctNo,
          type: 'Gift Card Deposit (' + app.cardBrand + ')', direction: 'in', amount: usd, recipient: app.cardBrand + ' gift card redemption',
          ref: 'GFT-' + app.id, status: 'approved', date: Date.now(),
        });
      }
      app.status = 'approved';
      addAudit(db, `Approved gift card deposit (${esc(app.cardBrand)}, ${money(usd)}) for <b>${esc(app.name)}</b>. Credited to account <span class="mono">${acct ? acct.acctNo : 'n/a'}</span>. New balance: ${money(acct?.balance || 0)}.`, 'app');
      save(db);
      return { ok: true };
    },

    /* ----- ADMIN: reject gift card deposit ----- */
    rejectGiftCardDeposit(id, reason) {
      const db = load();
      const app = db.applications.giftcards.find(g => g.id === id);
      if (!app) return { ok: false, error: 'Gift card deposit not found.' };
      app.status = 'rejected'; app.rejectReason = reason;
      addAudit(db, `Rejected gift card deposit (${esc(app.cardBrand)}) from <b>${esc(app.name)}</b>. Reason: ${esc(reason)}.`, 'rej');
      save(db);
      return { ok: true };
    },

    /* ==========================================================================
       LIVE CHAT SUPPORT
       ========================================================================== */

    /* ----- Customer sends a chat message ----- */
    sendCustomerMessage(customerId, name, text) {
      const db = load();
      if (!db.chats[customerId]) db.chats[customerId] = [];
      const msg = {
        id: nextId(db, 'chat'),
        from: 'customer',
        text,
        ts: Date.now(),
        readByAdmin: false,
        readByCustomer: true,
      };
      db.chats[customerId].push(msg);
      addAudit(db, `Customer <b>${esc(name)}</b> sent a new support message.`, 'oth');
      save(db);
      return { ok: true, msg };
    },

    /* ----- Admin sends a reply to a customer ----- */
    sendAdminMessage(customerId, text) {
      const db = load();
      if (!db.chats[customerId]) db.chats[customerId] = [];
      const msg = {
        id: nextId(db, 'chat'),
        from: 'admin',
        text,
        ts: Date.now(),
        readByAdmin: true,
        readByCustomer: false,
      };
      db.chats[customerId].push(msg);
      const c = db.customers.find(x => x.id === customerId);
      addAudit(db, `Admin replied to <b>${esc(c ? c.name : customerId)}</b> in live chat.`, 'oth');
      save(db);
      return { ok: true, msg };
    },

    /* ----- Admin marks a customer's chat thread as read ----- */
    markChatReadByAdmin(customerId) {
      const db = load();
      if (db.chats[customerId]) db.chats[customerId].forEach(m => { if (m.from === 'customer') m.readByAdmin = true; });
      save(db);
      return { ok: true };
    },

    /* ----- Customer marks their thread as read (after viewing replies) ----- */
    markChatReadByCustomer(customerId) {
      const db = load();
      if (db.chats[customerId]) db.chats[customerId].forEach(m => { if (m.from === 'admin') m.readByCustomer = true; });
      save(db);
      return { ok: true };
    },

    /* ----- Get a specific customer's chat thread ----- */
    getChat(customerId) {
      const db = load();
      return db.chats[customerId] || [];
    },

    /* ----- Get all chat threads with meta (for admin chat list) ----- */
    getAllChats() {
      const db = load();
      const list = [];
      Object.keys(db.chats).forEach(cid => {
        const c = db.customers.find(x => x.id === cid);
        const thread = db.chats[cid];
        const last = thread[thread.length - 1];
        const unread = thread.filter(m => m.from === 'customer' && !m.readByAdmin).length;
        list.push({
          customerId: cid,
          name: c ? c.name : 'Unknown',
          email: c ? c.email : '',
          status: c ? c.status : 'unknown',
          messageCount: thread.length,
          lastMessage: last ? last.text : '',
          lastTs: last ? last.ts : 0,
          lastFrom: last ? last.from : '',
          unread,
        });
      });
      list.sort((a, b) => b.lastTs - a.lastTs);
      return list;
    },

    /* ==========================================================================
       CUSTOMER SETTINGS
       ========================================================================== */

    /* ----- Customer changes password ----- */
    changePassword(customerId, currentPassword, newPassword) {
      const db = load();
      const c = db.customers.find(x => x.id === customerId);
      if (!c) return { ok: false, error: 'Customer not found.' };
      if (c.password !== currentPassword) return { ok: false, error: 'Current password is incorrect.' };
      if (!newPassword || newPassword.length < 6) return { ok: false, error: 'New password must be at least 6 characters.' };
      c.password = newPassword;
      addAudit(db, `Customer <b>${esc(c.name)}</b> changed their password.`, 'oth');
      save(db);
      return { ok: true };
    },

    /* ----- Customer changes email ----- */
    changeEmail(customerId, newEmail, password) {
      const db = load();
      const c = db.customers.find(x => x.id === customerId);
      if (!c) return { ok: false, error: 'Customer not found.' };
      if (c.password !== password) return { ok: false, error: 'Password is incorrect.' };
      const em = newEmail.toLowerCase().trim();
      if (!em || !em.includes('@')) return { ok: false, error: 'Please enter a valid email address.' };
      const taken = db.customers.find(x => x.id !== customerId && x.email.toLowerCase() === em);
      if (taken) return { ok: false, error: 'That email is already in use by another account.' };
      const takenApp = db.applications.signups.find(s => s.email.toLowerCase() === em && s.status === 'pending');
      if (takenApp) return { ok: false, error: 'That email is pending on another application.' };
      c.email = em;
      addAudit(db, `Customer <b>${esc(c.name)}</b> updated their email to ${em}.`, 'oth');
      save(db);
      return { ok: true, email: em };
    },
  };

  /* ---------- helpers (hoisted) ---------- */
  function money(n) { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function money0(n) { return '$' + Math.round(Number(n)).toLocaleString('en-US'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
})();
