import { createClient } from "@libsql/client/web";

const TURSO_URL = import.meta.env.VITE_TURSO_DATABASE_URL || "libsql://erp-yash2813.aws-ap-south-1.turso.io";
const TURSO_TOKEN = import.meta.env.VITE_TURSO_AUTH_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODIzODEwMDMsImlkIjoiMDE5ZWRlN2EtYTAwMS03ODIzLTk2MmItMWMyMDk4MWIzOGE0IiwicmlkIjoiZjkzODExNGMtMTNiYS00YWI1LWI3ZjYtZDI1NWE5ZmEyYjRmIn0.IOtSSTQHPXkgy1BO8BUjhAC0NHfo3Tc6v2GQ0JAhR7cX_jgQy0JtzMbGw3cnxtSB4Sts2iEDZKE0XS_xi9qmAg";

let client = null;
try {
  client = createClient({
    url: TURSO_URL,
    authToken: TURSO_TOKEN
  });
} catch (e) {
  console.error("Failed to create Turso client:", e);
}

export const dbClient = client;

export const executeQuery = async (sql, args = []) => {
  if (!dbClient) throw new Error("Database client is not initialized. Please verify VITE_TURSO_DATABASE_URL.");
  return await dbClient.execute({ sql, args });
};

export const executeBatch = async (statements) => {
  if (!dbClient) throw new Error("Database client is not initialized. Please verify VITE_TURSO_DATABASE_URL.");
  return await dbClient.batch(statements);
};

export const generateId = () => crypto.randomUUID();

export const getNextCounter = async (name) => {
  const year = new Date().getFullYear();
  try {
    const res = await executeQuery("SELECT count, year FROM erp_counters WHERE name = ?", [name]);
    let nextCount = 1;
    if (res.rows && res.rows.length > 0) {
      const row = res.rows[0];
      const prevYear = row.year ?? row[1];
      const prevCount = row.count ?? row[0];
      if (Number(prevYear) === year) {
        nextCount = (parseInt(prevCount || 0)) + 1;
      }
      await executeQuery("UPDATE erp_counters SET count = ?, year = ? WHERE name = ?", [nextCount, year, name]);
    } else {
      await executeQuery("INSERT INTO erp_counters (name, count, year) VALUES (?, ?, ?)", [name, nextCount, year]);
    }
    return { count: nextCount, year };
  } catch (err) {
    console.error("Counter generation error:", err);
    return { count: Math.floor(1000 + Math.random() * 9000), year };
  }
};

export const initDb = async () => {
  const tables = [
    // ── GLOBAL MASTER DATA ──────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS erp_users (
      id TEXT PRIMARY KEY,
      name TEXT,
      role TEXT,
      password TEXT,
      lastAccess TEXT,
      companyId TEXT,
      unitIds TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS user_units (
      userId TEXT,
      unitId TEXT,
      PRIMARY KEY (userId, unitId)
    )`,
    `CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT,
      code TEXT,
      gstin TEXT,
      billingAddress TEXT,
      state TEXT,
      gstPercent TEXT,
      isActive INTEGER DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS vendors (
      id TEXT PRIMARY KEY,
      name TEXT,
      parent TEXT,
      state TEXT,
      gstin TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS paper_types (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE,
      description TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS gsm_master (
      id TEXT PRIMARY KEY,
      value INTEGER UNIQUE
    )`,
    `CREATE TABLE IF NOT EXISTS bf_master (
      id TEXT PRIMARY KEY,
      value INTEGER UNIQUE
    )`,
    `CREATE TABLE IF NOT EXISTS box_categories (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE,
      description TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS costings (
      id TEXT PRIMARY KEY,
      itemId TEXT,
      unitCost REAL,
      unitWeight REAL,
      blendedRate REAL,
      createdAt TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      userId TEXT,
      userName TEXT,
      action TEXT,
      time TEXT,
      unitId TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date TEXT,
      referenceNo TEXT,
      partyName TEXT,
      type TEXT,
      typeName TEXT,
      amount REAL
    )`,
    `CREATE TABLE IF NOT EXISTS erp_counters (
      name TEXT PRIMARY KEY,
      count INTEGER,
      year INTEGER
    )`,

    // ── UNIT-SPECIFIC OPERATIONAL DATA ──────────────────────────────
    `CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT,
      code TEXT,
      clientType TEXT,
      parent TEXT,
      state TEXT,
      gstin TEXT,
      unitId TEXT,
      unitName TEXT,
      phone TEXT,
      email TEXT,
      contactPerson TEXT,
      billingAddress TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      companyId TEXT,
      customerId TEXT,
      isJobWorkItem INTEGER DEFAULT 0,
      itemType TEXT,
      name TEXT,
      size TEXT,
      ply INTEGER,
      weight REAL,
      paperGsm TEXT,
      paperBf TEXT,
      paperColour TEXT,
      rate REAL,
      categoryId TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      orderNo TEXT,
      orderDate TEXT,
      companyId TEXT,
      customerId TEXT,
      customerName TEXT,
      itemId TEXT,
      itemName TEXT,
      poNumber TEXT,
      orderQty TEXT,
      dispatchedQty INTEGER DEFAULT 0,
      rate TEXT,
      deliveryDate TEXT,
      plannedUps INTEGER DEFAULT 1,
      status TEXT DEFAULT 'Pending',
      notes TEXT,
      attachedReels TEXT,
      isParentSetOrder INTEGER DEFAULT 0,
      isComponentOrder INTEGER DEFAULT 0,
      parentOrderId TEXT,
      componentQtyPerSet INTEGER,
      openingFgQty TEXT,
      upsLength TEXT,
      upsWidth TEXT,
      pocketsLength TEXT,
      pocketsWidth TEXT,
      longUpsLength TEXT,
      longUpsWidth TEXT,
      latUpsLength TEXT,
      latUpsWidth TEXT,
      commonPerSet TEXT,
      smallPerSet TEXT,
      commonUps INTEGER,
      smallUps INTEGER,
      computedProducedQty INTEGER,
      computedInStock INTEGER,
      lastComputedAt TEXT,
      dispatchSchedule TEXT,
      dispatchHistory TEXT,
      createdAt TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      date TEXT,
      companyId TEXT,
      vendorId TEXT,
      millName TEXT,
      invoiceNo TEXT,
      vehicleNo TEXT,
      paymentStatus TEXT,
      amountPaid TEXT,
      reelNo TEXT,
      supplierReelNo TEXT,
      uniqueReelId TEXT,
      systemReelId TEXT,
      size TEXT,
      gsm TEXT,
      bf TEXT,
      colour TEXT,
      receivedQty TEXT,
      initialIssuedQty TEXT,
      ratePerKg TEXT,
      category TEXT,
      stockType TEXT DEFAULT 'factory',
      clientId TEXT,
      clientName TEXT,
      issuedQty REAL,
      balanceQty REAL,
      lastUsedForItem TEXT,
      lastUsedDate TEXT,
      lastUsedJobNo TEXT,
      usageLog TEXT,
      uniqueId TEXT,
      notes TEXT,
      remarks TEXT,
      stand TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS production (
      id TEXT PRIMARY KEY,
      date TEXT,
      orderId TEXT,
      companyId TEXT,
      millName TEXT,
      paperUsedFor TEXT,
      usedForItem TEXT,
      linerQty TEXT,
      wasteSheetsKg TEXT,
      numberOfUps TEXT,
      commonUps TEXT,
      smallUps TEXT,
      totalReelsKg TEXT,
      productionKg TEXT,
      paperWastage TEXT,
      sheetWastage TEXT,
      corePipe TEXT,
      balanceReel TEXT,
      gumUsed TEXT,
      gumPrice TEXT,
      isDraft INTEGER,
      calculatedNetPaper TEXT,
      goodProductionKg TEXT,
      totalWastageKg TEXT,
      calculatedWastagePercent TEXT,
      totalGumCost TEXT,
      gumCostPerKgPaper TEXT,
      consumedReels TEXT,
      useKg TEXT,
      reelNos TEXT,
      batchNo TEXT,
      hasEndOfRunData INTEGER DEFAULT 0,
      jobCardNo TEXT,
      jobNo TEXT,
      notes TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS wastage (
      id TEXT PRIMARY KEY,
      date TEXT,
      companyId TEXT,
      orderId TEXT,
      itemName TEXT,
      wasteKg TEXT,
      operator TEXT,
      notes TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS wip_stages (
      id TEXT PRIMARY KEY,
      productionId TEXT,
      orderId TEXT,
      companyId TEXT,
      itemId TEXT,
      itemName TEXT,
      qty INTEGER,
      sheets INTEGER,
      orderQty INTEGER,
      currentStage TEXT,
      stages TEXT,
      createdAt TEXT,
      updatedAt TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS purchaseOrders (
      id TEXT PRIMARY KEY,
      date TEXT,
      poNo TEXT,
      vendorId TEXT,
      companyId TEXT,
      status TEXT,
      items TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS dispatches (
      id TEXT PRIMARY KEY,
      date TEXT,
      challanNo TEXT,
      orderId TEXT,
      companyId TEXT,
      customerId TEXT,
      customerName TEXT,
      itemName TEXT,
      dispatchedQty INTEGER,
      vehicleNo TEXT,
      lrNo TEXT,
      notes TEXT,
      createdBy TEXT,
      createdAt TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS daily_reports (
      id TEXT PRIMARY KEY,
      date TEXT,
      companyId TEXT,
      operators INTEGER DEFAULT 0,
      helpers INTEGER DEFAULT 0,
      ladies INTEGER DEFAULT 0,
      sectionsData TEXT,
      remarks TEXT,
      createdAt TEXT,
      updatedAt TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS planned_jobs (
      id TEXT PRIMARY KEY,
      orderId TEXT,
      companyId TEXT,
      customerId TEXT,
      customerName TEXT,
      itemId TEXT,
      itemName TEXT,
      jobNo TEXT,
      plannedQty INTEGER,
      orderQty INTEGER,
      queueId TEXT,
      ups INTEGER DEFAULT 1,
      status TEXT DEFAULT 'Planned',
      deckleSize TEXT,
      flute TEXT,
      notes TEXT,
      attachedReels TEXT,
      rollStandTop TEXT,
      rollStandFluteC TEXT,
      rollStandBackingC TEXT,
      rollStandFluteB TEXT,
      rollStandBackingB TEXT,
      componentKey TEXT,
      sortOrder INTEGER DEFAULT 0,
      createdAt TEXT,
      updatedAt TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS planning_queues (
      id TEXT PRIMARY KEY,
      name TEXT,
      color TEXT,
      companyId TEXT,
      sortOrder INTEGER DEFAULT 0
    )`
  ];

  // ── Safe column migrations ───────────────────────────────────────
  const migrations = [
    "ALTER TABLE production ADD COLUMN batchNo TEXT",
    "ALTER TABLE production ADD COLUMN hasEndOfRunData INTEGER DEFAULT 0",
    "ALTER TABLE production ADD COLUMN jobCardNo TEXT",
    "ALTER TABLE production ADD COLUMN jobNo TEXT",
    "ALTER TABLE production ADD COLUMN notes TEXT",
    "ALTER TABLE production ADD COLUMN useKg TEXT",
    "ALTER TABLE production ADD COLUMN reelNos TEXT",
    "ALTER TABLE erp_users ADD COLUMN companyId TEXT",
    "ALTER TABLE erp_users ADD COLUMN unitIds TEXT",
    "ALTER TABLE logs ADD COLUMN unitId TEXT",
    "ALTER TABLE companies ADD COLUMN code TEXT",
    "ALTER TABLE companies ADD COLUMN isActive INTEGER DEFAULT 1",
    "ALTER TABLE items ADD COLUMN categoryId TEXT",
    "ALTER TABLE items ADD COLUMN layers TEXT",
    "ALTER TABLE items ADD COLUMN createdAt TEXT",
    "ALTER TABLE items ADD COLUMN updatedAt TEXT",
    "ALTER TABLE orders ADD COLUMN dispatchSchedule TEXT",
    "ALTER TABLE orders ADD COLUMN isParentSetOrder INTEGER DEFAULT 0",
    "ALTER TABLE orders ADD COLUMN isComponentOrder INTEGER DEFAULT 0",
    "ALTER TABLE orders ADD COLUMN parentOrderId TEXT",
    "ALTER TABLE orders ADD COLUMN componentQtyPerSet INTEGER",
    "ALTER TABLE orders ADD COLUMN orderType TEXT DEFAULT 'regular'",
    "ALTER TABLE orders ADD COLUMN jobWorkType TEXT",
    "ALTER TABLE orders ADD COLUMN clientInwardRef TEXT",
    "ALTER TABLE orders ADD COLUMN fluteType TEXT",
    "ALTER TABLE orders ADD COLUMN updatedAt TEXT",
    "ALTER TABLE wip_stages ADD COLUMN itemId TEXT",
    "ALTER TABLE wip_stages ADD COLUMN sheets INTEGER",
    "ALTER TABLE wip_stages ADD COLUMN orderQty INTEGER",
    "ALTER TABLE wip_stages ADD COLUMN updatedAt TEXT",
    "ALTER TABLE inventory ADD COLUMN uniqueId TEXT",
    "ALTER TABLE inventory ADD COLUMN supplierReelNo TEXT",
    "ALTER TABLE inventory ADD COLUMN uniqueReelId TEXT",
    "ALTER TABLE inventory ADD COLUMN systemReelId TEXT",
    "ALTER TABLE inventory ADD COLUMN stockType TEXT DEFAULT 'factory'",
    "ALTER TABLE inventory ADD COLUMN clientId TEXT",
    "ALTER TABLE inventory ADD COLUMN clientName TEXT",
    "ALTER TABLE inventory ADD COLUMN lastUsedForItem TEXT",
    "ALTER TABLE inventory ADD COLUMN lastUsedDate TEXT",
    "ALTER TABLE inventory ADD COLUMN lastUsedJobNo TEXT",
    "ALTER TABLE inventory ADD COLUMN notes TEXT",
    "ALTER TABLE inventory ADD COLUMN remarks TEXT",
    "ALTER TABLE inventory ADD COLUMN stand TEXT",
    "ALTER TABLE customers ADD COLUMN code TEXT",
    "ALTER TABLE customers ADD COLUMN clientType TEXT",
    "ALTER TABLE customers ADD COLUMN phone TEXT",
    "ALTER TABLE customers ADD COLUMN contactPerson TEXT",
    "ALTER TABLE customers ADD COLUMN billingAddress TEXT",
    "ALTER TABLE customers ADD COLUMN unitName TEXT",
    "ALTER TABLE customers ADD COLUMN email TEXT",
    "ALTER TABLE customers ADD COLUMN createdAt TEXT",
    "ALTER TABLE customers ADD COLUMN updatedAt TEXT",
    "ALTER TABLE items ADD COLUMN customerId TEXT",
    "ALTER TABLE items ADD COLUMN isJobWorkItem INTEGER DEFAULT 0",
    "ALTER TABLE items ADD COLUMN fluteType TEXT",
    "ALTER TABLE items ADD COLUMN dimensionType TEXT DEFAULT 'ID'",
    "ALTER TABLE items ADD COLUMN idSize TEXT",
    "ALTER TABLE items ADD COLUMN odSize TEXT",
    "ALTER TABLE items ADD COLUMN setComponents TEXT",
    "ALTER TABLE items ADD COLUMN upsLength TEXT",
    "ALTER TABLE items ADD COLUMN upsWidth TEXT",
    "ALTER TABLE items ADD COLUMN pocketsLength TEXT",
    "ALTER TABLE items ADD COLUMN pocketsWidth TEXT",
    "ALTER TABLE items ADD COLUMN longUpsLength TEXT",
    "ALTER TABLE items ADD COLUMN longUpsWidth TEXT",
    "ALTER TABLE items ADD COLUMN latUpsLength TEXT",
    "ALTER TABLE items ADD COLUMN latUpsWidth TEXT",
    "ALTER TABLE orders ADD COLUMN orderNo TEXT",
    "ALTER TABLE orders ADD COLUMN poNumber TEXT",
    "ALTER TABLE orders ADD COLUMN createdAt TEXT",
    "ALTER TABLE orders ADD COLUMN notes TEXT",
    "ALTER TABLE orders ADD COLUMN isParentSetOrder INTEGER DEFAULT 0",
    "ALTER TABLE orders ADD COLUMN attachedReels TEXT"
  ];

  try {
    // 1. Batch create all tables in 1 single HTTP network roundtrip
    if (tables.length > 0) {
      await executeBatch(tables.map(sql => ({ sql, args: [] }))).catch(e => console.log("Batch tables init:", e.message));
    }

    // 2. Run migrations in parallel (allSettled safely ignores already existing columns)
    await Promise.allSettled(
      migrations.map(sql => executeQuery(sql))
    );

    // 3. Check & seed default admin in parallel if needed
    try {
      const res = await executeQuery("SELECT COUNT(*) as count FROM erp_users");
      if (res.rows?.[0]?.count === 0) {
        await executeQuery("INSERT INTO erp_users (id, name, role, password, lastAccess) VALUES (?, ?, ?, ?, ?)", [
          "admin-seed-id",
          "Admin",
          "admin",
          "admin",
          ""
        ]);
      }
    } catch (e) {}

    // Mark as initialized so subsequent page loads take 0ms
    localStorage.setItem('apex_turso_db_init_v4', 'true');
    console.log("Database initialized and cached.");
  } catch (err) {
    console.error("Database initialization notice:", err);
  }
};
