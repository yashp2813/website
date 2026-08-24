// =========================================================================
// GOOGLE GEMINI AI INTEGRATION SERVICE FOR APEX CORRUGATION ERP
// =========================================================================

const STORAGE_KEY_GEMINI = 'apex_gemini_api_key';
const STORAGE_KEY_GEMINI_MODEL = 'apex_gemini_model';

// Supported Google Gemini models in order of priority
export const GEMINI_CANDIDATE_MODELS = [
  'gemini-1.5-flash',
  'gemini-2.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash-exp',
  'gemini-2.0-flash'
];

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

export function getPreferredGeminiModel() {
  return localStorage.getItem(STORAGE_KEY_GEMINI_MODEL) || 'gemini-1.5-flash';
}

export function setPreferredGeminiModel(modelName) {
  if (modelName && modelName.trim()) {
    localStorage.setItem(STORAGE_KEY_GEMINI_MODEL, modelName.trim());
  }
}

export function isGeminiConfigured() {
  return !!getGeminiApiKey();
}

/**
 * Calls Gemini API with latest models (1.5 Flash / 2.5 Flash / 1.5 Pro)
 * with automatic fallback cascade if a specific model endpoint is unavailable.
 */
async function callGeminiApi({ prompt, systemInstruction = '', responseSchema = null, temperature = 0.2 }) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_KEY_MISSING');
  }

  const preferred = getPreferredGeminiModel();
  const modelsToTry = [
    preferred,
    ...GEMINI_CANDIDATE_MODELS.filter(m => m !== preferred)
  ];

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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

        // If model is not available or 404, cascade to next candidate model
        if (
          response.status === 404 ||
          errorMsg.toLowerCase().includes('no longer available') ||
          errorMsg.toLowerCase().includes('not found') ||
          errorMsg.toLowerCase().includes('is not supported')
        ) {
          console.warn(`[Gemini AI] Model ${model} unavailable (${errorMsg}), trying fallback...`);
          lastError = new Error(errorMsg);
          continue;
        }

        throw new Error(errorMsg);
      }

      const result = await response.json();
      const textOutput = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // If a fallback model worked, remember it for future calls
      if (model !== preferred) {
        setPreferredGeminiModel(model);
      }

      return textOutput;
    } catch (err) {
      if (
        err.message.toLowerCase().includes('no longer available') ||
        err.message.toLowerCase().includes('not found') ||
        err.message.toLowerCase().includes('404')
      ) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('All Gemini models failed. Please verify your API Key.');
}

/**
 * Robust JSON extraction and repair helper
 */
export function cleanAndParseJson(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  let cleaned = rawText.trim();
  // Strip markdown code fences
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  // Find outermost object or array
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');

  let startIdx = -1;
  let isObject = true;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    isObject = true;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    isObject = false;
  }

  if (startIdx !== -1) {
    const endChar = isObject ? '}' : ']';
    const lastIdx = cleaned.lastIndexOf(endChar);
    if (lastIdx !== -1 && lastIdx >= startIdx) {
      cleaned = cleaned.substring(startIdx, lastIdx + 1);
    } else {
      // Truncation repair: append missing closing bracket/brace
      cleaned = cleaned.substring(startIdx) + (isObject ? '}' : ']');
    }
  }

  try {
    return JSON.parse(cleaned);
  } catch (e1) {
    try {
      const repaired = cleaned
        .replace(/,\s*([}\]])/g, '$1') // remove trailing commas
        .replace(/[\u0000-\u001F]+/g, ' '); // remove control characters
      return JSON.parse(repaired);
    } catch (e2) {
      console.warn('cleanAndParseJson failed to parse:', cleaned);
      return null;
    }
  }
}

/**
 * Regex-based fast extractor for box dimensions, ply, flute, and item type
 */
export function parseBoxRecipeRegexFallback(transcript) {
  const text = String(transcript || '').trim();
  if (!text) return null;

  let size = '';
  // Extract dimensions: e.g. "450 by 300 by 200", "450x300x200", "450 300 200", "450 into 300 into 200"
  const nums = text.match(/\b\d{2,4}\b/g);
  if (nums && nums.length >= 2) {
    size = nums.slice(0, 3).join('x');
  } else {
    const dimMatch = text.match(/(\d+)\s*(?:x|\*|by|into|cross|\s+)\s*(\d+)(?:\s*(?:x|\*|by|into|cross|\s+)\s*(\d+))?/i);
    if (dimMatch) {
      size = dimMatch[3] ? `${dimMatch[1]}x${dimMatch[2]}x${dimMatch[3]}` : `${dimMatch[1]}x${dimMatch[2]}`;
    }
  }

  let ply = '';
  const plyMatch = text.match(/([23579])\s*(?:ply|plies)/i);
  if (plyMatch) ply = plyMatch[1];

  let fluteType = '';
  const fluteMatch = text.match(/\b([BCEAbcea]|BC|AB|bc|ab)\s*(?:flute|fluting)?\b/i);
  if (fluteMatch) fluteType = fluteMatch[1].toUpperCase();

  let itemType = 'Box';
  if (/\bppc\b/i.test(text)) itemType = 'PPC';
  else if (/\bplate\b/i.test(text)) itemType = 'Plate';
  else if (/\btray\b/i.test(text)) itemType = 'Tray';
  else if (/\bsheet\b/i.test(text)) itemType = 'Sheet';

  return {
    action: /edit|update|change|set/i.test(text) ? 'edit' : 'create',
    name: '',
    size,
    ply,
    fluteType,
    itemType,
    layers: [],
    summaryVoiceText: size ? `Updated box size to ${size} mm.` : 'Box parameters extracted.'
  };
}

/**
 * 1. AI BOX SPECIFICATION & LAYER BOM RECIPE DICTATION PARSER
 * Transforms speech like "Edit 180ml IB Master. Size 450x300x200, 3 ply B flute. Top golden 150 16bf, fluting 120 16bf, bottom kraft 140 18bf"
 * into a complete structured Box & Paper Layer Matrix.
 */
export async function parseBoxRecipeWithAI(speechTranscript, existingItems = []) {
  const fallback = parseBoxRecipeRegexFallback(speechTranscript);

  try {
    const itemsContext = existingItems.map(i => i.name || i.Item_Name).filter(Boolean).slice(0, 50).join(', ');

    const systemInstruction = `You are an expert AI Corrugation Packaging Engineer assisting an operator in dictating Box Specifications and Paper Layer Recipes (BOM).
Your task is to parse unstructured spoken dictation into a structured JSON Box Recipe.

Corrugation Packaging Rules:
- Ply count: 3 Ply (3 layers), 5 Ply (5 layers), 7 Ply (7 layers), 2 Ply (2 layers).
- Default flute take-up factors: B=1.35, C=1.43, E=1.27, A=1.52, BC=1.35/1.43. Liner take-up is always 1.0.
- Paper types/materials: 'Kraft', 'Golden', 'Duplex'.
- Standard Layer Roles for 3-Ply: 1: "Top Liner", 2: "Fluting Medium", 3: "Bottom Liner".
- Standard Layer Roles for 5-Ply: 1: "Top Liner", 2: "Fluting Medium 1", 3: "Center Liner", 4: "Fluting Medium 2", 5: "Bottom Liner".
- Dimensions format: "LENGTHxWIDTHxHEIGHT" in mm (e.g., "450x300x200"). If dimensions spoken as "450 by 300 by 200", "450 into 300 into 200", "450 300 200", or "change size to 450x300x200", extract size strictly as "450x300x200".
- Known existing item names in database: [${itemsContext}]`;

    const prompt = `Parse the following spoken operator dictation into a box specification:
Dictation: "${speechTranscript}"

Return JSON with action ('create' or 'edit'), targetItemName (if editing), name, size (e.g. 450x300x200), ply ('3', '5', '7', '2'), fluteType ('B', 'C', 'E', 'A', 'BC', 'AB'), itemType ('Box', 'PPC', 'Plate', 'Tray', 'Sheet'), and layers array.`;

    const schema = {
      type: 'OBJECT',
      properties: {
        action: { type: 'STRING', enum: ['create', 'edit'], description: 'Whether the operator wants to create a new box or edit an existing one' },
        targetItemName: { type: 'STRING', description: 'Name of the existing box item if editing' },
        name: { type: 'STRING', description: 'Clean formatted Item / SKU Name' },
        itemType: { type: 'STRING', enum: ['Box', 'PPC', 'Plate', 'Tray', 'Sheet'], description: 'Type of item' },
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
      required: ['action', 'summaryVoiceText']
    };

    const rawJson = await callGeminiApi({
      prompt,
      systemInstruction,
      responseSchema: schema,
      temperature: 0.1
    });

    const parsed = cleanAndParseJson(rawJson);
    if (parsed) {
      if (!parsed.size && fallback?.size) {
        parsed.size = fallback.size;
      }
      return parsed;
    }
    return fallback;
  } catch (err) {
    console.warn('parseBoxRecipeWithAI failed, falling back to regex parser:', err);
    if (fallback && (fallback.size || fallback.ply || fallback.name)) {
      return fallback;
    }
    throw err;
  }
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
  transactions = [],
  plannedJobs = []
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

  const availableItemDetails = items.slice(0, 100).map(i => ({
    id: i.id,
    name: i.name || i.Item_Name,
    itemType: i.itemType || i.Item_Type || 'Box',
    category: i.category || i.boxCategory || i.boxCategoryName || '',
    size: i.size || i.Size_mm || '350x250x200',
    ply: i.ply || 3,
    fluteType: i.fluteType || 'B',
    paperGsm: i.paperGsm || '140',
    paperBf: i.paperBf || '18',
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

  const systemInstruction = `You are the Master AI Corrugation Chief Engineer, Plant Operations Consultant & Financial Director for APEX Corrugation Packaging ERP.
You possess deep industrial packaging engineering knowledge and autonomous multi-action execution capability across the plant:

1. MULTI-INTENT & COMPOUND ACTIONS ("DO MULTIPLE THINGS AT ONCE"):
   Operators can give compound multi-action dictations in a single breath!
   For example: "Change 180ml IB Master size to 450x300x200, log 120 kg trim wastage, create an order for 5000 boxes of Radico 750ml, and show me today's production report."
   -> Parse ALL distinct commands into the 'actions' array in execution sequence!

2. INDUSTRIAL PACKAGING TROUBLESHOOTING & DEFECT DIAGNOSTICS:
   When operators describe quality failures, laboratory rejections, or machine defects:
   - **Board Warping (Normal / Reverse / S-Warp / Twist)**: Moisture imbalance between top/bottom liners (ideal delta <2%), preheater wrap angle, starch application rate, corrugator speed.
   - **Flute Crush / Caliper Loss**: Slitter nip clearance, corrugating roll wear/pressure roll gap (<0.1mm variation), fingerless single facer vacuum suction.
   - **Delamination / Loose Paper**: Gelatinization temp (target 62–66°C), glue pan temperature, low starch solids ratio, excessive line speed.
   - **Washboarding**: Excess starch solids/water, light top liner (<120 GSM) across coarse C-flute profile.
   - **Low Bursting Strength (BS) / BCT Failure**: Crushed flutes, excessive moisture (>9%), low BF bottom liner, starch penetration failure.
   - **Score Cracking / Flap Breakage**: Low liner moisture (<6%), sharp male scorer profile, incorrect gap clearance on creaser.
   - **Printing Defects (Smudge / Bleed / Ghosting)**: Anilox cell volume, ink pH (8.5–9.2), viscosity (18–22s Zahn #2), blade pressure.
   Provide exact root causes and step-by-step corrective actions in displayCard and troubleshooting objects.

3. FACTORY PERFORMANCE OPTIMIZATION & "WHERE TO IMPROVE":
   When asked where the factory can improve or how to optimize:
   - **Deckle Trim Optimization**: Analyze side-trim waste. Recommend reel width combinations (e.g. combining orders on corrugator) to minimize trim scrap to <3%.
   - **Energy & Boiler Efficiency**: Standard benchmark is 90–110 kg coal per Metric Tonne of paper converted. Steam pressure target 10.5–12.0 bar.
   - **WIP & Machine Speed Balancing**: Corrugator output vs 2-Color Printer/Slotter vs Auto Folder Gluer. Identify staging bottlenecks.
   - **Consumables Cost**: Starch consumption benchmark (18–22 g/m² dry solids), stitching wire waste.

4. REAL-TIME FACTORY DATABASE MUTATIONS (CRUD & BULK):
   - **Items / Box Specs (Single & Bulk Updates)**:
     * Single Item: update_item, create_item, delete_item.
     * Bulk / Batch Items: When operator asks to update ALL items of a category/type/ply (e.g. "Edit all PPC items to have 180 GSM Golden top liner and 140 GSM fluting", "Change all 5 ply boxes to BC flute", "Update all Plates to 200 GSM 20 BF"):
       -> set action.type = 'bulk_update_items' (or 'update_item' with applyToAllMatching: true), filterItemType: 'PPC'|'Box'|'Plate'|'Tray'|'Sheet'|'all', filterPly: '3'|'5'|'7'|'all', and provide updated layers, gsm, bf, fluteType, etc. in itemPayload!
   - **Orders & Jobs**: create_order, update_order, create_job, start_production, log_production.
   - **Inventory & Stands**: attach_reel (Top, Flute(C), Backing(C), Flute(B), Backing(B)), inward_reels.
   - **Wastage & Fuel**: log_wastage (Corrugator Trim, Printing Scrap, Die-Cut Scrap), log_fuel_power (coal, firewood, power kWh).
   - **Navigation & Filtering**: navigate_tab, switch_unit, open_job_card, filter_view.

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
          metricValue: { type: 'STRING', description: 'Key primary metric or badge' },
          details: { type: 'STRING', description: 'Comprehensive structured breakdown or bullet points' },
          recommendations: {
            type: 'ARRAY',
            description: 'Actionable optimization advice or engineering remedies',
            items: { type: 'STRING' }
          }
        },
        required: ['title', 'details']
      },
      troubleshooting: {
        type: 'OBJECT',
        properties: {
          issue: { type: 'STRING', description: 'Identified packaging or machine defect' },
          rootCauses: { type: 'ARRAY', items: { type: 'STRING' } },
          correctiveActions: { type: 'ARRAY', items: { type: 'STRING' } }
        }
      },
      actions: {
        type: 'ARRAY',
        description: 'Ordered list of autonomous database mutation and navigation actions to execute',
        items: {
          type: 'OBJECT',
          properties: {
            type: {
              type: 'STRING',
              enum: [
                'none',
                'update_item',
                'bulk_update_items',
                'create_item',
                'delete_item',
                'create_order',
                'update_order',
                'create_job',
                'open_create_job_modal',
                'open_job_card',
                'attach_reel',
                'start_production',
                'log_production',
                'log_wastage',
                'log_fuel_power',
                'inward_reels',
                'navigate_tab',
                'filter_view',
                'switch_unit'
              ]
            },
            targetTab: { type: 'STRING', description: 'Target navigation screen' },
            targetOrderId: { type: 'STRING', description: 'Target Order ID / No' },
            targetItemName: { type: 'STRING', description: 'Target Box / Item Name' },
            unitName: { type: 'STRING', description: 'Manufacturing unit name' },
            filterQuery: { type: 'STRING', description: 'Search/filter text' },
            reelQuery: { type: 'STRING', description: 'Reel identification' },
            stand: { type: 'STRING', description: 'Machine stand position' },
            itemPayload: {
              type: 'OBJECT',
              properties: {
                targetItemName: { type: 'STRING' },
                applyToAllMatching: { type: 'BOOLEAN', description: 'True when updating all items matching category/type' },
                filterCategory: { type: 'STRING', description: 'Filter items by category name e.g. Liquor, Pharma, Auto, etc.' },
                filterItemType: { type: 'STRING', enum: ['Box', 'PPC', 'Plate', 'Tray', 'Sheet', 'all'] },
                filterPly: { type: 'STRING', enum: ['3', '5', '7', '2', 'all'] },
                name: { type: 'STRING' },
                size: { type: 'STRING', description: 'Dimensions in LxWxH mm' },
                ply: { type: 'STRING', enum: ['3', '5', '7', '2'] },
                fluteType: { type: 'STRING', enum: ['B', 'C', 'E', 'A', 'BC', 'AB'] },
                itemType: { type: 'STRING', enum: ['Box', 'PPC', 'Plate', 'Tray', 'Sheet'] },
                paperGsm: { type: 'STRING' },
                paperBf: { type: 'STRING' },
                paperColour: { type: 'STRING' },
                layers: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      name: { type: 'STRING' },
                      type: { type: 'STRING' },
                      gsm: { type: 'NUMBER' },
                      bf: { type: 'NUMBER' },
                      takeUp: { type: 'NUMBER' },
                      isFlute: { type: 'BOOLEAN' }
                    }
                  }
                },
                ppcMatrix: {
                  type: 'OBJECT',
                  properties: {
                    enabled: { type: 'BOOLEAN' },
                    config: { type: 'STRING' },
                    cellRows: { type: 'NUMBER' },
                    cellCols: { type: 'NUMBER' },
                    totalCells: { type: 'NUMBER' },
                    longCount: { type: 'NUMBER' },
                    crossCount: { type: 'NUMBER' },
                    padCount: { type: 'NUMBER' },
                    includeOuterBox: { type: 'BOOLEAN' }
                  }
                }
              }
            },
            orderPayload: {
              type: 'OBJECT',
              properties: {
                itemName: { type: 'STRING' },
                customerName: { type: 'STRING' },
                orderQty: { type: 'NUMBER' },
                unitPrice: { type: 'NUMBER' },
                deliveryDate: { type: 'STRING' },
                poNumber: { type: 'STRING' }
              }
            },
            jobPayload: {
              type: 'OBJECT',
              properties: {
                itemName: { type: 'STRING' },
                orderQty: { type: 'NUMBER' },
                customerName: { type: 'STRING' },
                deliveryDate: { type: 'STRING' },
                plannedUps: { type: 'NUMBER' },
                notes: { type: 'STRING' }
              }
            },
            productionPayload: {
              type: 'OBJECT',
              properties: {
                sheetsProduced: { type: 'NUMBER' },
                boxesPacked: { type: 'NUMBER' },
                wastageKg: { type: 'NUMBER' },
                machine: { type: 'STRING' }
              }
            },
            wastagePayload: {
              type: 'OBJECT',
              properties: {
                wastageKg: { type: 'NUMBER' },
                type: { type: 'STRING' },
                reason: { type: 'STRING' }
              }
            },
            fuelPowerPayload: {
              type: 'OBJECT',
              properties: {
                coalKg: { type: 'NUMBER' },
                firewoodKg: { type: 'NUMBER' },
                powerKwh: { type: 'NUMBER' }
              }
            }
          },
          required: ['type']
        }
      }
    },
    required: ['spokenResponse', 'displayCard', 'actions']
  };

  const rawJson = await callGeminiApi({
    prompt: `Operator Question / Voice Command: "${userPrompt}"`,
    systemInstruction,
    responseSchema: schema,
    temperature: 0.2
  });

  return cleanAndParseJson(rawJson);
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

  return cleanAndParseJson(rawJson);
}
