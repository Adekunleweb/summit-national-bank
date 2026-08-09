/* ==========================================================================
   Summit National Bank — API Client
   Drop-in replacement for the old localStorage-based SummitDB module.
   Routes all data operations through the backend API via fetch().
   Session management stays in localStorage (client-side only).
   
   This file MUST be loaded BEFORE app.js / portal.js on every page,
   replacing summit-db.js.
   ========================================================================== */

const SummitDB = (function () {
  const SESSION_KEY = 'summit_bank_session_v1';
  const API = '/api'; // same-origin API base

  /* ---------- Session / Auth (localStorage — client side only) ---------- */
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
  }
  function setSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }
  function logout() { clearSession(); }

  /* ---------- HTTP helper ---------- */
  async function post(endpoint, body) {
    try {
      const res = await fetch(API + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      return await res.json();
    } catch (e) {
      console.error('API POST error:', endpoint, e);
      return { ok: false, error: 'Network error. Please check your connection and try again.' };
    }
  }

  async function get(endpoint) {
    try {
      const res = await fetch(API + endpoint);
      return await res.json();
    } catch (e) {
      console.error('API GET error:', endpoint, e);
      return { ok: false, error: 'Network error. Please check your connection and try again.' };
    }
  }

  /* ==========================================================================
     AUTH
     ========================================================================== */

  async function customerLogin(email, password) {
    const r = await post('/login', { email, password });
    if (r.ok) {
      setSession({ type: 'customer', customerId: r.customer.id, name: r.customer.name, email: r.customer.email, ts: Date.now() });
      return { ok: true, customer: r.customer };
    }
    return r;
  }

  async function adminLogin(password) {
    const r = await post('/admin/login', { password });
    if (r.ok) {
      setSession({ type: 'admin', name: r.name, ts: Date.now() });
      return { ok: true };
    }
    return r;
  }

  /* ==========================================================================
     SIGNUP
     ========================================================================== */

  async function submitSignup(data) {
    return await post('/signup', data);
  }

  /* ==========================================================================
     CUSTOMER DATA
     ========================================================================== */

  async function getCustomerData(customerId) {
    const r = await get('/customer/' + customerId);
    if (r.ok) {
      return {
        customer: r.customer, accounts: r.accounts, cards: r.cards, txns: r.txns,
        pendingLoans: r.pendingLoans, pendingCards: r.pendingCards,
        pendingDeposits: r.pendingDeposits, pendingTxns: r.pendingTxns,
        pendingCrypto: r.pendingCrypto, pendingGiftcards: r.pendingGiftcards,
        chat: r.chat, chatUnread: r.chatUnread,
      };
    }
    return null;
  }

  /* ==========================================================================
     LOAN / CARD / DEPOSIT / TRANSACTION APPLICATIONS
     ========================================================================== */

  async function submitLoan(data) { return await post('/loan', data); }
  async function submitCardApp(data) { return await post('/card-app', data); }
  async function submitDeposit(data) { return await post('/deposit', data); }
  async function submitTransaction(data) { return await post('/transaction', data); }

  /* ==========================================================================
     CRYPTO
     ========================================================================== */

  async function getCryptoWallets() {
    const r = await get('/crypto/wallets');
    return r.ok ? r.wallets : {};
  }

  async function submitCryptoDeposit(data) { return await post('/crypto/deposit', data); }

  /* ==========================================================================
     GIFT CARDS
     ========================================================================== */

  async function submitGiftCardDeposit(data) { return await post('/giftcard/deposit', data); }

  /* ==========================================================================
     LIVE CHAT
     ========================================================================== */

  async function sendCustomerMessage(customerId, name, text) {
    return await post('/chat/send', { customerId, name, text });
  }

  async function sendAdminMessage(customerId, text) {
    return await post('/chat/admin-send', { customerId, text });
  }

  async function markChatReadByAdmin(customerId) {
    return await post('/chat/mark-read-admin', { customerId });
  }

  async function markChatReadByCustomer(customerId) {
    return await post('/chat/mark-read-customer', { customerId });
  }

  async function getChat(customerId) {
    // Get customer data which includes chat thread
    const r = await get('/customer/' + customerId);
    return r.ok ? (r.chat || []) : [];
  }

  async function getAllChats() {
    // Build from admin/all data
    const r = await get('/admin/all');
    if (!r.ok) return [];
    const db = r.db;
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
  }

  /* ==========================================================================
     CUSTOMER SETTINGS
     ========================================================================== */

  async function changePassword(customerId, currentPassword, newPassword) {
    return await post('/settings/change-password', { customerId, currentPassword, newPassword });
  }

  async function changeEmail(customerId, newEmail, password) {
    return await post('/settings/change-email', { customerId, newEmail, password });
  }

  /* ==========================================================================
     ADMIN — DATA RETRIEVAL
     ========================================================================== */

  async function getPendingCounts() {
    const r = await get('/admin/counts');
    return r.ok ? r.counts : { signups: 0, loans: 0, cards: 0, deposits: 0, transactions: 0, crypto: 0, giftcards: 0, chat: 0 };
  }

  async function getAll() {
    const r = await get('/admin/all');
    return r.ok ? r.db : null;
  }

  /* ==========================================================================
     ADMIN — APPROVALS / REJECTIONS
     ========================================================================== */

  async function approveSignup(id, creditAmount) { return await post('/admin/approve-signup', { id, creditAmount }); }
  async function rejectSignup(id, reason) { return await post('/admin/reject-signup', { id, reason }); }
  async function approveLoan(id) { return await post('/admin/approve-loan', { id }); }
  async function rejectLoan(id, reason) { return await post('/admin/reject-loan', { id, reason }); }
  async function approveCard(id, limit, securityDeposit) { return await post('/admin/approve-card', { id, limit, securityDeposit }); }
  async function rejectCard(id, reason) { return await post('/admin/reject-card', { id, reason }); }
  async function confirmDepositPaid(cardId) { return await post('/admin/confirm-deposit-paid', { cardId }); }
  async function updateDeposit(cardId, securityDeposit) { return await post('/admin/update-deposit', { cardId, securityDeposit }); }
  async function approveDeposit(id) { return await post('/admin/approve-deposit', { id }); }
  async function rejectDeposit(id, reason) { return await post('/admin/reject-deposit', { id, reason }); }
  async function approveTransaction(id) { return await post('/admin/approve-transaction', { id }); }
  async function rejectTransaction(id, reason) { return await post('/admin/reject-transaction', { id, reason }); }
  async function approveCryptoDeposit(id) { return await post('/admin/approve-crypto', { id }); }
  async function rejectCryptoDeposit(id, reason) { return await post('/admin/reject-crypto', { id, reason }); }
  async function approveGiftCardDeposit(id) { return await post('/admin/approve-giftcard', { id }); }
  async function rejectGiftCardDeposit(id, reason) { return await post('/admin/reject-giftcard', { id, reason }); }

  /* ==========================================================================
     ADMIN — CRYPTO WALLET MANAGEMENT
     ========================================================================== */

  async function updateCryptoWallet(coin, address, network) { return await post('/admin/update-wallet', { coin, address, network }); }
  async function addCryptoWallet(coin, address, network) { return await post('/admin/add-wallet', { coin, address, network }); }
  async function removeCryptoWallet(coin) { return await post('/admin/remove-wallet', { coin }); }

  /* ==========================================================================
     ADMIN — ACCOUNT OPERATIONS
     ========================================================================== */

  async function creditAccount(acctId, amount, reason, note) { return await post('/admin/credit-account', { acctId, amount, reason, note }); }
  async function toggleFreezeCustomer(customerId) { return await post('/admin/toggle-freeze', { customerId }); }

  /* ==========================================================================
     ADMIN — SYSTEM
     ========================================================================== */

  async function reset() { return await post('/admin/reset'); }

  /* ==========================================================================
     PUBLIC API — same interface as old summit-db.js but async
     ========================================================================== */
  return {
    getSession, setSession, clearSession, logout,
    customerLogin, adminLogin,
    submitSignup,
    getCustomerData,
    getPendingCounts, getAll,
    submitLoan, submitCardApp, submitDeposit, submitTransaction,
    getCryptoWallets, submitCryptoDeposit,
    submitGiftCardDeposit,
    sendCustomerMessage, sendAdminMessage,
    markChatReadByAdmin, markChatReadByCustomer,
    getChat, getAllChats,
    changePassword, changeEmail,
    approveSignup, rejectSignup,
    approveLoan, rejectLoan,
    approveCard, rejectCard,
    confirmDepositPaid, updateDeposit,
    approveDeposit, rejectDeposit,
    approveTransaction, rejectTransaction,
    approveCryptoDeposit, rejectCryptoDeposit,
    approveGiftCardDeposit, rejectGiftCardDeposit,
    updateCryptoWallet, addCryptoWallet, removeCryptoWallet,
    creditAccount, toggleFreezeCustomer,
    reset,
  };
})();
