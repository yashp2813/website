// =========================================================================
// GOOGLE GEMINI AI INTEGRATION SERVICE FOR APEX CORRUGATION ERP
// =========================================================================

const STORAGE_KEY_GEMINI = 'apex_gemini_api_key';

export function getGeminiApiKey() {
  return localStorage.getItem(STORAGE_KEY_GEMINI) || import.meta.env.VITE_GEMINI_API_KEY || '';
}

export function setGeminiApiKey(key) {
  if (key && key.trim()) {
    localStorage.setItem(STORAGE_KEY_GEMINI, key.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_GEMINI);
  }
}

export function isGeminiConfigured() {
  return !!getGeminiApiKey();
}

/**
 * Calls Gemini 2.0 / 1.5 Flash API with JSON Structured Output or Chat
 */
async function callGeminiApi({ prompt, systemInstruction = '', responseSchema = null, temperature = 0.2 }) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_KEY_MISSING');
  }

  // Use Gemini 2.0 Flash endpoint
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature,
      maxOutputTokens: 2048
    }
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  if (responseSchema) {
    payload.generationConfig.responseMimeType = 'application/json';
    payload.generationConfig.responseSchema = responseSchema;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const errorMsg = errorBody.error?.message || `Gemini API Error (${response.status})`;
    throw new Error(errorMsg);
  }

  const result = await response.json();
  const textOutput = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return textOutput;
}

/**
 * 1. AI BOX SPECIFICATION & LAYER BOM RECIPE DICTATION PARSER
 * Transforms speech like "Edit 180ml IB Master. Size 450x300x200, 3 ply B flute. Top golden 150 16bf, fluting 120 16bf, bottom kraft 140 18bf"
 * into a complete structured Box & Paper Layer Matrix.
 */
export async function parseBoxRecipeWithAI(speechTranscript, existingItems = []) {
  const itemsContext = existingItems.map(i => i.name || i.Item_Name).filter(Boolean).slice(0, 50).join(', ');

  const systemInstruction = `You are an expert AI Corrugation Packaging Engineer assisting an operator in dictating Box Specifications and Paper Layer Recipes (BOM).
Your task is to parse unstructured spoken dictation into a structured JSON Box Recipe.

Corrugation Packaging Rules:
- Ply count: 3 Ply (3 layers), 5 Ply (5 layers), 7 Ply (7 layers), 2 Ply (2 layers).
- Default flute take-up factors: B=1.35, C=1.43, E=1.27, A=1.52, BC=1.35/1.43. Liner take-up is always 1.0.
- Paper types/materials: 'Kraft', 'Golden', 'Duplex'.
- Standard Layer Roles for 3-Ply: 1: "Top Liner", 2: "Fluting Medium", 3: "Bottom Liner".
- Standard Layer Roles for 5-Ply: 1: "Top Liner", 2: "Fluting Medium 1", 3: "Center Liner", 4: "Fluting Medium 2", 5: "Bottom Liner".
- Dimensions format: "LENGTHxWIDTHxHEIGHT" in mm (e.g., "450x300x200"). If dimensions spoken as "450 by 300 by 200", format as "450x300x200".
- Known existing item names in database: [${itemsContext}]`;

  const prompt = `Parse the following spoken operator dictation into a box specification:
Dictation: "${speechTranscript}"

Return JSON matching the schema with action ('create' or 'edit'), targetItemName (if editing), name, size, ply, fluteType, itemType, and the complete array of layers with gsm, bf, type, and takeUp.`;

  const schema = {
    type: 'OBJECT',
    properties: {
      action: { type: 'STRING', enum: ['create', 'edit'], description: 'Whether the operator wants to create a new box or edit an existing one' },
      targetItemName: { type: 'STRING', description: 'Name of the existing box item if editing' },
      name: { type: 'STRING', description: 'Clean formatted Item / SKU Name' },
      itemType: { type: 'STRING', enum: ['Box', 'PPC', 'Plate', 'Tray', 'Sheet'], description: 'Type of item (Box, PPC, Plate, Tray, Sheet)' },
      size: { type: 'STRING', description: 'Inner dimensions ID format: LENGTHxWIDTHxHEIGHT e.g. 450x300x200' },
      ply: { type: 'STRING', enum: ['3', '5', '7', '2'], description: 'Number of plies' },
      fluteType: { type: 'STRING', enum: ['B', 'C', 'E', 'A', 'BC', 'AB'], description: 'Flute type profile' },
      layers: {
        type: 'ARRAY',
        description: 'Layer by layer paper recipe from Top to Bottom',
        items: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', description: 'Layer role name e.g. Top Liner, Fluting Medium, Bottom Liner' },
            type: { type: 'STRING', enum: ['Kraft', 'Golden', 'Duplex'], description: 'Paper material shade' },
            gsm: { type: 'NUMBER', description: 'Grammage per square meter (e.g. 120, 150, 180)' },
            bf: { type: 'NUMBER', description: 'Burst factor (e.g. 16, 18, 20, 22, 28)' },
            takeUp: { type: 'NUMBER', description: 'Fluting factor (1.0 for liners, 1.35 for B flute, etc.)' },
            isFlute: { type: 'BOOLEAN', description: 'True if this layer is a fluting medium' }
          },
          required: ['name', 'type', 'gsm', 'bf', 'takeUp', 'isFlute']
        }
      },
      summaryVoiceText: { type: 'STRING', description: 'Short 1-sentence friendly confirmation to speak back to the operator' }
    },
    required: ['action', 'name', 'size', 'ply', 'fluteType', 'layers', 'summaryVoiceText']
  };

  const rawJson = await callGeminiApi({
    prompt,
    systemInstruction,
    responseSchema: schema,
    temperature: 0.1
  });

  return JSON.parse(rawJson);
}

/**
 * Helper to compute comprehensive 360-degree real-time KPIs across all factory modules
 */
export function calculateFactoryKPIs({
  orders = [],
  inventory = [],
  items = [],
  production = [],
  wipStages = [],
  wastageLogs = [],
  companies = [],
  customers = [],
  costings = [],
  transactions = []
}) {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentMonthStr = todayStr.slice(0, 7); // e.g. "2026-08"

  // 1. PRODUCTION KPIS (Today, This Week, This Month)
  const todayProd = production.filter(p => (p.date || '').startsWith(todayStr));
  const monthProd = production.filter(p => (p.date || '').startsWith(currentMonthStr));
  
  const todayBoxes = todayProd.reduce((acc, p) => acc + (parseFloat(p.quantityProduced || p.qty || 0)), 0);
  const todayMeters = Math.round(todayProd.reduce((acc, p) => acc + (parseFloat(p.linearMeters || p.meters || 0)), 0));
  
  const monthBoxes = monthProd.reduce((acc, p) => acc + (parseFloat(p.quantityProduced || p.qty || 0)), 0);
  const monthMeters = Math.round(monthProd.reduce((acc, p) => acc + (parseFloat(p.linearMeters || p.meters || 0)), 0));
  const monthWeightKg = Math.round(monthProd.reduce((acc, p) => acc + (parseFloat(p.totalConsumedWeightKg || p.consumedWeightKg || 0)), 0));

  // 2. WASTAGE & FUEL KPIS (Monthly, Daily, Stage breakdown)
  const monthWastageLogs = wastageLogs.filter(w => (w.date || '').startsWith(currentMonthStr));
  const monthScrapKg = Math.round(monthWastageLogs.reduce((acc, w) => acc + (parseFloat(w.wasteKg || w.wastageKg || w.totalWaste || 0)), 0));
  const monthCorrugationScrapKg = Math.round(monthWastageLogs.filter(w => (w.section || w.stage || '').toLowerCase().includes('corrug')).reduce((acc, w) => acc + (parseFloat(w.wasteKg || w.wastageKg || 0)), 0));
  const monthPrintingScrapKg = Math.round(monthWastageLogs.filter(w => (w.section || w.stage || '').toLowerCase().includes('print')).reduce((acc, w) => acc + (parseFloat(w.wasteKg || w.wastageKg || 0)), 0));

  const monthFuelKg = Math.round(monthWastageLogs.reduce((acc, w) => acc + (parseFloat(w.fuelKg || w.coalKg || w.woodKg || 0)), 0));
  const monthFuelCost = Math.round(monthWastageLogs.reduce((acc, w) => acc + (parseFloat(w.fuelCost || (parseFloat(w.fuelKg || 0) * (parseFloat(w.fuelRate || 8.5))) || 0)), 0));
  const monthPowerUnitsKwh = Math.round(monthWastageLogs.reduce((acc, w) => acc + (parseFloat(w.powerUnits || w.electricityKwh || 0)), 0));

  const monthWastagePercentage = monthWeightKg > 0 ? ((monthScrapKg / monthWeightKg) * 100).toFixed(2) : (monthScrapKg > 0 ? '3.80' : '0.00');

  // 3. RAW MATERIAL COST PER KG & INVENTORY VALUATION
  const activeReels = inventory.filter(r => (!r.category || r.category === 'Paper') && r.status !== 'Consumed' && (parseFloat(r.balanceQty !== undefined ? r.balanceQty : r.receivedQty || 0) > 0));
  let totalStockWeightKg = 0;
  let totalStockValuationInr = 0;
  const gsmCostMap = {};

  activeReels.forEach(r => {
    const wt = parseFloat(r.balanceQty !== undefined ? r.balanceQty : r.receivedQty || 0);
    const rate = parseFloat(r.ratePerKg || r.rate || 0);
    totalStockWeightKg += wt;
    totalStockValuationInr += (wt * (rate > 0 ? rate : 32.5));

    const gsm = r.gsm || '140';
    if (!gsmCostMap[gsm]) gsmCostMap[gsm] = { totalKg: 0, totalVal: 0 };
    gsmCostMap[gsm].totalKg += wt;
    gsmCostMap[gsm].totalVal += (wt * (rate > 0 ? rate : 32.5));
  });

  const avgPaperCostPerKg = totalStockWeightKg > 0 ? (totalStockValuationInr / totalStockWeightKg).toFixed(2) : '32.50';

  const gsmCostBreakdown = Object.entries(gsmCostMap).slice(0, 8).map(([gsm, data]) => ({
    gsm: `${gsm} GSM`,
    totalKg: Math.round(data.totalKg),
    avgRatePerKg: data.totalKg > 0 ? `₹${(data.totalVal / data.totalKg).toFixed(1)}/kg` : '₹32.0/kg'
  }));

  // 4. CONSUMABLES INVENTORY (Gum, Coal/Wood, Wire, Ink)
  const consumableItems = inventory.filter(r => r.category === 'Consumables' || r.itemName);
  const gumStockKg = Math.round(consumableItems.filter(i => (i.itemName || '').toLowerCase().includes('gum') || (i.itemName || '').toLowerCase().includes('starch')).reduce((acc, i) => acc + (parseFloat(i.balanceQty !== undefined ? i.balanceQty : i.receivedQty || 0)), 0));
  const coalStockKg = Math.round(consumableItems.filter(i => (i.itemName || '').toLowerCase().includes('coal') || (i.itemName || '').toLowerCase().includes('fuel')).reduce((acc, i) => acc + (parseFloat(i.balanceQty !== undefined ? i.balanceQty : i.receivedQty || 0)), 0));
  const wireStockKg = Math.round(consumableItems.filter(i => (i.itemName || '').toLowerCase().includes('wire') || (i.itemName || '').toLowerCase().includes('stitch')).reduce((acc, i) => acc + (parseFloat(i.balanceQty !== undefined ? i.balanceQty : i.receivedQty || 0)), 0));
  const inkStockKg = Math.round(consumableItems.filter(i => (i.itemName || '').toLowerCase().includes('ink')).reduce((acc, i) => acc + (parseFloat(i.balanceQty !== undefined ? i.balanceQty : i.receivedQty || 0)), 0));

  // 5. WIP STAGE-BY-STAGE BOTTLENECKS
  const stageMap = {};
  wipStages.forEach(w => {
    const stage = w.currentStage || 'Corrugation';
    const sheets = parseFloat(w.balanceQty || w.sheets || w.qty || 0);
    stageMap[stage] = (stageMap[stage] || 0) + sheets;
  });

  const wipStageBreakdown = Object.entries(stageMap).map(([stage, sheets]) => ({
    stage,
    sheets: Math.round(sheets)
  }));
  const bottleneckStage = wipStageBreakdown.reduce((max, s) => s.sheets > (max?.sheets || 0) ? s : max, null);

  // 6. ITEM COSTING SHEETS (Paper, Gum, Power, Wire, Freight, Profit Margin)
  const sampleCostSheets = items.slice(0, 15).map(item => {
    const boxWtGrams = parseFloat(item.weightGrams || item.boxWeight || 350);
    const boxWtKg = boxWtGrams / 1000;
    const paperRate = parseFloat(item.avgPaperRate || 33.0);
    const paperCost = boxWtKg * paperRate;
    const gumCost = boxWtKg * 1.80; // ~₹1.80/kg starch cost
    const conversionPowerCost = boxWtKg * 4.50; // ~₹4.50/kg conversion power & labor
    const printingWireCost = 0.85; // ink & stitching wire per box
    const freightCost = parseFloat(item.freightCost || 0.65);
    const totalMfgCost = paperCost + gumCost + conversionPowerCost + printingWireCost + freightCost;
    const sellingPrice = parseFloat(item.sellingPrice || item.rate || (totalMfgCost * 1.18).toFixed(2));
    const profitMarginPct = sellingPrice > 0 ? (((sellingPrice - totalMfgCost) / sellingPrice) * 100).toFixed(1) : '15.0';

    return {
      name: item.name || item.Item_Name || 'Standard Box',
      boxWeightGrams: Math.round(boxWtGrams),
      costPerKg: (totalMfgCost / (boxWtKg || 1)).toFixed(2),
      costPerBox: totalMfgCost.toFixed(2),
      breakdown: {
        paperCost: `₹${paperCost.toFixed(2)}`,
        gumCost: `₹${gumCost.toFixed(2)}`,
        powerAndConversion: `₹${conversionPowerCost.toFixed(2)}`,
        printingAndWire: `₹${printingWireCost.toFixed(2)}`,
        freight: `₹${freightCost.toFixed(2)}`
      },
      sellingPrice: `₹${sellingPrice.toFixed(2)}`,
      profitMargin: `${profitMarginPct}%`
    };
  });

  // 7. WIP ITEM-WISE BREAKDOWN
  const wipItemBreakdown = wipStages.map(w => {
    const total = parseFloat(w.totalSheets || w.orderQty || 0);
    const done = parseFloat(w.completedSheets || 0);
    const rem = parseFloat(w.balanceQty || (total - done));
    return {
      jobNo: w.jobNo || 'JC-DIRECT',
      itemName: w.itemName || 'Standard Box',
      stage: w.currentStage || 'Corrugation',
      scheduledSheets: Math.round(total),
      completedSheets: Math.round(done),
      remainingSheets: Math.round(rem),
      progressPct: total > 0 ? Math.round((done / total) * 100) : 0
    };
  });

  // 8. MACHINE-WISE & QUEUE-WISE PLANNING SCHEDULE (Today & Tomorrow)
  const tomorrow = new Date(Date.now() + 86400000);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const activePlannedJobs = (plannedJobs || []).filter(j => j.status !== 'Completed');
  const queueMap = {};

  activePlannedJobs.forEach(j => {
    const qId = j.queueId || 'q_line1';
    const qName = qId === 'q_line2' ? 'Line 2 Corrugator' : (qId === 'q_printing' ? '2-Color Printer & Slotter' : (qId === 'q_diecut' ? 'Rotary Die-Cutter' : 'Line 1 Corrugator'));
    if (!queueMap[qName]) queueMap[qName] = { jobsCount: 0, totalQty: 0, items: [] };
    queueMap[qName].jobsCount += 1;
    queueMap[qName].totalQty += (parseInt(j.plannedQty || 0));
    queueMap[qName].items.push({
      jobNo: j.jobNo,
      itemName: j.itemName,
      qty: parseInt(j.plannedQty || 0),
      customer: j.customerName || 'Standard'
    });
  });

  const machineWisePlanning = Object.entries(queueMap).map(([machine, data]) => ({
    machine,
    jobsCount: data.jobsCount,
    totalQty: data.totalQty,
    itemsSummary: data.items.map(i => `${i.itemName} (${i.qty.toLocaleString('en-IN')} pcs)`).join(', ')
  }));

  // 9. CLIENT FINANCIALS & PIPELINE
  const pendingOrders = orders.filter(o => o.status === 'Pending' || o.status === 'In Production');
  const totalPendingOrderValueInr = Math.round(pendingOrders.reduce((acc, o) => acc + (parseFloat(o.orderQty || 0) * parseFloat(o.rate || o.unitRate || 0)), 0));
  const totalPendingBoxes = pendingOrders.reduce((acc, o) => acc + (parseFloat(o.orderQty || 0)), 0);

  const clientOrderMap = {};
  pendingOrders.forEach(o => {
    const cust = o.customerName || 'General Customer';
    const val = (parseFloat(o.orderQty || 0) * parseFloat(o.rate || o.unitRate || 0));
    clientOrderMap[cust] = (clientOrderMap[cust] || 0) + val;
  });
  const topClientsByPendingValue = Object.entries(clientOrderMap).slice(0, 6).map(([customer, val]) => ({
    customer,
    pendingValueInr: Math.round(val)
  }));

  return {
    todayStr,
    tomorrowStr,
    production: {
      todayBoxes,
      todayMeters,
      monthBoxes,
      monthMeters,
      monthWeightKg,
      monthWeightMT: (monthWeightKg / 1000).toFixed(2),
      activeWipJobsCount: wipStages.length,
      wipStageBreakdown,
      wipItemBreakdown: wipItemBreakdown.slice(0, 20),
      bottleneckStage: bottleneckStage ? `${bottleneckStage.stage} (${bottleneckStage.sheets.toLocaleString('en-IN')} sheets)` : 'Normal flow'
    },
    planning: {
      totalQueuedJobs: activePlannedJobs.length,
      totalPlannedBoxes: activePlannedJobs.reduce((acc, j) => acc + (parseInt(j.plannedQty || 0)), 0),
      machineWisePlanning
    },
    wastageAndFuel: {
      monthScrapKg,
      monthScrapMT: (monthScrapKg / 1000).toFixed(2),
      monthCorrugationScrapKg,
      monthPrintingScrapKg,
      monthWastagePercentage: `${monthWastagePercentage}%`,
      monthFuelKg,
      monthFuelCostInr,
      monthPowerUnitsKwh,
      fuelKgPerTonPaper: monthWeightKg > 0 ? ((monthFuelKg / (monthWeightKg / 1000))).toFixed(1) : '120.0'
    },
    consumablesStock: {
      gumStockKg: gumStockKg || '1,250 kg',
      coalStockKg: coalStockKg ? `${(coalStockKg / 1000).toFixed(2)} MT` : '4.50 MT',
      wireStockKg: wireStockKg || '380 kg',
      inkStockKg: inkStockKg || '160 kg'
    },
    costEconomics: {
      avgPaperCostPerKg: `₹${avgPaperCostPerKg}/kg`,
      totalStockWeightKg: Math.round(totalStockWeightKg),
      totalStockMT: (totalStockWeightKg / 1000).toFixed(2),
      totalStockValuationInr,
      gsmCostBreakdown,
      sampleCostSheets,
      totalPendingOrderValueInr,
      totalPendingBoxes,
      topClientsByPendingValue
    }
  };
}

/**
 * 2. CONVERSATIONAL FACTORY AI AGENT
 * Answers complex questions across live orders, inventory, production, WIP stages, cost/kg, daily reports, and wastage/fuel logs.
 */
export async function askFactoryAI(userPrompt, factoryData = {}) {
  const {
    orders = [],
    inventory = [],
    items = [],
    production = [],
    wipStages = [],
    wastageLogs = [],
    companies = [],
    customers = [],
    costings = [],
    transactions = [],
    plannedJobs = []
  } = factoryData;

  const kpis = calculateFactoryKPIs(factoryData);

  const activeOrders = orders.filter(o => o.status === 'Pending' || o.status === 'In Production').slice(0, 30).map(o => ({
    id: o.id,
    orderNo: o.orderNo,
    customer: o.customerName,
    item: o.itemName,
    qty: o.orderQty,
    status: o.status,
    deliveryDate: o.deliveryDate
  }));

  const availableItemDetails = items.slice(0, 40).map(i => ({
    id: i.id,
    name: i.name || i.Item_Name,
    itemType: i.itemType || i.Item_Type || 'Box',
    size: i.size || i.Size_mm || '350x250x200',
    ply: i.ply || 3,
    idealDeckleMm: parseFloat(i.deckleMm || i.deckle || 900),
    cutLengthMm: parseFloat(i.cutLengthMm || i.cutLength || 1450),
    ups: parseFloat(i.plannedUps || i.upsLength || 1),
    weightGrams: parseFloat(i.weight || i.Weight_g || i.weightGrams || i.boxWeight || 350),
    ppcMatrix: i.ppcMatrix ? {
      config: i.ppcMatrix.config,
      totalCells: i.ppcMatrix.totalCells || 12,
      cellRows: i.ppcMatrix.cellRows || 4,
      cellCols: i.ppcMatrix.cellCols || 3,
      longCount: i.ppcMatrix.longCount || 2,
      crossCount: i.ppcMatrix.crossCount || 3,
      padCount: i.ppcMatrix.padCount || 2,
      totalSetWeightGrams: i.ppcMatrix.totalSetWeightGrams || i.weight
    } : null
  }));

  const activeReels = inventory.filter(r => r.status !== 'Consumed' && (parseFloat(r.balanceQty !== undefined ? r.balanceQty : r.receivedQty || 0) > 0)).slice(0, 40).map(r => ({
    id: r.systemReelId || r.uniqueReelId || `RL-${r.reelNo}`,
    gsm: r.gsm,
    bf: r.bf,
    deckle: r.size || r.deckleMm || r.deckle,
    weightKg: Math.round(parseFloat(r.balanceQty !== undefined ? r.balanceQty : r.receivedQty || 0)),
    ratePerKg: r.ratePerKg || r.rate || 32,
    loc: r.location,
    mill: r.millName
  }));

  const contextJson = JSON.stringify({
    computedKPIs: kpis,
    boxItemSpecs: availableItemDetails,
    activeOrdersSample: activeOrders,
    inventorySample: activeReels,
    companyList: companies.map(c => c.name)
  });

  const systemInstruction = `You are the Executive AI Manufacturing & Financial Intelligence Director for APEX Corrugation Packaging ERP.
You have omniscient, instant real-time visibility into the plant's 360-degree database:
1. FULL COST BREAKDOWN PER BOX & PER KG: Raw paper cost, starch/gum cost, power & fuel conversion cost, printing ink & stereo cost, stitching wire cost, freight, total manufacturing cost, selling price, and net profit margin (%).
2. DECKLE SUBSTITUTION, WASTAGE & FINANCIAL LOSS / GAIN:
   When an operator asks what happens if they use an alternative or non-standard deckle width (e.g. "What if I use 1050 deckle for 180ml IB Master?", "Can I use 100cm reel instead of 90cm for Radico 750ml?", "Deckle comparison 900 vs 1050 for 5000 boxes"):
   - Identify the item's Ideal Deckle Width (mm) vs the Proposed Alternative Deckle (mm).
   - Compute the excess side-trim (in mm and excess trim %).
   - Compute total extra raw paper weight consumed in KG across the order quantity: Extra Area (m²) * Total Board GSM / 1000.
   - Compute exact Net Financial Loss (₹) or Gain (₹) using: Extra Paper KG * (Kraft Paper Rate ₹34/kg - Scrap Resale Value ₹12/kg = ₹22/kg net differential).
   - Check and recommend if any closer matching reel exists in inventorySample (e.g. "Alternative: You have a 950mm reel in Bay-02 which only causes ₹1,800 loss").
3. PRODUCTION PERFORMANCE & DAILY REPORTS: Today's boxes produced, running linear meters, month-to-date MT tonnage, active machine WIP jobs.
4. WIP ITEM-WISE BREAKDOWN: When asked for an item-wise breakdown of WIP, list every active item name, current machine stage, scheduled sheets, completed sheets, and remaining balance sheets.
5. PLANNING SCHEDULE FOR TODAY / TOMORROW: When asked "What's the planning for today or tomorrow?", summarize total queued jobs and provide a clear machine-wise breakdown (e.g. Line 1 Corrugator, 2-Color Printer, Die-Cutter) with item names and quantities.
6. AUTOMATIC JOB CREATION & REEL MOUNTING:
   - When asked to create/plan a job, extract itemName, orderQty, customerName, and set action.type = 'create_job'.
   - When asked to mount/attach a reel, extract reelQuery, targetOrderId, and stand, and set action.type = 'attach_reel'.
7. WASTAGE, POWER & BOILER FUEL: Monthly scrap KG & %, corrugation vs printing scrap, coal/wood fuel usage (KG & ₹), kWh electricity units.
8. PAPER INVENTORY & REEL LOCATIONS: Exact balance weights, GSM/BF, deckle width, warehouse bay locations, aging paper alerts.
9. CONSUMABLES INVENTORY: Gum powder, stitching wire, boiler coal/wood, and printing inks.
10. CLIENT ACCOUNTS & PENDING REVENUE: Customer-wise pending order amounts, dispatch readiness, and delivery deadlines.

Live Factory Context:
${contextJson}`;

  const schema = {
    type: 'OBJECT',
    properties: {
      spokenResponse: { type: 'STRING', description: 'Clear, concise spoken answer (1-3 sentences) suitable for speech synthesis.' },
      displayCard: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'Headline title for the visual HUD card' },
          metricValue: { type: 'STRING', description: 'Key primary metric (e.g. ₹18.40/box, +150mm Trim Scrap (₹9,240 Loss), 28,000 Boxes Planned)' },
          details: { type: 'STRING', description: 'Comprehensive structured breakdown or bullet points' }
        },
        required: ['title', 'details']
      },
      action: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['none', 'open_job_card', 'navigate_tab', 'filter_view', 'switch_unit', 'create_job', 'open_create_job_modal', 'attach_reel', 'start_production'] },
          targetTab: { type: 'STRING', description: 'Tab name if navigating (orders, inventory, items, planning, reports, wastage, costing, wip_tracker, production, etc.)' },
          targetOrderId: { type: 'STRING', description: 'Order ID or Order No if opening job card or attaching reel' },
          unitName: { type: 'STRING', description: 'Unit name if switching plant' },
          filterQuery: { type: 'STRING', description: 'Search term to auto-filter on the target screen' },
          reelQuery: { type: 'STRING', description: 'Reel No, system reel ID, or reel spec to attach' },
          stand: { type: 'STRING', description: 'Machine stand: Top, Flute(C), Backing(C), Flute(B), Backing(B)' },
          jobPayload: {
            type: 'OBJECT',
            properties: {
              itemName: { type: 'STRING', description: 'Matched box item name from database' },
              orderQty: { type: 'NUMBER', description: 'Quantity of boxes to produce' },
              customerName: { type: 'STRING', description: 'Client / Customer Name' },
              deliveryDate: { type: 'STRING', description: 'Target delivery date in YYYY-MM-DD' },
              plannedUps: { type: 'NUMBER', description: 'Number of ups on die/plate (default 1)' },
              notes: { type: 'STRING', description: 'Production notes' }
            },
            required: ['itemName', 'orderQty']
          }
        },
        required: ['type']
      }
    },
    required: ['spokenResponse', 'displayCard', 'action']
  };

  const rawJson = await callGeminiApi({
    prompt: `Operator Question / Voice Command: "${userPrompt}"`,
    systemInstruction,
    responseSchema: schema,
    temperature: 0.2
  });

  return JSON.parse(rawJson);
}

/**
 * 3. AI MULTI-REEL INWARD DICTATION PARSER & BARCODE GENERATOR
 * Transforms speech like:
 * "Inward 4 reels from Star Paper Mill. Invoice 4521. Vehicle MH12AB1234. 
 *  Reel 1: 150 GSM 18 BF, 900 deckle, 650 kg, kraft. 
 *  Reel 2: 150 GSM 18 BF, 900 deckle, 680 kg. 
 *  Reel 3: 120 GSM 16 BF, 1000 deckle, 720 kg. 
 *  Reel 4: 180 GSM 20 BF, 1100 deckle, 800 kg golden."
 * into a structured multi-reel array ready for database saving and barcode label printing.
 */
export async function parseReelsInwardWithAI(speechTranscript, existingVendors = []) {
  const vendorsContext = existingVendors.map(v => v.name || v.vendorName).filter(Boolean).slice(0, 30).join(', ');

  const systemInstruction = `You are an expert AI Paper Reel Inward & Warehouse Specialist for a Corrugation Box Factory.
Your task is to parse spoken operator dictation of multiple inward paper reels into a structured JSON payload.

Factory Inward Rules:
- A single dictation can contain 1 to 50 reels.
- Standard GSM values: 60 to 400 GSM (e.g. 100, 120, 140, 150, 180, 200, 250).
- Standard Burst Factor (BF): 12 to 40 BF (e.g. 14, 16, 18, 20, 22, 24, 28).
- Deckle / Reel Size (mm or inches): Typically 500 to 2200 mm.
- Weight: in Kilograms (kg) (e.g. 650 kg, 720 kg).
- Paper Shades / Types: 'Kraft', 'Golden', 'Duplex', 'Semi Chemical'. Default is 'Kraft'.
- Mill / Supplier Name: Extract or match from known vendors: [${vendorsContext}].
- Invoice Number and Vehicle Number if spoken.
- Auto-extract or generate supplier reel numbers if mentioned (e.g. "Reel 101", "RL-540", or sequential).`;

  const prompt = `Parse the following spoken operator reel delivery dictation:
Dictation: "${speechTranscript}"

Return JSON matching the schema with millName, invoiceNo, vehicleNo, date, and the complete array of reels (supplierReelNo, gsm, bf, size, receivedQty, colour, ratePerKg, location).`;

  const schema = {
    type: 'OBJECT',
    properties: {
      millName: { type: 'STRING', description: 'Paper Mill or Supplier Name' },
      invoiceNo: { type: 'STRING', description: 'Supplier Invoice or Delivery Challan No' },
      vehicleNo: { type: 'STRING', description: 'Truck or Vehicle Registration Number' },
      date: { type: 'STRING', description: 'Delivery date in YYYY-MM-DD format (default to today if not mentioned)' },
      reels: {
        type: 'ARRAY',
        description: 'List of all individual paper reels inwarded',
        items: {
          type: 'OBJECT',
          properties: {
            supplierReelNo: { type: 'STRING', description: 'Supplier / Mill Reel Number or barcode printed on reel' },
            size: { type: 'NUMBER', description: 'Deckle width in mm (e.g. 900, 1000, 1100, 1250)' },
            gsm: { type: 'NUMBER', description: 'Paper Grammage GSM (e.g. 120, 140, 150, 180)' },
            bf: { type: 'NUMBER', description: 'Burst Factor (e.g. 16, 18, 20, 22, 28)' },
            receivedQty: { type: 'NUMBER', description: 'Gross / Net weight of the reel in KG' },
            colour: { type: 'STRING', enum: ['Kraft', 'Golden', 'Duplex', 'Semi Chemical'], description: 'Paper shade' },
            ratePerKg: { type: 'NUMBER', description: 'Paper purchase rate per kg in INR' },
            location: { type: 'STRING', description: 'Warehouse storage bay/rack location (e.g. Bay-01, Rack-A)' }
          },
          required: ['gsm', 'bf', 'size', 'receivedQty']
        }
      },
      summaryVoiceText: { type: 'STRING', description: 'Concise 1-sentence spoken summary with total reels and total KG to confirm with operator' }
    },
    required: ['reels', 'summaryVoiceText']
  };

  const rawJson = await callGeminiApi({
    prompt,
    systemInstruction,
    responseSchema: schema,
    temperature: 0.1
  });

  return JSON.parse(rawJson);
}
