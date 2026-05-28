import React, { useState, useEffect, useRef } from 'react';
import { 
  Calculator, Package, Building2, Users, History, LogOut, Plus, Trash2, Lock, ShieldAlert, CheckCircle2, Download, Upload, Factory, Coins, PieChart, ShoppingCart, Edit2, Archive, Search, Truck, ScanLine, IndianRupee, LayoutDashboard, BarChart3, CalendarDays, Box, ArrowDown, ArrowUp, FileText, DatabaseBackup, ClipboardList, Store, ReceiptText, TrendingUp, CreditCard, Star, FileJson, BarChart2, AlertCircle, RefreshCw, ArrowLeftRight
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';

// ==========================================
// 1. FIREBASE SETUP & API KEYS (SECURED)
// ==========================================
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, writeBatch, runTransaction } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import './index.css'; 
import './App.css'; 

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================
// 2. HELPER FUNCTIONS (CSV)
// ==========================================
const downloadCSV = (data, filename) => {
  if (!data || data.length === 0) return alert("No data available to export.");
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header];
      const escaped = ('' + (val !== null && val !== undefined ? val : '')).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

const handleCSVImport = async (e, collectionName, getColRef, addLog, transformRow = null) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const text = event.target.result;
      const rawRows = text.split(/\r?\n/);
      
      const parseCSVLine = (line) => {
        const result = [];
        let currentVal = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"' && line[i+1] === '"') { currentVal += '"'; i++; } 
          else if (char === '"') { inQuotes = !inQuotes; } 
          else if (char === ',' && !inQuotes) { result.push(currentVal.trim()); currentVal = ''; } 
          else { currentVal += char; }
        }
        result.push(currentVal.trim());
        return result;
      };

      let headers = [];
      let headerRowIndex = -1;

      for (let i = 0; i < rawRows.length; i++) {
        if (!rawRows[i].trim()) continue;
        const cols = parseCSVLine(rawRows[i]);
        if (cols.some(c => c.trim() !== '')) {
          headers = cols;
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1 || headers.length === 0) {
        return alert("CSV is empty or missing valid headers.");
      }

      const getVal = (obj, ...possibleKeys) => {
        const normalizedKeys = possibleKeys.map(k => k.toLowerCase().replace(/[^a-z0-9]/g, ''));
        const foundKey = Object.keys(obj).find(k => normalizedKeys.includes(k.toLowerCase().replace(/[^a-z0-9]/g, '')));
        return foundKey ? obj[foundKey] : '';
      };

      let importedCount = 0;
      for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
        if (!rawRows[i].trim()) continue;
        const values = parseCSVLine(rawRows[i]);
        
        if (values.every(v => v.trim() === '')) continue;

        let obj = {};
        headers.forEach((header, index) => { 
            if (header.trim()) {
                obj[header.trim()] = values[index] !== undefined ? values[index] : ''; 
            }
        });

        if (Object.keys(obj).length > 0) {
          const finalObj = transformRow ? transformRow(obj, getVal) : obj;
          if (finalObj) {
            await addDoc(getColRef(collectionName), finalObj);
            importedCount++;
          }
        }
      }
      addLog(`Imported ${importedCount} records from CSV into ${collectionName}`);
      alert(`Successfully imported ${importedCount} records!`);
    } catch (err) {
      console.error("Import error:", err);
      alert("Error importing CSV. Ensure the format is correct.");
    } finally {
      e.target.value = null;
    }
  };
  reader.readAsText(file);
};

// ==========================================
// 3. MAIN APP COMPONENT
// ==========================================
export default function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [isDbReady, setIsDbReady] = useState(false);
  const [error, setError] = useState(null);

  const [erpUsers, setErpUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [items, setItems] = useState([]);
  const [production, setProduction] = useState([]);
  const [orders, setOrders] = useState([]);
  const [wastageLogs, setWastageLogs] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [costings, setCostings] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [productionPrefill, setProductionPrefill] = useState(null);

  const [currentErpUser, setCurrentErpUser] = useState(null);
  const [selectedUserForLogin, setSelectedUserForLogin] = useState(null);
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        setError(err.code || err.message);
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => setFirebaseUser(user));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    const getColRefRoot = (colName) => collection(db, colName);
    const logError = (err) => { console.error("Snapshot error:", err); setError(err.message); };

    const unsubUsers      = onSnapshot(getColRefRoot('erp_users'),       (snap) => setErpUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubCompanies  = onSnapshot(getColRefRoot('companies'),        (snap) => setCompanies(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubItems      = onSnapshot(getColRefRoot('items'),            (snap) => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubProduction = onSnapshot(getColRefRoot('production'),       (snap) => setProduction(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubOrders     = onSnapshot(getColRefRoot('orders'),           (snap) => setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubWastage    = onSnapshot(getColRefRoot('wastage'),          (snap) => setWastageLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubInventory  = onSnapshot(getColRefRoot('inventory'),        (snap) => setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubLogs       = onSnapshot(getColRefRoot('logs'),             (snap) => setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubCostings   = onSnapshot(getColRefRoot('costings'),         (snap) => setCostings(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubVendors    = onSnapshot(getColRefRoot('vendors'),          (snap) => setVendors(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubPOs        = onSnapshot(getColRefRoot('purchaseOrders'),   (snap) => setPurchaseOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubTxns       = onSnapshot(getColRefRoot('transactions'),      (snap) => setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubCustomers  = onSnapshot(getColRefRoot('customers'),          (snap) => setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);

    setIsDbReady(true);
    return () => { unsubUsers(); unsubCompanies(); unsubItems(); unsubProduction(); unsubOrders(); unsubWastage(); unsubInventory(); unsubLogs(); unsubCostings(); unsubVendors(); unsubPOs(); unsubTxns(); unsubCustomers(); };
  }, [firebaseUser]);

  const getColRef = (colName) => collection(db, colName);
  const getDocRef = (colName, docId) => doc(db, colName, docId);

  const addLog = async (action, specificUser = null) => {
    if (!firebaseUser) return;
    const userToLog = specificUser || currentErpUser;
    await addDoc(getColRef('logs'), { userId: userToLog?.id || 'System', userName: userToLog?.name || 'System', action: action, time: new Date().toISOString() });
  };

  const createInitialAdmin = async () => {
    await addDoc(getColRef('erp_users'), { name: 'Admin Boss', role: 'admin', password: 'admin', lastAccess: null });
    await addLog('System Initialized & Admin Created');
  };

  // ==========================================
  // FULL BACKUP — exports all collections as a ZIP of CSVs
  // ==========================================
  const downloadFullBackup = async () => {
    try {
      const zip = new JSZip();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

      const toCSV = (rows) => {
        if (!rows.length) return 'No data';
        const headers = [...new Set(rows.flatMap(r => Object.keys(r)))];
        const lines = [headers.join(',')];
        for (const row of rows) {
          lines.push(headers.map(h => {
            const v = row[h] !== null && row[h] !== undefined ? String(row[h]) : '';
            return `"${v.replace(/"/g, '""')}"`;
          }).join(','));
        }
        return lines.join('\n');
      };

      const allData = [
        { name: '01_companies',      data: companies },
        { name: '02_vendors',        data: vendors },
        { name: '03_purchase_orders',data: purchaseOrders },
        { name: '04_inventory',      data: inventory },
        { name: '05_orders',         data: orders },
        { name: '06_production',     data: production },
        { name: '07_wastage',        data: wastageLogs },
        { name: '08_items',          data: items },
        { name: '09_costings',       data: costings },
        { name: '10_transactions',   data: transactions },
        { name: '11_customers',       data: customers },
        { name: '12_logs',           data: logs },
        { name: '13_erp_users',      data: erpUsers.map(u => ({ id: u.id, name: u.name, role: u.role, companyId: u.companyId || '', lastAccess: u.lastAccess || '' })) },
      ];

      allData.forEach(({ name, data }) => zip.file(`${name}.csv`, toCSV(data)));

      // JSON backup for lossless fidelity (preserves nested arrays)
      const jsonPayload = { exportedAt: new Date().toISOString(), data: {} };
      allData.forEach(({ name, data }) => { jsonPayload.data[name] = data; });
      zip.file('full_backup.json', JSON.stringify(jsonPayload, null, 2));

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `apex_erp_backup_${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await addLog(`Full system backup downloaded`);
      alert(`Backup downloaded: apex_erp_backup_${timestamp}.zip`);
    } catch (err) {
      console.error('Backup error:', err);
      alert('Backup failed: ' + err.message);
    }
  };

  const login = async (userProfile) => {
    setCurrentErpUser(userProfile);
    setActiveTab('dashboard');
    await updateDoc(getDocRef('erp_users', userProfile.id), { lastAccess: new Date().toISOString() });
    await addLog(`Logged in`, userProfile);
  };

  const logout = () => {
    addLog(`Logged out`);
    setCurrentErpUser(null);
  };

  if (error) return <div className="p-8 text-red-500 font-bold">Database Error: {error}</div>;
  if (!isDbReady) return (
    <div className="apex-loading">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <div className="apex-loading-dot" />
          <div className="apex-loading-dot" />
          <div className="apex-loading-dot" />
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>Connecting to Apex ERP...</p>
      </div>
    </div>
  );

  if (erpUsers.length === 0) {
    return (
      <div className="apex-login-bg">
        <div className="apex-login-card" style={{ textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, background: '#1c1917', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <ShieldAlert style={{ width: 26, height: 26, color: '#fff' }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, color: '#1a1917' }}>Database Empty</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 28, fontSize: 14 }}>Welcome to Apex ERP. Create the first Admin account to get started.</p>
          <button onClick={createInitialAdmin} className="apex-btn apex-btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px 20px', fontSize: 14 }}>
            <CheckCircle2 style={{ width: 18, height: 18 }} /> Initialize System
          </button>
        </div>
      </div>
    );
  }

  if (!currentErpUser) {
    const handlePasswordSubmit = (e) => {
      e.preventDefault();
      if (selectedUserForLogin.password === loginPassword || (!selectedUserForLogin.password && loginPassword === '')) {
        login(selectedUserForLogin);
        setSelectedUserForLogin(null);
        setLoginPassword('');
        setLoginError('');
      } else {
        setLoginError('Incorrect password');
      }
    };
    return (
      <div className="apex-login-bg">
        <div className="apex-login-card">
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ width: 52, height: 52, background: '#1c1917', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Package style={{ width: 26, height: 26, color: '#fff' }} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1a1917', marginBottom: 6 }}>Apex ERP</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {selectedUserForLogin ? `Enter password for ${selectedUserForLogin.name}` : 'Select your profile to continue'}
            </p>
          </div>
          {!selectedUserForLogin ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...erpUsers].sort((a, b) => (a?.name || '').localeCompare(b?.name || '')).map(user => (
                <button key={user.id} onClick={() => setSelectedUserForLogin(user)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', border: '1.5px solid var(--border-md)', borderRadius: 10, background: '#fff', cursor: 'pointer', transition: 'border-color .15s, background .15s', fontFamily: 'var(--font)', textAlign: 'left' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#1c1917'; e.currentTarget.style.background = '#fafaf9'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; e.currentTarget.style.background = '#fff'; }}
                >
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 14, color: '#1a1917', marginBottom: 2 }}>{user.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{user.role}</p>
                  </div>
                  <Lock style={{ width: 15, height: 15, color: 'var(--text-muted)', flexShrink: 0 }} />
                </button>
              ))}
            </div>
          ) : (
            <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <input type="password" placeholder="Enter password" className="apex-input" value={loginPassword}
                  onChange={e => { setLoginPassword(e.target.value); setLoginError(''); }} autoFocus />
                {loginError && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{loginError}</p>}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => { setSelectedUserForLogin(null); setLoginPassword(''); setLoginError(''); }}
                  className="apex-btn apex-btn-secondary" style={{ flex: 1, justifyContent: 'center', padding: '10px 16px' }}>Back</button>
                <button type="submit" className="apex-btn apex-btn-primary" style={{ flex: 1, justifyContent: 'center', padding: '10px 16px' }}>Sign In</button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100svh', fontFamily: 'var(--font)' }}>
      <aside className="apex-sidebar">
        <div className="apex-sidebar-logo">
          <h2><Package style={{ width: 20, height: 20 }} /> Apex ERP</h2>
          <p>{currentErpUser.name} &mdash; <span style={{ textTransform: 'capitalize' }}>{currentErpUser.role}</span></p>
        </div>
        <nav className="apex-nav-section" style={{ flex: 1 }}>
          <NavButton icon={<LayoutDashboard />} label="Dashboard" isActive={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavButton icon={<Calculator />} label="Calculator" isActive={activeTab === 'calculator'} onClick={() => setActiveTab('calculator')} />
          {currentErpUser.role === 'admin' && <NavButton icon={<Coins />} label="Cost Calculator" isActive={activeTab === 'costing'} onClick={() => setActiveTab('costing')} />}
          <div className="apex-nav-label">Operations</div>
          <NavButton icon={<ShoppingCart />} label="Orders" isActive={activeTab === 'orders'} onClick={() => setActiveTab('orders')} />
          <NavButton icon={<Factory />} label="Production Log" isActive={activeTab === 'production'} onClick={() => setActiveTab('production')} />
          <NavButton icon={<Truck />} label="Finished Goods" isActive={activeTab === 'finished_goods'} onClick={() => setActiveTab('finished_goods')} />
          <NavButton icon={<PieChart />} label="Wastage & Gum" isActive={activeTab === 'wastage'} onClick={() => setActiveTab('wastage')} />
          <div className="apex-nav-label">Procurement</div>
          <NavButton icon={<Archive />} label="Stock Inventory" isActive={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} />
          <NavButton icon={<Package />} label="Box Database" isActive={activeTab === 'items'} onClick={() => setActiveTab('items')} />
          {currentErpUser.role === 'admin' && (
            <>
                  <div className="apex-nav-label">Reports & Admin</div>
              <NavButton icon={<Building2 />} label="My Units" isActive={activeTab === 'companies'} onClick={() => setActiveTab('companies')} />
              <NavButton icon={<Users />} label="Users & Access" isActive={activeTab === 'users'} onClick={() => setActiveTab('users')} />
              <NavButton icon={<History />} label="Activity Logs" isActive={activeTab === 'logs'} onClick={() => setActiveTab('logs')} />
            </>
          )}
        </nav>
        <div className="apex-sidebar-footer">
          {currentErpUser.role === 'admin' && (
            <button onClick={downloadFullBackup} className="apex-logout-btn" style={{ color: 'var(--amber)', borderTop: 'none', marginBottom: 2 }} title="Download full system backup as ZIP">
              <Download style={{ width: 14, height: 14 }} /> Full Backup
            </button>
          )}
          <button onClick={logout} className="apex-logout-btn">
            <LogOut style={{ width: 15, height: 15 }} /> Logout
          </button>
        </div>
      </aside>
      <main className="apex-main">
        {activeTab === 'dashboard'       && <DashboardView inventory={inventory} production={production} orders={orders} items={items} companies={companies} customers={customers} vendors={vendors} purchaseOrders={purchaseOrders} wastageLogs={wastageLogs} transactions={transactions} currentUser={currentErpUser} setActiveTab={setActiveTab} />}
        {activeTab === 'calculator'      && <CalculatorView companies={companies} items={items} addLog={addLog} currentUser={currentErpUser} />}
        {activeTab === 'costing'         && currentErpUser.role === 'admin' && <CostingView items={items} companies={companies} getColRef={getColRef} addLog={addLog} costings={costings} />}
        {activeTab === 'orders'          && <OrdersView orders={orders} production={production} items={items} companies={companies} customers={customers} addLog={addLog} role={currentErpUser.role} getColRef={getColRef} getDocRef={getDocRef} currentUser={currentErpUser} onStartProduction={(order) => { setProductionPrefill(order); setActiveTab('production'); }} />}
        {activeTab === 'production'      && <ProductionView inventory={inventory} production={production} orders={orders} items={items} companies={companies} addLog={addLog} role={currentErpUser.role} getColRef={getColRef} getDocRef={getDocRef} currentUser={currentErpUser} productionPrefill={productionPrefill} onClearPrefill={() => setProductionPrefill(null)} />}
        {activeTab === 'finished_goods'  && <FinishedGoodsView orders={orders} production={production} items={items} companies={companies} customers={customers} addLog={addLog} getColRef={getColRef} getDocRef={getDocRef} currentUser={currentErpUser} />}
        {activeTab === 'wastage'         && <WastageView wastageLogs={wastageLogs} orders={orders} companies={companies} production={production} addLog={addLog} role={currentErpUser.role} getColRef={getColRef} getDocRef={getDocRef} currentUser={currentErpUser} />}
        {activeTab === 'purchase_orders' && <PurchaseOrdersView purchaseOrders={purchaseOrders} vendors={vendors} companies={companies} inventory={inventory} addLog={addLog} role={currentErpUser.role} getColRef={getColRef} getDocRef={getDocRef} currentUser={currentErpUser} onNavigateInventory={() => setActiveTab('inventory')} />}
        {activeTab === 'inventory'       && <InventoryView inventory={inventory} production={production} addLog={addLog} role={currentErpUser.role} getColRef={getColRef} getDocRef={getDocRef} currentUser={currentErpUser} companies={companies} vendors={vendors} purchaseOrders={purchaseOrders} />}
        {activeTab === 'vendors'         && <VendorsView vendors={vendors} addLog={addLog} role={currentErpUser.role} getColRef={getColRef} getDocRef={getDocRef} currentUser={currentErpUser} purchaseOrders={purchaseOrders} />}
        {activeTab === 'items'           && <ItemsView items={items} companies={companies} addLog={addLog} role={currentErpUser.role} getColRef={getColRef} getDocRef={getDocRef} currentUser={currentErpUser} costings={costings} />}
        {activeTab === 'reports'         && currentErpUser.role === 'admin' && <ReportsView inventory={inventory} orders={orders} production={production} companies={companies} customers={customers} vendors={vendors} purchaseOrders={purchaseOrders} items={items} transactions={transactions} />}
        {activeTab === 'customers'        && currentErpUser.role === 'admin' && <CustomersView customers={customers} companies={companies} addLog={addLog} getColRef={getColRef} getDocRef={getDocRef} />}
        {activeTab === 'companies'       && <CompaniesView companies={companies} addLog={addLog} getColRef={getColRef} getDocRef={getDocRef} />}
        {activeTab === 'users'           && <UsersView users={erpUsers} companies={companies} addLog={addLog} getColRef={getColRef} getDocRef={getDocRef} currentUserId={currentErpUser.id} />}
        {activeTab === 'logs'            && <LogsView logs={logs} />}
      </main>
    </div>
  );
}

function NavButton({ icon, label, isActive, onClick }) {
  return (
    <button onClick={onClick} className={`apex-nav-btn ${isActive ? 'active' : ''}`}>
      {React.cloneElement(icon, { style: { width: 16, height: 16 } })}
      <span>{label}</span>
    </button>
  );
}

// --- DASHBOARD VIEW ---
function DashboardView({ inventory, production, orders, items, companies, customers = [], vendors = [], purchaseOrders = [], wastageLogs = [], transactions = [], currentUser, setActiveTab }) {
  const allowedCompanyId = currentUser?.role === 'admin' ? 'all' : (currentUser?.companyId || 'all');
  
  const now = new Date();
  const currentFYStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

  const [viewMode, setViewMode] = useState('month'); 
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedFY, setSelectedFY] = useState(currentFYStart);

  const yearOptions = [];
  for (let y = 2023; y <= now.getFullYear() + 1; y++) yearOptions.push(y);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  let startDate, endDate;
  if (viewMode === 'month') {
    startDate = new Date(selectedYear, selectedMonth, 1, 0, 0, 0);
    endDate = new Date(selectedYear, parseInt(selectedMonth) + 1, 0, 23, 59, 59);
  } else {
    startDate = new Date(selectedFY, 3, 1, 0, 0, 0); 
    endDate = new Date(parseInt(selectedFY) + 1, 2, 31, 23, 59, 59); 
  }

  const getInventoryAtDate = (targetDate) => {
    const balances = {};
    const usageStats = {}; 
    const reelNoToIds = {};
    
    inventory.forEach(reel => {
      if (new Date(reel.date) > targetDate) return; 
      const id = reel.id;
      const rNo = String(reel.reelNo || '').trim().toLowerCase();
      const initialIssued = parseFloat(reel.initialIssuedQty || 0);
      balances[id] = parseFloat(reel.receivedQty || 0) - initialIssued;
      usageStats[id] = { issued: 0 };
      
      if (rNo) {
          if (!reelNoToIds[rNo]) reelNoToIds[rNo] = [];
          reelNoToIds[rNo].push(id);
      }
    });

    const sortedProd = [...production].filter(p => new Date(p.date) <= targetDate).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    sortedProd.forEach(p => {
      if (p.consumedReels && p.consumedReels.length > 0) {
        p.consumedReels.forEach(cr => {
           const rNo = String(cr.reelNo || '').trim().toLowerCase();
           let remainingDeduct = parseFloat(cr.weight || 0);
           if (remainingDeduct > 0 && reelNoToIds[rNo]) {
             for (const id of reelNoToIds[rNo]) {
                 if (remainingDeduct <= 0) break;
                 const available = balances[id] || 0;
                 if (available > 0) {
                     const deduct = Math.min(available, remainingDeduct);
                     balances[id] -= deduct;
                     usageStats[id].issued += deduct;
                     remainingDeduct -= deduct;
                 }
             }
             if (remainingDeduct > 0) {
                 const lastId = reelNoToIds[rNo][reelNoToIds[rNo].length - 1];
                 balances[lastId] -= remainingDeduct;
                 usageStats[lastId].issued += remainingDeduct;
             }
           }
        });
      } else {
        if (!p.reelNos || !p.useKg) return;
        const pReels = String(p.reelNos || '').split(',').map(r => r.trim().toLowerCase()).filter(r => r);
        if (pReels.length === 0) return;
        let remainingUse = parseFloat(p.useKg || 0);
        pReels.forEach((rNo, index) => {
          if (remainingUse <= 0 || !reelNoToIds[rNo]) return;
          const isLast = (index === pReels.length - 1);
          for (const id of reelNoToIds[rNo]) {
             if (remainingUse <= 0) break;
             const available = balances[id] || 0;
             let deduct = 0;
             if (isLast) deduct = remainingUse;
             else { if (available <= 0) continue; deduct = Math.min(available, remainingUse); }
             if (deduct > 0) { balances[id] -= deduct; usageStats[id].issued += deduct; remainingUse -= deduct; }
          }
        });
      }
    });

    return inventory.filter(reel => new Date(reel.date) <= targetDate).map(reel => {
        const id = reel.id;
        const stats = usageStats[id] || { issued: 0 };
        const initialIssued = parseFloat(reel.initialIssuedQty || 0);
        const issuedQty = stats.issued + initialIssued;
        const received = parseFloat(reel.receivedQty || 0);
        const balanceQty = Math.max(0, received - issuedQty);
        const rate = parseFloat(reel.ratePerKg || 0);
        const value = balanceQty * rate;
        return { ...reel, balanceQty, value, companyId: reel.companyId || 'unassigned' };
    });
  };

  const getRmStockAtDate = (targetDate, compId) => {
    const inv = getInventoryAtDate(targetDate);
    let kg = 0, val = 0;
    inv.forEach(reel => {
        if (reel.category === 'Consumables') return;
        const rCompId = reel.companyId || 'unassigned';
        if (compId !== 'all' && rCompId !== compId) return;
        kg += reel.balanceQty; val += reel.value;
    });
    return { kg, val };
  };

  const getRmInward = (start, end, compId) => {
    let kg = 0, val = 0;
    inventory.forEach(reel => {
        if (reel.category === 'Consumables') return;
        const cId = reel.companyId || 'unassigned';
        if (compId !== 'all' && cId !== compId) return;
        const rDate = new Date(reel.date);
        if (rDate >= start && rDate <= end) {
            const qty = parseFloat(reel.receivedQty || 0);
            kg += qty; val += qty * parseFloat(reel.ratePerKg || 0);
        }
    });
    return { kg, val };
  };

  const getRmConsumedInPeriod = (start, end, compId) => {
    const reelLedger = {};
    inventory.forEach(r => {
      if (r.category === 'Consumables') return;
      const rNo = String(r.reelNo || '').trim().toLowerCase();
      reelLedger[rNo] = { rate: parseFloat(r.ratePerKg || 0), companyId: r.companyId || 'unassigned' };
    });

    let kg = 0, val = 0;
    production.forEach(p => {
        const pDate = new Date(p.date);
        if (pDate >= start && pDate <= end) {
            const cId = p.companyId || 'unassigned';
            if (compId !== 'all' && cId !== compId) return;
            if (p.consumedReels && p.consumedReels.length > 0) {
               p.consumedReels.forEach(cr => {
                  const used = parseFloat(cr.weight || 0);
                  kg += used;
                  const rNo = String(cr.reelNo || '').trim().toLowerCase();
                  const avgRate = reelLedger[rNo]?.rate || 0;
                  val += (used * avgRate);
               });
            } else {
               const used = parseFloat(p.useKg || 0);
               kg += used;
               const pReels = String(p.reelNos || '').split(',').map(r => r.trim().toLowerCase()).filter(r => r);
               let avgRate = 0;
               if (pReels.length > 0 && reelLedger[pReels[0]]) avgRate = reelLedger[pReels[0]].rate;
               val += (used * avgRate);
            }
        }
    });
    return { kg, val };
  };

  const getOrderStatsAtDate = (order, targetDate) => {
    const item = items.find(i => i.id === order.itemId);
    const pLogsToDate = production.filter(p => p.orderId === order.id && new Date(p.date) <= targetDate);
    
    let producedQty = 0;
    const isPpcOrder = item?.itemType === 'PPC' || item?.Item_Type === 'PPC';

    if (isPpcOrder) {
        const cPiecesPerSet = Math.max(1, parseInt(order.smallPerSet || 2) - 1);
        const sPiecesPerSet = Math.max(1, parseInt(order.commonPerSet || 2) - 1);
        let totalCommonPieces = 0, totalSmallPieces = 0;
        pLogsToDate.forEach(p => {
            const sheets = parseFloat(p.linerQty || 0);
            totalCommonPieces += sheets * parseInt(p.commonUps || order.commonUps || 0);
            totalSmallPieces += sheets * parseInt(p.smallUps || order.smallUps || 0);
        });
        producedQty = Math.min(Math.floor(totalCommonPieces / cPiecesPerSet), Math.floor(totalSmallPieces / sPiecesPerSet));
        if (isNaN(producedQty) || producedQty === Infinity) producedQty = 0;
    } else {
        const getGoodSheets = (p) => parseFloat(p.linerQty || 0);
        const sumBoard = pLogsToDate.filter(p => p.paperUsedFor === 'Board').reduce((acc, p) => acc + getGoodSheets(p), 0);
        const sumLiner = pLogsToDate.filter(p => p.paperUsedFor === 'Liner').reduce((acc, p) => acc + getGoodSheets(p), 0);
        const sumPaper = pLogsToDate.filter(p => p.paperUsedFor === 'Paper').reduce((acc, p) => acc + getGoodSheets(p), 0);
        
        const ply = parseInt(item?.ply || item?.Ply || 3);
        let effectiveBase = 0;
        if (ply <= 2) effectiveBase = sumBoard + sumPaper; 
        else if (ply === 3) effectiveBase = sumBoard + Math.min(sumLiner, sumPaper); 
        else if (ply === 5) effectiveBase = sumBoard + Math.min(Math.floor(sumLiner / 2), sumPaper);
        else if (ply === 7) effectiveBase = sumBoard + Math.min(Math.floor(sumLiner / 3), sumPaper);
        else effectiveBase = sumBoard + sumPaper;
        
        producedQty = Math.floor(effectiveBase * parseFloat(order.plannedUps || 1));
    }

    producedQty += parseInt(order.openingFgQty || 0);

    let dispatchedToDate = 0;
    if (order.dispatchHistory) {
      order.dispatchHistory.forEach(h => {
        const hDate = new Date(h.date);
        if (!isNaN(hDate) && hDate <= targetDate) dispatchedToDate += parseFloat(h.qty || 0);
      });
    }

    const specWeightKg = item?.weight || item?.Weight_g ? (parseFloat(item.weight || item.Weight_g) / 1000) : 0;
    const totalKgUsed = pLogsToDate.reduce((acc, p) => acc + Math.max(0, parseFloat(p.useKg || 0) - parseFloat(p.wasteSheetsKg || 0)), 0);
    const dynamicAvgWeightKg = producedQty > 0 ? (totalKgUsed / producedQty) : 0;
    const finalWeightPerBox = specWeightKg > 0 ? specWeightKg : dynamicAvgWeightKg;

    return { producedQty, inStock: Math.max(0, producedQty - dispatchedToDate), finalWeightPerBox, rate: parseFloat(order.rate || 0) };
  };

  const getFgStockAtDate = (targetDate, compId) => {
    let kg = 0, val = 0;
    orders.forEach(order => {
      if (compId !== 'all' && order.companyId !== compId) return;
      if (new Date(order.orderDate) > targetDate) return;
      const stats = getOrderStatsAtDate(order, targetDate);
      kg += stats.inStock * stats.finalWeightPerBox;
      val += stats.inStock * stats.rate;
    });
    return { kg, val };
  };

  const getSalesInPeriod = (start, end, compId) => {
    let kg = 0, val = 0;
    orders.forEach(order => {
      if (compId !== 'all' && order.companyId !== compId) return;
      let periodDispatchQty = 0;
      if (order.dispatchHistory) {
        order.dispatchHistory.forEach(h => {
          const hDate = new Date(h.date);
          if (!isNaN(hDate) && hDate >= start && hDate <= end) periodDispatchQty += parseFloat(h.qty || 0);
        });
      }
      if (periodDispatchQty > 0) {
        const stats = getOrderStatsAtDate(order, end);
        kg += periodDispatchQty * stats.finalWeightPerBox;
        val += periodDispatchQty * stats.rate;
      }
    });
    return { kg, val };
  };

  const companyMetrics = {};
  let grandTotalOpeningValue = 0; let grandTotalClosingValue = 0; let grandTotalSalesValue = 0; let grandTotalProdKg = 0;

  companies.forEach(comp => {
    if (allowedCompanyId !== 'all' && comp.id !== allowedCompanyId) return;
    const openingDate = new Date(startDate.getTime() - 1); 
    const rmOpen = getRmStockAtDate(openingDate, comp.id); const rmClose = getRmStockAtDate(endDate, comp.id);
    const rmInward = getRmInward(startDate, endDate, comp.id); const rmOutward = getRmConsumedInPeriod(startDate, endDate, comp.id);
    const fgOpen = getFgStockAtDate(openingDate, comp.id); const fgClose = getFgStockAtDate(endDate, comp.id);
    const fgSales = getSalesInPeriod(startDate, endDate, comp.id);
    
    const fgProduced = { kg: Math.max(0, fgClose.kg + fgSales.kg - fgOpen.kg), val: Math.max(0, fgClose.val + fgSales.val - fgOpen.val) };
    const totalOpeningVal = rmOpen.val + fgOpen.val; const totalClosingVal = rmClose.val + fgClose.val;

    if (totalOpeningVal > 0 || totalClosingVal > 0 || rmInward.val > 0 || fgSales.val > 0 || rmOutward.val > 0) {
      companyMetrics[comp.id] = { name: comp.name, rm: { opening: rmOpen, inward: rmInward, outward: rmOutward, closing: rmClose }, fg: { opening: fgOpen, produced: fgProduced, sales: fgSales, closing: fgClose } };
      grandTotalOpeningValue += totalOpeningVal; grandTotalClosingValue += totalClosingVal;
      grandTotalSalesValue += fgSales.val; grandTotalProdKg += rmOutward.kg;
    }
  });

  if (allowedCompanyId === 'all') {
    const openingDate = new Date(startDate.getTime() - 1); 
    const rmOpen = getRmStockAtDate(openingDate, 'unassigned'); const rmClose = getRmStockAtDate(endDate, 'unassigned');
    const rmInward = getRmInward(startDate, endDate, 'unassigned'); const rmOutward = getRmConsumedInPeriod(startDate, endDate, 'unassigned');
    
    if (rmOpen.val > 0 || rmClose.val > 0 || rmInward.val > 0 || rmOutward.val > 0) {
       companyMetrics['unassigned'] = { name: 'Unassigned Client (Raw Material Only)', rm: { opening: rmOpen, inward: rmInward, outward: rmOutward, closing: rmClose }, fg: { opening: {kg:0,val:0}, produced: {kg:0,val:0}, sales: {kg:0,val:0}, closing: {kg:0,val:0} } };
       grandTotalOpeningValue += rmOpen.val; grandTotalClosingValue += rmClose.val; grandTotalProdKg += rmOutward.kg;
    }
  }

  const sortedCompanyIds = Object.keys(companyMetrics).sort((a, b) => companyMetrics[a].name.localeCompare(companyMetrics[b].name));
  const displayPeriodName = viewMode === 'month' ? `${months[selectedMonth]} ${selectedYear}` : `FY ${selectedFY}-${parseInt(selectedFY) + 1}`;

  const chartData = sortedCompanyIds.map(id => {
    const m = companyMetrics[id];
    const totalClosing = m.rm.closing.val + m.fg.closing.val;
    return { name: m.name.length > 12 ? m.name.substring(0, 12) + '...' : m.name, Sales: m.fg.sales.val, ClosingValue: totalClosing, ProductionKg: m.rm.outward.kg };
  }).filter(d => d.Sales > 0 || d.ClosingValue > 0 || d.ProductionKg > 0);

  // Wastage trend: last 6 months average wastage %
  const wastageChartData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mo = d.getMonth(); const yr = d.getFullYear();
    const label = months[mo].substring(0, 3) + ' ' + String(yr).slice(2);
    const monthLogs = wastageLogs.filter(w => {
      const wd = new Date(w.date);
      return wd.getMonth() === mo && wd.getFullYear() === yr &&
        (allowedCompanyId === 'all' || w.companyId === allowedCompanyId || !w.companyId);
    });
    const avg = monthLogs.length > 0
      ? monthLogs.reduce((s, w) => s + parseFloat(w.calculatedWastagePercent || 0), 0) / monthLogs.length
      : 0;
    wastageChartData.push({ month: label, WastagePct: parseFloat(avg.toFixed(2)), entries: monthLogs.length });
  }

  // ── P&L (current month) ──
  const now2 = new Date();
  const plStart = new Date(now2.getFullYear(), now2.getMonth(), 1);
  const plEnd   = new Date(now2.getFullYear(), now2.getMonth() + 1, 0, 23, 59, 59);
  const reelLedger = {};
  inventory.forEach(r => { reelLedger[String(r.reelNo||'').trim().toLowerCase()] = parseFloat(r.ratePerKg||0); });
  let revenue = 0, cogs = 0, wastageVal = 0;
  orders.forEach(o => { (o.dispatchHistory||[]).forEach(h => { const d=new Date(h.date); if(d>=plStart&&d<=plEnd) revenue+=parseFloat(h.qty||0)*parseFloat(o.rate||0); }); });
  production.forEach(p => { const d=new Date(p.date); if(d<plStart||d>plEnd) return; if(p.consumedReels) p.consumedReels.forEach(cr=>{ cogs+=parseFloat(cr.weight||0)*(reelLedger[String(cr.reelNo||'').toLowerCase()]||0); }); else cogs+=parseFloat(p.useKg||0)*(reelLedger[(String(p.reelNos||'').split(',')[0]||'').trim().toLowerCase()]||0); wastageVal+=parseFloat(p.wasteSheetsKg||0)*5; });
  const grossProfit = revenue - cogs;
  const netProfit   = grossProfit - wastageVal;

  // ── Debtors (from dispatch history + Tally receipts) ──
  const customerReceipts = {};
  transactions.filter(t => t.type === 'receipt').forEach(t => {
    customerReceipts[t.partyId] = (customerReceipts[t.partyId] || 0) + parseFloat(t.amount || 0);
  });
  const debtors = (customers.length > 0 ? customers : companies).map(c => {
    const matchOrders = customers.length > 0 ? orders.filter(o=>o.customerId===c.id) : orders.filter(o=>o.companyId===c.id);
    let totalBilled = 0;
    matchOrders.forEach(o => { (o.dispatchHistory||[]).forEach(h => { totalBilled += parseFloat(h.qty||0)*parseFloat(o.rate||0); }); });
    const received = customerReceipts[c.id] || 0;
    const outstanding = totalBilled - received;
    return { name: c.name, totalBilled, received, outstanding };
  }).filter(d => d.totalBilled > 0 || d.received > 0).sort((a,b)=>b.outstanding-a.outstanding);

  // ── Creditors (received POs + Tally payments) ──
  const vendorPayments = {};
  transactions.filter(t => t.type === 'payment').forEach(t => {
    vendorPayments[t.partyId] = (vendorPayments[t.partyId] || 0) + parseFloat(t.amount || 0);
  });
  const creditors = vendors.map(v => {
    const totalPO = purchaseOrders.filter(p=>p.vendorId===v.id&&p.status==='Received').reduce((a,p)=>{
      const lines = p.lineItems || [{ qty: p.qty, ratePerKg: p.ratePerKg }];
      return a + lines.reduce((s,l)=>s+parseFloat(l.qty||0)*parseFloat(l.ratePerKg||0),0);
    },0);
    const paid = vendorPayments[v.id] || 0;
    const outstanding = totalPO - paid;
    return { name: v.name, totalPO, paid, outstanding };
  }).filter(c=>c.totalPO>0 || c.paid > 0).sort((a,b)=>b.outstanding-a.outstanding);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 48 }}>

      {/* ── Header ── */}
      <div className="apex-page-header">
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.025em' }}>Dashboard</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Live operational snapshot · {displayPeriodName}</p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <select className="apex-select" style={{ width:'auto', padding:'6px 10px', fontSize:12 }} value={viewMode} onChange={e=>setViewMode(e.target.value)}>
            <option value="month">Monthly</option><option value="year">Financial Year</option>
          </select>
          {viewMode === 'month' ? (<>
            <select className="apex-select" style={{ width:'auto', padding:'6px 10px', fontSize:12 }} value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}>
              {months.map((m,i)=><option key={i} value={i}>{m}</option>)}
            </select>
            <select className="apex-select" style={{ width:'auto', padding:'6px 10px', fontSize:12 }} value={selectedYear} onChange={e=>setSelectedYear(e.target.value)}>
              {yearOptions.map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </>) : (
            <select className="apex-select" style={{ width:'auto', padding:'6px 10px', fontSize:12 }} value={selectedFY} onChange={e=>setSelectedFY(e.target.value)}>
              {yearOptions.map(y=><option key={y} value={y}>FY {y}-{y+1}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* ── Today KPI Strip ── */}
      {(()=>{
        const today=new Date().toISOString().split('T')[0];
        const allOrders=allowedCompanyId==='all'?orders:orders.filter(o=>o.companyId===allowedCompanyId);
        const todayProd=production.filter(p=>p.date===today&&(allowedCompanyId==='all'||p.companyId===allowedCompanyId));
        const todayKg=todayProd.reduce((s,p)=>s+parseFloat(p.useKg||0),0);
        const activeOrders=allOrders.filter(o=>o.status!=='Completed').length;
        const overdueOrders=allOrders.filter(o=>o.status!=='Completed'&&o.deliveryDate&&new Date(o.deliveryDate)<new Date(today));
        const paperReels=inventory.filter(r=>!r.category||r.category==='Paper');
        const reelBal={}; const rn2id={};
        paperReels.forEach(r=>{ const rn=String(r.reelNo||'').trim().toLowerCase(); reelBal[r.id]=parseFloat(r.receivedQty||0)-parseFloat(r.initialIssuedQty||0); if(rn){if(!rn2id[rn])rn2id[rn]=[];rn2id[rn].push(r.id);} });
        production.forEach(p=>{ if(p.consumedReels)p.consumedReels.forEach(cr=>{ const rn=String(cr.reelNo||'').trim().toLowerCase(); let rem=parseFloat(cr.weight||0); (rn2id[rn]||[]).forEach(id=>{ if(rem<=0)return; const av=reelBal[id]||0; if(av>0){const d=Math.min(av,rem);reelBal[id]-=d;rem-=d;} }); }); });
        const LOW=parseInt(localStorage.getItem('apex_lowStockKg')||'200');
        const lowReels=paperReels.filter(r=>(reelBal[r.id]||0)>0&&(reelBal[r.id]||0)<LOW);
        const pendingPOs=purchaseOrders.filter(p=>p.status==='Pending').length;
        return (<>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:16 }}>
            {[
              { label:"Today's Paper Used", val:`${todayKg.toFixed(1)} kg`, sub:`${todayProd.length} entries`, color:'var(--text-primary)' },
              { label:'Active Orders', val:activeOrders, sub:'in progress', color:'var(--text-primary)' },
              { label:'Overdue Orders', val:overdueOrders.length, sub: overdueOrders.length>0?'action needed':'all on track', color: overdueOrders.length>0?'#dc2626':'var(--text-primary)', bg: overdueOrders.length>0?'#fff5f5':undefined, bc: overdueOrders.length>0?'#fecaca':undefined },
              { label:'Low Stock Reels', val:lowReels.length, sub:`below ${LOW} kg`, color: lowReels.length>0?'#b45309':'var(--text-primary)', bg: lowReels.length>0?'#fffbeb':undefined, bc: lowReels.length>0?'#fde68a':undefined },
              { label:'Pending POs', val:pendingPOs, sub:'not yet received', color:'var(--text-primary)' },
            ].map(k=>(
              <div key={k.label} className="apex-stat" style={k.bg?{background:k.bg,borderColor:k.bc}:{}}>
                <div className="apex-stat-label" style={k.color!=='var(--text-primary)'?{color:k.color}:{}}>{k.label}</div>
                <div className="apex-stat-value" style={{color:k.color}}>{k.val}</div>
                <div className="apex-stat-sub">{k.sub}</div>
              </div>
            ))}
          </div>
          {overdueOrders.length>0&&(
            <div className="apex-alert apex-alert-red" style={{marginBottom:16}}>
              <p style={{fontWeight:700,fontSize:13,marginBottom:6}}>Overdue Orders ({overdueOrders.length})</p>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {overdueOrders.map(o=>{ const days=Math.floor((new Date(today)-new Date(o.deliveryDate))/86400000); return <span key={o.id} className="apex-badge apex-badge-red">{companies.find(c=>c.id===o.companyId)?.name||'?'} — {o.itemName||o.Item_Name} ({days}d)</span>; })}
              </div>
            </div>
          )}
        </>);
      })()}

      {/* ── P&L + Debtors + Creditors ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14, marginBottom:20 }}>

        {/* P&L Card (current month) */}
        <div className="apex-card" style={{ overflow:'hidden' }}>
          <div style={{ background:'var(--brand)', padding:'12px 18px' }}>
            <p style={{ color:'#fff', fontWeight:700, fontSize:13 }}>P&L — {months[now2.getMonth()]} {now2.getFullYear()}</p>
            <p style={{ color:'rgba(255,255,255,.5)', fontSize:11, marginTop:2 }}>Current month estimate</p>
          </div>
          {[
            { label:'Revenue (Dispatched)', val:revenue, bold:true },
            { label:'Raw Material (COGS)', val:-cogs, indent:true },
            { label:'Wastage Cost (est.)', val:-wastageVal, indent:true },
            { label:'Gross Profit', val:grossProfit, bold:true, color: grossProfit>=0?'#15803d':'#dc2626' },
            { label:'Net Profit / (Loss)', val:netProfit, bold:true, color: netProfit>=0?'#15803d':'#dc2626' },
          ].map(row=>(
            <div key={row.label} style={{ display:'flex', justifyContent:'space-between', padding:'9px 18px', borderBottom:'1px solid var(--border)', background:row.bold?'var(--bg-secondary)':'#fff' }}>
              <span style={{ fontSize:12, fontWeight:row.bold?700:400, paddingLeft:row.indent?14:0, color:'var(--text-primary)' }}>{row.label}</span>
              <span style={{ fontSize:12, fontWeight:row.bold?700:500, color:row.color||(row.val<0?'#dc2626':'var(--text-primary)') }}>₹{Math.abs(row.val).toLocaleString('en-IN',{maximumFractionDigits:0})}{row.val<0?' (-)':''}</span>
            </div>
          ))}
        </div>

        {/* Debtors */}
        <div className="apex-card" style={{ overflow:'hidden' }}>
          <div style={{ background:'#1d4ed8', padding:'12px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <p style={{ color:'#fff', fontWeight:700, fontSize:13 }}>Customer Ledger Summary</p>
              <p style={{ color:'rgba(255,255,255,.5)', fontSize:11, marginTop:2 }}>Billed vs Receipts (All Time)</p>
            </div>
          </div>
          <div style={{ overflowY:'auto', maxHeight:220 }}>
            {debtors.length===0 ? <p style={{ padding:20, color:'var(--text-muted)', fontSize:12 }}>No customer data yet.</p> :
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11.5 }}>
                <thead>
                  <tr style={{ background:'var(--bg-secondary)', borderBottom:'1px solid var(--border)' }}>
                    <th style={{ padding:'6px 12px', textAlign:'left', fontWeight:700, color:'var(--text-secondary)' }}>Customer</th>
                    <th style={{ padding:'6px 12px', textAlign:'right', fontWeight:700, color:'var(--text-secondary)' }}>Billed</th>
                    <th style={{ padding:'6px 12px', textAlign:'right', fontWeight:700, color:'var(--text-secondary)' }}>Recd</th>
                    <th style={{ padding:'6px 12px', textAlign:'right', fontWeight:700, color:'var(--text-secondary)' }}>O/S</th>
                  </tr>
                </thead>
                <tbody>
                  {debtors.map(d=>(
                    <tr key={d.name} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'8px 12px', fontWeight:600 }}>{d.name}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right', color:'var(--text-secondary)' }}>₹{d.totalBilled.toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right', color:'#16a34a' }}>₹{d.received.toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:700, color: d.outstanding > 0 ? '#dc2626' : 'var(--text-secondary)' }}>₹{d.outstanding.toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          </div>
        </div>

        {/* Creditors */}
        <div className="apex-card" style={{ overflow:'hidden' }}>
          <div style={{ background:'#7c3aed', padding:'12px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <p style={{ color:'#fff', fontWeight:700, fontSize:13 }}>Vendor Ledger Summary</p>
              <p style={{ color:'rgba(255,255,255,.5)', fontSize:11, marginTop:2 }}>POs vs Payments (All Time)</p>
            </div>
          </div>
          <div style={{ overflowY:'auto', maxHeight:220 }}>
            {creditors.length===0 ? <p style={{ padding:20, color:'var(--text-muted)', fontSize:12 }}>No vendor data yet.</p> :
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11.5 }}>
                <thead>
                  <tr style={{ background:'var(--bg-secondary)', borderBottom:'1px solid var(--border)' }}>
                    <th style={{ padding:'6px 12px', textAlign:'left', fontWeight:700, color:'var(--text-secondary)' }}>Vendor</th>
                    <th style={{ padding:'6px 12px', textAlign:'right', fontWeight:700, color:'var(--text-secondary)' }}>PO Value</th>
                    <th style={{ padding:'6px 12px', textAlign:'right', fontWeight:700, color:'var(--text-secondary)' }}>Paid</th>
                    <th style={{ padding:'6px 12px', textAlign:'right', fontWeight:700, color:'var(--text-secondary)' }}>O/S</th>
                  </tr>
                </thead>
                <tbody>
                  {creditors.map(c=>(
                    <tr key={c.name} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'8px 12px', fontWeight:600 }}>{c.name}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right', color:'var(--text-secondary)' }}>₹{c.totalPO.toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right', color:'#16a34a' }}>₹{c.paid.toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:700, color: c.outstanding > 0 ? '#dc2626' : 'var(--text-secondary)' }}>₹{c.outstanding.toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          </div>
        </div>
      </div>

      {/* ── Grand Totals Strip ── */}
      {sortedCompanyIds.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
          {[
            { label:`Opening Stock (${displayPeriodName})`, val:`₹${grandTotalOpeningValue.toLocaleString('en-IN',{maximumFractionDigits:0})}`, color:'var(--text-primary)', bg:'#f8fafc' },
            { label:'Paper Consumed', val:`${grandTotalProdKg.toFixed(0)} kg`, color:'#b45309', bg:'#fffbeb' },
            { label:'Sales / Dispatch', val:`₹${grandTotalSalesValue.toLocaleString('en-IN',{maximumFractionDigits:0})}`, color:'#1d4ed8', bg:'#eff6ff' },
            { label:`Closing Stock (${displayPeriodName})`, val:`₹${grandTotalClosingValue.toLocaleString('en-IN',{maximumFractionDigits:0})}`, color:'#15803d', bg:'#f0fdf4' },
          ].map(s=>(
            <div key={s.label} style={{ background:s.bg, border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px' }}>
              <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'var(--text-muted)', marginBottom:6 }}>{s.label}</p>
              <p style={{ fontSize:22, fontWeight:800, color:s.color, margin:0 }}>{s.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Charts Row ── */}
      {chartData.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:20 }}>
          <div className="apex-card" style={{ padding:20, height:280 }}>
            <p style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', marginBottom:14, textTransform:'uppercase', letterSpacing:'.05em' }}>Sales vs Closing Stock (₹)</p>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top:0, right:0, left:0, bottom:24 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0eeec" />
                <XAxis dataKey="name" tick={{ fontSize:10, fill:'#9c9690' }} interval={0} angle={-30} textAnchor="end" />
                <YAxis tickFormatter={v=>`₹${v>=1000?(v/1000).toFixed(0)+'k':v}`} tick={{ fontSize:10, fill:'#9c9690' }} />
                <RechartsTooltip formatter={v=>`₹${v.toLocaleString()}`} contentStyle={{ fontSize:12, borderRadius:8 }} />
                <Bar dataKey="Sales" fill="#1c1917" radius={[4,4,0,0]} name="Sales" />
                <Bar dataKey="ClosingValue" fill="#d97706" radius={[4,4,0,0]} name="Closing Stock" />
                <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize:11 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="apex-card" style={{ padding:20, height:280 }}>
            <p style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', marginBottom:14, textTransform:'uppercase', letterSpacing:'.05em' }}>Paper Consumed per Unit (kg)</p>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top:0, right:0, left:0, bottom:24 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0eeec" />
                <XAxis dataKey="name" tick={{ fontSize:10, fill:'#9c9690' }} interval={0} angle={-30} textAnchor="end" />
                <YAxis tickFormatter={v=>`${v>=1000?(v/1000).toFixed(1)+'k':v}`} tick={{ fontSize:10, fill:'#9c9690' }} />
                <RechartsTooltip formatter={v=>`${v.toLocaleString()} kg`} contentStyle={{ fontSize:12, borderRadius:8 }} />
                <Bar dataKey="ProductionKg" fill="#2563eb" radius={[4,4,0,0]} name="Paper Consumed" />
                <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize:11 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Wastage Trend ── */}
      {wastageChartData.some(d=>d.WastagePct>0) && (
        <div className="apex-card" style={{ padding:20, height:220, marginBottom:20 }}>
          <p style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', marginBottom:4, textTransform:'uppercase', letterSpacing:'.05em' }}>Avg Wastage % — Last 6 Months</p>
          <p style={{ fontSize:11, color:'var(--text-muted)', marginBottom:10 }}>Green &lt;5% · Amber 5–8% · Red &gt;8%</p>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={wastageChartData} margin={{ top:4, right:0, left:0, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0eeec" />
              <XAxis dataKey="month" tick={{ fontSize:10, fill:'#9c9690' }} />
              <YAxis tickFormatter={v=>`${v}%`} tick={{ fontSize:10, fill:'#9c9690' }} domain={[0,'auto']} />
              <RechartsTooltip formatter={(v,n,p)=>[`${v}% (${p.payload.entries} logs)`,'Avg Wastage']} contentStyle={{ fontSize:12, borderRadius:8 }} />
              <Bar dataKey="WastagePct" radius={[4,4,0,0]} name="Avg Wastage %" label={{ position:'top', fontSize:9, formatter:v=>v>0?`${v}%`:'' }} fill="#16a34a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Per-Unit Ledger Cards ── */}
      {sortedCompanyIds.length === 0 ? (
        <div className="apex-card" style={{ padding:40, textAlign:'center' }}>
          <CalendarDays style={{ width:40, height:40, color:'var(--text-muted)', margin:'0 auto 12px' }} />
          <p style={{ color:'var(--text-secondary)', fontSize:14 }}>No ledger activity for <strong>{displayPeriodName}</strong>.</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--text-muted)' }}>Unit-wise Ledger — {displayPeriodName}</p>
          {sortedCompanyIds.map(compId => {
            const m = companyMetrics[compId];
            return (
              <div key={compId} className="apex-card" style={{ overflow:'hidden' }}>
                <div style={{ background:'var(--brand)', padding:'12px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <h4 style={{ color:'#fff', fontSize:14, fontWeight:700, margin:0 }}>{m.name}</h4>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>{displayPeriodName}</span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr' }}>
                  {/* RM */}
                  <div style={{ borderRight:'1px solid var(--border)' }}>
                    <div style={{ padding:'8px 16px', background:'#fafaf9', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:6 }}>
                      <Archive style={{ width:12, height:12, color:'var(--text-muted)' }} />
                      <span style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--text-muted)' }}>Raw Material</span>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)' }}>
                      {[['Opening',m.rm.opening],['Received',m.rm.inward],['Consumed',m.rm.outward],['Closing',m.rm.closing]].map(([lbl,data],i)=>(
                        <div key={lbl} style={{ padding:'12px 14px', borderRight:i<3?'1px solid var(--border)':'none', background:i===3?'#f0fdf4':'#fff' }}>
                          <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:i===3?'#15803d':'var(--text-muted)', marginBottom:3 }}>{lbl}</p>
                          <p style={{ fontSize:16, fontWeight:800, color:i===3?'#15803d':'var(--text-primary)', margin:0 }}>₹{data.val.toLocaleString('en-IN',{maximumFractionDigits:0})}</p>
                          <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{data.kg.toFixed(1)} kg</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* FG */}
                  <div>
                    <div style={{ padding:'8px 16px', background:'#fafaf9', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:6 }}>
                      <Package style={{ width:12, height:12, color:'var(--text-muted)' }} />
                      <span style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--text-muted)' }}>Finished Goods</span>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)' }}>
                      {[['Opening',m.fg.opening],['Produced',m.fg.produced],['Dispatched',m.fg.sales],['Closing',m.fg.closing]].map(([lbl,data],i)=>(
                        <div key={lbl} style={{ padding:'12px 14px', borderRight:i<3?'1px solid var(--border)':'none', background:i===3?'#f0fdf4':'#fff' }}>
                          <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:i===3?'#15803d':'var(--text-muted)', marginBottom:3 }}>{lbl}</p>
                          <p style={{ fontSize:16, fontWeight:800, color:i===3?'#15803d':'var(--text-primary)', margin:0 }}>₹{data.val.toLocaleString('en-IN',{maximumFractionDigits:0})}</p>
                          <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{data.kg.toFixed(1)} kg</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}



// --- CALCULATOR VIEW ---
function CalculatorView({ companies, items, addLog, currentUser }) {
  const allowedCompanyId = currentUser?.role === 'admin' ? 'all' : (currentUser?.companyId || 'all');
  const visibleCompanies = allowedCompanyId === 'all' ? companies : companies.filter(c => c.id === allowedCompanyId);

  const [selectedCompany, setSelectedCompany] = useState(allowedCompanyId !== 'all' ? allowedCompanyId : '');
  const [selectedItem, setSelectedItem] = useState('');
  const [quantity, setQuantity] = useState('');
  
  const [commonPerSet, setCommonPerSet] = useState(5);
  const [smallPerSet, setSmallPerSet] = useState(4);
  const [baseCommonUps, setBaseCommonUps] = useState(2); 
  const [baseSmallUps, setBaseSmallUps] = useState(6);   
  const [plannedUpsCommon, setPlannedUpsCommon] = useState(7); 
  const [plannedUpsSmall, setPlannedUpsSmall] = useState(7);   
  
  const [result, setResult] = useState(null);
  const [batchMode, setBatchMode] = useState(false);
  const [batchResults, setBatchResults] = useState([]);
  const [batchError, setBatchError] = useState('');

  useEffect(() => {
    if (visibleCompanies.length === 1 && !selectedCompany) {
      setSelectedCompany(visibleCompanies[0].id);
    }
  }, [visibleCompanies, selectedCompany]);

  const handleCalculate = (e) => {
    e.preventDefault();
    const item = items.find(i => i.id === selectedItem);
    if (!item || !quantity) return;

    const qty = parseInt(quantity);
    const sizeString = String(item.size || item.Size_mm || '0x0x0');
    const dimensions = sizeString.toLowerCase().replace(/\*/g, 'x').split('x').map(s => parseFloat(s.trim()) || 0);
    const L = dimensions[0] || 0;
    const W = dimensions[1] || 0;
    const H = dimensions[2] || 0; 
    
    const ply = parseInt(item.ply || item.Ply || 3);
    const gsm = parseFloat(item.paperGsm || item.Paper_GSM || 120); 
    const type = item.itemType || item.Item_Type || 'Box';

    let totalSqMeters = 0;
    let paperRequiredKg = 0;

    const numFlutes = Math.floor(ply / 2);
    const numLiners = Math.ceil(ply / 2);
    const flutingFactor = 1.40;

    if (type === 'PPC') {
      const cNeeded = (parseInt(smallPerSet) - 1) * qty;
      const sNeeded = (parseInt(commonPerSet) - 1) * qty;
      
      const baseC = parseInt(baseCommonUps) || 1;
      const baseS = parseInt(baseSmallUps) || 1;
      const pUpsC = parseInt(plannedUpsCommon) || 1;
      const pUpsS = parseInt(plannedUpsSmall) || 1;

      const commonPiecesPerCommonSheet = baseC * pUpsC;
      const smallPiecesPerCommonSheet = baseC * pUpsC; 
      const smallPiecesPerDedicatedSheet = baseS * pUpsS * 2;

      const commonSheetsNeeded = Math.ceil(cNeeded / commonPiecesPerCommonSheet);
      const smallPiecesAcquired = commonSheetsNeeded * smallPiecesPerCommonSheet;
      const remainingSmallNeeded = Math.max(0, sNeeded - smallPiecesAcquired);
      const smallSheetsNeeded = Math.ceil(remainingSmallNeeded / smallPiecesPerDedicatedSheet);
      
      const targetSheets = commonSheetsNeeded + smallSheetsNeeded;

      const boardWidthCommon = H * baseC;
      const boardLengthCommon = ((L + W) * pUpsC) + 10;
      
      const boardWidthSmall = boardWidthCommon; 
      const boardLengthSmall = (W * 2 * pUpsS) + 10;
      
      const areaCommon = (boardWidthCommon * boardLengthCommon) / 1000000;
      const areaSmall = (boardWidthSmall * boardLengthSmall) / 1000000;
      totalSqMeters = (commonSheetsNeeded * areaCommon) + (smallSheetsNeeded * areaSmall);
      
      const linerSqMeters = totalSqMeters * numLiners;
      const fluteSqMeters = totalSqMeters * numFlutes * flutingFactor;
      paperRequiredKg = ((linerSqMeters + fluteSqMeters) * gsm) / 1000; 

      setResult({
        isPpc: true, 
        targetSheets, 
        commonSheetsNeeded,
        smallSheetsNeeded,
        boardWidthCommon: boardWidthCommon.toFixed(2),
        boardLengthCommon: boardLengthCommon.toFixed(2),
        boardWidthSmall: boardWidthSmall.toFixed(2),
        boardLengthSmall: boardLengthSmall.toFixed(2),
        totalArea: totalSqMeters.toFixed(2), 
        paperRequired: paperRequiredKg.toFixed(2), 
        itemDetails: item,
        cNeeded, 
        sNeeded
      });

    } else {
      let boardLength = 0;
      let boardWidth = 0;

      switch (type) {
        case 'Box':
          boardLength = (L + W) * 2 + 50; 
          boardWidth = W + H + 20;
          break;
        case 'Tray':
        case 'Lid':
          boardLength = (L + W * 2) + 10;
          boardWidth = (W + 2 * H) + 10;
          break;
        case 'Sheet':
        case 'Plate':
          boardLength = L;
          boardWidth = W;
          break;
        default:
          boardLength = L; 
          boardWidth = W;
      }

      const sqMetersPerBox = (boardLength * boardWidth) / 1000000;
      totalSqMeters = sqMetersPerBox * qty;
      
      const linerSqMeters = totalSqMeters * numLiners;
      const fluteSqMeters = totalSqMeters * numFlutes * flutingFactor;
      paperRequiredKg = ((linerSqMeters + fluteSqMeters) * gsm) / 1000; 

      setResult({
        isPpc: false, 
        boardLength: boardLength.toFixed(2), 
        boardWidth: boardWidth.toFixed(2), 
        totalArea: totalSqMeters.toFixed(2), 
        paperRequired: paperRequiredKg.toFixed(2), 
        itemDetails: item 
      });
    }

    addLog(`Calculated materials for ${qty}x ${item.name || item.Item_Name} (${type})`);
  };

  // ---- BATCH CALCULATOR (CSV/Excel) ----
  const calcBoxPaper = (L, W, H, ply, gsm, type, qty) => {
    const numFlutes = Math.floor(ply / 2);
    const numLiners = Math.ceil(ply / 2);
    const ff = 1.40;
    let bL = 0, bW = 0;
    switch (type) {
      case 'Tray': case 'Lid': bL = L + W * 2 + 10; bW = W + 2 * H + 10; break;
      case 'Sheet': case 'Plate': bL = L; bW = W; break;
      default: bL = (L + W) * 2 + 50; bW = W + H + 20;
    }
    const sqm = (bL * bW / 1e6) * qty;
    const kg = ((sqm * numLiners + sqm * numFlutes * ff) * gsm) / 1000;
    return { boardLength: bL.toFixed(0), boardWidth: bW.toFixed(0), sqm: sqm.toFixed(2), kg: kg.toFixed(2) };
  };

  const handleBatchCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBatchError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const lines = ev.target.result.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) { setBatchError('File must have a header row + data rows.'); return; }
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const get = (row, ...keys) => { for (const k of keys) { const i = headers.findIndex(h => h.includes(k)); if (i >= 0 && row[i]) return row[i].trim(); } return ''; };
        const results = [];
        for (let i = 1; i < lines.length; i++) {
          const row = lines[i].split(',');
          const name = get(row, 'name', 'item', 'code', 'description') || `Row ${i}`;
          const type = get(row, 'type') || 'Box';
          const L = parseFloat(get(row, 'l', 'length')) || 0;
          const W = parseFloat(get(row, 'w', 'width')) || 0;
          const H = parseFloat(get(row, 'h', 'height', 'depth')) || 0;
          const ply = parseInt(get(row, 'ply', 'layer')) || 3;
          const gsm = parseFloat(get(row, 'gsm')) || 120;
          const bf = get(row, 'bf') || '-';
          const qty = parseInt(get(row, 'qty', 'quantity')) || 1;
          const calc = calcBoxPaper(L, W, H, ply, gsm, type, qty);
          results.push({ name, type, L, W, H, ply, gsm, bf, qty, ...calc });
        }
        setBatchResults(results);
      } catch (err) { setBatchError('Parse error: ' + err.message); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const filteredItems = items.filter(i => i.companyId === selectedCompany);
  const currentItemObj = items.find(i => i.id === selectedItem);
  const isPPC = currentItemObj?.itemType === 'PPC' || currentItemObj?.Item_Type === 'PPC';

  return (
    <div className="max-w-5xl mx-auto">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <h2 className="text-2xl font-bold">Material Calculator</h2>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => { setBatchMode(false); setBatchResults([]); }} className={`apex-btn ${!batchMode ? 'apex-btn-primary' : 'apex-btn-secondary'}`} style={{ fontSize:12 }}>Single Item</button>
          <button onClick={() => { setBatchMode(true); setResult(null); }} className={`apex-btn ${batchMode ? 'apex-btn-primary' : 'apex-btn-secondary'}`} style={{ fontSize:12 }}>Batch / CSV Mode</button>
        </div>
      </div>
      
      {!batchMode && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200">
          <form onSubmit={handleCalculate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Select Manufacturing Unit</label>
              <select className="w-full p-2 border border-stone-300 rounded-md bg-stone-50" value={selectedCompany} onChange={(e) => { setSelectedCompany(e.target.value); setSelectedItem(''); setResult(null); }} required>
                <option value="">-- Choose Unit --</option>
                {[...visibleCompanies].sort((a,b) => (a?.name || '').localeCompare(b?.name || '')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Select Box/Item</label>
              <select className="w-full p-2 border border-stone-300 rounded-md bg-stone-50" value={selectedItem} onChange={(e) => setSelectedItem(e.target.value)} disabled={!selectedCompany} required>
                <option value="">-- Choose Item --</option>
                {[...filteredItems].sort((a,b) => (a?.name || a?.Item_Name || '').localeCompare(b?.name || b?.Item_Name || '')).map(i => <option key={i.id} value={i.id}>{i.name || i.Item_Name} ({i.itemType || i.Item_Type})</option>)}
              </select>
            </div>

            {isPPC && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                <p className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2">PPC Die & Set Requirements</p>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-[10px] text-blue-700 mb-1">Common Pockets/Set</label><input required type="number" min="1" className="w-full p-2 border rounded text-sm" value={commonPerSet} onChange={e => setCommonPerSet(e.target.value)} /></div>
                  <div><label className="block text-[10px] text-blue-700 mb-1">Small Pockets/Set</label><input required type="number" min="1" className="w-full p-2 border rounded text-sm" value={smallPerSet} onChange={e => setSmallPerSet(e.target.value)} /></div>
                  
                  <div><label className="block text-[10px] text-blue-700 mb-1">Base Common Ups (Die)</label><input required type="number" min="1" className="w-full p-2 border rounded text-sm" value={baseCommonUps} onChange={e => setBaseCommonUps(e.target.value)} /></div>
                  <div><label className="block text-[10px] text-blue-700 mb-1">Base Small Ups (Die)</label><input required type="number" min="1" className="w-full p-2 border rounded text-sm" value={baseSmallUps} onChange={e => setBaseSmallUps(e.target.value)} /></div>
                  
                  <div><label className="block text-[10px] font-bold text-blue-700 mb-1">Planned Ups (Common Sht)</label><input required type="number" min="1" className="w-full p-2 border border-blue-300 rounded text-sm font-bold" value={plannedUpsCommon} onChange={e => setPlannedUpsCommon(e.target.value)} /></div>
                  <div><label className="block text-[10px] font-bold text-blue-700 mb-1">Planned Ups (Small Sht)</label><input required type="number" min="1" className="w-full p-2 border border-blue-300 rounded text-sm font-bold" value={plannedUpsSmall} onChange={e => setPlannedUpsSmall(e.target.value)} /></div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">{isPPC ? 'Order Quantity (Sets)' : 'Order Quantity'}</label>
              <input type="number" min="1" className="w-full p-2 border border-stone-300 rounded-md bg-stone-50" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 5000" required />
            </div>
            <button type="submit" className="w-full bg-stone-900 text-white py-3 rounded-md hover:bg-stone-800 transition font-medium">Calculate Raw Material</button>
          </form>
        </div>

        {result ? (
          <div className="bg-stone-900 text-stone-100 p-6 rounded-xl shadow-lg border border-stone-800">
            <h3 className="text-xl font-bold text-white mb-4 border-b border-stone-700 pb-2">Calculation Output</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-stone-400 text-sm">Selected Item</p>
                    <p className="text-lg font-semibold">{result.itemDetails.name || result.itemDetails.Item_Name}</p>
                    <p className="text-sm text-stone-300">{result.itemDetails.itemType || result.itemDetails.Item_Type}</p>
                  </div>
                  <div className="text-right text-xs bg-stone-800 p-2 rounded">
                    <p>{result.itemDetails.paperGsm || result.itemDetails.Paper_GSM} GSM</p>
                    <p>{result.itemDetails.paperBf || result.itemDetails.Paper_BF} BF</p>
                    <p>{result.itemDetails.paperColour || result.itemDetails.Paper_Colour}</p>
                  </div>
                </div>
                <p className="text-sm mt-2">Dimensions: {result.itemDetails.size || result.itemDetails.Size_mm} mm ({result.itemDetails.ply || result.itemDetails.Ply}-ply)</p>
              </div>

              {result.isPpc ? (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-stone-700">
                  <div>
                    <p className="text-stone-400 text-sm">Pieces Needed</p>
                    <p className="font-mono text-sm">{result.cNeeded} Common<br/>{result.sNeeded} Small</p>
                  </div>
                  <div>
                    <p className="text-stone-400 text-sm">Segregated Sheets</p>
                    <p className="font-mono text-sm text-blue-400 font-bold">{result.commonSheetsNeeded} Common<br/>{result.smallSheetsNeeded} Small</p>
                  </div>
                  <div>
                    <p className="text-stone-400 text-sm">Common Board Size</p>
                    <p className="font-mono text-sm">{result.boardLengthCommon} x {result.boardWidthCommon} mm</p>
                  </div>
                  <div>
                    <p className="text-stone-400 text-sm">Small Board Size</p>
                    <p className="font-mono text-sm">{result.boardLengthSmall} x {result.boardWidthSmall} mm</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-stone-400 text-sm">Total Combined Area (sq.m)</p>
                    <p className="font-mono text-lg">{result.totalArea}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-stone-700">
                  <div><p className="text-stone-400 text-sm">Board Size Needed</p><p className="font-mono text-lg">{result.boardLength} mm x {result.boardWidth} mm</p></div>
                  <div><p className="text-stone-400 text-sm">Total Area (sq.m)</p><p className="font-mono text-lg">{result.totalArea}</p></div>
                </div>
              )}

              <div className="pt-4 border-t border-stone-700">
                <p className="text-stone-400 text-sm">Estimated Paper Required</p>
                <p className="text-3xl font-bold text-white">{result.paperRequired} <span className="text-lg font-normal text-stone-400">kg</span></p>
              </div>
            </div>
          </div>
        ) : (
          <div className="border-2 border-dashed border-stone-300 rounded-xl flex items-center justify-center text-stone-400 p-6 text-center">
            Fill out the form and click Calculate to see raw material requirements.
          </div>
        )}
      </div>
      )} {/* end !batchMode */}

      {/* ── BATCH MODE ── */}
      {batchMode && (
        <div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 mb-6">
            <h3 className="font-bold mb-1 text-stone-800">Batch Paper Calculator — CSV Import</h3>
            <p className="text-xs text-stone-500 mb-3">Save your Excel as <strong>CSV</strong> (File → Save As → CSV). Required columns: <code>Name, Type, L, W, H, Ply, GSM, BF, Qty</code> — Type can be Box / Tray / Lid / Sheet.</p>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-stone-800 transition">
                Upload CSV
                <input type="file" accept=".csv,.txt" className="hidden" onChange={handleBatchCSV} />
              </label>
              {batchResults.length > 0 && (
                <button className="flex items-center gap-2 bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-800 transition" onClick={() => {
                  const header = 'Name,Type,L,W,H,Ply,GSM,BF,Qty,Board L(mm),Board W(mm),Area(sqm),Paper(kg)\n';
                  const rows = batchResults.map(r => `${r.name},${r.type},${r.L},${r.W},${r.H},${r.ply},${r.gsm},${r.bf},${r.qty},${r.boardLength},${r.boardWidth},${r.sqm},${r.kg}`).join('\n');
                  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([header + rows], {type:'text/csv'})); a.download = 'batch_calc_results.csv'; a.click();
                }}>Export Results CSV</button>
              )}
              {batchResults.length > 0 && <button className="text-stone-500 text-sm underline" onClick={() => setBatchResults([])}>Clear</button>}
              {batchError && <span className="text-red-600 text-sm font-medium">{batchError}</span>}
            </div>
          </div>

          {batchResults.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-x-auto">
              <table className="w-full text-left" style={{fontSize:12}}>
                <thead className="bg-stone-100 text-stone-600">
                  <tr>{['Item / Code','Type','L×W×H (mm)','Ply','GSM','BF','Qty','Board L(mm)','Board W(mm)','Area (sqm)','Paper Reqd (kg)'].map(h => <th key={h} className="p-3 whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {batchResults.map((r, i) => (
                    <tr key={i} className="border-t border-stone-100 hover:bg-stone-50">
                      <td className="p-3 font-medium">{r.name}</td>
                      <td className="p-3">{r.type}</td>
                      <td className="p-3">{r.L}×{r.W}×{r.H}</td>
                      <td className="p-3">{r.ply}</td>
                      <td className="p-3">{r.gsm}</td>
                      <td className="p-3">{r.bf}</td>
                      <td className="p-3">{r.qty}</td>
                      <td className="p-3">{r.boardLength}</td>
                      <td className="p-3">{r.boardWidth}</td>
                      <td className="p-3">{r.sqm}</td>
                      <td className="p-3 font-bold text-stone-900">{r.kg} kg</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-stone-400 bg-stone-50 font-bold text-sm">
                    <td className="p-3" colSpan={9}>TOTAL</td>
                    <td className="p-3">{batchResults.reduce((a,r)=>a+parseFloat(r.sqm),0).toFixed(2)} sqm</td>
                    <td className="p-3 text-emerald-700">{batchResults.reduce((a,r)=>a+parseFloat(r.kg),0).toFixed(2)} kg</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- COSTING VIEW ---
function CostingView({ items = [], companies = [], getColRef, addLog, costings = [] }) {
  // Helper to generate default plies
  const generatePlies = (count) => {
    const plies = [];
    for (let i = 0; i < count; i++) {
      const isFlute = i % 2 !== 0; 
      plies.push({
        id: i,
        name: isFlute ? `Fluting ${Math.ceil(i/2)}` : (i === 0 ? 'Top Liner' : (i === count - 1 ? 'Bottom Liner' : `Middle Liner ${Math.floor(i/2)}`)),
        gsm: isFlute ? 120 : 150,
        bf: 18,
        factor: isFlute ? 1.4 : 1.0,
        rate: isFlute ? 35 : 40
      });
    }
    return plies;
  };

  // Master State: Array of parts making up the Set
  const [parts, setParts] = useState([{
    id: Date.now(),
    partName: 'Main Box',
    qtyPerSet: 1,
    calcMode: 'auto', // 'auto' or 'manual'
    manualWeight: '',
    manualRate: '',
    itemType: 'Box',
    size: '',
    plyCount: 3,
    conversionCost: 0,
    pocketsLength: 3,
    pocketsWidth: 2,
    plyDetails: generatePlies(3)
  }]);

  const [saveTarget, setSaveTarget] = useState({ companyId: '', itemId: '' });
  const [saveMsg, setSaveMsg] = useState('');
  const [batchCostMode, setBatchCostMode] = useState(false);
  const [batchCostResults, setBatchCostResults] = useState([]);
  const [batchCostError, setBatchCostError] = useState('');

  // ── BATCH CSV COST CALCULATOR ──
  const handleBatchCostCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBatchCostError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const lines = ev.target.result.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) { setBatchCostError('CSV must have a header row + at least one data row.'); return; }
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const get = (row, ...keys) => { for (const k of keys) { const i = headers.findIndex(h => h.includes(k)); if (i >= 0 && row[i]?.trim()) return row[i].trim(); } return ''; };
        const results = [];
        for (let i = 1; i < lines.length; i++) {
          const row = lines[i].split(',');
          const name     = get(row, 'name', 'item', 'code', 'desc') || `Row ${i}`;
          const type     = get(row, 'type') || 'Box';
          const size     = get(row, 'size', 'dimension') || '';
          const dims     = size.toLowerCase().replace(/\*/g, 'x').split('x').map(s => parseFloat(s.trim()) || 0);
          const L = dims[0]||0, W = dims[1]||0, H = dims[2]||0;
          const ply      = parseInt(get(row, 'ply', 'layer')) || 3;
          const gsm      = parseFloat(get(row, 'gsm')) || 120;
          const bf       = get(row, 'bf') || '-';
          const rate     = parseFloat(get(row, 'rate', 'price', '₹')) || 40;
          const conv     = parseFloat(get(row, 'conv', 'conversion', 'mfg')) || 0;
          const qty      = parseInt(get(row, 'qty', 'quantity')) || 1;

          // Geometry (same logic as CostingView engine)
          let boardAreaSqM = 0;
          if (type === 'Tray' || type === 'Lid') { boardAreaSqM = ((L + H*2 + 15) * (W + H*2 + 15)) / 1e6; }
          else if (type === 'Sheet' || type === 'Plate') { boardAreaSqM = (L * W) / 1e6; }
          else { boardAreaSqM = ((L+W)*2+50) * (W+H+20) / 1e6; }

          // Ply costs (simplified: single GSM & rate per ply, alternating liner/flute)
          const numFlutes = Math.floor(ply / 2);
          const numLiners = Math.ceil(ply / 2);
          const linerCost = boardAreaSqM * numLiners * gsm * 1.0 / 1000 * rate;
          const fluteCost = boardAreaSqM * numFlutes * gsm * 1.4 / 1000 * rate;
          const materialCost = linerCost + fluteCost;
          const totalCost = materialCost + conv;
          const weightKg  = (boardAreaSqM * numLiners * gsm * 1.0 / 1000) + (boardAreaSqM * numFlutes * gsm * 1.4 / 1000);

          results.push({ name, type, size: size||`${L}x${W}x${H}`, ply, gsm, bf, rate, conv, qty,
            boardAreaSqM: boardAreaSqM.toFixed(4), weightKg: weightKg.toFixed(3),
            unitCost: totalCost.toFixed(2), totalCost: (totalCost * qty).toFixed(2) });
        }
        setBatchCostResults(results);
      } catch (err) { setBatchCostError('Parse error: ' + err.message); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const addPart = () => {
    setParts([...parts, {
      id: Date.now(), partName: `Part ${parts.length + 1}`, qtyPerSet: 1, calcMode: 'auto', manualWeight: '', manualRate: '', itemType: 'Partition', size: '', plyCount: 3, conversionCost: 0, pocketsLength: 3, pocketsWidth: 2, plyDetails: generatePlies(3)
    }]);
  };

  const removePart = (id) => {
    if (parts.length > 1) {
      setParts(parts.filter(p => p.id !== id));
    } else {
      alert("A set must have at least one part.");
    }
  };

  const handlePartChange = (id, field, value) => {
    setParts(parts.map(p => {
      if (p.id === id) {
        const updated = { ...p, [field]: value };
        // Auto-regenerate plies if plyCount changes
        if (field === 'plyCount') {
          updated.plyDetails = generatePlies(parseInt(value) || 3);
        }
        return updated;
      }
      return p;
    }));
  };

  const handlePlyChange = (partId, plyIndex, field, value) => {
    setParts(parts.map(p => {
      if (p.id === partId) {
        const newPlies = [...p.plyDetails];
        newPlies[plyIndex][field] = parseFloat(value) || 0;
        return { ...p, plyDetails: newPlies };
      }
      return p;
    }));
  };

  // --- LIVE MATH ENGINE ---
  const calculatedParts = parts.map(part => {
    const qty = parseInt(part.qtyPerSet) || 1;

    // DIRECT WEIGHT ENTRY BYPASS
    if (part.calcMode === 'manual') {
      const singleWeightKg = parseFloat(part.manualWeight) || 0;
      const singleMaterialCost = singleWeightKg * (parseFloat(part.manualRate) || 0);
      const singleTotalCost = singleMaterialCost + parseFloat(part.conversionCost || 0);
      
      return { 
        ...part, boardAreaSqM: 0, uiDetails: {}, singleWeightKg, singleMaterialCost, singleTotalCost,
        totalWeightKg: singleWeightKg * qty, totalCost: singleTotalCost * qty
      };
    }

    // AUTO-GEOMETRY CALCULATION
    const dims = part.size.toLowerCase().replace(/\*/g, 'x').split('x').map(s => parseFloat(s.trim()) || 0);
    const L = dims[0] || 0; const W = dims[1] || 0; const H = dims[2] || 0;
    
    let boardAreaSqM = 0;
    let uiDetails = {};

    if (part.itemType === 'Partition') {
        const pL = parseInt(part.pocketsLength) || 1;
        const pW = parseInt(part.pocketsWidth) || 1;
        const latPieces = Math.max(0, pL - 1);  
        const longPieces = Math.max(0, pW - 1); 
        boardAreaSqM = ((latPieces * W * H) + (longPieces * L * H)) / 1000000;
        uiDetails = { latPieces, longPieces };
    } else {
        let bl = 0, bw = 0;
        if (part.itemType === 'Box') { bl = (L+W)*2+50; bw = W+H+20; }
        else if (part.itemType === 'Tray') { bl = L+(H*2)+15; bw = W+(H*2)+15; }
        else { bl = L; bw = W; }
        boardAreaSqM = (bl * bw) / 1000000;
        uiDetails = { bl, bw };
    }

    let singleWeightKg = 0;
    let singleMaterialCost = 0;

    part.plyDetails.forEach(ply => {
      const plyWt = (boardAreaSqM * ply.gsm * ply.factor) / 1000;
      singleWeightKg += plyWt;
      singleMaterialCost += (plyWt * ply.rate);
    });

    const singleTotalCost = singleMaterialCost + parseFloat(part.conversionCost || 0);

    return { 
      ...part, boardAreaSqM, uiDetails, singleWeightKg, singleMaterialCost, singleTotalCost,
      totalWeightKg: singleWeightKg * qty, totalCost: singleTotalCost * qty
    };
  });

  const grandTotalCost = calculatedParts.reduce((sum, p) => sum + p.totalCost, 0);
  const grandTotalWeight = calculatedParts.reduce((sum, p) => sum + p.totalWeightKg, 0);
  const blendedRatePerKg = grandTotalWeight > 0 ? (grandTotalCost / grandTotalWeight) : 0;

  return (
    <div className="max-w-7xl mx-auto pb-12">
      {/* ── MODE TOGGLE ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <h2 className="text-2xl font-bold">Cost Calculator</h2>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => setBatchCostMode(false)} className={`apex-btn ${!batchCostMode ? 'apex-btn-primary' : 'apex-btn-secondary'}`} style={{ fontSize:12 }}>Single Set Builder</button>
          <button onClick={() => { setBatchCostMode(true); }} className={`apex-btn ${batchCostMode ? 'apex-btn-primary' : 'apex-btn-secondary'}`} style={{ fontSize:12 }}>Batch CSV Costing</button>
        </div>
      </div>

      {/* ── SINGLE SET MODE ── */}
      {!batchCostMode && (
      <div className="flex flex-col xl:flex-row gap-8 items-start">
      
      {/* LEFT COLUMN: PARTS BUILDER */}
      <div className="flex-1 space-y-6 w-full">
        <div className="flex justify-between items-center">
           <h2 className="text-2xl font-bold">Composite Set Costing</h2>
           <button onClick={addPart} className="bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-bold shadow hover:bg-stone-800 transition">+ Add Another Part to Set</button>
        </div>

        {calculatedParts.map((part, index) => (
          <div key={part.id} className="bg-white rounded-xl shadow-sm border border-stone-300 overflow-hidden">
            
            {/* PART HEADER */}
            <div className="bg-stone-100 p-4 border-b border-stone-200 flex flex-wrap gap-4 justify-between items-center">
               <div className="flex items-center gap-3 flex-1 min-w-[250px]">
                  <span className="bg-stone-800 text-white font-bold w-6 h-6 flex items-center justify-center rounded-full text-xs">{index + 1}</span>
                  <input type="text" className="p-1.5 border border-stone-300 rounded font-bold text-stone-800 bg-white" placeholder="Part Name (e.g. Outer Box)" value={part.partName} onChange={e => handlePartChange(part.id, 'partName', e.target.value)} />
               </div>
               <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                     <label className="text-xs font-bold text-stone-600 uppercase">Qty Per Set:</label>
                     <input type="number" min="1" className="w-16 p-1.5 border border-blue-300 bg-blue-50 rounded font-bold text-blue-900 text-center" value={part.qtyPerSet} onChange={e => handlePartChange(part.id, 'qtyPerSet', e.target.value)} />
                  </div>
                  {parts.length > 1 && <button onClick={() => removePart(part.id)} className="text-red-500 hover:text-red-700 text-sm font-bold px-2">Remove</button>}
               </div>
            </div>

            {/* PART CONFIGURATION */}
            <div className="p-6 border-b border-stone-100">
               
               {/* CALCULATION MODE TOGGLE */}
               <div className="flex items-center gap-6 mb-6 pb-4 border-b border-stone-200">
                 <label className="flex items-center gap-2 cursor-pointer">
                   <input type="radio" checked={part.calcMode === 'auto'} onChange={() => handlePartChange(part.id, 'calcMode', 'auto')} className="accent-stone-900 w-4 h-4" />
                   <span className="text-sm font-bold text-stone-700">Calculate from Plies & Dimensions</span>
                 </label>
                 <label className="flex items-center gap-2 cursor-pointer">
                   <input type="radio" checked={part.calcMode === 'manual'} onChange={() => handlePartChange(part.id, 'calcMode', 'manual')} className="accent-stone-900 w-4 h-4" />
                   <span className="text-sm font-bold text-stone-700">Direct Weight Entry</span>
                 </label>
               </div>

               {part.calcMode === 'manual' ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                   <div>
                     <label className="block text-xs font-bold text-stone-500 mb-1 uppercase tracking-wider">Weight per Piece (KG)</label>
                     <input type="number" step="0.001" className="w-full p-3 border border-orange-300 rounded-md bg-orange-50 font-mono text-orange-900 font-bold text-lg" placeholder="e.g. 0.450" value={part.manualWeight} onChange={e => handlePartChange(part.id, 'manualWeight', e.target.value)} />
                   </div>
                   <div>
                     <label className="block text-xs font-bold text-stone-500 mb-1 uppercase tracking-wider">Blended Material Rate (₹/KG)</label>
                     <input type="number" step="0.01" className="w-full p-3 border border-stone-300 rounded-md bg-white font-mono text-lg" placeholder="e.g. 42.50" value={part.manualRate} onChange={e => handlePartChange(part.id, 'manualRate', e.target.value)} />
                   </div>
                   <div>
                     <label className="block text-xs font-bold text-stone-500 mb-1 uppercase tracking-wider">Conversion/Mfg Cost (₹)</label>
                     <input type="number" step="0.01" className="w-full p-3 border border-stone-300 rounded-md bg-white font-mono text-lg" value={part.conversionCost} onChange={e => handlePartChange(part.id, 'conversionCost', e.target.value)} />
                   </div>
                 </div>
               ) : (
                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                   <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-stone-500 mb-1">Item Type</label>
                          <select className="w-full p-2 border border-stone-300 rounded-md bg-stone-50 font-bold" value={part.itemType} onChange={e => handlePartChange(part.id, 'itemType', e.target.value)}>
                            <option value="Box">Standard Box</option><option value="Tray">Tray</option><option value="Partition">Partition (Divider)</option><option value="Sheet">Flat Sheet</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-stone-500 mb-1">Number of Plies</label>
                          <select className="w-full p-2 border border-stone-300 rounded-md bg-stone-50" value={part.plyCount} onChange={e => handlePartChange(part.id, 'plyCount', e.target.value)}>
                            <option value={2}>2 Ply</option><option value={3}>3 Ply</option><option value={5}>5 Ply</option><option value={7}>7 Ply</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-stone-500 mb-1">
                          {part.itemType === 'Partition' ? 'Inner Box Size (L x W x H) mm' : (part.itemType === 'Sheet' ? 'Size (L x W) mm' : 'Size (L x W x H) mm')}
                        </label>
                        <input type="text" placeholder="e.g. 250x200x150" className="w-full p-2 border border-stone-300 rounded-md bg-white font-mono" value={part.size} onChange={e => handlePartChange(part.id, 'size', e.target.value)} />
                      </div>

                      {part.itemType === 'Partition' && (
                        <div className="grid grid-cols-2 gap-4 bg-blue-50 p-3 rounded border border-blue-100">
                          <div><label className="block text-[10px] font-bold text-blue-700 mb-1">Pockets along Length</label><input type="number" min="1" className="w-full p-1.5 border border-blue-300 rounded text-sm bg-white" value={part.pocketsLength} onChange={e => handlePartChange(part.id, 'pocketsLength', e.target.value)} /></div>
                          <div><label className="block text-[10px] font-bold text-blue-700 mb-1">Pockets along Width</label><input type="number" min="1" className="w-full p-1.5 border border-blue-300 rounded text-sm bg-white" value={part.pocketsWidth} onChange={e => handlePartChange(part.id, 'pocketsWidth', e.target.value)} /></div>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-medium text-stone-500 mb-1">Conversion/Mfg Cost (Per Piece)</label>
                        <input type="number" step="0.01" className="w-full p-2 border border-stone-300 rounded-md bg-white font-mono" value={part.conversionCost} onChange={e => handlePartChange(part.id, 'conversionCost', e.target.value)} />
                      </div>
                   </div>

                   <div className="bg-stone-50 border border-stone-200 rounded-lg p-4 flex flex-col justify-center">
                      <p className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-4 border-b border-stone-200 pb-2">Single Piece Geometry</p>
                      {part.boardAreaSqM > 0 ? (
                        <div className="space-y-2">
                           {part.itemType === 'Partition' ? (
                             <>
                               <p className="flex justify-between text-sm"><span className="text-stone-500">Longitudinal Strips:</span> <span className="font-mono text-stone-900">{part.uiDetails.longPieces} pcs</span></p>
                               <p className="flex justify-between text-sm"><span className="text-stone-500">Latitudinal Strips:</span> <span className="font-mono text-stone-900">{part.uiDetails.latPieces} pcs</span></p>
                             </>
                           ) : (
                             <>
                               <p className="flex justify-between text-sm"><span className="text-stone-500">Board Length:</span> <span className="font-mono text-stone-900">{part.uiDetails.bl?.toFixed(1)} mm</span></p>
                               <p className="flex justify-between text-sm"><span className="text-stone-500">Board Width:</span> <span className="font-mono text-stone-900">{part.uiDetails.bw?.toFixed(1)} mm</span></p>
                             </>
                           )}
                           <p className="flex justify-between text-base font-bold pt-2 border-t border-stone-200 mt-2"><span className="text-stone-700">Total Flat Area:</span> <span className="font-mono text-blue-700">{part.boardAreaSqM.toFixed(4)} m²</span></p>
                        </div>
                      ) : (
                        <p className="text-stone-400 text-sm text-center italic">Enter dimensions to calculate geometry.</p>
                      )}
                   </div>
                 </div>
               )}
            </div>

            {/* PLY TABLE (ONLY VISIBLE IF NOT MANUAL) */}
            {part.calcMode === 'auto' && (
              <div className="overflow-x-auto p-4 bg-white">
                <table className="w-full text-left">
                  <thead className="text-stone-400 text-xs uppercase tracking-wider">
                    <tr><th className="px-2 pb-2">Layer</th><th className="px-2 pb-2">GSM</th><th className="px-2 pb-2">BF</th><th className="px-2 pb-2">Flute Factor</th><th className="px-2 pb-2">Rate/KG</th><th className="px-2 pb-2 text-right">Weight (1 pc)</th><th className="px-2 pb-2 text-right">Cost (1 pc)</th></tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {part.plyDetails.map((ply, idx) => {
                      const plyWeightKg = (part.boardAreaSqM * ply.gsm * ply.factor) / 1000;
                      const plyCost = plyWeightKg * ply.rate;
                      return (
                        <tr key={ply.id} className="hover:bg-stone-50">
                          <td className="p-2 text-sm font-medium text-stone-600">{ply.name}</td>
                          <td className="p-1"><input type="number" className="w-16 p-1.5 border rounded text-xs" value={ply.gsm} onChange={e => handlePlyChange(part.id, idx, 'gsm', e.target.value)} /></td>
                          <td className="p-1"><input type="number" className="w-16 p-1.5 border rounded text-xs" value={ply.bf} onChange={e => handlePlyChange(part.id, idx, 'bf', e.target.value)} /></td>
                          <td className="p-1"><input type="number" step="0.1" className="w-16 p-1.5 border rounded text-xs" value={ply.factor} onChange={e => handlePlyChange(part.id, idx, 'factor', e.target.value)} /></td>
                          <td className="p-1"><input type="number" className="w-16 p-1.5 border rounded text-xs" value={ply.rate} onChange={e => handlePlyChange(part.id, idx, 'rate', e.target.value)} /></td>
                          <td className="p-2 text-right text-sm font-mono text-stone-700">{plyWeightKg > 0 ? `${plyWeightKg.toFixed(3)} kg` : '-'}</td>
                          <td className="p-2 text-right text-sm font-mono font-bold text-stone-800">{plyCost > 0 ? `₹${plyCost.toFixed(2)}` : '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* PART TOTAL FOOTER (SHOWS UNIT WEIGHT) */}
            <div className="bg-stone-800 text-white p-4 flex flex-wrap justify-between items-center gap-4">
               <div className="text-sm flex flex-wrap items-center gap-4 md:gap-8">
                  <div>
                    <span className="text-stone-400 mr-2 uppercase text-[10px] tracking-wider block">Unit Cost</span> 
                    <span className="font-mono font-bold text-green-400 text-lg">₹{part.singleTotalCost.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 mr-2 uppercase text-[10px] tracking-wider block">Unit Weight</span> 
                    <span className="font-mono font-bold text-orange-400 text-lg">{part.singleWeightKg.toFixed(3)} kg</span>
                  </div>
               </div>
               <div className="text-right">
                  <span className="text-stone-400 mr-2 uppercase text-xs tracking-wider block mb-1">Subtotal ({part.qtyPerSet}x Qty)</span> 
                  <span className="font-mono text-2xl font-bold">₹{part.totalCost.toFixed(2)}</span>
               </div>
            </div>
          </div>
        ))}
      </div>

      {/* RIGHT COLUMN: STICKY SET SUMMARY */}
      <div className="w-full xl:w-96 xl:sticky top-8 space-y-4">
         <div className="bg-stone-900 rounded-xl shadow-xl border border-stone-800 overflow-hidden">
            <div className="bg-stone-950 p-6 text-center border-b border-stone-800">
               <h3 className="text-stone-400 text-xs font-bold uppercase tracking-wider mb-2">Grand Total Set Cost</h3>
               <p className="text-5xl font-bold font-mono text-green-400">₹{grandTotalCost > 0 ? grandTotalCost.toFixed(2) : '0.00'}</p>
               <p className="text-stone-500 text-sm mt-2 font-mono">Blended: ₹{blendedRatePerKg.toFixed(2)} / kg</p>
            </div>
            
            <div className="p-6">
               <h4 className="text-stone-400 text-xs font-bold uppercase tracking-wider mb-4 border-b border-stone-700 pb-2">Set Composition</h4>
               <ul className="space-y-3 mb-6">
                 {calculatedParts.map((p, i) => (
                    <li key={p.id} className="flex justify-between items-start text-sm border-b border-stone-800 pb-3 last:border-0 last:pb-0">
                       <div className="flex flex-col">
                         <span className="text-stone-200 font-medium">
                           <span className="text-stone-500 mr-2">{p.qtyPerSet}x</span> {p.partName || `Part ${i+1}`}
                         </span>
                         <span className="text-stone-500 text-[11px] mt-1 font-mono">
                           Unit: {p.singleWeightKg.toFixed(3)} kg
                         </span>
                       </div>
                       <div className="text-right flex flex-col items-end">
                         <span className="font-mono font-bold text-white">₹{p.totalCost.toFixed(2)}</span>
                         <span className="text-stone-500 text-[11px] mt-1 font-mono">
                           Total: {p.totalWeightKg.toFixed(3)} kg
                         </span>
                       </div>
                    </li>
                 ))}
               </ul>

               <div className="bg-stone-800 p-4 rounded-lg border border-stone-700">
                  <p className="flex justify-between text-sm mb-1"><span className="text-stone-400">Total Set Weight:</span> <span className="font-mono text-white font-bold text-lg">{grandTotalWeight.toFixed(3)} kg</span></p>
                  <p className="flex justify-between text-sm"><span className="text-stone-400">Total Pieces:</span> <span className="font-mono text-white">{calculatedParts.reduce((s, p) => s + parseInt(p.qtyPerSet||0), 0)}</span></p>
               </div>
            </div>
         </div>

         {/* SAVE COSTING PANEL */}
         {getColRef && grandTotalCost > 0 && (
           <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-5">
             <h4 className="font-bold text-stone-800 mb-3 text-sm">Save Costing to Item</h4>
             <p className="text-xs text-stone-500 mb-3">Link this result to a box in your database so it appears in the Items list — no need to recalculate next time.</p>
             <div className="space-y-3">
               <div>
                 <label className="block text-xs text-stone-500 mb-1">Client Company</label>
                 <select className="w-full p-2 border rounded text-sm" value={saveTarget.companyId} onChange={e => setSaveTarget({ companyId: e.target.value, itemId: '' })}>
                   <option value="">-- Select Company --</option>
                   {[...companies].sort((a,b) => (a?.name||'').localeCompare(b?.name||'')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                 </select>
               </div>
               <div>
                 <label className="block text-xs text-stone-500 mb-1">Box / Item</label>
                 <select className="w-full p-2 border rounded text-sm" value={saveTarget.itemId} onChange={e => setSaveTarget({...saveTarget, itemId: e.target.value})} disabled={!saveTarget.companyId}>
                   <option value="">-- Select Item --</option>
                   {items.filter(i => i.companyId === saveTarget.companyId).sort((a,b) => (a?.name||a?.Item_Name||'').localeCompare(b?.name||b?.Item_Name||'')).map(i => <option key={i.id} value={i.id}>{i.name || i.Item_Name}</option>)}
                 </select>
               </div>
               {saveTarget.itemId && (
                 <div className="bg-stone-50 p-3 rounded border text-xs font-mono space-y-1">
                   <p className="flex justify-between"><span className="text-stone-500">Unit Cost:</span> <span className="font-bold text-stone-900">₹{grandTotalCost.toFixed(2)}</span></p>
                   <p className="flex justify-between"><span className="text-stone-500">Unit Weight:</span> <span className="font-bold text-stone-900">{grandTotalWeight.toFixed(3)} kg</span></p>
                   <p className="flex justify-between"><span className="text-stone-500">Blended Rate:</span> <span className="font-bold text-stone-900">₹{blendedRatePerKg.toFixed(2)}/kg</span></p>
                 </div>
               )}
               <button
                 onClick={async () => {
                   if (!saveTarget.itemId) return alert('Please select an item first.');
                   const item = items.find(i => i.id === saveTarget.itemId);
                   // Remove existing costing for this item first
                   const existing = costings.filter(c => c.itemId === saveTarget.itemId);
                   for (const ec of existing) {
                     const { deleteDoc, doc } = await import('firebase/firestore');
                     // We don't have getDocRef here so we use getColRef
                   }
                   await addDoc(getColRef('costings'), {
                     itemId: saveTarget.itemId,
                     companyId: saveTarget.companyId,
                     itemName: item?.name || item?.Item_Name || 'Unknown',
                     unitCost: parseFloat(grandTotalCost.toFixed(2)),
                     unitWeight: parseFloat(grandTotalWeight.toFixed(3)),
                     blendedRate: parseFloat(blendedRatePerKg.toFixed(2)),
                     parts: calculatedParts.map(p => ({ partName: p.partName, unitCost: parseFloat(p.singleTotalCost.toFixed(2)), unitWeight: parseFloat(p.singleWeightKg.toFixed(3)) })),
                     savedAt: new Date().toISOString()
                   });
                   addLog?.(`Saved costing for ${item?.name || item?.Item_Name}: ₹${grandTotalCost.toFixed(2)}/unit`);
                   setSaveMsg(`✓ Saved! ₹${grandTotalCost.toFixed(2)} / unit for ${item?.name || item?.Item_Name}`);
                   setTimeout(() => setSaveMsg(''), 4000);
                 }}
                 disabled={!saveTarget.itemId}
                 className="w-full bg-stone-900 text-white py-2 rounded-lg text-sm font-bold hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
               >
                 Save Costing
               </button>
               {saveMsg && <p className="text-xs text-green-700 font-bold bg-green-50 px-3 py-2 rounded border border-green-200">{saveMsg}</p>}
             </div>
           </div>
         )}
      </div>

      </div>
      )}

      {/* ── BATCH CSV COSTING MODE ── */}
      {batchCostMode && (
        <div>
          {/* Upload Panel */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 mb-6">
            <h3 className="font-bold text-stone-800 mb-1">Batch Cost Calculator — CSV Import</h3>
            <p className="text-xs text-stone-500 mb-1">Upload a CSV to get unit cost, weight, and area calculated for multiple box specs at once.</p>
            <p className="text-xs text-stone-400 mb-4">
              <strong>Required CSV columns:</strong>{' '}
              <code>Name, Type, Size, Ply, GSM, BF, Rate, Conv, Qty</code>{' '}—{' '}
              Type: <em>Box / Tray / Lid / Sheet</em> &nbsp;|&nbsp;
              Size: <em>LxWxH mm</em> &nbsp;|&nbsp;
              Rate: <em>₹/kg for paper</em> &nbsp;|&nbsp;
              Conv: <em>₹ conversion cost per piece (optional)</em>
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-stone-800 transition">
                Upload CSV
                <input type="file" accept=".csv,.txt" className="hidden" onChange={handleBatchCostCSV} />
              </label>
              {batchCostResults.length > 0 && (
                <button className="bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-800 transition" onClick={() => {
                  const hdr = 'Name,Type,Size,Ply,GSM,BF,Rate(₹/kg),Conv(₹),Qty,Board Area(sqm),Weight(kg),Unit Cost(₹),Total Cost(₹)\n';
                  const rows = batchCostResults.map(r => `${r.name},${r.type},${r.size},${r.ply},${r.gsm},${r.bf},${r.rate},${r.conv},${r.qty},${r.boardAreaSqM},${r.weightKg},${r.unitCost},${r.totalCost}`).join('\n');
                  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([hdr+rows],{type:'text/csv'})); a.download = 'batch_costing_results.csv'; a.click();
                }}>Export Results CSV</button>
              )}
              {batchCostResults.length > 0 && <button className="text-stone-500 text-sm underline" onClick={() => setBatchCostResults([])}>Clear</button>}
              {batchCostError && <span className="text-red-600 text-sm font-medium">{batchCostError}</span>}
            </div>
          </div>

          {/* Results Table */}
          {batchCostResults.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-x-auto">
              <table className="w-full text-left" style={{fontSize:12}}>
                <thead>
                  <tr className="bg-stone-900 text-white">
                    {['Item / Code','Type','Size (mm)','Ply','GSM','BF','Rate (₹/kg)','Conv (₹)','Qty','Board Area (m²)','Unit Wt (kg)','Unit Cost (₹)','Total Cost (₹)'].map(h => (
                      <th key={h} className="p-3 whitespace-nowrap font-semibold text-stone-300" style={{fontSize:10,textTransform:'uppercase',letterSpacing:'0.05em'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batchCostResults.map((r, i) => (
                    <tr key={i} className="border-t border-stone-100 hover:bg-stone-50">
                      <td className="p-3 font-semibold text-stone-900">{r.name}</td>
                      <td className="p-3 text-stone-600">{r.type}</td>
                      <td className="p-3 font-mono text-stone-700">{r.size}</td>
                      <td className="p-3 text-center">{r.ply}</td>
                      <td className="p-3 text-center">{r.gsm}</td>
                      <td className="p-3 text-center">{r.bf}</td>
                      <td className="p-3 text-right">₹{r.rate}</td>
                      <td className="p-3 text-right">₹{r.conv}</td>
                      <td className="p-3 text-center">{r.qty}</td>
                      <td className="p-3 text-right font-mono">{r.boardAreaSqM}</td>
                      <td className="p-3 text-right font-mono">{r.weightKg}</td>
                      <td className="p-3 text-right font-bold text-emerald-700">₹{r.unitCost}</td>
                      <td className="p-3 text-right font-bold text-stone-900">₹{r.totalCost}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-stone-400 bg-stone-800 text-white font-bold">
                    <td className="p-3" colSpan={11}>TOTALS</td>
                    <td className="p-3 text-right text-emerald-300">—</td>
                    <td className="p-3 text-right text-emerald-300">₹{batchCostResults.reduce((a,r) => a + parseFloat(r.totalCost), 0).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- WASTAGE VIEW (LINKED TO PRODUCTION) ---
function WastageView({ wastageLogs, orders, companies, production, addLog, role, getColRef, getDocRef, currentUser }) {
  const allowedCompanyId = currentUser?.role === 'admin' ? 'all' : (currentUser?.companyId || 'all');
  const visibleOrders = allowedCompanyId === 'all' ? orders : orders.filter(o => o.companyId === allowedCompanyId);

  const [newLog, setNewLog] = useState({ date: new Date().toISOString().split('T')[0], orderId: '', companyId: '', totalReelsKg: '', productionKg: '', paperWastage: '', sheetWastage: '', corePipe: '', balanceReel: '', gumUsed: '', gumPrice: localStorage.getItem('apex_lastGumPrice') || '' });

  const handleOrderLink = (orderId) => {
    if (!orderId) { 
      setNewLog({...newLog, orderId: '', companyId: '', totalReelsKg: ''}); 
      return; 
    }
    const ord = orders.find(o => o.id === orderId);
    
    const orderProdLogs = production.filter(p => p.orderId === orderId);
    const totalIssuedKg = orderProdLogs.reduce((sum, p) => sum + parseFloat(p.useKg || 0), 0);

    if (ord) {
      setNewLog({...newLog, orderId: orderId, companyId: ord.companyId, totalReelsKg: totalIssuedKg > 0 ? totalIssuedKg.toFixed(1) : ''});
    }
  };

  const tReels = parseFloat(newLog.totalReelsKg) || 0;
  const pKg = parseFloat(newLog.productionKg) || 0; 
  const pWastage = parseFloat(newLog.paperWastage) || 0;
  const sWastage = parseFloat(newLog.sheetWastage) || 0;
  const cPipe = parseFloat(newLog.corePipe) || 0;
  const bReel = parseFloat(newLog.balanceReel) || 0;
  const gUsed = parseFloat(newLog.gumUsed) || 0;
  const gPrice = parseFloat(newLog.gumPrice) || 0;

  const netPaperConsumed = tReels - bReel - cPipe;
  const goodProductionKg = pKg - sWastage;
  const totalWastageKg = pWastage + sWastage;
  const wastagePercent = netPaperConsumed > 0 ? (totalWastageKg / netPaperConsumed) * 100 : 0;
  const totalGumCost = gUsed * gPrice;
  const gumCostPerKgPaper = netPaperConsumed > 0 ? (totalGumCost / netPaperConsumed) : 0;

  const handleAdd = async (e) => {
    e.preventDefault();
    if (newLog.gumPrice) localStorage.setItem('apex_lastGumPrice', newLog.gumPrice);
    await addDoc(getColRef('wastage'), { ...newLog, calculatedNetPaper: netPaperConsumed.toFixed(2), goodProductionKg: goodProductionKg.toFixed(2), totalWastageKg: totalWastageKg.toFixed(2), calculatedWastagePercent: wastagePercent.toFixed(2), totalGumCost: totalGumCost.toFixed(2), gumCostPerKgPaper: gumCostPerKgPaper.toFixed(2) });
    addLog(`Added Wastage & Gum record for ${newLog.date}`);
    setNewLog({ date: new Date().toISOString().split('T')[0], orderId: '', companyId: '', totalReelsKg: '', productionKg: '', paperWastage: '', sheetWastage: '', corePipe: '', balanceReel: '', gumUsed: '', gumPrice: newLog.gumPrice });
  };

  const handleDelete = async (id, date) => {
    if(window.confirm(`Delete wastage log for ${date}?`)) {
      await deleteDoc(getDocRef('wastage', id));
      addLog(`Deleted wastage log for ${date}`);
    }
  };

  const visibleWastage = allowedCompanyId === 'all' ? wastageLogs : wastageLogs.filter(w => w.companyId === allowedCompanyId || !w.companyId);
  const draftWastage = visibleWastage.filter(w => w.isDraft);
  const completedWastage = visibleWastage.filter(w => !w.isDraft);

  const loadDraftIntoForm = (draft) => {
    setNewLog({
      date: draft.date || new Date().toISOString().split('T')[0],
      orderId: draft.orderId || '',
      companyId: draft.companyId || '',
      totalReelsKg: draft.totalReelsKg || '',
      productionKg: '', paperWastage: '', sheetWastage: '',
      corePipe: '', balanceReel: '',
      gumUsed: '', gumPrice: draft.gumPrice || localStorage.getItem('apex_lastGumPrice') || ''
    });
    // Delete the draft so it doesn't duplicate
    deleteDoc(getDocRef('wastage', draft.id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Wastage & Gum Calculator (Order-Wise)</h2>
        <button onClick={() => downloadCSV(visibleWastage, 'wastage_logs')} className="flex items-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-300 font-medium text-sm transition"><Download className="w-4 h-4" /> Export to Excel</button>
      </div>

      {draftWastage.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-6">
          <p className="text-sm font-bold text-amber-800 mb-3">⚡ {draftWastage.length} Draft Wastage Entr{draftWastage.length === 1 ? 'y' : 'ies'} Awaiting Completion</p>
          <div className="space-y-2">
            {draftWastage.map(draft => {
              const ordName = orders.find(o => o.id === draft.orderId)?.itemName || 'Unknown Order';
              const compName = companies.find(c => c.id === draft.companyId)?.name || '';
              return (
                <div key={draft.id} className="flex items-center justify-between bg-white border border-amber-200 rounded-lg px-4 py-3">
                  <div>
                    <p className="font-bold text-stone-900 text-sm">{draft.date} — {compName && `${compName}: `}{ordName}</p>
                    <p className="text-xs text-amber-700 font-medium">{draft.totalReelsKg} kg issued — needs paper wastage + gum data</p>
                  </div>
                  <button
                    onClick={() => loadDraftIntoForm(draft)}
                    className="bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded hover:bg-amber-700 whitespace-nowrap"
                  >
                    Complete Entry
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-stone-200">
          <h3 className="font-bold mb-4 border-b pb-2">Input Data</h3>
          
          <div className="col-span-1 md:col-span-2 bg-blue-50 p-4 rounded-lg border border-blue-100 mb-4">
            <label className="block text-xs font-bold text-blue-800 mb-1">Link to Order / Job</label>
            <select className="w-full p-2 border border-blue-200 rounded text-blue-900 bg-white" value={newLog.orderId || ''} onChange={e => handleOrderLink(e.target.value)}>
              <option value="">-- General / Daily Wastage (Not Linked) --</option>
              {visibleOrders.map(o => {
                const comp = companies.find(c => c.id === o.companyId)?.name || 'Unknown';
                return <option key={o.id} value={o.id}>{comp} - {o.itemName || o.Item_Name} ({o.orderQty} pcs) [{o.status}]</option>;
              })}
            </select>
          </div>

          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-1 md:col-span-2"><label className="block text-xs font-medium text-stone-500 mb-1">Date</label><input required type="date" className="w-full p-2 border border-stone-300 rounded bg-stone-50" value={newLog.date} onChange={e => setNewLog({...newLog, date: e.target.value})} /></div>
            <div className="col-span-1"><label className="block text-xs font-bold text-blue-600 mb-1">Total Reels Issued (KG)</label><input required type="number" step="0.1" className="w-full p-2 border border-blue-300 rounded bg-blue-50" value={newLog.totalReelsKg} onChange={e => setNewLog({...newLog, totalReelsKg: e.target.value})} /></div>
            <div className="col-span-1"><label className="block text-xs font-medium text-stone-500 mb-1">Gross Production (KG)</label><input required type="number" step="0.1" className="w-full p-2 border border-stone-300 rounded focus:ring-2 focus:ring-stone-800" value={newLog.productionKg} onChange={e => setNewLog({...newLog, productionKg: e.target.value})} /></div>
            <div className="col-span-1"><label className="block text-xs font-medium text-stone-500 mb-1">Paper Wastage (KG)</label><input required type="number" step="0.1" className="w-full p-2 border border-stone-300 rounded focus:ring-2 focus:ring-stone-800" value={newLog.paperWastage} onChange={e => setNewLog({...newLog, paperWastage: e.target.value})} /></div>
            <div className="col-span-1"><label className="block text-xs font-medium text-stone-500 mb-1">Sheet Wastage (KG)</label><input required type="number" step="0.1" className="w-full p-2 border border-stone-300 rounded focus:ring-2 focus:ring-stone-800" value={newLog.sheetWastage} onChange={e => setNewLog({...newLog, sheetWastage: e.target.value})} /></div>
            <div className="col-span-1"><label className="block text-xs font-medium text-stone-500 mb-1">Core Pipe Weight (KG)</label><input required type="number" step="0.1" className="w-full p-2 border border-stone-300 rounded focus:ring-2 focus:ring-stone-800" value={newLog.corePipe} onChange={e => setNewLog({...newLog, corePipe: e.target.value})} /></div>
            <div className="col-span-1 md:col-span-2"><label className="block text-xs font-medium text-stone-500 mb-1">Balance Reel Return (KG)</label><input required type="number" step="0.1" className="w-full p-2 border border-stone-300 rounded focus:ring-2 focus:ring-stone-800" value={newLog.balanceReel} onChange={e => setNewLog({...newLog, balanceReel: e.target.value})} /></div>
            <div className="col-span-1 border-t pt-4"><label className="block text-xs font-medium text-stone-500 mb-1">Actual Gum Used (KG)</label><input required type="number" step="0.1" className="w-full p-2 border border-stone-300 rounded focus:ring-2 focus:ring-stone-800" value={newLog.gumUsed} onChange={e => setNewLog({...newLog, gumUsed: e.target.value})} /></div>
            <div className="col-span-1 border-t pt-4"><label className="block text-xs font-medium text-stone-500 mb-1">Gum Price (per KG)</label><input required type="number" step="0.1" className="w-full p-2 border border-stone-300 rounded focus:ring-2 focus:ring-stone-800" value={newLog.gumPrice} onChange={e => setNewLog({...newLog, gumPrice: e.target.value})} /></div>
            <div className="col-span-1 md:col-span-2 mt-2"><button type="submit" className="w-full bg-stone-900 text-white p-3 rounded-lg flex items-center justify-center gap-2 hover:bg-stone-800"><Plus className="w-5 h-5" /> Save Job Log</button></div>
          </form>
        </div>
        <div className="lg:col-span-1 space-y-4">
           <div className="bg-stone-900 text-stone-100 p-6 rounded-xl shadow-lg border border-stone-800 h-full flex flex-col justify-center">
              <h3 className="text-stone-400 text-sm uppercase tracking-wider mb-6 border-b border-stone-700 pb-2">Live Calculation</h3>
              <div className="space-y-4">
                <div><p className="text-stone-400 text-xs mb-1">Net Paper Consumed</p><p className="text-2xl font-bold font-mono text-white">{netPaperConsumed > 0 ? netPaperConsumed.toFixed(2) : '0.00'} <span className="text-sm font-normal text-stone-500">kg</span></p></div>
                <div><p className="text-stone-400 text-xs mb-1">Actual Gum Used</p><p className="text-2xl font-bold font-mono text-white">{gUsed > 0 ? gUsed.toFixed(2) : '0.00'} <span className="text-sm font-normal text-stone-500">kg</span></p></div>
                <div className="bg-stone-800 p-4 rounded-lg border border-stone-700 mt-2"><p className="text-stone-300 text-xs uppercase mb-1">Gum Cost / KG Paper</p><p className="text-3xl font-bold font-mono text-green-400">{gumCostPerKgPaper > 0 ? gumCostPerKgPaper.toFixed(2) : '0.00'}</p><p className="text-xs text-stone-400 mt-1">Total Gum Cost: {totalGumCost > 0 ? totalGumCost.toFixed(2) : '0.00'}</p></div>
                <div className="bg-stone-800 p-4 rounded-lg border border-stone-700"><p className="text-stone-300 text-xs uppercase mb-1">Total Wastage</p><p className="text-3xl font-bold font-mono text-red-400">{wastagePercent > 0 ? wastagePercent.toFixed(2) : '0.00'} <span className="text-lg">%</span></p><p className="text-xs text-stone-400 mt-1">Weight: {totalWastageKg > 0 ? totalWastageKg.toFixed(2) : '0.00'} kg</p></div>
              </div>
           </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-left min-w-[1100px]">
          <thead className="bg-stone-100 text-stone-600 text-sm">
            <tr><th className="p-4">Date / Order</th><th className="p-4">Total Issued</th><th className="p-4">Core/Balance</th><th className="p-4">Prod (Gross/Good)</th><th className="p-4">Wastage (Pap/Sht)</th><th className="p-4 bg-stone-200">Net Paper</th><th className="p-4 bg-green-100 text-green-800">Gum Usage & Cost</th><th className="p-4 bg-red-100 text-red-800">Wastage %</th>{role === 'admin' && <th className="p-4 text-right">Actions</th>}</tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {visibleWastage.length === 0 && <tr><td colSpan="9" className="p-4 text-center text-stone-500">No records found.</td></tr>}
            {[...visibleWastage].sort((a,b) => {
               const dateA = new Date(a.date).getTime();
               const dateB = new Date(b.date).getTime();
               return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
            }).map(record => {
              const orderObj = orders.find(o => o.id === record.orderId);
              const compObj = companies.find(c => c.id === record.companyId);
              return (
              <tr key={record.id} className="hover:bg-stone-50">
                <td className="p-4">
                  <div className="font-bold text-stone-900">{record.date}</div>
                  {record.orderId ? (
                    <div className="text-xs mt-1">
                      <span className="text-blue-700 font-bold block">{compObj?.name || 'Unknown'}</span>
                      <span className="text-stone-500">{orderObj?.itemName || 'Unknown Job'}</span>
                    </div>
                  ) : <span className="text-[10px] text-stone-400 font-bold bg-stone-200 px-1 py-0.5 rounded">Not Linked</span>}
                </td>
                <td className="p-4">{record.totalReelsKg} kg</td>
                <td className="p-4 text-xs text-stone-500">Core: {record.corePipe}kg<br/>Bal: {record.balanceReel}kg</td>
                <td className="p-4"><p className="text-stone-500 text-xs">Gross: {record.productionKg} kg</p><p className="font-bold text-stone-800">Good: {record.goodProductionKg || (record.productionKg - record.sheetWastage).toFixed(2)} kg</p></td>
                <td className="p-4 text-sm text-red-600"><p>Pap: {record.paperWastage || 0} kg</p><p>Sht: {record.sheetWastage} kg</p></td>
                <td className="p-4 font-mono font-semibold bg-stone-50">{record.calculatedNetPaper} kg</td>
                <td className="p-4 bg-green-50/30"><p className="font-bold text-green-800 font-mono">{record.gumUsed || 0} <span className="text-xs font-normal text-green-700">kg</span></p><p className="text-xs font-medium text-stone-700 mt-1">₹{record.gumCostPerKgPaper} /kg</p></td>
                <td className="p-4 font-mono font-bold text-red-700 bg-red-50/30">{record.calculatedWastagePercent}%</td>
                {role === 'admin' && <td className="p-4 text-right"><button onClick={() => handleDelete(record.id, record.date)} className="text-red-500 hover:text-red-700"><Trash2 className="w-5 h-5 inline" /></button></td>}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- INVENTORY VIEW ---
function InventoryView({ inventory = [], production = [], addLog, role, getColRef, getDocRef, currentUser, companies = [], vendors = [], purchaseOrders = [] }) {
  const allowedCompanyId = currentUser?.role === 'admin' ? 'all' : (currentUser?.companyId || 'all');
  const visibleCompanies = allowedCompanyId === 'all' ? companies : companies.filter(c => c.id === allowedCompanyId);

  const [activeSubTab, setActiveSubTab] = useState('Paper'); 
  const [isScanning, setIsScanning] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState(() => parseInt(localStorage.getItem('apex_lowStockKg') || '200'));
  const handleThresholdChange = (val) => {
    const n = parseInt(val) || 200;
    setLowStockThreshold(n);
    localStorage.setItem('apex_lowStockKg', String(n));
  };

  const [editingId, setEditingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [commonData, setCommonData] = useState({ date: new Date().toISOString().split('T')[0], companyId: allowedCompanyId !== 'all' ? allowedCompanyId : '', vendorId: '', millName: '', invoiceNo: '', vehicleNo: '', paymentStatus: 'Unpaid', amountPaid: '' });
  const emptyReel = { reelNo: '', size: '', gsm: '', bf: '', colour: 'Kraft', receivedQty: '', initialIssuedQty: '', ratePerKg: '' };
  const [reelsInput, setReelsInput] = useState([{...emptyReel}]);
  const [filters, setFilters] = useState({ company: '', millName: '', searchReel: '', size: '', gsm: '', bf: '', colour: '', status: 'All' });

  const [consumableData, setConsumableData] = useState({ 
      date: new Date().toISOString().split('T')[0], itemName: 'Gum', vendorName: '', invoiceNo: '', receivedQty: '', rate: '', initialIssuedQty: '' 
  });
  const [consumableFilters, setConsumableFilters] = useState({ itemName: '', vendorName: '', status: 'All' });

  const handleScanInvoice = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsScanning(true);

    try {
      const base64Image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
      });

      const functions = getFunctions(app, 'asia-south1');
      const parseInvoice = httpsCallable(functions, 'parseInvoice');

      const response = await parseInvoice({ base64Image, mimeType: file.type });
      const data = response.data;

      setCommonData(prev => ({
        ...prev,
        millName: data.millName || prev.millName,
        invoiceNo: data.invoiceNo || prev.invoiceNo,
        date: data.date || prev.date
      }));

      if (data.lineItems && data.lineItems.length > 0) {
        setReelsInput(data.lineItems.map(item => ({
          reelNo: item.reelNo || '',
          size: item.size || '',
          gsm: item.gsm || '', 
          bf: item.bf || '',   
          colour: 'Kraft',
          receivedQty: item.weight || '',
          initialIssuedQty: '',
          ratePerKg: item.rate || ''
        })));
        if (addLog) addLog(`AI Scanned Invoice: ${data.invoiceNo || 'Unknown'}`);
      } else {
        alert("Invoice scanned, but no paper reels were detected.");
      }

    } catch (error) {
      console.error("Scan error:", error);
      alert(`Scanning failed: ${error.message}`);
    } finally {
      setIsScanning(false);
      e.target.value = null;
    }
  };

  const handleAddOrUpdate = async (e) => {
    e.preventDefault();
    if (editingId) {
      const singleReel = reelsInput[0];
      await updateDoc(getDocRef('inventory', editingId), { ...commonData, ...singleReel, category: 'Paper', tallySynced: false });
      if(addLog) addLog(`Updated inventory reel: ${singleReel.reelNo}`);
      setEditingId(null);
      setReelsInput([{...emptyReel}]);
    } else {
      const batch = writeBatch(db);
      let count = 0;
      reelsInput.forEach(reel => {
        if (!reel.reelNo) return; // Prevent saving completely blank reels
        const newDocRef = doc(getColRef('inventory'));
        batch.set(newDocRef, { ...commonData, ...reel, category: 'Paper', tallySynced: false });
        count++;
      });
      await batch.commit();
      if(addLog) addLog(`Added ${count} inventory reels from ${commonData.millName}`);
      setReelsInput([{...emptyReel}]); 
    }
  };

  const handleEdit = (reel) => { 
    setEditingId(reel.id); 
    setCommonData({ date: reel.date || '', companyId: reel.companyId || '', vendorId: reel.vendorId || '', millName: reel.millName || '', invoiceNo: reel.invoiceNo || '', vehicleNo: reel.vehicleNo || '', paymentStatus: reel.paymentStatus || 'Unpaid', amountPaid: reel.amountPaid || '' });
    setReelsInput([{ reelNo: reel.reelNo || '', size: reel.size || '', gsm: reel.gsm || '', bf: reel.bf || '', colour: reel.colour || 'Kraft', receivedQty: reel.receivedQty || '', initialIssuedQty: reel.initialIssuedQty || '', ratePerKg: reel.ratePerKg || '' }]);
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
  };
  
  const handleDelete = async (id, nameStr) => { 
    if(window.confirm(`Delete inventory record for ${nameStr}?`)) { 
        await deleteDoc(getDocRef('inventory', id)); 
        if(addLog) addLog(`Deleted inventory record: ${nameStr}`); 
    } 
  };
  
  const cancelEdit = () => { 
    setEditingId(null); 
    setCommonData({ date: new Date().toISOString().split('T')[0], companyId: allowedCompanyId !== 'all' ? allowedCompanyId : '', vendorId: '', millName: '', invoiceNo: '', vehicleNo: '', paymentStatus: 'Unpaid', amountPaid: '' });
    setReelsInput([{...emptyReel}]);
  };

  const addReelRow = () => setReelsInput([...reelsInput, {...emptyReel}]);
  const removeReelRow = (idx) => setReelsInput(reelsInput.filter((_, i) => i !== idx));
  const handleReelChange = (idx, field, val) => {
    const updated = [...reelsInput];
    updated[idx][field] = val;
    setReelsInput(updated);
  };

  const handleBulkDelete = async () => {
    if (role !== 'admin') return;
    if (window.confirm(`Are you sure you want to delete ${selectedIds.size} selected records?`)) {
        await Promise.all(Array.from(selectedIds).map(id => deleteDoc(getDocRef('inventory', id))));
        if(addLog) addLog(`Bulk deleted ${selectedIds.size} inventory records`);
        setSelectedIds(new Set());
    }
  };

  const handleWipeDatabase = async () => {
    if (role !== 'admin') return;
    const pwd = window.prompt("WARNING: You are about to permanently delete ALL records in this inventory database.\n\nTo confirm, please enter your admin password:");
    if (pwd === null) return; 
    if (pwd !== currentUser?.password) {
        alert("Incorrect password. Operation cancelled.");
        return;
    }
    if (window.confirm("FINAL WARNING: Are you absolutely sure you want to wipe the entire inventory database? This cannot be undone.")) {
        await Promise.all(inventory.map(reel => deleteDoc(getDocRef('inventory', reel.id))));
        if(addLog) addLog("WIPED entire inventory database");
        alert("Inventory database completely wiped.");
        setSelectedIds(new Set());
    }
  };

  const paperInventoryData = inventory.filter(i => !i.category || i.category === 'Paper');
  
  // --- THE FIX: Unique ID Tracking for Duplicate & Blank CSV Reels ---
  const balances = {}; 
  const usageStats = {}; 
  const reelNoToIds = {}; 

  paperInventoryData.forEach(reel => {
    const id = reel.id; // Using Firebase unique ID instead of text name
    const rNo = String(reel.reelNo || '').trim().toLowerCase();
    
    const initialIssued = parseFloat(reel.initialIssuedQty || 0);
    balances[id] = parseFloat(reel.receivedQty || 0) - initialIssued;
    usageStats[id] = { issued: 0, log: [] };
    
    if (initialIssued > 0) {
        usageStats[id].log.push({ date: reel.date || 'Unknown', usedFor: 'Initial / CSV Import', kg: initialIssued.toFixed(1) });
    }

    if (rNo) {
        if (!reelNoToIds[rNo]) reelNoToIds[rNo] = [];
        reelNoToIds[rNo].push(id);
    }
  });

  const sortedProd = [...production].sort((a,b) => {
      const dateA = new Date(a.date || 0).getTime();
      const dateB = new Date(b.date || 0).getTime();
      return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
  });
  
  sortedProd.forEach(p => {
    if (p.consumedReels && p.consumedReels.length > 0) {
      p.consumedReels.forEach(cr => {
         const rNo = String(cr.reelNo || '').trim().toLowerCase();
         let remainingDeduct = parseFloat(cr.weight || 0);
         
         if (remainingDeduct > 0 && reelNoToIds[rNo]) {
             for (const id of reelNoToIds[rNo]) {
                 if (remainingDeduct <= 0) break;
                 const available = balances[id] || 0;
                 if (available > 0) {
                     const deduct = Math.min(available, remainingDeduct);
                     balances[id] -= deduct;
                     usageStats[id].issued += deduct;
                     usageStats[id].log.push({ date: p.date || 'Unknown', usedFor: p.usedForItem || p.paperUsedFor || 'Unknown', kg: deduct.toFixed(1) });
                     remainingDeduct -= deduct;
                 }
             }
             if (remainingDeduct > 0) {
                 const lastId = reelNoToIds[rNo][reelNoToIds[rNo].length - 1];
                 balances[lastId] -= remainingDeduct;
                 usageStats[lastId].issued += remainingDeduct;
                 usageStats[lastId].log.push({ date: p.date || 'Unknown', usedFor: p.usedForItem || p.paperUsedFor || 'Unknown', kg: remainingDeduct.toFixed(1) });
             }
         }
      });
    } else {
      if (!p.reelNos || !p.useKg) return;
      const pReels = String(p.reelNos || '').split(',').map(r => r.trim().toLowerCase()).filter(r => r);
      if (pReels.length === 0) return;
      let remainingUse = parseFloat(p.useKg || 0);
      
      pReels.forEach((rNo, index) => {
        if (remainingUse <= 0 || !reelNoToIds[rNo]) return;
        const isLast = (index === pReels.length - 1);
        
        for (const id of reelNoToIds[rNo]) {
            if (remainingUse <= 0) break;
            const available = balances[id] || 0;
            let deduct = 0;
            if (isLast) {
                deduct = remainingUse; 
            } else {
                if (available <= 0) continue;
                deduct = Math.min(available, remainingUse);
            }
            if (deduct > 0) {
                balances[id] -= deduct;
                usageStats[id].issued += deduct;
                usageStats[id].log.push({ date: p.date || 'Unknown', usedFor: p.usedForItem || p.paperUsedFor || 'Unknown', kg: deduct.toFixed(1) });
                remainingUse -= deduct;
            }
        }
      });
    }
  });

  const inventoryWithUsage = paperInventoryData.map(reel => {
    const id = reel.id;
    const stats = usageStats[id] || { issued: 0, log: [] };
    const initialIssued = parseFloat(reel.initialIssuedQty || 0);
    const issuedQty = stats.issued + initialIssued;
    const received = parseFloat(reel.receivedQty || 0);
    const balanceQty = Math.max(0, received - issuedQty);
    const rate = parseFloat(reel.ratePerKg || 0);
    const value = balanceQty * rate;
    return { ...reel, issuedQty, balanceQty, value, ratePerKg: rate, usageLog: stats.log || [] };
  });

  const filteredInventory = inventoryWithUsage.filter(reel => {
    if (allowedCompanyId !== 'all' && reel.companyId !== allowedCompanyId) return false;
    if (filters.company && !(companies.find(c => c.id === reel.companyId)?.name || '').toLowerCase().includes(filters.company.toLowerCase())) return false;
    if (filters.millName && !String(reel.millName || '').toLowerCase().includes(filters.millName.toLowerCase())) return false;
    if (filters.searchReel && !String(reel.reelNo || '').toLowerCase().includes(filters.searchReel.toLowerCase())) return false;
    if (filters.size && !String(reel.size || '').toLowerCase().includes(filters.size.toLowerCase())) return false;
    if (filters.gsm && !String(reel.gsm || '').includes(String(filters.gsm))) return false;
    if (filters.bf && !String(reel.bf || '').includes(String(filters.bf))) return false;
    if (filters.colour && String(reel.colour || '').toLowerCase() !== filters.colour.toLowerCase()) return false;
    if (filters.status === 'Available' && (reel.balanceQty || 0) <= 0) return false;
    if (filters.status === 'Used' && (reel.balanceQty || 0) > 0) return false;
    return true;
  });

  const toggleSelection = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredInventory.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredInventory.map(r => r.id)));
    }
  };

  const handleExport = () => {
    if (typeof downloadCSV !== 'function') return alert("Export function unavailable.");
    const exportData = filteredInventory.map(reel => ({
      Company: companies.find(c => c.id === reel.companyId)?.name || 'Unknown', Date: reel.date || '', Mill_Name: reel.millName || '', Invoice_No: reel.invoiceNo || '', Vehicle_No: reel.vehicleNo || '', Reel_No: reel.reelNo || '', Size: reel.size || '', GSM: reel.gsm || '', BF: reel.bf || '', Colour: reel.colour || '', Received_Qty: reel.receivedQty || '', Initial_Issued: reel.initialIssuedQty || '0', Total_Issued_Qty: (reel.issuedQty || 0).toFixed(2), Balance_Qty: (reel.balanceQty || 0).toFixed(2), Rate_per_KG: reel.ratePerKg || 0, Current_Value: (reel.value || 0).toFixed(2), Used_For_History: (reel.usageLog || []).map(l => `${l.date}: ${l.usedFor} (${l.kg}kg)`).join(' | ')
    }));
    downloadCSV(exportData, 'stock_inventory');
  };

  const totalReels = filteredInventory.length || 0;
  const emptyReels = filteredInventory.filter(r => (r.balanceQty || 0) <= 0).length || 0;
  const activeReels = totalReels - emptyReels;
  const totalKgAvailable = filteredInventory.reduce((sum, r) => sum + (r.balanceQty || 0), 0);
  const totalValueAvailable = filteredInventory.reduce((sum, r) => sum + (r.value || 0), 0);
  const lowStockReels = filteredInventory.filter(r => (r.balanceQty || 0) > 0 && (r.balanceQty || 0) < lowStockThreshold);

  const handleAddConsumable = async (e) => {
    e.preventDefault();
    await addDoc(getColRef('inventory'), { ...consumableData, category: 'Consumables' });
    if(addLog) addLog(`Added ${consumableData.receivedQty} units of ${consumableData.itemName} to inventory.`);
    setConsumableData({ date: new Date().toISOString().split('T')[0], itemName: 'Gum', vendorName: '', invoiceNo: '', receivedQty: '', rate: '', initialIssuedQty: '' });
  };

  const rawConsumables = inventory.filter(i => i.category === 'Consumables');
  
  const processedConsumables = rawConsumables.map(item => {
      const received = parseFloat(item.receivedQty || 0);
      const issued = parseFloat(item.initialIssuedQty || 0);
      const balance = Math.max(0, received - issued);
      const rate = parseFloat(item.rate || 0);
      const value = balance * rate;
      return { ...item, balance, value };
  });

  const filteredConsumables = processedConsumables.filter(item => {
      if (consumableFilters.itemName && item.itemName !== consumableFilters.itemName) return false;
      if (consumableFilters.vendorName && !String(item.vendorName || '').toLowerCase().includes(consumableFilters.vendorName.toLowerCase())) return false;
      if (consumableFilters.status === 'Available' && (item.balance || 0) <= 0) return false;
      if (consumableFilters.status === 'Empty' && (item.balance || 0) > 0) return false;
      return true;
  });

  const totalConsumableValue = filteredConsumables.reduce((sum, i) => sum + (i.value || 0), 0);

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold">Stock Inventory</h2>
          {role === 'admin' && activeSubTab === 'Paper' && (
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <button onClick={handleBulkDelete} className="bg-red-100 text-red-700 px-3 py-1.5 rounded text-sm font-bold hover:bg-red-200 transition">
                  Delete Selected ({selectedIds.size})
                </button>
              )}
              <button onClick={handleWipeDatabase} className="bg-red-600 text-white px-3 py-1.5 rounded text-sm font-bold hover:bg-red-700 transition flex items-center gap-1 shadow-sm">
                Wipe All
              </button>
            </div>
          )}
        </div>
        {activeSubTab === 'Paper' && (
          <div className="flex gap-2">
            
            <label className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition cursor-pointer shadow-sm ${isScanning ? 'bg-blue-300 text-blue-800' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
              <ScanLine className="w-4 h-4" />
              {isScanning ? 'Scanning via AI...' : 'Scan Bill (PDF/Img)'}
              <input type="file" accept=".pdf,image/*" className="hidden" onChange={handleScanInvoice} disabled={isScanning} />
            </label>

            <label className="flex items-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-300 font-medium text-sm transition cursor-pointer">
              Import CSV
              <input type="file" accept=".csv" className="hidden" onChange={(e) => {
                  if (typeof handleCSVImport === 'function') {
                      handleCSVImport(e, 'inventory', getColRef, addLog, (row, getVal) => {
                          const compName = getVal(row, 'Company name', 'Company', 'Client', 'Customer', 'Brand') || '';
                          const comp = companies.find(c => c?.name?.toLowerCase().trim() === compName.toLowerCase().trim());
                          const rowCompanyId = comp ? comp.id : (allowedCompanyId !== 'all' ? allowedCompanyId : '');

                          let rawDate = getVal(row, 'Date', 'date', 'Date / Ref', 'Receipt Date');
                          let formattedDate = new Date().toISOString().split('T')[0];
                          if (rawDate) {
                              const d = new Date(rawDate);
                              if (!isNaN(d.getTime())) formattedDate = d.toISOString().split('T')[0];
                              else formattedDate = rawDate; 
                          }
                          return {
                              companyId: rowCompanyId, date: formattedDate,
                              millName: getVal(row, 'Party Name', 'Mill Name') || '',
                              invoiceNo: getVal(row, 'Invoice No', 'Invoice_No') || '',
                              vehicleNo: getVal(row, 'Vehicle No', 'Vehicle_No') || '',
                              reelNo: getVal(row, 'Reel No', 'Reel_No') || '',
                              size: getVal(row, 'Size', 'size') || '',
                              gsm: getVal(row, 'GSM', 'gsm') || '',
                              bf: getVal(row, 'BF', 'bf') || '',
                              colour: getVal(row, 'Colour', 'Color') || 'Kraft',
                              receivedQty: getVal(row, 'Received Qty', 'Received_Qty') || '',
                              initialIssuedQty: getVal(row, 'Issue Qty', 'Issued Qty') || '',
                              ratePerKg: getVal(row, 'Rate/Kg', 'Rate per KG') || '',
                              category: 'Paper',
                              tallySynced: false
                          };
                      });
                  }
              }} />
            </label>
            <button onClick={handleExport} className="flex items-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-300 font-medium text-sm transition">Export</button>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-6 border-b border-stone-200">
        <button 
            onClick={() => setActiveSubTab('Paper')}
            className={`px-6 py-3 font-bold text-sm flex items-center gap-2 transition-colors border-b-2 ${activeSubTab === 'Paper' ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-500 hover:text-stone-700'}`}
        >
            Paper Reels
        </button>
        <button 
            onClick={() => setActiveSubTab('Consumables')}
            className={`px-6 py-3 font-bold text-sm flex items-center gap-2 transition-colors border-b-2 ${activeSubTab === 'Consumables' ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-500 hover:text-stone-700'}`}
        >
            Other Consumables
        </button>
      </div>

      {activeSubTab === 'Paper' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-white border border-stone-200 p-4 rounded-xl shadow-sm flex items-center gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">#</div>
              <div><p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Total Reels (Active / Empty)</p><p className="text-2xl font-bold text-stone-900">{activeReels} <span className="text-stone-300">/</span> <span className="text-stone-400">{emptyReels}</span></p></div>
            </div>
            <div className="bg-white border border-stone-200 p-4 rounded-xl shadow-sm flex items-center gap-4">
              <div className="p-3 bg-green-50 text-green-600 rounded-lg">KG</div>
              <div><p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Total Available (KG)</p><p className="text-2xl font-bold text-stone-900">{totalKgAvailable.toFixed(1)} kg</p></div>
            </div>
            <div className="bg-white border border-stone-200 p-4 rounded-xl shadow-sm flex items-center gap-4">
              <div className="p-3 bg-yellow-50 text-yellow-600 rounded-lg">₹</div>
              <div><p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Available Stock Value</p><p className="text-2xl font-bold text-stone-900">₹{totalValueAvailable.toLocaleString('en-IN', {maximumFractionDigits:0})}</p></div>
            </div>
            <div className={`p-4 rounded-xl border shadow-sm flex items-center gap-3 ${lowStockReels.length > 0 ? 'bg-amber-50 border-amber-300' : 'bg-white border-stone-200'}`}>
              <div>
                <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-1">Low Stock Alert</p>
                <p className={`text-2xl font-bold ${lowStockReels.length > 0 ? 'text-amber-800' : 'text-stone-900'}`}>{lowStockReels.length} reels</p>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[10px] text-stone-500">Threshold:</span>
                  <input type="number" min="1" className="w-16 text-[10px] border rounded px-1 py-0.5 font-bold" value={lowStockThreshold}
                    onChange={e => handleThresholdChange(e.target.value)} />
                  <span className="text-[10px] text-stone-500">kg</span>
                </div>
              </div>
            </div>
          </div>

          {lowStockReels.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-4">
              <p className="text-sm font-bold text-amber-800 mb-2">⚠ Low Stock Reels — below {lowStockThreshold} kg ({lowStockReels.length} reels)</p>
              <div className="flex flex-wrap gap-2">
                {lowStockReels.map(r => (
                  <span key={r.id} className="text-xs bg-amber-100 text-amber-900 border border-amber-300 px-2 py-1 rounded font-medium">
                    {r.reelNo} — {(r.balanceQty || 0).toFixed(1)} kg ({r.gsm} GSM, {r.bf} BF)
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 mb-6">
            <h3 className="font-bold mb-4 flex items-center gap-2">{editingId ? 'Edit Reel Entry' : 'Receive New Invoice'}</h3>
            <form onSubmit={handleAddOrUpdate} className="space-y-4">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, background: '#fafaf9', padding: 14, borderRadius: 10, border: '1px solid var(--border)', marginBottom: 4 }}>
                <div><label className="block text-xs font-bold text-stone-700 mb-1">Date Received</label><input required type="date" className="w-full p-2 border rounded" value={commonData.date} onChange={e => setCommonData({...commonData, date: e.target.value})} /></div>
                <div><label className="block text-xs font-bold text-stone-700 mb-1">Company</label>
                  <select required className="w-full p-2 border rounded" value={commonData.companyId} onChange={e => setCommonData({...commonData, companyId: e.target.value})} disabled={allowedCompanyId !== 'all'}>
                    <option value="">Select Company...</option>{[...visibleCompanies].sort((a,b) => (a?.name||'').localeCompare(b?.name||'')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs font-bold text-stone-700 mb-1">Vendor / Supplier</label>
                  <select className="w-full p-2 border rounded" value={commonData.vendorId} onChange={e => {
                    const v = vendors.find(v => v.id === e.target.value);
                    setCommonData({...commonData, vendorId: e.target.value, millName: v ? v.name : commonData.millName});
                  }}>
                    <option value="">Select Vendor...</option>
                    {[...vendors].sort((a,b) => (a.name||'').localeCompare(b.name||'')).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    <option value="_other">Other (type below)</option>
                  </select>
                </div>
                <div><label className="block text-xs font-bold text-stone-700 mb-1">Mill / Party Name</label><input required type="text" className="w-full p-2 border rounded" placeholder="Mill name" value={commonData.millName} onChange={e => setCommonData({...commonData, millName: e.target.value})} /></div>
                <div><label className="block text-xs font-bold text-stone-700 mb-1">Invoice No.</label><input type="text" className="w-full p-2 border rounded" value={commonData.invoiceNo} onChange={e => setCommonData({...commonData, invoiceNo: e.target.value})} /></div>
                <div><label className="block text-xs font-bold text-stone-700 mb-1">Vehicle No.</label><input type="text" className="w-full p-2 border rounded" value={commonData.vehicleNo} onChange={e => setCommonData({...commonData, vehicleNo: e.target.value})} /></div>
                {/* Payment row */}
                <div><label className="block text-xs font-bold text-stone-700 mb-1">Payment Status</label>
                  <select className="w-full p-2 border rounded" value={commonData.paymentStatus} onChange={e => setCommonData({...commonData, paymentStatus: e.target.value})}>
                    <option value="Unpaid">Unpaid</option><option value="Partial">Partial</option><option value="Paid">Paid</option>
                  </select>
                </div>
                {(commonData.paymentStatus === 'Partial' || commonData.paymentStatus === 'Paid') && (
                  <div><label className="block text-xs font-bold text-stone-700 mb-1">Amount Paid (₹)</label><input type="number" step="0.01" className="w-full p-2 border rounded bg-green-50" value={commonData.amountPaid} onChange={e => setCommonData({...commonData, amountPaid: e.target.value})} /></div>
                )}
              </div>


              <div className="space-y-3">
                {reelsInput.map((reel, idx) => (
                  <div key={idx} className="flex flex-wrap md:flex-nowrap gap-2 items-end">
                    <div className="flex-1 min-w-[100px]"><label className="block text-[10px] text-stone-500 mb-1">Reel No.</label><input required type="text" className="w-full p-2 border border-blue-300 bg-blue-50 rounded font-mono font-bold text-sm" value={reel.reelNo} onChange={e => handleReelChange(idx, 'reelNo', e.target.value)} /></div>
                    <div className="w-20"><label className="block text-[10px] text-stone-500 mb-1">Size</label><input required type="text" className="w-full p-2 border rounded text-sm" value={reel.size} onChange={e => handleReelChange(idx, 'size', e.target.value)} /></div>
                    <div className="w-16"><label className="block text-[10px] text-stone-500 mb-1">GSM</label><input required type="number" step="0.1" className="w-full p-2 border rounded text-sm" value={reel.gsm} onChange={e => handleReelChange(idx, 'gsm', e.target.value)} /></div>
                    <div className="w-16"><label className="block text-[10px] text-stone-500 mb-1">BF</label><input required type="number" step="0.1" className="w-full p-2 border rounded text-sm" value={reel.bf} onChange={e => handleReelChange(idx, 'bf', e.target.value)} /></div>
                    <div className="w-24"><label className="block text-[10px] text-stone-500 mb-1">Colour</label><select required className="w-full p-2 border rounded text-sm" value={reel.colour} onChange={e => handleReelChange(idx, 'colour', e.target.value)}><option value="Kraft">Kraft</option><option value="Golden">Golden</option><option value="White">White</option></select></div>
                    <div className="w-24"><label className="block text-[10px] text-stone-500 mb-1">Recv (KG)</label><input required type="number" step="0.1" className="w-full p-2 border rounded bg-green-50 text-sm" value={reel.receivedQty} onChange={e => handleReelChange(idx, 'receivedQty', e.target.value)} /></div>
                    <div className="w-24"><label className="block text-[10px] text-stone-500 mb-1">Init. Issue</label><input type="number" step="0.1" className="w-full p-2 border rounded bg-orange-50 text-sm" value={reel.initialIssuedQty} onChange={e => handleReelChange(idx, 'initialIssuedQty', e.target.value)} /></div>
                    <div className="w-24"><label className="block text-[10px] text-stone-500 mb-1">Rate (₹)</label><input required type="number" step="0.01" className="w-full p-2 border rounded text-sm" value={reel.ratePerKg} onChange={e => handleReelChange(idx, 'ratePerKg', e.target.value)} /></div>
                    {!editingId && reelsInput.length > 1 && (
                      <button type="button" onClick={() => removeReelRow(idx)} className="p-2 mb-1 text-red-500 hover:bg-red-50 rounded">Delete</button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-4 border-t border-stone-200">
                {!editingId && (
                  <button type="button" onClick={addReelRow} className="bg-stone-100 text-stone-700 px-4 py-2 rounded text-sm font-bold hover:bg-stone-200 flex items-center gap-2">
                    Add Another Reel
                  </button>
                )}
                <button type="submit" className="flex-1 bg-stone-900 text-white p-2 rounded flex items-center justify-center gap-2 hover:bg-stone-800 font-bold">
                  {editingId ? 'Update Reel' : `Save ${reelsInput.length > 1 ? `${reelsInput.length} Reels` : 'Reel'} to Inventory`}
                </button>
                {editingId && <button type="button" onClick={cancelEdit} className="bg-stone-300 text-stone-800 p-2 rounded hover:bg-stone-400 px-6 font-bold">Cancel</button>}
              </div>
            </form>
          </div>

          {/* ── Filter Bar ── */}
          <div className="apex-card" style={{ padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', whiteSpace: 'nowrap', paddingRight: 10, borderRight: '1px solid var(--border)' }}>Filter</span>
              {allowedCompanyId === 'all' && (
                <input type="text" placeholder="Company" className="apex-input" style={{ width: 110, padding: '6px 10px', fontSize: 12 }} value={filters.company} onChange={e => setFilters({...filters, company: e.target.value})} />
              )}
              <input type="text" placeholder="Mill / Party" className="apex-input" style={{ width: 110, padding: '6px 10px', fontSize: 12 }} value={filters.millName} onChange={e => setFilters({...filters, millName: e.target.value})} />
              <input type="text" placeholder="Reel No." className="apex-input" style={{ width: 96, padding: '6px 10px', fontSize: 12 }} value={filters.searchReel} onChange={e => setFilters({...filters, searchReel: e.target.value})} />
              <input type="text" placeholder="Size (cm)" className="apex-input" style={{ width: 88, padding: '6px 10px', fontSize: 12 }} value={filters.size} onChange={e => setFilters({...filters, size: e.target.value})} />
              <input type="text" placeholder="GSM" className="apex-input" style={{ width: 68, padding: '6px 10px', fontSize: 12 }} value={filters.gsm} onChange={e => setFilters({...filters, gsm: e.target.value})} />
              <input type="text" placeholder="BF" className="apex-input" style={{ width: 60, padding: '6px 10px', fontSize: 12 }} value={filters.bf} onChange={e => setFilters({...filters, bf: e.target.value})} />
              <select className="apex-select" style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }} value={filters.colour} onChange={e => setFilters({...filters, colour: e.target.value})}>
                <option value="">All Colours</option><option value="Kraft">Kraft</option><option value="Golden">Golden</option><option value="White">White</option>
              </select>
              <select className="apex-select" style={{ width: 'auto', padding: '6px 10px', fontSize: 12, fontWeight: 600 }} value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
                <option value="All">All Statuses</option><option value="Available">Available only</option><option value="Used">Used / Empty</option>
              </select>
              {(filters.company || filters.millName || filters.searchReel || filters.size || filters.gsm || filters.bf || filters.colour || filters.status !== 'All') && (
                <button onClick={() => setFilters({company: '', millName: '', searchReel: '', size: '', gsm: '', bf: '', colour: '', status: 'All'})}
                  className="apex-btn apex-btn-ghost apex-btn-sm" style={{ marginLeft: 'auto' }}>Clear filters</button>
              )}
            </div>
            <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-muted)' }}>
              Showing <strong style={{ color: 'var(--text-primary)' }}>{filteredInventory.filter(r => (r.balanceQty||0) > 0).length}</strong> active · <strong style={{ color: 'var(--text-primary)' }}>{filteredInventory.filter(r => (r.balanceQty||0) <= 0).length}</strong> empty of <strong style={{ color: 'var(--text-primary)' }}>{filteredInventory.length}</strong> total reels
            </div>
          </div>

          {/* ── Reel Table ── */}
          <div className="apex-table-wrap">
            <table className="apex-table" style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  {role === 'admin' && <th style={{ width: 36, paddingLeft: 14 }}><input type="checkbox" onChange={toggleAll} checked={selectedIds.size === filteredInventory.length && filteredInventory.length > 0} /></th>}
                  <th>Company</th>
                  <th>Date &amp; Ref</th>
                  <th>Mill / Party</th>
                  <th>Reel No.</th>
                  <th>Specs</th>
                  <th>Received</th>
                  <th>Issued</th>
                  <th>Balance</th>
                  <th>Rate &amp; Value</th>
                  <th>Usage History</th>
                  {role === 'admin' && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredInventory.length === 0 && (
                  <tr><td colSpan="12" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontStyle: 'italic' }}>No inventory records match the current filters.</td></tr>
                )}
                {[...filteredInventory].sort((a, b) => {
                  const dateA = new Date(a.date || 0).getTime();
                  const dateB = new Date(b.date || 0).getTime();
                  return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
                }).map(reel => {
                  const isAvailable = (reel.balanceQty || 0) > 0;
                  const isLow = isAvailable && (reel.balanceQty || 0) < lowStockThreshold;
                  const compName = companies.find(c => c.id === reel.companyId)?.name || 'Unassigned';
                  return (
                    <tr key={reel.id} style={{ opacity: !isAvailable ? 0.6 : 1 }}>
                      {role === 'admin' && <td style={{ paddingLeft: 14 }}><input type="checkbox" checked={selectedIds.has(reel.id)} onChange={() => toggleSelection(reel.id)} /></td>}
                      <td>
                        <span style={{ fontWeight: 600, fontSize: 12.5 }}>{compName}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, fontSize: 12.5 }}>{reel.date || '-'}</div>
                        {reel.invoiceNo && <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>#{reel.invoiceNo}</div>}
                        {reel.vehicleNo && <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Veh: {reel.vehicleNo}</div>}
                      </td>
                      <td style={{ fontWeight: 500, fontSize: 12.5 }}>{reel.millName || '-'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 14, color: isAvailable ? '#1d4ed8' : 'var(--text-muted)' }}>{reel.reelNo || '-'}</span>
                          {!isAvailable && <span className="apex-badge apex-badge-stone" style={{ fontSize: 9.5 }}>EMPTY</span>}
                          {isLow && <span className="apex-badge apex-badge-amber" style={{ fontSize: 9.5 }}>LOW</span>}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 12.5 }}>{reel.size || '-'} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>cm</span></div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{reel.gsm || '-'} GSM · {reel.bf || '-'} BF · {reel.colour || '-'}</div>
                      </td>
                      <td style={{ fontWeight: 600, fontSize: 12.5 }}>{reel.receivedQty || 0} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>kg</span></td>
                      <td style={{ color: '#c2410c', fontWeight: 600, fontSize: 12.5 }}>{(reel.issuedQty || 0) > 0 ? `${(reel.issuedQty||0).toFixed(1)} kg` : <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>—</span>}</td>
                      <td>
                        <span style={{ fontWeight: 800, fontSize: 14, color: isAvailable ? '#15803d' : 'var(--text-muted)' }}>{(reel.balanceQty || 0).toFixed(1)}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 3 }}>kg</span>
                      </td>
                      <td>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>₹{parseFloat(reel.ratePerKg||0).toFixed(2)}/kg</div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>₹{parseFloat(reel.value||0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                      </td>
                      <td>
                        {(reel.usageLog || []).length === 0
                          ? <span style={{ color: 'var(--text-muted)', fontSize: 11, fontStyle: 'italic' }}>Not yet used</span>
                          : <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {(reel.usageLog || []).slice(0, 3).map((log, i) => (
                                <div key={i} style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{log.date || '-'}</span>
                                  <span style={{ fontSize: 10.5, fontWeight: 500 }}>{log.usedFor || '-'}</span>
                                  <span className="apex-badge apex-badge-orange" style={{ fontSize: 9.5 }}>{log.kg || 0} kg</span>
                                </div>
                              ))}
                              {(reel.usageLog || []).length > 3 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{(reel.usageLog||[]).length - 3} more</span>}
                            </div>
                        }
                      </td>
                      {role === 'admin' && (
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button onClick={() => handleEdit(reel)} className="apex-btn apex-btn-ghost apex-btn-sm" style={{ marginRight: 4 }}>
                            <Edit2 style={{ width: 12, height: 12 }} /> Edit
                          </button>
                          <button onClick={() => handleDelete(reel.id, reel.reelNo)} className="apex-btn apex-btn-danger apex-btn-sm">
                            <Trash2 style={{ width: 12, height: 12 }} /> Del
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>

      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-white border border-stone-200 p-4 rounded-xl shadow-sm flex items-center gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">#</div>
              <div><p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Total Consumable Entries</p><p className="text-2xl font-bold text-stone-900">{filteredConsumables.length || 0}</p></div>
            </div>
            <div className="bg-white border border-stone-200 p-4 rounded-xl shadow-sm flex items-center gap-4">
              <div className="p-3 bg-green-50 text-green-600 rounded-lg">₹</div>
              <div><p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Consumables Stock Value</p><p className="text-2xl font-bold text-stone-900">₹{totalConsumableValue.toLocaleString('en-IN', {maximumFractionDigits:0})}</p></div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 mb-6">
            <h3 className="font-bold mb-4 flex items-center gap-2">Receive Consumables</h3>
            <form onSubmit={handleAddConsumable} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="col-span-1"><label className="block text-xs font-bold text-stone-700 mb-1">Date Received</label><input required type="date" className="w-full p-2 border rounded" value={consumableData.date} onChange={e => setConsumableData({...consumableData, date: e.target.value})} /></div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-stone-700 mb-1">Material Type</label>
                  <select required className="w-full p-2 border rounded bg-stone-50 font-bold" value={consumableData.itemName} onChange={e => setConsumableData({...consumableData, itemName: e.target.value})}>
                    <option value="Gum">Gum (Adhesive)</option>
                    <option value="Stitching Wire">Stitching Wire</option>
                    <option value="Stretch Film">Stretch Film</option>
                    <option value="Strapping Tape">Strapping Tape</option>
                  </select>
                </div>
                <div className="col-span-1"><label className="block text-xs font-bold text-stone-700 mb-1">Vendor Name</label><input required type="text" className="w-full p-2 border rounded" value={consumableData.vendorName} onChange={e => setConsumableData({...consumableData, vendorName: e.target.value})} /></div>
                <div className="col-span-1"><label className="block text-xs font-bold text-stone-700 mb-1">Invoice No. (Optional)</label><input type="text" className="w-full p-2 border rounded" value={consumableData.invoiceNo} onChange={e => setConsumableData({...consumableData, invoiceNo: e.target.value})} /></div>
                
                <div className="col-span-1"><label className="block text-xs font-bold text-stone-700 mb-1">Received Qty (KG / Rolls)</label><input required type="number" step="0.1" className="w-full p-2 border rounded bg-green-50" value={consumableData.receivedQty} onChange={e => setConsumableData({...consumableData, receivedQty: e.target.value})} /></div>
                <div className="col-span-1"><label className="block text-xs font-bold text-stone-700 mb-1">Manual Issue (Consumption)</label><input type="number" step="0.1" className="w-full p-2 border rounded bg-orange-50" value={consumableData.initialIssuedQty} onChange={e => setConsumableData({...consumableData, initialIssuedQty: e.target.value})} /></div>
                <div className="col-span-1"><label className="block text-xs font-bold text-stone-700 mb-1">Rate per Unit (₹)</label><input required type="number" step="0.01" className="w-full p-2 border rounded" value={consumableData.rate} onChange={e => setConsumableData({...consumableData, rate: e.target.value})} /></div>
                
                <div className="col-span-1">
                  <button type="submit" className="w-full bg-stone-900 text-white p-2 rounded flex items-center justify-center gap-2 hover:bg-stone-800 font-bold">
                    Save Record
                  </button>
                </div>
              </div>
            </form>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-200 mb-6 flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2 text-stone-500 mr-2">Filter:</div>
            <select className="p-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-stone-800" value={consumableFilters.itemName} onChange={e => setConsumableFilters({...consumableFilters, itemName: e.target.value})}>
              <option value="">All Materials</option>
              <option value="Gum">Gum</option>
              <option value="Stitching Wire">Stitching Wire</option>
              <option value="Stretch Film">Stretch Film</option>
              <option value="Strapping Tape">Strapping Tape</option>
            </select>
            <input type="text" placeholder="Vendor Name..." className="p-2 border rounded text-sm w-48 focus:outline-none focus:ring-2 focus:ring-stone-800" value={consumableFilters.vendorName} onChange={e => setConsumableFilters({...consumableFilters, vendorName: e.target.value})} />
            <select className="p-2 border rounded text-sm font-bold bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-800" value={consumableFilters.status} onChange={e => setConsumableFilters({...consumableFilters, status: e.target.value})}>
              <option value="All">All Statuses</option>
              <option value="Available">Only Available</option>
              <option value="Empty">Empty (Fully Consumed)</option>
            </select>
            <button onClick={() => setConsumableFilters({itemName: '', vendorName: '', status: 'All'})} className="text-xs text-blue-500 hover:text-blue-700 underline ml-2 transition">Clear</button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden overflow-x-auto">
            <table className="w-full text-left min-w-[800px]">
              <thead className="bg-stone-100 text-stone-600 text-sm">
                <tr>
                  <th className="p-4">Date / Invoice</th>
                  <th className="p-4">Material</th>
                  <th className="p-4">Vendor</th>
                  <th className="p-4">Received</th>
                  <th className="p-4 bg-orange-50 text-orange-800">Issued</th>
                  <th className="p-4 bg-green-50 text-green-800">Balance</th>
                  <th className="p-4">Rate & Value (₹)</th>
                  {role === 'admin' && <th className="p-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 text-sm">
                {filteredConsumables.length === 0 && <tr><td colSpan="8" className="p-4 text-center text-stone-500">No consumable records found.</td></tr>}
                {[...filteredConsumables].sort((a,b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).map(item => {
                  const isAvailable = (item.balance || 0) > 0;
                  return (
                  <tr key={item.id} className={`hover:bg-stone-50 ${!isAvailable ? 'opacity-60 bg-stone-50' : ''}`}>
                    <td className="p-4"><div className="font-medium">{item.date || '-'}</div><div className="text-[10px] text-stone-400">Inv: {item.invoiceNo || '-'}</div></td>
                    <td className="p-4"><span className="font-bold text-stone-900 bg-stone-200 px-2 py-1 rounded">{item.itemName || '-'}</span>{!isAvailable && <span className="ml-2 text-[10px] bg-stone-300 px-1 py-0.5 rounded text-stone-700 font-bold">EMPTY</span>}</td>
                    <td className="p-4 font-medium text-stone-800">{item.vendorName || '-'}</td>
                    <td className="p-4 font-semibold">{item.receivedQty || 0}</td>
                    <td className="p-4 font-semibold text-orange-600 bg-orange-50/30">{(item.initialIssuedQty || 0) > 0 ? item.initialIssuedQty : '-'}</td>
                    <td className="p-4 bg-green-50/30"><span className={`font-bold text-lg ${isAvailable ? 'text-green-700' : 'text-stone-500'}`}>{(item.balance || 0).toFixed(1)}</span></td>
                    <td className="p-4"><div className="text-xs text-stone-500 mb-1">Rate: ₹{parseFloat(item.rate || 0).toFixed(2)}</div><div className="font-bold text-stone-800 text-base">₹{parseFloat(item.value || 0).toFixed(2)}</div></td>
                    {role === 'admin' && <td className="p-4 text-right whitespace-nowrap"><button onClick={() => handleDelete(item.id, item.itemName)} className="text-red-500 hover:text-red-700" title="Delete">Delete</button></td>}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// --- PRODUCTION VIEW ---
function ProductionView({ inventory, production, orders, items, companies, addLog, role, getColRef, getDocRef, currentUser, productionPrefill, onClearPrefill }) {
  const allowedCompanyId = currentUser?.role === 'admin' ? 'all' : (currentUser?.companyId || 'all');
  const visibleCompanies = allowedCompanyId === 'all' ? companies : companies.filter(c => c.id === allowedCompanyId);
  const visibleItems = allowedCompanyId === 'all' ? items : items.filter(i => i.companyId === allowedCompanyId);
  const visibleProduction = allowedCompanyId === 'all' ? production : production.filter(p => p.companyId === allowedCompanyId);
  const visibleOrders = allowedCompanyId === 'all' ? orders : orders.filter(o => o.companyId === allowedCompanyId);

  const [editingId, setEditingId] = useState(null);
  const [suggestedKg, setSuggestedKg] = useState(null);
  const [suggestedSheets, setSuggestedSheets] = useState(null);
  const [quickEntryMode, setQuickEntryMode] = useState(() => localStorage.getItem('apex_quickEntry') === 'true');
  const [selectedIds, setSelectedIds] = useState(new Set());
  
  const [consumedReels, setConsumedReels] = useState([{ reelNo: '', weight: '' }]);
  const [newRecord, setNewRecord] = useState({ 
    date: new Date().toISOString().split('T')[0], orderId: '', companyId: allowedCompanyId !== 'all' ? allowedCompanyId : '', millName: '', paperUsedFor: 'Paper', usedForItem: '', linerQty: '', wasteSheetsKg: '', numberOfUps: '1', commonUps: '', smallUps: '' 
  });

  const availableMills = [...new Set(inventory.filter(i => (!newRecord.companyId || i.companyId === newRecord.companyId)).map(i => i.millName).filter(Boolean))];

  // Consume prefill from Orders "Start Production" button
  useEffect(() => {
    if (productionPrefill && productionPrefill.id) {
      handleOrderLink(productionPrefill.id);
      onClearPrefill?.();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [productionPrefill]);

  useEffect(() => {
    if (!newRecord.usedForItem) {
      setSuggestedKg(null);
      return;
    }
    const item = items.find(i => i.name === newRecord.usedForItem || i.Item_Name === newRecord.usedForItem);
    if (!item) return;

    const sizeStr = String(item.size || item.Size_mm || '0x0x0').toLowerCase().replace(/\*/g, 'x');
    const dims = sizeStr.split('x').map(s => parseFloat(s.trim()) || 0);
    const L = dims[0] || 0; const W = dims[1] || 0; const H = dims[2] || 0;
    const type = item.itemType || item.Item_Type || 'Box';
    let totalAreaSqM = 0;
    let targetSheets = parseFloat(newRecord.linerQty || 0);

    if (targetSheets === 0 && newRecord.orderId) {
      const ord = orders.find(o => o.id === newRecord.orderId);
      if (ord) {
        if (type === 'PPC') {
          const orderQty = parseFloat(ord.orderQty || 0);
          const cPerSet = Math.max(1, parseInt(ord.commonPerSet || 2) - 1);
          const sPerSet = Math.max(1, parseInt(ord.smallPerSet || 2) - 1);
          const baseC = parseInt(ord.commonUps || 1); const baseS = parseInt(ord.smallUps || 1);
          const pUpsC = parseInt(ord.plannedUpsCommon || 1); const pUpsS = parseInt(ord.plannedUpsSmall || 1);
          const cNeeded = cPerSet * orderQty; const sNeeded = sPerSet * orderQty;
          const cPiecesPerCSheet = baseC * pUpsC; const sPiecesPerCSheet = baseC * pUpsC; 
          const sPiecesPerSSheet = baseS * pUpsS * 2;
          const cSheetsNeeded = Math.ceil(cNeeded / cPiecesPerCSheet);
          const sAcquired = cSheetsNeeded * sPiecesPerCSheet;
          const remainingS = Math.max(0, sNeeded - sAcquired);
          const sSheetsNeeded = Math.ceil(remainingS / sPiecesPerSSheet);
          targetSheets = cSheetsNeeded + sSheetsNeeded;
          const cWidth = H * baseC; const cLength = ((L + W) * pUpsC) + 10;
          const sWidth = cWidth; const sLength = (W * 2 * pUpsS) + 10;
          totalAreaSqM = ((cSheetsNeeded * cWidth * cLength) + (sSheetsNeeded * sWidth * sLength)) / 1000000;
        } else {
          const ups = parseFloat(newRecord.numberOfUps || 1);
          targetSheets = Math.ceil(parseFloat(ord.orderQty || 0) / ups);
        }
      }
    }

    if (targetSheets > 0) {
      if (type !== 'PPC') {
        let boardLength = 0, boardWidth = 0;
        if (type === 'Box') { boardLength = (L + W) * 2 + 50; boardWidth = W + H + 20; }
        else if (type === 'Tray' || type === 'Lid') { boardLength = (L + W * 2) + 10; boardWidth = (W + 2 * H) + 10; }
        else { boardLength = L; boardWidth = W; }
        totalAreaSqM = (boardLength * boardWidth / 1000000) * targetSheets;
      }
      const gsm = parseFloat(item.paperGsm || item.Paper_GSM || 120);
      const factor = newRecord.paperUsedFor === 'Paper' ? 1.4 : 1.0;
      setSuggestedKg((totalAreaSqM * (gsm / 1000) * factor).toFixed(1));
      setSuggestedSheets(targetSheets > 0 ? Math.ceil(targetSheets) : null);
    } else {
      setSuggestedKg(null);
      setSuggestedSheets(null);
    }
  }, [newRecord.usedForItem, newRecord.orderId, newRecord.numberOfUps, newRecord.paperUsedFor, newRecord.linerQty, items, orders]);

  const handleOrderLink = (orderId) => {
    if (!orderId) { setNewRecord({...newRecord, orderId: ''}); return; }
    const ord = orders.find(o => o.id === orderId);
    if (!ord) return;
    setNewRecord({ ...newRecord, orderId: orderId, companyId: ord.companyId, usedForItem: ord.itemName || ord.Item_Name, numberOfUps: ord.plannedUps || '1', commonUps: ord.commonUps || '', smallUps: ord.smallUps || '' });
  };

  // F3: Clone last production entry — copies all header fields, clears reel data
  const cloneLastEntry = () => {
    const lastEntry = [...visibleProduction]
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))[0];
    if (!lastEntry) return;
    setNewRecord(prev => ({
      ...prev,
      date: new Date().toISOString().split('T')[0],
      orderId: lastEntry.orderId || '',
      companyId: lastEntry.companyId || prev.companyId,
      millName: lastEntry.millName || '',
      paperUsedFor: lastEntry.paperUsedFor || 'Paper',
      usedForItem: lastEntry.usedForItem || '',
      numberOfUps: lastEntry.numberOfUps || '1',
      commonUps: lastEntry.commonUps || '',
      smallUps: lastEntry.smallUps || '',
      linerQty: '',
      wasteSheetsKg: '',
    }));
    setConsumedReels([{ reelNo: '', weight: '' }]);
  };

  const handleAddOrUpdate = async (e) => {
    e.preventDefault();
    const totalKg = consumedReels.reduce((sum, r) => sum + (parseFloat(r.weight) || 0), 0);
    const reelNosStr = consumedReels.map(r => r.reelNo.toUpperCase()).filter(Boolean).join(', ');
    const finalRecord = { ...newRecord, consumedReels: consumedReels, useKg: totalKg.toFixed(1), reelNos: reelNosStr, tallySynced: false };

    if (editingId) {
      await updateDoc(getDocRef('production', editingId), finalRecord);
      addLog(`Updated production record: Reels ${reelNosStr}`);
      setEditingId(null);
    } else {
      await addDoc(getColRef('production'), finalRecord);
      addLog(`Added production record: Reels ${reelNosStr}`);

      // F6: Auto-create draft wastage entry to eliminate double data entry
      if (totalKg > 0 && finalRecord.orderId) {
        await addDoc(getColRef('wastage'), {
          date: finalRecord.date,
          orderId: finalRecord.orderId,
          companyId: finalRecord.companyId,
          totalReelsKg: totalKg.toFixed(1),
          productionKg: '', paperWastage: '', sheetWastage: '',
          corePipe: '', balanceReel: '',
          gumUsed: '', gumPrice: localStorage.getItem('apex_lastGumPrice') || '',
          isDraft: true,
          calculatedNetPaper: '0', goodProductionKg: '0',
          totalWastageKg: '0', calculatedWastagePercent: '0',
          totalGumCost: '0', gumCostPerKgPaper: '0'
        });
      }

      // Auto-advance order status
      if (finalRecord.orderId) {
        const linkedOrder = orders.find(o => o.id === finalRecord.orderId);
        if (linkedOrder && linkedOrder.status !== 'Completed') {
          const allPLogs = [...production, { ...finalRecord, id: '_new' }].filter(p => p.orderId === finalRecord.orderId);
          const item = items.find(i => i.id === linkedOrder.itemId);
          const isPpc = item?.itemType === 'PPC' || item?.Item_Type === 'PPC';
          let producedQty = 0;
          if (isPpc) {
            const cPPS = Math.max(1, parseInt(linkedOrder.smallPerSet || 2) - 1);
            const sPPS = Math.max(1, parseInt(linkedOrder.commonPerSet || 2) - 1);
            let tc = 0, ts = 0;
            allPLogs.forEach(p => { tc += parseFloat(p.linerQty || 0) * parseInt(p.commonUps || linkedOrder.commonUps || 0); ts += parseFloat(p.linerQty || 0) * parseInt(p.smallUps || linkedOrder.smallUps || 0); });
            producedQty = Math.min(Math.floor(tc / cPPS), Math.floor(ts / sPPS));
            if (isNaN(producedQty) || producedQty === Infinity) producedQty = 0;
          } else {
            const ply = parseInt(item?.ply || item?.Ply || 3);
            const sumBoard = allPLogs.filter(p => p.paperUsedFor === 'Board').reduce((a, p) => a + parseFloat(p.linerQty || 0), 0);
            const sumLiner = allPLogs.filter(p => p.paperUsedFor === 'Liner').reduce((a, p) => a + parseFloat(p.linerQty || 0), 0);
            const sumPaper = allPLogs.filter(p => p.paperUsedFor === 'Paper').reduce((a, p) => a + parseFloat(p.linerQty || 0), 0);
            let effBase = 0;
            if (ply <= 2) effBase = sumBoard + sumPaper;
            else if (ply === 3) effBase = sumBoard + Math.min(sumLiner, sumPaper);
            else if (ply === 5) effBase = sumBoard + Math.min(Math.floor(sumLiner / 2), sumPaper);
            else if (ply === 7) effBase = sumBoard + Math.min(Math.floor(sumLiner / 3), sumPaper);
            else effBase = sumBoard + sumPaper;
            producedQty = Math.floor(effBase * parseFloat(linkedOrder.plannedUps || 1));
          }
          producedQty += parseInt(linkedOrder.openingFgQty || 0);
          const orderQty = parseInt(linkedOrder.orderQty || 0);
          if (producedQty >= orderQty && orderQty > 0) {
            await updateDoc(getDocRef('orders', linkedOrder.id), { status: 'Completed' });
            addLog(`Auto-completed Order: ${linkedOrder.itemName || linkedOrder.Item_Name} (${producedQty}/${orderQty} produced)`);
          } else if (linkedOrder.status === 'Pending') {
            await updateDoc(getDocRef('orders', linkedOrder.id), { status: 'In Production' });
          }
        }
      }
    }
    setNewRecord({ date: new Date().toISOString().split('T')[0], orderId: '', companyId: allowedCompanyId !== 'all' ? allowedCompanyId : '', millName: '', paperUsedFor: 'Paper', usedForItem: '', linerQty: '', wasteSheetsKg: '', numberOfUps: '1', commonUps: '', smallUps: '' });
    setConsumedReels([{ reelNo: '', weight: '' }]);
    setSuggestedSheets(null);
  };

  const handleEdit = (record) => {
    setEditingId(record.id); setNewRecord(record);
    if (record.consumedReels && record.consumedReels.length > 0) setConsumedReels(record.consumedReels);
    else if (record.reelNos) setConsumedReels([{ reelNo: record.reelNos, weight: record.useKg }]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null); setNewRecord({ date: new Date().toISOString().split('T')[0], orderId: '', companyId: allowedCompanyId !== 'all' ? allowedCompanyId : '', millName: '', paperUsedFor: 'Paper', usedForItem: '', linerQty: '', wasteSheetsKg: '', numberOfUps: '1', commonUps: '', smallUps: '' });
    setConsumedReels([{ reelNo: '', weight: '' }]);
  };

  const handleDelete = async (id, reelNos) => {
    if(window.confirm(`Delete production record for Reels ${reelNos}?`)) {
      await deleteDoc(getDocRef('production', id));
      addLog(`Deleted production record: Reels ${reelNos}`);
    }
  };

  // --- BULK DELETE LOGIC ---
  const toggleSelection = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleAllInGroup = (records) => {
    const recordIds = records.map(r => r.id);
    const allSelected = recordIds.every(id => selectedIds.has(id));
    const newSet = new Set(selectedIds);
    if (allSelected) recordIds.forEach(id => newSet.delete(id));
    else recordIds.forEach(id => newSet.add(id));
    setSelectedIds(newSet);
  };

  const handleBulkDelete = async () => {
    if (role !== 'admin') return;
    if (window.confirm(`Are you sure you want to completely delete the ${selectedIds.size} selected records?`)) {
        await Promise.all(Array.from(selectedIds).map(id => deleteDoc(getDocRef('production', id))));
        addLog(`Bulk deleted ${selectedIds.size} production records`);
        setSelectedIds(new Set());
    }
  };

  const handleExport = () => {
    if (typeof downloadCSV !== 'function') return alert("Export function unavailable.");
    const exportData = visibleProduction.map(record => {
      const compName = companies.find(c => c.id === record.companyId)?.name || 'Unknown';
      const orderInfo = record.orderId ? (() => { const o = orders.find(o => o.id === record.orderId); return o ? `Order: ${o.orderQty}x ${o.itemName || o.Item_Name}` : 'Unknown Order'; })() : 'Standalone Production';
      return { Date: record.date || '', Company: compName, Linked_Order: orderInfo, MillName: record.millName || '', Reels: record.reelNos || record.reelNo || '', PaperUsedFor: record.paperUsedFor || '', UsedForItem: record.usedForItem || '', UseKG: record.useKg || '', Good_Sheets_Qty: record.linerQty || '', Waste_Sheets_KG: record.wasteSheetsKg || '', Ups: record.numberOfUps || '', Common_Ups: record.commonUps || '', Small_Ups: record.smallUps || '' };
    });
    downloadCSV(exportData, 'production_records');
  };

  const selectedItemObj = items.find(i => (i.name === newRecord.usedForItem) || (i.Item_Name === newRecord.usedForItem));
  const isPPC = selectedItemObj?.itemType === 'PPC' || selectedItemObj?.Item_Type === 'PPC';

  const groupedProduction = visibleProduction.reduce((acc, record) => {
    const cId = record.companyId || 'unassigned';
    if (!acc[cId]) acc[cId] = [];
    acc[cId].push(record);
    return acc;
  }, {});

  const sortedCompanyIds = Object.keys(groupedProduction).sort((a, b) => {
    const nameA = a === 'unassigned' ? 'Z_Unassigned' : (companies.find(c => c.id === a)?.name || '');
    const nameB = b === 'unassigned' ? 'Z_Unassigned' : (companies.find(c => c.id === b)?.name || '');
    return nameA.localeCompare(nameB);
  });

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <h2 className="text-2xl font-bold">Production Log</h2>
        <div className="flex gap-2 flex-wrap">
          {!editingId && visibleProduction.length > 0 && (
            <button
              type="button"
              onClick={cloneLastEntry}
              className="flex items-center gap-2 bg-amber-100 text-amber-800 border border-amber-300 px-4 py-2 rounded-lg hover:bg-amber-200 font-bold text-sm transition"
            >
              Clone Last Entry
            </button>
          )}
          <button
            type="button"
            onClick={() => { const next = !quickEntryMode; setQuickEntryMode(next); localStorage.setItem('apex_quickEntry', next); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition border ${
              quickEntryMode ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-stone-100 text-stone-700 border-stone-300 hover:bg-stone-200'
            }`}
          >
            {quickEntryMode ? 'Quick Mode ON' : 'Quick Mode'}
          </button>
          {role === 'admin' && selectedIds.size > 0 && (
            <button onClick={handleBulkDelete} className="flex items-center gap-2 bg-red-100 text-red-700 px-4 py-2 rounded-lg hover:bg-red-200 font-bold text-sm transition shadow-sm border border-red-200">
              <Trash2 className="w-4 h-4"/> Delete Selected ({selectedIds.size})
            </button>
          )}
          <button onClick={handleExport} className="flex items-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-300 font-medium text-sm transition">
            <Download className="w-4 h-4"/> Export to Excel
          </button>
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 mb-8">
        <h3 className="font-bold mb-4">{editingId ? 'Edit Production Record' : 'Add Production Record'}</h3>
        
        {newRecord.orderId && (() => {
          const prefillOrder = orders.find(o => o.id === newRecord.orderId);
          const prefillComp = companies.find(c => c.id === prefillOrder?.companyId);
          return prefillOrder ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
              <Factory className="w-5 h-5 text-blue-700 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-blue-800">Production job pre-filled from Order</p>
                <p className="text-sm text-blue-700 font-medium">{prefillComp?.name} — {prefillOrder.itemName || prefillOrder.Item_Name} ({prefillOrder.orderQty} pcs)</p>
              </div>
            </div>
          ) : null;
        })()}
        
        <div className="col-span-1 md:col-span-6 bg-blue-50 p-4 rounded-lg border border-blue-100 flex flex-col md:flex-row gap-4 items-center mb-6">
          <div className="w-full">
            <label className="block text-xs font-bold text-blue-800 mb-1">Link to Pending Order (Optional)</label>
            <select className="w-full p-2 border border-blue-200 rounded text-blue-900 bg-white" value={newRecord.orderId || ''} onChange={e => handleOrderLink(e.target.value)}>
              <option value="">-- Standalone Production (No Order Linked) --</option>
              {visibleOrders.filter(o => o.status !== 'Completed').map(o => {
                const comp = companies.find(c => c.id === o.companyId)?.name || 'Unknown';
                return <option key={o.id} value={o.id}>{comp} - {o.itemName || o.Item_Name} (Order: {o.orderQty} pcs)</option>;
              })}
            </select>
          </div>
          <div className="w-full text-xs text-blue-700">Linking an order will automatically update the Ready Quantity and Pending Quantity in your Orders & Finished Goods tab!</div>
        </div>

        <form onSubmit={handleAddOrUpdate} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Date</label><input required type="date" className="w-full p-2 border rounded" value={newRecord.date} onChange={e => setNewRecord({...newRecord, date: e.target.value})} /></div>
          <div className="col-span-1 md:col-span-2"><label className="block text-xs text-stone-500 mb-1">Company (For Report)</label><select required className="w-full p-2 border rounded" value={newRecord.companyId} onChange={e => setNewRecord({...newRecord, companyId: e.target.value})} disabled={!!newRecord.orderId}><option value="">-- Select Company --</option>{[...visibleCompanies].sort((a,b) => (a?.name || '').localeCompare(b?.name || '')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="col-span-1 md:col-span-3">
            <label className="block text-xs text-stone-500 mb-1">Mill Name</label>
            <select
              className="w-full p-2 border rounded bg-white"
              value={availableMills.includes(newRecord.millName) ? newRecord.millName : (newRecord.millName ? '__other__' : '')}
              onChange={e => {
                if (e.target.value === '__other__') setNewRecord({...newRecord, millName: ''});
                else setNewRecord({...newRecord, millName: e.target.value});
              }}
            >
              <option value="">-- Select Mill --</option>
              {availableMills.map((m, i) => <option key={i} value={m}>{m}</option>)}
              <option value="__other__">Other (type below)</option>
            </select>
            <input
              type="text"
              required
              className="w-full p-2 border rounded bg-white mt-1"
              placeholder={availableMills.includes(newRecord.millName) ? newRecord.millName : 'Type mill name...'}
              value={availableMills.includes(newRecord.millName) ? '' : newRecord.millName}
              onChange={e => setNewRecord({...newRecord, millName: e.target.value})}
              style={{ display: availableMills.includes(newRecord.millName) ? 'none' : 'block' }}
            />
          </div>
          <div className="col-span-1 md:col-span-2"><label className="block text-xs font-bold text-stone-700 mb-1">Paper Used For</label><select required className="w-full p-2 border border-stone-400 bg-stone-50 rounded font-medium" value={newRecord.paperUsedFor} onChange={e => setNewRecord({...newRecord, paperUsedFor: e.target.value})}><option value="Paper">Paper (1-Ply / Fluting)</option><option value="Liner">Liner (2-Ply / Flat)</option><option value="Board">Board (Combined)</option></select></div>
          <div className="col-span-1 md:col-span-4"><label className="block text-xs text-stone-500 mb-1">Used For Item</label><select required className="w-full p-2 border rounded" value={newRecord.usedForItem} onChange={e => setNewRecord({...newRecord, usedForItem: e.target.value})} disabled={!!newRecord.orderId}><option value="">-- Select Item --</option>{[...visibleItems].filter(i => i.companyId === newRecord.companyId || !newRecord.companyId).sort((a,b) => (a?.name || a?.Item_Name || '').localeCompare(b?.name || b?.Item_Name || '')).map(i => <option key={i.id} value={i.name || i.Item_Name}>{i.name || i.Item_Name}</option>)}</select></div>
          
          <div className="col-span-1 md:col-span-6 bg-stone-50 p-4 rounded-lg border border-stone-200 shadow-inner">
            <div className="flex justify-between items-center mb-3">
              <label className="text-xs font-bold text-stone-700 uppercase tracking-wider">Granular Reel Consumption</label>
            </div>
            {consumedReels.map((reel, idx) => (
              <div key={idx} className="flex flex-wrap md:flex-nowrap gap-2 items-end mb-2">
                <div className="flex-1"><label className="block text-[10px] text-stone-500 mb-1">Reel No.</label><input required type="text" className="w-full p-2 border border-stone-300 rounded text-sm uppercase bg-white" value={reel.reelNo} onChange={e => { const upd = [...consumedReels]; upd[idx].reelNo = e.target.value; setConsumedReels(upd); }} /></div>
                <div className="flex-1"><label className="block text-[10px] text-stone-500 mb-1">KG Consumed</label><input required type="number" step="0.1" className="w-full p-2 border border-stone-300 rounded text-sm bg-orange-50" value={reel.weight} onChange={e => { const upd = [...consumedReels]; upd[idx].weight = e.target.value; setConsumedReels(upd); }} /></div>
                {consumedReels.length > 1 && <button type="button" onClick={() => setConsumedReels(consumedReels.filter((_, i) => i !== idx))} className="p-2 bg-red-100 text-red-600 hover:bg-red-200 rounded mb-0.5"><Trash2 className="w-4 h-4"/></button>}
              </div>
            ))}
            <button type="button" onClick={() => setConsumedReels([...consumedReels, { reelNo: '', weight: '' }])} className="text-[10px] font-bold text-stone-600 bg-stone-200 px-3 py-1.5 rounded hover:bg-stone-300 mt-1">+ Add Another Reel</button>
            <div className="mt-4 pt-3 border-t border-stone-200 flex justify-end items-center gap-4"><span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Total Consumed:</span><span className="text-xl font-bold text-orange-600">{consumedReels.reduce((sum, r) => sum + (parseFloat(r.weight) || 0), 0).toFixed(1)} KG</span></div>
          </div>

          <div className="col-span-1">
            <label className="block text-xs text-stone-500 mb-1 flex items-center justify-between">
              <span>Good Qty (Sheets)</span>
              {suggestedSheets && !newRecord.linerQty && (
                <button type="button" onClick={() => setNewRecord({...newRecord, linerQty: String(suggestedSheets)})}
                  className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded font-bold hover:bg-blue-700">
                  Use {suggestedSheets}
                </button>
              )}
            </label>
            <input type="number" step="0.1" className={`w-full p-2 border rounded ${suggestedSheets && !newRecord.linerQty ? 'border-blue-300 bg-blue-50' : 'bg-blue-50'}`}
              value={newRecord.linerQty}
              placeholder={suggestedSheets ? `Target: ${suggestedSheets} sheets` : ''}
              onChange={e => setNewRecord({...newRecord, linerQty: e.target.value})} />
          </div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Waste (KG)</label><input type="number" step="0.1" className="w-full p-2 border rounded bg-red-50" value={newRecord.wasteSheetsKg} onChange={e => setNewRecord({...newRecord, wasteSheetsKg: e.target.value})} /></div>
          
          {isPPC ? (
              <div className="col-span-1 md:col-span-4 grid grid-cols-2 gap-2 p-2 bg-blue-50 border border-blue-200 rounded">
                  <div className="col-span-1"><label className="block text-[10px] font-bold text-blue-700 mb-1">Common Ups Produced</label><input required type="number" min="1" className="w-full p-2 border rounded text-sm" value={newRecord.commonUps} onChange={e => setNewRecord({...newRecord, commonUps: e.target.value})} /></div>
                  <div className="col-span-1"><label className="block text-[10px] font-bold text-blue-700 mb-1">Small Ups Produced</label><input required type="number" min="1" className="w-full p-2 border rounded text-sm" value={newRecord.smallUps} onChange={e => setNewRecord({...newRecord, smallUps: e.target.value})} /></div>
              </div>
          ) : (
              <div className="col-span-1 md:col-span-4"><label className="block text-xs text-stone-500 mb-1">Number of Ups</label><input required type="number" min="1" className="w-full p-2 border rounded" value={newRecord.numberOfUps} onChange={e => setNewRecord({...newRecord, numberOfUps: e.target.value})} /></div>
          )}

          <div className="col-span-1 lg:col-span-6 flex gap-2 mt-2">
            <button type="submit" className="flex-1 bg-stone-900 text-white p-2 rounded flex items-center justify-center gap-2 hover:bg-stone-800 font-bold">{editingId ? 'Update Record' : 'Save Production Record'}</button>
            {editingId && <button type="button" onClick={cancelEdit} className="bg-stone-300 text-stone-800 p-2 rounded hover:bg-stone-400 px-6 font-bold">Cancel</button>}
          </div>
        </form>
      </div>

      {/* DUAL SUMMARY METRICS */}
      {visibleProduction.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          
          {/* USAGE BY COMPANY */}
          <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
            <div className="bg-stone-100 p-4 border-b border-stone-200 flex items-center gap-2"><Building2 className="w-4 h-4 text-stone-500"/><h3 className="font-bold text-stone-800">Usage by Company</h3></div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(visibleProduction.reduce((acc, record) => { const cId = record.companyId || 'unassigned'; acc[cId] = (acc[cId] || 0) + (parseFloat(record.useKg) || 0); return acc; }, {})).sort((a,b) => b[1] - a[1]).map(([cId, totalKg]) => {
                const compName = cId === 'unassigned' ? 'Unassigned' : companies.find(c => c.id === cId)?.name || 'Unknown';
                return (
                  <div key={cId} className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 text-center">
                    <p className="text-[10px] font-bold text-blue-800 uppercase tracking-wider truncate mb-1" title={compName}>{compName}</p>
                    <p className="font-bold text-lg text-blue-900">{totalKg.toFixed(1)} <span className="text-[10px] font-normal">KG</span></p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* USAGE BY ITEM */}
          <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
            <div className="bg-stone-100 p-4 border-b border-stone-200 flex items-center gap-2"><Package className="w-4 h-4 text-stone-500"/><h3 className="font-bold text-stone-800">Usage by Item</h3></div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4 max-h-[300px] overflow-y-auto">
              {Object.entries(visibleProduction.reduce((acc, record) => { if (record.usedForItem) acc[record.usedForItem] = (acc[record.usedForItem] || 0) + (parseFloat(record.useKg) || 0); return acc; }, {})).sort((a,b) => b[1] - a[1]).map(([itemName, totalKg]) => (
                <div key={itemName} className="bg-stone-50 p-3 rounded-lg border border-stone-200 text-center">
                  <p className="text-[10px] font-bold text-stone-600 uppercase tracking-wider truncate mb-1" title={itemName}>{itemName}</p>
                  <p className="font-bold text-lg text-stone-900">{totalKg.toFixed(1)} <span className="text-[10px] font-normal">KG</span></p>
                </div>
              ))}
            </div>
          </div>
          
        </div>
      )}

      {sortedCompanyIds.length === 0 && (
        <div className="bg-white p-8 rounded-xl shadow-sm border border-stone-200 text-center text-stone-500">
          No production records found.
        </div>
      )}

      {sortedCompanyIds.map(compId => {
        const compName = compId === 'unassigned' ? 'Unassigned / Unknown Client' : (companies.find(c => c.id === compId)?.name || 'Unknown Company');
        const records = groupedProduction[compId].sort((a,b) => (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0));

        return (
          <div key={compId} className="mb-8">
            <h4 className="text-xl font-bold text-stone-800 mb-3 pl-3 border-l-4 border-stone-800">{compName}</h4>
            <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden overflow-x-auto">
              <table className="w-full text-left min-w-[1100px]">
                <thead className="bg-stone-100 text-stone-600 text-sm">
                  <tr>
                    {role === 'admin' && <th className="p-4 w-12"><input type="checkbox" className="accent-stone-900 w-4 h-4 cursor-pointer" onChange={() => toggleAllInGroup(records)} checked={records.length > 0 && records.every(r => selectedIds.has(r.id))} title="Select all in this group"/></th>}
                    <th className="p-4">Date</th>
                    <th className="p-4">Item Details</th>
                    <th className="p-4">Reels Consumed</th>
                    <th className="p-4">Used For</th>
                    <th className="p-4 bg-orange-50 text-orange-800">Total KG</th>
                    <th className="p-4">Qty & Ups</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {records.map(record => {
                    const itemObj = items.find(i => (i.name === record.usedForItem) || (i.Item_Name === record.usedForItem));
                    const isRecordPpc = itemObj?.itemType === 'PPC' || itemObj?.Item_Type === 'PPC';
                    let upsDisplay = `${record.numberOfUps || 1} Ups`;
                    if (isRecordPpc) upsDisplay = `Ups: ${record.commonUps || '-'}C / ${record.smallUps || '-'}S`;

                    return (
                    <tr key={record.id} className={`hover:bg-stone-50 ${selectedIds.has(record.id) ? 'bg-red-50/30' : ''}`}>
                      {role === 'admin' && <td className="p-4"><input type="checkbox" className="accent-stone-900 w-4 h-4 cursor-pointer" checked={selectedIds.has(record.id)} onChange={() => toggleSelection(record.id)} /></td>}
                      <td className="p-4 whitespace-nowrap">{record.date}</td>
                      <td className="p-4">
                        <p className="font-bold text-stone-900">{record.usedForItem || '-'}</p>
                        {record.orderId && <span className="inline-block mt-1 bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-full font-bold">Order Linked</span>}
                      </td>
                      <td className="p-4">
                        <p className="font-medium text-stone-800">{record.millName}</p>
                        {record.consumedReels && record.consumedReels.length > 0 ? (
                           <ul className="text-xs text-stone-500 mt-1 space-y-0.5">
                             {record.consumedReels.map((r, i) => (
                               <li key={i}><span className="font-bold text-stone-700">{r.reelNo}</span>: {r.weight}kg</li>
                             ))}
                           </ul>
                        ) : (
                           <p className="text-xs text-stone-500">Reels: {record.reelNos || record.reelNo}</p>
                        )}
                      </td>
                      <td className="p-4 font-bold text-blue-700">{record.paperUsedFor}</td>
                      <td className="p-4 font-bold text-orange-700 bg-orange-50/30 text-lg">{record.useKg} KG</td>
                      <td className="p-4">
                        <p className="font-bold text-stone-800">{record.linerQty || '-'} <span className="text-[10px] font-normal text-stone-500">Good Qty</span></p>
                        {record.wasteSheetsKg > 0 && <p className="text-xs text-red-500">-{record.wasteSheetsKg}kg Waste</p>}
                        <p className="text-[10px] text-stone-500 mt-1 font-bold bg-stone-200 px-1 py-0.5 rounded inline-block">{upsDisplay}</p>
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        <button onClick={() => handleEdit(record)} className="text-blue-600 hover:text-blue-800 mr-4 font-bold text-sm" title="Edit">Edit</button>
                        {role === 'admin' && <button onClick={() => handleDelete(record.id, record.reelNos || record.reelNo)} className="text-red-500 hover:text-red-700 font-bold text-sm" title="Delete">Delete</button>}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}


// --- ORDERS VIEW ---
function OrdersView({ orders, production, items, companies, customers = [], addLog, role, getColRef, getDocRef, currentUser }) {
  const allowedCompanyId = currentUser?.role === 'admin' ? 'all' : (currentUser?.companyId || 'all');
  const visibleCompanies = allowedCompanyId === 'all' ? companies : companies.filter(c => c.id === allowedCompanyId);
  const visibleItems = allowedCompanyId === 'all' ? items : items.filter(i => i.companyId === allowedCompanyId);
  const visibleOrders = allowedCompanyId === 'all' ? orders : orders.filter(o => o.companyId === allowedCompanyId);

  const [newOrder, setNewOrder] = useState({
    orderDate: new Date().toISOString().split('T')[0], companyId: allowedCompanyId !== 'all' ? allowedCompanyId : '', customerId: '', itemId: '', orderQty: '', deliveryDate: '', status: 'Pending', rate: '', dispatchedQty: 0, openingFgQty: '',
    upsLength: '1', upsWidth: '1', 
    pocketsLength: '', pocketsWidth: '', longUpsLength: '1', longUpsWidth: '1', latUpsLength: '1', latUpsWidth: '1'
  });

  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const todayStr = new Date().toISOString().split('T')[0];
  const daysUntilDelivery = (deliveryDate) => {
    if (!deliveryDate) return null;
    return Math.ceil((new Date(deliveryDate) - new Date(todayStr)) / 86400000);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const item = items.find(i => i.id === newOrder.itemId);
    const customer = customers.find(c => c.id === newOrder.customerId);
    const orderData = { ...newOrder, itemName: item?.name || item?.Item_Name || 'Unknown Item', customerName: customer?.name || '' };
    const isPpc = item?.itemType === 'PPC' || item?.itemType === 'Partition' || item?.Item_Type === 'PPC';

    // BACKWARD COMPATIBILITY ENGINE: Syncs Matrix Ups into Total Ups for other tabs
    if (isPpc) {
        orderData.commonPerSet = newOrder.pocketsWidth; // Maps to Long Pieces
        orderData.smallPerSet = newOrder.pocketsLength; // Maps to Lat Pieces
        orderData.commonUps = parseInt(newOrder.longUpsLength || 1) * parseInt(newOrder.longUpsWidth || 1);
        orderData.smallUps = parseInt(newOrder.latUpsLength || 1) * parseInt(newOrder.latUpsWidth || 1);
        
        delete orderData.upsLength; delete orderData.upsWidth;
    } else {
        orderData.plannedUps = parseInt(newOrder.upsLength || 1) * parseInt(newOrder.upsWidth || 1);
        
        delete orderData.pocketsLength; delete orderData.pocketsWidth; delete orderData.longUpsLength; delete orderData.longUpsWidth; delete orderData.latUpsLength; delete orderData.latUpsWidth;
    }

    if (parseInt(orderData.openingFgQty || 0) >= parseInt(orderData.orderQty || 0)) orderData.status = 'Completed';

    await addDoc(getColRef('orders'), orderData);
    addLog(`Added new matrix order for ${newOrder.orderQty}x ${item?.name || item?.Item_Name || 'Unknown Item'}`);
    setNewOrder({ orderDate: new Date().toISOString().split('T')[0], companyId: allowedCompanyId !== 'all' ? allowedCompanyId : '', customerId: '', itemId: '', orderQty: '', deliveryDate: '', status: 'Pending', rate: '', dispatchedQty: 0, openingFgQty: '', upsLength: '1', upsWidth: '1', pocketsLength: '', pocketsWidth: '', longUpsLength: '1', longUpsWidth: '1', latUpsLength: '1', latUpsWidth: '1' });
  };

  const handleDelete = async (id, itemName) => {
    if(window.confirm(`Delete order for ${itemName}?`)) {
      await deleteDoc(getDocRef('orders', id));
      addLog(`Deleted order for ${itemName}`);
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    const nextStatus = currentStatus === 'Pending' ? 'In Production' : (currentStatus === 'In Production' ? 'Completed' : 'Pending');
    await updateDoc(getDocRef('orders', id), { status: nextStatus });
    addLog(`Updated order status to ${nextStatus}`);
  };

  const handleExport = () => {
    if (typeof downloadCSV !== 'function') return alert("Export function unavailable.");
    const exportData = visibleOrders.map(order => ({
      Order_Date: order.orderDate, Company: companies.find(c => c.id === order.companyId)?.name || 'Unknown', Item_Ordered: order.itemName || order.Item_Name, Target_Qty: order.orderQty, Status: order.status, Rate: order.rate, Total_Value: (parseFloat(order.orderQty||0) * parseFloat(order.rate||0)).toFixed(2)
    }));
    downloadCSV(exportData, 'orders');
  };

  // --- MATRIX PDF JOB CARD GENERATOR ---
  const generateJobCard = (order) => {
    try {
      const doc = new jsPDF();
      const compName = companies.find(c => c.id === order.companyId)?.name || 'Unknown Client';
      const item = items.find(i => i.id === order.itemId) || {};
      const isPpc = item.itemType === 'PPC' || item.itemType === 'Partition' || item.Item_Type === 'PPC';

      const dims = String(item.size || item.Size_mm || '0x0x0').toLowerCase().replace(/\*/g, 'x').split('x').map(s => parseFloat(s.trim()) || 0);
      const L = dims[0] || 0; const W = dims[1] || 0; const H = dims[2] || 0;
      const type = item.itemType || item.Item_Type || 'Box';
      
      let sheetsReqStr = ''; let boardDimsStr1 = ''; let boardDimsStr2 = ''; let plannedUpsStr = '';

      if (isPpc) {
          // Calculator Tab Logic Match
          const latPiecesPerSet = Math.max(0, parseInt(order.pocketsLength || order.smallPerSet || 2) - 1);
          const longPiecesPerSet = Math.max(0, parseInt(order.pocketsWidth || order.commonPerSet || 2) - 1);

          const totalLatNeeded = latPiecesPerSet * parseInt(order.orderQty || 0);
          const totalLongNeeded = longPiecesPerSet * parseInt(order.orderQty || 0);

          const lUpsL = parseInt(order.longUpsLength || 1); const lUpsW = parseInt(order.longUpsWidth || 1);
          const totalLongUps = lUpsL * lUpsW;
          const latUpsL = parseInt(order.latUpsLength || 1); const latUpsW = parseInt(order.latUpsWidth || 1);
          const totalLatUps = latUpsL * latUpsW;

          const longSheets = totalLongUps > 0 ? Math.ceil(totalLongNeeded / totalLongUps) : 0;
          const latSheets = totalLatUps > 0 ? Math.ceil(totalLatNeeded / totalLatUps) : 0;

          sheetsReqStr = `${longSheets + latSheets} Sheets Required (${longSheets} Long Sheets + ${latSheets} Lat Sheets)`;
          plannedUpsStr = `Long: ${lUpsL}L x ${lUpsW}W | Lat: ${latUpsL}L x ${latUpsW}W`;

          boardDimsStr1 = `Long Pieces Board: ${L * lUpsL} mm (L) x ${H * lUpsW} mm (W)`;
          boardDimsStr2 = `Lat Pieces Board: ${W * latUpsL} mm (L) x ${H * latUpsW} mm (W)`;
      } else {
          const uL = parseInt(order.upsLength || 1);
          const uW = parseInt(order.upsWidth || order.plannedUps || 1);
          const totalUps = uL * uW;
          
          sheetsReqStr = `${totalUps > 0 ? Math.ceil(parseInt(order.orderQty || 0) / totalUps) : 0} Sheets Required`;
          plannedUpsStr = `${uL} Length x ${uW} Width (${totalUps} Total Ups)`;

          let bl = 0, bw = 0;
          let targetL = 0, targetW = 0;
          if (type === 'Box') { 
            bl = (L + W) * 2 + 50; 
            bw = W + H + 20; 
            targetL = bl * uL;
            targetW = (W + H) * uW + 20;
          } else if (type === 'Tray' || type === 'Lid') { 
            bl = L + (H * 2) + 15; 
            bw = W + (H * 2) + 15; 
            targetL = bl * uL;
            targetW = (W + (H * 2)) * uW + 15;
          } else { 
            bl = L; 
            bw = W; 
            targetL = bl * uL;
            targetW = bw * uW;
          }

          boardDimsStr1 = `Single Unit Cut Size: ${bl} mm (L) x ${bw} mm (W)`;
          boardDimsStr2 = `Target Board Size: ${targetL} mm (L) x ${targetW} mm (W)`;
      }

      doc.setFontSize(24);
      doc.setFont("helvetica", "bold");
      doc.text("PRODUCTION JOB CARD", 105, 20, null, null, "center");

      doc.setFont("courier", "bold");
      doc.setFontSize(14);
      doc.text(`*JOB-${order.id.substring(0, 8).toUpperCase()}*`, 105, 30, null, null, "center");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Order Date: ${order.orderDate}`, 15, 45);
      doc.text(`Target Delivery: ${order.deliveryDate || 'N/A'}`, 15, 52);

      doc.setDrawColor(0);
      doc.setFillColor(245, 245, 245);
      doc.rect(15, 60, 180, 56, 'FD');

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(`Client: ${compName}`, 20, 70);
      doc.text(`Item: ${order.itemName || order.Item_Name}`, 20, 78);
      
      doc.setFontSize(12);
      doc.text(`Target Quantity: ${order.orderQty} ${isPpc ? 'Sets' : 'Boxes'}`, 20, 88);
      doc.text(`Machine Ups: ${plannedUpsStr}`, 105, 88);

      doc.setTextColor(21, 94, 117); 
      doc.text(`Production Target: ${sheetsReqStr}`, 20, 98);
      doc.text(boardDimsStr1, 20, 106);
      doc.text(boardDimsStr2, 20, 112);
      doc.setTextColor(0, 0, 0); 

      doc.setFontSize(12);
      doc.text("Manufacturing Specifications", 15, 130);
      
      autoTable(doc, {
        startY: 134,
        head: [['Dimension (mm)', 'Ply', 'Paper Specs', 'Est. Box Weight']],
        body: [[ item.size || item.Size_mm || 'N/A', `${item.ply || item.Ply || '-'} Ply`, `${item.paperGsm || '-'} GSM / ${item.paperBf || '-'} BF`, `${item.weight || item.Weight_g ? item.weight+'g' : 'Dynamic'}` ]],
        theme: 'grid',
        headStyles: { fillColor: [41, 37, 36] }
      });

      doc.setFontSize(12);
      doc.text("Routing & Sign-off", 15, doc.lastAutoTable.finalY + 15);

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 20,
        head: [['Process', 'Machine/Operator', 'Good Qty', 'Waste (KG)', 'Sign']],
        body: [ ['1. Corrugation', '', '', '', ''], ['2. Pasting / Lamination', '', '', '', ''], ['3. Creasing / Slotting', '', '', '', ''], ['4. Stitching / Gluing', '', '', '', ''], ['5. Bundling & QA', '', '', '', ''] ],
        theme: 'grid',
        headStyles: { fillColor: [240, 240, 240], textColor: 0 },
        styles: { minCellHeight: 15, valign: 'middle' }
      });

      doc.save(`JobCard_${compName}_${order.itemName}.pdf`);
    } catch(err) { console.error(err); alert("Error generating Job Card."); }
  };

  const selectedItemObj = items.find(i => i.id === newOrder.itemId);
  const isPPC = selectedItemObj?.itemType === 'PPC' || selectedItemObj?.itemType === 'Partition' || selectedItemObj?.Item_Type === 'PPC';

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-2xl font-bold">Order Management</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowOverdueOnly(v => !v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition border ${
              showOverdueOnly ? 'bg-red-600 text-white border-red-600' : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
            }`}
          >
            {showOverdueOnly ? 'Showing Overdue Only' : 'Show Overdue Only'}
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-300 font-medium text-sm transition">Export</button>
        </div>
      </div>
      <p className="text-sm font-bold text-blue-600 mb-6 bg-blue-50 inline-block px-3 py-1 rounded">Database Link: Showing {visibleOrders.length} total records downloaded</p>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 mb-8">
        <h3 className="font-bold mb-4">Add New Order</h3>
        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Order Date</label><input required type="date" className="w-full p-2 border rounded" value={newOrder.orderDate} onChange={e => setNewOrder({...newOrder, orderDate: e.target.value})} /></div>
          <div className="col-span-1"><label className="block text-xs font-bold text-amber-700 mb-1">Manufacturing Unit</label><select required className="w-full p-2 border border-amber-300 bg-amber-50 rounded" value={newOrder.companyId} onChange={e => setNewOrder({...newOrder, companyId: e.target.value, itemId: '', customerId: ''})}><option value="">-- Select Unit --</option>{[...visibleCompanies].sort((a,b) => (a?.name || '').localeCompare(b?.name || '')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="col-span-1"><label className="block text-xs font-bold text-blue-700 mb-1">End Customer</label><select className="w-full p-2 border border-blue-300 bg-blue-50 rounded" value={newOrder.customerId} onChange={e => setNewOrder({...newOrder, customerId: e.target.value})} disabled={!newOrder.companyId}><option value="">-- Select Customer --</option>{[...customers].filter(c => c.unitId === newOrder.companyId).sort((a,b) => (a?.name||'').localeCompare(b?.name||'')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="col-span-1 md:col-span-2"><label className="block text-xs text-stone-500 mb-1">Select Item</label><select required className="w-full p-2 border rounded" value={newOrder.itemId} onChange={e => setNewOrder({...newOrder, itemId: e.target.value})} disabled={!newOrder.companyId}><option value="">-- Select Item --</option>{[...visibleItems].filter(i => i.companyId === newOrder.companyId).sort((a,b) => (a?.name || a?.Item_Name || '').localeCompare(b?.name || b?.Item_Name || '')).map(i => <option key={i.id} value={i.id}>{i.name || i.Item_Name}</option>)}</select></div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">{isPPC ? 'Order Qty (Sets)' : 'Order Quantity'}</label><input required type="number" min="1" className="w-full p-2 border rounded" value={newOrder.orderQty} onChange={e => setNewOrder({...newOrder, orderQty: e.target.value})} /></div>
          <div className="col-span-1"><label className="block text-xs font-bold text-blue-600 mb-1">Legacy/Ready Stock</label><input type="number" min="0" placeholder="Optional" className="w-full p-2 border rounded bg-blue-50 border-blue-200" value={newOrder.openingFgQty} onChange={e => setNewOrder({...newOrder, openingFgQty: e.target.value})} /></div>
          
          {isPPC ? (
              <div className="col-span-1 md:col-span-6 grid grid-cols-6 gap-3 p-3 bg-blue-50 border border-blue-200 rounded">
                  <div className="col-span-1"><label className="block text-[10px] font-bold text-blue-700 mb-1">Pockets along Length</label><input required type="number" min="1" className="w-full p-2 border rounded text-xs" value={newOrder.pocketsLength} onChange={e => setNewOrder({...newOrder, pocketsLength: e.target.value})} /></div>
                  <div className="col-span-1"><label className="block text-[10px] font-bold text-blue-700 mb-1">Pockets along Width</label><input required type="number" min="1" className="w-full p-2 border rounded text-xs" value={newOrder.pocketsWidth} onChange={e => setNewOrder({...newOrder, pocketsWidth: e.target.value})} /></div>
                  <div className="col-span-1"><label className="block text-[10px] font-bold text-stone-700 mb-1">Long Pieces (Ups Length)</label><input required type="number" min="1" className="w-full p-2 border border-stone-300 rounded text-xs" value={newOrder.longUpsLength} onChange={e => setNewOrder({...newOrder, longUpsLength: e.target.value})} /></div>
                  <div className="col-span-1"><label className="block text-[10px] font-bold text-stone-700 mb-1">Long Pieces (Ups Width)</label><input required type="number" min="1" className="w-full p-2 border border-stone-300 rounded text-xs" value={newOrder.longUpsWidth} onChange={e => setNewOrder({...newOrder, longUpsWidth: e.target.value})} /></div>
                  <div className="col-span-1"><label className="block text-[10px] font-bold text-stone-700 mb-1">Lat Pieces (Ups Length)</label><input required type="number" min="1" className="w-full p-2 border border-stone-300 rounded text-xs" value={newOrder.latUpsLength} onChange={e => setNewOrder({...newOrder, latUpsLength: e.target.value})} /></div>
                  <div className="col-span-1"><label className="block text-[10px] font-bold text-stone-700 mb-1">Lat Pieces (Ups Width)</label><input required type="number" min="1" className="w-full p-2 border border-stone-300 rounded text-xs" value={newOrder.latUpsWidth} onChange={e => setNewOrder({...newOrder, latUpsWidth: e.target.value})} /></div>
              </div>
          ) : (
              <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-2 p-2 bg-stone-50 border border-stone-200 rounded">
                  <div className="col-span-1"><label className="block text-xs font-bold text-stone-700 mb-1">Ups along Length</label><input required type="number" min="1" className="w-full p-2 border rounded" value={newOrder.upsLength} onChange={e => setNewOrder({...newOrder, upsLength: e.target.value})} /></div>
                  <div className="col-span-1"><label className="block text-xs font-bold text-stone-700 mb-1">Ups along Width</label><input required type="number" min="1" className="w-full p-2 border rounded" value={newOrder.upsWidth} onChange={e => setNewOrder({...newOrder, upsWidth: e.target.value})} /></div>
              </div>
          )}
          
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Rate (₹) per {isPPC ? 'Set' : 'Box'}</label><input required type="number" step="0.01" className="w-full p-2 border rounded bg-green-50" value={newOrder.rate} onChange={e => setNewOrder({...newOrder, rate: e.target.value})} /></div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Target Delivery Date</label><input required type="date" className="w-full p-2 border rounded" value={newOrder.deliveryDate} onChange={e => setNewOrder({...newOrder, deliveryDate: e.target.value})} /></div>
          <div className="col-span-1 lg:col-span-2"><button type="submit" className="w-full bg-stone-900 text-white p-2 rounded flex items-center justify-center gap-2 hover:bg-stone-800 font-bold">Save Order</button></div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-left min-w-[1200px]">
          <thead className="bg-stone-100 text-stone-600 text-sm">
            <tr>
              <th className="p-4">Order Date</th>
              <th className="p-4">Unit</th>
              <th className="p-4">End Customer</th>
              <th className="p-4">Item Ordered</th>
              <th className="p-4">Target Qty</th>
              <th className="p-4">Rate & Value (₹)</th>
              <th className="p-4 bg-green-50 text-green-800">Ready Qty</th>
              <th className="p-4 bg-red-50 text-red-800">Pending Qty</th>
              <th className="p-4">Status & Job Card</th>
              {role === 'admin' && <th className="p-4 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {visibleOrders.length === 0 && <tr><td colSpan="11" className="p-4 text-center text-stone-500">No orders found.</td></tr>}
            {[...visibleOrders]
              .filter(o => !showOverdueOnly || (o.status !== 'Completed' && o.deliveryDate && new Date(o.deliveryDate) < new Date(todayStr)))
              .sort((a, b) => {
                const dA = daysUntilDelivery(a.deliveryDate);
                const dB = daysUntilDelivery(b.deliveryDate);
                const isOverdueA = dA !== null && dA < 0 && a.status !== 'Completed';
                const isOverdueB = dB !== null && dB < 0 && b.status !== 'Completed';
                if (isOverdueA && !isOverdueB) return -1;
                if (!isOverdueA && isOverdueB) return 1;
                if (dA !== null && dB !== null) return dA - dB;
                return new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime();
              })
              .map(order => {
              const compName = companies.find(c => c.id === order.companyId)?.name || 'Unknown';
              const statusColors = { 'Pending': 'bg-yellow-100 text-yellow-800 border-yellow-200', 'In Production': 'bg-blue-100 text-blue-800 border-blue-200', 'Completed': 'bg-green-100 text-green-800 border-green-200' };
              const days = daysUntilDelivery(order.deliveryDate);
              const isOverdue = days !== null && days < 0 && order.status !== 'Completed';
              const urgencyClass = isOverdue ? 'text-red-700 bg-red-100 border-red-300' : days !== null && days <= 3 ? 'text-amber-700 bg-amber-100 border-amber-300' : days !== null && days <= 7 ? 'text-orange-600 bg-orange-50 border-orange-200' : 'text-green-700 bg-green-50 border-green-200';

              const pLogs = production.filter(p => p.orderId === order.id);
              const item = items.find(i => i.id === order.itemId);
              const isPpcOrder = item?.itemType === 'PPC' || item?.itemType === 'Partition' || item?.Item_Type === 'PPC';
              
              let producedQty = 0; let targetSheetsDisplay = null;

              if (isPpcOrder) {
                  const cPiecesPerSet = Math.max(1, parseInt(order.pocketsLength || order.smallPerSet || 2) - 1);
                  const sPiecesPerSet = Math.max(1, parseInt(order.pocketsWidth || order.commonPerSet || 2) - 1);
                  let totalCommonPieces = 0; let totalSmallPieces = 0;
                  pLogs.forEach(p => {
                      const sheets = parseFloat(p.linerQty || 0);
                      totalCommonPieces += sheets * parseInt(p.commonUps || order.commonUps || 0);
                      totalSmallPieces += sheets * parseInt(p.smallUps || order.smallUps || 0);
                  });
                  producedQty = Math.min(Math.floor(totalCommonPieces / cPiecesPerSet), Math.floor(totalSmallPieces / sPiecesPerSet));
                  if (isNaN(producedQty) || producedQty === Infinity) producedQty = 0;
              } else {
                  const getGoodSheets = (p) => parseFloat(p.linerQty || 0);
                  const sumBoard = pLogs.filter(p => p.paperUsedFor === 'Board').reduce((acc, p) => acc + getGoodSheets(p), 0);
                  const sumLiner = pLogs.filter(p => p.paperUsedFor === 'Liner').reduce((acc, p) => acc + getGoodSheets(p), 0);
                  const sumPaper = pLogs.filter(p => p.paperUsedFor === 'Paper').reduce((acc, p) => acc + getGoodSheets(p), 0);
                  const ply = parseInt(item?.ply || item?.Ply || 3);
                  let effectiveBase = 0;
                  if (ply <= 2) effectiveBase = sumBoard + sumPaper; 
                  else if (ply === 3) effectiveBase = sumBoard + Math.min(sumLiner, sumPaper); 
                  else if (ply === 5) effectiveBase = sumBoard + Math.min(Math.floor(sumLiner / 2), sumPaper);
                  else if (ply === 7) effectiveBase = sumBoard + Math.min(Math.floor(sumLiner / 3), sumPaper);
                  else effectiveBase = sumBoard + sumPaper;
                  
                  producedQty = Math.floor(effectiveBase * parseFloat(order.plannedUps || order.upsLength * order.upsWidth || 1));
              }

              producedQty += parseInt(order.openingFgQty || 0);
              const pendingQty = Math.max(0, order.orderQty - producedQty);
              const rate = parseFloat(order.rate || 0);
              const totalValue = rate * parseInt(order.orderQty || 0);

              return (
                <tr key={order.id} className={`hover:bg-stone-50 ${isOverdue ? 'bg-red-50/20' : ''}`}>
                  <td className="p-4 whitespace-nowrap">
                    <div className="font-medium">{order.orderDate}</div>
                    {days !== null && order.status !== 'Completed' && (
                      <span className={`mt-1 inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${urgencyClass}`}>
                        {isOverdue ? `${Math.abs(days)}d OVERDUE` : days === 0 ? 'Due TODAY' : `${days}d left`}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    <p className="font-bold text-amber-800 text-xs uppercase tracking-wide" style={{fontSize:10}}>Unit</p>
                    <p className="font-bold text-stone-900">{compName}</p>
                  </td>
                  <td className="p-4">
                    <p className="font-bold text-blue-700">{order.customerName || <span className="text-stone-300 text-xs italic">—</span>}</p>
                  </td>
                  <td className="p-4 font-medium text-stone-800">{order.itemName || order.Item_Name}</td>
                  <td className="p-4"><p className="font-bold text-lg">{order.orderQty}</p>{isPpcOrder ? <span className="text-[10px] text-stone-500 font-bold block mt-1 leading-tight">Partition Set</span> : <span className="text-[10px] text-stone-500 font-bold block mt-1 leading-tight">{order.upsLength || order.plannedUps || 1}L x {order.upsWidth || 1}W Ups</span>}</td>
                  <td className="p-4"><p className="text-xs text-stone-500 mb-1">₹{rate.toFixed(2)} /{isPpcOrder?'set':'box'}</p><p className="font-bold text-stone-800">₹{totalValue.toFixed(2)}</p></td>
                  <td className="p-4 bg-green-50/30"><p className="font-bold text-green-600 text-lg">{producedQty}</p>{parseInt(order.openingFgQty || 0) > 0 && <p className="text-[10px] text-blue-600 font-bold">Includes {order.openingFgQty} legacy</p>}</td>
                  <td className="p-4 bg-red-50/30 font-bold text-red-500 text-lg">{pendingQty}</td>
                  <td className="p-4">
                    <button onClick={() => toggleStatus(order.id, order.status)} className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors mb-2 block ${statusColors[order.status] || 'bg-stone-100'}`} title="Click to change status">{order.status}</button>
                    {order.status !== 'Completed' && <button onClick={() => generateJobCard(order)} className="text-[10px] font-bold text-stone-700 bg-stone-200 hover:bg-stone-300 px-2 py-1 rounded">Print Job Card</button>}
                    {order.status === 'Completed' && (() => {
                      const totalPaperUsed = pLogs.reduce((acc, p) => acc + parseFloat(p.useKg || 0), 0);
                      const itemWeight = parseFloat(item?.weight || item?.Weight_g || 0); // grams
                      const expectedWeightKg = (producedQty * itemWeight) / 1000;
                      const weightDiff = totalPaperUsed - expectedWeightKg;
                      const diffPercent = totalPaperUsed > 0 ? (weightDiff / totalPaperUsed) * 100 : 0;
                      
                      return (
                        <div className="mt-2 text-[10px] bg-red-50 text-red-700 p-2 rounded border border-red-200 text-left font-sans max-w-[180px] shadow-sm">
                          <p className="font-bold uppercase tracking-wider text-[8px] text-red-800 mb-1">Weight Variance</p>
                          <div className="flex justify-between gap-2"><span>Paper Used:</span><strong>{totalPaperUsed.toFixed(1)} kg</strong></div>
                          <div className="flex justify-between gap-2"><span>Expected Fg:</span><strong>{expectedWeightKg.toFixed(1)} kg</strong></div>
                          <div className="flex justify-between border-t border-red-200 pt-1 mt-1 text-red-900 font-bold">
                            <span>Wastage:</span>
                            <span>{weightDiff.toFixed(1)} kg ({diffPercent.toFixed(1)}%)</span>
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  {role === 'admin' && <td className="p-4 text-right"><button onClick={() => handleDelete(order.id, order.itemName || order.Item_Name)} className="text-red-500 hover:text-red-700">Delete</button></td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- FINISHED GOODS VIEW ---
function FinishedGoodsView({ orders, production, items, companies, customers = [], addLog, getColRef, getDocRef, currentUser }) {
  const allowedCompanyId = currentUser?.role === 'admin' ? 'all' : (currentUser?.companyId || 'all');
  const visibleOrders = allowedCompanyId === 'all' ? orders : orders.filter(o => o.companyId === allowedCompanyId);

  const [dispatchForm, setDispatchForm] = useState({ orderId: null, qty: '' });
  const [editHistory, setEditHistory] = useState({ orderId: null, idx: -1, qty: '' });
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editItemForm, setEditItemForm] = useState({ name: '', size: '', ply: '', weight: '', paperGsm: '', paperBf: '', paperColour: 'Kraft', rate: '' });
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);

  const handleSelectRow = (orderId, checked) => {
    if (checked) {
      setSelectedOrderIds(prev => [...prev, orderId]);
    } else {
      setSelectedOrderIds(prev => prev.filter(id => id !== orderId));
    }
  };

  const handleSelectAllForUnit = (companyId, checked, activeOrders) => {
    const orderIds = activeOrders.map(ao => ao.order.id);
    if (checked) {
      setSelectedOrderIds(prev => {
        const newSelection = [...prev];
        orderIds.forEach(id => {
          if (!newSelection.includes(id)) newSelection.push(id);
        });
        return newSelection;
      });
    } else {
      setSelectedOrderIds(prev => prev.filter(id => !orderIds.includes(id)));
    }
  };

  const isAllSelectedForUnit = (companyId, activeOrders) => {
    if (!activeOrders.length) return false;
    return activeOrders.every(ao => selectedOrderIds.includes(ao.order.id));
  };

  const handleBulkDelete = async () => {
    if (currentUser?.role !== 'admin') return;
    if (!selectedOrderIds.length) return;
    if (window.confirm(`Are you sure you want to delete ${selectedOrderIds.length} stock records? This will completely remove them from the database.`)) {
      try {
        const batch = writeBatch(db);
        selectedOrderIds.forEach(id => {
          batch.delete(getDocRef('orders', id));
        });
        await batch.commit();
        addLog(`Bulk deleted ${selectedOrderIds.length} finished goods records`);
        setSelectedOrderIds([]);
      } catch (err) {
        console.error("Bulk delete error:", err);
        alert("Failed to delete records: " + err.message);
      }
    }
  };

  const handleStartEditItem = (item, order) => {
    setEditingItemId(item?.id || 'new');
    setEditingOrderId(order.id);
    setEditItemForm({
      name: item?.name || item?.Item_Name || order.itemName || order.Item_Name || '',
      size: item?.size || item?.Size_mm || '',
      ply: item?.ply || item?.Ply || '',
      weight: item?.weight || item?.Weight_g || '',
      paperGsm: item?.paperGsm || item?.Paper_GSM || '',
      paperBf: item?.paperBf || item?.Paper_BF || '',
      paperColour: item?.paperColour || item?.Paper_Colour || 'Kraft',
      rate: String(order.rate || item?.rate || 0)
    });
  };

  const handleSaveItemSpecs = async (e, itemId, order) => {
    e.preventDefault();
    try {
      let finalItemId = itemId;
      const rateVal = parseFloat(editItemForm.rate) || 0;
      
      const itemData = {
        name: editItemForm.name,
        size: editItemForm.size,
        ply: editItemForm.ply,
        weight: editItemForm.weight ? parseFloat(editItemForm.weight) : '',
        paperGsm: editItemForm.paperGsm ? parseFloat(editItemForm.paperGsm) : '',
        paperBf: editItemForm.paperBf ? parseFloat(editItemForm.paperBf) : '',
        paperColour: editItemForm.paperColour,
        companyId: order.companyId
      };

      if (!finalItemId || finalItemId === 'new') {
        const docRef = await addDoc(getColRef('items'), { ...itemData, itemType: 'Box' });
        finalItemId = docRef.id;
        addLog(`Created new box spec from Finished Goods: ${editItemForm.name}`);
      } else {
        await updateDoc(getDocRef('items', finalItemId), itemData);
        addLog(`Updated box spec: ${editItemForm.name}`);
      }

      await updateDoc(getDocRef('orders', order.id), {
        itemId: finalItemId,
        itemName: editItemForm.name,
        rate: rateVal
      });

      setEditingItemId(null);
      setEditingOrderId(null);
    } catch (err) {
      console.error("Error saving item specs:", err);
      alert("Failed to save item specifications: " + err.message);
    }
  };

  // Helper to cleanly calculate stock levels for a specific order
  const getOrderStockDetails = (order) => {
    const pLogs = production.filter(p => p.orderId === order.id);
    const item = items.find(i => i.id === order.itemId);
    const isPpcOrder = item?.itemType === 'PPC' || item?.Item_Type === 'PPC';
    
    let producedQty = 0;

    if (isPpcOrder) {
        const cPiecesPerSet = Math.max(1, parseInt(order.smallPerSet || 2) - 1);
        const sPiecesPerSet = Math.max(1, parseInt(order.commonPerSet || 2) - 1);
        let totalCommonPieces = 0, totalSmallPieces = 0;
        
        pLogs.forEach(p => {
            const sheets = parseFloat(p.linerQty || 0);
            totalCommonPieces += sheets * parseInt(p.commonUps || order.commonUps || 0);
            totalSmallPieces += sheets * parseInt(p.smallUps || order.smallUps || 0);
        });

        producedQty = Math.min(Math.floor(totalCommonPieces / cPiecesPerSet), Math.floor(totalSmallPieces / sPiecesPerSet));
        if (isNaN(producedQty) || producedQty === Infinity) producedQty = 0;
    } else {
        const getGoodSheets = (p) => parseFloat(p.linerQty || 0);
        const sumBoard = pLogs.filter(p => p.paperUsedFor === 'Board').reduce((acc, p) => acc + getGoodSheets(p), 0);
        const sumLiner = pLogs.filter(p => p.paperUsedFor === 'Liner').reduce((acc, p) => acc + getGoodSheets(p), 0);
        const sumPaper = pLogs.filter(p => p.paperUsedFor === 'Paper').reduce((acc, p) => acc + getGoodSheets(p), 0);
        
        const ply = parseInt(item?.ply || item?.Ply || 3);
        let effectiveBase = 0;

        if (ply <= 2) effectiveBase = sumBoard + sumPaper; 
        else if (ply === 3) effectiveBase = sumBoard + Math.min(sumLiner, sumPaper); 
        else if (ply === 5) effectiveBase = sumBoard + Math.min(Math.floor(sumLiner / 2), sumPaper);
        else if (ply === 7) effectiveBase = sumBoard + Math.min(Math.floor(sumLiner / 3), sumPaper);
        else effectiveBase = sumBoard + sumPaper;
        
        producedQty = Math.floor(effectiveBase * parseFloat(order.plannedUps || 1));
    }

    producedQty += parseInt(order.openingFgQty || 0);

    const totalKgUsed = pLogs.reduce((acc, p) => acc + Math.max(0, parseFloat(p.useKg || 0) - parseFloat(p.wasteSheetsKg || 0)), 0);
    const avgWeightKg = producedQty > 0 && totalKgUsed > 0 ? (totalKgUsed / producedQty) : (parseFloat(item?.weight || item?.Weight_g || 0) / 1000);
    
    const dispatchedQty = parseInt(order.dispatchedQty || 0);
    const rate = parseFloat(order.rate || 0);
    
    const dispatchedWeight = dispatchedQty * avgWeightKg;
    const dispatchedValue = dispatchedQty * rate;

    const inStock = Math.max(0, producedQty - dispatchedQty);
    const stockWeight = inStock * avgWeightKg;
    const stockValue = inStock * rate;

    return { producedQty, avgWeightKg, dispatchedQty, rate, dispatchedWeight, dispatchedValue, inStock, stockWeight, stockValue, isPpcOrder, item };
  };

  const handleDispatch = async (e, order, inStock, qtyToDispatch = null) => {
    if (e) e.preventDefault();
    const qty = qtyToDispatch || parseInt(e.target.dispatchQty.value);
    if (!qty || qty <= 0 || qty > inStock) return;

    let challanNo = `DC-${Math.floor(1000 + Math.random() * 9000)}-${new Date().getFullYear()}`;
    try {
      const counterRef = doc(db, 'counters', 'challans');
      const year = new Date().getFullYear();
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(counterRef);
        let nextNum = 1;
        if (snap.exists() && snap.data().year === year) {
          nextNum = (snap.data().count || 0) + 1;
        }
        tx.set(counterRef, { count: nextNum, year });
        challanNo = `DC-${String(nextNum).padStart(5, '0')}-${year}`;
      });
    } catch (err) {
      console.error("Failed to generate sequential DC, using random:", err);
    }
    
    const currentDispatched = parseInt(order.dispatchedQty || 0);
    const newDispatched = currentDispatched + qty;

    const newHistory = [...(order.dispatchHistory || []), {
      date: new Date().toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      qty: qty,
      dcNo: challanNo,
      tallySynced: false
    }];

    await updateDoc(getDocRef('orders', order.id), { 
      dispatchedQty: newDispatched,
      dispatchHistory: newHistory
    });
    
    addLog(`Dispatched ${qty} boxes for Order: ${order.itemName} (DC: ${challanNo})`);
    generatePDFChallan(order, qty, getOrderStockDetails(order), challanNo);
    if (e) e.target.reset(); 
  };

  // --- DISPATCH HISTORY EDIT/DELETE LOGIC ---
  const handleDeleteHistory = async (order, idx) => {
    if (!window.confirm('Delete this dispatch record? The stock will be returned to your inventory.')) return;
    const historyItem = order.dispatchHistory[idx];
    const newHistory = order.dispatchHistory.filter((_, i) => i !== idx);
    const newDispatchedQty = Math.max(0, (order.dispatchedQty || 0) - historyItem.qty);
    
    await updateDoc(getDocRef('orders', order.id), { dispatchedQty: newDispatchedQty, dispatchHistory: newHistory });
    addLog(`Deleted dispatch record of ${historyItem.qty} for ${order.itemName || order.Item_Name}`);
  };

  const handleUpdateHistory = async (e, order, idx) => {
    e.preventDefault();
    const newQty = parseInt(editHistory.qty);
    if (isNaN(newQty) || newQty <= 0) return;
    
    const oldQty = order.dispatchHistory[idx].qty;
    const newHistory = [...order.dispatchHistory];
    newHistory[idx] = { ...newHistory[idx], qty: newQty };
    
    const newDispatchedQty = Math.max(0, (order.dispatchedQty || 0) - oldQty + newQty);
    
    await updateDoc(getDocRef('orders', order.id), { dispatchedQty: newDispatchedQty, dispatchHistory: newHistory });
    addLog(`Updated dispatch record from ${oldQty} to ${newQty} for ${order.itemName || order.Item_Name}`);
    setEditHistory({ orderId: null, idx: -1, qty: '' });
  };

  const handleDeleteRecord = async (id, itemName) => {
    if(window.confirm(`Delete the stock record for ${itemName}? This will completely remove it from the database.`)) {
      try {
        await deleteDoc(getDocRef('orders', id));
        addLog(`Deleted finished goods record: ${itemName}`);
      } catch (err) {
        console.error(err);
        alert("Error deleting record.");
      }
    }
  };

  // --- PDF DELIVERY CHALLAN GENERATOR ---
  const generatePDFChallan = async (order, dispatchQty, stockInfo, providedChallanNo = null) => {
    try {
      let challanNo = providedChallanNo;
      if (!challanNo) {
        // F7: Sequential challan numbers via Firestore transaction
        try {
          const counterRef = doc(db, 'counters', 'challans');
          const year = new Date().getFullYear();
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(counterRef);
            let nextNum = 1;
            if (snap.exists() && snap.data().year === year) {
              nextNum = (snap.data().count || 0) + 1;
            }
            tx.set(counterRef, { count: nextNum, year });
            challanNo = `DC-${String(nextNum).padStart(5, '0')}-${year}`;
          });
        } catch {
        challanNo = `DC-${Math.floor(1000 + Math.random() * 9000)}-${new Date().getFullYear()}`;
        }
      }

      const doc = new jsPDF();
      const compName = companies.find(c => c.id === order.companyId)?.name || 'Unknown Client';
      const dateStr = new Date().toLocaleDateString();

      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text("DELIVERY CHALLAN", 105, 20, null, null, "center");
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Challan No: ${challanNo}`, 15, 35);
      doc.text(`Date: ${dateStr}`, 15, 42);
      doc.setFont("helvetica", "bold");
      doc.text("Billed To:", 130, 35);
      doc.setFont("helvetica", "normal");
      doc.text(compName, 130, 42);

      const tableBody = [
        [ 1, order.itemName || order.Item_Name, `${stockInfo.item?.size || stockInfo.item?.Size_mm || '-'} (${stockInfo.item?.ply || stockInfo.item?.Ply || '-'} Ply)`, dispatchQty, `${(dispatchQty * stockInfo.avgWeightKg).toFixed(2)} kg` ]
      ];

      autoTable(doc, {
        startY: 55,
        head: [['Sr No.', 'Item Description', 'Specifications', 'Quantity', 'Total Weight']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [41, 37, 36], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 5 }
      });

      const finalY = doc.lastAutoTable.finalY + 30;
      doc.text("Receiver's Signature", 15, finalY);
      doc.text("Authorized Signatory", 140, finalY);
      doc.save(`${compName}_Challan_${dateStr.replace(/\//g, '-')}.pdf`);
    } catch (err) {
      console.error("PDF Generation Error:", err);
      alert("Failed to generate PDF. Check browser console.");
    }
  };

  // --- TAX INVOICE GENERATOR (CGST/SGST/IGST) ---
  const generateTaxInvoice = async (order, stockInfo, companiesList, customersList = []) => {
    try {
      const unit = companiesList.find(c => c.id === order.companyId) || {};
      const customer = customersList.find(c => c.id === order.customerId) || {};
      const billedToName = customer.name || order.customerName || unit.name || 'Unknown';
      const billedToAddr = customer.billingAddress || '';
      const billedToGst  = customer.gstin || '';
      const gstTotal = parseFloat(unit.gstPercent || 18);
      const isInterState = (unit.state || '').toLowerCase() !== (customer.state || unit.state || '').toLowerCase() || !customer.state;
      const dispatchQty = stockInfo.dispatchedQty || 0;
      const rate = parseFloat(order.rate || 0);
      const taxable = dispatchQty * rate;
      const half = taxable * (gstTotal / 2 / 100);
      const total = isInterState ? taxable + taxable * (gstTotal / 100) : taxable + half + half;

      // Sequential invoice number
      let invoiceNo = `INV-${Math.floor(1000 + Math.random() * 9000)}-${new Date().getFullYear()}`;
      try {
        const counterRef = doc(db, 'counters', 'invoices');
        const year = new Date().getFullYear();
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(counterRef);
          let n = 1;
          if (snap.exists() && snap.data().year === year) n = (snap.data().count || 0) + 1;
          tx.set(counterRef, { count: n, year });
          invoiceNo = `INV-${String(n).padStart(5, '0')}-${year}`;
        });
      } catch {}

      const pdfDoc = new jsPDF();
      const dateStr = new Date().toLocaleDateString('en-IN');

      // Header
      pdfDoc.setFontSize(18); pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.text('TAX INVOICE', 105, 18, null, null, 'center');
      pdfDoc.setFontSize(9); pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.text(`Invoice No: ${invoiceNo}`, 15, 30);
      pdfDoc.text(`Date: ${dateStr}`, 15, 36);
      pdfDoc.text(`From (Unit): ${unit.name || ''}`, 15, 42);
      if (unit.gstin) pdfDoc.text(`GSTIN: ${unit.gstin}`, 15, 48);

      // Billed To
      pdfDoc.setFont('helvetica', 'bold'); pdfDoc.text('Billed To:', 110, 30);
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.text(billedToName, 110, 36);
      if (billedToAddr) pdfDoc.text(billedToAddr, 110, 42, { maxWidth: 80 });
      if (billedToGst) pdfDoc.text(`GSTIN: ${billedToGst}`, 110, 52);

      // Item table
      autoTable(pdfDoc, {
        startY: 62,
        head: [['#', 'Description', 'Specifications', 'Qty', 'Rate (₹)', 'Taxable Amt (₹)']],
        body: [[1, order.itemName || order.Item_Name || '-', `${stockInfo.item?.size || '-'} | ${stockInfo.item?.ply || '-'} Ply`, dispatchQty, rate.toFixed(2), taxable.toFixed(2)]],
        theme: 'grid',
        headStyles: { fillColor: [28, 25, 23], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        styles: { fontSize: 9, cellPadding: 4 },
      });

      const tY = pdfDoc.lastAutoTable.finalY + 8;

      // Tax breakdown
      const taxRows = isInterState
        ? [['Taxable Amount', `₹${taxable.toFixed(2)}`], [`IGST @ ${gstTotal}%`, `₹${(taxable * gstTotal / 100).toFixed(2)}`], ['Total', `₹${total.toFixed(2)}`]]
        : [['Taxable Amount', `₹${taxable.toFixed(2)}`], [`CGST @ ${gstTotal / 2}%`, `₹${half.toFixed(2)}`], [`SGST @ ${gstTotal / 2}%`, `₹${half.toFixed(2)}`], ['Total', `₹${total.toFixed(2)}`]];

      autoTable(pdfDoc, {
        startY: tY,
        body: taxRows,
        theme: 'plain',
        columnStyles: { 0: { halign: 'right', fontStyle: 'bold', cellWidth: 150 }, 1: { halign: 'right', cellWidth: 35 } },
        styles: { fontSize: 9 },
        margin: { left: 15, right: 15 },
      });

      const botY = pdfDoc.lastAutoTable.finalY + 20;
      pdfDoc.setFont('helvetica', 'normal'); pdfDoc.setFontSize(9);
      pdfDoc.text("Receiver's Signature", 15, botY);
      pdfDoc.text('For Authorized Signatory', 140, botY);

      pdfDoc.save(`${billedToName}_Invoice_${invoiceNo}.pdf`);
    } catch (err) {
      console.error('Invoice error:', err);
      alert('Failed to generate invoice: ' + err.message);
    }
  };

  const handleLegacyStockImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const rows = text.split(/\r?\n/).filter(r => r.trim()); 
        if (rows.length < 2) return alert("File is empty or missing data rows.");

        const parseRow = (line) => {
          const result = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            if (line[i] === '"' && line[i+1] === '"') { current += '"'; i++; }
            else if (line[i] === '"') { inQuotes = !inQuotes; }
            else if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
            else { current += line[i]; }
          }
          result.push(current.trim());
          return result;
        };

        const headers = parseRow(rows[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
        const idxClient = headers.findIndex(h => h.includes('client') || h.includes('company'));
        const idxItem = headers.findIndex(h => h.includes('item') || h.includes('product'));
        const idxStock = headers.findIndex(h => h.includes('stock') || h.includes('qty'));
        const idxRate = headers.findIndex(h => h.includes('rate') || h.includes('price'));
        const idxSize = headers.findIndex(h => h.includes('size') || h.includes('dimension') || h.includes('measure') || h.includes('spec'));
        const idxWeight = headers.findIndex(h => h.includes('weight') || h.includes('gram') || h.includes('wt'));

        if (idxClient === -1 || idxItem === -1 || idxStock === -1) {
          return alert("Error: Could not find required columns. Please ensure your CSV has headers exactly like: Client, Item, Current_Stock, Rate, Size, Weight");
        }

        let successCount = 0;
        let errors = [];

        for (let i = 1; i < rows.length; i++) {
          const cols = parseRow(rows[i]);
          if (cols.every(c => !c)) continue;

          const clientName = (cols[idxClient] || '').trim();
          const itemName = (cols[idxItem] || '').trim();
          const stockRaw = String(cols[idxStock] || '').replace(/,/g, ''); 
          const rateRaw = idxRate !== -1 ? String(cols[idxRate] || '').replace(/,/g, '') : '';
          const sizeRaw = idxSize !== -1 ? (cols[idxSize] || '').trim() : '';
          const weightRaw = idxWeight !== -1 ? (cols[idxWeight] || '').trim() : '';
          let weightVal = '';
          if (weightRaw) {
            const parsedW = parseFloat(weightRaw);
            if (!isNaN(parsedW)) weightVal = parsedW;
          }

          const stockQty = parseInt(stockRaw);
          if (isNaN(stockQty) || stockQty <= 0) continue;

          const comp = companies.find(c => (c?.name||'').toLowerCase().trim() === clientName.toLowerCase());
          if (!comp) {
            errors.push(`Row ${i+1}: Client "${clientName}" not found.`);
            continue;
          }

          let rate = parseFloat(rateRaw);
          if (isNaN(rate)) rate = 0;

          let itemId = '';
          let finalItemName = itemName;

          let item = items.find(itm => {
            const nameMatch = (itm?.name||itm?.Item_Name||'').toLowerCase().trim() === itemName.toLowerCase();
            const itmSize = (itm?.size||itm?.Size_mm||'').toLowerCase().replace(/\s/g, '');
            const csvSize = sizeRaw.toLowerCase().replace(/\s/g, '');
            const sizeMatch = !csvSize || !itmSize || itmSize === csvSize;
            return nameMatch && itm.companyId === comp.id && sizeMatch;
          });

          if (!item) {
            const newItemRef = await addDoc(getColRef('items'), {
              companyId: comp.id,
              itemType: 'Box',
              name: itemName,
              size: sizeRaw,
              ply: '3',
              weight: weightVal,
              paperGsm: '',
              paperBf: '',
              paperColour: 'Kraft',
              rate: rate
            });
            itemId = newItemRef.id;
            addLog(`Registered new box spec during CSV import: ${itemName} (${sizeRaw || 'No Size'}, ${weightVal ? `${weightVal}g` : 'No Weight'})`);
          } else {
            itemId = item.id;
            finalItemName = item.name || item.Item_Name || 'Unknown Item';
            if (rate === 0) {
              rate = parseFloat(item.rate || 0) || 0;
            }
            const updates = {};
            if (sizeRaw && !(item.size || item.Size_mm)) {
              updates.size = sizeRaw;
            }
            if (weightVal && parseFloat(item.weight || item.Weight_g || 0) !== weightVal) {
              updates.weight = weightVal;
              addLog(`Updated box spec weight for ${finalItemName} to ${weightVal}g via CSV import`);
            }
            if (Object.keys(updates).length > 0) {
              await updateDoc(getDocRef('items', item.id), updates);
            }
          }

          await addDoc(getColRef('orders'), {
            orderDate: new Date().toISOString().split('T')[0],
            companyId: comp.id || '',
            itemId: itemId,
            itemName: finalItemName,
            orderQty: stockQty || 0,
            openingFgQty: stockQty || 0,
            status: 'Completed',
            plannedUps: '1',
            deliveryDate: new Date().toISOString().split('T')[0],
            rate: rate,
            dispatchedQty: 0
          });
          successCount++;
        }

        addLog(`Imported ${successCount} legacy stock items.`);
        if (errors.length > 0) alert(`Imported ${successCount} items successfully, but skipped ${errors.length} rows due to spelling mismatches:\n\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n...and more.' : ''}`);
        else if (successCount > 0) alert(`Successfully matched and imported all ${successCount} items!`);
        else alert(`0 items imported. Check your spelling or ensure the Current_Stock column has numbers.`);

      } catch (err) {
        console.error("Parse Error Details:", err);
        alert(`Failed to save to database. Error details logged to browser console.`);
      } finally { e.target.value = null; }
    };
    reader.readAsText(file);
  };

  const handleExportTemplate = () => {
    if (typeof downloadCSV !== 'function') return alert("Export function unavailable.");
    const exportData = visibleOrders.map(order => {
      const stock = getOrderStockDetails(order);
      if (stock.inStock <= 0) return null; 
      return { Order_ID: order.id, Client: companies.find(c => c.id === order.companyId)?.name || 'Unknown', Item: order.itemName || order.Item_Name, Current_Stock: stock.inStock, Dispatch_Qty_To_Add: '', Dispatch_Date: new Date().toISOString().split('T')[0] };
    }).filter(Boolean);
    if (exportData.length === 0) return alert("No items currently in stock to dispatch.");
    downloadCSV(exportData, 'dispatch_import_template');
  };

  const handleDispatchCSVImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const rawRows = text.split(/\r?\n/);
        const parseCSVLine = (line) => {
          const result = []; let currentVal = ''; let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"' && line[i+1] === '"') { currentVal += '"'; i++; } else if (char === '"') { inQuotes = !inQuotes; } else if (char === ',' && !inQuotes) { result.push(currentVal.trim()); currentVal = ''; } else { currentVal += char; }
          }
          result.push(currentVal.trim()); return result;
        };

        let headers = []; let headerRowIndex = -1;
        for (let i = 0; i < rawRows.length; i++) {
          if (!rawRows[i].trim()) continue;
          const cols = parseCSVLine(rawRows[i]);
          if (cols.some(c => c.trim() !== '')) { headers = cols.map(h => h.trim().toLowerCase()); headerRowIndex = i; break; }
        }

        if (headerRowIndex === -1) return alert("Invalid CSV structure.");

        let updateCount = 0;
        for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
          if (!rawRows[i].trim()) continue;
          const values = parseCSVLine(rawRows[i]);
          if (values.every(v => v.trim() === '')) continue;

          let rowObj = {};
          headers.forEach((h, idx) => { rowObj[h] = values[idx]; });

          const orderId = rowObj['order_id'];
          const dispatchQtyRaw = String(rowObj['dispatch_qty_to_add'] || rowObj['dispatch qty to add'] || '').replace(/,/g, '');
          const dispatchQty = parseInt(dispatchQtyRaw);
          let dispatchDate = rowObj['dispatch_date'] || rowObj['dispatch date'];
          if (!dispatchDate || dispatchDate.trim() === '') dispatchDate = new Date().toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

          if (orderId && !isNaN(dispatchQty) && dispatchQty > 0) {
            const order = orders.find(o => o.id === orderId);
            if (order) {
              const currentDispatched = parseInt(order.dispatchedQty || 0);
              const newHistory = [...(order.dispatchHistory || []), { date: dispatchDate, qty: dispatchQty }];
              await updateDoc(getDocRef('orders', order.id), { dispatchedQty: currentDispatched + dispatchQty, dispatchHistory: newHistory });
              updateCount++;
            }
          }
        }
        addLog(`Bulk dispatched ${updateCount} orders via CSV`);
        alert(`Successfully recorded ${updateCount} dispatches!`);
      } catch (err) { console.error(err); alert("Error processing CSV."); } finally { e.target.value = null; }
    };
    reader.readAsText(file);
  };

  // Compute global combined totals across all units
  let combinedTotalStock = 0;
  let combinedTotalWeight = 0;
  let combinedTotalValue = 0;

  visibleOrders.forEach(order => {
    const stock = getOrderStockDetails(order);
    if (stock.producedQty <= 0 && stock.dispatchedQty <= 0) return;
    combinedTotalStock += stock.inStock;
    combinedTotalWeight += stock.stockWeight;
    combinedTotalValue += stock.stockValue;
  });

  const visibleCompanies = allowedCompanyId === 'all' ? companies : companies.filter(c => c.id === allowedCompanyId);

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Finished Goods & Dispatch Dashboard</h2>
        <div className="flex gap-2">
          {currentUser?.role === 'admin' && selectedOrderIds.length > 0 && (
            <button onClick={handleBulkDelete} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition shadow-sm mr-2 cursor-pointer">
              <Trash2 className="w-4 h-4" /> Bulk Delete ({selectedOrderIds.length})
            </button>
          )}
          <label className="flex items-center gap-2 bg-blue-100 text-blue-800 px-4 py-2 rounded-lg hover:bg-blue-200 font-medium text-sm transition cursor-pointer shadow-sm">
            <Upload className="w-4 h-4" /> Import Legacy Stock (CSV)
            <input type="file" accept=".csv" className="hidden" onChange={handleLegacyStockImport} />
          </label>
          <div className="w-px bg-stone-300 mx-2"></div>
          <button onClick={handleExportTemplate} className="flex items-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-300 font-medium text-sm transition">
            <Download className="w-4 h-4" /> Export Dispatch Template
          </button>
          <label className="flex items-center gap-2 bg-stone-900 text-white px-4 py-2 rounded-lg hover:bg-stone-800 font-medium text-sm transition cursor-pointer">
            <Upload className="w-4 h-4" /> Import Dispatch CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleDispatchCSVImport} />
          </label>
        </div>
      </div>

      {/* Global Combined Summary Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-stone-900 text-white p-6 rounded-xl shadow-sm border border-stone-800 flex flex-col justify-between">
          <div>
            <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">Total Combined Stock</p>
            <p className="text-3xl font-extrabold mt-1">{combinedTotalStock.toLocaleString()} <span className="text-xs text-stone-400 font-normal">pcs</span></p>
          </div>
        </div>
        <div className="bg-stone-900 text-white p-6 rounded-xl shadow-sm border border-stone-800 flex flex-col justify-between">
          <div>
            <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">Total Combined Weight</p>
            <p className="text-3xl font-extrabold mt-1">{combinedTotalWeight.toLocaleString('en-IN', { maximumFractionDigits: 1 })} <span className="text-xs text-stone-400 font-normal">kg</span></p>
          </div>
        </div>
        <div className="bg-stone-900 text-white p-6 rounded-xl shadow-sm border border-stone-800 flex flex-col justify-between">
          <div>
            <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">Total Combined Value</p>
            <p className="text-3xl font-extrabold mt-1">₹{combinedTotalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-8">
        {visibleCompanies.map(company => {
          const unitOrders = visibleOrders.filter(o => o.companyId === company.id);
          const activeOrders = unitOrders.map(order => {
            const stock = getOrderStockDetails(order);
            return { order, stock };
          }).filter(item => item.stock.producedQty > 0 || item.stock.dispatchedQty > 0);

          if (activeOrders.length === 0) return null;

          // Calculate unit-level totals
          const unitTotalStock = activeOrders.reduce((sum, item) => sum + item.stock.inStock, 0);
          const unitTotalWeight = activeOrders.reduce((sum, item) => sum + item.stock.stockWeight, 0);
          const unitTotalValue = activeOrders.reduce((sum, item) => sum + item.stock.stockValue, 0);

          return (
            <div key={company.id} className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
              {/* Unit Header Card */}
              <div className="bg-stone-100 border-b border-stone-200 p-4 flex flex-wrap justify-between items-center gap-4">
                <div>
                  <h3 className="text-lg font-bold text-stone-800">{company.name}</h3>
                  <p className="text-xs text-stone-500">Finished Goods Specifications by Unit</p>
                </div>
                <div className="flex gap-4">
                  <div className="bg-white px-3 py-1.5 rounded-lg border border-stone-200 text-center">
                    <span className="text-[9px] font-bold text-stone-400 uppercase block leading-tight">Unit Stock</span>
                    <strong className="text-xs text-stone-700">{unitTotalStock.toLocaleString()} pcs</strong>
                  </div>
                  <div className="bg-white px-3 py-1.5 rounded-lg border border-stone-200 text-center">
                    <span className="text-[9px] font-bold text-stone-400 uppercase block leading-tight">Unit Weight</span>
                    <strong className="text-xs text-stone-700">{unitTotalWeight.toFixed(1)} kg</strong>
                  </div>
                  <div className="bg-white px-3 py-1.5 rounded-lg border border-stone-200 text-center">
                    <span className="text-[9px] font-bold text-stone-400 uppercase block leading-tight">Unit Value</span>
                    <strong className="text-xs text-stone-700">₹{unitTotalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong>
                  </div>
                </div>
              </div>

              {/* Unit Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[1100px]">
                  <thead className="bg-stone-50 text-stone-600 text-xs border-b border-stone-200">
                    <tr>
                      {currentUser?.role === 'admin' && (
                        <th className="p-3 w-10 text-center">
                          <input 
                            type="checkbox" 
                            checked={isAllSelectedForUnit(company.id, activeOrders)} 
                            onChange={(e) => handleSelectAllForUnit(company.id, e.target.checked, activeOrders)} 
                            className="w-4 h-4 accent-stone-950 cursor-pointer"
                          />
                        </th>
                      )}
                      <th className="p-3 pl-4">Order Date</th>
                      <th className="p-3">Item Details</th>
                      <th className="p-3 bg-blue-50/20">Produced (Qty & Wt)</th>
                      <th className="p-3 bg-orange-50/20">Dispatched (Qty, Val, Wt)</th>
                      <th className="p-3 bg-green-50/20 text-green-800">In Stock (Qty, Val, Wt)</th>
                      <th className="p-3 text-right pr-4">Dispatch Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 text-xs">
                    {activeOrders.map(({ order, stock }) => (
                      <tr key={order.id} className={`hover:bg-stone-50/50 ${dispatchForm.orderId === order.id ? 'bg-blue-50/30' : ''} ${selectedOrderIds.includes(order.id) ? 'bg-red-50/20' : ''}`}>
                        {currentUser?.role === 'admin' && (
                          <td className="p-3 w-10 text-center align-middle">
                            <input 
                              type="checkbox" 
                              checked={selectedOrderIds.includes(order.id)} 
                              onChange={(e) => handleSelectRow(order.id, e.target.checked)} 
                              className="w-4 h-4 accent-stone-950 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="p-3 pl-4">
                          <p className="font-bold text-stone-800">Ordered: {order.orderDate}</p>
                          <p className="text-[10px] text-stone-400">ID: {order.id.substring(0, 8).toUpperCase()}</p>
                        </td>
                        <td className="p-3">
                          {(editingItemId === (stock.item?.id || 'new') && editingOrderId === order.id) ? (
                            <form onSubmit={(e) => handleSaveItemSpecs(e, stock.item?.id, order)} className="flex flex-col gap-1 p-2 bg-stone-50 rounded border border-stone-200 max-w-[220px]">
                              <div>
                                <label className="block text-[8px] font-bold uppercase text-stone-500">Item Name</label>
                                <input type="text" className="w-full p-1 border rounded text-[11px] bg-white" value={editItemForm.name} onChange={e => setEditItemForm({...editItemForm, name: e.target.value})} required />
                              </div>
                              <div className="grid grid-cols-2 gap-1">
                                <div>
                                  <label className="block text-[8px] font-bold uppercase text-stone-500">Size (mm)</label>
                                  <input type="text" placeholder="e.g. 200x150x100" className="w-full p-1 border rounded text-[11px] bg-white" value={editItemForm.size} onChange={e => setEditItemForm({...editItemForm, size: e.target.value})} />
                                </div>
                                <div>
                                  <label className="block text-[8px] font-bold uppercase text-stone-500">Ply</label>
                                  <select className="w-full p-1 border rounded text-[11px] bg-white" value={editItemForm.ply} onChange={e => setEditItemForm({...editItemForm, ply: e.target.value})}>
                                    <option value="">-</option>
                                    <option value="2">2 Ply</option>
                                    <option value="3">3 Ply</option>
                                    <option value="5">5 Ply</option>
                                    <option value="7">7 Ply</option>
                                  </select>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-1">
                                <div>
                                  <label className="block text-[8px] font-bold uppercase text-stone-500">Weight (g)</label>
                                  <input type="number" step="0.1" className="w-full p-1 border rounded text-[11px] bg-white" value={editItemForm.weight} onChange={e => setEditItemForm({...editItemForm, weight: e.target.value})} />
                                </div>
                                <div>
                                  <label className="block text-[8px] font-bold uppercase text-stone-500">GSM</label>
                                  <input type="number" className="w-full p-1 border rounded text-[11px] bg-white" value={editItemForm.paperGsm} onChange={e => setEditItemForm({...editItemForm, paperGsm: e.target.value})} />
                                </div>
                                <div>
                                  <label className="block text-[8px] font-bold uppercase text-stone-500">BF</label>
                                  <input type="number" className="w-full p-1 border rounded text-[11px] bg-white" value={editItemForm.paperBf} onChange={e => setEditItemForm({...editItemForm, paperBf: e.target.value})} />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-1">
                                <div>
                                  <label className="block text-[8px] font-bold uppercase text-stone-500">Rate (₹)</label>
                                  <input type="number" step="0.01" className="w-full p-1 border rounded text-[11px] bg-white" value={editItemForm.rate} onChange={e => setEditItemForm({...editItemForm, rate: e.target.value})} />
                                </div>
                                <div>
                                  <label className="block text-[8px] font-bold uppercase text-stone-500">Colour</label>
                                  <select className="w-full p-1 border rounded text-[11px] bg-white" value={editItemForm.paperColour} onChange={e => setEditItemForm({...editItemForm, paperColour: e.target.value})}>
                                    <option value="Kraft">Kraft</option>
                                    <option value="Golden">Golden</option>
                                    <option value="White">White</option>
                                  </select>
                                </div>
                              </div>
                              <div className="flex gap-1 mt-1">
                                <button type="submit" className="flex-1 bg-stone-900 text-white py-1 rounded text-[10px] font-bold hover:bg-stone-800">Save</button>
                                <button type="button" onClick={() => { setEditingItemId(null); setEditingOrderId(null); }} className="flex-1 bg-stone-200 text-stone-700 py-1 rounded text-[10px] hover:bg-stone-300">Cancel</button>
                              </div>
                            </form>
                          ) : (
                            <div className="group relative pr-6">
                              <div className="flex items-center gap-1.5">
                                <p className="font-bold text-stone-900">{order.itemName || order.Item_Name}</p>
                                <button 
                                  onClick={() => handleStartEditItem(stock.item, order)} 
                                  className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-stone-700 transition-opacity p-0.5"
                                  title="Edit Item Details"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                              <p className="text-[10px] text-stone-500 mt-0.5">
                                {stock.item?.size || stock.item?.Size_mm || 'No Size'} | {stock.item?.ply || stock.item?.Ply || '-'} Ply | ₹{stock.rate.toFixed(2)}/{stock.isPpcOrder?'set':'box'}
                              </p>
                              <p className="text-[9px] text-stone-400 font-medium mt-0.5">
                                Weight: {stock.item?.weight || stock.item?.Weight_g ? `${stock.item.weight || stock.item.Weight_g}g` : 'No Weight'} | GSM: {stock.item?.paperGsm || stock.item?.Paper_GSM || '-'} | BF: {stock.item?.paperBf || stock.item?.Paper_BF || '-'} | {stock.item?.paperColour || stock.item?.Paper_Colour || 'Kraft'}
                              </p>
                            </div>
                          )}
                        </td>
                        <td className="p-3 bg-blue-50/20">
                          <p className="font-bold text-base text-blue-700">{stock.producedQty}</p>
                          <p className="text-[10px] font-medium text-blue-600">{(stock.producedQty * stock.avgWeightKg).toFixed(1)} kg total</p>
                          {parseInt(order.openingFgQty || 0) > 0 && <p className="text-[9px] text-blue-600 font-bold bg-blue-100 px-1 py-0.5 rounded inline-block mt-0.5">Includes {order.openingFgQty} legacy</p>}
                          
                          {/* Wastage Report for Completed Order */}
                          {order.status === 'Completed' && (() => {
                            const pLogs = production.filter(p => p.orderId === order.id);
                            const totalPaperUsed = pLogs.reduce((acc, p) => acc + parseFloat(p.useKg || 0), 0);
                            const itemWeight = parseFloat(stock.item?.weight || stock.item?.Weight_g || 0); // grams
                            const expectedWeightKg = (stock.producedQty * itemWeight) / 1000;
                            const weightDiff = totalPaperUsed - expectedWeightKg;
                            const diffPercent = totalPaperUsed > 0 ? (weightDiff / totalPaperUsed) * 100 : 0;
                            
                            return (
                              <div className="mt-2 text-[9px] bg-red-50 text-red-700 p-1.5 rounded border border-red-200 text-left font-sans max-w-[160px] shadow-sm">
                                <p className="font-bold uppercase tracking-wider text-[8px] text-red-800 mb-0.5">Wastage Report</p>
                                <div className="flex justify-between gap-2"><span>Paper Used:</span><strong>{totalPaperUsed.toFixed(1)} kg</strong></div>
                                <div className="flex justify-between gap-2"><span>Expected Fg:</span><strong>{expectedWeightKg.toFixed(1)} kg</strong></div>
                                <div className="flex justify-between border-t border-red-200 pt-0.5 mt-0.5 text-red-900 font-bold">
                                  <span>Wastage:</span>
                                  <span>{weightDiff.toFixed(1)} kg ({diffPercent.toFixed(1)}%)</span>
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="p-3 bg-orange-50/20">
                          <p className="font-bold text-base text-orange-600">{stock.dispatchedQty}</p>
                          <p className="text-[10px] font-bold text-stone-800">₹{stock.dispatchedValue.toFixed(2)}</p>
                          <p className="text-[10px] font-medium text-orange-600 mb-1">{stock.dispatchedWeight.toFixed(1)} kg</p>
                          
                          {order.dispatchHistory && order.dispatchHistory.length > 0 && (
                            <div className="mt-1 pt-1 border-t border-orange-200">
                              <p className="text-[9px] font-bold text-orange-850 mb-0.5">Dispatch History:</p>
                              <ul className="text-[9px] space-y-0.5 text-orange-805 max-h-24 overflow-y-auto">
                                {order.dispatchHistory.map((h, i) => (
                                  editHistory.orderId === order.id && editHistory.idx === i ? (
                                      <form key={i} onSubmit={(e) => handleUpdateHistory(e, order, i)} className="flex items-center gap-1">
                                        <input type="number" min="1" className="w-12 p-0.5 border border-orange-400 rounded text-[9px]" value={editHistory.qty} onChange={e => setEditHistory({...editHistory, qty: e.target.value})} autoFocus />
                                        <button type="submit" className="bg-green-600 text-white px-1.5 py-0.5 rounded text-[8px] hover:bg-green-700">Save</button>
                                        <button type="button" onClick={() => setEditHistory({orderId: null, idx: -1, qty: ''})} className="bg-stone-300 px-1.5 py-0.5 rounded text-[8px] hover:bg-stone-400">Cancel</button>
                                      </form>
                                  ) : (
                                      <li key={i} className="flex justify-between items-center group relative cursor-pointer hover:bg-orange-100 p-0.5 rounded transition-colors">
                                        <span>
                                          <strong className="text-orange-950 font-mono text-[8px] bg-orange-200 px-1 py-0.2 rounded mr-1">{h.dcNo || 'DC-Legacy'}</strong>
                                          {h.date.split(',')[0]}: <span className="font-bold text-orange-900">{h.qty} pcs</span>
                                        </span>
                                        <div className="hidden group-hover:flex items-center gap-1 ml-1">
                                          {currentUser?.role === 'admin' && (
                                            <>
                                              <button onClick={() => setEditHistory({orderId: order.id, idx: i, qty: h.qty})} className="text-blue-600 hover:text-blue-800" title="Edit Dispatch"><Edit2 className="w-2.5 h-2.5"/></button>
                                              <button onClick={() => handleDeleteHistory(order, i)} className="text-red-500 hover:text-red-700" title="Delete Dispatch"><Trash2 className="w-2.5 h-2.5"/></button>
                                            </>
                                          )}
                                          <button onClick={() => generatePDFChallan(order, h.qty, stock, h.dcNo)} className="text-[8px] bg-stone-800 text-white px-1 py-0.2 rounded shadow-sm hover:bg-stone-700">PDF</button>
                                        </div>
                                      </li>
                                  )
                                ))}
                              </ul>
                            </div>
                          )}
                        </td>
                        <td className="p-3 bg-green-50/20">
                          <p className="font-bold text-lg text-green-700">{stock.inStock}</p>
                          <p className="text-[10px] font-bold text-stone-800">₹{stock.stockValue.toFixed(2)}</p>
                          <p className="text-[10px] font-medium text-green-600">{stock.stockWeight.toFixed(1)} kg</p>
                        </td>
                        <td className="p-3 text-right pr-4">
                          <div className="flex flex-col items-end gap-2">
                            <div className="flex items-center justify-end gap-1.5">
                              {stock.inStock > 0 ? (
                                <form onSubmit={(e) => handleDispatch(e, order, stock.inStock)} className="flex items-center gap-1.5">
                                  <input required type="number" min="1" max={stock.inStock} name="dispatchQty" className={`w-16 p-1 border border-stone-300 rounded text-xs bg-white focus:ring-1 focus:ring-stone-800 focus:outline-none ${dispatchForm.orderId === order.id ? 'ring-1 ring-blue-500' : ''}`} placeholder="Qty" value={dispatchForm.orderId === order.id ? dispatchForm.qty : undefined} onChange={dispatchForm.orderId === order.id ? (e) => setDispatchForm({...dispatchForm, qty: e.target.value}) : undefined} />
                                  <button type="submit" className="bg-stone-900 text-white px-2.5 py-1.5 rounded text-[10px] font-bold hover:bg-stone-800 flex items-center gap-1">
                                    <Download className="w-2.5 h-2.5" /> Dispatch
                                  </button>
                                  {dispatchForm.orderId === order.id && <button type="button" onClick={() => setDispatchForm({orderId: null, qty: ''})} className="bg-stone-200 px-1.5 py-1 rounded text-[10px]">Cancel</button>}
                                </form>
                              ) : (
                                <span className="text-[10px] font-bold text-stone-400 bg-stone-100 px-2 py-1 rounded">No Stock</span>
                              )}
                              
                              {currentUser?.role === 'admin' && (
                                <button onClick={() => handleDeleteRecord(order.id, order.itemName || order.Item_Name)} className="ml-1 text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors" title="Delete Entire Record">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            
                            <button onClick={() => generatePDFChallan(order, stock.dispatchedQty || 0, stock)} className="text-[9px] font-bold text-stone-600 bg-stone-200 hover:bg-stone-300 px-2 py-1 rounded flex items-center gap-1 transition-colors mt-0.5">
                               Generate Delivery Challan
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {combinedTotalStock === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-8 text-center text-stone-500 text-sm">
          No finished goods currently in stock.
        </div>
      )}
    </div>
  );
}

// --- ITEMS VIEW ---
function ItemsView({ items, companies, addLog, role, getColRef, getDocRef, currentUser, costings = [] }) {
  const allowedCompanyId = currentUser?.role === 'admin' ? 'all' : (currentUser?.companyId || 'all');
  const visibleCompanies = allowedCompanyId === 'all' ? companies : companies.filter(c => c.id === allowedCompanyId);
  const visibleItems = allowedCompanyId === 'all' ? items : items.filter(i => i.companyId === allowedCompanyId);

  const [newItem, setNewItem] = useState({ companyId: allowedCompanyId !== 'all' ? allowedCompanyId : '', itemType: 'Box', name: '', size: '', ply: '', weight: '', paperGsm: '', paperBf: '', paperColour: 'Kraft' });
  const [filters, setFilters] = useState({ company: '', name: '', type: '', ply: '' });

  const handleAdd = async (e) => {
    e.preventDefault();
    await addDoc(getColRef('items'), newItem);
    addLog(`Added new box spec: ${newItem.name} (${newItem.itemType})`);
    setNewItem({ companyId: '', itemType: 'Box', name: '', size: '', ply: '', weight: '', paperGsm: '', paperBf: '', paperColour: 'Kraft' });
  };

  const handleDelete = async (id, name) => {
    if(window.confirm(`Delete ${name}?`)) {
      await deleteDoc(getDocRef('items', id));
      addLog(`Deleted item: ${name}`);
    }
  };

  const filteredItems = visibleItems.filter(item => {
    const compName = companies.find(c => c.id === item.companyId)?.name || 'Unknown';
    const itemName = item.name || item.Item_Name || 'Unnamed';
    const itemType = item.itemType || item.Item_Type || 'Box';
    const itemPly = item.ply || item.Ply || '';

    if (filters.company && !compName.toLowerCase().includes(filters.company.toLowerCase())) return false;
    if (filters.name && !itemName.toLowerCase().includes(filters.name.toLowerCase())) return false;
    if (filters.type && itemType.toLowerCase() !== filters.type.toLowerCase()) return false;
    if (filters.ply && String(itemPly) !== String(filters.ply)) return false;
    
    return true;
  });

  const handleExport = () => {
    if (typeof downloadCSV !== 'function') return alert("Export function unavailable.");
    const exportData = filteredItems.map(item => ({
      Company: companies.find(c => c.id === item.companyId)?.name || 'Unknown',
      itemType: item.itemType || item.Item_Type || '',
      name: item.name || item.Item_Name || '',
      size: item.size || item.Size_mm || '',
      ply: item.ply || item.Ply || '',
      weight: item.weight || item.Weight_g || 'N/A',
      paperGsm: item.paperGsm || item.Paper_GSM || '',
      paperBf: item.paperBf || item.Paper_BF || '',
      paperColour: item.paperColour || item.Paper_Colour || ''
    }));
    downloadCSV(exportData, 'box_specifications');
  };

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Box Specifications Database</h2>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-300 font-medium text-sm transition cursor-pointer">
            Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={(e) => {
              if (typeof handleCSVImport === 'function') {
                handleCSVImport(e, 'items', getColRef, addLog, (row, getVal) => {
                  const compName = getVal(row, 'Company name', 'Company', 'Client', 'Customer', 'Brand') || '';
                  const comp = companies.find(c => c?.name?.toLowerCase().trim() === compName.toLowerCase().trim());
                  return {
                    companyId: comp ? comp.id : '',
                    itemType: getVal(row, 'Type', 'Item Type', 'Style', 'Category') || 'Box',
                    name: getVal(row, 'Item Name', 'Item', 'Product', 'Box Name', 'Code', 'Title', 'Description') || 'Unnamed Item',
                    size: getVal(row, 'Size ( L x W x H) mm', 'Size', 'Dimensions', 'L x W x H', 'Size mm', 'Measurements') || '',
                    ply: getVal(row, 'Ply', 'Layers', 'Board Ply', 'No of Plies') || '3',
                    weight: getVal(row, 'weight', 'Weight g', 'Grams', 'Box Weight') || '',
                    paperGsm: getVal(row, 'paper gsm', 'GSM', 'Top GSM', 'Board GSM') || '',
                    paperBf: getVal(row, 'Paper bf', 'BF', 'Bursting Factor', 'Strength') || '',
                    paperColour: getVal(row, 'Colour', 'Color', 'Paper Color', 'Shade') || 'Kraft'
                  };
                });
              }
            }} />
          </label>
          <button onClick={handleExport} className="flex items-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-300 font-medium text-sm transition">
            Export
          </button>
        </div>
      </div>
      
      {role === 'admin' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 mb-6">
          <h3 className="font-bold mb-4">Add New Item</h3>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
            <div className="col-span-1 md:col-span-2"><label className="block text-xs text-stone-500 mb-1">Manufacturing Unit <span className="text-red-400">*</span></label><select required className="w-full p-2 border rounded" value={newItem.companyId} onChange={e => setNewItem({...newItem, companyId: e.target.value})}><option value="">-- Select Unit --</option>{[...visibleCompanies].sort((a,b) => (a?.name || '').localeCompare(b?.name || '')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Item Type</label><select required className="w-full p-2 border rounded" value={newItem.itemType} onChange={e => setNewItem({...newItem, itemType: e.target.value})}><option value="Box">Box</option><option value="Tray">Tray</option><option value="Sheet">Sheet</option><option value="PPC">PPC</option><option value="Lid">Lid</option><option value="Plate">Plate</option></select></div>
            <div className="col-span-1 md:col-span-3"><label className="block text-xs text-stone-500 mb-1">Item Name / Code</label><input required type="text" className="w-full p-2 border rounded" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} /></div>
            <div className="col-span-1 md:col-span-3"><label className="block text-xs text-stone-500 mb-1">Size (L x W x H) in mm</label><input required type="text" placeholder="e.g. 250x200x150" className="w-full p-2 border rounded" value={newItem.size} onChange={e => setNewItem({...newItem, size: e.target.value})} /></div>
            <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Ply</label><select required className="w-full p-2 border rounded" value={newItem.ply} onChange={e => setNewItem({...newItem, ply: e.target.value})}><option value="">-</option><option value="2">2 Ply</option><option value="3">3 Ply</option><option value="5">5 Ply</option><option value="7">7 Ply</option></select></div>
            <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Weight (g)</label><input type="number" step="0.1" placeholder="Optional" className="w-full p-2 border rounded" value={newItem.weight} onChange={e => setNewItem({...newItem, weight: e.target.value})} /></div>
            <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Paper GSM</label><input required type="number" className="w-full p-2 border rounded" value={newItem.paperGsm} onChange={e => setNewItem({...newItem, paperGsm: e.target.value})} /></div>
            <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Paper BF</label><input required type="number" className="w-full p-2 border rounded" value={newItem.paperBf} onChange={e => setNewItem({...newItem, paperBf: e.target.value})} /></div>
            <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Colour</label><select required className="w-full p-2 border rounded" value={newItem.paperColour} onChange={e => setNewItem({...newItem, paperColour: e.target.value})}><option value="Kraft">Kraft (Brown)</option><option value="Golden">Golden</option><option value="White">White</option></select></div>
            <div className="col-span-1 md:col-span-6 lg:col-span-2"><button type="submit" className="w-full bg-stone-900 text-white p-2 rounded flex items-center justify-center gap-2 hover:bg-stone-800">Save Item to Database</button></div>
          </form>
        </div>
      )}

      <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-200 mb-6 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 text-stone-500 mr-2">Filter:</div>
        <input type="text" placeholder="Company..." className="p-2 border rounded text-sm w-32 focus:outline-none focus:ring-2 focus:ring-stone-800" value={filters.company} onChange={e => setFilters({...filters, company: e.target.value})} />
        <input type="text" placeholder="Item Name / Code..." className="p-2 border rounded text-sm flex-1 min-w-[150px] focus:outline-none focus:ring-2 focus:ring-stone-800" value={filters.name} onChange={e => setFilters({...filters, name: e.target.value})} />
        <select className="p-2 border rounded text-sm w-32 focus:outline-none focus:ring-2 focus:ring-stone-800" value={filters.type} onChange={e => setFilters({...filters, type: e.target.value})}>
          <option value="">All Types</option>
          <option value="Box">Box</option>
          <option value="Tray">Tray</option>
          <option value="Sheet">Sheet</option>
          <option value="PPC">PPC</option>
          <option value="Lid">Lid</option>
          <option value="Plate">Plate</option>
        </select>
        <select className="p-2 border rounded text-sm w-24 focus:outline-none focus:ring-2 focus:ring-stone-800" value={filters.ply} onChange={e => setFilters({...filters, ply: e.target.value})}>
          <option value="">All Plies</option>
          <option value="2">2 Ply</option>
          <option value="3">3 Ply</option>
          <option value="5">5 Ply</option>
          <option value="7">7 Ply</option>
        </select>
        <button onClick={() => setFilters({company: '', name: '', type: '', ply: ''})} className="text-xs text-blue-500 hover:text-blue-700 underline ml-2 transition">Clear</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-left min-w-[800px]">
          <thead className="bg-stone-100 text-stone-600 text-sm">
            <tr><th className="p-4">Company</th><th className="p-4">Item Details</th><th className="p-4">Size (L x W x H) mm</th><th className="p-4">Paper Specs</th><th className="p-4 bg-green-50 text-green-800">Saved Costing</th>{role === 'admin' && <th className="p-4 text-right">Actions</th>}</tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {filteredItems.length === 0 && <tr><td colSpan="5" className="p-4 text-center text-stone-500">No items found matching your filters.</td></tr>}
            {[...filteredItems].sort((a,b) => {
               const compA = companies.find(c => c.id === a.companyId)?.name || '';
               const compB = companies.find(c => c.id === b.companyId)?.name || '';
               if (compA === compB) {
                 const nA = a?.name || a?.Item_Name || '';
                 const nB = b?.name || b?.Item_Name || '';
                 return nA.localeCompare(nB);
               }
               return compA.localeCompare(compB);
            }).map(item => (
              <tr key={item.id} className="hover:bg-stone-50">
                <td className="p-4">{companies.find(c => c.id === item.companyId)?.name || 'Unknown'}</td>
                <td className="p-4"><p className="font-bold text-stone-900">{item.name || item.Item_Name || 'Unnamed'}</p><p className="text-xs text-stone-500">{item.itemType || item.Item_Type || 'Box'}</p></td>
                <td className="p-4 whitespace-nowrap">{item.size || item.Size_mm || '-'}</td>
                <td className="p-4 text-sm"><p><span className="font-medium">{item.ply || item.Ply || '-'}-Ply</span> | {item.weight || item.Weight_g ? `${item.weight || item.Weight_g}g` : 'N/A'}</p><p className="text-stone-500">{item.paperGsm || item.Paper_GSM || '-'} GSM, {item.paperBf || item.Paper_BF || '-'} BF, {item.paperColour || item.Paper_Colour || '-'}</p></td>
                {(() => {
                  const sc = costings.find(c => c.itemId === item.id);
                  return (
                    <td className="p-4 bg-green-50/30">
                      {sc ? (
                        <div className="text-xs space-y-0.5">
                          <p className="font-bold text-green-800 text-base">₹{sc.unitCost?.toFixed(2)}</p>
                          <p className="text-stone-500">{sc.unitWeight?.toFixed(3)} kg/unit</p>
                          <p className="text-stone-400">₹{sc.blendedRate?.toFixed(2)}/kg blended</p>
                        </div>
                      ) : (
                        <span className="text-xs text-stone-300 italic">—</span>
                      )}
                    </td>
                  );
                })()}
                {role === 'admin' && <td className="p-4 text-right"><button onClick={() => handleDelete(item.id, item.name || item.Item_Name)} className="text-red-500 hover:text-red-700">Delete</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- COMPANIES VIEW ---
function CompaniesView({ companies, addLog, getColRef, getDocRef }) {
  const blank = { name: '', gstin: '', billingAddress: '', state: '', gstPercent: '18' };
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState(null);

  const startEdit = (c) => { setEditId(c.id); setForm({ name: c.name || '', gstin: c.gstin || '', billingAddress: c.billingAddress || '', state: c.state || '', gstPercent: String(c.gstPercent || '18') }); };
  const cancelEdit = () => { setEditId(null); setForm(blank); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payload = { name: form.name.trim(), gstin: form.gstin.trim(), billingAddress: form.billingAddress.trim(), state: form.state.trim(), gstPercent: parseFloat(form.gstPercent) || 18 };
    if (editId) {
      await updateDoc(getDocRef('companies', editId), payload);
      addLog(`Updated client: ${payload.name}`);
      cancelEdit();
    } else {
      await addDoc(getColRef('companies'), payload);
      addLog(`Added new client: ${payload.name}`);
      setForm(blank);
    }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Delete ${name}? This does not delete their items.`)) {
      await deleteDoc(getDocRef('companies', id));
      addLog(`Deleted client: ${name}`);
    }
  };

  const F = ({ label, k, placeholder = '', type = 'text' }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</label>
      <input type={type} className="apex-input" placeholder={placeholder} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} />
    </div>
  );

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', paddingBottom: 48 }}>
      <div className="apex-page-header">
        <div><h2 style={{ fontSize: 22, fontWeight: 800 }}>Manage Client Companies</h2><p style={{ fontSize: 12, color: 'var(--text-muted)' }}>GST details are used for Tax Invoice generation</p></div>
      </div>

      <div className="apex-card" style={{ padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>{editId ? 'Edit Company' : 'Add New Company'}</h3>
        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <F label="Company Name *" k="name" placeholder="ABC Industries" />
            <F label="GSTIN" k="gstin" placeholder="22AAAAA0000A1Z5" />
            <F label="State" k="state" placeholder="Gujarat" />
            <F label="GST %" k="gstPercent" placeholder="18" type="number" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 4 }}>Billing Address</label>
            <textarea className="apex-input" rows={2} placeholder="Street, City, PIN" value={form.billingAddress} onChange={e => setForm({ ...form, billingAddress: e.target.value })} style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="apex-btn apex-btn-primary">{editId ? 'Save Changes' : <><Plus style={{ width: 15, height: 15 }} /> Add Company</>}</button>
            {editId && <button type="button" className="apex-btn apex-btn-secondary" onClick={cancelEdit}>Cancel</button>}
          </div>
        </form>
      </div>

      <div className="apex-card" style={{ overflow: 'hidden' }}>
        {companies.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No companies yet.</div>}
        {[...companies].sort((a, b) => (a?.name || '').localeCompare(b?.name || '')).map(c => (
          <div key={c.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</p>
              {c.gstin && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>GSTIN: {c.gstin} | {c.state} | GST: {c.gstPercent || 18}%</p>}
              {c.billingAddress && <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.billingAddress}</p>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="apex-btn apex-btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => startEdit(c)}><Edit2 style={{ width: 13, height: 13 }} /> Edit</button>
              <button onClick={() => handleDelete(c.id, c.name)} className="apex-btn" style={{ padding: '6px 12px', fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)' }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- USERS VIEW ---
function UsersView({ users, companies, addLog, getColRef, getDocRef, currentUserId }) {
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('staff');
  const [newPassword, setNewPassword] = useState('');
  const [newCompanyId, setNewCompanyId] = useState('all');

  const handleAdd = async (e) => {
    e.preventDefault();
    if(!newName.trim() || !newPassword.trim()) { alert("Name and Password are required!"); return; }
    await addDoc(getColRef('erp_users'), { name: newName, role: newRole, password: newPassword, companyId: newCompanyId, lastAccess: null });
    addLog(`Created new ${newRole} user: ${newName}`);
    setNewName(''); setNewRole('staff'); setNewPassword(''); setNewCompanyId('all');
  };

  const handleDelete = async (id, name) => {
    if (id === currentUserId) { alert("You cannot delete yourself!"); return; }
    if(window.confirm(`Delete user ${name}?`)) {
      await deleteDoc(getDocRef('erp_users', id));
      addLog(`Deleted user: ${name}`);
    }
  };

  const handleChangePassword = async (id, name) => {
    const newPwd = window.prompt(`Enter a new password for ${name}:`);
    if (newPwd !== null && newPwd.trim() !== '') {
      await updateDoc(getDocRef('erp_users', id), { password: newPwd.trim() });
      addLog(`Changed password for user: ${name}`);
      alert(`Password for ${name} has been successfully updated!`);
    }
  };

  const formatDate = (dateString) => {
    if(!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">User Management</h2>
      </div>
      <form onSubmit={handleAdd} className="flex flex-col md:flex-row gap-4 mb-8 bg-white p-4 rounded-xl border shadow-sm items-center flex-wrap">
        <input required type="text" placeholder="User Full Name" className="flex-1 min-w-[150px] p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-800" value={newName} onChange={e => setNewName(e.target.value)} />
        <input required type="text" placeholder="Set Password" className="flex-1 min-w-[150px] p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-800" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
        <select value={newRole} onChange={e=>setNewRole(e.target.value)} className="p-3 border rounded-lg bg-stone-50 min-w-[120px]"><option value="staff">Staff (Restricted)</option><option value="admin">Admin (Full Access)</option></select>
        <select value={newCompanyId} onChange={e=>setNewCompanyId(e.target.value)} className="p-3 border rounded-lg bg-stone-50 min-w-[150px]"><option value="all">All Companies</option>{[...companies].sort((a,b) => (a?.name || '').localeCompare(b?.name || '')).map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}</select>
        <button type="submit" className="bg-stone-900 text-white px-6 py-3 rounded-lg hover:bg-stone-800 w-full md:w-auto flex items-center justify-center gap-2">Add User</button>
      </form>
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-stone-100 text-stone-600 text-sm"><tr><th className="p-4">Name</th><th className="p-4">Role</th><th className="p-4">Assigned To</th><th className="p-4">Last Accessed</th><th className="p-4 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-stone-200">
            {[...users].sort((a,b) => (a?.name || '').localeCompare(b?.name || '')).map(u => {
              const assignedCompany = companies.find(c => c.id === u.companyId)?.name || 'All Companies';
              return (
              <tr key={u.id} className="hover:bg-stone-50">
                <td className="p-4 font-medium flex items-center gap-2">{u.name} {u.id === currentUserId && <span className="text-xs bg-stone-200 text-stone-600 px-2 py-0.5 rounded-full">You</span>}</td>
                <td className="p-4"><span className={`px-2 py-1 rounded text-xs uppercase font-bold ${u.role === 'admin' ? 'bg-stone-800 text-white' : 'bg-stone-200 text-stone-700'}`}>{u.role}</span></td>
                <td className="p-4 text-stone-600 text-sm">{assignedCompany}</td>
                <td className="p-4 text-stone-500 text-sm">{formatDate(u.lastAccess)}</td>
                <td className="p-4 text-right whitespace-nowrap">
                  <button onClick={() => handleChangePassword(u.id, u.name)} className="text-blue-500 hover:text-blue-700 mr-3" title="Change Password">Edit</button>
                  <button onClick={() => handleDelete(u.id, u.name)} className="text-red-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-red-400" disabled={u.id === currentUserId} title="Delete User">Delete</button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- LOGS VIEW ---
function LogsView({ logs }) {
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'
    });
  };

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">System Activity Logs</h2>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-4 space-y-3">
        {logs.length === 0 && <p className="text-stone-500 text-center py-4">No activity recorded yet.</p>}
        {[...logs].sort((a,b) => {
               const dateA = new Date(a.time).getTime();
               const dateB = new Date(b.time).getTime();
               return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
            }).map(log => (
          <div key={log.id} className="flex justify-between items-center text-sm border-b pb-3 last:border-0 hover:bg-stone-50 p-2 rounded">
            <div><span className="font-semibold text-stone-900 mr-2">{log.userName}:</span><span className="text-stone-700">{log.action}</span></div>
            <span className="text-stone-400 whitespace-nowrap ml-4">{formatDate(log.time)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- VENDORS VIEW ---
function VendorsView({ vendors, addLog, role, getColRef, getDocRef, currentUser, purchaseOrders = [] }) {
  const blank = { name: '', contact: '', phone: '', email: '', address: '', gstin: '' };
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState(null);
  const [ratingMap, setRatingMap] = useState({});

  const startEdit = (v) => { setEditId(v.id); setForm({ name: v.name||'', contact: v.contact||'', phone: v.phone||'', email: v.email||'', address: v.address||'', gstin: v.gstin||'' }); };
  const cancel = () => { setEditId(null); setForm(blank); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editId) { await updateDoc(getDocRef('vendors', editId), form); addLog(`Updated vendor: ${form.name}`); cancel(); }
    else { await addDoc(getColRef('vendors'), form); addLog(`Added vendor: ${form.name}`); setForm(blank); }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Delete vendor ${name}?`)) { await deleteDoc(getDocRef('vendors', id)); addLog(`Deleted vendor: ${name}`); }
  };

  const handleRate = async (vendorId, stars) => {
    setRatingMap(m => ({ ...m, [vendorId]: stars }));
    await updateDoc(getDocRef('vendors', vendorId), { rating: stars });
    addLog(`Rated vendor: ${stars} stars`);
  };

  const StarRating = ({ vendorId, current }) => {
    const r = ratingMap[vendorId] ?? current ?? 0;
    return (
      <div style={{ display: 'flex', gap: 2 }}>
        {[1,2,3,4,5].map(s => (
          <button key={s} onClick={() => handleRate(vendorId, s)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1 }}>
            <Star style={{ width: 15, height: 15, fill: s <= r ? '#f59e0b' : 'none', color: s <= r ? '#f59e0b' : '#d1d5db' }} />
          </button>
        ))}
      </div>
    );
  };

  const F = ({ label, k, placeholder='' }) => (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <label style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'.05em' }}>{label}</label>
      <input className="apex-input" placeholder={placeholder} value={form[k]} onChange={e => setForm({...form,[k]:e.target.value})} />
    </div>
  );

  return (
    <div style={{ maxWidth:900, margin:'0 auto', paddingBottom:48 }}>
      <div className="apex-page-header">
        <div><h2 style={{ fontSize:22, fontWeight:800 }}>Vendor Master</h2><p style={{ fontSize:12, color:'var(--text-muted)' }}>Manage suppliers and ratings</p></div>
      </div>
      {role === 'admin' && (
        <div className="apex-card" style={{ padding:24, marginBottom:24 }}>
          <h3 style={{ fontSize:14, fontWeight:700, marginBottom:16 }}>{editId ? 'Edit Vendor' : 'Add Vendor'}</h3>
          <form onSubmit={handleSave}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
              <F label="Vendor Name *" k="name" placeholder="Supplier Co." />
              <F label="Contact Person" k="contact" placeholder="Name" />
              <F label="Phone" k="phone" placeholder="+91..." />
              <F label="Email" k="email" placeholder="vendor@co.com" />
              <F label="GSTIN" k="gstin" placeholder="22AAAAA0000A1Z5" />
              <F label="Address" k="address" placeholder="City, State" />
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button type="submit" className="apex-btn apex-btn-primary">{editId ? 'Save' : <><Plus style={{width:14,height:14}}/> Add</>}</button>
              {editId && <button type="button" className="apex-btn apex-btn-secondary" onClick={cancel}>Cancel</button>}
            </div>
          </form>
        </div>
      )}
      <div className="apex-card" style={{ overflow:'hidden' }}>
        {vendors.length === 0 && <div style={{ padding:32, textAlign:'center', color:'var(--text-muted)' }}>No vendors yet.</div>}
        {[...vendors].sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(v => {
          const vPOs = purchaseOrders.filter(p => p.vendorId === v.id);
          const prices = vPOs.map(p => parseFloat(p.ratePerKg||0)).filter(r => r > 0);
          return (
            <div key={v.id} style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <p style={{ fontWeight:700, fontSize:15 }}>{v.name}</p>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2, display:'flex', gap:12, flexWrap:'wrap' }}>
                    {v.contact && <span>👤 {v.contact}</span>}
                    {v.phone && <span>📞 {v.phone}</span>}
                    {v.gstin && <span>GSTIN: {v.gstin}</span>}
                    {prices.length > 0 && <span style={{ color:'#16a34a', fontWeight:700 }}>Avg Rate: ₹{(prices.reduce((a,b)=>a+b,0)/prices.length).toFixed(2)}/kg ({prices.length} POs)</span>}
                  </div>
                  {role === 'admin' && <div style={{ marginTop:6 }}><StarRating vendorId={v.id} current={v.rating} /></div>}
                </div>
                {role === 'admin' && (
                  <div style={{ display:'flex', gap:8 }}>
                    <button className="apex-btn apex-btn-secondary" style={{ padding:'6px 12px', fontSize:12 }} onClick={() => startEdit(v)}><Edit2 style={{width:13,height:13}}/> Edit</button>
                    <button className="apex-btn" style={{ padding:'6px 12px', fontSize:12, color:'var(--danger)', background:'var(--danger-bg)', border:'1px solid var(--danger-border)' }} onClick={() => handleDelete(v.id, v.name)}>Delete</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- PURCHASE ORDERS VIEW ---
function PurchaseOrdersView({ purchaseOrders, vendors, companies, inventory, addLog, role, getColRef, getDocRef, currentUser, onNavigateInventory }) {
  const blankHeader = { vendorId:'', companyId:'', invoiceNo:'', expectedDate:'', notes:'' };
  const blankLine   = { itemDescription:'', qty:'', unit:'kg', ratePerKg:'', gsm:'', bf:'' };
  const [header, setHeader] = useState(blankHeader);
  const [lines, setLines] = useState([{ ...blankLine }]);
  const [search, setSearch] = useState('');

  const addLine    = () => setLines(l => [...l, { ...blankLine }]);
  const removeLine = (i) => setLines(l => l.filter((_,idx)=>idx!==i));
  const setLine    = (i, field, val) => setLines(l => l.map((row,idx) => idx===i ? {...row,[field]:val} : row));

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!header.vendorId) return;
    const validLines = lines.filter(l => l.itemDescription && l.qty);
    if (!validLines.length) return;
    const lineItems = validLines.map(l => ({ ...l, qty: parseFloat(l.qty), ratePerKg: parseFloat(l.ratePerKg||0), gsm: l.gsm||'', bf: l.bf||'' }));
    const totalQty = lineItems.reduce((a,l) => a+l.qty, 0);
    await addDoc(getColRef('purchaseOrders'), { ...header, lineItems, status:'Pending', createdAt: new Date().toISOString() });
    addLog(`Created PO: ${lineItems.length} line(s) from ${vendors.find(v=>v.id===header.vendorId)?.name||'vendor'}`);
    setHeader(blankHeader); setLines([{ ...blankLine }]);
  };

  const handleStatus = async (id, status) => {
    const updatePayload = { status, updatedAt: new Date().toISOString() };
    if (status === 'Received') {
      updatePayload.receivedDate = new Date().toISOString().split('T')[0];
      updatePayload.tallySynced = false;
    }
    await updateDoc(getDocRef('purchaseOrders', id), updatePayload);
    addLog(`PO status → ${status}`);
  };

  const filtered = purchaseOrders.filter(p => {
    const v = vendors.find(v => v.id === p.vendorId)?.name || '';
    return v.toLowerCase().includes(search.toLowerCase()) || (p.itemDescription||'').toLowerCase().includes(search.toLowerCase());
  });

  const statusColor = { Pending:'#b45309', Received:'#15803d', Cancelled:'#dc2626' };

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', paddingBottom:48 }}>
      <div className="apex-page-header">
        <div><h2 style={{ fontSize:22, fontWeight:800 }}>Purchase Orders</h2><p style={{ fontSize:12, color:'var(--text-muted)' }}>Add multiple paper specs per order</p></div>
      </div>
      {role === 'admin' && (
        <div className="apex-card" style={{ padding:20, marginBottom:20 }}>
          <h3 style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>Create Purchase Order</h3>
          <form onSubmit={handleAdd}>
            {/* PO Header */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:16 }}>
              {[['Vendor *','vendorId','vselect'],['Unit (Company)','companyId','cselect'],['Invoice No (Tally)','invoiceNo','text'],['Expected Date','expectedDate','date'],['Notes','notes','text']].map(([lbl,k,t]) => (
                <div key={k} style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase' }}>{lbl}</label>
                  {t === 'vselect' ? (
                    <select className="apex-select" value={header[k]} onChange={e => setHeader({...header,[k]:e.target.value})}>
                      <option value="">— Select Vendor —</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  ) : t === 'cselect' ? (
                    <select className="apex-select" value={header[k]} onChange={e => setHeader({...header,[k]:e.target.value})}>
                      <option value="">— Select Unit —</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  ) : (
                    <input type={t} className="apex-input" value={header[k]} onChange={e => setHeader({...header,[k]:e.target.value})} />
                  )}
                </div>
              ))}
            </div>

            {/* Line Items */}
            <div style={{ background:'var(--bg-secondary)', borderRadius:10, padding:14, marginBottom:12 }}>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 80px 1fr 1fr 1fr 36px', gap:8, marginBottom:8 }}>
                {['Paper Description','Qty','Unit','Rate/kg (₹)','GSM','BF',''].map(h => (
                  <div key={h} style={{ fontSize:10, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase' }}>{h}</div>
                ))}
              </div>
              {lines.map((ln, i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 80px 1fr 1fr 1fr 36px', gap:8, marginBottom:8 }}>
                  <input className="apex-input" placeholder="e.g. Kraft Liner 150 GSM" value={ln.itemDescription} onChange={e => setLine(i,'itemDescription',e.target.value)} style={{ fontSize:12 }} />
                  <input type="number" className="apex-input" placeholder="Qty" value={ln.qty} onChange={e => setLine(i,'qty',e.target.value)} style={{ fontSize:12 }} />
                  <select className="apex-select" value={ln.unit} onChange={e => setLine(i,'unit',e.target.value)} style={{ fontSize:12 }}>
                    <option value="kg">kg</option><option value="ton">ton</option><option value="reels">reels</option><option value="sheets">sheets</option>
                  </select>
                  <input type="number" className="apex-input" placeholder="₹" value={ln.ratePerKg} onChange={e => setLine(i,'ratePerKg',e.target.value)} style={{ fontSize:12 }} />
                  <input type="number" className="apex-input" placeholder="GSM" value={ln.gsm} onChange={e => setLine(i,'gsm',e.target.value)} style={{ fontSize:12 }} />
                  <input type="number" className="apex-input" placeholder="BF" value={ln.bf} onChange={e => setLine(i,'bf',e.target.value)} style={{ fontSize:12 }} />
                  <button type="button" onClick={() => removeLine(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--danger)', fontSize:18 }} disabled={lines.length===1}>×</button>
                </div>
              ))}
              <button type="button" className="apex-btn apex-btn-secondary" style={{ fontSize:12, padding:'5px 12px', marginTop:4 }} onClick={addLine}><Plus style={{width:12,height:12}}/> Add Line</button>
            </div>
            <button type="submit" className="apex-btn apex-btn-primary"><Plus style={{width:14,height:14}}/> Create PO</button>
          </form>
        </div>
      )}
      <div style={{ marginBottom:12 }}>
        <input className="apex-input" placeholder="Search vendor or item..." value={search} onChange={e=>setSearch(e.target.value)} style={{ maxWidth:320 }} />
      </div>
      <div className="apex-card" style={{ overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead><tr style={{ background:'var(--bg-secondary)', borderBottom:'1px solid var(--border)' }}>
            {['PO Date','Vendor','Invoice No','Unit','Lines / Items','Exp. Date','Status','Actions'].map(h => (
              <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {[...filtered].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)).map(po => {
              const lineItems = po.lineItems || [{ itemDescription: po.itemDescription, qty: po.qty, unit: po.unit||'kg', ratePerKg: po.ratePerKg, gsm: po.gsm||'', bf: po.bf||'' }];
              return (
                <tr key={po.id} style={{ borderBottom:'1px solid var(--border)', verticalAlign:'top' }}>
                  <td style={{ padding:'10px 14px' }}>{po.createdAt ? new Date(po.createdAt).toLocaleDateString('en-IN') : '-'}</td>
                  <td style={{ padding:'10px 14px', fontWeight:600 }}>{vendors.find(v=>v.id===po.vendorId)?.name||'-'}</td>
                  <td style={{ padding:'10px 14px', fontFamily:'monospace', color: po.invoiceNo ? 'var(--accent)' : 'var(--text-muted)', fontSize:12 }}>{po.invoiceNo||'—'}</td>
                  <td style={{ padding:'10px 14px' }}>{companies.find(c=>c.id===po.companyId)?.name||'-'}</td>
                  <td style={{ padding:'10px 14px' }}>
                    {lineItems.map((ln, i) => (
                      <div key={i} style={{ fontSize:12, marginBottom:3, paddingBottom:3, borderBottom: i < lineItems.length-1 ? '1px dashed var(--border)' : 'none' }}>
                        <span style={{ fontWeight:600 }}>{ln.itemDescription||'-'}</span>
                        <span style={{ color:'var(--text-muted)', marginLeft:8 }}>{ln.qty} {ln.unit||'kg'} {ln.ratePerKg ? `@ ₹${parseFloat(ln.ratePerKg).toFixed(2)}/kg` : ''} {ln.gsm ? `| ${ln.gsm} GSM` : ''} {ln.bf ? `| BF ${ln.bf}` : ''}</span>
                      </div>
                    ))}
                  </td>
                  <td style={{ padding:'10px 14px' }}>{po.expectedDate||'-'}</td>
                  <td style={{ padding:'10px 14px' }}>
                    <span style={{ fontSize:11, fontWeight:700, color: statusColor[po.status]||'#64748b', background: (statusColor[po.status]||'#64748b')+'18', padding:'3px 8px', borderRadius:12 }}>{po.status||'Pending'}</span>
                  </td>
                  <td style={{ padding:'10px 14px' }}>
                    {role === 'admin' && po.status === 'Pending' && (
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="apex-btn apex-btn-primary" style={{ padding:'4px 10px', fontSize:11 }} onClick={()=>handleStatus(po.id,'Received')}>Received</button>
                        <button className="apex-btn" style={{ padding:'4px 10px', fontSize:11, color:'var(--danger)', background:'var(--danger-bg)', border:'1px solid var(--danger-border)' }} onClick={()=>handleStatus(po.id,'Cancelled')}>Cancel</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={7} style={{ padding:32, textAlign:'center', color:'var(--text-muted)' }}>No purchase orders found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- REPORTS VIEW ---
function ReportsView({ inventory, orders, production, companies, customers = [], vendors, purchaseOrders, items, transactions = [] }) {
  const [tab, setTab] = useState('pl');
  const now = new Date();
  const [selMonth, setSelMonth] = useState(now.getMonth());
  const [selYear, setSelYear] = useState(now.getFullYear());
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const start = new Date(selYear, selMonth, 1);
  const end = new Date(selYear, parseInt(selMonth)+1, 0, 23, 59, 59);

  // P&L computations
  const reelLedger = {};
  inventory.forEach(r => { reelLedger[String(r.reelNo||'').trim().toLowerCase()] = parseFloat(r.ratePerKg||0); });

  let revenue = 0, cogs = 0, wastageVal = 0;
  orders.forEach(o => {
    (o.dispatchHistory||[]).forEach(h => {
      const d = new Date(h.date); if (d >= start && d <= end) revenue += parseFloat(h.qty||0) * parseFloat(o.rate||0);
    });
  });
  production.forEach(p => {
    const d = new Date(p.date); if (d < start || d > end) return;
    if (p.consumedReels) p.consumedReels.forEach(cr => { cogs += parseFloat(cr.weight||0) * (reelLedger[String(cr.reelNo||'').toLowerCase()]||0); });
    else cogs += parseFloat(p.useKg||0) * (reelLedger[(String(p.reelNos||'').split(',')[0]||'').trim().toLowerCase()]||0);
    wastageVal += parseFloat(p.wasteSheetsKg||0) * 5; // nominal wastage cost
  });
  const grossProfit = revenue - cogs;
  const net = grossProfit - wastageVal;

  // Debtors aging — per customer (receipts from transactions)
  const receipts = {};
  transactions.filter(t => t.type === 'receipt').forEach(t => { receipts[t.partyId] = (receipts[t.partyId]||0) + parseFloat(t.amount||0); });
  // Use customers if available, fall back to companies
  const debtorSource = customers.length > 0 ? customers : companies;
  const debtors = debtorSource.map(c => {
    let totalBilled = 0;
    const matchOrders = customers.length > 0
      ? orders.filter(o => o.customerId === c.id)
      : orders.filter(o => o.companyId === c.id);
    matchOrders.forEach(o => {
      (o.dispatchHistory||[]).forEach(h => { totalBilled += parseFloat(h.qty||0) * parseFloat(o.rate||0); });
    });
    const received = receipts[c.id]||0;
    const outstanding = totalBilled - received;
    return { name: c.name, totalBilled, received, outstanding };
  }).filter(d => d.totalBilled > 0);

  // Creditors aging
  const payments = {};
  transactions.filter(t => t.type === 'payment').forEach(t => { payments[t.partyId] = (payments[t.partyId]||0) + parseFloat(t.amount||0); });
  const creditors = vendors.map(v => {
    const totalPO = purchaseOrders.filter(p => p.vendorId === v.id && p.status === 'Received').reduce((a,p) => a + parseFloat(p.qty||0)*parseFloat(p.ratePerKg||0), 0);
    const paid = payments[v.id]||0;
    const outstanding = totalPO - paid;
    return { name: v.name, totalPO, paid, outstanding };
  }).filter(c => c.totalPO > 0);

  const PLRow = ({ label, val, bold, indent, color }) => (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 20px', borderBottom:'1px solid var(--border)', background: bold ? 'var(--bg-secondary)' : '#fff' }}>
      <span style={{ fontSize:13, fontWeight: bold ? 700 : 400, color: color||'var(--text-primary)', paddingLeft: indent ? 16 : 0 }}>{label}</span>
      <span style={{ fontSize:13, fontWeight: bold ? 700 : 500, color: color || (val < 0 ? 'var(--danger)' : 'var(--text-primary)') }}>₹{Math.abs(val).toLocaleString('en-IN',{maximumFractionDigits:0})}{val < 0 ? ' (Loss)' : ''}</span>
    </div>
  );

  const TabBtn = ({ id, label }) => (
    <button onClick={()=>setTab(id)} style={{ padding:'8px 18px', borderRadius:8, fontSize:13, fontWeight:600, border:'none', cursor:'pointer', background: tab===id ? 'var(--brand)' : 'transparent', color: tab===id ? '#fff' : 'var(--text-secondary)' }}>{label}</button>
  );

  return (
    <div style={{ maxWidth:1000, margin:'0 auto', paddingBottom:48 }}>
      <div className="apex-page-header">
        <div><h2 style={{ fontSize:22, fontWeight:800 }}>Reports</h2></div>
      </div>
      <div style={{ display:'flex', gap:8, marginBottom:20, background:'var(--bg-secondary)', padding:6, borderRadius:12, width:'fit-content' }}>
        <TabBtn id="pl" label="P&L Statement" />
        <TabBtn id="debtors" label="Debtors Aging" />
        <TabBtn id="creditors" label="Creditors Aging" />
      </div>

      {tab === 'pl' && (
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            <select className="apex-select" style={{ width:'auto' }} value={selMonth} onChange={e=>setSelMonth(e.target.value)}>
              {months.map((m,i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select className="apex-select" style={{ width:'auto' }} value={selYear} onChange={e=>setSelYear(e.target.value)}>
              {[2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="apex-card" style={{ overflow:'hidden' }}>
            <div style={{ padding:'12px 20px', background:'var(--brand)' }}><p style={{ color:'#fff', fontWeight:700, fontSize:14 }}>Profit & Loss — {months[selMonth]} {selYear}</p></div>
            <PLRow label="Revenue (Sales Dispatched)" val={revenue} bold />
            <PLRow label="Less: Raw Material (COGS)" val={-cogs} indent />
            <PLRow label="Less: Wastage Cost (est.)" val={-wastageVal} indent />
            <PLRow label="Gross Profit" val={grossProfit} bold color={grossProfit >= 0 ? '#15803d' : '#dc2626'} />
            <PLRow label="Net Profit / (Loss)" val={net} bold color={net >= 0 ? '#15803d' : '#dc2626'} />
          </div>
          {revenue === 0 && <p style={{ marginTop:12, fontSize:12, color:'var(--text-muted)' }}>No dispatch data found for this period.</p>}
        </div>
      )}

      {tab === 'debtors' && (
        <div className="apex-card" style={{ overflow:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead><tr style={{ background:'var(--bg-secondary)' }}>
              {['Company','Total Billed','Received','Outstanding'].map(h => <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {debtors.length === 0 && <tr><td colSpan={4} style={{ padding:32, textAlign:'center', color:'var(--text-muted)' }}>No debtor data. Add receipts in Payments & Receipts.</td></tr>}
              {debtors.map(d => (
                <tr key={d.name} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={{ padding:'10px 16px', fontWeight:600 }}>{d.name}</td>
                  <td style={{ padding:'10px 16px' }}>₹{d.totalBilled.toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                  <td style={{ padding:'10px 16px', color:'#15803d' }}>₹{d.received.toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                  <td style={{ padding:'10px 16px', fontWeight:700, color: d.outstanding > 0 ? '#dc2626' : '#15803d' }}>₹{d.outstanding.toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'creditors' && (
        <div className="apex-card" style={{ overflow:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead><tr style={{ background:'var(--bg-secondary)' }}>
              {['Vendor','Total PO Value','Paid','Outstanding'].map(h => <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {creditors.length === 0 && <tr><td colSpan={4} style={{ padding:32, textAlign:'center', color:'var(--text-muted)' }}>No creditor data. Add payments in Payments & Receipts.</td></tr>}
              {creditors.map(c => (
                <tr key={c.name} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={{ padding:'10px 16px', fontWeight:600 }}>{c.name}</td>
                  <td style={{ padding:'10px 16px' }}>₹{c.totalPO.toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                  <td style={{ padding:'10px 16px', color:'#15803d' }}>₹{c.paid.toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                  <td style={{ padding:'10px 16px', fontWeight:700, color: c.outstanding > 0 ? '#dc2626' : '#15803d' }}>₹{c.outstanding.toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- PAYMENTS & RECEIPTS VIEW ---
function PaymentsView({ transactions, companies, customers = [], vendors, getColRef, getDocRef, addLog }) {
  const blank = { type:'receipt', partyId:'', referenceNo:'', amount:'', date: new Date().toISOString().split('T')[0], notes:'' };
  const [form, setForm] = useState(blank);

  // Receipt party = customers (if exist) else companies; Payment party = vendors
  const receiptParties = customers.length > 0 ? customers : companies;

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.partyId || !form.amount) return;
    const partyName = form.type === 'receipt' ? (receiptParties.find(c=>c.id===form.partyId)?.name||'') : (vendors.find(v=>v.id===form.partyId)?.name||'');
    await addDoc(getColRef('transactions'), { ...form, amount: parseFloat(form.amount), partyName, createdAt: new Date().toISOString() });
    addLog(`${form.type === 'receipt' ? 'Receipt' : 'Payment'} of ₹${form.amount} — ${partyName}`);
    setForm(blank);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this entry?')) { await deleteDoc(getDocRef('transactions', id)); addLog('Deleted transaction'); }
  };

  const receipts = transactions.filter(t=>t.type==='receipt').reduce((a,t)=>a+parseFloat(t.amount||0),0);
  const payments = transactions.filter(t=>t.type==='payment').reduce((a,t)=>a+parseFloat(t.amount||0),0);

  return (
    <div style={{ maxWidth:900, margin:'0 auto', paddingBottom:48 }}>
      <div className="apex-page-header">
        <div><h2 style={{ fontSize:22, fontWeight:800 }}>Payments & Receipts</h2><p style={{ fontSize:12, color:'var(--text-muted)' }}>Cash & Bank ledger — customer receipts and vendor payments</p></div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:20 }}>
        <div className="apex-stat"><div className="apex-stat-label">Total Receipts (In)</div><div className="apex-stat-value" style={{ color:'#15803d' }}>₹{receipts.toLocaleString('en-IN',{maximumFractionDigits:0})}</div></div>
        <div className="apex-stat"><div className="apex-stat-label">Total Payments (Out)</div><div className="apex-stat-value" style={{ color:'#dc2626' }}>₹{payments.toLocaleString('en-IN',{maximumFractionDigits:0})}</div></div>
      </div>

      <div className="apex-card" style={{ padding:20, marginBottom:20 }}>
        <h3 style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>Add Entry</h3>
        <form onSubmit={handleAdd}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:12 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase' }}>Type *</label>
              <select className="apex-select" value={form.type} onChange={e=>setForm({...form,type:e.target.value,partyId:''})}>
                <option value="receipt">Receipt (Customer Pays)</option>
                <option value="payment">Payment (Vendor Paid)</option>
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase' }}>{form.type === 'receipt' ? 'Customer' : 'Vendor'} *</label>
              <select className="apex-select" value={form.partyId} onChange={e=>setForm({...form,partyId:e.target.value})}>
                <option value="">— Select —</option>
                {(form.type === 'receipt' ? receiptParties : vendors).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase' }}>Amount (₹) *</label>
              <input type="number" className="apex-input" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0.00" />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase' }}>Date</label>
              <input type="date" className="apex-input" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase' }}>Reference / Cheque No.</label>
              <input className="apex-input" value={form.referenceNo} onChange={e=>setForm({...form,referenceNo:e.target.value})} placeholder="CHQ-001" />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase' }}>Notes</label>
              <input className="apex-input" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Optional" />
            </div>
          </div>
          <button type="submit" className="apex-btn apex-btn-primary"><Plus style={{width:14,height:14}}/> Add Entry</button>
        </form>
      </div>

      <div className="apex-card" style={{ overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead><tr style={{ background:'var(--bg-secondary)' }}>
            {['Date','Type','Party','Amount','Reference','Notes',''].map(h=><th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {[...transactions].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)).map(t => (
              <tr key={t.id} style={{ borderBottom:'1px solid var(--border)' }}>
                <td style={{ padding:'10px 14px' }}>{t.date||'-'}</td>
                <td style={{ padding:'10px 14px' }}><span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:12, background: t.type==='receipt'?'#dcfce7':'#fee2e2', color: t.type==='receipt'?'#15803d':'#dc2626' }}>{t.type==='receipt'?'Receipt':'Payment'}</span></td>
                <td style={{ padding:'10px 14px', fontWeight:600 }}>{t.partyName||t.partyId}</td>
                <td style={{ padding:'10px 14px', fontWeight:700, color: t.type==='receipt'?'#15803d':'#dc2626' }}>₹{parseFloat(t.amount||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                <td style={{ padding:'10px 14px', color:'var(--text-muted)' }}>{t.referenceNo||'-'}</td>
                <td style={{ padding:'10px 14px', color:'var(--text-muted)' }}>{t.notes||'-'}</td>
                <td style={{ padding:'10px 14px' }}><button onClick={()=>handleDelete(t.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--danger)' }}><Trash2 style={{width:14,height:14}}/></button></td>
              </tr>
            ))}
            {transactions.length === 0 && <tr><td colSpan={7} style={{ padding:32, textAlign:'center', color:'var(--text-muted)' }}>No transactions yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- CUSTOMERS VIEW ---
function CustomersView({ customers, companies, addLog, getColRef, getDocRef }) {
  const blank = { name: '', unitId: '', gstin: '', billingAddress: '', state: '', phone: '', contactPerson: '' };
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState(null);
  const [filterUnit, setFilterUnit] = useState('');

  const startEdit = (c) => { setEditId(c.id); setForm({ name: c.name||'', unitId: c.unitId||'', gstin: c.gstin||'', billingAddress: c.billingAddress||'', state: c.state||'', phone: c.phone||'', contactPerson: c.contactPerson||'' }); };
  const cancel = () => { setEditId(null); setForm(blank); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const unit = companies.find(c => c.id === form.unitId);
    const payload = { ...form, unitName: unit?.name || '' };
    if (editId) { await updateDoc(getDocRef('customers', editId), payload); addLog(`Updated customer: ${form.name}`); cancel(); }
    else { await addDoc(getColRef('customers'), payload); addLog(`Added customer: ${form.name}`); setForm(blank); }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Delete customer ${name}?`)) { await deleteDoc(getDocRef('customers', id)); addLog(`Deleted customer: ${name}`); }
  };

  const filtered = filterUnit ? customers.filter(c => c.unitId === filterUnit) : customers;

  const F = ({ label, k, placeholder = '' }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</label>
      <input className="apex-input" placeholder={placeholder} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} />
    </div>
  );

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', paddingBottom: 48 }}>
      <div className="apex-page-header">
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>Customers</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>End clients who buy from your manufacturing units — kept separate from your own units</p>
        </div>
      </div>

      {/* Info banner */}
      <div className="apex-alert apex-alert-blue" style={{ marginBottom: 20, fontSize: 12 }}>
        <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} />
        <span><strong>How this works:</strong> Each customer is linked to one of <em>your manufacturing units</em>. When creating an order, select the unit that manufactures, then select the customer who will receive the goods. The Tax Invoice will show: <strong>From → [Unit]</strong> and <strong>Billed To → [Customer]</strong>.</span>
      </div>

      <div className="apex-card" style={{ padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>{editId ? 'Edit Customer' : 'Add New Customer'}</h3>
        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <F label="Customer Name *" k="name" placeholder="XYZ Pvt Ltd" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Manufacturing Unit (which unit sells to them) *</label>
              <select className="apex-select" value={form.unitId} onChange={e => setForm({ ...form, unitId: e.target.value })}>
                <option value="">— Select Unit —</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <F label="Contact Person" k="contactPerson" placeholder="Name" />
            <F label="Phone" k="phone" placeholder="+91 99999 00000" />
            <F label="GSTIN" k="gstin" placeholder="22AAAAA0000A1Z5" />
            <F label="State" k="state" placeholder="Maharashtra" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 4 }}>Billing Address</label>
            <textarea className="apex-input" rows={2} placeholder="Street, City, PIN" value={form.billingAddress} onChange={e => setForm({ ...form, billingAddress: e.target.value })} style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="apex-btn apex-btn-primary">{editId ? 'Save Changes' : <><Plus style={{ width: 15, height: 15 }} /> Add Customer</>}</button>
            {editId && <button type="button" className="apex-btn apex-btn-secondary" onClick={cancel}>Cancel</button>}
          </div>
        </form>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Filter by Unit:</span>
        <select className="apex-select" style={{ width: 'auto' }} value={filterUnit} onChange={e => setFilterUnit(e.target.value)}>
          <option value="">All Units</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} customer{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="apex-card" style={{ overflow: 'hidden' }}>
        {filtered.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No customers yet. Add your first customer above.</div>}
        {[...filtered].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(c => (
          <div key={c.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <p style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</p>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
                  {companies.find(u => u.id === c.unitId)?.name || 'No Unit'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {c.contactPerson && <span>👤 {c.contactPerson}</span>}
                {c.phone && <span>📞 {c.phone}</span>}
                {c.gstin && <span>GSTIN: {c.gstin}</span>}
                {c.state && <span>📍 {c.state}</span>}
                {c.billingAddress && <span>{c.billingAddress}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="apex-btn apex-btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => startEdit(c)}><Edit2 style={{ width: 13, height: 13 }} /> Edit</button>
              <button onClick={() => handleDelete(c.id, c.name)} className="apex-btn" style={{ padding: '6px 12px', fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)' }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TallySyncView({ inventory, production, orders, companies, customers = [], vendors = [], purchaseOrders = [], transactions = [], items = [], addLog, getColRef, getDocRef }) {
  const [activeSubTab, setActiveSubTab] = useState('import_sales_orders');
  const [xmlFileName, setXmlFileName] = useState('');

  // States for Step 1: Import Sales Orders
  const [parsedSalesOrders, setParsedSalesOrders] = useState([]);
  
  // States for Step 2: Import Purchase Orders
  const [parsedPurchaseOrders, setParsedPurchaseOrders] = useState([]);

  // States for Sync Box Items
  const [parsedBoxItems, setParsedBoxItems] = useState([]);

  // States for Step 3 & 4: Export to Tally
  const [exportType, setExportType] = useState('reels'); // 'reels' | 'production' | 'sales' | 'purchases'
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
  const [exportStartDate, setExportStartDate] = useState(firstDay);
  const [exportEndDate, setExportEndDate] = useState(lastDay);
  const [excludeSynced, setExcludeSynced] = useState(true);
  const [exportUnitId, setExportUnitId] = useState('');

  // States for Step 5: Import Sales Invoices & Link Dispatches
  const [parsedInvoices, setParsedInvoices] = useState([]);

  // Legacy States
  const [parsedLedgers, setParsedLedgers] = useState([]);
  const [parsedVouchers, setParsedVouchers] = useState([]);
  const [selectedUnitForDebtors, setSelectedUnitForDebtors] = useState({});
  const [bulkUnitId, setBulkUnitId] = useState('');

  // XML helper to retrieve text from tags case-insensitively
  const getTagText = (element, tagName) => {
    if (!element) return '';
    const node = element.getElementsByTagName(tagName)[0] || 
                 element.getElementsByTagName(tagName.toUpperCase())[0] ||
                 element.getElementsByTagName(tagName.toLowerCase())[0] ||
                 element.querySelector(tagName);
    return node ? node.textContent.trim() : '';
  };

  const parseTallyNum = (val) => {
    if (!val) return 0;
    const cleaned = val.replace(/[^\d.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  // --- STEP 1: IMPORT SALES ORDERS ---
  const handleSalesOrdersUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setXmlFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target.result;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        const vouchers = Array.from(xmlDoc.getElementsByTagName("VOUCHER"));
        const salesOrders = vouchers.filter(v => {
          const type = getTagText(v, "VOUCHERTYPENAME") || v.getAttribute("VCHTYPE") || '';
          return type.toLowerCase().includes("sales order");
        });

        if (salesOrders.length === 0) {
          alert("No <VOUCHER> tags with VOUCHERTYPENAME = 'Sales Order' found in the XML file.");
          return;
        }

        const parsed = [];
        salesOrders.forEach(v => {
          const voucherNo = getTagText(v, "VOUCHERNUMBER") || getTagText(v, "VCHNO") || '';
          const rawDate = getTagText(v, "DATE") || '';
          const partyName = getTagText(v, "PARTYLEDGERNAME") || '';

          let dateStr = '';
          if (rawDate.length === 8) {
            dateStr = `${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`;
          } else {
            dateStr = rawDate;
          }

          const inventoryEntries = Array.from(v.getElementsByTagName("ALLINVENTORYENTRIES.LIST"))
            .concat(Array.from(v.getElementsByTagName("INVENTORYENTRIES.LIST")));

          inventoryEntries.forEach((ie, idx) => {
            const stockItemName = getTagText(ie, "STOCKITEMNAME");
            const qty = Math.abs(parseTallyNum(getTagText(ie, "QTY") || getTagText(ie, "BILLEDQTY")));
            const rate = Math.abs(parseTallyNum(getTagText(ie, "RATE")));

            if (stockItemName && qty > 0) {
              const matchedCust = customers.find(c => c.name.toLowerCase().trim() === partyName.toLowerCase().trim());
              const matchedItem = items.find(i => 
                (i.name || '').toLowerCase().trim() === stockItemName.toLowerCase().trim() ||
                (i.Item_Name || '').toLowerCase().trim() === stockItemName.toLowerCase().trim()
              );

              parsed.push({
                id: `${voucherNo}-${idx}`,
                date: dateStr,
                partyName,
                orderNo: voucherNo,
                stockItem: stockItemName,
                qty,
                rate: rate || 0,
                selectedUnitId: matchedCust?.unitId || '',
                selectedCustomerId: matchedCust?.id || '',
                selectedItemId: matchedItem?.id || ''
              });
            }
          });
        });

        setParsedSalesOrders(parsed);
        addLog(`Parsed ${parsed.length} Sales Order lines from Tally XML`);
      } catch (err) {
        console.error(err);
        alert("Error parsing XML: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleSalesOrderFieldChange = (rowId, field, val) => {
    setParsedSalesOrders(prev => prev.map(item => {
      if (item.id === rowId) {
        const updated = { ...item, [field]: val };
        // If customer was updated, auto-assign their unit
        if (field === 'selectedCustomerId') {
          const cust = customers.find(c => c.id === val);
          if (cust?.unitId) updated.selectedUnitId = cust.unitId;
        }
        return updated;
      }
      return item;
    }));
  };

  const handleQuickCreateCustomer = async (tallyName, unitId, rowId) => {
    if (!unitId) return alert("Please select a Unit for this customer first.");
    try {
      const unit = companies.find(u => u.id === unitId);
      const payload = {
        name: tallyName.trim(),
        gstin: '',
        billingAddress: '',
        state: 'Maharashtra',
        unitId: unitId,
        unitName: unit?.name || ''
      };
      const docRef = await addDoc(getColRef('customers'), payload);
      alert(`Customer "${tallyName}" created in ERP!`);
      addLog(`Created customer on-the-fly: ${tallyName}`);
      
      // Update parsed state immediately
      setParsedSalesOrders(prev => prev.map(item => 
        item.partyName === tallyName ? { ...item, selectedCustomerId: docRef.id, selectedUnitId: unitId } : item
      ));
    } catch (err) {
      console.error(err);
      alert("Error creating customer: " + err.message);
    }
  };

  const handleQuickCreateItem = async (tallyItemName, unitId, rate, rowId) => {
    if (!unitId) return alert("Please select a Unit for this box item first.");
    try {
      const payload = {
        name: tallyItemName.trim(),
        companyId: unitId,
        rate: String(rate || 0),
        itemType: '3-Ply',
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(getColRef('items'), payload);
      alert(`Box Item "${tallyItemName}" created in ERP!`);
      addLog(`Created item on-the-fly: ${tallyItemName}`);

      setParsedSalesOrders(prev => prev.map(item => 
        item.stockItem === tallyItemName ? { ...item, selectedItemId: docRef.id } : item
      ));
    } catch (err) {
      console.error(err);
      alert("Error creating item: " + err.message);
    }
  };

  const executeSalesOrdersSync = async () => {
    for (const order of parsedSalesOrders) {
      if (!order.selectedUnitId || !order.selectedCustomerId || !order.selectedItemId) {
        alert("Please complete Unit, Customer, and Item mapping for all rows before syncing.");
        return;
      }
    }

    let successCount = 0;
    try {
      for (const order of parsedSalesOrders) {
        const item = items.find(i => i.id === order.selectedItemId);
        const customer = customers.find(c => c.id === order.selectedCustomerId);
        
        const payload = {
          orderDate: order.date,
          deliveryDate: new Date(new Date(order.date).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          companyId: order.selectedUnitId,
          customerId: order.selectedCustomerId,
          customerName: customer?.name || order.partyName,
          itemId: order.selectedItemId,
          itemName: item?.name || item?.Item_Name || order.stockItem,
          orderQty: String(order.qty),
          rate: String(order.rate),
          status: 'Pending',
          dispatchedQty: 0,
          openingFgQty: '0',
          tallySynced: true,
          orderNo: order.orderNo,
          createdAt: new Date().toISOString()
        };

        // PPC vs Corrugated Box layout setting
        const isPpc = item?.itemType === 'PPC' || item?.itemType === 'Partition' || item?.Item_Type === 'PPC';
        if (isPpc) {
          payload.pocketsWidth = item?.pocketsWidth || '';
          payload.pocketsLength = item?.pocketsLength || '';
          payload.longUpsLength = '1';
          payload.longUpsWidth = '1';
          payload.latUpsLength = '1';
          payload.latUpsWidth = '1';
          payload.commonPerSet = item?.pocketsWidth || '';
          payload.smallPerSet = item?.pocketsLength || '';
          payload.commonUps = 1;
          payload.smallUps = 1;
        } else {
          payload.upsLength = '1';
          payload.upsWidth = '1';
          payload.plannedUps = 1;
        }

        await addDoc(getColRef('orders'), payload);
        successCount++;
      }

      alert(`Sync Complete:\n- ${successCount} Sales Orders successfully imported into ERP.`);
      setParsedSalesOrders([]);
      setXmlFileName('');
      addLog(`Synced ${successCount} Sales Orders from Tally XML`);
    } catch (err) {
      console.error(err);
      alert("Error syncing orders: " + err.message);
    }
  };

  // --- STEP 2: IMPORT PURCHASE ORDERS ---
  const parsePaperSpecFromName = (itemName) => {
    const name = String(itemName);
    const gsmMatch = name.match(/(\d+)\s*gsm/i);
    const bfMatch = name.match(/(\d+)\s*bf/i);
    const sizeMatch = name.match(/(\d+(?:\.\d+)?)\s*(?:cm|inch|inches|mm|sz|size|")/i) || name.match(/\b(\d{2,3})\b/);
    const colourMatch = name.match(/(kraft|golden|duplex|white)/i);
    
    return {
      gsm: gsmMatch ? gsmMatch[1] : '',
      bf: bfMatch ? bfMatch[1] : '',
      size: sizeMatch ? sizeMatch[1] : '',
      colour: colourMatch ? colourMatch[1] : 'Kraft'
    };
  };

  const handlePurchaseOrdersUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setXmlFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target.result;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        const vouchers = Array.from(xmlDoc.getElementsByTagName("VOUCHER"));
        const purchaseOrdersXml = vouchers.filter(v => {
          const type = getTagText(v, "VOUCHERTYPENAME") || v.getAttribute("VCHTYPE") || '';
          return type.toLowerCase().includes("purchase order");
        });

        if (purchaseOrdersXml.length === 0) {
          alert("No <VOUCHER> tags with VOUCHERTYPENAME = 'Purchase Order' found in the XML file.");
          return;
        }

        const parsed = [];
        purchaseOrdersXml.forEach(v => {
          const voucherNo = getTagText(v, "VOUCHERNUMBER") || getTagText(v, "VCHNO") || '';
          const rawDate = getTagText(v, "DATE") || '';
          const partyName = getTagText(v, "PARTYLEDGERNAME") || '';

          let dateStr = '';
          if (rawDate.length === 8) {
            dateStr = `${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`;
          } else {
            dateStr = rawDate;
          }

          const inventoryEntries = Array.from(v.getElementsByTagName("ALLINVENTORYENTRIES.LIST"))
            .concat(Array.from(v.getElementsByTagName("INVENTORYENTRIES.LIST")));

          const lineItems = [];
          inventoryEntries.forEach(ie => {
            const stockItemName = getTagText(ie, "STOCKITEMNAME");
            const qty = Math.abs(parseTallyNum(getTagText(ie, "QTY") || getTagText(ie, "BILLEDQTY")));
            const rate = Math.abs(parseTallyNum(getTagText(ie, "RATE")));

            if (stockItemName && qty > 0) {
              const spec = parsePaperSpecFromName(stockItemName);
              lineItems.push({
                itemName: stockItemName,
                qty,
                rate,
                gsm: spec.gsm,
                bf: spec.bf,
                size: spec.size,
                colour: spec.colour
              });
            }
          });

          if (lineItems.length > 0) {
            const matchedVend = vendors.find(v => v.name.toLowerCase().trim() === partyName.toLowerCase().trim());
            parsed.push({
              id: voucherNo,
              date: dateStr,
              vendorName: partyName,
              poNo: voucherNo,
              lineItems,
              selectedUnitId: '',
              selectedVendorId: matchedVend?.id || ''
            });
          }
        });

        setParsedPurchaseOrders(parsed);
        addLog(`Parsed ${parsed.length} Purchase Orders from Tally XML`);
      } catch (err) {
        console.error(err);
        alert("Error parsing XML: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handlePurchaseOrderFieldChange = (poNo, field, val) => {
    setParsedPurchaseOrders(prev => prev.map(po => {
      if (po.poNo === poNo) {
        return { ...po, [field]: val };
      }
      return po;
    }));
  };

  const handleQuickCreateVendor = async (tallyName) => {
    try {
      const payload = {
        name: tallyName.trim(),
        gstin: '',
        address: '',
        email: '',
        phone: '',
        contact: ''
      };
      const docRef = await addDoc(getColRef('vendors'), payload);
      alert(`Vendor "${tallyName}" created in ERP!`);
      addLog(`Created vendor on-the-fly: ${tallyName}`);

      setParsedPurchaseOrders(prev => prev.map(po => 
        po.vendorName === tallyName ? { ...po, selectedVendorId: docRef.id } : po
      ));
    } catch (err) {
      console.error(err);
      alert("Error creating vendor: " + err.message);
    }
  };

  const executePurchaseOrdersSync = async () => {
    for (const po of parsedPurchaseOrders) {
      if (!po.selectedUnitId || !po.selectedVendorId) {
        alert("Please complete Unit and Vendor mapping for all POs before syncing.");
        return;
      }
    }

    let successCount = 0;
    try {
      for (const po of parsedPurchaseOrders) {
        const payload = {
          date: po.date,
          poNo: po.poNo,
          vendorId: po.selectedVendorId,
          companyId: po.selectedUnitId,
          invoiceNo: '',
          expectedDate: po.date,
          notes: 'Imported from Tally Purchase Order XML',
          lineItems: po.lineItems.map(l => ({
            itemDescription: l.itemName,
            qty: l.qty,
            ratePerKg: l.rate,
            gsm: l.gsm,
            bf: l.bf,
            size: l.size,
            colour: l.colour,
            unit: 'kg'
          })),
          status: 'Pending',
          createdAt: new Date().toISOString(),
          tallySynced: true
        };

        await addDoc(getColRef('purchaseOrders'), payload);
        successCount++;
      }

      alert(`Sync Complete:\n- ${successCount} Purchase Orders successfully imported into ERP.`);
      setParsedPurchaseOrders([]);
      setXmlFileName('');
      addLog(`Synced ${successCount} Purchase Orders from Tally XML`);
    } catch (err) {
      console.error(err);
      alert("Error syncing purchase orders: " + err.message);
    }
  };

  // --- STEP 3 & 4: EXPORT TO TALLY (REELS & PRODUCTION & LEGACY) ---
  const getReelsToExport = () => {
    const list = [];
    inventory.forEach(inv => {
      if (inv.category !== 'Paper') return;
      
      const d = new Date(inv.date);
      const start = new Date(exportStartDate);
      const end = new Date(exportEndDate);
      end.setHours(23, 59, 59);

      if (d >= start && d <= end) {
        if (excludeSynced && inv.tallySynced) return;
        if (exportUnitId && inv.companyId !== exportUnitId) return;

        const vend = vendors.find(v => v.id === inv.vendorId);
        const vendorName = vend?.name || 'Cash Vendor';
        const vendorState = vend?.state || 'Maharashtra';
        const unit = companies.find(u => u.id === inv.companyId);
        const unitState = unit?.state || 'Maharashtra';

        list.push({
          id: inv.id,
          date: inv.date,
          invoiceNo: inv.invoiceNo || `REEL-INV-${inv.reelNo || inv.id.substring(0, 6)}`,
          reelNo: inv.reelNo || '',
          vendorId: inv.vendorId || '',
          vendorName,
          vendorState,
          companyId: inv.companyId || '',
          unitState,
          millName: inv.millName || '',
          gsm: inv.gsm || '',
          bf: inv.bf || '',
          size: inv.size || '',
          colour: inv.colour || 'Kraft',
          qty: parseFloat(inv.receivedQty || 0),
          rate: parseFloat(inv.ratePerKg || 0),
          amount: parseFloat(inv.receivedQty || 0) * parseFloat(inv.ratePerKg || 0),
          tallySynced: !!inv.tallySynced
        });
      }
    });
    return list.sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  const getProductionToExport = () => {
    const list = [];
    production.forEach(p => {
      const d = new Date(p.date);
      const start = new Date(exportStartDate);
      const end = new Date(exportEndDate);
      end.setHours(23, 59, 59);

      if (d >= start && d <= end) {
        if (excludeSynced && p.tallySynced) return;
        if (exportUnitId && p.companyId !== exportUnitId) return;

        list.push(p);
      }
    });
    return list.sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  // Original export retrievers
  const getDispatchesToExport = () => {
    const list = [];
    orders.forEach(o => {
      const cust = customers.find(c => c.id === o.customerId) || companies.find(c => c.id === o.companyId);
      const custName = cust?.name || 'Cash Customer';
      const custState = cust?.state || 'Maharashtra';
      const unit = companies.find(u => u.id === o.companyId);
      const unitState = unit?.state || 'Maharashtra';

      (o.dispatchHistory || []).forEach((h, idx) => {
        const d = new Date(h.date);
        const start = new Date(exportStartDate);
        const end = new Date(exportEndDate);
        end.setHours(23, 59, 59);

        if (d >= start && d <= end) {
          if (excludeSynced && h.tallySynced) return;
          if (exportUnitId && o.companyId !== exportUnitId) return;

          list.push({
            order: o,
            dispatchIndex: idx,
            date: h.date,
            qty: h.qty,
            dcNo: h.dcNo || `DC-Legacy-${idx}`,
            rate: parseFloat(o.rate || 0),
            itemName: o.itemName || o.Item_Name || 'Corrugated Box',
            customerName: custName,
            customerState: custState,
            unitState: unitState,
            gstPercent: parseFloat(o.gstPercent || 18),
            tallySynced: !!h.tallySynced
          });
        }
      });
    });
    return list.sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  const getPOsToExport = () => {
    const list = [];
    purchaseOrders.forEach(po => {
      if (po.status !== 'Received') return;

      const d = new Date(po.receivedDate || po.date);
      const start = new Date(exportStartDate);
      const end = new Date(exportEndDate);
      end.setHours(23, 59, 59);

      if (d >= start && d <= end) {
        if (excludeSynced && po.tallySynced) return;
        if (exportUnitId && po.companyId !== exportUnitId) return;

        const vend = vendors.find(v => v.id === po.vendorId);
        const vendorName = vend?.name || 'Cash Vendor';
        const vendorState = vend?.state || 'Maharashtra';
        const unit = companies.find(u => u.id === po.companyId);
        const unitState = unit?.state || 'Maharashtra';

        const lines = po.lineItems || [{ qty: po.qty, ratePerKg: po.ratePerKg }];
        const basicVal = lines.reduce((s, l) => s + parseFloat(l.qty || 0) * parseFloat(l.ratePerKg || 0), 0);
        const gstPercent = parseFloat(po.gstPercent || 18);
        const gstVal = basicVal * (gstPercent / 100);

        list.push({
          po,
          date: po.receivedDate || po.date,
          poNo: po.poNo || 'PO-000',
          invoiceNo: po.invoiceNo || `PO-INV-${po.poNo}`,
          vendorName,
          vendorState,
          unitState,
          basicVal,
          gstPercent,
          gstVal,
          totalVal: basicVal + gstVal,
          tallySynced: !!po.tallySynced
        });
      }
    });
    return list.sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  const handleExportVouchers = () => {
    const startCompact = exportStartDate.replace(/-/g, '');
    const endCompact = exportEndDate.replace(/-/g, '');

    if (exportType === 'reels') {
      const reels = getReelsToExport();
      if (reels.length === 0) return alert("No unsynced reels found in range.");

      const groups = {};
      reels.forEach(r => {
        const key = `${r.invoiceNo}-${r.vendorName}-${r.date}-${r.companyId}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
      });

      let xmlString = `<?xml version="1.0"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
`;

      Object.keys(groups).forEach(key => {
        const group = groups[key];
        const first = group[0];
        const rawD = new Date(first.date);
        const yyyymmdd = `${rawD.getFullYear()}${String(rawD.getMonth() + 1).padStart(2, '0')}${String(rawD.getDate()).padStart(2, '0')}`;

        const basicAmt = group.reduce((sum, r) => sum + r.amount, 0);
        const isSameState = String(first.vendorState).toLowerCase().trim() === String(first.unitState).toLowerCase().trim();
        const gstAmt = basicAmt * 0.18;
        const cgst = isSameState ? gstAmt / 2 : 0;
        const sgst = isSameState ? gstAmt / 2 : 0;
        const igst = isSameState ? 0 : gstAmt;
        const totalAmt = basicAmt + gstAmt;

        xmlString += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Purchase" ACTION="Create" OBJTYPE="Voucher">
            <DATE>${yyyymmdd}</DATE>
            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${first.invoiceNo}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${first.vendorName}</PARTYLEDGERNAME>
            <EFFECTIVEDATE>${yyyymmdd}</EFFECTIVEDATE>
            
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${first.vendorName}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${totalAmt.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
`;

        group.forEach(r => {
          const itemStockName = `Kraft Paper Reel ${r.bf}BF ${r.gsm}GSM ${r.size}cm`;
          xmlString += `            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${itemStockName}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <RATE>${r.rate.toFixed(2)}/kg</RATE>
              <AMOUNT>-${r.amount.toFixed(2)}</AMOUNT>
              <ACTUALQTY>${r.qty.toFixed(2)} kg</ACTUALQTY>
              <BILLEDQTY>${r.qty.toFixed(2)} kg</BILLEDQTY>
              
              <ACCOUNTINGALLOCATIONS.LIST>
                <LEDGERNAME>Purchase Account</LEDGERNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                <AMOUNT>-${r.amount.toFixed(2)}</AMOUNT>
              </ACCOUNTINGALLOCATIONS.LIST>
            </ALLINVENTORYENTRIES.LIST>
`;
        });

        if (cgst > 0) {
          xmlString += `            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>CGST Input Ledger</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${cgst.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>SGST Input Ledger</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${sgst.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
`;
        }
        if (igst > 0) {
          xmlString += `            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>IGST Input Ledger</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${igst.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
`;
        }

        xmlString += `          </VOUCHER>
        </TALLYMESSAGE>
`;
      });

      xmlString += `      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

      downloadXML(xmlString, `Apex_Tally_PaperReels_${startCompact}_to_${endCompact}.xml`);
      addLog(`Exported ${reels.length} Paper Reels in ${Object.keys(groups).length} purchase invoices.`);

    } else if (exportType === 'production') {
      const prodLogs = getProductionToExport();
      if (prodLogs.length === 0) return alert("No unsynced production logs in range.");

      let xmlString = `<?xml version="1.0"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
`;

      prodLogs.forEach(p => {
        const rawD = new Date(p.date);
        const yyyymmdd = `${rawD.getFullYear()}${String(rawD.getMonth() + 1).padStart(2, '0')}${String(rawD.getDate()).padStart(2, '0')}`;
        const voucherNo = `PROD-${yyyymmdd}-${p.id.substring(0, 5).toUpperCase()}`;

        let totalConsumptionVal = 0;
        const consumptionLines = [];

        (p.consumedReels || []).forEach(cr => {
          const weight = parseFloat(cr.weight || 0);
          if (weight <= 0) return;

          const invReel = inventory.find(inv => 
            inv.category === 'Paper' && 
            (inv.reelNo || '').toLowerCase().trim() === (cr.reelNo || '').toLowerCase().trim()
          );
          const rate = invReel ? parseFloat(invReel.ratePerKg || 40) : 40;
          const amt = weight * rate;
          totalConsumptionVal += amt;

          const specName = invReel 
            ? `Kraft Paper Reel ${invReel.bf || '18'}BF ${invReel.gsm || '180'}GSM ${invReel.size || '80'}cm`
            : `Kraft Paper Reel`;

          consumptionLines.push({
            itemName: specName,
            qty: weight,
            rate,
            amount: amt
          });
        });

        if (consumptionLines.length === 0 && parseFloat(p.useKg || 0) > 0) {
          const weight = parseFloat(p.useKg || 0);
          const rate = 40;
          const amt = weight * rate;
          totalConsumptionVal += amt;
          consumptionLines.push({
            itemName: "Kraft Paper Reel",
            qty: weight,
            rate,
            amount: amt
          });
        }

        const producedQty = parseFloat(p.linerQty || 0);
        const producedItemName = p.usedForItem || "Finished Boxes";

        xmlString += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Stock Journal" ACTION="Create" OBJTYPE="Voucher">
            <DATE>${yyyymmdd}</DATE>
            <VOUCHERTYPENAME>Stock Journal</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${voucherNo}</VOUCHERNUMBER>
            <EFFECTIVEDATE>${yyyymmdd}</EFFECTIVEDATE>
`;

        consumptionLines.forEach(cl => {
          xmlString += `            <INVENTORYENTRIESOUT.LIST>
              <STOCKITEMNAME>${cl.itemName}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <RATE>${cl.rate.toFixed(2)}/kg</RATE>
              <AMOUNT>${cl.amount.toFixed(2)}</AMOUNT>
              <ACTUALQTY>-${cl.qty.toFixed(2)} kg</ACTUALQTY>
              <BILLEDQTY>-${cl.qty.toFixed(2)} kg</BILLEDQTY>
            </INVENTORYENTRIESOUT.LIST>
`;
        });

        if (producedQty > 0) {
          const producedRate = totalConsumptionVal / producedQty;
          xmlString += `            <INVENTORYENTRIESIN.LIST>
              <STOCKITEMNAME>${producedItemName}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <RATE>${producedRate.toFixed(2)}/Nos</RATE>
              <AMOUNT>-${totalConsumptionVal.toFixed(2)}</AMOUNT>
              <ACTUALQTY>${producedQty.toFixed(2)} Nos</ACTUALQTY>
              <BILLEDQTY>${producedQty.toFixed(2)} Nos</BILLEDQTY>
            </INVENTORYENTRIESIN.LIST>
`;
        }

        xmlString += `          </VOUCHER>
        </TALLYMESSAGE>
`;
      });

      xmlString += `      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

      downloadXML(xmlString, `Apex_Tally_StockJournals_${startCompact}_to_${endCompact}.xml`);
      addLog(`Exported ${prodLogs.length} Production logs as Stock Journals.`);

    } else if (exportType === 'sales') {
      const exports = getDispatchesToExport();
      if (exports.length === 0) return alert("No unsynced dispatches found in range.");

      let xmlString = `<?xml version="1.0"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
`;

      exports.forEach(e => {
        const rawD = new Date(e.date);
        const yyyymmdd = `${rawD.getFullYear()}${String(rawD.getMonth() + 1).padStart(2, '0')}${String(rawD.getDate()).padStart(2, '0')}`;
        const basicAmt = e.qty * e.rate;
        const gstAmt = basicAmt * (e.gstPercent / 100);
        const totalAmt = basicAmt + gstAmt;

        const isSameState = String(e.customerState).toLowerCase().trim() === String(e.unitState).toLowerCase().trim();
        const cgst = isSameState ? gstAmt / 2 : 0;
        const sgst = isSameState ? gstAmt / 2 : 0;
        const igst = isSameState ? 0 : gstAmt;

        xmlString += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJTYPE="Voucher">
            <DATE>${yyyymmdd}</DATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${e.dcNo}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${e.customerName}</PARTYLEDGERNAME>
            <EFFECTIVEDATE>${yyyymmdd}</EFFECTIVEDATE>
            <BASICBUYERADDRESS.LIST TYPE="String">
              <BASICBUYERADDRESS>${e.customerName}</BASICBUYERADDRESS>
            </BASICBUYERADDRESS.LIST>
            
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${e.customerName}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${totalAmt.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Sales Account</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${basicAmt.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
`;

        if (cgst > 0) {
          xmlString += `            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>CGST Output Ledger</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${cgst.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>SGST Output Ledger</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${sgst.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
`;
        }
        if (igst > 0) {
          xmlString += `            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>IGST Output Ledger</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${igst.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
`;
        }

        xmlString += `          </VOUCHER>
        </TALLYMESSAGE>
`;
      });

      xmlString += `      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

      downloadXML(xmlString, `Apex_Tally_Sales_${startCompact}_to_${endCompact}.xml`);
      addLog(`Exported ${exports.length} Sales Vouchers XML`);

    } else if (exportType === 'purchases') {
      const exports = getPOsToExport();
      if (exports.length === 0) return alert("No unsynced POs found in range.");

      let xmlString = `<?xml version="1.0"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
`;

      exports.forEach(e => {
        const rawD = new Date(e.date);
        const yyyymmdd = `${rawD.getFullYear()}${String(rawD.getMonth() + 1).padStart(2, '0')}${String(rawD.getDate()).padStart(2, '0')}`;
        
        const isSameState = String(e.vendorState).toLowerCase().trim() === String(e.unitState).toLowerCase().trim();
        const cgst = isSameState ? e.gstVal / 2 : 0;
        const sgst = isSameState ? e.gstVal / 2 : 0;
        const igst = isSameState ? 0 : e.gstVal;

        xmlString += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Purchase" ACTION="Create" OBJTYPE="Voucher">
            <DATE>${yyyymmdd}</DATE>
            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${e.invoiceNo}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${e.vendorName}</PARTYLEDGERNAME>
            <EFFECTIVEDATE>${yyyymmdd}</EFFECTIVEDATE>
            
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${e.vendorName}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${e.totalVal.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Purchase Account</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${e.basicVal.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
`;

        if (cgst > 0) {
          xmlString += `            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>CGST Input Ledger</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${cgst.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>SGST Input Ledger</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${sgst.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
`;
        }
        if (igst > 0) {
          xmlString += `            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>IGST Input Ledger</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${igst.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
`;
        }

        xmlString += `          </VOUCHER>
        </TALLYMESSAGE>
`;
      });

      xmlString += `      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

      downloadXML(xmlString, `Apex_Tally_Purchases_${startCompact}_to_${endCompact}.xml`);
      addLog(`Exported ${exports.length} Purchase Vouchers XML`);
    }
  };

  const handleMarkAsSynced = async () => {
    if (exportType === 'reels') {
      await handleMarkReelsSynced();
    } else if (exportType === 'production') {
      await handleMarkProductionSynced();
    } else if (exportType === 'sales') {
      const exports = getDispatchesToExport();
      if (exports.length === 0) return;

      if (!window.confirm(`Mark ${exports.length} dispatches as Synced in ERP?`)) return;

      try {
        const orderGroups = {};
        exports.forEach(e => {
          if (!orderGroups[e.order.id]) orderGroups[e.order.id] = [];
          orderGroups[e.order.id].push(e.dispatchIndex);
        });

        for (const orderId of Object.keys(orderGroups)) {
          const ord = orders.find(o => o.id === orderId);
          if (!ord || !ord.dispatchHistory) continue;

          const newHistory = [...ord.dispatchHistory];
          orderGroups[orderId].forEach(idx => {
            if (newHistory[idx]) {
              newHistory[idx] = { ...newHistory[idx], tallySynced: true };
            }
          });

          await updateDoc(getDocRef('orders', orderId), { dispatchHistory: newHistory });
        }
        alert("Marked dispatches as Synced successfully!");
        addLog(`Marked ${exports.length} dispatches as Tally-Synced`);
      } catch (err) {
        console.error(err);
        alert("Error marking as synced: " + err.message);
      }
    } else {
      const exports = getPOsToExport();
      if (exports.length === 0) return;

      if (!window.confirm(`Mark ${exports.length} received POs as Synced in ERP?`)) return;

      try {
        for (const e of exports) {
          await updateDoc(getDocRef('purchaseOrders', e.po.id), { tallySynced: true });
        }
        alert("Marked POs as Synced successfully!");
        addLog(`Marked ${exports.length} POs as Tally-Synced`);
      } catch (err) {
        console.error(err);
        alert("Error marking as synced: " + err.message);
      }
    }
  };

  const downloadXML = (text, filename) => {
    const element = document.createElement("a");
    const file = new Blob([text], {type: 'text/xml'});
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // --- STEP 5: IMPORT SALES INVOICES & LINK DISPATCHES ---
  const handleInvoicesUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setXmlFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target.result;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        const vouchers = Array.from(xmlDoc.getElementsByTagName("VOUCHER"));
        const invoices = vouchers.filter(v => {
          const type = getTagText(v, "VOUCHERTYPENAME") || v.getAttribute("VCHTYPE") || '';
          return type.toLowerCase() === "sales" || type.toLowerCase().includes("invoice");
        });

        if (invoices.length === 0) {
          alert("No <VOUCHER> tags with VOUCHERTYPENAME = 'Sales' found in the XML file.");
          return;
        }

        const parsed = [];
        invoices.forEach((v, vIdx) => {
          const invoiceNo = getTagText(v, "VOUCHERNUMBER") || getTagText(v, "VCHNO") || '';
          const rawDate = getTagText(v, "DATE") || '';
          const partyName = getTagText(v, "PARTYLEDGERNAME") || '';
          const narration = getTagText(v, "NARRATION") || '';
          
          let dateStr = '';
          if (rawDate.length === 8) {
            dateStr = `${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`;
          } else {
            dateStr = rawDate;
          }

          let amount = 0;
          const ledgerEntries = Array.from(v.getElementsByTagName("ALLLEDGERENTRIES.LIST"))
            .concat(Array.from(v.getElementsByTagName("LEDGERENTRIES.LIST")));
          const partyEntry = ledgerEntries.find(le => getTagText(le, "LEDGERNAME").toLowerCase() === partyName.toLowerCase());
          if (partyEntry) {
            amount = Math.abs(parseTallyNum(getTagText(partyEntry, "AMOUNT")));
          } else {
            let maxAmt = 0;
            ledgerEntries.forEach(le => {
              const amt = Math.abs(parseTallyNum(getTagText(le, "AMOUNT")));
              if (amt > maxAmt) maxAmt = amt;
            });
            amount = maxAmt;
          }

          // Search DC No
          let dcNo = getTagText(v, "REFERENCE") || '';
          const shipDocs = Array.from(v.getElementsByTagName("BASICSHIPDOCUMENTNO"))
            .concat(Array.from(v.getElementsByTagName("SHIPDOCUMENTNO")));
          if (shipDocs.length > 0 && shipDocs[0].textContent) {
            dcNo = shipDocs[0].textContent.trim();
          }

          if (!dcNo && narration) {
            const dcMatch = narration.match(/dc[-_ ]*(?:no)?[-_ ]*([a-zA-Z0-9\/\-]+)/i) || narration.match(/challan[-_ ]*(?:no)?[-_ ]*([a-zA-Z0-9\/\-]+)/i);
            if (dcMatch) dcNo = dcMatch[1] || dcMatch[0];
          }

          let matchedOrderId = '';
          let matchedHistoryIdx = -1;
          let matchedDcNo = '';

          if (dcNo) {
            for (const o of orders) {
              const hist = o.dispatchHistory || [];
              const idx = hist.findIndex(h => (h.dcNo || '').toLowerCase().trim() === dcNo.toLowerCase().trim());
              if (idx !== -1) {
                matchedOrderId = o.id;
                matchedHistoryIdx = idx;
                matchedDcNo = hist[idx].dcNo;
                break;
              }
            }
          }

          const matchedCust = customers.find(c => c.name.toLowerCase().trim() === partyName.toLowerCase().trim());

          parsed.push({
            id: `${invoiceNo}-${vIdx}`,
            invoiceNo,
            date: dateStr,
            partyName,
            amount,
            dcNo: dcNo || '',
            matchedDcNo,
            selectedCustomerId: matchedCust?.id || '',
            selectedOrderId: matchedOrderId,
            selectedDispatchIndex: matchedHistoryIdx
          });
        });

        setParsedInvoices(parsed);
        addLog(`Parsed ${parsed.length} Sales Invoices from Tally XML`);
      } catch (err) {
        console.error(err);
        alert("Error parsing XML: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const getUnsyncedDispatchesForCustomer = (custId) => {
    const list = [];
    orders.forEach(o => {
      if (o.customerId !== custId) return;
      (o.dispatchHistory || []).forEach((h, idx) => {
        if (!h.invoiceNo && !h.tallySynced) {
          list.push({
            orderId: o.id,
            dispatchIndex: idx,
            itemName: o.itemName || o.Item_Name,
            dcNo: h.dcNo || `DC-${idx}`,
            qty: h.qty,
            date: h.date
          });
        }
      });
    });
    return list;
  };

  const handleInvoiceDispatchSelect = (rowId, val) => {
    if (!val) {
      setParsedInvoices(prev => prev.map(inv => inv.id === rowId ? { ...inv, selectedOrderId: '', selectedDispatchIndex: -1 } : inv));
      return;
    }
    const [orderId, idxStr] = val.split('|');
    setParsedInvoices(prev => prev.map(inv => inv.id === rowId ? { ...inv, selectedOrderId: orderId, selectedDispatchIndex: parseInt(idxStr) } : inv));
  };

  const executeInvoicesSync = async () => {
    const toProcess = parsedInvoices.filter(inv => inv.selectedOrderId !== '' && inv.selectedDispatchIndex !== -1);
    if (toProcess.length === 0) {
      alert("No dispatches matched or selected to link. Please map at least one row.");
      return;
    }

    let successCount = 0;
    try {
      const orderUpdates = {};
      toProcess.forEach(inv => {
        if (!orderUpdates[inv.selectedOrderId]) orderUpdates[inv.selectedOrderId] = [];
        orderUpdates[inv.selectedOrderId].push({
          idx: inv.selectedDispatchIndex,
          invoiceNo: inv.invoiceNo
        });
      });

      for (const orderId of Object.keys(orderUpdates)) {
        const ord = orders.find(o => o.id === orderId);
        if (!ord || !ord.dispatchHistory) continue;

        const newHistory = [...ord.dispatchHistory];
        orderUpdates[orderId].forEach(up => {
          if (newHistory[up.idx]) {
            newHistory[up.idx] = { 
              ...newHistory[up.idx], 
              invoiceNo: up.invoiceNo, 
              tallySynced: true 
            };
          }
        });

        await updateDoc(getDocRef('orders', orderId), { dispatchHistory: newHistory });
        successCount += orderUpdates[orderId].length;
      }

      alert(`Sync Complete:\n- Linked ${successCount} Tally Invoices to ERP Box Dispatches.`);
      setParsedInvoices([]);
      setXmlFileName('');
      addLog(`Linked ${successCount} Tally Invoices to ERP Dispatches.`);
    } catch (err) {
      console.error(err);
      alert("Error linking invoices: " + err.message);
    }
  };

  // --- SYNC BOX ITEMS FROM TALLY ---
  const handleBoxItemsUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setXmlFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target.result;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        let stockItems = [];
        try {
          const allElements = Array.from(xmlDoc.querySelectorAll("*"));
          stockItems = allElements.filter(el => {
            const tag = el.tagName.toLowerCase();
            return tag === "stockitem" || tag === "stockitem.list" || tag.endsWith(":stockitem") || tag.endsWith(":stockitem.list");
          });
        } catch (e) {
          stockItems = Array.from(xmlDoc.getElementsByTagName("STOCKITEM"))
            .concat(Array.from(xmlDoc.getElementsByTagName("STOCKITEM.LIST")))
            .concat(Array.from(xmlDoc.getElementsByTagName("stockitem")))
            .concat(Array.from(xmlDoc.getElementsByTagName("StockItem")));
        }

        if (stockItems.length === 0) {
          const sampleTags = Array.from(xmlDoc.querySelectorAll("*")).slice(0, 15).map(el => el.tagName).join(", ");
          alert(`No <STOCKITEM> or <STOCKITEM.LIST> tags found in the XML file.\n\nTags found in this file: ${sampleTags || 'None'}\n\nPlease make sure you exported the 'List of Accounts' or 'Stock Items' from TallyPrime.`);
          return;
        }

        const parsed = [];
        stockItems.forEach((si, idx) => {
          const name = si.getAttribute("NAME") || getTagText(si, "NAME") || getTagText(si, "LANGUAGENAME") || '';
          if (!name) return;

          const parent = getTagText(si, "PARENT") || '';
          
          // Parse specifications from the item name:
          // Size e.g. 250x200x150, 300 x 200 x 100, etc.
          const sizeMatch = name.match(/(\d+)\s*[xX*]\s*(\d+)\s*[xX*]\s*(\d+)/);
          const size = sizeMatch ? `${sizeMatch[1]}x${sizeMatch[2]}x${sizeMatch[3]}` : '';

          // Ply e.g. 3 Ply, 3Ply, 5-ply, 3-ply
          const plyMatch = name.match(/(\d+)\s*-?\s*ply/i);
          const ply = plyMatch ? plyMatch[1] : '3'; // default to 3-ply

          // GSM e.g. 180GSM, 150 GSM, 180gsm
          const gsmMatch = name.match(/(\d{3})\s*gsm/i) || name.match(/(\d{3})\s*g\b/i);
          const paperGsm = gsmMatch ? gsmMatch[1] : '';

          // BF e.g. 18BF, 20 BF, 18bf
          const bfMatch = name.match(/(\d{2})\s*bf/i);
          const paperBf = bfMatch ? bfMatch[1] : '';

          // Colour e.g. Golden, White, defaults to Kraft
          let paperColour = 'Kraft';
          if (name.toLowerCase().includes('golden')) paperColour = 'Golden';
          else if (name.toLowerCase().includes('white')) paperColour = 'White';

          const rateVal = parseTallyNum(getTagText(si, "OPENINGRATE"));

          parsed.push({
            id: `tally-item-${idx}-${Date.now()}`,
            name,
            parent,
            size,
            ply,
            paperGsm,
            paperBf,
            paperColour,
            rate: rateVal || 0,
            itemType: 'Box',
            selectedUnitId: ''
          });
        });

        setParsedBoxItems(parsed);
        addLog(`Parsed ${parsed.length} Stock Items from Tally XML`);
      } catch (err) {
        console.error(err);
        alert("Error parsing XML: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleBoxItemFieldChange = (id, field, value) => {
    setParsedBoxItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleBoxItemBulkUnitAssign = (unitId) => {
    setParsedBoxItems(prev => prev.map(item => ({ ...item, selectedUnitId: unitId })));
  };

  const handleBoxItemBulkTypeAssign = (itemType) => {
    setParsedBoxItems(prev => prev.map(item => ({ ...item, itemType })));
  };

  const executeBoxItemsSync = async () => {
    const invalidItem = parsedBoxItems.find(item => !item.selectedUnitId);
    if (invalidItem) {
      alert(`Please assign a Manufacturing Unit to all items. Check item: "${invalidItem.name}"`);
      return;
    }

    let createCount = 0;
    let updateCount = 0;

    try {
      for (const item of parsedBoxItems) {
        const existing = items.find(i => 
          (i.name || i.Item_Name || '').toLowerCase().trim() === item.name.toLowerCase().trim() && 
          i.companyId === item.selectedUnitId
        );

        const payload = {
          name: item.name.trim(),
          companyId: item.selectedUnitId,
          itemType: item.itemType || 'Box',
          size: item.size || '',
          ply: item.ply || '',
          paperGsm: item.paperGsm || '',
          paperBf: item.paperBf || '',
          paperColour: item.paperColour || 'Kraft',
          rate: String(item.rate || 0),
          createdAt: new Date().toISOString()
        };

        if (existing) {
          await updateDoc(getDocRef('items', existing.id), payload);
          updateCount++;
        } else {
          await addDoc(getColRef('items'), payload);
          createCount++;
        }
      }

      alert(`Sync Complete:\n- Created ${createCount} new box specifications\n- Updated ${updateCount} existing box specifications`);
      setParsedBoxItems([]);
      setXmlFileName('');
      addLog(`Synced Tally Stock Items: ${createCount} created, ${updateCount} updated`);
    } catch (err) {
      console.error(err);
      alert("Error syncing Tally stock items: " + err.message);
    }
  };

  // --- LEGACY ACTIONS (SYNC MASTERS & TRANSACTIONS) ---
  const handleMastersUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setXmlFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target.result;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        const ledgers = Array.from(xmlDoc.getElementsByTagName("LEDGER"));
        if (ledgers.length === 0) {
          alert("No <LEDGER> tags found in XML.");
          return;
        }

        const parsed = ledgers.map(l => {
          const name = l.getAttribute("NAME") || getTagText(l, "NAME") || getTagText(l, "LANGUAGENAME");
          const parent = getTagText(l, "PARENT");
          const gstin = getTagText(l, "PARTYGSTIN") || getTagText(l, "GSTIN");
          const state = getTagText(l, "LEDGERSTATE") || getTagText(l, "STATE");
          
          const addresses = Array.from(l.getElementsByTagName("ADDRESS"));
          const billingAddress = addresses.map(a => a.textContent.trim()).join(", ") || getTagText(l, "ADDRESS");

          let type = '';
          if (parent.toLowerCase().includes('debtor') || parent.toLowerCase().includes('customer')) type = 'customer';
          else if (parent.toLowerCase().includes('creditor') || parent.toLowerCase().includes('vendor')) type = 'vendor';

          return { name, parent, gstin, state, billingAddress, type };
        }).filter(item => item.type !== '');

        setParsedLedgers(parsed);
        addLog(`Parsed ${parsed.length} ledgers from Tally XML`);
      } catch (err) {
        console.error(err);
        alert("Error parsing XML: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleBulkUnitAssign = (unitId) => {
    setBulkUnitId(unitId);
    const updated = {};
    parsedLedgers.forEach((l, idx) => {
      if (l.type === 'customer') {
        updated[idx] = unitId;
      }
    });
    setSelectedUnitForDebtors(updated);
  };

  const handleUnitSelect = (idx, unitId) => {
    setSelectedUnitForDebtors(prev => ({ ...prev, [idx]: unitId }));
  };

  const executeMastersSync = async () => {
    let customerCount = 0;
    let vendorCount = 0;
    let skippedCount = 0;

    try {
      for (let i = 0; i < parsedLedgers.length; i++) {
        const item = parsedLedgers[i];
        if (item.type === 'customer') {
          const existing = customers.find(c => c.name.trim().toLowerCase() === item.name.trim().toLowerCase());
          const targetUnitId = selectedUnitForDebtors[i];
          
          if (!targetUnitId && !existing) {
            skippedCount++;
            continue;
          }

          const unit = companies.find(u => u.id === (targetUnitId || existing?.unitId));
          const payload = {
            name: item.name,
            gstin: item.gstin || existing?.gstin || '',
            billingAddress: item.billingAddress || existing?.billingAddress || '',
            state: item.state || existing?.state || '',
            unitId: targetUnitId || existing?.unitId || '',
            unitName: unit?.name || existing?.unitName || ''
          };

          if (existing) {
            await updateDoc(getDocRef('customers', existing.id), payload);
          } else {
            await addDoc(getColRef('customers'), payload);
          }
          customerCount++;
        } else if (item.type === 'vendor') {
          const existing = vendors.find(v => v.name.trim().toLowerCase() === item.name.trim().toLowerCase());
          const payload = {
            name: item.name,
            gstin: item.gstin || existing?.gstin || '',
            address: item.billingAddress || existing?.address || '',
            email: existing?.email || '',
            phone: existing?.phone || '',
            contact: existing?.contact || ''
          };

          if (existing) {
            await updateDoc(getDocRef('vendors', existing.id), payload);
          } else {
            await addDoc(getColRef('vendors'), payload);
          }
          vendorCount++;
        }
      }

      alert(`Sync Complete:\n- ${customerCount} Customer ledgers synced\n- ${vendorCount} Vendor ledgers synced\n- ${skippedCount} new customers skipped (missing unit mapping)`);
      setParsedLedgers([]);
      setXmlFileName('');
      addLog(`Synced Tally Masters: ${customerCount} customers, ${vendorCount} vendors`);
    } catch (err) {
      console.error(err);
      alert("Error syncing masters: " + err.message);
    }
  };

  const handleVouchersUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setXmlFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target.result;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        const vouchers = Array.from(xmlDoc.getElementsByTagName("VOUCHER"));
        if (vouchers.length === 0) {
          alert("No <VOUCHER> tags found in XML.");
          return;
        }

        const parsed = vouchers.map(v => {
          const typeName = getTagText(v, "VOUCHERTYPENAME") || v.getAttribute("VCHTYPE") || '';
          const voucherNo = getTagText(v, "VOUCHERNUMBER") || getTagText(v, "VCHNO") || '';
          const rawDate = getTagText(v, "DATE") || '';
          const partyName = getTagText(v, "PARTYLEDGERNAME") || '';

          let dateStr = '';
          if (rawDate.length === 8) {
            dateStr = `${rawDate.substring(0,4)}-${rawDate.substring(4,6)}-${rawDate.substring(6,8)}`;
          } else {
            dateStr = rawDate;
          }

          let amount = 0;
          const ledgerEntries = Array.from(v.getElementsByTagName("ALLLEDGERENTRIES.LIST"))
            .concat(Array.from(v.getElementsByTagName("LEDGERENTRIES.LIST")));

          if (ledgerEntries.length > 0) {
            const partyEntry = ledgerEntries.find(le => {
              const leName = getTagText(le, "LEDGERNAME");
              return leName.toLowerCase() === partyName.toLowerCase();
            });

            if (partyEntry) {
              amount = Math.abs(parseFloat(getTagText(partyEntry, "AMOUNT") || 0));
            } else {
              let maxAmt = 0;
              ledgerEntries.forEach(le => {
                const amt = Math.abs(parseFloat(getTagText(le, "AMOUNT") || 0));
                if (amt > maxAmt) maxAmt = amt;
              });
              amount = maxAmt;
            }
          }

          let type = '';
          if (typeName.toLowerCase().includes('receipt')) type = 'receipt';
          else if (typeName.toLowerCase().includes('payment')) type = 'payment';

          return { voucherNo, date: dateStr, partyName, amount, type, typeName };
        }).filter(v => v.type !== '' && v.amount > 0 && v.partyName !== '');

        setParsedVouchers(parsed);
        addLog(`Parsed ${parsed.length} Daybook vouchers from Tally XML`);
      } catch (err) {
        console.error(err);
        alert("Error parsing XML: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const executeVouchersSync = async () => {
    let addedCount = 0;
    let skippedCount = 0;

    try {
      for (const v of parsedVouchers) {
        const dup = transactions.find(t => t.referenceNo === v.voucherNo && t.type === v.type);
        if (dup) {
          skippedCount++;
          continue;
        }

        let partyId = '';
        if (v.type === 'receipt') {
          const cust = customers.find(c => c.name.toLowerCase().trim() === v.partyName.toLowerCase().trim());
          partyId = cust?.id || '';
        } else {
          const vend = vendors.find(vend => vend.name.toLowerCase().trim() === v.partyName.toLowerCase().trim());
          partyId = vend?.id || '';
        }

        if (!partyId) {
          skippedCount++;
          continue;
        }

        const payload = {
          type: v.type,
          partyId: partyId,
          partyName: v.partyName,
          amount: v.amount,
          date: v.date,
          referenceNo: v.voucherNo,
          notes: `Imported from Tally XML (${v.typeName})`,
          createdAt: new Date().toISOString()
        };

        await addDoc(getColRef('transactions'), payload);
        addedCount++;
      }

      alert(`Sync Complete:\n- ${addedCount} transactions imported\n- ${skippedCount} skipped`);
      setParsedVouchers([]);
      setXmlFileName('');
      addLog(`Synced Tally Transactions: ${addedCount} added, ${skippedCount} skipped`);
    } catch (err) {
      console.error(err);
      alert("Error syncing vouchers: " + err.message);
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 48 }}>
      {/* Header */}
      <div className="apex-page-header">
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>TallyPrime Integration Center</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Configure real-time bidirectional syncing, import orders/invoices, and export reels/production logs</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-stone-200 mb-6 pb-2">
        {[
          { id: 'import_sales_orders', label: '1. Import Sales Orders', icon: <ShoppingCart style={{ width: 14, height: 14 }} /> },
          { id: 'import_purchase_orders', label: '2. Import Purchase Orders', icon: <ClipboardList style={{ width: 14, height: 14 }} /> },
          { id: 'export_vouchers', label: '3 & 4. Export to Tally', icon: <ArrowLeftRight style={{ width: 14, height: 14 }} /> },
          { id: 'import_invoices', label: '5. Link Sales Invoices', icon: <FileText style={{ width: 14, height: 14 }} /> },
          { id: 'import_box_items', label: 'Sync Box Items', icon: <Box style={{ width: 14, height: 14 }} /> },
          { id: 'import_masters', label: 'Sync Masters', icon: <Users style={{ width: 14, height: 14 }} /> },
          { id: 'import_vouchers', label: 'Sync Cash/Bank', icon: <IndianRupee style={{ width: 14, height: 14 }} /> }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => { setActiveSubTab(t.id); setParsedSalesOrders([]); setParsedPurchaseOrders([]); setParsedBoxItems([]); setParsedInvoices([]); setParsedLedgers([]); setParsedVouchers([]); setXmlFileName(''); }}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 font-bold text-xs transition-all ${activeSubTab === t.id ? 'border-stone-900 text-stone-900 bg-stone-100 rounded-t-lg' : 'border-transparent text-stone-500 hover:text-stone-700'}`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* STEP 1: IMPORT SALES ORDERS */}
      {activeSubTab === 'import_sales_orders' && (
        <div className="flex flex-col gap-6">
          <div className="apex-card p-6 bg-white border border-stone-200 rounded-xl shadow-sm">
            <h3 className="text-sm font-bold text-stone-900 mb-2">Import Tally Sales Orders</h3>
            <p className="text-xs text-stone-500 mb-4">
              Export your pending **Sales Orders** from Tally in **XML format** and upload below to insert them as pending ERP production orders.
            </p>
            <div className="relative border-2 border-dashed border-stone-300 rounded-xl p-8 text-center bg-stone-50 hover:bg-stone-100 transition-colors">
              <input type="file" accept=".xml" onChange={handleSalesOrdersUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <Upload className="w-8 h-8 text-stone-500 mx-auto mb-2" />
              <p className="text-xs font-semibold text-stone-700">{xmlFileName || 'Drag and drop or click to upload Tally XML'}</p>
            </div>
          </div>

          {parsedSalesOrders.length > 0 && (
            <div className="apex-card p-6 bg-white border border-stone-200 rounded-xl shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-sm font-bold text-stone-900">Map & Review Sales Orders</h3>
                  <p className="text-xs text-stone-500 mt-1">Assign each Tally Sales Order to a manufacturing unit, map to an existing customer, and match the box item.</p>
                </div>
                <button onClick={executeSalesOrdersSync} className="flex items-center gap-2 bg-stone-900 hover:bg-stone-850 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-sm">
                  <CheckCircle2 className="w-4 h-4" /> Import {parsedSalesOrders.length} Orders to ERP
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold">
                      <th className="p-3">Order No / Date</th>
                      <th className="p-3">Tally Party</th>
                      <th className="p-3">Tally Stock Item</th>
                      <th className="p-3 text-right">Qty</th>
                      <th className="p-3 text-right">Rate</th>
                      <th className="p-3">ERP Unit</th>
                      <th className="p-3">ERP Customer Link</th>
                      <th className="p-3">ERP Box Item Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedSalesOrders.map((o) => {
                      const clientList = o.selectedUnitId ? customers.filter(c => c.unitId === o.selectedUnitId) : customers;
                      const boxList = o.selectedUnitId ? items.filter(i => i.companyId === o.selectedUnitId) : items;

                      return (
                        <tr key={o.id} className="border-b border-stone-200 hover:bg-stone-50/80">
                          <td className="p-3">
                            <span className="font-semibold text-stone-900 block">{o.orderNo}</span>
                            <span className="text-[10px] text-stone-400">{o.date}</span>
                          </td>
                          <td className="p-3 font-medium text-stone-700">{o.partyName}</td>
                          <td className="p-3 text-stone-600">{o.stockItem}</td>
                          <td className="p-3 text-right font-semibold text-stone-950">{o.qty.toLocaleString()}</td>
                          <td className="p-3 text-right font-medium text-stone-600">₹{o.rate.toFixed(2)}</td>
                          <td className="p-3">
                            <select
                              className="p-1 border border-stone-300 rounded text-stone-700 bg-white"
                              value={o.selectedUnitId}
                              onChange={e => handleSalesOrderFieldChange(o.id, 'selectedUnitId', e.target.value)}
                            >
                              <option value="">— Select Unit —</option>
                              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <select
                                className="p-1 border border-stone-300 rounded text-stone-700 bg-white max-w-[150px]"
                                value={o.selectedCustomerId}
                                onChange={e => handleSalesOrderFieldChange(o.id, 'selectedCustomerId', e.target.value)}
                              >
                                <option value="">— Match Customer —</option>
                                {clientList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                              {!o.selectedCustomerId && (
                                <button
                                  onClick={() => handleQuickCreateCustomer(o.partyName, o.selectedUnitId, o.id)}
                                  className="p-1 text-green-700 hover:text-green-900 bg-green-50 hover:bg-green-100 rounded text-[10px] font-bold border border-green-200"
                                  title="Add Customer directly to ERP"
                                >
                                  + Create
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <select
                                className="p-1 border border-stone-300 rounded text-stone-700 bg-white max-w-[150px]"
                                value={o.selectedItemId}
                                onChange={e => handleSalesOrderFieldChange(o.id, 'selectedItemId', e.target.value)}
                              >
                                <option value="">— Match Box —</option>
                                {boxList.map(i => <option key={i.id} value={i.id}>{i.name || i.Item_Name}</option>)}
                              </select>
                              {!o.selectedItemId && (
                                <button
                                  onClick={() => handleQuickCreateItem(o.stockItem, o.selectedUnitId, o.rate, o.id)}
                                  className="p-1 text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 rounded text-[10px] font-bold border border-blue-200"
                                  title="Add Box Item directly to ERP"
                                >
                                  + Create
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: IMPORT PURCHASE ORDERS */}
      {activeSubTab === 'import_purchase_orders' && (
        <div className="flex flex-col gap-6">
          <div className="apex-card p-6 bg-white border border-stone-200 rounded-xl shadow-sm">
            <h3 className="text-sm font-bold text-stone-900 mb-2">Import Tally Purchase Orders</h3>
            <p className="text-xs text-stone-500 mb-4">
              Upload Tally **Purchase Orders XML** to import raw material purchase requirements. Apex ERP will automatically parse paper specs like GSM, BF, and size from the Tally item name.
            </p>
            <div className="relative border-2 border-dashed border-stone-300 rounded-xl p-8 text-center bg-stone-50 hover:bg-stone-100 transition-colors">
              <input type="file" accept=".xml" onChange={handlePurchaseOrdersUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <Upload className="w-8 h-8 text-stone-500 mx-auto mb-2" />
              <p className="text-xs font-semibold text-stone-700">{xmlFileName || 'Drag and drop or click to upload Tally XML'}</p>
            </div>
          </div>

          {parsedPurchaseOrders.length > 0 && (
            <div className="apex-card p-6 bg-white border border-stone-200 rounded-xl shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-sm font-bold text-stone-900">Map & Review Purchase Orders</h3>
                  <p className="text-xs text-stone-500 mt-1">Review extracted paper specifications and assign them to an ERP Unit and Vendor.</p>
                </div>
                <button onClick={executePurchaseOrdersSync} className="flex items-center gap-2 bg-stone-900 hover:bg-stone-850 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-sm">
                  <CheckCircle2 className="w-4 h-4" /> Import {parsedPurchaseOrders.length} POs to ERP
                </button>
              </div>

              <div className="flex flex-col gap-6">
                {parsedPurchaseOrders.map((po, idx) => (
                  <div key={po.poNo} className="border border-stone-200 rounded-lg p-4 bg-stone-50/50">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 items-center">
                      <div>
                        <span className="text-stone-500 block text-[10px] font-bold uppercase">PO Reference</span>
                        <span className="font-semibold text-stone-900">{po.poNo}</span>
                        <span className="text-stone-400 block text-[11px]">{po.date}</span>
                      </div>
                      <div>
                        <span className="text-stone-500 block text-[10px] font-bold uppercase">Tally Vendor</span>
                        <span className="font-medium text-stone-800">{po.vendorName}</span>
                      </div>
                      <div>
                        <span className="text-stone-500 block text-[10px] font-bold uppercase">Map to ERP Unit</span>
                        <select
                          className="p-1.5 border border-stone-300 rounded text-xs bg-white w-full mt-1"
                          value={po.selectedUnitId}
                          onChange={e => handlePurchaseOrderFieldChange(po.poNo, 'selectedUnitId', e.target.value)}
                        >
                          <option value="">— Select Unit —</option>
                          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <span className="text-stone-500 block text-[10px] font-bold uppercase">Map to ERP Vendor</span>
                        <div className="flex items-center gap-2 mt-1">
                          <select
                            className="p-1.5 border border-stone-300 rounded text-xs bg-white w-full"
                            value={po.selectedVendorId}
                            onChange={e => handlePurchaseOrderFieldChange(po.poNo, 'selectedVendorId', e.target.value)}
                          >
                            <option value="">— Select Vendor —</option>
                            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </select>
                          {!po.selectedVendorId && (
                            <button
                              onClick={() => handleQuickCreateVendor(po.vendorName)}
                              className="px-2 py-1 text-green-700 hover:text-green-900 bg-green-50 hover:bg-green-100 rounded text-[10px] font-bold border border-green-200"
                              title="Add Vendor directly to ERP"
                            >
                              + Create
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <table className="w-full text-left text-xs bg-white rounded border border-stone-200">
                      <thead>
                        <tr className="bg-stone-100 text-stone-500 font-bold border-b border-stone-200">
                          <th className="p-2 pl-4">Extracted Item Spec</th>
                          <th className="p-2">Parsed GSM</th>
                          <th className="p-2">Parsed BF</th>
                          <th className="p-2">Parsed Size</th>
                          <th className="p-2">Colour</th>
                          <th className="p-2 text-right">Qty (kg)</th>
                          <th className="p-2 text-right pr-4">Rate/kg</th>
                        </tr>
                      </thead>
                      <tbody>
                        {po.lineItems.map((line, lIdx) => (
                          <tr key={lIdx} className="border-b border-stone-200">
                            <td className="p-2 pl-4 font-semibold text-stone-700">{line.itemName}</td>
                            <td className="p-2"><span className="bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded font-mono text-[10.5px] border border-orange-200">{line.gsm || 'N/A'} GSM</span></td>
                            <td className="p-2"><span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono text-[10.5px] border border-blue-200">{line.bf || 'N/A'} BF</span></td>
                            <td className="p-2"><span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-mono text-[10.5px] border border-purple-200">{line.size || 'N/A'} size</span></td>
                            <td className="p-2 text-stone-600 capitalize">{line.colour}</td>
                            <td className="p-2 text-right font-bold text-stone-900">{line.qty.toLocaleString()} kg</td>
                            <td className="p-2 text-right pr-4 text-stone-600">₹{line.rate.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 3 & 4: EXPORT TO TALLY */}
      {activeSubTab === 'export_vouchers' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="apex-card p-6 bg-white border border-stone-200 rounded-xl shadow-sm">
              <h3 className="text-sm font-bold text-stone-900 mb-4">Export Parameters</h3>
              
              <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-stone-500 uppercase">Voucher Type to Export</label>
                  <select className="p-2 border border-stone-300 rounded text-xs bg-white" value={exportType} onChange={e => setExportType(e.target.value)}>
                    <option value="reels">Step 3: Paper Reel Receipts (Purchases)</option>
                    <option value="production">Step 4: Production Logs (Stock Journals)</option>
                    <option value="sales">Old: Sales Vouchers (Box Dispatches → Tally)</option>
                    <option value="purchases">Old: Purchase Vouchers (Received POs → Tally)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-stone-500 uppercase">Start Date</label>
                    <input type="date" className="p-2 border border-stone-300 rounded text-xs" value={exportStartDate} onChange={e => setExportStartDate(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-stone-500 uppercase">End Date</label>
                    <input type="date" className="p-2 border border-stone-300 rounded text-xs" value={exportEndDate} onChange={e => setExportEndDate(e.target.value)} />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-stone-500 uppercase">Unit Filter</label>
                  <select className="p-2 border border-stone-300 rounded text-xs bg-white" value={exportUnitId} onChange={e => setExportUnitId(e.target.value)}>
                    <option value="">— All Units —</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer mt-2 font-medium">
                  <input type="checkbox" checked={excludeSynced} onChange={e => setExcludeSynced(e.target.checked)} className="rounded text-stone-900 focus:ring-stone-500" />
                  <span>Exclude already synced in ERP</span>
                </label>
              </div>

              <div className="flex flex-col gap-2">
                <button onClick={handleExportVouchers} className="flex justify-center items-center gap-2 bg-stone-900 hover:bg-stone-850 text-white text-xs font-bold py-2.5 px-4 rounded-lg transition-colors shadow-sm">
                  <Download className="w-4 h-4" /> Download Tally XML File
                </button>
                <button onClick={handleMarkAsSynced} className="flex justify-center items-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold py-2.5 px-4 rounded-lg transition-colors border border-stone-300">
                  <CheckCircle2 className="w-4 h-4 text-green-600" /> Mark Selected as Synced
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="apex-card p-6 bg-white border border-stone-200 rounded-xl shadow-sm h-full flex flex-col">
              <h3 className="text-sm font-bold text-stone-900 mb-1">Vouchers Ready to Export</h3>
              <p className="text-xs text-stone-500 mb-4">The following documents match your selected date range and filter criteria.</p>
              
              <div className="overflow-y-auto flex-1 max-h-[480px]">
                {exportType === 'reels' && (() => {
                  const list = getReelsToExport();
                  if (list.length === 0) return <p className="text-center text-xs text-stone-400 py-12">No unsynced paper reels in stock inventory found.</p>;
                  return (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
                          <th className="p-2">Date / Reel No</th>
                          <th className="p-2">Invoice / Vendor</th>
                          <th className="p-2">Spec Details</th>
                          <th className="p-2 text-right">Weight</th>
                          <th className="p-2 text-right">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map(r => (
                          <tr key={r.id} className="border-b border-stone-200 hover:bg-stone-50/50">
                            <td className="p-2">
                              <span className="font-semibold text-stone-800 block">{r.reelNo || 'No Reel No'}</span>
                              <span className="text-[10px] text-stone-400">{r.date}</span>
                            </td>
                            <td className="p-2">
                              <span className="font-medium text-stone-700 block">{r.invoiceNo}</span>
                              <span className="text-[10px] text-stone-400">{r.vendorName}</span>
                            </td>
                            <td className="p-2 text-stone-600">
                              {r.bf}BF {r.gsm}GSM {r.size}cm &mdash; <span className="capitalize text-[11px] font-semibold">{r.colour}</span>
                            </td>
                            <td className="p-2 text-right font-bold text-stone-900">{r.qty.toLocaleString()} kg</td>
                            <td className="p-2 text-right font-bold text-stone-900">₹{r.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}

                {exportType === 'production' && (() => {
                  const list = getProductionToExport();
                  if (list.length === 0) return <p className="text-center text-xs text-stone-400 py-12">No unsynced production logs found.</p>;
                  return (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
                          <th className="p-2">Date / Code</th>
                          <th className="p-2">Product Target</th>
                          <th className="p-2 text-right">Paper Consumed</th>
                          <th className="p-2 text-right">Produced Qty</th>
                          <th className="p-2">Reel Nos Used</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map(p => (
                          <tr key={p.id} className="border-b border-stone-200 hover:bg-stone-50/50">
                            <td className="p-2">
                              <span className="font-semibold text-stone-800 block">PROD-{p.id.substring(0, 5).toUpperCase()}</span>
                              <span className="text-[10px] text-stone-400">{p.date}</span>
                            </td>
                            <td className="p-2 font-medium text-stone-700">{p.usedForItem}</td>
                            <td className="p-2 text-right font-mono text-stone-600">{parseFloat(p.useKg || 0).toLocaleString()} kg</td>
                            <td className="p-2 text-right font-bold text-stone-900">{parseFloat(p.linerQty || 0).toLocaleString()} Nos</td>
                            <td className="p-2 text-stone-500 max-w-[150px] truncate" title={p.reelNos}>{p.reelNos}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}

                {exportType === 'sales' && (() => {
                  const list = getDispatchesToExport();
                  if (list.length === 0) return <p className="text-center text-xs text-stone-400 py-12">No unsynced dispatches found.</p>;
                  return (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
                          <th className="p-2">Date</th>
                          <th className="p-2">Challan No</th>
                          <th className="p-2">Customer</th>
                          <th className="p-2 text-right">Qty</th>
                          <th className="p-2 text-right">Total Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((e, idx) => {
                          const val = e.qty * e.rate;
                          const gst = val * (e.gstPercent / 100);
                          return (
                            <tr key={idx} className="border-b border-stone-200 hover:bg-stone-50/50">
                              <td className="p-2">{e.date}</td>
                              <td className="p-2 font-mono font-semibold">{e.dcNo}</td>
                              <td className="p-2 text-stone-600">{e.customerName}</td>
                              <td className="p-2 text-right font-medium">{e.qty.toLocaleString()}</td>
                              <td className="p-2 text-right font-bold text-stone-900">₹{(val + gst).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()}

                {exportType === 'purchases' && (() => {
                  const list = getPOsToExport();
                  if (list.length === 0) return <p className="text-center text-xs text-stone-400 py-12">No unsynced received POs found.</p>;
                  return (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
                          <th className="p-2">Rcv Date</th>
                          <th className="p-2">Invoice No</th>
                          <th className="p-2">Vendor</th>
                          <th className="p-2 text-right">Basic Val</th>
                          <th className="p-2 text-right">Total Val</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((e, idx) => (
                          <tr key={idx} className="border-b border-stone-200 hover:bg-stone-50/50">
                            <td className="p-2">{e.date}</td>
                            <td className="p-2 font-mono font-semibold">{e.invoiceNo}</td>
                            <td className="p-2 text-stone-600">{e.vendorName}</td>
                            <td className="p-2 text-right font-medium">₹{e.basicVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                            <td className="p-2 text-right font-bold text-stone-900">₹{e.totalVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 5: IMPORT SALES INVOICES & LINK DISPATCHES */}
      {activeSubTab === 'import_invoices' && (
        <div className="flex flex-col gap-6">
          <div className="apex-card p-6 bg-white border border-stone-200 rounded-xl shadow-sm">
            <h3 className="text-sm font-bold text-stone-900 mb-2">Import Tally Sales Invoices (Link Dispatches)</h3>
            <p className="text-xs text-stone-500 mb-4">
              Invoices are created in Tally first. Export your **Sales Invoices XML** from Tally and upload below to link Tally Invoices with ERP dispatches (Delivery Challans).
            </p>
            <div className="relative border-2 border-dashed border-stone-300 rounded-xl p-8 text-center bg-stone-50 hover:bg-stone-100 transition-colors">
              <input type="file" accept=".xml" onChange={handleInvoicesUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <Upload className="w-8 h-8 text-stone-500 mx-auto mb-2" />
              <p className="text-xs font-semibold text-stone-700">{xmlFileName || 'Drag and drop or click to upload Daybook XML'}</p>
            </div>
          </div>

          {parsedInvoices.length > 0 && (
            <div className="apex-card p-6 bg-white border border-stone-200 rounded-xl shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-sm font-bold text-stone-900">Link Invoices to Dispatches (DC)</h3>
                  <p className="text-xs text-stone-500 mt-1">Review the matches. Invoices that contain an matching Delivery Challan number in Tally are auto-matched.</p>
                </div>
                <button onClick={executeInvoicesSync} className="flex items-center gap-2 bg-stone-900 hover:bg-stone-850 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-sm">
                  <CheckCircle2 className="w-4 h-4" /> Link {parsedInvoices.filter(i => i.selectedOrderId !== '' && i.selectedDispatchIndex !== -1).length} Invoices to ERP
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold">
                      <th className="p-3">Invoice No / Date</th>
                      <th className="p-3">Tally Party Name</th>
                      <th className="p-3 text-right">Invoice Amount</th>
                      <th className="p-3">Reference DC in XML</th>
                      <th className="p-3">Dispatch Match Status</th>
                      <th className="p-3">Link to ERP Dispatch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedInvoices.map((inv) => {
                      const unsyncedList = getUnsyncedDispatchesForCustomer(inv.selectedCustomerId);
                      const isAutoMatched = inv.matchedDcNo !== '';
                      const hasSelectedDispatch = inv.selectedOrderId !== '' && inv.selectedDispatchIndex !== -1;

                      return (
                        <tr key={inv.id} className="border-b border-stone-200 hover:bg-stone-50/80">
                          <td className="p-3 font-semibold text-stone-900">
                            <span className="block">{inv.invoiceNo}</span>
                            <span className="text-[10px] text-stone-400">{inv.date}</span>
                          </td>
                          <td className="p-3 font-medium text-stone-700">{inv.partyName}</td>
                          <td className="p-3 text-right font-bold text-stone-950">₹{inv.amount.toLocaleString('en-IN')}</td>
                          <td className="p-3 text-stone-600 font-mono text-[11px]">{inv.dcNo || <span className="text-stone-300 italic">None found</span>}</td>
                          <td className="p-3">
                            {isAutoMatched ? (
                              <span className="inline-block bg-green-50 text-green-700 px-2 py-1 rounded text-[10px] font-bold border border-green-200">
                                Auto-Matched ({inv.matchedDcNo})
                              </span>
                            ) : hasSelectedDispatch ? (
                              <span className="inline-block bg-blue-50 text-blue-700 px-2 py-1 rounded text-[10px] font-bold border border-blue-200">
                                Manually Mapped
                              </span>
                            ) : (
                              <span className="inline-block bg-orange-50 text-orange-700 px-2 py-1 rounded text-[10px] font-bold border border-orange-200">
                                Unmatched (Link Below)
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {isAutoMatched ? (
                              <span className="text-stone-500 font-medium">Auto-Linked</span>
                            ) : (
                              <select
                                className="p-1 border border-stone-300 rounded text-stone-700 bg-white max-w-[260px] text-xs"
                                value={hasSelectedDispatch ? `${inv.selectedOrderId}|${inv.selectedDispatchIndex}` : ''}
                                onChange={e => handleInvoiceDispatchSelect(inv.id, e.target.value)}
                                disabled={!inv.selectedCustomerId}
                              >
                                <option value="">— Select Dispatch to Link —</option>
                                {unsyncedList.map(item => (
                                  <option key={`${item.orderId}-${item.dispatchIndex}`} value={`${item.orderId}|${item.dispatchIndex}`}>
                                    {item.dcNo} &mdash; {item.itemName} ({item.qty} pcs, {item.date})
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SYNC BOX ITEMS TAB */}
      {activeSubTab === 'import_box_items' && (
        <div className="flex flex-col gap-6">
          <div className="apex-card p-6 bg-white border border-stone-200 rounded-xl shadow-sm">
            <h3 className="text-sm font-bold text-stone-900 mb-2">Import Tally Stock Items (Box Specifications)</h3>
            <p className="text-xs text-stone-500 mb-4">
              Export your **Stock Items** list from Tally in **XML format** (go to **List of Accounts**, press **Ctrl + E**, configure as **XML**) and upload below. Apex ERP will parse dimensions, board ply, paper GSM, BF, and colour directly from Tally's naming structure and import or update your Box Specifications database.
            </p>
            <div className="relative border-2 border-dashed border-stone-300 rounded-xl p-8 text-center bg-stone-50 hover:bg-stone-100 transition-colors">
              <input type="file" accept=".xml" onChange={handleBoxItemsUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <Upload className="w-8 h-8 text-stone-500 mx-auto mb-2" />
              <p className="text-xs font-semibold text-stone-700">{xmlFileName || 'Drag and drop or click to upload Tally XML'}</p>
            </div>
          </div>

          {parsedBoxItems.length > 0 && (
            <div className="apex-card p-6 bg-white border border-stone-200 rounded-xl shadow-sm">
              <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                <div>
                  <h3 className="text-sm font-bold text-stone-900">Map & Review Box Specifications</h3>
                  <p className="text-xs text-stone-500 mt-1">Review the extracted dimensions, rates, and materials. You can edit any field before writing to the database.</p>
                </div>
                <button onClick={executeBoxItemsSync} className="flex items-center gap-2 bg-stone-900 hover:bg-stone-850 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-sm">
                  <CheckCircle2 className="w-4 h-4" /> Sync {parsedBoxItems.length} Items to ERP
                </button>
              </div>

              {/* Bulk Assignments */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-stone-50 p-4 rounded-xl border border-stone-200 mb-6">
                <div>
                  <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Bulk Map to Manufacturing Unit</label>
                  <select 
                    className="w-full p-2 border border-stone-300 rounded-lg text-xs bg-white" 
                    onChange={e => handleBoxItemBulkUnitAssign(e.target.value)}
                  >
                    <option value="">— Select Manufacturing Unit —</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Bulk Assign Item Type</label>
                  <select 
                    className="w-full p-2 border border-stone-300 rounded-lg text-xs bg-white" 
                    onChange={e => handleBoxItemBulkTypeAssign(e.target.value)}
                  >
                    <option value="Box">Box</option>
                    <option value="Tray">Tray</option>
                    <option value="Sheet">Sheet</option>
                    <option value="PPC">PPC</option>
                    <option value="Lid">Lid</option>
                    <option value="Plate">Plate</option>
                  </select>
                </div>
              </div>

              {/* Editable Preview Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold">
                      <th className="p-3">Tally Stock Item Name</th>
                      <th className="p-3">ERP Unit</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Size (L x W x H) mm</th>
                      <th className="p-3">Ply</th>
                      <th className="p-3">Paper GSM</th>
                      <th className="p-3">Paper BF</th>
                      <th className="p-3">Colour</th>
                      <th className="p-3">Rate</th>
                      <th className="p-3 text-center">ERP Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedBoxItems.map((item) => {
                      const existing = items.find(i => 
                        (i.name || i.Item_Name || '').toLowerCase().trim() === item.name.toLowerCase().trim() && 
                        i.companyId === item.selectedUnitId
                      );

                      return (
                        <tr key={item.id} className="border-b border-stone-200 hover:bg-stone-50/80">
                          <td className="p-3 font-semibold text-stone-900 max-w-[200px] truncate" title={item.name}>
                            <span>{item.name}</span>
                            <span className="block text-[10px] text-stone-400 font-normal">{item.parent}</span>
                          </td>
                          <td className="p-3">
                            <select
                              className="p-1 border border-stone-300 rounded text-stone-700 bg-white"
                              value={item.selectedUnitId}
                              onChange={e => handleBoxItemFieldChange(item.id, 'selectedUnitId', e.target.value)}
                            >
                              <option value="">— Select Unit —</option>
                              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </td>
                          <td className="p-3">
                            <select
                              className="p-1 border border-stone-300 rounded text-stone-700 bg-white"
                              value={item.itemType}
                              onChange={e => handleBoxItemFieldChange(item.id, 'itemType', e.target.value)}
                            >
                              <option value="Box">Box</option>
                              <option value="Tray">Tray</option>
                              <option value="Sheet">Sheet</option>
                              <option value="PPC">PPC</option>
                              <option value="Lid">Lid</option>
                              <option value="Plate">Plate</option>
                            </select>
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              className="p-1 border border-stone-300 rounded text-stone-700 w-24 text-xs"
                              placeholder="L x W x H"
                              value={item.size}
                              onChange={e => handleBoxItemFieldChange(item.id, 'size', e.target.value)}
                            />
                          </td>
                          <td className="p-3">
                            <select
                              className="p-1 border border-stone-300 rounded text-stone-700 bg-white"
                              value={item.ply}
                              onChange={e => handleBoxItemFieldChange(item.id, 'ply', e.target.value)}
                            >
                              <option value="">-</option>
                              <option value="2">2 Ply</option>
                              <option value="3">3 Ply</option>
                              <option value="5">5 Ply</option>
                              <option value="7">7 Ply</option>
                            </select>
                          </td>
                          <td className="p-3">
                            <input
                              type="number"
                              className="p-1 border border-stone-300 rounded text-stone-700 w-16 text-xs"
                              value={item.paperGsm}
                              onChange={e => handleBoxItemFieldChange(item.id, 'paperGsm', e.target.value)}
                            />
                          </td>
                          <td className="p-3">
                            <input
                              type="number"
                              className="p-1 border border-stone-300 rounded text-stone-700 w-16 text-xs"
                              value={item.paperBf}
                              onChange={e => handleBoxItemFieldChange(item.id, 'paperBf', e.target.value)}
                            />
                          </td>
                          <td className="p-3">
                            <select
                              className="p-1 border border-stone-300 rounded text-stone-700 bg-white"
                              value={item.paperColour}
                              onChange={e => handleBoxItemFieldChange(item.id, 'paperColour', e.target.value)}
                            >
                              <option value="Kraft">Kraft</option>
                              <option value="Golden">Golden</option>
                              <option value="White">White</option>
                            </select>
                          </td>
                          <td className="p-3">
                            <input
                              type="number"
                              step="0.01"
                              className="p-1 border border-stone-300 rounded text-stone-700 w-16 text-xs text-right"
                              value={item.rate}
                              onChange={e => handleBoxItemFieldChange(item.id, 'rate', parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td className="p-3 text-center">
                            {existing ? (
                              <span className="inline-block bg-orange-50 text-orange-700 px-2 py-1 rounded text-[10px] font-bold border border-orange-200">
                                Existing (Update)
                              </span>
                            ) : (
                              <span className="inline-block bg-green-50 text-green-700 px-2 py-1 rounded text-[10px] font-bold border border-green-200">
                                New Item
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* LEGACY TAB: SYNC LEDGERS */}
      {activeSubTab === 'import_masters' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="apex-card p-6 bg-white border border-stone-200 rounded-xl shadow-sm">
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Import Tally XML Ledgers</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Instructions: In TallyPrime, go to <strong>Display More Reports &gt; List of Accounts</strong>, press <strong>Ctrl + E (Export)</strong>, configure format as <strong>XML</strong>, and save. Upload that file below to import or update customers and vendors.
            </p>
            
            <div style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: '32px 20px', textAlign: 'center', background: 'var(--bg-secondary)', position: 'relative' }}>
              <input type="file" accept=".xml" onChange={handleMastersUpload} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
              <Upload style={{ width: 32, height: 32, color: 'var(--brand)', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{xmlFileName || 'Drag and drop or click to upload Tally XML'}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Supports Tally Master XML containing Sundry Debtors/Creditors</p>
            </div>
          </div>

          {parsedLedgers.length > 0 && (
            <div className="apex-card p-6 bg-white border border-stone-200 rounded-xl shadow-sm">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 700 }}>Review Imported Ledgers</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Map new Customers to one of your manufacturing units to prevent account confusion.</p>
                </div>
                <button onClick={executeMastersSync} className="apex-btn apex-btn-primary" style={{ padding: '8px 16px', fontSize: 13 }}>
                  <CheckCircle2 style={{ width: 14, height: 14 }} /> Sync {parsedLedgers.length} Ledgers to ERP
                </button>
              </div>

              {/* Bulk Unit Assign */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Bulk Map New Customers to Unit:</span>
                <select className="apex-select" style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }} value={bulkUnitId} onChange={e => handleBulkUnitAssign(e.target.value)}>
                  <option value="">— Select Unit —</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Assigns this unit to all new customers listed below)</span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>Ledger Name</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>Tally Group</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>GSTIN / State</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>Mapping Unit Link</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedLedgers.map((l, idx) => {
                      const isCustomer = l.type === 'customer';
                      const existing = isCustomer 
                        ? customers.find(c => c.name.toLowerCase().trim() === l.name.toLowerCase().trim())
                        : vendors.find(v => v.name.toLowerCase().trim() === l.name.toLowerCase().trim());
                      
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 600 }}>{l.name}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, background: isCustomer ? '#eff6ff' : '#f5f3ff', color: isCustomer ? '#1d4ed8' : '#7c3aed', fontWeight: 600 }}>
                              {l.parent}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontSize: 11.5 }}>{l.gstin || 'No GSTIN'}</div>
                            <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{l.state || 'No State'}</div>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {isCustomer ? (
                              existing ? (
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                  Unit: <strong>{companies.find(u => u.id === existing.unitId)?.name || 'Legacy'}</strong>
                                </span>
                              ) : (
                                <select 
                                  className="apex-select" 
                                  style={{ padding: '4px 8px', fontSize: 12, width: 'auto' }} 
                                  value={selectedUnitForDebtors[idx] || ''} 
                                  onChange={e => handleUnitSelect(idx, e.target.value)}
                                >
                                  <option value="">— Select target Unit —</option>
                                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                              )
                            ) : (
                              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Global Vendor</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            {existing ? (
                              <span style={{ color: 'var(--brand)', fontWeight: 700, fontSize: 11.5 }}>Existing (Update)</span>
                            ) : (
                              <span style={{ color: '#16a34a', fontWeight: 700, fontSize: 11.5 }}>New Ledger</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* LEGACY TAB: SYNC TRANSACTIONS */}
      {activeSubTab === 'import_vouchers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="apex-card p-6 bg-white border border-stone-200 rounded-xl shadow-sm">
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Import Tally Receipts/Payments</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Instructions: In TallyPrime, go to <strong>Display More Reports &gt; Day Book</strong>, select the date range of transactions, press <strong>Ctrl + E (Export)</strong>, choose <strong>XML</strong> format, and export. Upload that file here to import bank/cash receipts and payments.
            </p>
            
            <div style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: '32px 20px', textAlign: 'center', background: 'var(--bg-secondary)', position: 'relative' }}>
              <input type="file" accept=".xml" onChange={handleVouchersUpload} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
              <Upload style={{ width: 32, height: 32, color: 'var(--brand)', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{xmlFileName || 'Drag and drop or click to upload Day Book XML'}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Import transaction vouchers (Receipts & Payments) to sync outstanding balances</p>
            </div>
          </div>

          {parsedVouchers.length > 0 && (
            <div className="apex-card p-6 bg-white border border-stone-200 rounded-xl shadow-sm">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 700 }}>Review Transactions to Sync</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Only Receipts and Payments are shown. Unmatched ledgers or duplicates will be skipped.</p>
                </div>
                <button onClick={executeVouchersSync} className="apex-btn apex-btn-primary" style={{ padding: '8px 16px', fontSize: 13 }}>
                  <CheckCircle2 style={{ width: 14, height: 14 }} /> Sync {parsedVouchers.length} Transactions to ERP
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>Voucher Date</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>Voucher No / Ref</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>Tally Ledger</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>Type</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>Amount</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)' }}>ERP Match Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedVouchers.map((v, idx) => {
                      const isReceipt = v.type === 'receipt';
                      const party = isReceipt 
                        ? customers.find(c => c.name.toLowerCase().trim() === v.partyName.toLowerCase().trim())
                        : vendors.find(vend => vend.name.toLowerCase().trim() === v.partyName.toLowerCase().trim());
                      
                      const isDuplicate = transactions.some(t => t.referenceNo === v.voucherNo && t.type === v.type);

                      let matchStatus = '';
                      let statusColor = 'var(--text-secondary)';
                      if (isDuplicate) {
                        matchStatus = 'Duplicate (Skip)';
                        statusColor = 'var(--text-muted)';
                      } else if (!party) {
                        matchStatus = 'Ledger Not Found (Skip)';
                        statusColor = '#dc2626';
                      } else {
                        matchStatus = `Ready to Sync (${party.name})`;
                        statusColor = '#16a34a';
                      }

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px' }}>{v.date}</td>
                          <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 11.5 }}>{v.voucherNo}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 600 }}>{v.partyName}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, background: isReceipt ? '#dcfce7' : '#fee2e2', color: isReceipt ? '#15803d' : '#dc2626', fontWeight: 600 }}>
                              {v.typeName}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>₹{v.amount.toLocaleString('en-IN')}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: statusColor }}>{matchStatus}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
