import React, { useState, useEffect, useRef } from 'react';
import { 
  Calculator, Package, Building2, Users, History, LogOut, Plus, Trash2, Lock, ShieldAlert, CheckCircle2, Download, Upload, Factory, Coins, PieChart, ShoppingCart, Edit2, Archive, Search, Truck, ScanLine, IndianRupee, LayoutDashboard, BarChart3, CalendarDays, Box, ArrowDown, ArrowUp
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';

// ==========================================
// 1. FIREBASE SETUP & API KEYS (SECURED)
// ==========================================
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
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
    
    // ROOT PATH 
    const getColRefRoot = (colName) => collection(db, colName);
    
    const logError = (err) => {
      console.error("Snapshot error:", err);
      setError(err.message);
    };

    const unsubUsers = onSnapshot(getColRefRoot('erp_users'), (snap) => setErpUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubCompanies = onSnapshot(getColRefRoot('companies'), (snap) => setCompanies(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubItems = onSnapshot(getColRefRoot('items'), (snap) => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubProduction = onSnapshot(getColRefRoot('production'), (snap) => setProduction(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubOrders = onSnapshot(getColRefRoot('orders'), (snap) => setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubWastage = onSnapshot(getColRefRoot('wastage'), (snap) => setWastageLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubInventory = onSnapshot(getColRefRoot('inventory'), (snap) => setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubLogs = onSnapshot(getColRefRoot('logs'), (snap) => setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);

    setIsDbReady(true);
    return () => { unsubUsers(); unsubCompanies(); unsubItems(); unsubProduction(); unsubOrders(); unsubWastage(); unsubInventory(); unsubLogs(); };
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
  if (!isDbReady) return <div className="min-h-screen flex items-center justify-center bg-stone-50"><p className="text-stone-500 animate-pulse">Connecting to secure cloud...</p></div>;

  if (erpUsers.length === 0) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
          <ShieldAlert className="w-16 h-16 text-stone-800 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-stone-900 mb-2">Database Empty</h1>
          <p className="text-stone-500 mb-8">Welcome to your new ERP. You need to create the first Admin account to get started.</p>
          <button onClick={createInitialAdmin} className="w-full bg-stone-900 text-white py-3 rounded-lg hover:bg-stone-800 font-bold flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> Initialize System
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
      <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full">
          <div className="text-center mb-8">
            <Package className="w-12 h-12 text-stone-800 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-stone-900">Apex ERP System</h1>
            <p className="text-stone-500 mt-2">{selectedUserForLogin ? `Enter password for ${selectedUserForLogin.name}` : 'Select your profile'}</p>
          </div>
          {!selectedUserForLogin ? (
            <div className="space-y-3">
              {[...erpUsers].sort((a, b) => (a?.name || '').localeCompare(b?.name || '')).map(user => (
                <button key={user.id} onClick={() => setSelectedUserForLogin(user)} className="w-full text-left px-6 py-4 border border-stone-200 rounded-lg hover:border-stone-800 hover:bg-stone-50 transition-colors flex justify-between items-center">
                  <div><p className="font-semibold text-stone-900">{user.name}</p><p className="text-sm text-stone-500 capitalize">{user.role}</p></div>
                  <Lock className="w-4 h-4 text-stone-400" />
                </button>
              ))}
            </div>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <input type="password" placeholder="Enter Password" className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-800" value={loginPassword} onChange={(e) => { setLoginPassword(e.target.value); setLoginError(''); }} autoFocus />
                {loginError && <p className="text-red-500 text-sm mt-1">{loginError}</p>}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => { setSelectedUserForLogin(null); setLoginPassword(''); setLoginError(''); }} className="flex-1 px-4 py-3 border border-stone-300 text-stone-700 rounded-lg hover:bg-stone-50">Back</button>
                <button type="submit" className="flex-1 bg-stone-900 text-white px-4 py-3 rounded-lg hover:bg-stone-800">Login</button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col md:flex-row font-sans text-stone-800">
      <aside className="w-full md:w-64 bg-stone-900 text-stone-300 flex flex-col">
        <div className="p-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2"><Package className="w-6 h-6" /> Apex ERP</h2>
          <p className="text-xs text-stone-500 mt-1">Logged in as: {currentErpUser.name}</p>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <NavButton icon={<LayoutDashboard />} label="Dashboard" isActive={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavButton icon={<Calculator />} label="Calculator" isActive={activeTab === 'calculator'} onClick={() => setActiveTab('calculator')} />
          {currentErpUser.role === 'admin' && <NavButton icon={<Coins />} label="Cost Calculator" isActive={activeTab === 'costing'} onClick={() => setActiveTab('costing')} />}
          <NavButton icon={<ShoppingCart />} label="Orders" isActive={activeTab === 'orders'} onClick={() => setActiveTab('orders')} />
          <NavButton icon={<Factory />} label="Production Log" isActive={activeTab === 'production'} onClick={() => setActiveTab('production')} />
          <NavButton icon={<Truck />} label="Finished Goods" isActive={activeTab === 'finished_goods'} onClick={() => setActiveTab('finished_goods')} />
          <NavButton icon={<PieChart />} label="Wastage & Gum" isActive={activeTab === 'wastage'} onClick={() => setActiveTab('wastage')} />
          <NavButton icon={<Archive />} label="Stock Inventory" isActive={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} />
          <NavButton icon={<Package />} label="Box Database" isActive={activeTab === 'items'} onClick={() => setActiveTab('items')} />
          {currentErpUser.role === 'admin' && (
            <>
              <div className="pt-4 pb-2"><p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Administration</p></div>
              <NavButton icon={<Building2 />} label="Companies" isActive={activeTab === 'companies'} onClick={() => setActiveTab('companies')} />
              <NavButton icon={<Users />} label="Users & Access" isActive={activeTab === 'users'} onClick={() => setActiveTab('users')} />
              <NavButton icon={<History />} label="Activity Logs" isActive={activeTab === 'logs'} onClick={() => setActiveTab('logs')} />
            </>
          )}
        </nav>
        <div className="p-4 border-t border-stone-800">
          <button onClick={logout} className="flex items-center gap-3 text-stone-400 hover:text-white w-full px-4 py-2 transition-colors"><LogOut className="w-5 h-5" /> Logout</button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 overflow-y-auto h-screen">
        {activeTab === 'dashboard' && <DashboardView inventory={inventory} production={production} orders={orders} items={items} companies={companies} currentUser={currentErpUser} />}
        {activeTab === 'calculator' && <CalculatorView companies={companies} items={items} addLog={addLog} currentUser={currentErpUser} />}
        {activeTab === 'costing' && currentErpUser.role === 'admin' && <CostingView />}
        {activeTab === 'orders' && <OrdersView orders={orders} production={production} items={items} companies={companies} addLog={addLog} role={currentErpUser.role} getColRef={getColRef} getDocRef={getDocRef} currentUser={currentErpUser} />}
        {activeTab === 'production' && <ProductionView inventory={inventory} production={production} orders={orders} items={items} companies={companies} addLog={addLog} role={currentErpUser.role} getColRef={getColRef} getDocRef={getDocRef} currentUser={currentErpUser} />}
        {activeTab === 'finished_goods' && <FinishedGoodsView orders={orders} production={production} items={items} companies={companies} addLog={addLog} getColRef={getColRef} getDocRef={getDocRef} currentUser={currentErpUser} />}
        {activeTab === 'wastage' && <WastageView wastageLogs={wastageLogs} orders={orders} companies={companies} production={production} addLog={addLog} role={currentErpUser.role} getColRef={getColRef} getDocRef={getDocRef} currentUser={currentErpUser} />}
        {activeTab === 'inventory' && <InventoryView inventory={inventory} production={production} addLog={addLog} role={currentErpUser.role} getColRef={getColRef} getDocRef={getDocRef} currentUser={currentErpUser} companies={companies} />}
        {activeTab === 'items' && <ItemsView items={items} companies={companies} addLog={addLog} role={currentErpUser.role} getColRef={getColRef} getDocRef={getDocRef} currentUser={currentErpUser} />}
        {activeTab === 'companies' && <CompaniesView companies={companies} addLog={addLog} getColRef={getColRef} getDocRef={getDocRef} />}
        {activeTab === 'users' && <UsersView users={erpUsers} companies={companies} addLog={addLog} getColRef={getColRef} getDocRef={getDocRef} currentUserId={currentErpUser.id} />}
        {activeTab === 'logs' && <LogsView logs={logs} />}
      </main>
    </div>
  );
}

function NavButton({ icon, label, isActive, onClick }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-stone-800 text-white' : 'hover:bg-stone-800 hover:text-white'}`}>
      {React.cloneElement(icon, { className: 'w-5 h-5' })}
      <span>{label}</span>
    </button>
  );
}
// --- DASHBOARD VIEW ---
// --- DASHBOARD VIEW ---
function DashboardView({ inventory, production, orders, items, companies, currentUser }) {
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
    
    inventory.forEach(reel => {
      if (new Date(reel.date) > targetDate) return; 
      const rNo = String(reel.reelNo || '').trim().toLowerCase();
      const initialIssued = parseFloat(reel.initialIssuedQty || 0);
      balances[rNo] = parseFloat(reel.receivedQty || 0) - initialIssued;
      usageStats[rNo] = { issued: 0 };
    });

    const sortedProd = [...production]
        .filter(p => new Date(p.date) <= targetDate)
        .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    sortedProd.forEach(p => {
      // THE FIX: Safe granular parsing without log array pushing
      if (p.consumedReels && p.consumedReels.length > 0) {
        p.consumedReels.forEach(cr => {
           const rNo = String(cr.reelNo || '').trim().toLowerCase();
           const deduct = parseFloat(cr.weight || 0);
           if (deduct > 0) {
             balances[rNo] = (balances[rNo] || 0) - deduct;
             if (!usageStats[rNo]) usageStats[rNo] = { issued: 0 };
             usageStats[rNo].issued += deduct;
           }
        });
      } else {
        if (!p.reelNos || !p.useKg) return;
        const pReels = String(p.reelNos || '').split(',').map(r => r.trim().toLowerCase()).filter(r => r);
        if (pReels.length === 0) return;
        
        let remainingUse = parseFloat(p.useKg || 0);
        pReels.forEach((rNo, index) => {
          if (remainingUse <= 0) return;
          let deduct = 0;
          if (index === pReels.length - 1) { 
              deduct = remainingUse; 
          } else { 
              deduct = Math.min(Math.max(balances[rNo] || 0, 0), remainingUse); 
          }
          if (deduct > 0) {
            balances[rNo] = (balances[rNo] || 0) - deduct;
            if (!usageStats[rNo]) usageStats[rNo] = { issued: 0 };
            usageStats[rNo].issued += deduct;
            remainingUse -= deduct;
          }
        });
      }
    });

    return inventory
      .filter(reel => new Date(reel.date) <= targetDate)
      .map(reel => {
        const rNo = String(reel.reelNo || '').trim().toLowerCase();
        const stats = usageStats[rNo] || { issued: 0 };
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
        const rCompId = reel.companyId || 'unassigned';
        if (compId !== 'all' && rCompId !== compId) return;
        kg += reel.balanceQty;
        val += reel.value;
    });
    return { kg, val };
  };

  const getRmInward = (start, end, compId) => {
    let kg = 0, val = 0;
    inventory.forEach(reel => {
        const cId = reel.companyId || 'unassigned';
        if (compId !== 'all' && cId !== compId) return;
        const rDate = new Date(reel.date);
        if (rDate >= start && rDate <= end) {
            const qty = parseFloat(reel.receivedQty || 0);
            kg += qty;
            val += qty * parseFloat(reel.ratePerKg || 0);
        }
    });
    return { kg, val };
  };

  const getRmConsumedInPeriod = (start, end, compId) => {
    const reelLedger = {};
    inventory.forEach(r => {
      const rNo = String(r.reelNo || '').trim().toLowerCase();
      reelLedger[rNo] = { rate: parseFloat(r.ratePerKg || 0), companyId: r.companyId || 'unassigned' };
    });

    let kg = 0, val = 0;
    production.forEach(p => {
        const pDate = new Date(p.date);
        if (pDate >= start && pDate <= end) {
            const cId = p.companyId || 'unassigned';
            if (compId !== 'all' && cId !== compId) return;
            
            // THE FIX: Correctly maps values whether using the new Granular format or old sequential logs
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
               if (pReels.length > 0 && reelLedger[pReels[0]]) {
                   avgRate = reelLedger[pReels[0]].rate;
               }
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
  let grandTotalOpeningValue = 0;
  let grandTotalClosingValue = 0;
  let grandTotalSalesValue = 0;
  let grandTotalProdKg = 0;

  companies.forEach(comp => {
    if (allowedCompanyId !== 'all' && comp.id !== allowedCompanyId) return;
    
    const openingDate = new Date(startDate.getTime() - 1); 
    
    const rmOpen = getRmStockAtDate(openingDate, comp.id);
    const rmClose = getRmStockAtDate(endDate, comp.id);
    const rmInward = getRmInward(startDate, endDate, comp.id);
    const rmOutward = getRmConsumedInPeriod(startDate, endDate, comp.id);

    const fgOpen = getFgStockAtDate(openingDate, comp.id);
    const fgClose = getFgStockAtDate(endDate, comp.id);
    const fgSales = getSalesInPeriod(startDate, endDate, comp.id);
    
    const fgProduced = {
        kg: Math.max(0, fgClose.kg + fgSales.kg - fgOpen.kg),
        val: Math.max(0, fgClose.val + fgSales.val - fgOpen.val)
    };

    const totalOpeningVal = rmOpen.val + fgOpen.val;
    const totalClosingVal = rmClose.val + fgClose.val;

    if (totalOpeningVal > 0 || totalClosingVal > 0 || rmInward.val > 0 || fgSales.val > 0 || rmOutward.val > 0) {
      companyMetrics[comp.id] = {
        name: comp.name,
        rm: { opening: rmOpen, inward: rmInward, outward: rmOutward, closing: rmClose },
        fg: { opening: fgOpen, produced: fgProduced, sales: fgSales, closing: fgClose }
      };
      grandTotalOpeningValue += totalOpeningVal;
      grandTotalClosingValue += totalClosingVal;
      grandTotalSalesValue += fgSales.val;
      grandTotalProdKg += rmOutward.kg;
    }
  });

  if (allowedCompanyId === 'all') {
    const openingDate = new Date(startDate.getTime() - 1); 
    const rmOpen = getRmStockAtDate(openingDate, 'unassigned');
    const rmClose = getRmStockAtDate(endDate, 'unassigned');
    const rmInward = getRmInward(startDate, endDate, 'unassigned');
    const rmOutward = getRmConsumedInPeriod(startDate, endDate, 'unassigned');
    
    if (rmOpen.val > 0 || rmClose.val > 0 || rmInward.val > 0 || rmOutward.val > 0) {
       companyMetrics['unassigned'] = {
          name: 'Unassigned Client (Raw Material Only)',
          rm: { opening: rmOpen, inward: rmInward, outward: rmOutward, closing: rmClose },
          fg: { opening: {kg:0,val:0}, produced: {kg:0,val:0}, sales: {kg:0,val:0}, closing: {kg:0,val:0} }
       };
       grandTotalOpeningValue += rmOpen.val;
       grandTotalClosingValue += rmClose.val;
       grandTotalProdKg += rmOutward.kg;
    }
  }

  const sortedCompanyIds = Object.keys(companyMetrics).sort((a, b) => companyMetrics[a].name.localeCompare(companyMetrics[b].name));
  const displayPeriodName = viewMode === 'month' ? `${months[selectedMonth]} ${selectedYear}` : `FY ${selectedFY}-${parseInt(selectedFY) + 1}`;

  const chartData = sortedCompanyIds.map(id => {
    const m = companyMetrics[id];
    const totalClosing = m.rm.closing.val + m.fg.closing.val;
    const shortName = m.name.length > 12 ? m.name.substring(0, 12) + '...' : m.name;
    return {
      name: shortName,
      fullName: m.name,
      Sales: m.fg.sales.val,
      ClosingValue: totalClosing,
      ProductionKg: m.rm.outward.kg
    };
  }).filter(d => d.Sales > 0 || d.ClosingValue > 0 || d.ProductionKg > 0);

  return (
    <div className="max-w-7xl mx-auto pb-12">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-stone-900 text-white rounded-lg"><BarChart3 className="w-6 h-6" /></div>
        <h2 className="text-2xl font-bold">Executive Reconciliation Dashboard</h2>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-200 mb-6 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2 text-stone-500 mr-2 border-r pr-4 border-stone-200">
          <CalendarDays className="w-5 h-5"/> <span className="font-bold">Period:</span>
        </div>
        <select className="p-2 border rounded-lg bg-stone-50 font-bold focus:ring-2 focus:ring-stone-800" value={viewMode} onChange={e => setViewMode(e.target.value)}>
          <option value="month">Monthly View</option>
          <option value="year">Financial Year View</option>
        </select>
        {viewMode === 'month' ? (
          <div className="flex gap-2">
            <select className="p-2 border rounded-lg" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
              {months.map((m, idx) => <option key={idx} value={idx}>{m}</option>)}
            </select>
            <select className="p-2 border rounded-lg" value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        ) : (
          <select className="p-2 border rounded-lg font-bold text-blue-800 bg-blue-50" value={selectedFY} onChange={e => setSelectedFY(e.target.value)}>
            {yearOptions.map(y => <option key={y} value={y}>FY {y}-{y + 1}</option>)}
          </select>
        )}
      </div>

      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6">
        <h3 className="text-sm font-bold text-stone-500 uppercase tracking-wider mb-4 xl:mb-0">
          Operational Summary: {displayPeriodName}
        </h3>
        {sortedCompanyIds.length > 0 && (
          <div className="flex flex-wrap gap-3">
             <div className="bg-stone-100 text-stone-800 px-3 py-2 rounded-lg text-xs font-bold border border-stone-200 shadow-sm">
                Opening: ₹{grandTotalOpeningValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
             </div>
             <div className="bg-orange-50 text-orange-800 px-3 py-2 rounded-lg text-xs font-bold border border-orange-200 shadow-sm">
                Prod Consumed: {grandTotalProdKg.toFixed(0)} kg
             </div>
             <div className="bg-blue-50 text-blue-800 px-3 py-2 rounded-lg text-xs font-bold border border-blue-200 shadow-sm">
                Sales: ₹{grandTotalSalesValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
             </div>
             <div className="bg-green-50 text-green-800 px-3 py-2 rounded-lg text-xs font-bold border border-green-200 shadow-sm">
                Closing: ₹{grandTotalClosingValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
             </div>
          </div>
        )}
      </div>

      {chartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 h-80">
            <h3 className="text-sm font-bold text-stone-800 mb-4">Sales vs. Closing Stock Valuation (₹)</h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{fontSize: 10}} interval={0} angle={-45} textAnchor="end" />
                <YAxis tickFormatter={(val) => `₹${val >= 1000 ? (val/1000).toFixed(0)+'k' : val}`} tick={{fontSize: 12}} />
                <RechartsTooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                <Legend verticalAlign="top" height={36} wrapperStyle={{fontSize: '12px'}} />
                <Bar dataKey="Sales" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Sales (Dispatched)" />
                <Bar dataKey="ClosingValue" fill="#22c55e" radius={[4, 4, 0, 0]} name="Closing Stock Value" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 h-80">
            <h3 className="text-sm font-bold text-stone-800 mb-4">Paper Consumed During Production (KG)</h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{fontSize: 10}} interval={0} angle={-45} textAnchor="end" />
                <YAxis tickFormatter={(val) => `${val >= 1000 ? (val/1000).toFixed(1)+'k' : val}`} tick={{fontSize: 12}} />
                <RechartsTooltip formatter={(value) => `${value.toLocaleString()} kg`} />
                <Legend verticalAlign="top" height={36} wrapperStyle={{fontSize: '12px'}} />
                <Bar dataKey="ProductionKg" fill="#f97316" radius={[4, 4, 0, 0]} name="Paper Consumed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {sortedCompanyIds.length === 0 ? (
        <div className="bg-white p-8 rounded-xl shadow-sm border border-stone-200 text-center text-stone-500 flex flex-col items-center">
          <CalendarDays className="w-12 h-12 text-stone-300 mb-3" />
          <p>No ledger activity found for <strong>{displayPeriodName}</strong>.</p>
        </div>
      ) : (
        sortedCompanyIds.map(compId => {
          const m = companyMetrics[compId];

          return (
            <div key={compId} className="mb-10 bg-white rounded-xl shadow-sm border border-stone-300 overflow-hidden">
              <div className="bg-stone-900 px-6 py-4 text-white">
                <h4 className="text-xl font-bold">{m.name}</h4>
              </div>
              
              <div className="bg-stone-100 px-6 py-2 border-b border-stone-200 font-bold text-stone-600 text-xs uppercase tracking-wider flex items-center gap-2">
                <Archive className="w-4 h-4"/> Raw Material Ledger (Paper Reels)
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-stone-200">
                <div className="p-4 bg-white">
                  <p className="text-xs text-stone-500 uppercase tracking-wider mb-2 font-bold">1. Opening</p>
                  <p className="text-2xl font-bold text-stone-800">₹{m.rm.opening.val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                  <p className="text-sm font-medium text-stone-500">{m.rm.opening.kg.toFixed(1)} kg</p>
                </div>
                <div className="p-4 bg-blue-50/30">
                  <p className="text-xs text-blue-600 uppercase tracking-wider mb-2 font-bold flex items-center gap-1"><ArrowDown className="w-3 h-3"/> 2. Received (+)</p>
                  <p className="text-2xl font-bold text-stone-800">₹{m.rm.inward.val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                  <p className="text-sm font-medium text-blue-700">{m.rm.inward.kg.toFixed(1)} kg</p>
                </div>
                <div className="p-4 bg-orange-50/30">
                  <p className="text-xs text-orange-600 uppercase tracking-wider mb-2 font-bold flex items-center gap-1"><ArrowUp className="w-3 h-3"/> 3. Consumed (-)</p>
                  <p className="text-2xl font-bold text-stone-800">₹{m.rm.outward.val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                  <p className="text-sm font-medium text-orange-700">{m.rm.outward.kg.toFixed(1)} kg</p>
                </div>
                <div className="p-4 bg-green-50/30">
                  <p className="text-xs text-green-700 uppercase tracking-wider mb-2 font-bold">4. Closing Stock</p>
                  <p className="text-3xl font-bold text-green-700">₹{m.rm.closing.val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                  <p className="text-sm font-bold text-stone-600">{m.rm.closing.kg.toFixed(1)} kg</p>
                </div>
              </div>

              <div className="bg-stone-100 px-6 py-2 border-y border-stone-200 font-bold text-stone-600 text-xs uppercase tracking-wider flex items-center gap-2">
                <Package className="w-4 h-4"/> Finished Goods Ledger (Boxes & PPC)
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-stone-200">
                <div className="p-4 bg-white">
                  <p className="text-xs text-stone-500 uppercase tracking-wider mb-2 font-bold">1. Opening</p>
                  <p className="text-2xl font-bold text-stone-800">₹{m.fg.opening.val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                  <p className="text-sm font-medium text-stone-500">{m.fg.opening.kg.toFixed(1)} kg</p>
                </div>
                <div className="p-4 bg-blue-50/30">
                  <p className="text-xs text-blue-600 uppercase tracking-wider mb-2 font-bold flex items-center gap-1"><Factory className="w-3 h-3"/> 2. Produced (+)</p>
                  <p className="text-2xl font-bold text-stone-800">₹{m.fg.produced.val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                  <p className="text-sm font-medium text-blue-700">{m.fg.produced.kg.toFixed(1)} kg</p>
                </div>
                <div className="p-4 bg-orange-50/30">
                  <p className="text-xs text-orange-600 uppercase tracking-wider mb-2 font-bold flex items-center gap-1"><Truck className="w-3 h-3"/> 3. Sales/Disp (-)</p>
                  <p className="text-2xl font-bold text-stone-800">₹{m.fg.sales.val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                  <p className="text-sm font-medium text-orange-700">{m.fg.sales.kg.toFixed(1)} kg</p>
                </div>
                <div className="p-4 bg-green-50/30">
                  <p className="text-xs text-green-700 uppercase tracking-wider mb-2 font-bold">4. Closing Stock</p>
                  <p className="text-3xl font-bold text-green-700">₹{m.fg.closing.val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                  <p className="text-sm font-bold text-stone-600">{m.fg.closing.kg.toFixed(1)} kg</p>
                </div>
              </div>
            </div>
          );
        })
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

  const filteredItems = items.filter(i => i.companyId === selectedCompany);
  const currentItemObj = items.find(i => i.id === selectedItem);
  const isPPC = currentItemObj?.itemType === 'PPC' || currentItemObj?.Item_Type === 'PPC';

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Material Calculator</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200">
          <form onSubmit={handleCalculate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Select Client Company</label>
              <select className="w-full p-2 border border-stone-300 rounded-md bg-stone-50" value={selectedCompany} onChange={(e) => { setSelectedCompany(e.target.value); setSelectedItem(''); setResult(null); }} required>
                <option value="">-- Choose Company --</option>
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
    </div>
  );
}

// --- COSTING VIEW ---
function CostingView() {
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
    itemType: 'Box',
    size: '',
    plyCount: 3,
    conversionCost: 0,
    pocketsLength: 3,
    pocketsWidth: 2,
    plyDetails: generatePlies(3)
  }]);

  const addPart = () => {
    setParts([...parts, {
      id: Date.now(), partName: `Part ${parts.length + 1}`, qtyPerSet: 1, itemType: 'Partition', size: '', plyCount: 3, conversionCost: 0, pocketsLength: 3, pocketsWidth: 2, plyDetails: generatePlies(3)
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
    const qty = parseInt(part.qtyPerSet) || 1;

    return { 
      ...part, boardAreaSqM, uiDetails, singleWeightKg, singleMaterialCost, singleTotalCost,
      totalWeightKg: singleWeightKg * qty, totalCost: singleTotalCost * qty
    };
  });

  const grandTotalCost = calculatedParts.reduce((sum, p) => sum + p.totalCost, 0);
  const grandTotalWeight = calculatedParts.reduce((sum, p) => sum + p.totalWeightKg, 0);
  const blendedRatePerKg = grandTotalWeight > 0 ? (grandTotalCost / grandTotalWeight) : 0;

  return (
    <div className="max-w-7xl mx-auto pb-12 flex flex-col xl:flex-row gap-8 items-start">
      
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
            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 border-b border-stone-100">
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
                    <label className="block text-xs font-medium text-stone-500 mb-1">Conversion/Mfg Cost (Per 1 Piece)</label>
                    <input type="number" step="0.01" className="w-full p-2 border border-stone-300 rounded-md bg-white font-mono" value={part.conversionCost} onChange={e => handlePartChange(part.id, 'conversionCost', e.target.value)} />
                  </div>
               </div>

               {/* DYNAMIC METRICS READOUT */}
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
                       <p className="flex justify-between text-sm font-bold"><span className="text-stone-700">Single Piece Wt:</span> <span className="font-mono text-orange-700">{part.singleWeightKg.toFixed(3)} kg</span></p>
                    </div>
                  ) : (
                    <p className="text-stone-400 text-sm text-center italic">Enter dimensions to calculate geometry.</p>
                  )}
               </div>
            </div>

            {/* PLY TABLE */}
            <div className="overflow-x-auto p-4">
              <table className="w-full text-left">
                <thead className="text-stone-400 text-xs uppercase tracking-wider">
                  <tr><th className="px-2 pb-2">Layer</th><th className="px-2 pb-2">GSM</th><th className="px-2 pb-2">BF</th><th className="px-2 pb-2">Flute Factor</th><th className="px-2 pb-2">Rate/KG</th><th className="px-2 pb-2 text-right">Cost (1 pc)</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {part.plyDetails.map((ply, idx) => {
                    const plyCost = (part.boardAreaSqM * ply.gsm * ply.factor / 1000) * ply.rate;
                    return (
                      <tr key={ply.id} className="hover:bg-stone-50">
                        <td className="p-2 text-sm font-medium text-stone-600">{ply.name}</td>
                        <td className="p-1"><input type="number" className="w-16 p-1.5 border rounded text-xs" value={ply.gsm} onChange={e => handlePlyChange(part.id, idx, 'gsm', e.target.value)} /></td>
                        <td className="p-1"><input type="number" className="w-16 p-1.5 border rounded text-xs" value={ply.bf} onChange={e => handlePlyChange(part.id, idx, 'bf', e.target.value)} /></td>
                        <td className="p-1"><input type="number" step="0.1" className="w-16 p-1.5 border rounded text-xs" value={ply.factor} onChange={e => handlePlyChange(part.id, idx, 'factor', e.target.value)} /></td>
                        <td className="p-1"><input type="number" className="w-16 p-1.5 border rounded text-xs" value={ply.rate} onChange={e => handlePlyChange(part.id, idx, 'rate', e.target.value)} /></td>
                        <td className="p-2 text-right text-sm font-mono font-bold text-stone-800">{plyCost > 0 ? `₹${plyCost.toFixed(2)}` : '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* PART TOTAL FOOTER */}
            <div className="bg-stone-800 text-white p-4 flex flex-wrap justify-between items-center">
               <div className="text-sm">
                  <span className="text-stone-400 mr-2">Single Piece Cost:</span> 
                  <span className="font-mono font-bold text-green-400">₹{part.singleTotalCost.toFixed(2)}</span>
               </div>
               <div className="text-base font-bold">
                  <span className="text-stone-400 mr-2 uppercase text-xs tracking-wider">Subtotal ({part.qtyPerSet}x):</span> 
                  <span className="font-mono text-xl">₹{part.totalCost.toFixed(2)}</span>
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
                    <li key={p.id} className="flex justify-between items-center text-sm">
                       <span className="text-stone-300 font-medium">
                         <span className="text-stone-500 mr-2">{p.qtyPerSet}x</span> {p.partName || `Part ${i+1}`}
                       </span>
                       <span className="font-mono font-bold text-white">₹{p.totalCost.toFixed(2)}</span>
                    </li>
                 ))}
               </ul>

               <div className="bg-stone-800 p-4 rounded-lg border border-stone-700">
                  <p className="flex justify-between text-sm mb-1"><span className="text-stone-400">Total Set Weight:</span> <span className="font-mono text-white font-bold">{grandTotalWeight.toFixed(3)} kg</span></p>
                  <p className="flex justify-between text-sm"><span className="text-stone-400">Total Pieces:</span> <span className="font-mono text-white">{calculatedParts.reduce((s, p) => s + parseInt(p.qtyPerSet||0), 0)}</span></p>
               </div>
            </div>
         </div>
      </div>

    </div>
  );
}

// --- WASTAGE VIEW (LINKED TO PRODUCTION) ---
function WastageView({ wastageLogs, orders, companies, production, addLog, role, getColRef, getDocRef, currentUser }) {
  const allowedCompanyId = currentUser?.role === 'admin' ? 'all' : (currentUser?.companyId || 'all');
  const visibleOrders = allowedCompanyId === 'all' ? orders : orders.filter(o => o.companyId === allowedCompanyId);

  const [newLog, setNewLog] = useState({ date: new Date().toISOString().split('T')[0], orderId: '', companyId: '', totalReelsKg: '', productionKg: '', paperWastage: '', sheetWastage: '', corePipe: '', balanceReel: '', gumUsed: '', gumPrice: '' });

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
    await addDoc(getColRef('wastage'), { ...newLog, calculatedNetPaper: netPaperConsumed.toFixed(2), goodProductionKg: goodProductionKg.toFixed(2), totalWastageKg: totalWastageKg.toFixed(2), calculatedWastagePercent: wastagePercent.toFixed(2), totalGumCost: totalGumCost.toFixed(2), gumCostPerKgPaper: gumCostPerKgPaper.toFixed(2) });
    addLog(`Added Wastage & Gum record for ${newLog.date}`);
    setNewLog({ date: new Date().toISOString().split('T')[0], orderId: '', companyId: '', totalReelsKg: '', productionKg: '', paperWastage: '', sheetWastage: '', corePipe: '', balanceReel: '', gumUsed: '', gumPrice: '' });
  };

  const handleDelete = async (id, date) => {
    if(window.confirm(`Delete wastage log for ${date}?`)) {
      await deleteDoc(getDocRef('wastage', id));
      addLog(`Deleted wastage log for ${date}`);
    }
  };

  const visibleWastage = allowedCompanyId === 'all' ? wastageLogs : wastageLogs.filter(w => w.companyId === allowedCompanyId || !w.companyId);

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Wastage & Gum Calculator (Order-Wise)</h2>
        <button onClick={() => downloadCSV(visibleWastage, 'wastage_logs')} className="flex items-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-300 font-medium text-sm transition"><Download className="w-4 h-4" /> Export to Excel</button>
      </div>

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
// --- INVENTORY VIEW ---
function InventoryView({ inventory = [], production = [], addLog, role, getColRef, getDocRef, currentUser, companies = [] }) {
  const allowedCompanyId = currentUser?.role === 'admin' ? 'all' : (currentUser?.companyId || 'all');
  const visibleCompanies = allowedCompanyId === 'all' ? companies : companies.filter(c => c.id === allowedCompanyId);

  const [activeSubTab, setActiveSubTab] = useState('Paper'); 
  const [isScanning, setIsScanning] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [commonData, setCommonData] = useState({ date: new Date().toISOString().split('T')[0], companyId: allowedCompanyId !== 'all' ? allowedCompanyId : '', millName: '', invoiceNo: '', vehicleNo: '' });
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
      await updateDoc(getDocRef('inventory', editingId), { ...commonData, ...singleReel, category: 'Paper' });
      if(addLog) addLog(`Updated inventory reel: ${singleReel.reelNo}`);
      setEditingId(null);
      setReelsInput([{...emptyReel}]);
    } else {
      const batch = writeBatch(db);
      let count = 0;
      reelsInput.forEach(reel => {
        if (!reel.reelNo) return;
        const newDocRef = doc(getColRef('inventory'));
        batch.set(newDocRef, { ...commonData, ...reel, category: 'Paper' });
        count++;
      });
      await batch.commit();
      if(addLog) addLog(`Added ${count} inventory reels from ${commonData.millName}`);
      setReelsInput([{...emptyReel}]); 
    }
  };

  const handleEdit = (reel) => { 
    setEditingId(reel.id); 
    setCommonData({ date: reel.date || '', companyId: reel.companyId || '', millName: reel.millName || '', invoiceNo: reel.invoiceNo || '', vehicleNo: reel.vehicleNo || '' });
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
    setCommonData({ date: new Date().toISOString().split('T')[0], companyId: allowedCompanyId !== 'all' ? allowedCompanyId : '', millName: '', invoiceNo: '', vehicleNo: '' });
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
  
  const balances = {};
  const usageStats = {}; 
  paperInventoryData.forEach(reel => {
    const rNo = String(reel.reelNo || '').trim().toLowerCase();
    const initialIssued = parseFloat(reel.initialIssuedQty || 0);
    balances[rNo] = parseFloat(reel.receivedQty || 0) - initialIssued;
    usageStats[rNo] = { issued: 0, log: [] };
    if (initialIssued > 0) {
        usageStats[rNo].log.push({ date: reel.date || 'Unknown', usedFor: 'Initial / CSV Import', kg: initialIssued.toFixed(1) });
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
         const deduct = parseFloat(cr.weight || 0);
         if (deduct > 0) {
           balances[rNo] = (balances[rNo] || 0) - deduct;
           if (!usageStats[rNo]) usageStats[rNo] = { issued: 0, log: [] };
           usageStats[rNo].issued += deduct;
           usageStats[rNo].log.push({ date: p.date || 'Unknown', usedFor: p.usedForItem || p.paperUsedFor || 'Unknown', kg: deduct.toFixed(1) });
         }
      });
    } else {
      if (!p.reelNos || !p.useKg) return;
      const pReels = String(p.reelNos || '').split(',').map(r => r.trim().toLowerCase()).filter(r => r);
      if (pReels.length === 0) return;
      let remainingUse = parseFloat(p.useKg || 0);
      pReels.forEach((rNo, index) => {
        if (remainingUse <= 0) return;
        let deduct = 0;
        if (index === pReels.length - 1) { deduct = remainingUse; } 
        else {
          const available = balances[rNo] || 0;
          deduct = Math.min(Math.max(available, 0), remainingUse);
        }
        if (deduct > 0) {
          balances[rNo] = (balances[rNo] || 0) - deduct;
          if (!usageStats[rNo]) usageStats[rNo] = { issued: 0, log: [] };
          usageStats[rNo].issued += deduct;
          usageStats[rNo].log.push({ date: p.date || 'Unknown', usedFor: p.usedForItem || p.paperUsedFor || 'Unknown', kg: deduct.toFixed(1) });
          remainingUse -= deduct;
        }
      });
    }
  });

  const inventoryWithUsage = paperInventoryData.map(reel => {
    const rNo = String(reel.reelNo || '').trim().toLowerCase();
    const stats = usageStats[rNo] || { issued: 0, log: [] };
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
    if (filters.gsm && String(reel.gsm || '') !== String(filters.gsm)) return false;
    if (filters.bf && String(reel.bf || '') !== String(filters.bf)) return false;
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
                              category: 'Paper'
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 mb-6">
            <h3 className="font-bold mb-4 flex items-center gap-2">{editingId ? 'Edit Reel Entry' : 'Receive New Invoice'}</h3>
            <form onSubmit={handleAddOrUpdate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end bg-stone-50 p-4 rounded-lg border border-stone-200">
                <div className="col-span-1"><label className="block text-xs font-bold text-stone-700 mb-1">Date Received</label><input required type="date" className="w-full p-2 border rounded" value={commonData.date} onChange={e => setCommonData({...commonData, date: e.target.value})} /></div>
                <div className="col-span-1"><label className="block text-xs font-bold text-stone-700 mb-1">Company</label><select required className="w-full p-2 border rounded" value={commonData.companyId} onChange={e => setCommonData({...commonData, companyId: e.target.value})} disabled={allowedCompanyId !== 'all'}><option value="">Select Company...</option>{[...visibleCompanies].sort((a,b) => (a?.name || '').localeCompare(b?.name || '')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div className="col-span-1"><label className="block text-xs font-bold text-stone-700 mb-1">Mill / Party Name</label><input required type="text" className="w-full p-2 border rounded" value={commonData.millName} onChange={e => setCommonData({...commonData, millName: e.target.value})} /></div>
                <div className="col-span-1"><label className="block text-xs font-bold text-stone-700 mb-1">Invoice No.</label><input type="text" className="w-full p-2 border rounded" value={commonData.invoiceNo} onChange={e => setCommonData({...commonData, invoiceNo: e.target.value})} /></div>
                <div className="col-span-1"><label className="block text-xs font-bold text-stone-700 mb-1">Vehicle No.</label><input type="text" className="w-full p-2 border rounded" value={commonData.vehicleNo} onChange={e => setCommonData({...commonData, vehicleNo: e.target.value})} /></div>
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

          <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-200 mb-6 flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2 text-stone-500 mr-2">Filter:</div>
            {allowedCompanyId === 'all' && (
               <input type="text" placeholder="Company..." className="p-2 border rounded text-sm w-32 focus:outline-none focus:ring-2 focus:ring-stone-800" value={filters.company} onChange={e => setFilters({...filters, company: e.target.value})} />
            )}
            <input type="text" placeholder="Mill / Party" className="p-2 border rounded text-sm w-28 focus:outline-none focus:ring-2 focus:ring-stone-800" value={filters.millName} onChange={e => setFilters({...filters, millName: e.target.value})} />
            <input type="text" placeholder="Reel No" className="p-2 border rounded text-sm w-24 focus:outline-none focus:ring-2 focus:ring-stone-800" value={filters.searchReel} onChange={e => setFilters({...filters, searchReel: e.target.value})} />
            <input type="text" placeholder="Size" className="p-2 border rounded text-sm w-20 focus:outline-none focus:ring-2 focus:ring-stone-800" value={filters.size} onChange={e => setFilters({...filters, size: e.target.value})} />
            <input type="text" placeholder="GSM" className="p-2 border rounded text-sm w-16 focus:outline-none focus:ring-2 focus:ring-stone-800" value={filters.gsm} onChange={e => setFilters({...filters, gsm: e.target.value})} />
            <input type="text" placeholder="BF" className="p-2 border rounded text-sm w-16 focus:outline-none focus:ring-2 focus:ring-stone-800" value={filters.bf} onChange={e => setFilters({...filters, bf: e.target.value})} />
            <select className="p-2 border rounded text-sm" value={filters.colour} onChange={e => setFilters({...filters, colour: e.target.value})}><option value="">All Colours</option><option value="Kraft">Kraft</option><option value="Golden">Golden</option><option value="White">White</option></select>
            <select className="p-2 border rounded text-sm font-bold bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-800" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}><option value="All">All Statuses</option><option value="Available">Only Available (Balance &gt; 0)</option><option value="Used">Used / Empty (Balance = 0)</option></select>
            <button onClick={() => setFilters({company: '', millName: '', searchReel: '', size: '', gsm: '', bf: '', colour: '', status: 'All'})} className="text-xs text-blue-500 hover:text-blue-700 underline ml-2 transition">Clear</button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden overflow-x-auto">
            <table className="w-full text-left min-w-[1200px]">
              <thead className="bg-stone-100 text-stone-600 text-sm">
                <tr>
                  {role === 'admin' && <th className="p-4 w-10"><input type="checkbox" onChange={toggleAll} checked={selectedIds.size === filteredInventory.length && filteredInventory.length > 0}/></th>}
                  <th className="p-4">Company</th>
                  <th className="p-4">Date / Ref</th>
                  <th className="p-4">Mill / Party</th>
                  <th className="p-4">Reel No</th>
                  <th className="p-4">Specs</th>
                  <th className="p-4">Received</th>
                  <th className="p-4 bg-orange-50 text-orange-800">Issued (Auto)</th>
                  <th className="p-4 bg-green-50 text-green-800">Balance</th>
                  <th className="p-4">Rate & Value (₹)</th>
                  <th className="p-4">Used For (Production Link)</th>
                  {role === 'admin' && <th className="p-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 text-sm">
                {filteredInventory.length === 0 && <tr><td colSpan="12" className="p-4 text-center text-stone-500">No inventory records found.</td></tr>}
                {[...filteredInventory].sort((a,b) => {
                   const dateA = new Date(a.date || 0).getTime();
                   const dateB = new Date(b.date || 0).getTime();
                   return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
                }).map(reel => {
                  const isAvailable = (reel.balanceQty || 0) > 0;
                  const compName = companies.find(c => c.id === reel.companyId)?.name || 'Unassigned';
                  return (
                  <tr key={reel.id} className={`hover:bg-stone-50 ${!isAvailable ? 'opacity-60 bg-stone-50' : ''}`}>
                    {role === 'admin' && <td className="p-4"><input type="checkbox" checked={selectedIds.has(reel.id)} onChange={() => toggleSelection(reel.id)} /></td>}
                    <td className="p-4 font-bold text-stone-900">{compName}</td>
                    <td className="p-4"><div className="font-medium">{reel.date || '-'}</div><div className="text-[10px] text-stone-400">Veh: {reel.vehicleNo || '-'}</div></td>
                    <td className="p-4 font-medium text-stone-800">{reel.millName || '-'}</td>
                    <td className="p-4"><span className={`font-mono font-bold text-lg ${isAvailable ? 'text-blue-700' : 'text-stone-500'}`}>{reel.reelNo || '-'}</span>{!isAvailable && <span className="ml-2 text-[10px] bg-stone-300 px-1 py-0.5 rounded text-stone-700 font-bold">EMPTY</span>}</td>
                    <td className="p-4 text-stone-600"><div>{reel.size || '-'}</div><div className="text-xs">{reel.gsm || '-'} GSM | {reel.bf || '-'} BF</div><div className="text-xs">{reel.colour || '-'}</div></td>
                    <td className="p-4 font-semibold">{reel.receivedQty || 0} kg</td>
                    <td className="p-4 font-semibold text-orange-600 bg-orange-50/30">{(reel.issuedQty || 0) > 0 ? (reel.issuedQty || 0).toFixed(1) : '-'} kg</td>
                    <td className="p-4 bg-green-50/30"><span className={`font-bold text-lg ${isAvailable ? 'text-green-700' : 'text-stone-500'}`}>{(reel.balanceQty || 0).toFixed(1)} kg</span></td>
                    <td className="p-4"><div className="text-xs text-stone-500 mb-1">Rate: ₹{parseFloat(reel.ratePerKg || 0).toFixed(2)}/kg</div><div className="font-bold text-stone-800 text-base">₹{parseFloat(reel.value || 0).toFixed(2)}</div></td>
                    <td className="p-4">{(reel.usageLog || []).length === 0 ? <span className="text-stone-400 italic text-xs">Not used yet</span> : (<ul className="text-xs space-y-1">{(reel.usageLog || []).map((log, idx) => (<li key={idx} className="flex gap-2"><span className="text-stone-400">{log.date || '-'}</span><span className="font-medium text-stone-700">{log.usedFor || '-'}</span><span className="text-orange-600 font-mono">({log.kg || 0}kg)</span></li>))}</ul>)}</td>
                    {role === 'admin' && <td className="p-4 text-right whitespace-nowrap"><button onClick={() => handleEdit(reel)} className="text-blue-500 hover:text-blue-700 mr-3" title="Edit">Edit</button><button onClick={() => handleDelete(reel.id, reel.reelNo)} className="text-red-500 hover:text-red-700" title="Delete">Delete</button></td>}
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
function ProductionView({ inventory, production, orders, items, companies, addLog, role, getColRef, getDocRef, currentUser }) {
  const allowedCompanyId = currentUser?.role === 'admin' ? 'all' : (currentUser?.companyId || 'all');
  const visibleCompanies = allowedCompanyId === 'all' ? companies : companies.filter(c => c.id === allowedCompanyId);
  const visibleItems = allowedCompanyId === 'all' ? items : items.filter(i => i.companyId === allowedCompanyId);
  const visibleProduction = allowedCompanyId === 'all' ? production : production.filter(p => p.companyId === allowedCompanyId);
  const visibleOrders = allowedCompanyId === 'all' ? orders : orders.filter(o => o.companyId === allowedCompanyId);

  const [editingId, setEditingId] = useState(null);
  const [suggestedKg, setSuggestedKg] = useState(null);
  
  // New State for Granular Reel Entry
  const [consumedReels, setConsumedReels] = useState([{ reelNo: '', weight: '' }]);
  
  const [newRecord, setNewRecord] = useState({ 
    date: new Date().toISOString().split('T')[0], orderId: '', companyId: allowedCompanyId !== 'all' ? allowedCompanyId : '', millName: '', paperUsedFor: 'Paper', usedForItem: '', 
    linerQty: '', wasteSheetsKg: '', numberOfUps: '1', commonUps: '', smallUps: '' 
  });

  const availableMills = [...new Set(inventory.filter(i => (!newRecord.companyId || i.companyId === newRecord.companyId)).map(i => i.millName).filter(Boolean))];

  // ==========================================
  // LIVE MATH ENGINE: Auto-Suggest Use KG
  // ==========================================
  useEffect(() => {
    if (!newRecord.usedForItem) {
      setSuggestedKg(null);
      return;
    }

    const item = items.find(i => i.name === newRecord.usedForItem || i.Item_Name === newRecord.usedForItem);
    if (!item) return;

    const sizeStr = String(item.size || item.Size_mm || '0x0x0').toLowerCase().replace(/\*/g, 'x');
    const dims = sizeStr.split('x').map(s => parseFloat(s.trim()) || 0);
    const L = dims[0] || 0;
    const W = dims[1] || 0;
    const H = dims[2] || 0;

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
          const baseC = parseInt(ord.commonUps || 1);
          const baseS = parseInt(ord.smallUps || 1);
          const pUpsC = parseInt(ord.plannedUpsCommon || 1);
          const pUpsS = parseInt(ord.plannedUpsSmall || 1);

          const cNeeded = cPerSet * orderQty;
          const sNeeded = sPerSet * orderQty;
          const cPiecesPerCSheet = baseC * pUpsC;
          const sPiecesPerCSheet = baseC * pUpsC;
          const sPiecesPerSSheet = baseS * pUpsS * 2;

          const cSheetsNeeded = Math.ceil(cNeeded / cPiecesPerCSheet);
          const sAcquired = cSheetsNeeded * sPiecesPerCSheet;
          const remainingS = Math.max(0, sNeeded - sAcquired);
          const sSheetsNeeded = Math.ceil(remainingS / sPiecesPerSSheet);

          targetSheets = cSheetsNeeded + sSheetsNeeded;

          const cWidth = H * baseC;
          const cLength = ((L + W) * pUpsC) + 10;
          const sWidth = cWidth;
          const sLength = (W * 2 * pUpsS) + 10;

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
      const isFlute = newRecord.paperUsedFor === 'Paper';
      const factor = isFlute ? 1.4 : 1.0;

      const expectedKg = totalAreaSqM * (gsm / 1000) * factor;
      setSuggestedKg(expectedKg.toFixed(1));
    } else {
      setSuggestedKg(null);
    }
  }, [newRecord.usedForItem, newRecord.orderId, newRecord.numberOfUps, newRecord.paperUsedFor, newRecord.linerQty, items, orders]);

  const handleOrderLink = (orderId) => {
    if (!orderId) {
      setNewRecord({...newRecord, orderId: ''});
      return;
    }
    const ord = orders.find(o => o.id === orderId);
    if (ord) {
      setNewRecord({ ...newRecord, orderId: orderId, companyId: ord.companyId, usedForItem: ord.itemName || ord.Item_Name, numberOfUps: ord.plannedUps || '1', commonUps: ord.commonUps || '', smallUps: ord.smallUps || '' });
    }
  };

  const handleAddOrUpdate = async (e) => {
    e.preventDefault();
    
    // Auto-calculate the total and generate the backward-compatible string
    const totalKg = consumedReels.reduce((sum, r) => sum + (parseFloat(r.weight) || 0), 0);
    const reelNosStr = consumedReels.map(r => r.reelNo.toUpperCase()).filter(Boolean).join(', ');
    
    const finalRecord = { 
      ...newRecord, 
      consumedReels: consumedReels, 
      useKg: totalKg.toFixed(1), 
      reelNos: reelNosStr 
    };

    if (editingId) {
      await updateDoc(getDocRef('production', editingId), finalRecord);
      addLog(`Updated production record: Reels ${reelNosStr}`);
      setEditingId(null);
    } else {
      await addDoc(getColRef('production'), finalRecord);
      addLog(`Added production record: Reels ${reelNosStr}`);
    }
    
    setNewRecord({ date: new Date().toISOString().split('T')[0], orderId: '', companyId: allowedCompanyId !== 'all' ? allowedCompanyId : '', millName: '', paperUsedFor: 'Paper', usedForItem: '', linerQty: '', wasteSheetsKg: '', numberOfUps: '1', commonUps: '', smallUps: '' });
    setConsumedReels([{ reelNo: '', weight: '' }]);
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    setNewRecord(record);
    
    // Load granular reels if they exist, otherwise adapt the old sequential format
    if (record.consumedReels && record.consumedReels.length > 0) {
      setConsumedReels(record.consumedReels);
    } else if (record.reelNos) {
      setConsumedReels([{ reelNo: record.reelNos, weight: record.useKg }]);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNewRecord({ date: new Date().toISOString().split('T')[0], orderId: '', companyId: allowedCompanyId !== 'all' ? allowedCompanyId : '', millName: '', paperUsedFor: 'Paper', usedForItem: '', linerQty: '', wasteSheetsKg: '', numberOfUps: '1', commonUps: '', smallUps: '' });
    setConsumedReels([{ reelNo: '', weight: '' }]);
  };

  const handleDelete = async (id, reelNos) => {
    if(window.confirm(`Delete production record for Reels ${reelNos}?`)) {
      await deleteDoc(getDocRef('production', id));
      addLog(`Deleted production record: Reels ${reelNos}`);
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
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Production Log</h2>
        <div className="flex gap-2">
          <button onClick={handleExport} className="flex items-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-300 font-medium text-sm transition">
            Export to Excel
          </button>
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 mb-8">
        <h3 className="font-bold mb-4">{editingId ? 'Edit Production Record' : 'Add Production Record'}</h3>
        
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
            <input required list="mill-options" className="w-full p-2 border rounded bg-white" placeholder="Type or select mill..." value={newRecord.millName} onChange={e => setNewRecord({...newRecord, millName: e.target.value})} />
            <datalist id="mill-options">
               {availableMills.map((m, i) => <option key={i} value={m} />)}
            </datalist>
          </div>

          <div className="col-span-1 md:col-span-2">
            <label className="block text-xs font-bold text-stone-700 mb-1">Paper Used For</label>
            <select required className="w-full p-2 border border-stone-400 bg-stone-50 rounded font-medium" value={newRecord.paperUsedFor} onChange={e => setNewRecord({...newRecord, paperUsedFor: e.target.value})}>
              <option value="Paper">Paper (1-Ply / Fluting)</option>
              <option value="Liner">Liner (2-Ply / Flat)</option>
              <option value="Board">Board (Combined)</option>
            </select>
          </div>

          <div className="col-span-1 md:col-span-4"><label className="block text-xs text-stone-500 mb-1">Used For Item</label><select required className="w-full p-2 border rounded" value={newRecord.usedForItem} onChange={e => setNewRecord({...newRecord, usedForItem: e.target.value})} disabled={!!newRecord.orderId}><option value="">-- Select Item --</option>{[...visibleItems].filter(i => i.companyId === newRecord.companyId || !newRecord.companyId).sort((a,b) => (a?.name || a?.Item_Name || '').localeCompare(b?.name || b?.Item_Name || '')).map(i => <option key={i.id} value={i.name || i.Item_Name}>{i.name || i.Item_Name}</option>)}</select></div>
          
          <div className="col-span-1 md:col-span-6 bg-stone-50 p-4 rounded-lg border border-stone-200 shadow-inner">
            <div className="flex justify-between items-center mb-3">
              <label className="text-xs font-bold text-stone-700 uppercase tracking-wider">Granular Reel Consumption</label>
              {suggestedKg && <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-1 rounded font-bold shadow-sm">Target: ~{suggestedKg} kg</span>}
            </div>
            {consumedReels.map((reel, idx) => (
              <div key={idx} className="flex flex-wrap md:flex-nowrap gap-2 items-end mb-2">
                <div className="flex-1">
                  <label className="block text-[10px] text-stone-500 mb-1">Reel No.</label>
                  <input required type="text" className="w-full p-2 border border-stone-300 rounded text-sm uppercase bg-white" value={reel.reelNo} onChange={e => { const upd = [...consumedReels]; upd[idx].reelNo = e.target.value; setConsumedReels(upd); }} />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] text-stone-500 mb-1">KG Consumed</label>
                  <input required type="number" step="0.1" className="w-full p-2 border border-stone-300 rounded text-sm bg-orange-50" value={reel.weight} onChange={e => { const upd = [...consumedReels]; upd[idx].weight = e.target.value; setConsumedReels(upd); }} />
                </div>
                {consumedReels.length > 1 && (
                  <button type="button" onClick={() => setConsumedReels(consumedReels.filter((_, i) => i !== idx))} className="p-2 bg-red-100 text-red-600 hover:bg-red-200 rounded mb-0.5"><Trash2 className="w-4 h-4"/></button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setConsumedReels([...consumedReels, { reelNo: '', weight: '' }])} className="text-[10px] font-bold text-stone-600 bg-stone-200 px-3 py-1.5 rounded hover:bg-stone-300 mt-1">+ Add Another Reel</button>
            
            <div className="mt-4 pt-3 border-t border-stone-200 flex justify-end items-center gap-4">
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Total Consumed:</span>
              <span className="text-xl font-bold text-orange-600">{consumedReels.reduce((sum, r) => sum + (parseFloat(r.weight) || 0), 0).toFixed(1)} KG</span>
            </div>
          </div>

          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Good Qty (Sheets)</label><input type="number" step="0.1" className="w-full p-2 border rounded bg-blue-50" value={newRecord.linerQty} onChange={e => setNewRecord({...newRecord, linerQty: e.target.value})} /></div>
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

      {(() => {
        const itemTotals = visibleProduction.reduce((acc, record) => {
          if (record.usedForItem) acc[record.usedForItem] = (acc[record.usedForItem] || 0) + (parseFloat(record.useKg) || 0);
          return acc;
        }, {});
        if (Object.keys(itemTotals).length === 0) return null;
        return (
          <div className="bg-white rounded-xl shadow-sm border border-stone-200 mb-8 overflow-hidden">
            <div className="bg-stone-100 p-4 border-b border-stone-200"><h3 className="font-bold text-stone-800">Total Paper Usage by Item</h3></div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {Object.entries(itemTotals).sort((a,b) => b[1] - a[1]).map(([itemName, totalKg]) => (
                <div key={itemName} className="bg-stone-50 p-3 rounded-lg border border-stone-200 text-center"><p className="text-xs text-stone-500 truncate mb-1" title={itemName}>{itemName}</p><p className="font-bold text-lg text-stone-900">{totalKg.toFixed(1)} <span className="text-sm font-normal text-stone-500">KG</span></p></div>
              ))}
            </div>
          </div>
        );
      })()}

      {sortedCompanyIds.length === 0 && (
        <div className="bg-white p-8 rounded-xl shadow-sm border border-stone-200 text-center text-stone-500">
          No production records found.
        </div>
      )}

      {sortedCompanyIds.map(compId => {
        const compName = compId === 'unassigned' ? 'Unassigned / Unknown Client' : (companies.find(c => c.id === compId)?.name || 'Unknown Company');
        const records = groupedProduction[compId];

        return (
          <div key={compId} className="mb-8">
            <h4 className="text-xl font-bold text-stone-800 mb-3 pl-3 border-l-4 border-stone-800">{compName}</h4>
            <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden overflow-x-auto">
              <table className="w-full text-left min-w-[1100px]">
                <thead className="bg-stone-100 text-stone-600 text-sm">
                  <tr>
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
                  {[...records].sort((a,b) => {
                     const dateA = new Date(a.date).getTime();
                     const dateB = new Date(b.date).getTime();
                     return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
                  }).map(record => {
                    const itemObj = items.find(i => (i.name === record.usedForItem) || (i.Item_Name === record.usedForItem));
                    const isRecordPpc = itemObj?.itemType === 'PPC' || itemObj?.Item_Type === 'PPC';

                    let upsDisplay = `${record.numberOfUps || 1} Ups`;
                    if (isRecordPpc) upsDisplay = `Ups: ${record.commonUps || '-'}C / ${record.smallUps || '-'}S`;

                    return (
                    <tr key={record.id} className="hover:bg-stone-50">
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
                        <button onClick={() => handleEdit(record)} className="text-blue-500 hover:text-blue-700 mr-3" title="Edit">Edit</button>
                        {role === 'admin' && <button onClick={() => handleDelete(record.id, record.reelNos || record.reelNo)} className="text-red-500 hover:text-red-700" title="Delete">Delete</button>}
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
// --- ORDERS VIEW ---
function OrdersView({ orders, production, items, companies, addLog, role, getColRef, getDocRef, currentUser }) {
  const allowedCompanyId = currentUser?.role === 'admin' ? 'all' : (currentUser?.companyId || 'all');
  const visibleCompanies = allowedCompanyId === 'all' ? companies : companies.filter(c => c.id === allowedCompanyId);
  const visibleItems = allowedCompanyId === 'all' ? items : items.filter(i => i.companyId === allowedCompanyId);
  const visibleOrders = allowedCompanyId === 'all' ? orders : orders.filter(o => o.companyId === allowedCompanyId);

  const [newOrder, setNewOrder] = useState({
    orderDate: new Date().toISOString().split('T')[0], companyId: allowedCompanyId !== 'all' ? allowedCompanyId : '', itemId: '', orderQty: '', plannedUps: '1', deliveryDate: '', status: 'Pending', rate: '', dispatchedQty: 0,
    commonPerSet: '', smallPerSet: '', commonUps: '', smallUps: '', plannedUpsCommon: '', plannedUpsSmall: '',
    openingFgQty: '' // <-- Added for Legacy Stock
  });

  const handleAdd = async (e) => {
    e.preventDefault();
    const item = items.find(i => i.id === newOrder.itemId);
    const orderData = { ...newOrder, itemName: item?.name || item?.Item_Name || 'Unknown Item' };
    
    if (item?.itemType !== 'PPC' && item?.Item_Type !== 'PPC') {
        delete orderData.commonPerSet;
        delete orderData.smallPerSet;
        delete orderData.commonUps;
        delete orderData.smallUps;
        delete orderData.plannedUpsCommon;
        delete orderData.plannedUpsSmall;
    }

    // Auto-complete status if the legacy stock fulfills the order
    if (parseInt(orderData.openingFgQty || 0) >= parseInt(orderData.orderQty || 0)) {
        orderData.status = 'Completed';
    }

    await addDoc(getColRef('orders'), orderData);
    addLog(`Added new order for ${newOrder.orderQty}x ${item?.name || item?.Item_Name || 'Unknown Item'}`);
    setNewOrder({ orderDate: new Date().toISOString().split('T')[0], companyId: allowedCompanyId !== 'all' ? allowedCompanyId : '', itemId: '', orderQty: '', plannedUps: '1', deliveryDate: '', status: 'Pending', rate: '', dispatchedQty: 0, commonPerSet: '', smallPerSet: '', commonUps: '', smallUps: '', plannedUpsCommon: '', plannedUpsSmall: '', openingFgQty: '' });
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
      Order_Date: order.orderDate, Company: companies.find(c => c.id === order.companyId)?.name || 'Unknown', Item_Ordered: order.itemName || order.Item_Name, Target_Qty: order.orderQty, Legacy_Stock_Loaded: order.openingFgQty || 0, Planned_Ups: order.plannedUps, Delivery_Date: order.deliveryDate, Status: order.status, Rate: order.rate, Total_Value: (parseFloat(order.orderQty||0) * parseFloat(order.rate||0)).toFixed(2)
    }));
    downloadCSV(exportData, 'orders');
  };

  const selectedItemObj = items.find(i => i.id === newOrder.itemId);
  const isPPC = selectedItemObj?.itemType === 'PPC' || selectedItemObj?.Item_Type === 'PPC';

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-2xl font-bold">Order Management</h2>
        <div className="flex gap-2">
          <button onClick={handleExport} className="flex items-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-300 font-medium text-sm transition">
            Export
          </button>
        </div>
      </div>
      <p className="text-sm font-bold text-blue-600 mb-6 bg-blue-50 inline-block px-3 py-1 rounded">Database Link: Showing {visibleOrders.length} total records downloaded</p>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 mb-8">
        <h3 className="font-bold mb-4">Add New Order</h3>
        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Order Date</label><input required type="date" className="w-full p-2 border rounded" value={newOrder.orderDate} onChange={e => setNewOrder({...newOrder, orderDate: e.target.value})} /></div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Client Company</label><select required className="w-full p-2 border rounded" value={newOrder.companyId} onChange={e => setNewOrder({...newOrder, companyId: e.target.value, itemId: ''})}><option value="">-- Select Company --</option>{[...visibleCompanies].sort((a,b) => (a?.name || '').localeCompare(b?.name || '')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="col-span-1 md:col-span-2"><label className="block text-xs text-stone-500 mb-1">Select Item</label><select required className="w-full p-2 border rounded" value={newOrder.itemId} onChange={e => setNewOrder({...newOrder, itemId: e.target.value})} disabled={!newOrder.companyId}><option value="">-- Select Item --</option>{[...visibleItems].filter(i => i.companyId === newOrder.companyId).sort((a,b) => (a?.name || a?.Item_Name || '').localeCompare(b?.name || b?.Item_Name || '')).map(i => <option key={i.id} value={i.id}>{i.name || i.Item_Name}</option>)}</select></div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">{isPPC ? 'Order Qty (Sets)' : 'Order Quantity'}</label><input required type="number" min="1" className="w-full p-2 border rounded" value={newOrder.orderQty} onChange={e => setNewOrder({...newOrder, orderQty: e.target.value})} /></div>
          <div className="col-span-1"><label className="block text-xs font-bold text-blue-600 mb-1">Legacy/Ready Stock</label><input type="number" min="0" placeholder="Optional" className="w-full p-2 border rounded bg-blue-50 border-blue-200" value={newOrder.openingFgQty} onChange={e => setNewOrder({...newOrder, openingFgQty: e.target.value})} /></div>
          
          {isPPC ? (
              <div className="col-span-1 md:col-span-4 grid grid-cols-6 gap-2 p-3 bg-blue-50 border border-blue-200 rounded">
                  <div className="col-span-1"><label className="block text-[10px] font-bold text-blue-700 mb-1">Common Pkts/Set</label><input required type="number" min="1" className="w-full p-2 border rounded text-xs" value={newOrder.commonPerSet} onChange={e => setNewOrder({...newOrder, commonPerSet: e.target.value})} /></div>
                  <div className="col-span-1"><label className="block text-[10px] font-bold text-blue-700 mb-1">Small Pkts/Set</label><input required type="number" min="1" className="w-full p-2 border rounded text-xs" value={newOrder.smallPerSet} onChange={e => setNewOrder({...newOrder, smallPerSet: e.target.value})} /></div>
                  <div className="col-span-1"><label className="block text-[10px] font-bold text-blue-700 mb-1">Base Com. Ups</label><input required type="number" min="1" className="w-full p-2 border rounded text-xs" value={newOrder.commonUps} onChange={e => setNewOrder({...newOrder, commonUps: e.target.value})} /></div>
                  <div className="col-span-1"><label className="block text-[10px] font-bold text-blue-700 mb-1">Base Sml. Ups</label><input required type="number" min="1" className="w-full p-2 border rounded text-xs" value={newOrder.smallUps} onChange={e => setNewOrder({...newOrder, smallUps: e.target.value})} /></div>
                  <div className="col-span-1"><label className="block text-[10px] font-bold text-blue-700 mb-1">Planned Ups (C)</label><input required type="number" min="1" className="w-full p-2 border rounded text-xs" value={newOrder.plannedUpsCommon} onChange={e => setNewOrder({...newOrder, plannedUpsCommon: e.target.value})} /></div>
                  <div className="col-span-1"><label className="block text-[10px] font-bold text-blue-700 mb-1">Planned Ups (S)</label><input required type="number" min="1" className="w-full p-2 border rounded text-xs" value={newOrder.plannedUpsSmall} onChange={e => setNewOrder({...newOrder, plannedUpsSmall: e.target.value})} /></div>
              </div>
          ) : (
              <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Planned Ups</label><input required type="number" min="1" className="w-full p-2 border rounded" value={newOrder.plannedUps} onChange={e => setNewOrder({...newOrder, plannedUps: e.target.value})} /></div>
          )}
          
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Rate (₹) per {isPPC ? 'Set' : 'Box'}</label><input required type="number" step="0.01" className="w-full p-2 border rounded bg-green-50" value={newOrder.rate} onChange={e => setNewOrder({...newOrder, rate: e.target.value})} /></div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Target Delivery Date</label><input required type="date" className="w-full p-2 border rounded" value={newOrder.deliveryDate} onChange={e => setNewOrder({...newOrder, deliveryDate: e.target.value})} /></div>
          <div className="col-span-1 lg:col-span-3"><button type="submit" className="w-full bg-stone-900 text-white p-2 rounded flex items-center justify-center gap-2 hover:bg-stone-800">Save Order</button></div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-left min-w-[1200px]">
          <thead className="bg-stone-100 text-stone-600 text-sm">
            <tr>
              <th className="p-4">Order Date</th>
              <th className="p-4">Client</th>
              <th className="p-4">Item Ordered</th>
              <th className="p-4">Target Qty</th>
              <th className="p-4">Rate & Value (₹)</th>
              <th className="p-4 bg-green-50 text-green-800">Ready Qty</th>
              <th className="p-4 bg-red-50 text-red-800">Pending Qty</th>
              <th className="p-4">Status</th>
              {role === 'admin' && <th className="p-4 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {visibleOrders.length === 0 && <tr><td colSpan="10" className="p-4 text-center text-stone-500">No orders found.</td></tr>}
            {[...visibleOrders].sort((a,b) => {
               const dateA = new Date(a.orderDate).getTime();
               const dateB = new Date(b.orderDate).getTime();
               return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
            }).map(order => {
              const compName = companies.find(c => c.id === order.companyId)?.name || 'Unknown';
              const statusColors = { 'Pending': 'bg-yellow-100 text-yellow-800 border-yellow-200', 'In Production': 'bg-blue-100 text-blue-800 border-blue-200', 'Completed': 'bg-green-100 text-green-800 border-green-200' };

              const pLogs = production.filter(p => p.orderId === order.id);
              const item = items.find(i => i.id === order.itemId);
              const isPpcOrder = item?.itemType === 'PPC' || item?.Item_Type === 'PPC';
              
              let producedQty = 0;
              let targetSheetsDisplay = null;

              if (isPpcOrder) {
                  const cPiecesPerSet = Math.max(1, parseInt(order.smallPerSet || 2) - 1);
                  const sPiecesPerSet = Math.max(1, parseInt(order.commonPerSet || 2) - 1);

                  let totalCommonPieces = 0;
                  let totalSmallPieces = 0;
                  
                  pLogs.forEach(p => {
                      const sheets = parseFloat(p.linerQty || 0);
                      const cUps = parseInt(p.commonUps || order.commonUps || 0);
                      const sUps = parseInt(p.smallUps || order.smallUps || 0);
                      totalCommonPieces += sheets * cUps;
                      totalSmallPieces += sheets * sUps;
                  });

                  const possibleFromCommon = Math.floor(totalCommonPieces / cPiecesPerSet);
                  const possibleFromSmall = Math.floor(totalSmallPieces / sPiecesPerSet);
                  producedQty = Math.min(possibleFromCommon, possibleFromSmall);
                  if (isNaN(producedQty) || producedQty === Infinity) producedQty = 0;

                  const orderQty = parseInt(order.orderQty || 0);
                  const totalCNeeded = cPiecesPerSet * orderQty;
                  const totalSNeeded = sPiecesPerSet * orderQty;

                  const baseC = parseInt(order.commonUps || 1);
                  const baseS = parseInt(order.smallUps || 1);
                  const pUpsC = parseInt(order.plannedUpsCommon || 1);
                  const pUpsS = parseInt(order.plannedUpsSmall || 1);

                  const commonPiecesPerCommonSheet = Math.max(1, baseC * pUpsC);
                  const smallPiecesPerCommonSheet = Math.max(1, baseC * pUpsC); 
                  const smallPiecesPerDedicatedSheet = Math.max(1, baseS * pUpsS * 2);

                  const commonSheetsNeeded = Math.ceil(totalCNeeded / commonPiecesPerCommonSheet);
                  const smallPiecesAcquired = commonSheetsNeeded * smallPiecesPerCommonSheet;
                  const remainingSmallNeeded = Math.max(0, totalSNeeded - smallPiecesAcquired);
                  const smallSheetsNeeded = Math.ceil(remainingSmallNeeded / smallPiecesPerDedicatedSheet);

                  const targetSheets = commonSheetsNeeded + smallSheetsNeeded;

                  targetSheetsDisplay = (
                      <span className="text-[10px] text-blue-600 font-bold block mt-1 leading-tight">
                          Needs ~{targetSheets} Shts<br/>
                          ({commonSheetsNeeded}C + {smallSheetsNeeded}S)
                      </span>
                  );
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

              // --- ADD LEGACY STOCK TO PRODUCED QTY ---
              producedQty += parseInt(order.openingFgQty || 0);
              
              const pendingQty = Math.max(0, order.orderQty - producedQty);
              const rate = parseFloat(order.rate || 0);
              const totalValue = rate * parseInt(order.orderQty || 0);

              return (
                <tr key={order.id} className="hover:bg-stone-50">
                  <td className="p-4 whitespace-nowrap">{order.orderDate}</td>
                  <td className="p-4 font-bold text-stone-900">{compName}</td>
                  <td className="p-4 font-medium text-stone-800">{order.itemName || order.Item_Name}</td>
                  <td className="p-4">
                      <p className="font-bold text-lg">{order.orderQty}</p>
                      {targetSheetsDisplay}
                  </td>
                  <td className="p-4">
                     <p className="text-xs text-stone-500 mb-1">₹{rate.toFixed(2)} /{isPpcOrder?'set':'box'}</p>
                     <p className="font-bold text-stone-800">₹{totalValue.toFixed(2)}</p>
                  </td>
                  <td className="p-4 bg-green-50/30">
                     <p className="font-bold text-green-600 text-lg">{producedQty}</p>
                     {parseInt(order.openingFgQty || 0) > 0 && <p className="text-[10px] text-blue-600 font-bold">Includes {order.openingFgQty} legacy</p>}
                  </td>
                  <td className="p-4 bg-red-50/30 font-bold text-red-500 text-lg">{pendingQty}</td>
                  <td className="p-4">
                    <button onClick={() => toggleStatus(order.id, order.status)} className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${statusColors[order.status] || 'bg-stone-100'}`} title="Click to change status">{order.status}</button>
                  </td>
                  {role === 'admin' && (
                    <td className="p-4 text-right">
                      <button onClick={() => handleDelete(order.id, order.itemName || order.Item_Name)} className="text-red-500 hover:text-red-700">Delete</button>
                    </td>
                  )}
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
function FinishedGoodsView({ orders, production, items, companies, addLog, getColRef, getDocRef, currentUser }) {
  const allowedCompanyId = currentUser?.role === 'admin' ? 'all' : (currentUser?.companyId || 'all');
  const visibleOrders = allowedCompanyId === 'all' ? orders : orders.filter(o => o.companyId === allowedCompanyId);

  const [dispatchForm, setDispatchForm] = useState({ orderId: null, qty: '' });

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

    // --- ADD LEGACY STOCK TO PRODUCED QTY ---
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
    
    const currentDispatched = parseInt(order.dispatchedQty || 0);
    const newDispatched = currentDispatched + qty;

    const newHistory = [...(order.dispatchHistory || []), {
      date: new Date().toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      qty: qty
    }];

    await updateDoc(getDocRef('orders', order.id), { 
      dispatchedQty: newDispatched,
      dispatchHistory: newHistory
    });
    
    addLog(`Dispatched ${qty} boxes for Order: ${order.itemName}`);
    if (e) e.target.reset(); 
  };

  // --- DELETE RECORD FEATURE ---
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

  // ==========================================
  // DEDICATED LEGACY STOCK IMPORTER
  // ==========================================
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

        if (idxClient === -1 || idxItem === -1 || idxStock === -1) {
          return alert("Error: Could not find required columns. Please ensure your CSV has headers exactly like: Client, Item, Current_Stock, Rate");
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

          const stockQty = parseInt(stockRaw);
          if (isNaN(stockQty) || stockQty <= 0) continue;

          const comp = companies.find(c => (c?.name||'').toLowerCase().trim() === clientName.toLowerCase());
          if (!comp) {
            errors.push(`Row ${i+1}: Client "${clientName}" not found.`);
            continue;
          }

          const item = items.find(itm => 
            (itm?.name||itm?.Item_Name||'').toLowerCase().trim() === itemName.toLowerCase() && 
            itm.companyId === comp.id
          );
          if (!item) {
            errors.push(`Row ${i+1}: Item "${itemName}" not found under client "${clientName}".`);
            continue;
          }

          let rate = parseFloat(rateRaw);
          if (isNaN(rate)) rate = parseFloat(item.rate || 0);
          if (isNaN(rate)) rate = 0;

          await addDoc(getColRef('orders'), {
            orderDate: new Date().toISOString().split('T')[0],
            companyId: comp.id || '',
            itemId: item.id || '',
            itemName: item.name || item.Item_Name || 'Unknown Item',
            orderQty: stockQty || 0,
            openingFgQty: stockQty || 0, 
            status: 'Completed',
            plannedUps: '1',
            deliveryDate: new Date().toISOString().split('T')[0],
            rate: rate || 0,
            dispatchedQty: 0
          });
          successCount++;
        }

        addLog(`Imported ${successCount} legacy stock items.`);
        
        if (errors.length > 0) {
           alert(`Imported ${successCount} items successfully, but skipped ${errors.length} rows due to spelling mismatches:\n\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n...and more.' : ''}`);
        } else if (successCount > 0) {
           alert(`Successfully matched and imported all ${successCount} items!`);
        } else {
           alert(`0 items imported. Check your spelling or ensure the Current_Stock column has numbers.`);
        }

      } catch (err) {
        console.error("Parse Error Details:", err);
        alert(`Failed to save to database. Error details logged to browser console.`);
      } finally {
        e.target.value = null; 
      }
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
            headers = cols.map(h => h.trim().toLowerCase());
            headerRowIndex = i;
            break;
          }
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
          if (!dispatchDate || dispatchDate.trim() === '') {
            dispatchDate = new Date().toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          }

          if (orderId && !isNaN(dispatchQty) && dispatchQty > 0) {
            const order = orders.find(o => o.id === orderId);
            if (order) {
              const currentDispatched = parseInt(order.dispatchedQty || 0);
              const newHistory = [...(order.dispatchHistory || []), {
                date: dispatchDate,
                qty: dispatchQty
              }];
              
              await updateDoc(getDocRef('orders', order.id), {
                dispatchedQty: currentDispatched + dispatchQty,
                dispatchHistory: newHistory
              });
              updateCount++;
            }
          }
        }

        addLog(`Bulk dispatched ${updateCount} orders via CSV`);
        alert(`Successfully recorded ${updateCount} dispatches!`);

      } catch (err) {
         console.error(err);
         alert("Error processing CSV.");
      } finally {
         e.target.value = null;
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-2xl font-bold">Finished Goods & Dispatch Dashboard</h2>
        <div className="flex gap-2">
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
      <p className="text-sm font-bold text-blue-600 mb-6 bg-blue-50 inline-block px-3 py-1 rounded">
        Database Link: Showing {visibleOrders.length} total records downloaded
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-left min-w-[1200px]">
          <thead className="bg-stone-100 text-stone-600 text-sm">
            <tr>
              <th className="p-4">Order Ref / Client</th>
              <th className="p-4">Item Details</th>
              <th className="p-4 bg-blue-50">Produced (Qty & Wt)</th>
              <th className="p-4 bg-orange-50">Dispatched (Qty, Val, Wt)</th>
              <th className="p-4 bg-green-50 text-green-800">In Stock (Qty, Val, Wt)</th>
              <th className="p-4 text-right">Dispatch Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {visibleOrders.map(order => {
              const stock = getOrderStockDetails(order);
              if (stock.producedQty <= 0 && stock.dispatchedQty <= 0) return null; 

              const compName = companies.find(c => c.id === order.companyId)?.name || 'Unknown';

              return (
                <tr key={order.id} className={`hover:bg-stone-50 ${dispatchForm.orderId === order.id ? 'bg-blue-50/50' : ''}`}>
                  <td className="p-4">
                    <p className="font-bold text-stone-900">{compName}</p>
                    <p className="text-xs text-stone-500">Ordered: {order.orderDate}</p>
                  </td>
                  <td className="p-4">
                    <p className="font-medium text-stone-800">{order.itemName || order.Item_Name}</p>
                    <p className="text-xs text-stone-500">{stock.item?.weight || stock.item?.Weight_g ? `${stock.item.weight || stock.item.Weight_g}g` : '-'} | ₹{stock.rate.toFixed(2)}/{stock.isPpcOrder?'set':'box'}</p>
                  </td>
                  <td className="p-4 bg-blue-50/30">
                    <p className="font-bold text-lg text-blue-700">{stock.producedQty}</p>
                    <p className="text-xs font-medium text-blue-600">{(stock.producedQty * stock.avgWeightKg).toFixed(1)} kg total</p>
                    {parseInt(order.openingFgQty || 0) > 0 && <p className="text-[10px] text-blue-600 font-bold mt-1 bg-blue-100 px-1 py-0.5 rounded inline-block">Includes {order.openingFgQty} legacy</p>}
                  </td>
                  <td className="p-4 bg-orange-50/30">
                    <p className="font-bold text-lg text-orange-600">{stock.dispatchedQty}</p>
                    <p className="text-xs font-bold text-stone-800">₹{stock.dispatchedValue.toFixed(2)}</p>
                    <p className="text-xs font-medium text-orange-600 mb-1">{stock.dispatchedWeight.toFixed(1)} kg</p>
                    {order.dispatchHistory && order.dispatchHistory.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-orange-200">
                        <p className="text-[10px] font-bold text-orange-800 mb-1">Dispatch History:</p>
                        <ul className="text-[10px] space-y-0.5 text-orange-700">
                          {order.dispatchHistory.map((h, i) => (
                            <li key={i}>{h.date}: <span className="font-bold">{h.qty}</span></li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </td>
                  <td className="p-4 bg-green-50/30">
                    <p className="font-bold text-xl text-green-700">{stock.inStock}</p>
                    <p className="text-sm font-bold text-stone-800">₹{stock.stockValue.toFixed(2)}</p>
                    <p className="text-xs font-medium text-green-600">{stock.stockWeight.toFixed(1)} kg</p>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {stock.inStock > 0 ? (
                        <form onSubmit={(e) => handleDispatch(e, order, stock.inStock)} className="flex items-center gap-2">
                          <input required type="number" min="1" max={stock.inStock} name="dispatchQty" className={`w-20 p-2 border border-stone-300 rounded text-sm bg-white focus:ring-2 focus:ring-stone-800 focus:outline-none ${dispatchForm.orderId === order.id ? 'ring-2 ring-blue-500' : ''}`} placeholder="Qty..." value={dispatchForm.orderId === order.id ? dispatchForm.qty : undefined} onChange={dispatchForm.orderId === order.id ? (e) => setDispatchForm({...dispatchForm, qty: e.target.value}) : undefined} />
                          <button type="submit" className="bg-stone-900 text-white px-3 py-2 rounded text-xs font-bold hover:bg-stone-800">
                            Dispatch
                          </button>
                          {dispatchForm.orderId === order.id && <button type="button" onClick={() => setDispatchForm({orderId: null, qty: ''})} className="bg-stone-200 px-2 py-1.5 rounded text-xs">Cancel</button>}
                        </form>
                      ) : (
                        <span className="text-xs font-bold text-stone-400 bg-stone-100 px-3 py-1.5 rounded">No Stock</span>
                      )}
                      
                      {currentUser?.role === 'admin' && (
                        <button onClick={() => handleDeleteRecord(order.id, order.itemName || order.Item_Name)} className="ml-2 text-red-500 hover:bg-red-50 p-2 rounded transition-colors" title="Delete Entire Record">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- ITEMS VIEW ---
function ItemsView({ items, companies, addLog, role, getColRef, getDocRef, currentUser }) {
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
            <div className="col-span-1 md:col-span-2"><label className="block text-xs text-stone-500 mb-1">Company</label><select required className="w-full p-2 border rounded" value={newItem.companyId} onChange={e => setNewItem({...newItem, companyId: e.target.value})}><option value="">Select Company...</option>{[...visibleCompanies].sort((a,b) => (a?.name || '').localeCompare(b?.name || '')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
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
            <tr><th className="p-4">Company</th><th className="p-4">Item Details</th><th className="p-4">Size (L x W x H) mm</th><th className="p-4">Paper Specs</th>{role === 'admin' && <th className="p-4 text-right">Actions</th>}</tr>
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
  const [newCompany, setNewCompany] = useState('');
  const handleAdd = async (e) => {
    e.preventDefault();
    if(!newCompany.trim()) return;
    await addDoc(getColRef('companies'), { name: newCompany });
    addLog(`Added new client: ${newCompany}`);
    setNewCompany('');
  };
  const handleDelete = async (id, name) => {
    if(window.confirm(`Delete ${name}? Note: This does not automatically delete their items.`)) {
      await deleteDoc(getDocRef('companies', id));
      addLog(`Deleted client: ${name}`);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Manage Client Companies</h2>
      </div>
      <form onSubmit={handleAdd} className="flex gap-4 mb-8 bg-white p-4 rounded-xl border shadow-sm">
        <input required type="text" placeholder="New Company Name" className="flex-1 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-800" value={newCompany} onChange={e => setNewCompany(e.target.value)} />
        <button type="submit" className="bg-stone-900 text-white px-6 py-3 rounded-lg hover:bg-stone-800 flex items-center gap-2">Add Client</button>
      </form>
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 divide-y">
        {companies.length === 0 && <div className="p-6 text-center text-stone-500">No companies yet. Add your first client above.</div>}
        {[...companies].sort((a,b) => (a?.name || '').localeCompare(b?.name || '')).map(c => (
          <div key={c.id} className="p-4 flex items-center justify-between hover:bg-stone-50">
            <div className="flex items-center gap-3"><span className="font-medium text-lg">{c.name}</span></div>
            <button onClick={() => handleDelete(c.id, c.name)} className="text-red-400 hover:text-red-600 p-2">Delete</button>
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