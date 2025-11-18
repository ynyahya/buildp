// dataAdapter-google-sheets.js
// Standalone JS file. Place in same folder as index.html and include with:
// <script src="dataAdapter-google-sheets.js"></script>
// Make sure gapi loaded first: <script src="https://apis.google.com/js/api.js"></script>

(function(){
  // CONFIG (filled with your provided values)
  const CLIENT_ID = '334851692174-rjb9atfg8gpocfagkq45g49afe0n319d.apps.googleusercontent.com';
  const API_KEY = ''; // optional
  const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
  const DISCOVERY_DOCS = ["https://sheets.googleapis.com/$discovery/rest?version=v4"];
  const SPREADSHEET_ID = '1SSx9A_KsZBNOnJgtDwEUS-TOHbvQHvu_E-KswtUGNos';
  const SHEET_NAME = 'data';

  let currentHandler = null;

  async function initGapiClient() {
    return new Promise((resolve, reject) => {
      if (!window.gapi) return reject(new Error('gapi not loaded'));
      gapi.load('client:auth2', async () => {
        try {
          await gapi.client.init({
            apiKey: API_KEY || undefined,
            clientId: CLIENT_ID,
            discoveryDocs: DISCOVERY_DOCS,
            scope: SCOPES
          });
          resolve();
        } catch (err) { reject(err); }
      });
    });
  }

  async function getHeaders() {
    const range = `${SHEET_NAME}!1:1`;
    const resp = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range
    });
    return (resp.result.values && resp.result.values[0]) || [];
  }

  async function getAllRows() {
    const headers = await getHeaders();
    const range = `${SHEET_NAME}!2:10000`;
    const resp = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range
    });
    const rows = resp.result.values || [];
    return rows.map(r => {
      const obj = {};
      headers.forEach((h,i) => { obj[h] = r[i] !== undefined ? r[i] : ''; });
      return obj;
    });
  }

  async function getSheetId() {
    const resp = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheet = resp.result.sheets.find(s => s.properties.title === SHEET_NAME);
    if (!sheet) throw new Error(`Sheet "${SHEET_NAME}" not found`);
    return sheet.properties.sheetId;
  }

  async function findRowNumberById(id) {
    const headers = await getHeaders();
    const idCol = headers.indexOf('__backendId');
    if (idCol === -1) return -1;
    const range = `${SHEET_NAME}!2:10000`;
    const resp = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range
    });
    const rows = resp.result.values || [];
    for (let i=0;i<rows.length;i++){
      const v = rows[i][idCol];
      if (String(v) === String(id)) return i + 2;
    }
    return -1;
  }

  function generateId() {
    return 'id-' + Math.random().toString(36).slice(2,10) + '-' + Date.now().toString(36);
  }

  function computeNextDocumentNumber(existingRows, submissionDate, docNumberPrefix = '0001') {
    const date = submissionDate ? new Date(submissionDate) : new Date();
    const month = String(date.getMonth() + 1).padStart(2,'0');
    const year = String(date.getFullYear());
    let maxNum = 0;
    existingRows.forEach(r => {
      const doc = r.documentNumber || '';
      const parts = String(doc).split('/');
      if (parts.length === 4) {
        const [numStr,, mm, yyyy] = parts;
        if (mm === month && yyyy === year) {
          const n = parseInt(numStr) || 0;
          if (n > maxNum) maxNum = n;
        }
      }
    });
    let nextNum = maxNum > 0 ? maxNum + 1 : parseInt(docNumberPrefix) || 1;
    const padded = String(nextNum).padStart(4, '0');
    return `${padded}/ATK/${month}/${year}`;
  }

  async function refreshAndNotify() {
    if (!currentHandler) return;
    try {
      const rows = await getAllRows();
      currentHandler.onDataChanged(rows);
    } catch (err) {
      console.error('refreshAndNotify error', err);
    }
  }

  window.dataSdk = {
    async init(dataHandler) {
      try {
        currentHandler = dataHandler;
        await initGapiClient();
        // silent sign-in attempt
        try {
          const auth = gapi.auth2.getAuthInstance();
          if (auth) {
            await auth.signIn({ prompt: 'none' }).catch(() => {});
          }
        } catch(e){ /* ignore */ }
        await refreshAndNotify();
        try {
          const auth = gapi.auth2.getAuthInstance();
          auth.isSignedIn.listen(async (signedIn) => {
            await refreshAndNotify();
          });
        } catch(e){/* ignore */ }
        return { isOk: true };
      } catch (err) {
        console.error('dataSdk.init failed', err);
        return { isOk: false, error: err };
      }
    },

    async create(obj) {
      try {
        const auth = gapi.auth2.getAuthInstance();
        if (!auth.isSignedIn.get()) {
          await auth.signIn();
        }
        const headers = await getHeaders();
        const existingRows = await getAllRows();
        const submissionDate = obj.submissionDate || new Date().toISOString().split('T')[0];
        const docNumber = computeNextDocumentNumber(existingRows, submissionDate, obj.doc_number_format || '0001');
        if (!obj.__backendId) obj.__backendId = generateId();
        const now = new Date().toISOString();
        obj.documentNumber = docNumber;
        obj.createdAt = obj.createdAt || now;
        obj.updatedAt = now;
        const row = headers.map(h => obj[h] !== undefined ? obj[h] : '');
        await gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!A:Z`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          resource: { values: [row] }
        });
        await refreshAndNotify();
        return { isOk: true, data: obj };
      } catch (err) {
        console.error('dataSdk.create error', err);
        return { isOk: false, error: err };
      }
    },

    async update(obj) {
      try {
        if (!obj.__backendId) return { isOk: false, error: 'Missing __backendId' };
        const auth = gapi.auth2.getAuthInstance();
        if (!auth.isSignedIn.get()) await auth.signIn();
        const headers = await getHeaders();
        const rowNum = await findRowNumberById(obj.__backendId);
        if (rowNum === -1) return { isOk: false, error: 'Not found' };
        obj.updatedAt = new Date().toISOString();
        const row = headers.map(h => obj[h] !== undefined ? obj[h] : '');
        const lastCol = String.fromCharCode(65 + headers.length - 1);
        const range = `${SHEET_NAME}!A${rowNum}:${lastCol}${rowNum}`;
        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range,
          valueInputOption: 'RAW',
          resource: { values: [row] }
        });
        await refreshAndNotify();
        return { isOk: true, data: obj };
      } catch (err) {
        console.error('dataSdk.update error', err);
        return { isOk: false, error: err };
      }
    },

    async delete(obj) {
      try {
        if (!obj.__backendId) return { isOk: false, error: 'Missing __backendId' };
        const auth = gapi.auth2.getAuthInstance();
        if (!auth.isSignedIn.get()) await auth.signIn();
        const rowNum = await findRowNumberById(obj.__backendId);
        if (rowNum === -1) return { isOk: false, error: 'Not found' };
        const sheetId = await getSheetId();
        await gapi.client.sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: {
            requests: [{
              deleteDimension: {
                range: { sheetId: sheetId, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum }
              }
            }]
          }
        });
        await refreshAndNotify();
        return { isOk: true };
      } catch (err) {
        console.error('dataSdk.delete error', err);
        return { isOk: false, error: err };
      }
    }
  };
})();
