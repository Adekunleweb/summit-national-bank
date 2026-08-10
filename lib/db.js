/* ==========================================================================
   Summit National Bank — Backend Database Module
   JSON file-based persistent storage. Shared by all API endpoints.
   Uses an in-memory cache (_db) so that nextId/addAudit/save don't wipe
   pending in-memory changes made by the caller.
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/* ---------- Default seed data ---------- */
function seed() {
  return {
    customers: [
      {
        id: 'CUST-0001',
        name: 'Alex Mitchell',
        email: 'alex.mitchell@email.com',
        password: 'demo1234',
        phone: '(617) 555-0142',
        dob: '1989-03-12',
        ssn: '•••-••-4421',
        ssnFull: '123-45-6789',
        selfie: '',
        address: '24 Beacon St, Boston, MA 02108',
        employer: 'TechCorp Inc.',
        createdAt: Date.now() - 86400000 * 30,
        status: 'active',
      }
    ],
    accounts: [
      { id: 'AC-9001', customerId: 'CUST-0001', name: 'Alex Mitchell', acctNo: '4532881077649021', type: 'Checking', balance: 12480.55, status: 'active', opened: '2023-04-12' },
      { id: 'AC-9002', customerId: 'CUST-0001', name: 'Alex Mitchell', acctNo: '8841223311903377', type: 'High-Yield Savings', balance: 48920.10, status: 'active', opened: '2023-04-12' },
      { id: 'AC-9003', customerId: 'CUST-0001', name: 'Alex Mitchell', acctNo: '9920445566775510', type: 'CD — 12 month', balance: 25000.00, status: 'active', opened: '2024-04-01' },
    ],
    cards: [
      { id: 'CC-0001', customerId: 'CUST-0001', name: 'Alex Mitchell', cardType: 'Summit Platinum Rewards', cardNo: '4532881077649021', limit: 15000, balance: 3240.50, expiry: '09/29', status: 'active', securityDeposit: 0, depositStatus: 'none', shipped: true },
    ],
    applications: {
      signups: [],
      loans: [],
      cards: [],
      deposits: [],
      transactions: [],
      crypto: [],
      giftcards: [],
    },
    cryptoWallets: {
      'Bitcoin (BTC)':  { address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', network: 'Bitcoin Mainnet' },
      'Ethereum (ETH)': { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1', network: 'ERC-20' },
      'Tether (USDT)':  { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1', network: 'TRC-20 / ERC-20' },
      'USDC':           { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1', network: 'ERC-20' },
      'Litecoin (LTC)': { address: 'ltc1qg9stkxrszkdqsuj92lm4c7akvk36zphqwgp75y', network: 'Litecoin Mainnet' },
      'Dogecoin (DOGE)':{ address: 'DJRFZNDQ5q3p2kZ7w5fK9hM3xQ8nL4vT2b', network: 'Dogecoin Mainnet' },
    },
    settings: {
      defaultCardSecurityDeposit: 250,
      defaultLoanFee: 150,
      newUserDepositMethods: ['Crypto Deposit', 'Gift Card Deposit', 'Wire Transfer'],
      newUserDepositRestrictionReason: 'Your deposit options are currently limited because your account has not yet established a transaction history and no withdrawals have been made to a verified personal bank account. Once you build up a history of activity and complete a withdrawal to an external bank account on file, all deposit methods will become available to you. This is a standard security measure to protect new account holders.',
      newUserDepositMethodsEnabled: true,
      loanFeeEnabled: true,
      bankName: 'Summit National Bank',
      bankPhone: '1-800-555-0142',
      bankEmail: 'support@summitnationalbank.com',
      processingTimeBusinessDays: '3-5 business days',
      cardProcessingTimeBusinessDays: '7-10 business days',
    },
    chats: {},
    transactions: [
      { id: 'TX-0001', customerId: 'CUST-0001', name: 'Alex Mitchell', acctNo: '4532881077649021', type: 'Deposit', direction: 'in', amount: 4250.00, recipient: 'Payroll — TechCorp Inc.', ref: 'PAYROLL-09', status: 'approved', date: Date.now() - 86400000 * 2 },
      { id: 'TX-0002', customerId: 'CUST-0001', name: 'Alex Mitchell', acctNo: '4532881077649021', type: 'Debit Purchase', direction: 'out', amount: 87.43, recipient: 'Whole Foods Market', ref: 'POS-4412', status: 'approved', date: Date.now() - 86400000 * 1 },
      { id: 'TX-0003', customerId: 'CUST-0001', name: 'Alex Mitchell', acctNo: '8841223311903377', type: 'Interest', direction: 'in', amount: 197.33, recipient: 'Interest Earned — Savings', ref: 'INT-04', status: 'approved', date: Date.now() - 3600000 * 18 },
    ],
    audit: [
      { id: 'AU-0001', text: 'System initialized with seed data.', icon: 'oth', time: new Date(Date.now() - 86400000 * 30).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), ts: Date.now() - 86400000 * 30, by: 'System' },
    ],
    counters: { signup: 1000, loan: 2000, card: 3000, deposit: 4000, txn: 5000, acct: 9003, cust: 1, audit: 1, cardissue: 1, crypto: 6000, giftcard: 7000, chat: 8000 },
  };
}

/* ---------- Storage with in-memory cache ---------- */
let _db = null;

function load() {
  // Return cached DB if already loaded — prevents reload-from-disk wiping
  // the caller's in-memory mutations.
  if (_db) return _db;
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      _db = JSON.parse(raw);
      // migration for older DB files
      if (!_db.applications) _db.applications = { signups: [], loans: [], cards: [], deposits: [], transactions: [] };
      _db.applications.crypto = _db.applications.crypto || [];
      _db.applications.giftcards = _db.applications.giftcards || [];
      if (!_db.cryptoWallets) _db.cryptoWallets = seed().cryptoWallets;
      if (!_db.settings) _db.settings = seed().settings;
      if (!_db.chats) _db.chats = {};
      if (_db.counters) {
        _db.counters.crypto = _db.counters.crypto || 6000;
        _db.counters.giftcard = _db.counters.giftcard || 7000;
        _db.counters.chat = _db.counters.chat || 8000;
      }
      return _db;
    }
  } catch (e) {
    console.error('DB load error:', e.message);
  }
  _db = seed();
  save();
  return _db;
}

function save() {
  if (!_db) return;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(_db, null, 2));
  } catch (e) {
    console.error('DB save error:', e.message);
  }
}

function reset() {
  _db = seed();
  save();
  return _db;
}

/* ---------- ID generation (operates on cached _db, no reload) ---------- */
function nextId(type) {
  const d = load(); // returns cached _db
  d.counters[type] = (d.counters[type] || 0) + 1;
  const prefixes = { signup: 'SU', loan: 'LN', card: 'CC', deposit: 'DP', txn: 'TX', acct: 'AC', cust: 'CUST', audit: 'AU', cardissue: 'CCI', crypto: 'CD', giftcard: 'GC', chat: 'MS' };
  // Note: do NOT call save() here — caller is responsible for calling save()
  // after their full mutation is complete. This prevents mid-mutation flushes.
  return prefixes[type] + '-' + String(d.counters[type]).padStart(4, '0');
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

/* ---------- Audit (operates on cached _db) ---------- */
function addAudit(text, icon, by) {
  const d = load();
  d.audit.push({
    id: nextId('audit'),
    text,
    icon,
    time: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    ts: Date.now(),
    by: by || 'System',
  });
  // Note: do NOT call save() here — caller saves after their full mutation.
}

/* ---------- Helpers ---------- */
function money(n) { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function money0(n) { return '$' + Math.round(Number(n)).toLocaleString('en-US'); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ---------- Backup (Railway persistence safety net) ---------- */
// Creates a timestamped JSON backup of the database, keeps the last 10.
// This runs automatically every hour on Railway, and can be called manually.
function backup() {
  if (!_db) return;
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(DATA_DIR, `db-backup-${ts}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(_db, null, 2));
    // Keep only the last 10 backups
    const backups = fs.readdirSync(DATA_DIR)
      .filter(f => f.startsWith('db-backup-'))
      .sort();
    while (backups.length > 10) {
      fs.unlinkSync(path.join(DATA_DIR, backups.shift()));
    }
    console.log(`[DB] Backup created: ${backupFile}`);
  } catch (e) {
    console.error('[DB] Backup error:', e.message);
  }
}

module.exports = {
  load, save, reset, backup,
  nextId, genAcctNo, genCardNo, addAudit,
  money, money0, esc,
};
