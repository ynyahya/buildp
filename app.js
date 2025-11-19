/* STORAGE KEYS */
const STORAGE_KEY = 'atk_requests_v1';
const SETTINGS_KEY = 'atk_settings_v1';

/* load/save */
function loadLocalRequests(){ try{ const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch(e){ return []; }}
function saveLocalRequests(arr){ localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }
function loadAppSettings(){ try{ const raw = localStorage.getItem(SETTINGS_KEY); return raw ? JSON.parse(raw) : {}; } catch(e){ return {}; }}
function saveAppSettings(obj){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(obj)); }

let appSettings = {};
let allRequests = [];
let currentRequestId = null;
let requesterSigPad, verifierSigPad, supervisorSigPad, goodsReleaseSigPad;

/* toast */
function showToast(message, type='success'){
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

/* Populate year dropdown */
function populateYearDropdown(selectId){
  const select = document.getElementById(selectId);
  if(!select) return;
  const thisYear = new Date().getFullYear();
  select.innerHTML = '';
  for(let y = thisYear - 2; y <= thisYear + 2; y++){
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if(y === thisYear) opt.selected = true;
    select.appendChild(opt);
  }
}

/* Generate doc number */
function generateDocNumber(){
  const prefix = appSettings.doc_prefix || '0001';
  const format = appSettings.doc_format || '{AUTO}/ATK/{MM}/{YYYY}';
  const now = new Date();
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const yyyy = now.getFullYear();
  let autoNum = parseInt(prefix, 10);
  const existing = allRequests.filter(r => r.documentNumber && r.documentNumber.includes(yyyy));
  if(existing.length > 0){
    const nums = existing.map(r => {
      const m = r.documentNumber.match(/^(\d+)\//);
      return m ? parseInt(m[1],10) : 0;
    });
    autoNum = Math.max(...nums, autoNum) + 1;
  }
  const autoStr = String(autoNum).padStart(4,'0');
  return format.replace('{AUTO}', autoStr).replace('{MM}', mm).replace('{YYYY}', yyyy);
}

/* Apply settings to UI */
function applySettingsToUI(){
  const logo = appSettings.logo_url || '';
  const imgEl = document.getElementById('uiLogo');
  const titleEl = document.getElementById('uiFormTitle');
  const budgetEl = document.getElementById('uiBudgetYear');
  const orgEl = document.getElementById('uiOrg');
  
  if(imgEl){
    if(logo){
      imgEl.src = logo;
      imgEl.style.display = 'block';
    } else {
      imgEl.style.display = 'none';
    }
  }
  if(titleEl) titleEl.textContent = appSettings.form_title || 'Form Permintaan ATK';
  if(budgetEl) budgetEl.textContent = 'Tahun Anggaran ' + (appSettings.budget_year || new Date().getFullYear());
  if(orgEl) orgEl.textContent = appSettings.org_name || 'BPS Kota Jakarta Selatan';
}

/* Views */
function showView(viewId){
  ['viewForm','viewAll','viewVerifier','viewSupervisor','viewDetail','viewSettings'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.classList.add('hidden');
  });
  const target = document.getElementById(viewId);
  if(target) target.classList.remove('hidden');
}

/* Init signature pads */
function initSignaturePads(){
  const reqCanvas = document.getElementById('requesterSignatureCanvas');
  if(reqCanvas && !requesterSigPad){
    requesterSigPad = new SignaturePad(reqCanvas, {backgroundColor: 'rgb(255,255,255)'});
    resizeCanvas(reqCanvas);
  }
}

function resizeCanvas(canvas){
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  canvas.width = canvas.offsetWidth * ratio;
  canvas.height = canvas.offsetHeight * ratio;
  canvas.getContext('2d').scale(ratio, ratio);
}

/* Items table */
let itemsData = [];
function renderItemsTable(){
  const tbody = document.getElementById('itemsTableBody');
  if(!tbody) return;
  tbody.innerHTML = '';
  itemsData.forEach((item, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="border p-2 text-center">${idx+1}</td>
      <td class="border p-2"><input type="text" value="${item.name}" class="w-full border-0 px-2" data-idx="${idx}" data-field="name"></td>
      <td class="border p-2"><input type="number" value="${item.quantity}" class="w-full border-0 px-2" data-idx="${idx}" data-field="quantity"></td>
      <td class="border p-2"><input type="text" value="${item.unit}" class="w-full border-0 px-2" data-idx="${idx}" data-field="unit"></td>
      <td class="border p-2 text-center"><button class="px-2 py-1 bg-red-500 text-white rounded" data-remove="${idx}">Hapus</button></td>
    `;
    tbody.appendChild(tr);
  });
  
  tbody.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', e => {
      const idx = parseInt(e.target.dataset.idx);
      const field = e.target.dataset.field;
      itemsData[idx][field] = e.target.value;
    });
  });
  
  tbody.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = parseInt(e.target.dataset.remove);
      itemsData.splice(idx,1);
      renderItemsTable();
    });
  });
}

/* Submit request */
function submitRequest(){
  const docNum = document.getElementById('documentNumber').value;
  const year = document.getElementById('yearSelect').value;
  const workUnit = document.getElementById('workUnitSelect').value;
  const location = document.getElementById('submissionLocation').value;
  const date = document.getElementById('submissionDate').value;
  const reqName = document.getElementById('requesterName').value.trim();
  const reqNIP = document.getElementById('requesterNIP').value.trim();
  
  if(!reqName || !reqNIP){
    showToast('Nama dan NIP pemohon wajib diisi!', 'error');
    return;
  }
  if(itemsData.length === 0){
    showToast('Tambahkan minimal 1 item ATK!', 'error');
    return;
  }
  if(!requesterSigPad || requesterSigPad.isEmpty()){
    showToast('Tanda tangan pemohon wajib diisi!', 'error');
    return;
  }
  
  const reqSigData = requesterSigPad.toDataURL();
  const newReq = {
    id: Date.now(),
    documentNumber: docNum,
    year,
    workUnit,
    location,
    submissionDate: date,
    requesterName: reqName,
    requesterNIP: reqNIP,
    requesterSignature: reqSigData,
    items: JSON.parse(JSON.stringify(itemsData)),
    status: 'pending',
    verifierSignature: null,
    verifierName: '',
    verifierNIP: '',
    verifierDate: '',
    supervisorSignature: null,
    supervisorName: '',
    supervisorNIP: '',
    supervisorDate: '',
    goodsReleaseSignature: null,
    goodsReleaseName: '',
    goodsReleaseNIP: '',
    goodsReleaseDate: ''
  };
  
  allRequests.push(newReq);
  saveLocalRequests(allRequests);
  showToast('Permintaan berhasil disimpan!');
  resetForm();
  showView('viewAll');
  renderAllRequests();
}

function resetForm(){
  currentRequestId = null;
  document.getElementById('documentNumber').value = generateDocNumber();
  document.getElementById('workUnitSelect').value = '';
  document.getElementById('submissionLocation').value = 'Jakarta';
  document.getElementById('submissionDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('requesterName').value = '';
  document.getElementById('requesterNIP').value = '';
  itemsData = [];
  renderItemsTable();
  if(requesterSigPad) requesterSigPad.clear();
  populateYearDropdown('yearSelect');
}

/* Render all requests */
function renderAllRequests(){
  const container = document.getElementById('allRequestsList');
  if(!container) return;
  
  const filterMonth = document.getElementById('filterMonth').value;
  const filterYear = document.getElementById('filterYear').value;
  
  let filtered = allRequests;
  if(filterMonth || filterYear){
    filtered = allRequests.filter(r => {
      const [y, m] = r.submissionDate.split('-');
      if(filterYear && y !== filterYear) return false;
      if(filterMonth && m !== filterMonth) return false;
      return true;
    });
  }
  
  container.innerHTML = '';
  filtered.forEach(req => {
    const card = document.createElement('div');
    card.className = 'border rounded p-4 bg-gray-50';
    card.innerHTML = `
      <div class="flex justify-between items-center">
        <div>
          <p class="font-bold">${req.documentNumber}</p>
          <p class="text-sm text-gray-600">${req.requesterName} - ${req.workUnit}</p>
          <p class="text-xs text-gray-500">${req.submissionDate}</p>
        </div>
        <div class="flex gap-2">
          <button class="px-3 py-1 bg-blue-600 text-white rounded" data-view="${req.id}">Lihat</button>
          <button class="px-3 py-1 bg-red-500 text-white rounded" data-delete="${req.id}">Hapus</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
  
  container.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = parseInt(e.target.dataset.view);
      viewRequestDetail(id);
    });
  });
  
  container.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = parseInt(e.target.dataset.delete);
      if(confirm('Hapus permintaan ini?')){
        allRequests = allRequests.filter(r => r.id !== id);
        saveLocalRequests(allRequests);
        renderAllRequests();
        showToast('Permintaan dihapus!');
      }
    });
  });
}

function viewRequestDetail(id){
  const req = allRequests.find(r => r.id === id);
  if(!req) return;
  
  const container = document.getElementById('viewDetail');
  let itemsHTML = '';
  req.items.forEach((it, idx) => {
    itemsHTML += `<tr><td class="border p-2 text-center">${idx+1}</td><td class="border p-2">${it.name}</td><td class="border p-2 text-center">${it.quantity}</td><td class="border p-2">${it.unit}</td></tr>`;
  });
  
  container.innerHTML = `
    <div class="no-print mb-4">
      <button id="backToAll" class="px-4 py-2 bg-gray-600 text-white rounded">← Kembali</button>
      <button id="printDetail" class="px-4 py-2 bg-indigo-600 text-white rounded ml-2">🖨️ Print</button>
    </div>
    <div class="text-center mb-6">
      <h1 class="text-2xl font-bold">${appSettings.form_title || 'Form Permintaan ATK'}</h1>
      <p class="text-sm">${appSettings.org_name || 'BPS Kota Jakarta Selatan'}</p>
    </div>
    <div class="mb-4"><strong>No Dokumen:</strong> ${req.documentNumber}</div>
    <div class="mb-4"><strong>Tahun:</strong> ${req.year}</div>
    <div class="mb-4"><strong>Bagian/Fungsi:</strong> ${req.workUnit}</div>
    <h3 class="font-bold mb-2">Rincian ATK</h3>
    <table class="w-full border-collapse mb-4">
      <thead><tr class="bg-gray-100"><th class="border p-2">No</th><th class="border p-2">Nama Item</th><th class="border p-2">Jumlah</th><th class="border p-2">Satuan</th></tr></thead>
      <tbody>${itemsHTML}</tbody>
    </table>
    <div class="mb-2"><strong>Lokasi:</strong> ${req.location}</div>
    <div class="mb-4"><strong>Tanggal:</strong> ${req.submissionDate}</div>
    <div class="mb-4">
      <strong>Pemohon:</strong> ${req.requesterName} (${req.requesterNIP})<br>
      ${req.requesterSignature ? `<img src="${req.requesterSignature}" class="sig-img mt-2">` : ''}
    </div>
    ${req.status === 'verified' || req.status === 'approved' ? `
      <div class="mb-4 digital-signature">
        <strong>Verifikator:</strong> ${req.verifierName} (${req.verifierNIP}) - ${req.verifierDate}<br>
        ${req.verifierSignature ? `<img src="${req.verifierSignature}" class="sig-img mt-2">` : ''}
      </div>
    ` : ''}
    ${req.status === 'approved' ? `
      <div class="mb-4 digital-signature">
        <strong>Penanggung Jawab:</strong> ${req.supervisorName} (${req.supervisorNIP}) - ${req.supervisorDate}<br>
        ${req.supervisorSignature ? `<img src="${req.supervisorSignature}" class="sig-img mt-2">` : ''}
      </div>
      <div id="goodsReleaseSection" class="mt-4 digital-signature">
        <strong>Penyerahan Barang:</strong> ${req.goodsReleaseName} (${req.goodsReleaseNIP}) - ${req.goodsReleaseDate}<br>
        ${req.goodsReleaseSignature ? `<img src="${req.goodsReleaseSignature}" class="sig-img mt-2">` : ''}
      </div>
    ` : ''}
  `;
  
  showView('viewDetail');
  
  document.getElementById('backToAll').addEventListener('click', () => {
    showView('viewAll');
  });
  
  document.getElementById('printDetail').addEventListener('click', () => {
    window.print();
  });
}

/* Verifier & Supervisor views */
function renderVerifierRequests(){
  const container = document.getElementById('verifierRequestsList');
  if(!container) return;
  
  const pending = allRequests.filter(r => r.status === 'pending');
  container.innerHTML = '';
  
  if(pending.length === 0){
    container.innerHTML = '<p class="text-gray-500">Tidak ada permintaan yang perlu diverifikasi.</p>';
    return;
  }
  
  pending.forEach(req => {
    const card = document.createElement('div');
    card.className = 'border rounded p-4 bg-yellow-50';
    card.innerHTML = `
      <p class="font-bold">${req.documentNumber}</p>
      <p class="text-sm">${req.requesterName} - ${req.workUnit}</p>
      <button class="mt-2 px-3 py-1 bg-green-600 text-white rounded" data-verify="${req.id}">Verifikasi</button>
    `;
    container.appendChild(card);
  });
  
  container.querySelectorAll('[data-verify]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = parseInt(e.target.dataset.verify);
      openVerifyModal(id);
    });
  });
}

function openVerifyModal(id){
  const req = allRequests.find(r => r.id === id);
  if(!req) return;
  
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded p-6 max-w-md w-full">
      <h3 class="text-lg font-bold mb-4">Verifikasi Permintaan</h3>
      <input type="text" id="verName" placeholder="Nama Verifikator" class="w-full border rounded px-3 py-2 mb-2">
      <input type="text" id="verNIP" placeholder="NIP Verifikator" class="w-full border rounded px-3 py-2 mb-2">
      <div class="signature-card mb-2">
        <canvas id="verSigCanvas" class="signature-canvas"></canvas>
      </div>
      <div class="flex gap-2">
        <button id="verClear" class="px-3 py-1 bg-gray-500 text-white rounded">Clear</button>
        <button id="verSubmit" class="px-3 py-1 bg-green-600 text-white rounded">Simpan Verifikasi</button>
        <button id="verCancel" class="px-3 py-1 bg-red-500 text-white rounded">Batal</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const canvas = document.getElementById('verSigCanvas');
  verifierSigPad = new SignaturePad(canvas, {backgroundColor: 'rgb(255,255,255)'});
  resizeCanvas(canvas);
  
  document.getElementById('verClear').addEventListener('click', () => verifierSigPad.clear());
  document.getElementById('verCancel').addEventListener('click', () => modal.remove());
  document.getElementById('verSubmit').addEventListener('click', () => {
    const name = document.getElementById('verName').value.trim();
    const nip = document.getElementById('verNIP').value.trim();
    if(!name || !nip || verifierSigPad.isEmpty()){
      showToast('Lengkapi data verifikator dan tanda tangan!', 'error');
      return;
    }
    req.status = 'verified';
    req.verifierName = name;
    req.verifierNIP = nip;
    req.verifierDate = new Date().toISOString().split('T')[0];
    req.verifierSignature = verifierSigPad.toDataURL();
    saveLocalRequests(allRequests);
    showToast('Permintaan berhasil diverifikasi!');
    modal.remove();
    renderVerifierRequests();
  });
}

function renderSupervisorRequests(){
  const container = document.getElementById('supervisorRequestsList');
  if(!container) return;
  
  const verified = allRequests.filter(r => r.status === 'verified');
  container.innerHTML = '';
  
  if(verified.length === 0){
    container.innerHTML = '<p class="text-gray-500">Tidak ada permintaan yang perlu disetujui.</p>';
    return;
  }
  
  verified.forEach(req => {
    const card = document.createElement('div');
    card.className = 'border rounded p-4 bg-blue-50';
    card.innerHTML = `
      <p class="font-bold">${req.documentNumber}</p>
      <p class="text-sm">${req.requesterName} - ${req.workUnit}</p>
      <p class="text-xs text-gray-600">Diverifikasi oleh: ${req.verifierName}</p>
      <button class="mt-2 px-3 py-1 bg-purple-600 text-white rounded" data-approve="${req.id}">Setujui</button>
    `;
    container.appendChild(card);
  });
  
  container.querySelectorAll('[data-approve]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = parseInt(e.target.dataset.approve);
      openApproveModal(id);
    });
  });
}

function openApproveModal(id){
  const req = allRequests.find(r => r.id === id);
  if(!req) return;
  
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded p-6 max-w-md w-full">
      <h3 class="text-lg font-bold mb-4">Persetujuan Penanggung Jawab</h3>
      <input type="text" id="supName" placeholder="Nama Penanggung Jawab" class="w-full border rounded px-3 py-2 mb-2">
      <input type="text" id="supNIP" placeholder="NIP Penanggung Jawab" class="w-full border rounded px-3 py-2 mb-2">
      <div class="signature-card mb-2">
        <canvas id="supSigCanvas" class="signature-canvas"></canvas>
      </div>
      <h4 class="font-bold mt-4 mb-2">Penyerahan Barang</h4>
      <input type="text" id="relName" placeholder="Nama Penyerah Barang" class="w-full border rounded px-3 py-2 mb-2">
      <input type="text" id="relNIP" placeholder="NIP Penyerah Barang" class="w-full border rounded px-3 py-2 mb-2">
      <div class="signature-card mb-2">
        <canvas id="relSigCanvas" class="signature-canvas"></canvas>
      </div>
      <div class="flex gap-2 mt-4">
        <button id="supClear" class="px-3 py-1 bg-gray-500 text-white rounded text-sm">Clear PJ</button>
        <button id="relClear" class="px-3 py-1 bg-gray-500 text-white rounded text-sm">Clear Penyerahan</button>
        <button id="supSubmit" class="px-3 py-1 bg-purple-600 text-white rounded">Simpan</button>
        <button id="supCancel" class="px-3 py-1 bg-red-500 text-white rounded">Batal</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const supCanvas = document.getElementById('supSigCanvas');
  const relCanvas = document.getElementById('relSigCanvas');
  supervisorSigPad = new SignaturePad(supCanvas, {backgroundColor: 'rgb(255,255,255)'});
  goodsReleaseSigPad = new SignaturePad(relCanvas, {backgroundColor: 'rgb(255,255,255)'});
  resizeCanvas(supCanvas);
  resizeCanvas(relCanvas);
  
  document.getElementById('supClear').addEventListener('click', () => supervisorSigPad.clear());
  document.getElementById('relClear').addEventListener('click', () => goodsReleaseSigPad.clear());
  document.getElementById('supCancel').addEventListener('click', () => modal.remove());
  document.getElementById('supSubmit').addEventListener('click', () => {
    const supName = document.getElementById('supName').value.trim();
    const supNIP = document.getElementById('supNIP').value.trim();
    const relName = document.getElementById('relName').value.trim();
    const relNIP = document.getElementById('relNIP').value.trim();
    
    if(!supName || !supNIP || supervisorSigPad.isEmpty()){
      showToast('Lengkapi data Penanggung Jawab dan tanda tangan!', 'error');
      return;
    }
    if(!relName || !relNIP || goodsReleaseSigPad.isEmpty()){
      showToast('Lengkapi data Penyerahan Barang dan tanda tangan!', 'error');
      return;
    }
    
    req.status = 'approved';
    req.supervisorName = supName;
    req.supervisorNIP = supNIP;
    req.supervisorDate = new Date().toISOString().split('T')[0];
    req.supervisorSignature = supervisorSigPad.toDataURL();
    req.goodsReleaseName = relName;
    req.goodsReleaseNIP = relNIP;
    req.goodsReleaseDate = new Date().toISOString().split('T')[0];
    req.goodsReleaseSignature = goodsReleaseSigPad.toDataURL();
    
    saveLocalRequests(allRequests);
    showToast('Permintaan berhasil disetujui!');
    modal.remove();
    renderSupervisorRequests();
  });
}

/* Settings */
function openSettings(){
  document.getElementById('settingFormTitle').value = appSettings.form_title || 'Form Permintaan ATK';
  document.getElementById('settingBudgetYear').value = appSettings.budget_year || new Date().getFullYear();
  document.getElementById('settingDocPrefix').value = appSettings.doc_prefix || '0001';
  document.getElementById('settingDocFormat').value = appSettings.doc_format || '{AUTO}/ATK/{MM}/{YYYY}';
  document.getElementById('settingWhatsAppNumber').value = appSettings.whatsapp_number || '';
  document.getElementById('settingOrgName').value = appSettings.org_name || 'BPS Kota Jakarta Selatan';
  document.getElementById('settingLogoUrl').value = appSettings.logo_url || '';
  updateDocFormatPreview();
  showView('viewSettings');
}

function updateDocFormatPreview(){
  const format = document.getElementById('settingDocFormat').value;
  const prefix = document.getElementById('settingDocPrefix').value || '0001';
  const now = new Date();
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const yyyy = now.getFullYear();
  const preview = format.replace('{AUTO}', prefix).replace('{MM}', mm).replace('{YYYY}', yyyy);
  document.getElementById('docFormatPreview').textContent = preview;
}

function saveSettings(){
  appSettings.form_title = document.getElementById('settingFormTitle').value;
  appSettings.budget_year = document.getElementById('settingBudgetYear').value;
  appSettings.doc_prefix = document.getElementById('settingDocPrefix').value;
  appSettings.doc_format = document.getElementById('settingDocFormat').value;
  appSettings.whatsapp_number = document.getElementById('settingWhatsAppNumber').value;
  appSettings.org_name = document.getElementById('settingOrgName').value;
  appSettings.logo_url = document.getElementById('settingLogoUrl').value;
  saveAppSettings(appSettings);
  applySettingsToUI();
  showToast('Pengaturan disimpan!');
  showView('viewForm');
  resetForm();
}

/* Export Excel */
async function exportFilteredToExcel(){
  const filterMonth = document.getElementById('filterMonth').value;
  const filterYear = document.getElementById('filterYear').value;
  
  let filtered = allRequests;
  if(filterMonth || filterYear){
    filtered = allRequests.filter(r => {
      const [y, m] = r.submissionDate.split('-');
      if(filterYear && y !== filterYear) return false;
      if(filterMonth && m !== filterMonth) return false;
      return true;
    });
  }
  
  if(filtered.length === 0){
    showToast('Tidak ada data untuk diekspor!', 'error');
    return;
  }
  
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Permintaan ATK');
  
  worksheet.columns = [
    {header:'No Dokumen', key:'documentNumber', width:25},
    {header:'Tahun', key:'year', width:10},
    {header:'Bagian/Fungsi', key:'workUnit', width:20},
    {header:'Nama Item', key:'itemName', width:30},
    {header:'Jumlah', key:'quantity', width:10},
    {header:'Satuan', key:'unit', width:15},
    {header:'Pemohon', key:'requesterName', width:25},
    {header:'NIP Pemohon', key:'requesterNIP', width:20},
    {header:'Tanggal', key:'submissionDate', width:15},
    {header:'Status', key:'status', width:15}
  ];
  
  filtered.forEach(req => {
    req.items.forEach(item => {
      worksheet.addRow({
        documentNumber: req.documentNumber,
        year: req.year,
        workUnit: req.workUnit,
        itemName: item.name,
        quantity: item.quantity,
        unit: item.unit,
        requesterName: req.requesterName,
        requesterNIP: req.requesterNIP,
        submissionDate: req.submissionDate,
        status: req.status
      });
    });
  });
  
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const filename = `ATK_Export_${filterYear || 'All'}_${filterMonth || 'All'}.xlsx`;
  saveAs(blob, filename);
  showToast('Data berhasil diekspor ke Excel!');
}

/* Init */
document.addEventListener('DOMContentLoaded', () => {
  appSettings = loadAppSettings();
  allRequests = loadLocalRequests();
  
  applySettingsToUI();
  populateYearDropdown('yearSelect');
  populateYearDropdown('filterYear');
  
  resetForm();
  initSignaturePads();
  
  // Menu buttons
  document.getElementById('btnNew').addEventListener('click', () => {
    resetForm();
    showView('viewForm');
  });
  
  document.getElementById('btnAll').addEventListener('click', () => {
    showView('viewAll');
    renderAllRequests();
  });
  
  document.getElementById('btnVerifier').addEventListener('click', () => {
    showView('viewVerifier');
    renderVerifierRequests();
  });
  
  document.getElementById('btnSupervisor').addEventListener('click', () => {
    showView('viewSupervisor');
    renderSupervisorRequests();
  });
  
  document.getElementById('btnSettings').addEventListener('click', () => {
    openSettings();
  });
  
  // Form actions
  document.getElementById('btnAddItem').addEventListener('click', () => {
    itemsData.push({name:'', quantity:1, unit:''});
    renderItemsTable();
  });
  
  document.getElementById('submitRequestBtn').addEventListener('click', submitRequest);
  
  document.getElementById('reqSigClear').addEventListener('click', () => {
    if(requesterSigPad) requesterSigPad.clear();
  });
  
  document.getElementById('reqSigSave').addEventListener('click', () => {
    if(requesterSigPad && !requesterSigPad.isEmpty()){
      showToast('Tanda tangan disimpan!');
    } else {
      showToast('Tanda tangan masih kosong!', 'error');
    }
  });
  
  // Settings
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  document.getElementById('cancelSettingsBtn').addEventListener('click', () => {
    showView('viewForm');
  });
  
  document.getElementById('settingDocFormat').addEventListener('input', updateDocFormatPreview);
  document.getElementById('settingDocPrefix').addEventListener('input', updateDocFormatPreview);
  
  // Filter
  document.getElementById('filterMonth').addEventListener('change', renderAllRequests);
  document.getElementById('filterYear').addEventListener('change', renderAllRequests);
  
  document.getElementById('btnExportFiltered').addEventListener('click', exportFilteredToExcel);
  
  // Window resize
  window.addEventListener('resize', () => {
    if(requesterSigPad){
      const canvas = document.getElementById('requesterSignatureCanvas');
      resizeCanvas(canvas);
    }
  });
});
