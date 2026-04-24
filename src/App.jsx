import React, { useState, useEffect, useRef } from 'react';
import { 
  Calculator, Package, Building2, Users, History, LogOut, Plus, Trash2, Lock, ShieldAlert, CheckCircle2, Download, Upload, Factory, Coins, PieChart, ShoppingCart, Edit2, Archive, Search, Truck, ScanLine, IndianRupee
} from 'lucide-react';

// ==========================================
// 1. FIREBASE SETUP & API KEYS (SECURED)
// ==========================================
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';

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
  const [activeTab, setActiveTab] = useState('calculator');

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
    setActiveTab('calculator');
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
              <NavButton icon={<PieChart />} label="Admin Dashboard" isActive={activeTab === 'admin_dashboard'} onClick={() => setActiveTab('admin_dashboard')} />
            </>
          )}
        </nav>
        <div className="p-4 border-t border-stone-800">
          <button onClick={logout} className="flex items-center gap-3 text-stone-400 hover:text-white w-full px-4 py-2 transition-colors"><LogOut className="w-5 h-5" /> Logout</button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 overflow-y-auto h-screen">
        {activeTab === 'calculator' && <CalculatorView companies={companies} items={items} addLog={addLog} currentUser={currentErpUser} />}
        {activeTab === 'costing' && currentErpUser.role === 'admin' && <CostingView />}
        {activeTab === 'orders' && <OrdersView orders={orders} production={production} items={items} companies={companies} addLog={addLog} role={currentErpUser.role} getColRef={getColRef} getDocRef={getDocRef} currentUser={currentErpUser} />}
        {activeTab === 'production' && <ProductionView inventory={inventory} production={production} orders={orders} items={items} companies={companies} addLog={addLog} role={currentErpUser.role} getColRef={getColRef} getDocRef={getDocRef} currentUser={currentErpUser} />}
        {activeTab === 'finished_goods' && <FinishedGoodsView orders={orders} production={production} items={items} companies={companies} addLog={addLog} getDocRef={getDocRef} currentUser={currentErpUser} />}
        
        {/* NEW PROPS FOR WASTAGE VIEW AUTO-LINKING */}
        {activeTab === 'wastage' && <WastageView wastageLogs={wastageLogs} orders={orders} companies={companies} production={production} addLog={addLog} role={currentErpUser.role} getColRef={getColRef} getDocRef={getDocRef} currentUser={currentErpUser} />}
        
        {activeTab === 'admin_dashboard' && currentErpUser.role === 'admin' && (
          <AdminDashboard
            inventory={inventory}
            production={production}
            orders={orders}
            wastageLogs={wastageLogs}
            companies={companies}
            items={items}
            addLog={addLog}
            getColRef={getColRef}
            getDocRef={getDocRef}
            currentUser={currentErpUser}
          />
        )}
        
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

// --- CALCULATOR VIEW ---
function CalculatorView({ companies, items, addLog, currentUser }) {
  const allowedCompanyId = currentUser?.role === 'admin' ? 'all' : (currentUser?.companyId || 'all');
  const visibleCompanies = allowedCompanyId === 'all' ? companies : companies.filter(c => c.id === allowedCompanyId);

  const [selectedCompany, setSelectedCompany] = useState(allowedCompanyId !== 'all' ? allowedCompanyId : '');
  const [selectedItem, setSelectedItem] = useState('');
  const [quantity, setQuantity] = useState('');
  
  // PPC Specific States (Segregated)
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
      // 1. Calculate Required Pieces (Notice inverted logic as per prompt: Common Pieces = (Small Pockets - 1) * Qty)
      const cNeeded = (parseInt(smallPerSet) - 1) * qty;
      const sNeeded = (parseInt(commonPerSet) - 1) * qty;
      
      const baseC = parseInt(baseCommonUps) || 1;
      const baseS = parseInt(baseSmallUps) || 1;
      const pUpsC = parseInt(plannedUpsCommon) || 1;
      const pUpsS = parseInt(plannedUpsSmall) || 1;

      // 2. Yield per sheet
      const commonPiecesPerCommonSheet = baseC * pUpsC;
      const smallPiecesPerCommonSheet = baseC * pUpsC; 
      const smallPiecesPerDedicatedSheet = baseS * pUpsS * 2;

      // 3. Segregate Sheets Needed
      const commonSheetsNeeded = Math.ceil(cNeeded / commonPiecesPerCommonSheet);
      const smallPiecesAcquired = commonSheetsNeeded * smallPiecesPerCommonSheet;
      const remainingSmallNeeded = Math.max(0, sNeeded - smallPiecesAcquired);
      const smallSheetsNeeded = Math.ceil(remainingSmallNeeded / smallPiecesPerDedicatedSheet);
      
      const targetSheets = commonSheetsNeeded + smallSheetsNeeded;

      // 4. Calculate Exact Board Dimensions
      const boardWidthCommon = H * baseC;
      const boardLengthCommon = ((L + W) * pUpsC) + 10;
      
      const boardWidthSmall = boardWidthCommon; 
      const boardLengthSmall = (W * 2 * pUpsS) + 10;
      
      // 5. Area & Weight Calculation
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
          boardLength = (W + H + H + 10);
          boardWidth = (L + H + H + 10);
          break;
        case 'Lid':
          boardLength = (W + H + H + 10);
          boardWidth = (L + H + H + 10);
          break;
        case 'Sheet':
          boardLength = L;
          boardWidth = W;
          break;
        case 'Plate':
          boardLength = L;
          boardWidth = W;
          break;
        default:
          boardLength = L; 
          boardWidth = W;
          break;
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
  const [size, setSize] = useState('');
  const [plyCount, setPlyCount] = useState(3);
  const [conversionCost, setConversionCost] = useState(0);

  const [plyDetails, setPlyDetails] = useState([
    { id: 0, name: 'Top Liner', gsm: 150, bf: 18, factor: 1.0, rate: 40 },
    { id: 1, name: 'Fluting 1', gsm: 120, bf: 18, factor: 1.4, rate: 35 },
    { id: 2, name: 'Bottom Liner', gsm: 150, bf: 18, factor: 1.0, rate: 40 }
  ]);

  const handlePlyCountChange = (e) => {
    const count = parseInt(e.target.value) || 3;
    setPlyCount(count);
    const newPlies = [];
    for (let i = 0; i < count; i++) {
      const isFlute = i % 2 !== 0; 
      newPlies.push({
        id: i,
        name: isFlute ? `Fluting ${Math.ceil(i/2)}` : (i === 0 ? 'Top Liner' : (i === count - 1 ? 'Bottom Liner' : `Middle Liner ${Math.floor(i/2)}`)),
        gsm: isFlute ? 120 : 150,
        bf: 18,
        factor: isFlute ? 1.4 : 1.0,
        rate: isFlute ? 35 : 40
      });
    }
    setPlyDetails(newPlies);
  };

  const handlePlyChange = (index, field, value) => {
    const newPlies = [...plyDetails];
    newPlies[index][field] = parseFloat(value) || 0;
    setPlyDetails(newPlies);
  };

  const dimensions = size.toLowerCase().replace(/\*/g, 'x').split('x').map(s => parseFloat(s.trim()) || 0);
  const L = dimensions[0] || 0;
  const W = dimensions[1] || 0;
  const H = dimensions[2] || 0;
  const boardLength = L && W ? (L + W) * 2 + 50 : 0;
  const boardWidth = W && H ? W + H + 20 : 0;
  const boardAreaSqM = (boardLength * boardWidth) / 1000000;

  let totalWeightKg = 0;
  let totalMaterialCost = 0;

  const plyRows = plyDetails.map((ply, index) => {
    const plyWeightKg = (boardAreaSqM * ply.gsm * ply.factor) / 1000;
    const plyCost = plyWeightKg * ply.rate;
    totalWeightKg += plyWeightKg;
    totalMaterialCost += plyCost;

    return (
      <tr key={ply.id} className="border-b border-stone-100 hover:bg-stone-50">
        <td className="p-3 text-sm font-medium text-stone-800">{ply.name}</td>
        <td className="p-2"><input type="number" className="w-16 p-2 border rounded text-sm bg-white" value={ply.gsm} onChange={e => handlePlyChange(index, 'gsm', e.target.value)} /></td>
        <td className="p-2"><input type="number" className="w-16 p-2 border rounded text-sm bg-white" value={ply.bf} onChange={e => handlePlyChange(index, 'bf', e.target.value)} /></td>
        <td className="p-2"><input type="number" step="0.1" className="w-16 p-2 border rounded text-sm bg-white" value={ply.factor} onChange={e => handlePlyChange(index, 'factor', e.target.value)} /></td>
        <td className="p-2"><input type="number" className="w-20 p-2 border rounded text-sm bg-white" value={ply.rate} onChange={e => handlePlyChange(index, 'rate', e.target.value)} /></td>
        <td className="p-3 text-sm font-mono text-stone-600">{plyWeightKg > 0 ? plyWeightKg.toFixed(3) : '-'} kg</td>
        <td className="p-3 text-sm font-mono font-semibold text-stone-900">{plyCost > 0 ? plyCost.toFixed(2) : '-'}</td>
      </tr>
    );
  });

  const finalBoxCost = totalMaterialCost + parseFloat(conversionCost || 0);
  const ratePerKg = totalWeightKg > 0 ? (finalBoxCost / totalWeightKg) : 0;

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <h2 className="text-2xl font-bold mb-6">Box Costing Calculator (Standalone)</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
           <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 space-y-4">
              <h3 className="font-bold border-b pb-2">Box Dimensions & Ply</h3>
              <div><label className="block text-xs font-medium text-stone-500 mb-1">Size (L x W x H) in mm</label><input type="text" placeholder="e.g. 250x200x150" className="w-full p-2 border border-stone-300 rounded-md bg-white font-mono" value={size} onChange={(e) => setSize(e.target.value)} /></div>
              <div><label className="block text-xs font-medium text-stone-500 mb-1">Number of Plies</label><select className="w-full p-2 border border-stone-300 rounded-md bg-stone-50" value={plyCount} onChange={handlePlyCountChange}><option value={2}>2 Ply</option><option value={3}>3 Ply</option><option value={5}>5 Ply</option><option value={7}>7 Ply</option></select></div>
              {boardAreaSqM > 0 && (
                <div className="pt-4 bg-stone-50 p-4 rounded-lg mt-4 text-sm border border-stone-100">
                  <p className="flex justify-between mb-1"><span className="text-stone-500">Board Length:</span> <span className="font-medium text-stone-900">{boardLength.toFixed(1)} mm</span></p>
                  <p className="flex justify-between mb-1"><span className="text-stone-500">Board Width:</span> <span className="font-medium text-stone-900">{boardWidth.toFixed(1)} mm</span></p>
                  <p className="flex justify-between"><span className="text-stone-500">Board Area:</span> <span className="font-medium text-stone-900">{boardAreaSqM.toFixed(3)} m²</span></p>
                </div>
              )}
           </div>
           <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200">
               <h3 className="font-bold mb-4 border-b pb-2">Manufacturing Add-ons</h3>
               <div><label className="block text-xs font-medium text-stone-500 mb-1">Conversion/Mfg Cost per Box</label><input type="number" step="0.01" className="w-full p-2 border border-stone-300 rounded-md bg-white text-lg font-mono" value={conversionCost} onChange={(e) => setConversionCost(e.target.value)} /></div>
           </div>
        </div>
        <div className="lg:col-span-2 space-y-6">
           <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
              <div className="bg-stone-100 p-4 border-b border-stone-200"><h3 className="font-bold text-stone-800">Ply Specification & Material Cost</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
                    <tr><th className="p-3">Ply Layer</th><th className="p-3">GSM</th><th className="p-3">BF</th><th className="p-3">Fluting Factor</th><th className="p-3">Rate / KG</th><th className="p-3">Ply Wt.</th><th className="p-3">Cost</th></tr>
                  </thead>
                  <tbody>{plyRows}</tbody>
                </table>
              </div>
           </div>
           <div className="bg-stone-900 text-stone-100 p-6 rounded-xl shadow-lg border border-stone-800 grid grid-cols-2 md:grid-cols-4 gap-6">
               <div><p className="text-stone-400 text-xs uppercase tracking-wider mb-1">Total Weight</p><p className="text-2xl font-bold font-mono text-white">{totalWeightKg > 0 ? totalWeightKg.toFixed(3) : '0.000'} <span className="text-sm font-normal text-stone-500">kg</span></p></div>
               <div><p className="text-stone-400 text-xs uppercase tracking-wider mb-1">Material Cost</p><p className="text-2xl font-bold font-mono text-white">{totalMaterialCost > 0 ? totalMaterialCost.toFixed(2) : '0.00'}</p></div>
               <div><p className="text-stone-400 text-xs uppercase tracking-wider mb-1">Conversion</p><p className="text-2xl font-bold font-mono text-white">{parseFloat(conversionCost || 0).toFixed(2)}</p></div>
               <div className="bg-stone-800 p-3 rounded-lg -m-3 text-center border border-stone-700">
                  <p className="text-stone-300 text-xs uppercase tracking-wider mb-1 font-bold">Total Box Cost</p>
                  <p className="text-3xl font-bold font-mono text-green-400">{finalBoxCost > 0 ? finalBoxCost.toFixed(2) : '0.00'}</p>
                  <p className="text-stone-400 text-xs mt-1 font-medium">{ratePerKg > 0 ? ratePerKg.toFixed(2) : '0.00'} / kg</p>
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
    
    // AUTO-PULL TOTAL ISSUED KG FROM PRODUCTION LOGS
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
                <div className="bg-stone-800 p-4 rounded-lg border border-stone-700 mt-2"><p className="text-stone-300 text-xs uppercase mb-1 font-bold">Gum Cost / KG Paper</p><p className="text-3xl font-bold font-mono text-green-400">{gumCostPerKgPaper > 0 ? gumCostPerKgPaper.toFixed(2) : '0.00'}</p><p className="text-xs text-stone-400 mt-1">Total Gum Cost: {totalGumCost > 0 ? totalGumCost.toFixed(2) : '0.00'}</p></div>
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
function InventoryView({ inventory, production, addLog, role, getColRef, getDocRef, currentUser, companies }) {
  const allowedCompanyId = currentUser?.role === 'admin' ? 'all' : (currentUser?.companyId || 'all');
  const visibleCompanies = allowedCompanyId === 'all' ? companies : companies.filter(c => c.id === allowedCompanyId);

  const [editingId, setEditingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  
  // Generic Invoice Details
  const [commonData, setCommonData] = useState({ date: new Date().toISOString().split('T')[0], companyId: allowedCompanyId !== 'all' ? allowedCompanyId : '', millName: '', invoiceNo: '', vehicleNo: '' });
  
  // Multiple Reels Array
  const emptyReel = { reelNo: '', size: '', gsm: '', bf: '', colour: 'Kraft', receivedQty: '', initialIssuedQty: '', ratePerKg: '' };
  const [reelsInput, setReelsInput] = useState([{...emptyReel}]);

  const [filters, setFilters] = useState({ company: '', millName: '', searchReel: '', size: '', gsm: '', bf: '', colour: '', status: 'All' });

  const handleAddOrUpdate = async (e) => {
    e.preventDefault();
    if (editingId) {
      const singleReel = reelsInput[0];
      await updateDoc(getDocRef('inventory', editingId), { ...commonData, ...singleReel });
      addLog(`Updated inventory reel: ${singleReel.reelNo}`);
      setEditingId(null);
      setReelsInput([{...emptyReel}]);
    } else {
      const batch = writeBatch(db);
      let count = 0;
      reelsInput.forEach(reel => {
        if (!reel.reelNo) return;
        const newDocRef = doc(getColRef('inventory'));
        batch.set(newDocRef, { ...commonData, ...reel });
        count++;
      });
      await batch.commit();
      addLog(`Added ${count} inventory reels from ${commonData.millName}`);
      setReelsInput([{...emptyReel}]); 
    }
  };

  const handleEdit = (reel) => { 
    setEditingId(reel.id); 
    setCommonData({ date: reel.date, companyId: reel.companyId, millName: reel.millName, invoiceNo: reel.invoiceNo, vehicleNo: reel.vehicleNo });
    setReelsInput([{ reelNo: reel.reelNo, size: reel.size, gsm: reel.gsm, bf: reel.bf, colour: reel.colour, receivedQty: reel.receivedQty, initialIssuedQty: reel.initialIssuedQty, ratePerKg: reel.ratePerKg }]);
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
  };
  
  const handleDelete = async (id, reelNo) => { if(window.confirm(`Delete inventory record for Reel ${reelNo}?`)) { await deleteDoc(getDocRef('inventory', id)); addLog(`Deleted inventory reel: ${reelNo}`); } };
  
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
        addLog(`Bulk deleted ${selectedIds.size} inventory records`);
        setSelectedIds(new Set());
    }
  };

  const handleWipeDatabase = async () => {
    if (role !== 'admin') return;
    const pwd = window.prompt("WARNING: You are about to permanently delete ALL records in this inventory database.\n\nTo confirm, please enter your admin password:");
    if (pwd === null) return; 
    if (pwd !== currentUser.password) {
        alert("Incorrect password. Operation cancelled.");
        return;
    }
    if (window.confirm("FINAL WARNING: Are you absolutely sure you want to wipe the entire inventory database? This cannot be undone.")) {
        await Promise.all(inventory.map(reel => deleteDoc(getDocRef('inventory', reel.id))));
        addLog("WIPED entire inventory database");
        alert("Inventory database completely wiped.");
        setSelectedIds(new Set());
    }
  };

  const balances = {};
  const usageStats = {}; 
  inventory.forEach(reel => {
    const rNo = String(reel.reelNo || '').trim().toLowerCase();
    const initialIssued = parseFloat(reel.initialIssuedQty || 0);
    balances[rNo] = parseFloat(reel.receivedQty || 0) - initialIssued;
    usageStats[rNo] = { issued: 0, log: [] };
    if (initialIssued > 0) {
        usageStats[rNo].log.push({ date: reel.date, usedFor: 'Initial / CSV Import', kg: initialIssued.toFixed(1) });
    }
  });

  const sortedProd = [...production].sort((a,b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
  });
  
  sortedProd.forEach(p => {
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
        usageStats[rNo].log.push({ date: p.date, usedFor: p.usedForItem || p.paperUsedFor || 'Unknown', kg: deduct.toFixed(1) });
        remainingUse -= deduct;
      }
    });
  });

  const inventoryWithUsage = inventory.map(reel => {
    const rNo = String(reel.reelNo || '').trim().toLowerCase();
    const stats = usageStats[rNo] || { issued: 0, log: [] };
    const initialIssued = parseFloat(reel.initialIssuedQty || 0);
    const issuedQty = stats.issued + initialIssued;
    const received = parseFloat(reel.receivedQty || 0);
    const balanceQty = Math.max(0, received - issuedQty);
    const rate = parseFloat(reel.ratePerKg || 0);
    const value = balanceQty * rate;
    return { ...reel, issuedQty, balanceQty, value, ratePerKg: rate, usageLog: stats.log };
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
    if (filters.status === 'Available' && reel.balanceQty <= 0) return false;
    if (filters.status === 'Used' && reel.balanceQty > 0) return false;
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
    const exportData = filteredInventory.map(reel => ({
      Company: companies.find(c => c.id === reel.companyId)?.name || 'Unknown', Date: reel.date || '', Mill_Name: reel.millName || '', Invoice_No: reel.invoiceNo || '', Vehicle_No: reel.vehicleNo || '', Reel_No: reel.reelNo || '', Size: reel.size || '', GSM: reel.gsm || '', BF: reel.bf || '', Colour: reel.colour || '', Received_Qty: reel.receivedQty || '', Initial_Issued: reel.initialIssuedQty || '0', Total_Issued_Qty: reel.issuedQty.toFixed(2), Balance_Qty: reel.balanceQty.toFixed(2), Rate_per_KG: reel.ratePerKg, Current_Value: reel.value.toFixed(2), Used_For_History: reel.usageLog.map(l => `${l.date}: ${l.usedFor} (${l.kg}kg)`).join(' | ')
    }));
    downloadCSV(exportData, 'stock_inventory');
  };

  const totalReels = filteredInventory.length;
  const emptyReels = filteredInventory.filter(r => r.balanceQty <= 0).length;
  const activeReels = totalReels - emptyReels;
  const totalKgAvailable = filteredInventory.reduce((sum, r) => sum + r.balanceQty, 0);
  const totalValueAvailable = filteredInventory.reduce((sum, r) => sum + r.value, 0);

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Stock Inventory (Raw Materials)</h2>
        {role === 'admin' && (
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button onClick={handleBulkDelete} className="bg-red-100 text-red-700 px-3 py-1.5 rounded text-sm font-bold hover:bg-red-200 transition">
                Delete Selected ({selectedIds.size})
              </button>
            )}
            <button onClick={handleWipeDatabase} className="bg-red-600 text-white px-3 py-1.5 rounded text-sm font-bold hover:bg-red-700 transition flex items-center gap-1 shadow-sm">
              <Trash2 className="w-4 h-4" /> Wipe All
            </button>
          </div>
        )}
      </div>
      <form onSubmit={handleAddOrUpdate} className="flex gap-4 mb-8 bg-white p-4 rounded-xl border shadow-sm">
        <input required type="text" placeholder="New Company Name" className="flex-1 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-800" value={newCompany} onChange={e => setNewCompany(e.target.value)} />
        <button type="submit" className="bg-stone-900 text-white px-6 py-3 rounded-lg hover:bg-stone-800 flex items-center gap-2"><Plus className="w-5 h-5"/> Add Client</button>
      </form>
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 divide-y">
        {companies.length === 0 && <div className="p-6 text-center text-stone-500">No companies yet. Add your first admin user above.</div>}
        {[...companies].sort((a,b) => (a?.name || '').localeCompare(b?.name || '')).map(c => (
          <div key={c.id} className="p-4 flex items-center justify-between hover:bg-stone-50">
            <div className="flex items-center gap-3"><Building2 className="w-5 h-5 text-stone-400" /><span className="font-medium text-lg">{c.name}</span></div>
            <button onClick={() => handleDelete(c.id, c.name)} className="text-red-500 hover:text-red-700 p-2"><Trash2 className="w-5 h-5" /></button>
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
        <button type="submit" className="bg-stone-900 text-white px-6 py-3 rounded-lg hover:bg-stone-800 w-full md:w-auto flex items-center justify-center gap-2"><Plus className="w-5 h-5"/> Add User</button>
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
                  <button onClick={() => handleChangePassword(u.id, u.name)} className="text-blue-500 hover:text-blue-700 mr-3" title="Change Password"><Edit2 className="w-5 h-5 inline" /></button>
                  <button onClick={() => handleDelete(u.id, u.name)} className="text-red-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-red-400" disabled={u.id === currentUserId} title="Delete User"><Trash2 className="w-5 h-5 inline" /></button>
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

// --- ADMIN DASHBOARD (ADMIN ONLY) ---
function AdminDashboard({ inventory = [], production = [], orders = [], wastageLogs = [], companies = [], items = [], addLog, getColRef, getDocRef, currentUser }) {
  const now = new Date();

  const toKey = (dateStr, period) => {
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    if (period === 'month') return `${y}-${String(m).padStart(2, '0')}`;
    if (period === 'quarter') return `${y}-Q${Math.ceil(m / 3)}`;
    if (period === 'year') return `${y}`;
    return null;
  };

  const aggregatePurchases = (period) => {
    const map = {};
    inventory.forEach(inv => {
      const key = toKey(inv.date || inv.dateReceived || new Date().toISOString(), period);
      if (!key) return;
      const kg = parseFloat(inv.receivedQty || inv.Received_Qty || 0) || 0;
      const rate = parseFloat(inv.ratePerKg || inv.Rate_per_KG || inv.rate || 0) || 0;
      const value = kg * rate;
      map[key] = map[key] || { kg: 0, value: 0 };
      map[key].kg += kg;
      map[key].value += value;
    });
    return map;
  };

  const aggregateProduction = (period) => {
    const map = {};
    production.forEach(p => {
      const key = toKey(p.date || new Date().toISOString(), period);
      if (!key) return;
      const kg = parseFloat(p.useKg || p.UseKG || 0) || 0;
      map[key] = map[key] || 0;
      map[key] += kg;
    });
    return map;
  };

  const aggregateWastage = (period) => {
    const map = {};
    wastageLogs.forEach(w => {
      const key = toKey(w.date || new Date().toISOString(), period);
      if (!key) return;
      const paper = parseFloat(w.paperWastage || w.paperWastageKg || 0) || 0;
      const sheet = parseFloat(w.sheetWastage || 0) || 0;
      const total = paper + sheet;
      map[key] = map[key] || { kg: 0, count: 0 };
      map[key].kg += total;
      map[key].count += 1;
    });
    return map;
  };

  const aggregateSales = (period) => {
    const map = {};
    orders.forEach(o => {
      if (Array.isArray(o.dispatchHistory) && o.dispatchHistory.length > 0) {
        o.dispatchHistory.forEach(h => {
          const dateKey = toKey(h.date ? new Date(h.date).toISOString() : o.orderDate, period);
          if (!dateKey) return;
          const qty = parseFloat(h.qty || 0) || 0;
          const rate = parseFloat(o.rate || 0) || 0;
          const value = qty * rate;
          map[dateKey] = map[dateKey] || { kg: 0, value: 0, qty: 0 };
          const item = items.find(i => i.id === o.itemId);
          const avgKg = item ? (parseFloat(item.weight || item.Weight_g || 0) / 1000) : 0;
          map[dateKey].kg += qty * avgKg;
          map[dateKey].value += value;
          map[dateKey].qty += qty;
        });
      } else if (parseFloat(o.dispatchedQty || 0) > 0) {
        const dateKey = toKey(o.orderDate || new Date().toISOString(), period);
        if (!dateKey) return;
        const qty = parseFloat(o.dispatchedQty || 0) || 0;
        const rate = parseFloat(o.rate || 0) || 0;
        const item = items.find(i => i.id === o.itemId);
        const avgKg = item ? (parseFloat(item.weight || item.Weight_g || 0) / 1000) : 0;
        const value = qty * rate;
        map[dateKey] = map[dateKey] || { kg: 0, value: 0, qty: 0 };
        map[dateKey].kg += qty * avgKg;
        map[dateKey].value += value;
        map[dateKey].qty += qty;
      }
    });
    return map;
  };

  const buildSummary = (period) => {
    const purchases = aggregatePurchases(period);
    const productionAgg = aggregateProduction(period);
    const salesAgg = aggregateSales(period);
    const wastageAgg = aggregateWastage(period);

    const keys = Array.from(new Set([
      ...Object.keys(purchases),
      ...Object.keys(productionAgg),
      ...Object.keys(salesAgg),
      ...Object.keys(wastageAgg)
    ])).sort().reverse();

    return keys.map(key => ({
      period: key,
      purchaseKg: +(purchases[key]?.kg || 0).toFixed(2),
      purchaseValue: +(purchases[key]?.value || 0).toFixed(2),
      productionKg: +(productionAgg[key] || 0).toFixed(2),
      salesKg: +(salesAgg[key]?.kg || 0).toFixed(2),
      salesValue: +(salesAgg[key]?.value || 0).toFixed(2),
      wastageKg: +(wastageAgg[key]?.kg || 0).toFixed(2)
    }));
  };

  const monthKeys = (() => {
    const arr = [];
    const months = 12;
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      arr.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return arr;
  })();

  const purchasesAll = aggregatePurchases('month');
  const productionAll = aggregateProduction('month');
  const salesAll = aggregateSales('month');

  const openingClosing = monthKeys.map((mk, idx) => {
    const cumPurchaseKg = Object.entries(purchasesAll).filter(([k]) => k <= mk).reduce((s, [,v]) => s + v.kg, 0);
    const cumProductionKg = Object.entries(productionAll).filter(([k]) => k <= mk).reduce((s, [,v]) => s + v, 0);
    const cumSalesKg = Object.entries(salesAll).filter(([k]) => k <= mk).reduce((s, [,v]) => s + v.kg, 0);

    const closingKg = Math.max(0, cumPurchaseKg - cumProductionKg - cumSalesKg);
    const prevCumPurchaseKg = Object.entries(purchasesAll).filter(([k]) => k < mk).reduce((s, [,v]) => s + v.kg, 0);
    const prevCumProductionKg = Object.entries(productionAll).filter(([k]) => k < mk).reduce((s, [,v]) => s + v, 0);
    const prevCumSalesKg = Object.entries(salesAll).filter(([k]) => k < mk).reduce((s, [,v]) => s + v.kg, 0);
    const openingKg = Math.max(0, prevCumPurchaseKg - prevCumProductionKg - prevCumSalesKg);

    const cumPurchaseValue = Object.entries(purchasesAll).filter(([k]) => k <= mk).reduce((s, [,v]) => s + v.value, 0);
    const avgRate = (cumPurchaseKg > 0) ? (cumPurchaseValue / cumPurchaseKg) : 0;
    const openingValue = +(openingKg * avgRate).toFixed(2);
    const closingValue = +(closingKg * avgRate).toFixed(2);

    return { month: mk, openingKg: +openingKg.toFixed(2), closingKg: +closingKg.toFixed(2), openingValue, closingValue };
  });

  const monthlySummary = buildSummary('month');
  const quarterlySummary = buildSummary('quarter');
  const yearlySummary = buildSummary('year');

  const wastageMap = aggregateWastage('month');
  const wastageValues = Object.keys(wastageMap).filter(k => monthKeys.includes(k)).map(k => wastageMap[k].kg || 0);
  const avgMonthlyWastKg = wastageValues.length ? (wastageValues.reduce((a,b)=>a+b,0) / wastageValues.length) : 0;

  const sumPeriod = (summaryRows) => summaryRows.reduce((acc, r) => {
    acc.purchaseKg += r.purchaseKg; acc.purchaseValue += r.purchaseValue;
    acc.productionKg += r.productionKg; acc.salesKg += r.salesKg; acc.salesValue += r.salesValue;
    acc.wastageKg += r.wastageKg;
    return acc;
  }, { purchaseKg:0, purchaseValue:0, productionKg:0, salesKg:0, salesValue:0, wastageKg:0 });

  const monthlyTotals = sumPeriod(monthlySummary);
  const quarterlyTotals = sumPeriod(quarterlySummary);
  const yearlyTotals = sumPeriod(yearlySummary);

  const [editingOrderId, setEditingOrderId] = React.useState(null);
  const [manualProduced, setManualProduced] = React.useState('');

  const startEditProduced = (order) => {
    setEditingOrderId(order.id);
    const pLogs = production.filter(p => p.orderId === order.id);
    let producedQty = 0;
    const item = items.find(i => i.id === order.itemId);
    const isPpc = item?.itemType === 'PPC' || item?.Item_Type === 'PPC';
    if (isPpc) {
      const cPiecesPerSet = Math.max(1, parseInt(order.smallPerSet || 2) - 1);
      const sPiecesPerSet = Math.max(1, parseInt(order.commonPerSet || 2) - 1);
      let totalCommonPieces = 0; let totalSmallPieces = 0;
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
    setManualProduced(String(producedQty || 0));
  };

  const saveManualProduced = async (orderId) => {
    const val = parseInt(manualProduced || 0);
    await updateDoc(getDocRef('orders', orderId), { adjustedProduced: val });
    addLog(`Admin adjusted produced qty for order ${orderId} => ${val}`);
    setEditingOrderId(null);
    setManualProduced('');
  };

  return (
    <div className="max-w-7xl mx-auto pb-12">
      <h2 className="text-3xl font-bold mb-8 text-stone-900">Admin Dashboard</h2>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-lg border border-stone-200 shadow-sm">
          <p className="text-xs text-stone-500 uppercase font-semibold mb-1">Monthly Purchases</p>
          <p className="text-2xl font-bold text-stone-900">{monthlyTotals.purchaseKg.toFixed(0)} <span className="text-xs text-stone-500 font-normal">kg</span></p>
          <p className="text-sm text-stone-600 mt-1">₹{monthlyTotals.purchaseValue.toFixed(0)}</p>
        </div>
        <div className="bg-white p-5 rounded-lg border border-stone-200 shadow-sm">
          <p className="text-xs text-stone-500 uppercase font-semibold mb-1">Monthly Production</p>
          <p className="text-2xl font-bold text-stone-900">{monthlyTotals.productionKg.toFixed(0)} <span className="text-xs text-stone-500 font-normal">kg</span></p>
        </div>
        <div className="bg-white p-5 rounded-lg border border-stone-200 shadow-sm">
          <p className="text-xs text-stone-500 uppercase font-semibold mb-1">Monthly Sales</p>
          <p className="text-2xl font-bold text-stone-900">{monthlyTotals.salesKg.toFixed(0)} <span className="text-xs text-stone-500 font-normal">kg</span></p>
          <p className="text-sm text-stone-600 mt-1">₹{monthlyTotals.salesValue.toFixed(0)}</p>
        </div>
        <div className="bg-white p-5 rounded-lg border border-stone-200 shadow-sm">
          <p className="text-xs text-stone-500 uppercase font-semibold mb-1">Avg Monthly Wastage</p>
          <p className="text-2xl font-bold text-red-600">{avgMonthlyWastKg.toFixed(2)} <span className="text-xs text-stone-500 font-normal">kg</span></p>
        </div>
      </div>

      {/* PERIOD TOTALS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-5 rounded-lg border border-blue-200">
          <h3 className="text-sm font-bold text-blue-900 mb-3">Quarterly (Purchases)</h3>
          <p className="text-2xl font-bold text-blue-900">{quarterlyTotals.purchaseKg.toFixed(0)} kg</p>
          <p className="text-sm text-blue-700 mt-1">₹{quarterlyTotals.purchaseValue.toFixed(0)}</p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 p-5 rounded-lg border border-green-200">
          <h3 className="text-sm font-bold text-green-900 mb-3">Yearly (Production)</h3>
          <p className="text-2xl font-bold text-green-900">{yearlyTotals.productionKg.toFixed(0)} kg</p>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-5 rounded-lg border border-purple-200">
          <h3 className="text-sm font-bold text-purple-900 mb-3">Yearly (Sales)</h3>
          <p className="text-2xl font-bold text-purple-900">{yearlyTotals.salesKg.toFixed(0)} kg</p>
          <p className="text-sm text-purple-700 mt-1">₹{yearlyTotals.salesValue.toFixed(0)}</p>
        </div>
      </div>

      {/* OPENING / CLOSING STOCK TABLE */}
      <div className="bg-white rounded-lg border border-stone-200 shadow-sm mb-8">
        <div className="p-5 border-b border-stone-200">
          <h3 className="text-lg font-bold text-stone-900">Opening & Closing Stock (Last 12 Months)</h3>
          <p className="text-xs text-stone-500 mt-1">Includes finished goods inventory</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="p-4 text-left font-semibold text-stone-700">Month</th>
                <th className="p-4 text-right font-semibold text-stone-700">Opening (kg)</th>
                <th className="p-4 text-right font-semibold text-stone-700">Closing (kg)</th>
                <th className="p-4 text-right font-semibold text-stone-700">Opening (₹)</th>
                <th className="p-4 text-right font-semibold text-stone-700">Closing (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {openingClosing.map(r => (
                <tr key={r.month} className="hover:bg-stone-50">
                  <td className="p-4 font-medium text-stone-900">{r.month}</td>
                  <td className="p-4 text-right text-stone-700">{r.openingKg.toFixed(1)}</td>
                  <td className="p-4 text-right text-stone-700">{r.closingKg.toFixed(1)}</td>
                  <td className="p-4 text-right text-stone-700">₹{r.openingValue.toFixed(0)}</td>
                  <td className="p-4 text-right text-stone-700">₹{r.closingValue.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MONTHLY DETAILS TABLE */}
      <div className="bg-white rounded-lg border border-stone-200 shadow-sm mb-8">
        <div className="p-5 border-b border-stone-200">
          <h3 className="text-lg font-bold text-stone-900">Detailed Monthly Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="p-4 text-left font-semibold text-stone-700">Period</th>
                <th className="p-4 text-right font-semibold text-stone-700">Purchase (kg)</th>
                <th className="p-4 text-right font-semibold text-stone-700">Purchase (₹)</th>
                <th className="p-4 text-right font-semibold text-stone-700">Production (kg)</th>
                <th className="p-4 text-right font-semibold text-stone-700">Sales (kg)</th>
                <th className="p-4 text-right font-semibold text-stone-700">Sales (₹)</th>
                <th className="p-4 text-right font-semibold text-red-700">Wastage (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {monthlySummary.slice(0, 12).map(r => (
                <tr key={r.period} className="hover:bg-stone-50">
                  <td className="p-4 font-medium text-stone-900">{r.period}</td>
                  <td className="p-4 text-right text-stone-700">{r.purchaseKg.toFixed(0)}</td>
                  <td className="p-4 text-right text-stone-700">₹{r.purchaseValue.toFixed(0)}</td>
                  <td className="p-4 text-right text-stone-700">{r.productionKg.toFixed(0)}</td>
                  <td className="p-4 text-right text-stone-700">{r.salesKg.toFixed(2)}</td>
                  <td className="p-4 text-right text-stone-700">₹{r.salesValue.toFixed(0)}</td>
                  <td className="p-4 text-right text-red-600 font-medium">{r.wastageKg.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* EDIT FINISHED GOODS */}
      <div className="bg-white rounded-lg border border-stone-200 shadow-sm">
        <div className="p-5 border-b border-stone-200">
          <h3 className="text-lg font-bold text-stone-900">Adjust Finished Goods (Per Order)</h3>
          <p className="text-xs text-stone-500 mt-1">Manually override produced quantity if there are discrepancies</p>
        </div>
        <div className="p-5 space-y-3 max-h-96 overflow-y-auto">
          {orders.length === 0 && <p className="text-stone-500 text-center py-4">No orders found.</p>}
          {orders.slice().sort((a,b) => (b.orderDate||'').localeCompare(a.orderDate||'')).map(o => {
            const item = items.find(i => i.id === o.itemId);
            const company = companies.find(c => c.id === o.companyId);
            const produced = o.adjustedProduced != null ? o.adjustedProduced : 'Auto';
            return (
              <div key={o.id} className="flex items-center justify-between gap-3 border p-4 rounded hover:bg-stone-50">
                <div className="flex-1">
                  <div className="font-bold text-stone-900">{o.itemName || o.Item_Name}</div>
                  <div className="text-xs text-stone-500 mt-1">{company?.name || 'Unknown'} • Target: {o.orderQty} units • Rate: ₹{parseFloat(o.rate||0).toFixed(2)}</div>
                </div>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  {editingOrderId === o.id ? (
                    <>
                      <input type="number" className="p-2 border border-stone-300 rounded w-20 text-sm" value={manualProduced} onChange={e => setManualProduced(e.target.value)} />
                      <button onClick={() => saveManualProduced(o.id)} className="bg-green-600 text-white px-3 py-2 rounded text-sm hover:bg-green-700">Save</button>
                      <button onClick={() => { setEditingOrderId(null); setManualProduced(''); }} className="px-3 py-2 border border-stone-300 rounded text-sm hover:bg-stone-50">Cancel</button>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-medium text-stone-700 bg-stone-100 px-3 py-2 rounded">Produced: <span className="font-bold">{produced}</span></div>
                      <button onClick={() => startEditProduced(o)} className="px-3 py-2 border border-stone-300 rounded text-sm hover:bg-stone-50">Edit</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}