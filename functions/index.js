const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { DocumentProcessorServiceClient } = require("@google-cloud/documentai").v1;

const client = new DocumentProcessorServiceClient({
  apiEndpoint: 'asia-south1-documentai.googleapis.com'
});

// --- DATE FORMATTER ---
function formatToYYYYMMDD(rawDate) {
    if (!rawDate) return '';
    let clean = rawDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    const parts = clean.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (parts) {
        let day = parts[1].padStart(2, '0');
        let month = parts[2].padStart(2, '0');
        let year = parts[3];
        if (year.length === 2) year = '20' + year;
        return `${year}-${month}-${day}`;
    }
    return clean;
}

// --- PROXIMITY HELPERS ---
// Added 'flags' parameter so we can force case-insensitive global searches
function getTokens(regexStr, text, flags = 'g') {
    let tokens = [];
    let re = new RegExp(regexStr, flags);
    let match;
    while ((match = re.exec(text)) !== null) {
        tokens.push({ val: match[1] || match[0], index: match.index });
    }
    return tokens;
}

function pullClosest(targetIndex, pool, consume, claimedIndices = []) {
    if (!pool || pool.length === 0) return null;
    let closestIdx = -1;
    let minDiff = Infinity;
    
    for (let i = 0; i < pool.length; i++) {
        let isClaimed = claimedIndices.some(ci => Math.abs(ci - pool[i].index) < 3);
        if (isClaimed) continue;
        let diff = Math.abs(targetIndex - pool[i].index);
        if (diff < minDiff) {
            minDiff = diff;
            closestIdx = i;
        }
    }
    
    if (closestIdx === -1) return null;
    let selectedToken = pool[closestIdx];
    if (consume) pool.splice(closestIdx, 1);
    return selectedToken;
}

exports.parseInvoice = onCall({ cors: true, region: 'asia-south1' }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");

  const { base64Image, mimeType } = request.data;
  const projectId = process.env.GCLOUD_PROJECT || 'mahapack-erp';
  const location = 'asia-south1'; 
  
  // 👉 PASTE YOUR DOCUMENT AI PROCESSOR ID HERE:
  const processorId = 'd4818c4f54be450'; 

  const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;

  try {
    let cleanBase64 = base64Image;
    if (base64Image.includes(',')) cleanBase64 = base64Image.split(',')[1];

    const [result] = await client.processDocument({
      name, 
      rawDocument: { content: cleanBase64, mimeType: mimeType || 'application/pdf' },
    });

    let parsedData = { millName: '', invoiceNo: '', date: '', lineItems: [] };
    if (!result.document || !result.document.entities) return parsedData;

    const fullText = result.document.text || '';
    const textUpper = fullText.toUpperCase();
    let rawLineItems = [];

    for (const entity of result.document.entities) {
      if (entity.type === 'supplier_name') parsedData.millName = entity.mentionText || '';
      if (entity.type === 'invoice_id') parsedData.invoiceNo = entity.mentionText || '';
      if (entity.type === 'invoice_date') parsedData.date = entity.mentionText || '';
    }

    parsedData.date = formatToYYYYMMDD(parsedData.date);
    if (!parsedData.date) {
        let dateMatch = fullText.match(/(?:Date|Dt)[\s:.-]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
        if (dateMatch) parsedData.date = formatToYYYYMMDD(dateMatch[1]);
    }

    const isSpenzzer = textUpper.includes('SPENZZER') || (parsedData.millName && parsedData.millName.toUpperCase().includes('SPENZZER'));
    const isDevBhoomi = textUpper.includes('DEV BHOOMI');
    const isHanumant = textUpper.includes('HANUMANT') || textUpper.includes('KUVIRA');

    let colors = getTokens('\\b(GOLDEN|KRAFT|NATURAL)\\b', textUpper);

    if (isSpenzzer) {
        // ==========================================
        // SPENZZER LOGIC
        // ==========================================
        let validGSMs = [];
        let ratesMap = {};
        let defaultRate = '28.50'; 
        
        let rateRegex = /\b(80|90|100|110|120|130|140|150|180|200)\b\s+\d{1,4}\s+[\d,]+\.\d{1,3}\s+(\d{2,4}\.\d{2})/g;
        let rMatch;
        while ((rMatch = rateRegex.exec(fullText)) !== null) {
            let gsm = rMatch[1];
            if (!validGSMs.includes(gsm)) validGSMs.push(gsm);
            ratesMap[gsm] = rMatch[2];
            defaultRate = rMatch[2];
        }
        if (validGSMs.length === 0) validGSMs = ['100','120','140','150','180','200'];

        let annexureIdx = textUpper.indexOf("LOADING SLIP");
        let searchArea = annexureIdx !== -1 ? fullText.substring(annexureIdx) : fullText;
        
        let reels = getTokens('\\b(\\d{5})\\b', searchArea);
        let weights = getTokens('\\b([3-9]\\d{2}|1\\d{3})\\b', searchArea);
        let allSpecs = getTokens('\\b([2-9]\\d|1\\d{2}|2[0-5]\\d)\\b', searchArea);
        let bfs = getTokens('\\b(16|18|20|22|24|26|28)\\b', searchArea);

        for (let i = 0; i < reels.length; i++) {
            let r = reels[i];
            let w = weights[i] ? weights[i].val : '';
            let sortedSpecs = [...allSpecs].sort((a,b) => Math.abs(a.index - r.index) - Math.abs(b.index - r.index));
            
            let myGsm = null;
            let usedIndex = -1;
            for (let s of sortedSpecs) {
                if (validGSMs.includes(s.val)) {
                    myGsm = s.val;
                    usedIndex = s.index; 
                    break;
                }
            }
            
            let mySize = null;
            for (let s of sortedSpecs) {
                if (s.index !== usedIndex) {
                    mySize = s.val;
                    break;
                }
            }
            
            let sortedBfs = [...bfs].sort((a,b) => Math.abs(a.index - r.index) - Math.abs(b.index - r.index));
            let myBf = sortedBfs.length > 0 ? sortedBfs[0].val : '16';
            
            let cToken = pullClosest(r.index, colors, false);
            let itemColor = cToken ? cToken.val.charAt(0) + cToken.val.slice(1).toLowerCase() : 'Kraft';

            rawLineItems.push({
                reelNo: r.val,
                weight: w,
                rate: ratesMap[myGsm] || defaultRate,
                gsm: myGsm || validGSMs[0] || '120',
                bf: myBf,
                size: mySize || '',
                color: itemColor
            });
        }
    } else if (isDevBhoomi) {
        // ==========================================
        // DEV BHOOMI LOGIC
        // ==========================================
        let rateMatch = fullText.match(/\bKGS\s+(\d{2,3}\.\d{2})\b/i);
        let defaultRate = rateMatch ? rateMatch[1] : '39.50';

        let slipIdx = textUpper.indexOf("PACKING SLIP");
        let searchArea = slipIdx !== -1 ? fullText.substring(slipIdx) : fullText;

        let regex = /\b(1[6-9]|2[0-8])\s+(80|90|100|110|120|140|150|180|200)\s+(\d{2,3}(?:\.\d{1,2})?)\s*(?:Inch|CM|MM|in)\s+([3-9]\d{2}|1\d{3})\b/gi;
        let match;
        while ((match = regex.exec(searchArea)) !== null) {
            rawLineItems.push({
                reelNo: '', 
                bf: match[1],
                gsm: match[2],
                size: match[3],
                weight: match[4],
                rate: defaultRate,
                color: 'Kraft'
            });
        }
    } else if (isHanumant) {
        // ==========================================
        // HANUMANT / KUVIRA LOGIC (Fixed Anchors)
        // ==========================================
        let rateMatch = fullText.match(/\bKGS\s+(\d{2,3}\.\d{2})\b/i);
        let defaultRate = rateMatch ? rateMatch[1] : '31.75';

        let listIdx = textUpper.indexOf("PACKING LIST");
        let searchArea = listIdx !== -1 ? fullText.substring(listIdx) : fullText;

        let reels = getTokens('\\b([A-Z]\\d{2}[A-Z]{3}\\d{4})\\b', searchArea);
        let weights = getTokens('\\b([3-9]\\d{2}(?:\\.\\d{2})?|1\\d{3}(?:\\.\\d{2})?)\\b', searchArea);
        let bfs = getTokens('\\b(16|18|20|22|24|26|28)\\b', searchArea);
        let gsms = getTokens('\\b(80|90|100|110|120|130|140|150|180|200)\\b', searchArea);
        
        // Strictly grabs numbers that sit directly next to a physical unit constraint using 'gi' flags
        let sizes = getTokens('\\b(\\d{2,3}(?:\\.\\d{1,2})?)\\s*(?:INCH|CM|MM|IN)\\b', searchArea, 'gi');

        for (let r of reels) {
            let claimed = [];
            
            let wToken = pullClosest(r.index, weights, true, claimed);
            if (wToken) claimed.push(wToken.index);
            
            // PRIORITY CLAIM: Size is claimed FIRST so "26.00 Inch" is locked away from the BF scanner
            let sToken = pullClosest(r.index, sizes, true, claimed);
            if (sToken) claimed.push(sToken.index);
            
            let gToken = pullClosest(r.index, gsms, true, claimed);
            if (gToken) claimed.push(gToken.index);
            
            let bToken = pullClosest(r.index, bfs, true, claimed);
            if (bToken) claimed.push(bToken.index);
            
            let cToken = pullClosest(r.index, colors, false); 
            let itemColor = cToken ? cToken.val.charAt(0).toUpperCase() + cToken.val.slice(1).toLowerCase() : 'Kraft';

            rawLineItems.push({
                reelNo: r.val,
                weight: wToken ? wToken.val.replace('.00', '') : '',
                rate: defaultRate,
                gsm: gToken ? gToken.val : '120',
                bf: bToken ? bToken.val : '18',
                size: sToken ? sToken.val.replace('.00', '') : '',
                color: itemColor
            });
        }
    } else {
        // ==========================================
        // MAHESHWARI / GENERIC LOGIC
        // ==========================================
        const lines = fullText.split('\n');
        for (const entity of result.document.entities) {
            if (entity.type === 'line_item') {
                let item = { reelNo: '', weight: '', rate: '', gsm: '', bf: '', size: '', color: 'Kraft' };
                for (const prop of entity.properties) {
                  if (prop.type === 'line_item/quantity') item.weight = prop.mentionText || '';
                  if (prop.type === 'line_item/unit_price') item.rate = prop.mentionText || '';
                }

                if (item.weight) {
                    let matchIndices = [];
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].includes(item.weight)) matchIndices.push(i);
                    }
                    
                    let bestExtracted = null;
                    let maxScore = -1;

                    for (const idx of matchIndices) {
                        let ext = { reelNo: '', gsm: '', bf: '', size: '' };
                        let miniChunk = "";
                        
                        for (let j = idx; j >= Math.max(0, idx - 15); j--) {
                            miniChunk = lines[j] + " " + miniChunk;
                            if (/\b([A-Z]{2,8}\d{5,18})\b/i.test(lines[j])) break;
                        }

                        let reelMatch = miniChunk.match(/\b([A-Z]{2,8}\d{5,18})\b/i);
                        if (!reelMatch) reelMatch = miniChunk.match(/(?:reel|r\.?no|lot|roll)[:. -]*([a-zA-Z0-9]+)/i);
                        if (!reelMatch) {
                            const pureNumbers = miniChunk.match(/\b(\d{5,15})\b/g);
                            if (pureNumbers) {
                                const validNum = pureNumbers.find(num => !num.startsWith('4805') && !num.startsWith('4802'));
                                if (validNum) reelMatch = [null, validNum];
                            }
                        }
                        if (reelMatch) ext.reelNo = reelMatch[1];

                        let gsmMatch = miniChunk.match(/(\d{2,3})\s*(gsm|g\.s\.m)/i);
                        if (!gsmMatch) gsmMatch = miniChunk.match(/\b(80|90|1[0-9]{2}|2[0-9]{2}|3[0-9]{2}|400)\b/);
                        if (gsmMatch) ext.gsm = gsmMatch[1];

                        let bfMatch = miniChunk.match(/(\d{2})\s*(bf|b\.f)/i);
                        if (!bfMatch) bfMatch = miniChunk.match(/(\d{2})\s*B\b/i); 
                        if (!bfMatch) bfMatch = miniChunk.match(/\b(1[2-9]|[2-4][0-9])\b/);
                        if (bfMatch) ext.bf = bfMatch[1];

                        let sizeMatch = miniChunk.match(/(\d+(\.\d+)?)\s*(cm|mm|inch|in)\b/i);
                        if (!sizeMatch) sizeMatch = miniChunk.match(/(\d+(\.\d+)?)\s*"/i);
                        if (sizeMatch) ext.size = sizeMatch[0];

                        let score = 0;
                        if (ext.reelNo) {
                            score += 10;
                            if (/[a-zA-Z]/.test(ext.reelNo) && /[0-9]/.test(ext.reelNo)) score += 10; 
                        }
                        if (ext.gsm) score += 1;
                        if (ext.bf) score += 1;
                        if (ext.size) score += 1;

                        if (score > maxScore) {
                            maxScore = score;
                            bestExtracted = ext;
                        }
                    }

                    if (bestExtracted) {
                        item.reelNo = bestExtracted.reelNo;
                        item.gsm = bestExtracted.gsm;
                        item.bf = bestExtracted.bf;
                        item.size = bestExtracted.size;
                    }
                }
                rawLineItems.push(item);
            }
        }
    }

    const finalReels = [];
    const blankReels = [];
    const seenReels = new Set();

    for (const item of rawLineItems) {
        let cleanReel = (item.reelNo || '').replace(/\s+/g, '').toUpperCase();
        
        if (cleanReel) {
            if (!seenReels.has(cleanReel)) {
                seenReels.add(cleanReel);
                finalReels.push(item);
            }
        } else {
            blankReels.push(item);
        }
    }

    parsedData.lineItems = finalReels.length > 0 ? finalReels : blankReels;
    return parsedData;

  } catch (error) {
    console.error("DocAI Error:", error);
    throw new HttpsError("internal", `Parsing failed: ${error.message}`);
  }
});