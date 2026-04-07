\import React, { useState, useEffect, useRef } from 'react';
import { 
  Calculator, Package, Building2, Users, History, LogOut, Plus, Trash2, Lock, ShieldAlert, CheckCircle2, Download, Upload, Factory, Coins, PieChart, ShoppingCart, Edit2, Archive, Search, Truck, ScanLine, Loader2
} from 'lucide-react';

// ==========================================
// 1. FIREBASE SETUP & API KEYS (SECURED)
// ==========================================
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

// Keys are hidden and pulled securely from your local .env file or Vercel Environment Variables
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

const appId = 'mahapack-erp';

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

      // Smart Scan: Find the first row that actually has text (skips leading blank rows)
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
        
        // Skip rows that are completely empty commas (e.g. ,,,,,,)
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
    const getColRef = (colName) => collection(db, 'artifacts', appId, 'public', 'data', colName);
    const logError = (err) => console.error("Snapshot error:", err);

    const unsubUsers = onSnapshot(getColRef('erp_users'), (snap) => setErpUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubCompanies = onSnapshot(getColRef('companies'), (snap) => setCompanies(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubItems = onSnapshot(getColRef('items'), (snap) => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubProduction = onSnapshot(getColRef('production'), (snap) => setProduction(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubOrders = onSnapshot(getColRef('orders'), (snap) => setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubWastage = onSnapshot(getColRef('wastage'), (snap) => setWastageLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubInventory = onSnapshot(getColRef('inventory'), (snap) => setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);
    const unsubLogs = onSnapshot(getColRef('logs'), (snap) => setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))), logError);

    setIsDbReady(true);
    return () => { unsubUsers(); unsubCompanies(); unsubItems(); unsubProduction(); unsubOrders(); unsubWastage(); unsubInventory(); unsubLogs(); };
  }, [firebaseUser]);

  const getColRef = (colName) => collection(db, 'artifacts', appId, 'public', 'data', colName);
  const getDocRef = (colName, docId) => doc(db, 'artifacts', appId, 'public', 'data', colName, docId);

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
        {activeTab === 'production' && <ProductionView production={production} orders={orders} items={items} companies={companies} addLog={addLog} role={currentErpUser.role} getColRef={getColRef} getDocRef={getDocRef} currentUser={currentErpUser} />}
        {activeTab === 'finished_goods' && <FinishedGoodsView orders={orders} production={production} items={items} companies={companies} addLog={addLog} getDocRef={getDocRef} currentUser={currentErpUser} />}
        {activeTab === 'wastage' && <WastageView wastageLogs={wastageLogs} addLog={addLog} role={currentErpUser.role} getColRef={getColRef} getDocRef={getDocRef} />}
        {activeTab === 'inventory' && <InventoryView inventory={inventory} production={production} addLog={addLog} role={currentErpUser.role} getColRef={getColRef} getDocRef={getDocRef} />}
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

    let boardLength = 0;
    let boardWidth = 0;

    switch (type) {
      case 'Box':
        boardLength = (L + W) * 2 + 50; 
        boardWidth = W + H + 20;
        break;
      case 'Tray':
        boardLength = (L + W * 2) + 10;
        boardWidth = (W + 2 * H) + 10;
        break;
      case 'Sheet':
        boardLength = L;
        boardWidth = W;
        break;
      case 'Partition':
        boardLength = L * 1.5;
        boardWidth = W;
        break;
      default:
        boardLength = (L + W) * 2 + 50;
        boardWidth = W + H + 20;
    }

    const sqMetersPerBox = (boardLength * boardWidth) / 1000000;
    const totalSqMeters = sqMetersPerBox * qty;
    
    // --- FLUTING CALCULATION ---
    // Count how many liners and how many flutes are in the ply
    const numFlutes = Math.floor(ply / 2);
    const numLiners = Math.ceil(ply / 2);
    
    // Apply 40% extra (1.40 multiplier) only to the flute layers
    const flutingFactor = 1.40; 
    
    const linerSqMeters = totalSqMeters * numLiners;
    const fluteSqMeters = totalSqMeters * numFlutes * flutingFactor;
    
    const paperRequiredKg = ((linerSqMeters + fluteSqMeters) * gsm) / 1000; 

    setResult({
      boardLength: boardLength.toFixed(2),
      boardWidth: boardWidth.toFixed(2),
      totalArea: totalSqMeters.toFixed(2),
      paperRequired: paperRequiredKg.toFixed(2),
      itemDetails: item
    });

    addLog(`Calculated materials for ${qty}x ${item.name || item.Item_Name} (${type})`);
  };

  const filteredItems = items.filter(i => i.companyId === selectedCompany);

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
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Order Quantity</label>
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
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-stone-700">
                <div><p className="text-stone-400 text-sm">Board Size Needed</p><p className="font-mono text-lg">{result.boardLength} mm x {result.boardWidth} mm</p></div>
                <div><p className="text-stone-400 text-sm">Total Area (sq.m)</p><p className="font-mono text-lg">{result.totalArea}</p></div>
              </div>
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

// --- WASTAGE VIEW ---
function WastageView({ wastageLogs, addLog, role, getColRef, getDocRef }) {
  const [newLog, setNewLog] = useState({ date: new Date().toISOString().split('T')[0], totalReelsKg: '', productionKg: '', paperWastage: '', sheetWastage: '', corePipe: '', balanceReel: '', gumUsed: '', gumPrice: '' });

  const tReels = parseFloat(newLog.totalReelsKg) || 0;
  const pKg = parseFloat(newLog.productionKg) || 0; // Gross production
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
    setNewLog({ date: new Date().toISOString().split('T')[0], totalReelsKg: '', productionKg: '', paperWastage: '', sheetWastage: '', corePipe: '', balanceReel: '', gumUsed: '', gumPrice: '' });
  };

  const handleDelete = async (id, date) => {
    if(window.confirm(`Delete wastage log for ${date}?`)) {
      await deleteDoc(getDocRef('wastage', id));
      addLog(`Deleted wastage log for ${date}`);
    }
  };

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Wastage & Gum Calculator</h2>
        <button onClick={() => downloadCSV(wastageLogs, 'wastage_logs')} className="flex items-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-300 font-medium text-sm transition"><Download className="w-4 h-4" /> Export to Excel</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-stone-200">
          <h3 className="font-bold mb-4 border-b pb-2">Daily Input Data</h3>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-1 md:col-span-2"><label className="block text-xs font-medium text-stone-500 mb-1">Date</label><input required type="date" className="w-full p-2 border border-stone-300 rounded bg-stone-50" value={newLog.date} onChange={e => setNewLog({...newLog, date: e.target.value})} /></div>
            <div className="col-span-1"><label className="block text-xs font-medium text-stone-500 mb-1">Total Reels Issued (KG)</label><input required type="number" step="0.1" className="w-full p-2 border border-stone-300 rounded focus:ring-2 focus:ring-stone-800" value={newLog.totalReelsKg} onChange={e => setNewLog({...newLog, totalReelsKg: e.target.value})} /></div>
            <div className="col-span-1"><label className="block text-xs font-medium text-stone-500 mb-1">Gross Production (KG)</label><input required type="number" step="0.1" className="w-full p-2 border border-stone-300 rounded focus:ring-2 focus:ring-stone-800" value={newLog.productionKg} onChange={e => setNewLog({...newLog, productionKg: e.target.value})} /></div>
            <div className="col-span-1"><label className="block text-xs font-medium text-stone-500 mb-1">Paper Wastage (KG)</label><input required type="number" step="0.1" className="w-full p-2 border border-stone-300 rounded focus:ring-2 focus:ring-stone-800" value={newLog.paperWastage} onChange={e => setNewLog({...newLog, paperWastage: e.target.value})} /></div>
            <div className="col-span-1"><label className="block text-xs font-medium text-stone-500 mb-1">Sheet Wastage (KG)</label><input required type="number" step="0.1" className="w-full p-2 border border-stone-300 rounded focus:ring-2 focus:ring-stone-800" value={newLog.sheetWastage} onChange={e => setNewLog({...newLog, sheetWastage: e.target.value})} /></div>
            <div className="col-span-1"><label className="block text-xs font-medium text-stone-500 mb-1">Core Pipe Weight (KG)</label><input required type="number" step="0.1" className="w-full p-2 border border-stone-300 rounded focus:ring-2 focus:ring-stone-800" value={newLog.corePipe} onChange={e => setNewLog({...newLog, corePipe: e.target.value})} /></div>
            <div className="col-span-1 md:col-span-2"><label className="block text-xs font-medium text-stone-500 mb-1">Balance Reel Return (KG)</label><input required type="number" step="0.1" className="w-full p-2 border border-stone-300 rounded focus:ring-2 focus:ring-stone-800" value={newLog.balanceReel} onChange={e => setNewLog({...newLog, balanceReel: e.target.value})} /></div>
            <div className="col-span-1 border-t pt-4"><label className="block text-xs font-medium text-stone-500 mb-1">Actual Gum Used (KG)</label><input required type="number" step="0.1" className="w-full p-2 border border-stone-300 rounded focus:ring-2 focus:ring-stone-800" value={newLog.gumUsed} onChange={e => setNewLog({...newLog, gumUsed: e.target.value})} /></div>
            <div className="col-span-1 border-t pt-4"><label className="block text-xs font-medium text-stone-500 mb-1">Gum Price (per KG)</label><input required type="number" step="0.1" className="w-full p-2 border border-stone-300 rounded focus:ring-2 focus:ring-stone-800" value={newLog.gumPrice} onChange={e => setNewLog({...newLog, gumPrice: e.target.value})} /></div>
            <div className="col-span-1 md:col-span-2 mt-2"><button type="submit" className="w-full bg-stone-900 text-white p-3 rounded-lg flex items-center justify-center gap-2 hover:bg-stone-800"><Plus className="w-5 h-5" /> Save Daily Log</button></div>
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
            <tr><th className="p-4">Date</th><th className="p-4">Total Issued</th><th className="p-4">Core/Balance</th><th className="p-4">Prod (Gross/Good)</th><th className="p-4">Wastage (Pap/Sht)</th><th className="p-4 bg-stone-200">Net Paper</th><th className="p-4 bg-green-100 text-green-800">Gum Usage & Cost</th><th className="p-4 bg-red-100 text-red-800">Wastage %</th>{role === 'admin' && <th className="p-4 text-right">Actions</th>}</tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {wastageLogs.length === 0 && <tr><td colSpan="9" className="p-4 text-center text-stone-500">No wastage records found.</td></tr>}
            {[...wastageLogs].sort((a,b) => new Date(b.date) - new Date(a.date)).map(record => (
              <tr key={record.id} className="hover:bg-stone-50">
                <td className="p-4 font-medium">{record.date}</td>
                <td className="p-4">{record.totalReelsKg} kg</td>
                <td className="p-4 text-xs text-stone-500">Core: {record.corePipe}kg<br/>Bal: {record.balanceReel}kg</td>
                <td className="p-4"><p className="text-stone-500 text-xs">Gross: {record.productionKg} kg</p><p className="font-bold text-stone-800">Good: {record.goodProductionKg || (record.productionKg - record.sheetWastage).toFixed(2)} kg</p></td>
                <td className="p-4 text-sm text-red-600"><p>Pap: {record.paperWastage || 0} kg</p><p>Sht: {record.sheetWastage} kg</p></td>
                <td className="p-4 font-mono font-semibold bg-stone-50">{record.calculatedNetPaper} kg</td>
                <td className="p-4 bg-green-50/30"><p className="font-bold text-green-800 font-mono">{record.gumUsed || 0} <span className="text-xs font-normal text-green-700">kg</span></p><p className="text-xs font-medium text-stone-700 mt-1">{record.gumCostPerKgPaper} /kg paper</p></td>
                <td className="p-4 font-mono font-bold text-red-700 bg-red-50/30">{record.calculatedWastagePercent}%</td>
                {role === 'admin' && <td className="p-4 text-right"><button onClick={() => handleDelete(record.id, record.date)} className="text-red-500 hover:text-red-700"><Trash2 className="w-5 h-5 inline" /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- FINISHED GOODS VIEW ---
function FinishedGoodsView({ orders, production, items, companies, addLog, getDocRef, currentUser }) {
  const allowedCompanyId = currentUser?.role === 'admin' ? 'all' : (currentUser?.companyId || 'all');
  const visibleOrders = allowedCompanyId === 'all' ? orders : orders.filter(o => o.companyId === allowedCompanyId);

  const [dispatchForm, setDispatchForm] = useState({ orderId: null, qty: '' });

  const handleDispatch = async (e, order, inStock, qtyToDispatch = null) => {
    if (e) e.preventDefault();
    const qty = qtyToDispatch || parseInt(e.target.dispatchQty.value);
    if (!qty || qty <= 0 || qty > inStock) return;
    
    const currentDispatched = parseInt(order.dispatchedQty || 0);
    const newDispatched = currentDispatched + qty;

    const newHistory = [...(order.dispatchHistory || []), {
      date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      qty: qty
    }];

    await updateDoc(getDocRef('orders', order.id), { 
      dispatchedQty: newDispatched,
      dispatchHistory: newHistory
    });
    
    addLog(`Dispatched ${qty} boxes for Order: ${order.itemName}`);
    if (e) e.target.reset(); 
  };

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Finished Goods & Dispatch Dashboard</h2>
      </div>

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
              const pLogs = production.filter(p => p.orderId === order.id);
              const getGoodSheets = (p) => parseFloat(p.linerQty || 0);
              
              const sumBoard = pLogs.filter(p => p.paperUsedFor === 'Board').reduce((acc, p) => acc + getGoodSheets(p), 0);
              const sumLiner = pLogs.filter(p => p.paperUsedFor === 'Liner').reduce((acc, p) => acc + getGoodSheets(p), 0);
              const sumPaper = pLogs.filter(p => p.paperUsedFor === 'Paper').reduce((acc, p) => acc + getGoodSheets(p), 0);
              
              const item = items.find(i => i.id === order.itemId);
              const ply = parseInt(item?.ply || item?.Ply || 3);
              
              let effectiveBase = 0;
              if (ply <= 2) { effectiveBase = sumBoard + sumLiner; } 
              else { effectiveBase = sumBoard + Math.min(sumLiner, sumPaper); }
              
              const producedQty = Math.floor(effectiveBase * parseFloat(order.plannedUps || 1));
              const totalKgUsed = pLogs.reduce((acc, p) => acc + Math.max(0, parseFloat(p.useKg || 0) - parseFloat(p.wasteSheetsKg || 0)), 0);
              const avgWeightKg = producedQty > 0 ? (totalKgUsed / producedQty) : 0;
              
              const dispatchedQty = parseInt(order.dispatchedQty || 0);
              const rate = parseFloat(order.rate || 0);
              
              const dispatchedWeight = dispatchedQty * avgWeightKg;
              const dispatchedValue = dispatchedQty * rate;

              const inStock = Math.max(0, producedQty - dispatchedQty);
              const stockWeight = inStock * avgWeightKg;
              const stockValue = inStock * rate;

              if (producedQty <= 0 && dispatchedQty <= 0) return null; 

              const compName = companies.find(c => c.id === order.companyId)?.name || 'Unknown';

              return (
                <tr key={order.id} className={`hover:bg-stone-50 ${dispatchForm.orderId === order.id ? 'bg-blue-50/50' : ''}`}>
                  <td className="p-4">
                    <p className="font-bold text-stone-900">{compName}</p>
                    <p className="text-xs text-stone-500">Ordered: {order.orderDate}</p>
                  </td>
                  <td className="p-4">
                    <p className="font-medium text-stone-800">{order.itemName || order.Item_Name}</p>
                    <p className="text-xs text-stone-500">{item?.weight || item?.Weight_g ? `${item.weight || item.Weight_g}g` : '-'} | ₹{rate.toFixed(2)}/box</p>
                  </td>
                  <td className="p-4 bg-blue-50/30">
                    <p className="font-bold text-lg text-blue-700">{producedQty}</p>
                    <p className="text-xs font-medium text-blue-600">{totalKgUsed.toFixed(1)} kg total</p>
                  </td>
                  <td className="p-4 bg-orange-50/30">
                    <p className="font-bold text-lg text-orange-600">{dispatchedQty}</p>
                    <p className="text-xs font-bold text-stone-800">₹{dispatchedValue.toFixed(2)}</p>
                    <p className="text-xs font-medium text-orange-600 mb-1">{dispatchedWeight.toFixed(1)} kg</p>
                    {order.dispatchHistory && order.dispatchHistory.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-orange-200">
                        <p className="text-[10px] font-bold text-orange-800 mb-1">Dispatch History:</p>
                        <ul className="text-[10px] space-y-0.5 text-orange-700">
                          {order.dispatchHistory.map((h, i) => (
                            <li key={i}>{h.date}: <span className="font-bold">{h.qty} pcs</span></li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </td>
                  <td className="p-4 bg-green-50/30">
                    <p className="font-bold text-xl text-green-700">{inStock}</p>
                    <p className="text-sm font-bold text-stone-800">₹{stockValue.toFixed(2)}</p>
                    <p className="text-xs font-medium text-green-600">{stockWeight.toFixed(1)} kg</p>
                  </td>
                  <td className="p-4 text-right">
                    {inStock > 0 ? (
                      <form onSubmit={(e) => handleDispatch(e, order, inStock)} className="flex items-center justify-end gap-2">
                        <input required type="number" min="1" max={inStock} name="dispatchQty" className={`w-24 p-2 border border-stone-300 rounded text-sm bg-white focus:ring-2 focus:ring-stone-800 focus:outline-none ${dispatchForm.orderId === order.id ? 'ring-2 ring-blue-500' : ''}`} placeholder="Qty..." value={dispatchForm.orderId === order.id ? dispatchForm.qty : undefined} onChange={dispatchForm.orderId === order.id ? (e) => setDispatchForm({...dispatchForm, qty: e.target.value}) : undefined} />
                        <button type="submit" className="bg-stone-900 text-white px-4 py-2 rounded text-xs font-bold hover:bg-stone-800">
                          Dispatch
                        </button>
                        {dispatchForm.orderId === order.id && <button type="button" onClick={() => setDispatchForm({orderId: null, qty: ''})} className="bg-stone-200 px-2 py-1.5 rounded text-xs">Cancel</button>}
                      </form>
                    ) : (
                      <span className="text-xs font-bold text-stone-400 bg-stone-100 px-3 py-1.5 rounded">No Stock</span>
                    )}
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

// --- INVENTORY VIEW ---
function InventoryView({ inventory, production, addLog, role, getColRef, getDocRef }) {
  const [editingId, setEditingId] = useState(null);
  const [newReel, setNewReel] = useState({
    date: new Date().toISOString().split('T')[0], millName: '', invoiceNo: '', vehicleNo: '', reelNo: '', size: '', gsm: '', bf: '', colour: 'Kraft', receivedQty: '', ratePerKg: ''
  });
  const [filters, setFilters] = useState({ searchReel: '', size: '', gsm: '', bf: '', colour: '', status: 'All' });

  const handleAddOrUpdate = async (e) => {
    e.preventDefault();
    if (editingId) {
      await updateDoc(getDocRef('inventory', editingId), newReel);
      addLog(`Updated inventory reel: ${newReel.reelNo}`);
      setEditingId(null);
    } else {
      await addDoc(getColRef('inventory'), newReel);
      addLog(`Added inventory reel: ${newReel.reelNo} from ${newReel.millName}`);
    }
    setNewReel({ date: new Date().toISOString().split('T')[0], millName: '', invoiceNo: '', vehicleNo: '', reelNo: '', size: '', gsm: '', bf: '', colour: 'Kraft', receivedQty: '', ratePerKg: '' });
  };

  const handleEdit = (reel) => { setEditingId(reel.id); setNewReel(reel); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const handleDelete = async (id, reelNo) => { if(window.confirm(`Delete inventory record for Reel ${reelNo}?`)) { await deleteDoc(getDocRef('inventory', id)); addLog(`Deleted inventory reel: ${reelNo}`); } };
  const cancelEdit = () => { setEditingId(null); setNewReel({ date: new Date().toISOString().split('T')[0], millName: '', invoiceNo: '', vehicleNo: '', reelNo: '', size: '', gsm: '', bf: '', colour: 'Kraft', receivedQty: '', ratePerKg: '' }); };

  const balances = {};
  const usageStats = {}; 
  inventory.forEach(reel => {
    const rNo = String(reel.reelNo || '').trim().toLowerCase();
    balances[rNo] = parseFloat(reel.receivedQty || 0);
    usageStats[rNo] = { issued: 0, log: [] };
  });

  const sortedProd = [...production].sort((a,b) => new Date(a.date) - new Date(b.date));
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
    const issuedQty = stats.issued;
    const received = parseFloat(reel.receivedQty || 0);
    const balanceQty = Math.max(0, received - issuedQty);
    const rate = parseFloat(reel.ratePerKg || 0);
    const value = balanceQty * rate;
    return { ...reel, issuedQty, balanceQty, value, ratePerKg: rate, usageLog: stats.log };
  });

  const filteredInventory = inventoryWithUsage.filter(reel => {
    if (filters.searchReel && !String(reel.reelNo || '').toLowerCase().includes(filters.searchReel.toLowerCase())) return false;
    if (filters.size && !String(reel.size || '').toLowerCase().includes(filters.size.toLowerCase())) return false;
    if (filters.gsm && String(reel.gsm || '') !== String(filters.gsm)) return false;
    if (filters.bf && String(reel.bf || '') !== String(filters.bf)) return false;
    if (filters.colour && String(reel.colour || '').toLowerCase() !== filters.colour.toLowerCase()) return false;
    if (filters.status === 'Available' && reel.balanceQty <= 0) return false;
    if (filters.status === 'Used' && reel.balanceQty > 0) return false;
    return true;
  });

  const handleExport = () => {
    const exportData = filteredInventory.map(reel => ({
      Date: reel.date || '', Mill_Name: reel.millName || '', Invoice_No: reel.invoiceNo || '', Vehicle_No: reel.vehicleNo || '', Reel_No: reel.reelNo || '', Size: reel.size || '', GSM: reel.gsm || '', BF: reel.bf || '', Colour: reel.colour || '', Received_Qty: reel.receivedQty || '', Issued_Qty: reel.issuedQty.toFixed(2), Balance_Qty: reel.balanceQty.toFixed(2), Rate_per_KG: reel.ratePerKg, Current_Value: reel.value.toFixed(2), Used_For_History: reel.usageLog.map(l => `${l.date}: ${l.usedFor} (${l.kg}kg)`).join(' | ')
    }));
    downloadCSV(exportData, 'stock_inventory');
  };

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Stock Inventory (Raw Materials)</h2>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-300 font-medium text-sm transition cursor-pointer">
            <Upload className="w-4 h-4" /> Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={(e) => handleCSVImport(e, 'inventory', getColRef, addLog, (row, getVal) => ({
                date: getVal(row, 'Date', 'date', 'Date / Ref') || new Date().toISOString().split('T')[0], millName: getVal(row, 'Mill Name', 'Mill_Name', 'millName') || '', invoiceNo: getVal(row, 'Invoice No', 'Invoice_No', 'invoiceNo') || '', vehicleNo: getVal(row, 'Vehicle No', 'Vehicle_No', 'vehicleNo') || '', reelNo: getVal(row, 'Reel No', 'Reel_No', 'reelNo') || '', size: getVal(row, 'Size', 'size', 'Specs') || '', gsm: getVal(row, 'GSM', 'gsm') || '', bf: getVal(row, 'BF', 'bf') || '', colour: getVal(row, 'Colour', 'Color', 'colour') || 'Kraft', receivedQty: getVal(row, 'Received Qty', 'Received_Qty', 'receivedQty', 'Received') || '', ratePerKg: getVal(row, 'Rate per KG', 'Rate_per_KG', 'ratePerKg', 'Rate') || ''
            }))} />
          </label>
          <button onClick={handleExport} className="flex items-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-300 font-medium text-sm transition"><Download className="w-4 h-4" /> Export</button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 mb-6">
        <h3 className="font-bold mb-4 flex items-center gap-2"><Archive className="w-5 h-5 text-stone-500" /> {editingId ? 'Edit Reel Entry' : 'Receive New Reel'}</h3>
        <form onSubmit={handleAddOrUpdate} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Date Received</label><input required type="date" className="w-full p-2 border rounded" value={newReel.date} onChange={e => setNewReel({...newReel, date: e.target.value})} /></div>
          <div className="col-span-1 md:col-span-2"><label className="block text-xs text-stone-500 mb-1">Mill Name</label><input required type="text" className="w-full p-2 border rounded" value={newReel.millName} onChange={e => setNewReel({...newReel, millName: e.target.value})} /></div>
          <div className="col-span-1 md:col-span-1"><label className="block text-xs text-stone-500 mb-1">Invoice No.</label><input type="text" className="w-full p-2 border rounded" value={newReel.invoiceNo} onChange={e => setNewReel({...newReel, invoiceNo: e.target.value})} /></div>
          <div className="col-span-1 md:col-span-2"><label className="block text-xs text-stone-500 mb-1">Vehicle No.</label><input type="text" className="w-full p-2 border rounded" value={newReel.vehicleNo} onChange={e => setNewReel({...newReel, vehicleNo: e.target.value})} /></div>
          <div className="col-span-1 md:col-span-2"><label className="block text-xs font-bold text-blue-700 mb-1">Reel No. (Must be unique)</label><input required type="text" className="w-full p-2 border border-blue-300 bg-blue-50 rounded font-mono font-bold text-stone-900" placeholder="e.g. 101" value={newReel.reelNo} onChange={e => setNewReel({...newReel, reelNo: e.target.value})} /></div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Size (mm/in)</label><input required type="text" className="w-full p-2 border rounded" value={newReel.size} onChange={e => setNewReel({...newReel, size: e.target.value})} /></div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">GSM</label><input required type="number" step="0.1" className="w-full p-2 border rounded" value={newReel.gsm} onChange={e => setNewReel({...newReel, gsm: e.target.value})} /></div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">BF</label><input required type="number" step="0.1" className="w-full p-2 border rounded" value={newReel.bf} onChange={e => setNewReel({...newReel, bf: e.target.value})} /></div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Colour</label><select required className="w-full p-2 border rounded" value={newReel.colour} onChange={e => setNewReel({...newReel, colour: e.target.value})}><option value="Kraft">Kraft</option><option value="Golden">Golden</option><option value="White">White</option></select></div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Received Qty (KG)</label><input required type="number" step="0.1" className="w-full p-2 border rounded bg-green-50" value={newReel.receivedQty} onChange={e => setNewReel({...newReel, receivedQty: e.target.value})} /></div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Rate / KG (₹)</label><input required type="number" step="0.01" className="w-full p-2 border rounded" value={newReel.ratePerKg} onChange={e => setNewReel({...newReel, ratePerKg: e.target.value})} /></div>
          <div className="col-span-1 lg:col-span-4 flex gap-2 mt-2"><button type="submit" className="flex-1 bg-stone-900 text-white p-2 rounded flex items-center justify-center gap-2 hover:bg-stone-800">{editingId ? <><Edit2 className="w-4 h-4" /> Update Reel</> : <><Plus className="w-4 h-4" /> Save to Inventory</>}</button>{editingId && <button type="button" onClick={cancelEdit} className="bg-stone-300 text-stone-800 p-2 rounded hover:bg-stone-400 px-6">Cancel</button>}</div>
        </form>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-200 mb-6 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 text-stone-500 mr-2"><Search className="w-4 h-4"/> Filter:</div>
        <input type="text" placeholder="Reel No" className="p-2 border rounded text-sm w-24" value={filters.searchReel} onChange={e => setFilters({...filters, searchReel: e.target.value})} />
        <input type="text" placeholder="Size" className="p-2 border rounded text-sm w-20" value={filters.size} onChange={e => setFilters({...filters, size: e.target.value})} />
        <input type="text" placeholder="GSM" className="p-2 border rounded text-sm w-16" value={filters.gsm} onChange={e => setFilters({...filters, gsm: e.target.value})} />
        <input type="text" placeholder="BF" className="p-2 border rounded text-sm w-16" value={filters.bf} onChange={e => setFilters({...filters, bf: e.target.value})} />
        <select className="p-2 border rounded text-sm" value={filters.colour} onChange={e => setFilters({...filters, colour: e.target.value})}><option value="">All Colours</option><option value="Kraft">Kraft</option><option value="Golden">Golden</option><option value="White">White</option></select>
        <select className="p-2 border rounded text-sm font-bold bg-stone-50" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}><option value="All">All Statuses</option><option value="Available">Only Available (Balance &gt; 0)</option><option value="Used">Used / Empty (Balance = 0)</option></select>
        <button onClick={() => setFilters({searchReel: '', size: '', gsm: '', bf: '', colour: '', status: 'All'})} className="text-xs text-blue-500 underline ml-2">Clear</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-left min-w-[1200px]">
          <thead className="bg-stone-100 text-stone-600 text-sm">
            <tr><th className="p-4">Date / Ref</th><th className="p-4">Reel No</th><th className="p-4">Specs</th><th className="p-4">Received</th><th className="p-4 bg-orange-50 text-orange-800">Issued (Auto)</th><th className="p-4 bg-green-50 text-green-800">Balance</th><th className="p-4">Rate & Value (₹)</th><th className="p-4">Used For (Production Link)</th>{role === 'admin' && <th className="p-4 text-right">Actions</th>}</tr>
          </thead>
          <tbody className="divide-y divide-stone-200 text-sm">
            {filteredInventory.length === 0 && <tr><td colSpan="9" className="p-4 text-center text-stone-500">No inventory records found.</td></tr>}
            {[...filteredInventory].sort((a,b) => new Date(b.date) - new Date(a.date)).map(reel => {
              const isAvailable = reel.balanceQty > 0;
              return (
              <tr key={reel.id} className={`hover:bg-stone-50 ${!isAvailable ? 'opacity-60 bg-stone-50' : ''}`}>
                <td className="p-4"><div className="font-medium">{reel.date}</div><div className="text-xs text-stone-500">{reel.millName}</div><div className="text-[10px] text-stone-400">Veh: {reel.vehicleNo || '-'}</div></td>
                <td className="p-4"><span className={`font-mono font-bold text-lg ${isAvailable ? 'text-blue-700' : 'text-stone-500'}`}>{reel.reelNo}</span>{!isAvailable && <span className="ml-2 text-[10px] bg-stone-300 px-1 py-0.5 rounded text-stone-700 font-bold">EMPTY</span>}</td>
                <td className="p-4 text-stone-600"><div>{reel.size}</div><div className="text-xs">{reel.gsm} GSM | {reel.bf} BF</div><div className="text-xs">{reel.colour}</div></td>
                <td className="p-4 font-semibold">{reel.receivedQty} kg</td>
                <td className="p-4 font-semibold text-orange-600 bg-orange-50/30">{reel.issuedQty > 0 ? reel.issuedQty.toFixed(1) : '-'} kg</td>
                <td className="p-4 bg-green-50/30"><span className={`font-bold text-lg ${isAvailable ? 'text-green-700' : 'text-stone-500'}`}>{reel.balanceQty.toFixed(1)} kg</span></td>
                <td className="p-4"><div className="text-xs text-stone-500 mb-1">Rate: ₹{reel.ratePerKg.toFixed(2)}/kg</div><div className="font-bold text-stone-800 text-base">₹{reel.value.toFixed(2)}</div></td>
                <td className="p-4">{reel.usageLog.length === 0 ? <span className="text-stone-400 italic text-xs">Not used yet</span> : (<ul className="text-xs space-y-1">{reel.usageLog.map((log, idx) => (<li key={idx} className="flex gap-2"><span className="text-stone-400">{log.date}</span><span className="font-medium text-stone-700">{log.usedFor}</span><span className="text-orange-600 font-mono">({log.kg}kg)</span></li>))}</ul>)}</td>
                {role === 'admin' && <td className="p-4 text-right whitespace-nowrap"><button onClick={() => handleEdit(reel)} className="text-blue-500 hover:text-blue-700 mr-3" title="Edit"><Edit2 className="w-5 h-5 inline" /></button><button onClick={() => handleDelete(reel.id, reel.reelNo)} className="text-red-500 hover:text-red-700" title="Delete"><Trash2 className="w-5 h-5 inline" /></button></td>}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- PRODUCTION VIEW ---
function ProductionView({ production, orders, items, companies, addLog, role, getColRef, getDocRef, currentUser }) {
  const allowedCompanyId = currentUser?.role === 'admin' ? 'all' : (currentUser?.companyId || 'all');
  const visibleCompanies = allowedCompanyId === 'all' ? companies : companies.filter(c => c.id === allowedCompanyId);
  const visibleItems = allowedCompanyId === 'all' ? items : items.filter(i => i.companyId === allowedCompanyId);
  const visibleProduction = allowedCompanyId === 'all' ? production : production.filter(p => p.companyId === allowedCompanyId);
  const visibleOrders = allowedCompanyId === 'all' ? orders : orders.filter(o => o.companyId === allowedCompanyId);

  const [editingId, setEditingId] = useState(null);
  const [newRecord, setNewRecord] = useState({ 
    date: new Date().toISOString().split('T')[0], orderId: '', companyId: allowedCompanyId !== 'all' ? allowedCompanyId : '', millName: '', reelNos: '', paperUsedFor: 'Paper', usedForItem: '', 
    size: '', gsm: '', bf: '', useKg: '', linerQty: '', wasteSheetsKg: '', numberOfUps: '1' 
  });

  const handleOrderLink = (orderId) => {
    if (!orderId) {
      setNewRecord({...newRecord, orderId: ''});
      return;
    }
    const ord = orders.find(o => o.id === orderId);
    if (ord) {
      setNewRecord({ ...newRecord, orderId: orderId, companyId: ord.companyId, usedForItem: ord.itemName || ord.Item_Name, numberOfUps: ord.plannedUps || '1' });
    }
  };

  const handleAddOrUpdate = async (e) => {
    e.preventDefault();
    if (editingId) {
      await updateDoc(getDocRef('production', editingId), newRecord);
      addLog(`Updated production record: Reels ${newRecord.reelNos}`);
      setEditingId(null);
    } else {
      await addDoc(getColRef('production'), newRecord);
      addLog(`Added production record: Reels ${newRecord.reelNos}`);
    }
    setNewRecord({ date: new Date().toISOString().split('T')[0], orderId: '', companyId: allowedCompanyId !== 'all' ? allowedCompanyId : '', millName: '', reelNos: '', paperUsedFor: 'Paper', usedForItem: '', size: '', gsm: '', bf: '', useKg: '', linerQty: '', wasteSheetsKg: '', numberOfUps: '1' });
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    setNewRecord(record);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNewRecord({ date: new Date().toISOString().split('T')[0], orderId: '', companyId: allowedCompanyId !== 'all' ? allowedCompanyId : '', millName: '', reelNos: '', paperUsedFor: 'Paper', usedForItem: '', size: '', gsm: '', bf: '', useKg: '', linerQty: '', wasteSheetsKg: '', numberOfUps: '1' });
  };

  const handleDelete = async (id, reelNos) => {
    if(window.confirm(`Delete production record for Reels ${reelNos}?`)) {
      await deleteDoc(getDocRef('production', id));
      addLog(`Deleted production record: Reels ${reelNos}`);
    }
  };

  const handleExport = () => {
    const exportData = visibleProduction.map(record => {
      const compName = companies.find(c => c.id === record.companyId)?.name || 'Unknown';
      const orderInfo = record.orderId ? (() => { const o = orders.find(o => o.id === record.orderId); return o ? `Order: ${o.orderQty}x ${o.itemName || o.Item_Name}` : 'Unknown Order'; })() : 'Standalone Production';
      return { Date: record.date || '', Company: compName, Linked_Order: orderInfo, MillName: record.millName || '', Reels: record.reelNos || record.reelNo || '', PaperUsedFor: record.paperUsedFor || '', UsedForItem: record.usedForItem || '', Size_mm: record.size || '', GSM: record.gsm || '', BF: record.bf || '', UseKG: record.useKg || '', Good_Sheets_Qty: record.linerQty || '', Waste_Sheets_KG: record.wasteSheetsKg || '', Ups: record.numberOfUps || '' };
    });
    downloadCSV(exportData, 'production_records');
  };

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Production Log</h2>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-300 font-medium text-sm transition cursor-pointer">
            <Upload className="w-4 h-4" /> Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={(e) => handleCSVImport(e, 'production', getColRef, addLog, (row, getVal) => {
              const compName = getVal(row, 'Company', 'Company Name');
              const comp = companies.find(c => c.name.toLowerCase() === compName.toLowerCase());
              return {
                date: getVal(row, 'Date', 'date') || new Date().toISOString().split('T')[0],
                companyId: comp ? comp.id : '',
                orderId: '', 
                millName: getVal(row, 'Mill Name', 'MillName', 'millName') || '',
                reelNos: getVal(row, 'Reels', 'Reel Nos', 'reelNos', 'reelNo') || '',
                paperUsedFor: getVal(row, 'Paper Used For', 'PaperUsedFor', 'paperUsedFor') || 'Paper',
                usedForItem: getVal(row, 'Used For Item', 'UsedForItem', 'usedForItem', 'Item Details') || '',
                size: getVal(row, 'Size mm', 'Size_mm', 'size', 'Size') || '',
                gsm: getVal(row, 'GSM', 'gsm') || '',
                bf: getVal(row, 'BF', 'bf') || '',
                useKg: getVal(row, 'Use KG', 'UseKG', 'useKg') || '',
                linerQty: getVal(row, 'Good Sheets Qty', 'Good_Sheets_Qty', 'linerQty', 'Qty') || '',
                wasteSheetsKg: getVal(row, 'Waste Sheets KG', 'Waste_Sheets_KG', 'wasteSheetsKg', 'Waste') || '',
                numberOfUps: getVal(row, 'Ups', 'numberOfUps') || '1'
              };
            })} />
          </label>
          <button onClick={handleExport} className="flex items-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-300 font-medium text-sm transition">
            <Download className="w-4 h-4" /> Export to Excel
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
          <div className="col-span-1 md:col-span-3"><label className="block text-xs text-stone-500 mb-1">Mill Name</label><input required type="text" className="w-full p-2 border rounded" value={newRecord.millName} onChange={e => setNewRecord({...newRecord, millName: e.target.value})} /></div>
          <div className="col-span-1 md:col-span-2"><label className="block text-xs text-stone-500 mb-1">Reel No(s) (Comma separated)</label><input required type="text" placeholder="e.g. 101, 102, 105" className="w-full p-2 border rounded" value={newRecord.reelNos} onChange={e => setNewRecord({...newRecord, reelNos: e.target.value})} /></div>
          
          <div className="col-span-1 md:col-span-2">
            <label className="block text-xs font-bold text-stone-700 mb-1">Paper Used For</label>
            <select required className="w-full p-2 border border-stone-400 bg-stone-50 rounded font-medium" value={newRecord.paperUsedFor} onChange={e => setNewRecord({...newRecord, paperUsedFor: e.target.value})}>
              <option value="Paper">Paper (1-Ply)</option>
              <option value="Liner">Liner (2-Ply)</option>
              <option value="Board">Board (3, 5, 7-Ply)</option>
            </select>
          </div>

          <div className="col-span-1 md:col-span-2"><label className="block text-xs text-stone-500 mb-1">Used For Item</label><select required className="w-full p-2 border rounded" value={newRecord.usedForItem} onChange={e => setNewRecord({...newRecord, usedForItem: e.target.value})} disabled={!!newRecord.orderId}><option value="">-- Select Item --</option>{[...visibleItems].filter(i => i.companyId === newRecord.companyId || !newRecord.companyId).sort((a,b) => (a?.name || a?.Item_Name || '').localeCompare(b?.name || b?.Item_Name || '')).map(i => <option key={i.id} value={i.name || i.Item_Name}>{i.name || i.Item_Name}</option>)}</select></div>
          <div className="col-span-1 md:col-span-2"><label className="block text-xs text-stone-500 mb-1">Size (mm)</label><input required type="text" className="w-full p-2 border rounded" value={newRecord.size} onChange={e => setNewRecord({...newRecord, size: e.target.value})} /></div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">GSM</label><input required type="number" step="0.1" className="w-full p-2 border rounded" value={newRecord.gsm} onChange={e => setNewRecord({...newRecord, gsm: e.target.value})} /></div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">BF</label><input required type="number" step="0.1" className="w-full p-2 border rounded" value={newRecord.bf} onChange={e => setNewRecord({...newRecord, bf: e.target.value})} /></div>
          <div className="col-span-1 md:col-span-2"><label className="block text-xs text-stone-500 mb-1">Use KG (Gross Total)</label><input required type="number" step="0.1" className="w-full p-2 border rounded" value={newRecord.useKg} onChange={e => setNewRecord({...newRecord, useKg: e.target.value})} /></div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Good Qty (Sheets)</label><input type="number" step="0.1" className="w-full p-2 border rounded bg-blue-50" value={newRecord.linerQty} onChange={e => setNewRecord({...newRecord, linerQty: e.target.value})} /></div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Waste Sheets (KG)</label><input type="number" step="0.1" className="w-full p-2 border rounded bg-red-50" value={newRecord.wasteSheetsKg} onChange={e => setNewRecord({...newRecord, wasteSheetsKg: e.target.value})} /></div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Number of Ups</label><select required className="w-full p-2 border rounded" value={newRecord.numberOfUps} onChange={e => setNewRecord({...newRecord, numberOfUps: e.target.value})}>{[1, 2, 3, 4, 5, 6, 7, 8].map(num => <option key={num} value={num}>{num}</option>)}</select></div>

          <div className="col-span-1 lg:col-span-6 flex gap-2 mt-2">
            <button type="submit" className="flex-1 bg-stone-900 text-white p-2 rounded flex items-center justify-center gap-2 hover:bg-stone-800">{editingId ? <><Edit2 className="w-4 h-4" /> Update Record</> : <><Plus className="w-4 h-4" /> Save Production Record</>}</button>
            {editingId && <button type="button" onClick={cancelEdit} className="bg-stone-300 text-stone-800 p-2 rounded hover:bg-stone-400 px-6">Cancel</button>}
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

      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-left min-w-[1100px]">
          <thead className="bg-stone-100 text-stone-600 text-sm">
            <tr>
              <th className="p-4">Date</th>
              <th className="p-4">Client / Item</th>
              <th className="p-4">Mill Name & Reel No(s)</th>
              <th className="p-4">Used For</th>
              <th className="p-4">Size (mm)</th>
              <th className="p-4">GSM / BF</th>
              <th className="p-4">Use KG</th>
              <th className="p-4">Qty & Ups</th>
              <th className="p-4">Item & Sheet Wt</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {visibleProduction.length === 0 && <tr><td colSpan="10" className="p-4 text-center text-stone-500">No production records found.</td></tr>}
            {[...visibleProduction].sort((a,b) => new Date(b.date) - new Date(a.date)).map(record => {
              let itemWeightStr = '-';
              let sheetWeightStr = '-';
              if (record.useKg && record.linerQty && record.numberOfUps) {
                const goodSheets = parseFloat(record.linerQty);
                const netPaperKg = Math.max(0, parseFloat(record.useKg) - parseFloat(record.wasteSheetsKg || 0));
                if (goodSheets > 0) {
                  const sheetWt = (netPaperKg / goodSheets) * 1000;
                  sheetWeightStr = sheetWt.toFixed(1) + ' g';
                  const itemWt = sheetWt / parseFloat(record.numberOfUps);
                  itemWeightStr = itemWt.toFixed(1) + ' g';
                }
              }
              const compName = companies.find(c => c.id === record.companyId)?.name || 'Unknown';
              return (
              <tr key={record.id} className="hover:bg-stone-50">
                <td className="p-4 whitespace-nowrap">{record.date}</td>
                <td className="p-4"><p className="font-bold text-stone-900">{compName}</p><p className="text-xs text-stone-500">{record.usedForItem || '-'}</p>{record.orderId && <span className="inline-block mt-1 bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-full font-bold">Order Linked</span>}</td>
                <td className="p-4"><p className="font-medium text-stone-800">{record.millName}</p><p className="text-xs text-stone-500">Reels: {record.reelNos || record.reelNo}</p></td>
                <td className="p-4 font-bold text-blue-700">{record.paperUsedFor}</td>
                <td className="p-4">{record.size}</td>
                <td className="p-4">{record.gsm} <span className="text-stone-400 text-xs">GSM</span> / {record.bf} <span className="text-stone-400 text-xs">BF</span></td>
                <td className="p-4 font-semibold">{record.useKg} KG</td>
                <td className="p-4"><p className="font-bold text-stone-800">{record.linerQty || '-'} <span className="text-[10px] font-normal text-stone-500">Good Qty</span></p>{record.wasteSheetsKg > 0 && <p className="text-xs text-red-500">-{record.wasteSheetsKg}kg Waste</p>}<p className="text-[10px] text-stone-500 mt-1">{record.numberOfUps || 1} Ups</p></td>
                <td className="p-4 bg-stone-50"><div className="font-mono font-bold text-stone-800">{itemWeightStr} <span className="text-[10px] font-normal text-stone-500">/item</span></div><div className="font-mono text-stone-500 text-[10px] mt-1">{sheetWeightStr} <span className="text-[8px]">/sheet</span></div></td>
                <td className="p-4 text-right whitespace-nowrap">
                  <button onClick={() => handleEdit(record)} className="text-blue-500 hover:text-blue-700 mr-3" title="Edit"><Edit2 className="w-5 h-5 inline" /></button>
                  {role === 'admin' && <button onClick={() => handleDelete(record.id, record.reelNos || record.reelNo)} className="text-red-500 hover:text-red-700" title="Delete"><Trash2 className="w-5 h-5 inline" /></button>}
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

// --- ORDERS VIEW ---
function OrdersView({ orders, production, items, companies, addLog, role, getColRef, getDocRef, currentUser }) {
  const allowedCompanyId = currentUser?.role === 'admin' ? 'all' : (currentUser?.companyId || 'all');
  const visibleCompanies = allowedCompanyId === 'all' ? companies : companies.filter(c => c.id === allowedCompanyId);
  const visibleItems = allowedCompanyId === 'all' ? items : items.filter(i => i.companyId === allowedCompanyId);
  const visibleOrders = allowedCompanyId === 'all' ? orders : orders.filter(o => o.companyId === allowedCompanyId);

  const [newOrder, setNewOrder] = useState({
    orderDate: new Date().toISOString().split('T')[0], companyId: allowedCompanyId !== 'all' ? allowedCompanyId : '', itemId: '', orderQty: '', plannedUps: '1', deliveryDate: '', status: 'Pending', rate: '', dispatchedQty: 0
  });

  const handleAdd = async (e) => {
    e.preventDefault();
    const item = items.find(i => i.id === newOrder.itemId);
    await addDoc(getColRef('orders'), { ...newOrder, itemName: item?.name || item?.Item_Name || 'Unknown Item' });
    addLog(`Added new order for ${newOrder.orderQty}x ${item?.name || item?.Item_Name || 'Unknown Item'}`);
    setNewOrder({ orderDate: new Date().toISOString().split('T')[0], companyId: allowedCompanyId !== 'all' ? allowedCompanyId : '', itemId: '', orderQty: '', plannedUps: '1', deliveryDate: '', status: 'Pending', rate: '', dispatchedQty: 0 });
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
    const exportData = visibleOrders.map(order => ({
      Order_Date: order.orderDate, Company: companies.find(c => c.id === order.companyId)?.name || 'Unknown', Item_Ordered: order.itemName || order.Item_Name, Target_Qty: order.orderQty, Planned_Ups: order.plannedUps, Delivery_Date: order.deliveryDate, Status: order.status, Rate: order.rate, Total_Value: (parseFloat(order.orderQty||0) * parseFloat(order.rate||0)).toFixed(2)
    }));
    downloadCSV(exportData, 'orders');
  };

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Order Management</h2>
        <div className="flex gap-2">
          <button onClick={handleExport} className="flex items-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-300 font-medium text-sm transition">
            <Download className="w-4 h-4" /> Export to Excel
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 mb-8">
        <h3 className="font-bold mb-4">Add New Order</h3>
        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Order Date</label><input required type="date" className="w-full p-2 border rounded" value={newOrder.orderDate} onChange={e => setNewOrder({...newOrder, orderDate: e.target.value})} /></div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Client Company</label><select required className="w-full p-2 border rounded" value={newOrder.companyId} onChange={e => setNewOrder({...newOrder, companyId: e.target.value, itemId: ''})}><option value="">-- Select Company --</option>{[...visibleCompanies].sort((a,b) => (a?.name || '').localeCompare(b?.name || '')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="col-span-1 md:col-span-2"><label className="block text-xs text-stone-500 mb-1">Select Item</label><select required className="w-full p-2 border rounded" value={newOrder.itemId} onChange={e => setNewOrder({...newOrder, itemId: e.target.value})} disabled={!newOrder.companyId}><option value="">-- Select Item --</option>{[...visibleItems].filter(i => i.companyId === newOrder.companyId).sort((a,b) => (a?.name || a?.Item_Name || '').localeCompare(b?.name || b?.Item_Name || '')).map(i => <option key={i.id} value={i.id}>{i.name || i.Item_Name}</option>)}</select></div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Order Quantity</label><input required type="number" min="1" className="w-full p-2 border rounded" value={newOrder.orderQty} onChange={e => setNewOrder({...newOrder, orderQty: e.target.value})} /></div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Rate (₹) per Box</label><input required type="number" step="0.01" className="w-full p-2 border rounded bg-green-50" value={newOrder.rate} onChange={e => setNewOrder({...newOrder, rate: e.target.value})} /></div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Planned Ups</label><select required className="w-full p-2 border rounded" value={newOrder.plannedUps} onChange={e => setNewOrder({...newOrder, plannedUps: e.target.value})}>{[1, 2, 3, 4, 5, 6, 7, 8].map(num => <option key={num} value={num}>{num}</option>)}</select></div>
          <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Target Delivery Date</label><input required type="date" className="w-full p-2 border rounded" value={newOrder.deliveryDate} onChange={e => setNewOrder({...newOrder, deliveryDate: e.target.value})} /></div>
          <div className="col-span-1 lg:col-span-2"><button type="submit" className="w-full bg-stone-900 text-white p-2 rounded flex items-center justify-center gap-2 hover:bg-stone-800"><Plus className="w-4 h-4" /> Save Order</button></div>
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
            {[...visibleOrders].sort((a,b) => new Date(b.orderDate) - new Date(a.orderDate)).map(order => {
              const compName = companies.find(c => c.id === order.companyId)?.name || 'Unknown';
              const statusColors = { 'Pending': 'bg-yellow-100 text-yellow-800 border-yellow-200', 'In Production': 'bg-blue-100 text-blue-800 border-blue-200', 'Completed': 'bg-green-100 text-green-800 border-green-200' };

              const pLogs = production.filter(p => p.orderId === order.id);
              const getGoodSheets = (p) => parseFloat(p.linerQty || 0);
              const sumBoard = pLogs.filter(p => p.paperUsedFor === 'Board').reduce((acc, p) => acc + getGoodSheets(p), 0);
              const sumLiner = pLogs.filter(p => p.paperUsedFor === 'Liner').reduce((acc, p) => acc + getGoodSheets(p), 0);
              const sumPaper = pLogs.filter(p => p.paperUsedFor === 'Paper').reduce((acc, p) => acc + getGoodSheets(p), 0);
              
              const item = items.find(i => i.id === order.itemId);
              const ply = parseInt(item?.ply || item?.Ply || 3);
              
              let effectiveBase = 0;
              if (ply <= 2) { effectiveBase = sumBoard + sumLiner; } 
              else { effectiveBase = sumBoard + Math.min(sumLiner, sumPaper); }
              
              const producedQty = Math.floor(effectiveBase * parseFloat(order.plannedUps || 1));
              const pendingQty = Math.max(0, order.orderQty - producedQty);
              const rate = parseFloat(order.rate || 0);
              const totalValue = rate * parseInt(order.orderQty || 0);

              return (
                <tr key={order.id} className="hover:bg-stone-50">
                  <td className="p-4 whitespace-nowrap">{order.orderDate}</td>
                  <td className="p-4 font-bold text-stone-900">{compName}</td>
                  <td className="p-4 font-medium text-stone-800">{order.itemName || order.Item_Name}</td>
                  <td className="p-4"><p className="font-bold text-lg">{order.orderQty}</p></td>
                  <td className="p-4">
                     <p className="text-xs text-stone-500 mb-1">₹{rate.toFixed(2)} /box</p>
                     <p className="font-bold text-stone-800">₹{totalValue.toFixed(2)}</p>
                  </td>
                  <td className="p-4 bg-green-50/30 font-bold text-green-600 text-lg">{producedQty}</td>
                  <td className="p-4 bg-red-50/30 font-bold text-red-500 text-lg">{pendingQty}</td>
                  <td className="p-4">
                    <button onClick={() => toggleStatus(order.id, order.status)} className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${statusColors[order.status] || 'bg-stone-100'}`} title="Click to change status">{order.status}</button>
                  </td>
                  {role === 'admin' && (
                    <td className="p-4 text-right">
                      <button onClick={() => handleDelete(order.id, order.itemName || order.Item_Name)} className="text-red-500 hover:text-red-700"><Trash2 className="w-5 h-5 inline" /></button>
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
            <Upload className="w-4 h-4" /> Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={(e) => handleCSVImport(e, 'items', getColRef, addLog, (row, getVal) => {
              // 1. Aggressive company matching including 'Company name'
              const compName = getVal(row, 'Company name', 'Company', 'Client', 'Customer', 'Brand') || '';
              const comp = companies.find(c => c?.name?.toLowerCase().trim() === compName.toLowerCase().trim());
              
              // 2. Exact matches for your CSV headers
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
            })} />
          </label>
          <button onClick={handleExport} className="flex items-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-300 font-medium text-sm transition">
            <Download className="w-4 h-4" /> Export to Excel
          </button>
        </div>
      </div>
      
      {role === 'admin' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 mb-6">
          <h3 className="font-bold mb-4">Add New Item</h3>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
            <div className="col-span-1 md:col-span-2"><label className="block text-xs text-stone-500 mb-1">Company</label><select required className="w-full p-2 border rounded" value={newItem.companyId} onChange={e => setNewItem({...newItem, companyId: e.target.value})}><option value="">Select Company...</option>{[...visibleCompanies].sort((a,b) => (a?.name || '').localeCompare(b?.name || '')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Item Type</label><select required className="w-full p-2 border rounded" value={newItem.itemType} onChange={e => setNewItem({...newItem, itemType: e.target.value})}><option value="Box">Box</option><option value="Tray">Tray</option><option value="Corrugated Sheet">Corrugated Sheet</option><option value="Partition">Partition</option></select></div>
            <div className="col-span-1 md:col-span-3"><label className="block text-xs text-stone-500 mb-1">Item Name / Code</label><input required type="text" className="w-full p-2 border rounded" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} /></div>
            <div className="col-span-1 md:col-span-3"><label className="block text-xs text-stone-500 mb-1">Size (L x W x H) in mm</label><input required type="text" placeholder="e.g. 250x200x150" className="w-full p-2 border rounded" value={newItem.size} onChange={e => setNewItem({...newItem, size: e.target.value})} /></div>
            <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Ply</label><select required className="w-full p-2 border rounded" value={newItem.ply} onChange={e => setNewItem({...newItem, ply: e.target.value})}><option value="">-</option><option value="2">2 Ply</option><option value="3">3 Ply</option><option value="5">5 Ply</option><option value="7">7 Ply</option></select></div>
            <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Weight (g)</label><input type="number" step="0.1" placeholder="Optional" className="w-full p-2 border rounded" value={newItem.weight} onChange={e => setNewItem({...newItem, weight: e.target.value})} /></div>
            <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Paper GSM</label><input required type="number" className="w-full p-2 border rounded" value={newItem.paperGsm} onChange={e => setNewItem({...newItem, paperGsm: e.target.value})} /></div>
            <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Paper BF</label><input required type="number" className="w-full p-2 border rounded" value={newItem.paperBf} onChange={e => setNewItem({...newItem, paperBf: e.target.value})} /></div>
            <div className="col-span-1"><label className="block text-xs text-stone-500 mb-1">Colour</label><select required className="w-full p-2 border rounded" value={newItem.paperColour} onChange={e => setNewItem({...newItem, paperColour: e.target.value})}><option value="Kraft">Kraft (Brown)</option><option value="Golden">Golden</option><option value="White">White</option></select></div>
            <div className="col-span-1 md:col-span-6 lg:col-span-2"><button type="submit" className="w-full bg-stone-900 text-white p-2 rounded flex items-center justify-center gap-2 hover:bg-stone-800"><Plus className="w-4 h-4" /> Save Item to Database</button></div>
          </form>
        </div>
      )}

      <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-200 mb-6 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 text-stone-500 mr-2"><Search className="w-4 h-4"/> Filter:</div>
        <input type="text" placeholder="Company..." className="p-2 border rounded text-sm w-32 focus:outline-none focus:ring-2 focus:ring-stone-800" value={filters.company} onChange={e => setFilters({...filters, company: e.target.value})} />
        <input type="text" placeholder="Item Name / Code..." className="p-2 border rounded text-sm flex-1 min-w-[150px] focus:outline-none focus:ring-2 focus:ring-stone-800" value={filters.name} onChange={e => setFilters({...filters, name: e.target.value})} />
        <select className="p-2 border rounded text-sm w-32 focus:outline-none focus:ring-2 focus:ring-stone-800" value={filters.type} onChange={e => setFilters({...filters, type: e.target.value})}>
          <option value="">All Types</option>
          <option value="Box">Box</option>
          <option value="Tray">Tray</option>
          <option value="Corrugated Sheet">Corrugated Sheet</option>
          <option value="Partition">Partition</option>
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
                {role === 'admin' && <td className="p-4 text-right"><button onClick={() => handleDelete(item.id, item.name || item.Item_Name)} className="text-red-500 hover:text-red-700"><Trash2 className="w-5 h-5 inline" /></button></td>}
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
        <button onClick={() => downloadCSV(companies, 'client_companies')} className="flex items-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-300 font-medium text-sm transition">
          <Download className="w-4 h-4" /> Export to Excel
        </button>
      </div>
      <form onSubmit={handleAdd} className="flex gap-4 mb-8 bg-white p-4 rounded-xl border shadow-sm">
        <input required type="text" placeholder="New Company Name" className="flex-1 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-800" value={newCompany} onChange={e => setNewCompany(e.target.value)} />
        <button type="submit" className="bg-stone-900 text-white px-6 py-3 rounded-lg hover:bg-stone-800 flex items-center gap-2"><Plus className="w-5 h-5"/> Add Client</button>
      </form>
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 divide-y">
        {companies.length === 0 && <div className="p-6 text-center text-stone-500">No companies yet. Add your first client above.</div>}
        {[...companies].sort((a,b) => (a?.name || '').localeCompare(b?.name || '')).map(c => (
          <div key={c.id} className="p-4 flex items-center justify-between hover:bg-stone-50">
            <div className="flex items-center gap-3"><Building2 className="w-5 h-5 text-stone-400" /><span className="font-medium text-lg">{c.name}</span></div>
            <button onClick={() => handleDelete(c.id, c.name)} className="text-red-400 hover:text-red-600 p-2"><Trash2 className="w-5 h-5" /></button>
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

  const formatDate = (dateString) => {
    if(!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">User Management</h2>
        <button onClick={() => downloadCSV(users, 'erp_users')} className="flex items-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-300 font-medium text-sm transition">
          <Download className="w-4 h-4" /> Export to Excel
        </button>
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
                <td className="p-4 text-right"><button onClick={() => handleDelete(u.id, u.name)} className="text-red-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-red-400" disabled={u.id === currentUserId}><Trash2 className="w-5 h-5 inline" /></button></td>
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
        <button onClick={() => downloadCSV(logs, 'activity_logs')} className="flex items-center gap-2 bg-stone-200 text-stone-800 px-4 py-2 rounded-lg hover:bg-stone-300 font-medium text-sm transition">
          <Download className="w-4 h-4" /> Export to Excel
        </button>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-4 space-y-3">
        {logs.length === 0 && <p className="text-stone-500 text-center py-4">No activity recorded yet.</p>}
        {[...logs].sort((a,b) => new Date(b.time) - new Date(a.time)).map(log => (
          <div key={log.id} className="flex justify-between items-center text-sm border-b pb-3 last:border-0 hover:bg-stone-50 p-2 rounded">
            <div><span className="font-semibold text-stone-900 mr-2">{log.userName}:</span><span className="text-stone-700">{log.action}</span></div>
            <span className="text-stone-400 whitespace-nowrap ml-4">{formatDate(log.time)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
