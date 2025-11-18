// dataAdapter-google-sheets.js
// A minimal Google Sheets adapter that exposes window.dataSdk
// Methods: init(dataHandler, opts), create(record), update(record), delete(record)
// Uses gapi.client.sheets (needs https://www.googleapis.com/auth/spreadsheets scope)
// Reads clientId and spreadsheetId from opts or from localStorage keys:
//   localStorage.getItem('atk_google_client_id')
//   localStorage.getItem('atk_google_sheet_id')

// NOTE: This adapter is intentionally simple and uses sheet 'data' with a fixed header.
// Deleting a row is implemented via batchUpdate deleteDimension (requires sheetId).
// Make sure the sheet 'data' exists with header row exactly as required.

(function(window){
  const COLUMN_HEADERS = ["__backendId","recordType","documentNumber","year","workUnit","items","submissionDate","submissionLocation","requesterName","requesterNIP","status","verifierName","verifierNIP","verificationDate","supervisorName","supervisorNIP","supervisorApprovalDate","rejectionReason","rejectedBy","createdAt","updatedAt"];
  const SHEET_NAME = "data";
  const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

  function parseRecordFromRow(row){
    // row: array of cell values, header length = COLUMN_HEADERS.length
    const rec = {};
    for(let i=0;i<COLUMN_HEADERS.length;i++){
      rec[COLUMN_HEADERS[i]] = row[i] !== undefined ? String(row[i]) : "";
    }
    // keep types: items is JSON string in sheet
    return rec;
  }

  function rowFromRecord(record){
    const row = [];
    for(let i=0;i<COLUMN_HEADERS.length;i++){
      const key = COLUMN_HEADERS[i];
      let val = record[key];
      if(val === undefined || val === null) val = "";
      // ensure items is string (JSON)
      if(key === "items" && typeof val !== 'string') val = JSON.stringify(val || []);
      row.push(String(val));
    }
    return row;
  }

  // helper: get spreadsheetId / clientId from opts or localStorage
  function getConfig(opts){
    opts = opts || {};
    const clientId = opts.clientId || localStorage.getItem('atk_google_client_id') || "";
    const spreadsheetId = opts.spreadsheetId || localStorage.getItem('atk_google_sheet_id') || "";
    return { clientId, spreadsheetId };
  }

  // helper: ensure gapi loaded
  function ensureGapi(){
    if(!window.gapi) return Promise.reject(new Error('gapi not loaded'));
    return Promise.resolve(window.gapi);
  }

  // helper: attempt init gapi client
  async function initGapiClient(clientId){
    await ensureGapi();
    // load client:auth2 and client
    return new Promise((resolve, reject) => {
      try {
        window.gapi.load('client:auth2', async () => {
          try {
            await window.gapi.client.init({
              discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"],
              clientId: clientId,
              scope: SCOPES
            });
            resolve();
          } catch(e){
            reject(e);
          }
        });
      } catch(e){ reject(e); }
    });
  }

  // helper: fetch sheet metadata to find sheetId for sheet name
  async function getSheetId(spreadsheetId){
    const resp = await window.gapi.client.sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
    const sheets = resp.result.sheets || [];
    for(const s of sheets){
      const p = s.properties;
      if(p && p.title === SHEET_NAME) return p.sheetId;
    }
    throw new Error(`Sheet named '${SHEET_NAME}' not found in spreadsheet ${spreadsheetId}`);
  }

  // helper: read all rows from sheet (range: data!A:U)
  async function readAllRows(spreadsheetId){
    const range = `${SHEET_NAME}!A:U`;
    const resp = await window.gapi.client.sheets.spreadsheets.values.get({ spreadsheetId, range });
    const values = resp.result.values || [];
    return values;
  }

  // find row index (1-based) for a record (by __backendId or documentNumber)
  function findRowIndexByRecords(records, identifier){
    for(let i=0;i<records.length;i++){
      const r = records[i];
      const idVal = r["__backendId"] || "";
      const doc = r["documentNumber"] || "";
      if(idVal === identifier || doc === identifier) return i + 2; // +2 because sheet rows: header row 1 => data starts row 2
    }
    return -1;
  }

  // convert values[] to records array
  function valuesToRecords(values){
    if(!values || values.length === 0) return [];
    const header = values[0];
    // We expect header to match COLUMN_HEADERS; but be robust: map indices
    const mapIndex = {};
    for(let i=0;i<header.length;i++){
      const h = header[i];
      if(COLUMN_HEADERS.includes(h)) mapIndex[h] = i;
    }
    const records = [];
    for(let r=1;r<values.length;r++){
      const row = values[r];
      const rec = {};
      for(const key of COLUMN_HEADERS){
        if(mapIndex[key] !== undefined) rec[key] = row[mapIndex[key]] !== undefined ? row[mapIndex[key]] : "";
        else rec[key] = "";
      }
      records.push(rec);
    }
    return records;
  }

  // generate simple backend id
  function genId(){
    return 'bk-'+Math.random().toString(36).slice(2,10);
  }

  // Exported object
  const dataSdk = {
    // init(dataHandler, opts)
    // opts: {clientId, spreadsheetId}
    init: async function(dataHandler, opts){
      try{
        const cfg = getConfig(opts);
        if(!cfg.clientId) return { isOk:false, error: { message: 'Missing Google Client ID. Set in Settings and Connect to Google.' } };
        if(!cfg.spreadsheetId) return { isOk:false, error: { message: 'Missing Spreadsheet ID. Set in Settings.' } };

        await initGapiClient(cfg.clientId);

        // ensure signed in (will show popup if needed)
        if(!gapi.auth2.getAuthInstance().isSignedIn.get()){
          await gapi.auth2.getAuthInstance().signIn();
        }

        // load sheet metadata & rows
        // fetch header & rows
        const values = await readAllRows(cfg.spreadsheetId);
        // ensure header exists and matches our expected header. If not, create header row.
        const header = values[0] || [];
        let needWriteHeader = false;
        for(let i=0;i<COLUMN_HEADERS.length;i++){
          if(header[i] !== COLUMN_HEADERS[i]) { needWriteHeader = true; break; }
        }
        if(needWriteHeader){
          // write header row
          await window.gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: cfg.spreadsheetId,
            range: `${SHEET_NAME}!A1:U1`,
            valueInputOption: 'RAW',
            resource: { values: [COLUMN_HEADERS] }
          });
        }

        // after making sure header, read again
        const values2 = await readAllRows(cfg.spreadsheetId);
        const records = valuesToRecords(values2);

        // call data handler
        if(dataHandler && typeof dataHandler.onDataChanged === 'function'){
          dataHandler.onDataChanged(records);
        }

        return { isOk:true };
      }catch(e){
        console.error('dataSdk.init error', e);
        return { isOk:false, error: { message: (e && e.message) ? e.message : String(e) } };
      }
    },

    // create(record)
    create: async function(record){
      try{
        // ensure authenticated
        const cfg = getConfig();
        if(!cfg.clientId || !cfg.spreadsheetId) return { isOk:false, error:{message:'Missing clientId or spreadsheetId in adapter config (localStorage or init opts).'} };
        // if not signed in, trigger signIn
        if(!gapi.auth2.getAuthInstance().isSignedIn.get()){
          await gapi.auth2.getAuthInstance().signIn();
        }

        // generate id
        if(!record.__backendId) record.__backendId = genId();

        // append row
        const row = rowFromRecord(record);

        const appendResp = await gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId: cfg.spreadsheetId,
          range: `${SHEET_NAME}!A:U`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          resource: { values: [row] }
        });

        // after append, re-read all rows and notify (if needed)
        const values = await readAllRows(cfg.spreadsheetId);
        const records = valuesToRecords(values);
        if(window.__onDataChangedCallback) window.__onDataChangedCallback(records);
        // if dataHandler exists it will be invoked by caller's init flow; but to be safe, call global if set
        return { isOk:true, data: record };
      }catch(e){
        console.error('dataSdk.create error', e);
        return { isOk:false, error:{ message: (e && e.message) ? e.message : String(e) } };
      }
    },

    // update(record) -- record must contain __backendId or documentNumber to locate row
    update: async function(record){
      try{
        const cfg = getConfig();
        if(!cfg.clientId || !cfg.spreadsheetId) return { isOk:false, error:{message:'Missing clientId or spreadsheetId in adapter config.'} };
        if(!gapi.auth2.getAuthInstance().isSignedIn.get()){
          await gapi.auth2.getAuthInstance().signIn();
        }
        // read all rows to find index
        const values = await readAllRows(cfg.spreadsheetId);
        const records = valuesToRecords(values);
        const identifier = record.__backendId || record.documentNumber;
        const rowIndex = findRowIndexByRecords(records, identifier);
        if(rowIndex === -1) return { isOk:false, error:{ message:'Record not found to update' } };

        // prepare row array
        const newRow = rowFromRecord(record);
        const range = `${SHEET_NAME}!A${rowIndex}:U${rowIndex}`;
        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: cfg.spreadsheetId,
          range: range,
          valueInputOption: 'RAW',
          resource: { values: [newRow] }
        });

        // reread and callback
        const values2 = await readAllRows(cfg.spreadsheetId);
        const records2 = valuesToRecords(values2);
        if(window.__onDataChangedCallback) window.__onDataChangedCallback(records2);
        return { isOk:true, data: record };
      }catch(e){
        console.error('dataSdk.update error', e);
        return { isOk:false, error:{ message: (e && e.message) ? e.message : String(e) } };
      }
    },

    // delete(record) — will delete row physically using batchUpdate deleteDimension
    delete: async function(record){
      try{
        const cfg = getConfig();
        if(!cfg.clientId || !cfg.spreadsheetId) return { isOk:false, error:{message:'Missing clientId or spreadsheetId in adapter config.'} };
        if(!gapi.auth2.getAuthInstance().isSignedIn.get()){
          await gapi.auth2.getAuthInstance().signIn();
        }

        // read all rows to find index and sheetId
        const values = await readAllRows(cfg.spreadsheetId);
        const records = valuesToRecords(values);
        const identifier = record.__backendId || record.documentNumber;
        const rowIndex = findRowIndexByRecords(records, identifier);
        if(rowIndex === -1) return { isOk:false, error:{ message:'Record not found to delete' } };
        const sheetId = await getSheetId(cfg.spreadsheetId);

        // delete row via batchUpdate (rows index are 0-based; header row is 0, so data rowIndex-1)
        const request = {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: sheetId,
                  dimension: "ROWS",
                  startIndex: rowIndex-1, // 0-based start (header at 0)
                  endIndex: rowIndex // exclusive
                }
              }
            }
          ]
        };
        await gapi.client.sheets.spreadsheets.batchUpdate({ spreadsheetId: cfg.spreadsheetId, resource: request });

        // reread and callback
        const values2 = await readAllRows(cfg.spreadsheetId);
        const records2 = valuesToRecords(values2);
        if(window.__onDataChangedCallback) window.__onDataChangedCallback(records2);
        return { isOk:true };
      }catch(e){
        console.error('dataSdk.delete error', e);
        return { isOk:false, error:{ message: (e && e.message) ? e.message : String(e) } };
      }
    },

    // helper to subscribe to data changes (optional)
    onDataChangedSubscribe: function(cb){
      window.__onDataChangedCallback = cb;
    }
  };

  // expose
  window.dataSdk = dataSdk;

})(window);
