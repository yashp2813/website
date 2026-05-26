/**
 * TallyPrime Secure Bridge Connector
 * ----------------------------------
 * This script runs as a background service on your Tally Server.
 * It listens to your Firebase Firestore database in real-time and pushes
 * received paper reels (Purchase Vouchers) and production logs (Stock Journals)
 * directly into Tally via Tally's local HTTP API (port 9000).
 * 
 * Dependencies:
 *   npm install firebase-admin axios xml2js dotenv
 */

require('dotenv').config();
const admin = require('firebase-admin');
const axios = require('axios');
const xml2js = require('xml2js');

// 1. Initialize Firebase Admin
// Make sure to download your Service Account JSON file from Firebase Console:
// Project Settings > Service Accounts > Generate New Private Key
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const TALLY_URL = process.env.TALLY_URL || 'http://localhost:9000';

console.log('----------------------------------------------------');
console.log('TallyPrime Bridge Connector is starting...');
console.log(`Connecting to local Tally instance at: ${TALLY_URL}`);
console.log('Listening to Firestore for unsynced transactions...');
console.log('----------------------------------------------------');

// Helper to parse Tally amounts safely
const parseTallyNum = (val) => {
  if (!val) return 0;
  return parseFloat(val.toString().replace(/[^\d.-]/g, '')) || 0;
};

// Send XML payload to TallyPrime local port
async function postToTally(xmlData) {
  try {
    const response = await axios.post(TALLY_URL, xmlData, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
      }
    });

    // Parse Tally's XML response to check for errors
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);
    
    // Tally response envelope check
    const responseBody = result.ENVELOPE?.BODY;
    if (responseBody?.DATA?.LINEERROR) {
      console.error(`[Tally Error]: ${responseBody.DATA.LINEERROR}`);
      return { success: false, error: responseBody.DATA.LINEERROR };
    }
    
    // Check if any errors are mentioned in import status
    const statusMsg = responseBody?.DATA?.IMPORTSTATUS?.STATUS || '';
    if (statusMsg.toLowerCase().includes('failed') || statusMsg.toLowerCase().includes('error')) {
      console.error(`[Tally Sync Failed]: ${statusMsg}`);
      return { success: false, error: statusMsg };
    }

    console.log('[Tally Sync Response]: Success');
    return { success: true };
  } catch (err) {
    console.error('[Network Error connecting to Tally]:', err.message);
    return { success: false, error: err.message };
  }
}

// ========================================================
// SYNC TASK 1: Export Received Paper Reels (ERP -> Tally)
// ========================================================
async function syncPaperReels() {
  try {
    // Fetch all unsynced received paper reels
    const snapshot = await db.collection('inventory')
      .where('category', '==', 'Paper')
      .where('status', '==', 'Received')
      .where('tallySynced', '!=', true)
      .get();

    if (snapshot.empty) return;

    console.log(`Found ${snapshot.size} unsynced paper reels. Processing...`);

    // Group reels by vendor and invoice details
    const groups = {};
    snapshot.forEach(doc => {
      const data = { id: doc.id, ...doc.data() };
      const groupKey = `${data.vendorName || 'Unknown'}_${data.invoiceNo || 'Unknown'}_${data.date || ''}`.replace(/\s+/g, '_');
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(data);
    });

    for (const key of Object.keys(groups)) {
      const group = groups[key];
      const first = group[0];
      const dateRaw = new Date(first.date);
      const yyyymmdd = `${dateRaw.getFullYear()}${String(dateRaw.getMonth() + 1).padStart(2, '0')}${String(dateRaw.getDate()).padStart(2, '0')}`;

      const basicAmt = group.reduce((sum, r) => sum + (parseTallyNum(r.ratePerKg) * parseTallyNum(r.weightReceived)), 0);
      const gstAmt = basicAmt * 0.18; // default 18% GST
      const isSameState = String(first.vendorState || '').toLowerCase().trim() === String(first.unitState || '').toLowerCase().trim();
      
      const cgst = isSameState ? gstAmt / 2 : 0;
      const sgst = isSameState ? gstAmt / 2 : 0;
      const igst = isSameState ? 0 : gstAmt;
      const totalAmt = basicAmt + gstAmt;

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
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Purchase" ACTION="Create" OBJTYPE="Voucher">
            <DATE>${yyyymmdd}</DATE>
            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${first.invoiceNo || 'REEL-IN'}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${first.vendorName || 'Sundry Creditor'}</PARTYLEDGERNAME>
            <EFFECTIVEDATE>${yyyymmdd}</EFFECTIVEDATE>
            
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${first.vendorName || 'Sundry Creditor'}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${totalAmt.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
`;

      group.forEach(r => {
        const itemStockName = `Kraft Paper Reel ${r.bf || '18'}BF ${r.gsm || '180'}GSM ${r.size || '80'}cm`;
        const qty = parseTallyNum(r.weightReceived);
        const rate = parseTallyNum(r.ratePerKg);
        const amount = qty * rate;

        xmlString += `            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${itemStockName}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <RATE>${rate.toFixed(2)}/kg</RATE>
              <AMOUNT>-${amount.toFixed(2)}</AMOUNT>
              <ACTUALQTY>${qty.toFixed(2)} kg</ACTUALQTY>
              <BILLEDQTY>${qty.toFixed(2)} kg</BILLEDQTY>
              
              <ACCOUNTINGALLOCATIONS.LIST>
                <LEDGERNAME>Purchase Account</LEDGERNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                <AMOUNT>-${amount.toFixed(2)}</AMOUNT>
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
      } else if (igst > 0) {
        xmlString += `            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>IGST Input Ledger</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${igst.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
`;
      }

      xmlString += `          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

      console.log(`Sending Purchase Voucher for invoice: ${first.invoiceNo} to Tally...`);
      const res = await postToTally(xmlString);
      if (res.success) {
        // Mark all reels in this group as Synced in Firebase
        const batch = db.batch();
        group.forEach(r => {
          const ref = db.collection('inventory').doc(r.id);
          batch.update(ref, { tallySynced: true });
        });
        await batch.commit();
        console.log(`Successfully synced and marked ${group.length} reels.`);
      }
    }
  } catch (err) {
    console.error('Error syncing paper reels:', err);
  }
}

// ========================================================
// SYNC TASK 2: Export Production Logs (ERP -> Tally Stock Journals)
// ========================================================
async function syncProductionLogs() {
  try {
    const snapshot = await db.collection('production')
      .where('tallySynced', '!=', true)
      .get();

    if (snapshot.empty) return;

    console.log(`Found ${snapshot.size} unsynced production logs. Syncing to Tally...`);

    for (const doc of snapshot.docs) {
      const p = { id: doc.id, ...doc.data() };
      const rawD = new Date(p.date || new Date());
      const yyyymmdd = `${rawD.getFullYear()}${String(rawD.getMonth() + 1).padStart(2, '0')}${String(rawD.getDate()).padStart(2, '0')}`;
      const voucherNo = `PROD-${yyyymmdd}-${p.id.substring(0, 5).toUpperCase()}`;

      let totalConsumptionVal = 0;
      const consumptionLines = [];

      // Calculate consumption details based on consumed reels
      const consumedReels = p.consumedReels || [];
      for (const cr of consumedReels) {
        const weight = parseFloat(cr.weight || 0);
        if (weight <= 0) continue;

        // Fetch reel details to find rate
        const reelNoTrimmed = (cr.reelNo || '').toLowerCase().trim();
        const reelQuery = await db.collection('inventory')
          .where('category', '==', 'Paper')
          .where('reelNo', '==', cr.reelNo)
          .limit(1)
          .get();

        let rate = 40; // Default fallback rate/kg
        let specName = `Kraft Paper Reel`;

        if (!reelQuery.empty) {
          const rData = reelQuery.docs[0].data();
          rate = parseTallyNum(rData.ratePerKg) || 40;
          specName = `Kraft Paper Reel ${rData.bf || '18'}BF ${rData.gsm || '180'}GSM ${rData.size || '80'}cm`;
        }

        const amt = weight * rate;
        totalConsumptionVal += amt;
        consumptionLines.push({
          itemName: specName,
          qty: weight,
          rate,
          amount: amt
        });
      }

      // Fallback if consumedReels was empty but useKg exists
      if (consumptionLines.length === 0 && parseTallyNum(p.useKg) > 0) {
        const weight = parseTallyNum(p.useKg);
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

      const producedQty = parseTallyNum(p.linerQty);
      const producedItemName = p.usedForItem || "Finished Boxes";

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
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Stock Journal" ACTION="Create" OBJTYPE="Voucher">
            <DATE>${yyyymmdd}</DATE>
            <VOUCHERTYPENAME>Stock Journal</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${voucherNo}</VOUCHERNUMBER>
            <EFFECTIVEDATE>${yyyymmdd}</EFFECTIVEDATE>
`;

      // Consumption Out Items
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

      // Production In Items
      if (producedQty > 0 && totalConsumptionVal > 0) {
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
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

      console.log(`Sending Stock Journal: ${voucherNo} to Tally...`);
      const res = await postToTally(xmlString);
      if (res.success) {
        await db.collection('production').doc(p.id).update({ tallySynced: true });
        console.log(`Production Log ${p.id} successfully synced.`);
      }
    }
  } catch (err) {
    console.error('Error syncing production logs:', err);
  }
}

// Run the sync loops every 30 seconds
const SYNC_INTERVAL_MS = 30000;
setInterval(async () => {
  console.log('\n[Sync Cycle Start]', new Date().toLocaleTimeString());
  await syncPaperReels();
  await syncProductionLogs();
  console.log('[Sync Cycle Complete]');
}, SYNC_INTERVAL_MS);

// Run immediately on start
(async () => {
  await syncPaperReels();
  await syncProductionLogs();
})();
