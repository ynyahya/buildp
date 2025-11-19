/* STORAGE KEYS */
const STORAGE_KEY = 'atk_requests_v1';
const SETTINGS_KEY = 'atk_settings_v1';

/* load/save */
function loadLocalRequests(){ try{ const raw = localStorage.getItem(STORAGE_KEY); return raw?JSON.parse(raw):[] }catch(e){console.error(e); return []} }
function saveLocalRequests(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(currentRequests)); }catch(e){console.error(e);} }
function loadSettings(){ try{ const s = localStorage.getItem(SETTINGS_KEY); return s?JSON.parse(s):null }catch(e){return null} }
function saveSettingsToStorage(){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings)); }

/* UI utils */
function showToast(msg, isError=false){ const el=document.createElement('div'); el.className=`toast ${isError?'error':''}`; el.textContent=msg; document.body.appendChild(el); setTimeout(()=>el.remove(),3500); }
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function formatDate(d){ if(!d) return '-'; const date=new Date(d); const months=['January','February','March','April','May','June','July','August','September','October','November','December']; return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`; }

/* state */
let currentRequests = loadLocalRequests();
let appSettings = loadSettings() || {
  form_title: "Form Permintaan ATK",
  budget_year: (new Date()).getFullYear().toString(),
  organization_name: "BPS Kota Jakarta Selatan",
  logo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Lambang_Badan_Pusat_Statistik_%28BPS%29_Indonesia.svg/1160px-Lambang_Badan_Pusat_Statistik_%28BPS%29_Indonesia.svg.png",
  doc_prefix: "0001",
  doc_format: "{AUTO}/ATK/{MM}/{YYYY}",
  whatsapp_number: ""
};

/* signature pads */
let requesterSigPad=null, verifierSigPad=null, supervisorSigPad=null;

/* DOM refs */
const viewForm = document.getElementById('viewForm');
const viewAll = document.getElementById('viewAll');
const viewVerifier = document.getElementById('viewVerifier');
const viewSupervisor = document.getElementById('viewSupervisor');
const viewSettings = document.getElementById('viewSettings');
const viewDetail = document.getElementById('viewDetail');

const yearSelect = document.getElementById('yearSelect');
const filterYear = document.getElementById('filterYear');

/* init years */
function initYearDropdowns(){
  const currentYear = new Date().getFullYear();
  for(let i=currentYear-5;i<=currentYear+5;i++){ const opt=document.createElement('option'); opt.value=i; opt.textContent=i; yearSelect.appendChild(opt); const o2=opt.cloneNode(true); filterYear.appendChild(o2); }
  yearSelect.value = appSettings.budget_year;
  filterYear.value = appSettings.budget_year;
}

/* build preview example for doc format */
function buildDocFormatPreview(){
  const fmt = appSettings.doc_format || "{AUTO}/ATK/{MM}/{YYYY}";
  const sampleDate = new Date();
  const mm = ("0"+(sampleDate.getMonth()+1)).slice(-2);
  const yyyy = sampleDate.getFullYear();
  const sampleAuto = (appSettings.doc_prefix||'1').replace(/^0+/,'') || '1';
  const padded = (""+sampleAuto).padStart(4,'0');
  const preview = fmt.replace(/\{AUTO\}/g, padded).replace(/\{MM\}/g, mm).replace(/\{YYYY\}/g, yyyy);
  document.getElementById('docFormatPreview').textContent = preview;
}

/* generate document number using format and prefix */
function generateDocumentNumber(){
  const year = yearSelect.value || (new Date()).getFullYear().toString();
  const date = document.getElementById('submissionDate').value || (new Date()).toISOString().split('T')[0];
  const month = ("0"+(new Date(date).getMonth()+1)).slice(-2);

  const existingNumbers = currentRequests
    .filter(r=> r.recordType==='request' && r.documentNumber)
    .map(r=>{
      const first = (r.documentNumber.split('/')[0]||'').replace(/\D/g,'');
      return parseInt(first,10) || 0;
    })
    .filter(n=>n>0);

  const prefixNum = parseInt(String(appSettings.doc_prefix || '1').replace(/^0+/,'')) || 1;
  const nextNumber = existingNumbers.length ? Math.max(...existingNumbers)+1 : prefixNum;
  const paddedAuto = (""+nextNumber).padStart(4,'0');

  const fmt = appSettings.doc_format || "{AUTO}/ATK/{MM}/{YYYY}";
  const result = fmt.replace(/\{AUTO\}/g, paddedAuto).replace(/\{MM\}/g, month).replace(/\{YYYY\}/g, year);
  return result;
}

/* UPDATE document number input */
function updateDocumentNumber(){
  try{
    const docInput = document.getElementById('documentNumber');
    if(!docInput) return;
    docInput.value = generateDocumentNumber();
  }catch(e){
    console.error('updateDocumentNumber error', e);
  }
}

/* items table */
function addItemRow(name='', qty=1, unit=''){ const tbody=document.getElementById('itemsTableBody'); const idx=tbody.children.length+1; const tr=document.createElement('tr'); tr.innerHTML = `<td class="p-2 border text-center">${idx}</td><td class="p-2 border"><input class="item-name w-full px-2 py-1 border rounded" value="${escapeHtml(name)}" placeholder="Masukkan nama item"></td><td class="p-2 border text-center"><input type="number" min="1" class="item-quantity w-20 px-2 py-1 border rounded" value="${escapeHtml(qty)}"></td><td class="p-2 border"><input class="item-unit w-full px-2 py-1 border rounded" value="${escapeHtml(unit)}" placeholder="Satuan (contoh: pcs)"></td><td class="p-2 border text-center"><button class="delete-row px-3 py-1 bg-red-500 text-white rounded">Hapus</button></td>`; tbody.appendChild(tr); tr.querySelector('.delete-row').addEventListener('click', ()=>{ tr.remove(); updateRowNumbers(); }); }
function updateRowNumbers(){ const rows=Array.from(document.getElementById('itemsTableBody').children); rows.forEach((r,i)=> r.children[0].textContent = i+1); }
function getItemsFromTable(){ const rows=Array.from(document.getElementById('itemsTableBody').children); const items=[]; rows.forEach(row=>{ const name=row.querySelector('.item-name').value.trim(); const qty=parseInt(row.querySelector('.item-quantity').value)||0; const unit=row.querySelector('.item-unit').value.trim(); if(name && qty>0) items.push({name, quantity: qty, unit}); }); return items; }

/* signature helpers */
function fitToContainer(canvas){ const ratio=Math.max(window.devicePixelRatio||1,1); const w=canvas.offsetWidth; const h=canvas.offsetHeight; canvas.width=Math.floor(w*ratio); canvas.height=Math.floor(h*ratio); const ctx=canvas.getContext('2d'); ctx.scale(ratio, ratio); }
function initRequestSignature(){ const canvas=document.getElementById('requesterSignatureCanvas'); if(!canvas) return; fitToContainer(canvas); requesterSigPad = new SignaturePad(canvas, { penColor: "rgb(0,80,160)" }); window.addEventListener('resize', ()=>{ try{ fitToContainer(canvas); }catch(e){} }); }

/* rendering helpers */
function getStatusColorClass(status){ switch(status){ case 'Pending Verification': return 'bg-yellow-200 text-yellow-800'; case 'Verified - Pending Approval': return 'bg-blue-200 text-blue-800'; case 'Fully Approved': return 'bg-green-200 text-green-800'; case 'Rejected by Verifier': case 'Rejected by Supervisor': return 'bg-red-200 text-red-800'; default: return 'bg-gray-200 text-gray-800'; } }

function renderAllRequests(){
  const container=document.getElementById('allRequestsList');
  const monthFilter=document.getElementById('filterMonth').value;
  const yearFilterVal=document.getElementById('filterYear').value;
  const list=currentRequests.filter(r=>r.recordType==='request').filter(r=>{
    if(!monthFilter && !yearFilterVal) return true;
    const parts=(r.documentNumber||'').split('/');
    const m=parts[2]||''; const y=parts[3]||'';
    if(monthFilter && yearFilterVal) return m===monthFilter && y===yearFilterVal;
    if(monthFilter) return m===monthFilter;
    if(yearFilterVal) return y===yearFilterVal;
    return true;
  }).sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));
  if(list.length===0){ container.innerHTML='<p class="text-gray-500 py-8 text-center">Belum ada permintaan</p>'; return; }
  container.innerHTML = list.map(r=>{
    const statusBadge = `<span class="px-3 py-1 rounded-full text-sm ${getStatusColorClass(r.status)}">${escapeHtml(r.status)}</span>`;
    return `<div class="border rounded p-4 shadow-sm flex justify-between items-start">
      <div onclick="viewRequestDetail('${r.__id}')" class="cursor-pointer">
        <h3 class="font-bold">${escapeHtml(r.documentNumber)}</h3>
        <p class="text-sm text-gray-600">${escapeHtml(r.workUnit)} - ${escapeHtml(r.year)}</p>
        <p class="text-sm text-gray-600 mt-2"><strong>Requester:</strong> ${escapeHtml(r.requesterName)} (${escapeHtml(r.requesterNIP)})</p>
        <p class="text-sm text-gray-600"><strong>Date:</strong> ${formatDate(r.submissionDate)}</p>
      </div>
      <div class="flex items-center gap-2">
        ${statusBadge}
        <button onclick="openWhatsAppFor('${r.__id}')" class="px-3 py-1 bg-green-500 text-white rounded">📱 Buka WA</button>
        <button onclick="deleteRequest('${r.__id}', event)" class="px-3 py-1 bg-red-500 text-white rounded">🗑️ Hapus</button>
      </div>
    </div>`; }).join('');
}

function renderVerifierDashboard(){
  const container=document.getElementById('verifierRequestsList');
  const pending = currentRequests.filter(r=>r.recordType==='request' && r.status==='Pending Verification').sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));
  if(pending.length===0){ container.innerHTML='<p class="text-gray-500 py-6 text-center">Tidak ada permintaan menunggu verifikasi</p>'; return; }
  container.innerHTML = pending.map(r=>`<div class="p-4 border rounded cursor-pointer hover:shadow-sm" onclick="viewRequestDetail('${r.__id}')"><div class="flex justify-between"><div><h3 class="font-bold">${escapeHtml(r.documentNumber)}</h3><p class="text-sm text-gray-600">${escapeHtml(r.workUnit)} - ${escapeHtml(r.year)}</p></div><span class="px-3 py-1 rounded-full bg-yellow-200 text-yellow-800">Step 1: Pending Verification</span></div><p class="text-sm text-gray-700 mt-2"><strong>Requester:</strong> ${escapeHtml(r.requesterName)} (${escapeHtml(r.requesterNIP)})</p></div>`).join('');
}

function renderSupervisorDashboard(){
  const container=document.getElementById('supervisorRequestsList');
  const pending = currentRequests.filter(r=>r.recordType==='request' && r.status==='Verified - Pending Approval').sort((a,b)=> new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt));
  if(pending.length===0){ container.innerHTML='<p class="text-gray-500 py-6 text-center">Tidak ada permintaan menunggu persetujuan akhir</p>'; return; }
  container.innerHTML = pending.map(r=>`<div class="p-4 border rounded cursor-pointer hover:shadow-sm" onclick="viewRequestDetail('${r.__id}')"><div class="flex justify-between"><div><h3 class="font-bold">${escapeHtml(r.documentNumber)}</h3><p class="text-sm text-gray-600">${escapeHtml(r.workUnit)} - ${escapeHtml(r.year)}</p></div><span class="px-3 py-1 rounded-full bg-blue-200 text-blue-800">Step 2: Pending Final Approval</span></div><p class="text-sm text-gray-700 mt-2"><strong>Requester:</strong> ${escapeHtml(r.requesterName)} (${escapeHtml(r.requesterNIP)})</p></div>`).join('');
}

/* CRUD */
function createId(){ return 'r-'+Math.random().toString(36).slice(2,9); }

function submitRequest(){
  updateDocumentNumber();
  const year = yearSelect.value;
  const workUnit = document.getElementById('workUnitSelect').value;
  const items = getItemsFromTable();
  const requesterName = document.getElementById('requesterName').value.trim();
  const requesterNIP = document.getElementById('requesterNIP').value.trim();
  if(!year || !workUnit){ showToast('Mohon pilih tahun dan bagian/fungsi', true); return; }
  if(items.length===0){ showToast('Mohon tambahkan minimal 1 item', true); return; }
  if(!requesterName || !requesterNIP){ showToast('Mohon isi nama dan NIP pemohon', true); return; }

  const docNumber = document.getElementById('documentNumber').value || generateDocumentNumber();
  const submissionDate = document.getElementById('submissionDate').value || (new Date()).toISOString().split('T')[0];
  const submissionLocation = document.getElementById('submissionLocation').value || '';
  const reqCanvas = document.getElementById('requesterSignatureCanvas');
  const reqSignature = reqCanvas && reqCanvas.dataset && reqCanvas.dataset.dataurl ? reqCanvas.dataset.dataurl : null;

  const record = {
    __id: createId(),
    recordType: 'request',
    documentNumber: docNumber,
    year, workUnit, items, submissionDate, submissionLocation,
    requesterName, requesterNIP, requesterSignature: reqSignature,
    status: 'Pending Verification', verifierName:'', verifierNIP:'', verificationDate:'', verifierSignature:'',
    supervisorName:'', supervisorNIP:'', supervisorApprovalDate:'', supervisorSignature:'', rejectionReason:'', rejectedBy:'',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };

  currentRequests.unshift(record);
  saveLocalRequests();
  renderAllRequests(); renderVerifierDashboard(); renderSupervisorDashboard();
  showToast('Permintaan berhasil dikirim');
  resetForm();
  switchView('all');
}

function resetForm(){
  document.getElementById('workUnitSelect').value='';
  document.getElementById('itemsTableBody').innerHTML='';
  addItemRow();
  document.getElementById('requesterName').value='';
  document.getElementById('requesterNIP').value='';
  document.getElementById('submissionDate').value=(new Date()).toISOString().split('T')[0];
  document.getElementById('submissionLocation').value='Jakarta';
  const canvas=document.getElementById('requesterSignatureCanvas'); if(canvas){ const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height); canvas.dataset.dataurl=''; if(requesterSigPad) requesterSigPad.clear(); }
}

function deleteRequest(id, event){ if(event) event.stopPropagation(); const idx=currentRequests.findIndex(r=>r.__id===id); if(idx===-1){ showToast('Permintaan tidak ditemukan', true); return; } if(!confirm('Yakin ingin menghapus permintaan ini?')) return; currentRequests.splice(idx,1); saveLocalRequests(); renderAllRequests(); renderVerifierDashboard(); renderSupervisorDashboard(); showToast('Permintaan berhasil dihapus'); }

/* WhatsApp: use appSettings.whatsapp_number if set, else copy to clipboard */
function openWhatsAppFor(id){
  const r = currentRequests.find(x => x.__id === id);
  if(!r){ showToast('Request not found', true); return; }
  const itemsList = (r.items||[]).map((it,idx)=> `${idx+1}. ${it.name} (${it.quantity})`).join('%0A');
  let message = `*Pengingat Permintaan ATK*%0A%0A`;
  message += `*Dokumen:* ${encodeURIComponent(r.documentNumber)}%0A`;
  message += `*Status:* ${encodeURIComponent(r.status)}%0A`;
  message += `*Bagian/Fungsi:* ${encodeURIComponent(r.workUnit)}%0A`;
  message += `*Tahun:* ${encodeURIComponent(r.year)}%0A%0A`;
  message += `*Pemohon:*%0ANama: ${encodeURIComponent(r.requesterName)}%0A NIP: ${encodeURIComponent(r.requesterNIP)}%0A%0A`;
  message += `*Item yang Diminta:*%0A${itemsList}%0A%0A`;
  message += `*Tanggal Pengajuan:* ${encodeURIComponent(formatDate(r.submissionDate))}%0A`;
  message += `*Lokasi:* ${encodeURIComponent(r.submissionLocation)}%0A%0A`;
  if(appSettings.whatsapp_number && appSettings.whatsapp_number.trim() !== ''){
    const wa = `https://wa.me/${appSettings.whatsapp_number}?text=${message}`;
    window.open(wa, '_blank', 'noopener,noreferrer');
    showToast('Membuka WhatsApp...');
  } else {
    const plain = `Pengingat Permintaan ATK\n\nDokumen: ${r.documentNumber}\nStatus: ${r.status}\nBagian: ${r.workUnit}\nTahun: ${r.year}\n\nPemohon:\nNama: ${r.requesterName}\nNIP: ${r.requesterNIP}\n\nItem:\n${(r.items||[]).map((it,i)=> `${i+1}. ${it.name} (${it.quantity})`).join('\n')}\n\nTanggal: ${formatDate(r.submissionDate)}\nLokasi: ${r.submissionLocation}`;
    navigator.clipboard?.writeText(plain).then(()=> showToast('Pesan disalin ke clipboard. Paste di WhatsApp untuk mengirim.'));
  }
}

/* Detail view (with verifikator & supervisor signature flows) */
function viewRequestDetail(id){
  const r = currentRequests.find(x => x.__id === id);
  if(!r) return;
  viewDetail.innerHTML = `
    <div class="no-print mb-4">
      <button id="backFromDetail" class="px-3 py-2 bg-gray-500 text-white rounded">← Back</button>
      <button id="btnPrint" class="ml-2 px-3 py-2 bg-blue-500 text-white rounded">🖨️ Print / Export PDF</button>
    </div>
    <div class="mb-6 border-b pb-4">
      <div class="flex items-center gap-4">
        <div style="width:72px;height:72px;">${appSettings.logo_url?`<img src="${appSettings.logo_url}" style="width:72px;height:72px;object-fit:contain;">`:''}</div>
        <div>
          <h2 class="text-2xl font-bold">${escapeHtml(appSettings.form_title)}</h2>
          <div class="text-sm text-gray-600">${escapeHtml(appSettings.organization_name)}</div>
          <div class="text-sm text-gray-500">Tahun Anggaran ${escapeHtml(appSettings.budget_year)}</div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-sm">
      <div><p class="font-semibold">Document Number</p><p>${escapeHtml(r.documentNumber)}</p></div>
      <div><p class="font-semibold">Year</p><p>${escapeHtml(r.year)}</p></div>
      <div><p class="font-semibold">Work Unit</p><p>${escapeHtml(r.workUnit)}</p></div>
    </div>

    <div class="mb-6">
      <h3 class="font-bold mb-2">ATK Items</h3>
      <table class="w-full border-collapse">
        <thead><tr class="bg-gray-100"><th class="p-2 border">No</th><th class="p-2 border">Item Name</th><th class="p-2 border">Quantity</th><th class="p-2 border">Notes / Unit</th></tr></thead>
        <tbody>${(r.items||[]).map((it,i)=>`<tr><td class="p-2 border text-center">${i+1}</td><td class="p-2 border">${escapeHtml(it.name)}</td><td class="p-2 border text-center">${escapeHtml(it.quantity)}</td><td class="p-2 border">${escapeHtml(it.unit||'-')}</td></tr>`).join('')}</tbody>
      </table>
    </div>

    <div class="mb-6">
      <p><strong>Submission:</strong> ${escapeHtml(r.submissionLocation)}, ${formatDate(r.submissionDate)}</p>
      <p class="mt-2"><strong>Status:</strong> <span class="px-3 py-1 rounded ${getStatusColorClass(r.status)}">${escapeHtml(r.status)}</span></p>
    </div>

    <div class="border-t pt-6 mb-6">
      <h3 class="font-bold mb-2">Requester Information</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div><p class="text-sm font-semibold">Name</p><p>${escapeHtml(r.requesterName)}</p></div>
        <div><p class="text-sm font-semibold">NIP</p><p>${escapeHtml(r.requesterNIP)}</p></div>
      </div>
      <div class="mb-4">
        <div class="p-4 bg-green-50 border rounded">
          <p class="font-semibold text-green-700">✓ DIGITALLY SIGNED</p>
          ${r.requesterSignature?`<img src="${r.requesterSignature}" class="sig-img" style="max-width:320px; display:block; margin-top:8px;">`:`<p class="text-sm text-gray-600">No signature saved</p>`}
          <p class="text-xs text-gray-600 mt-2">Signed by: ${escapeHtml(r.requesterName)} | NIP: ${escapeHtml(r.requesterNIP)} | Date: ${formatDate(r.submissionDate)}</p>
        </div>
      </div>
    </div>

    <div id="verifierSection"></div>
    <div id="supervisorSection"></div>
  `;
  document.getElementById('backFromDetail').addEventListener('click', ()=> switchView('all'));
  document.getElementById('btnPrint').addEventListener('click', ()=> window.print());

  const verifierSection = document.getElementById('verifierSection');
  if(r.status === 'Pending Verification'){
    verifierSection.innerHTML = `
      <div class="border-t pt-6">
        <h3 class="font-bold mb-3">Verifikator Section (Step 1 of 2)</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div><label class="text-sm">Verifikator Name *</label><input id="verifierNameInput" class="mt-2 w-full px-3 py-2 border rounded"></div>
          <div><label class="text-sm">Verifikator NIP *</label><input id="verifierNIPInput" class="mt-2 w-full px-3 py-2 border rounded"></div>
        </div>
        <div class="mb-4">
          <p class="text-sm font-semibold">Tanda Tangan Verifikator</p>
          <div class="signature-card mt-2">
            <canvas id="verifierSignatureCanvas" class="signature-canvas"></canvas>
            <div class="flex gap-2 mt-2">
              <button id="verSigClear" class="px-3 py-1 bg-red-500 text-white rounded">Clear</button>
              <button id="verSigSave" class="px-3 py-1 bg-green-600 text-white rounded">Save Signature</button>
            </div>
          </div>
        </div>
        <div class="flex gap-3">
          <button id="btnVerifyConfirm" class="px-4 py-2 bg-green-600 text-white rounded">✓ Verify & Send to Penanggung Jawab</button>
          <button id="btnRejectVer" class="px-4 py-2 bg-red-600 text-white rounded">✗ Reject Request</button>
        </div>
      </div>`;
    // init verifier canvas after DOM insertion
    setTimeout(()=> {
      const vCanvas = document.getElementById('verifierSignatureCanvas');
      if(vCanvas){
        vCanvas.style.width='100%';
        fitToContainer(vCanvas);
        verifierSigPad = new SignaturePad(vCanvas, { penColor: "rgb(10,100,50)" });
        setTimeout(()=> { try{ fitToContainer(vCanvas); }catch(e){} }, 50);
        document.getElementById('verSigClear').addEventListener('click', ()=> { verifierSigPad.clear(); vCanvas.dataset.dataurl=''; });
        document.getElementById('verSigSave').addEventListener('click', ()=> { if(!verifierSigPad || verifierSigPad.isEmpty()){ showToast('Silakan buat tanda tangan verifikator terlebih dahulu', true); return; } vCanvas.dataset.dataurl = verifierSigPad.toDataURL(); showToast('Tanda tangan verifikator disimpan'); });
        document.getElementById('btnVerifyConfirm').addEventListener('click', ()=> {
          const vName=document.getElementById('verifierNameInput').value.trim(), vNip=document.getElementById('verifierNIPInput').value.trim(), vSig=vCanvas.dataset.dataurl||null;
          if(!vName||!vNip){ showToast('Masukkan nama & NIP verifikator', true); return; }
          r.verifierName=vName; r.verifierNIP=vNip; r.verificationDate=(new Date()).toISOString().split('T')[0]; r.verifierSignature=vSig; r.status='Verified - Pending Approval'; r.updatedAt=new Date().toISOString();
          saveLocalRequests(); renderAllRequests(); renderVerifierDashboard(); renderSupervisorDashboard(); showToast('Request berhasil diverifikasi dan dikirim ke Penanggung Jawab'); switchView('verifier');
        });
        document.getElementById('btnRejectVer').addEventListener('click', ()=> {
          const reason = prompt('Masukkan alasan penolakan oleh Verifikator:'); if(!reason) return;
          const vName = document.getElementById('verifierNameInput').value.trim() || 'Verifikator';
          r.status='Rejected by Verifier'; r.rejectionReason=reason; r.rejectedBy='Verifikator'; r.verifierName=vName; r.verifierNIP=document.getElementById('verifierNIPInput').value.trim(); r.updatedAt=new Date().toISOString();
          saveLocalRequests(); renderAllRequests(); renderVerifierDashboard(); renderSupervisorDashboard(); showToast('Request ditolak oleh verifikator'); switchView('verifier');
        });
      }
    }, 50);
  } else verifierSection.innerHTML='';

  const supSection=document.getElementById('supervisorSection');
  if(r.status === 'Verified - Pending Approval'){
    supSection.innerHTML = `
      <div class="border-t pt-6">
        <h3 class="font-bold mb-3">Penanggung Jawab Final Approval (Step 2 of 2)</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div><label class="text-sm">Penanggung Jawab Name *</label><input id="supervisorNameInput" class="mt-2 w-full px-3 py-2 border rounded"></div>
          <div><label class="text-sm">Penanggung Jawab NIP *</label><input id="supervisorNIPInput" class="mt-2 w-full px-3 py-2 border rounded"></div>
        </div>
        <div class="mb-4">
          <p class="text-sm font-semibold">Tanda Tangan Penanggung Jawab</p>
          <div class="signature-card mt-2">
            <canvas id="supervisorSignatureCanvas" class="signature-canvas"></canvas>
            <div class="flex gap-2 mt-2">
              <button id="supSigClear" class="px-3 py-1 bg-red-500 text-white rounded">Clear</button>
              <button id="supSigSave" class="px-3 py-1 bg-green-600 text-white rounded">Save Signature</button>
            </div>
          </div>
        </div>
        <div class="flex gap-3">
          <button id="btnApproveFinal" class="px-4 py-2 bg-green-600 text-white rounded">✓ Give Final Approval</button>
          <button id="btnRejectSup" class="px-4 py-2 bg-red-600 text-white rounded">✗ Reject Request</button>
        </div>
      </div>`;
    setTimeout(()=> {
      const sCanvas = document.getElementById('supervisorSignatureCanvas');
      if(sCanvas){
        sCanvas.style.width='100%';
        fitToContainer(sCanvas);
        supervisorSigPad = new SignaturePad(sCanvas, { penColor: "rgb(0,60,0)" });
        setTimeout(()=> { try{ fitToContainer(sCanvas); }catch(e){} }, 50);
        document.getElementById('supSigClear').addEventListener('click', ()=> { supervisorSigPad.clear(); sCanvas.dataset.dataurl=''; });
        document.getElementById('supSigSave').addEventListener('click', ()=> { if(!supervisorSigPad || supervisorSigPad.isEmpty()){ showToast('Silakan buat tanda tangan penanggung jawab terlebih dahulu', true); return; } sCanvas.dataset.dataurl = supervisorSigPad.toDataURL(); showToast('Tanda tangan penanggung jawab disimpan'); });

        document.getElementById('btnApproveFinal').addEventListener('click', ()=> {
          const sName=document.getElementById('supervisorNameInput').value.trim(), sNip=document.getElementById('supervisorNIPInput').value.trim(), sSig=sCanvas.dataset.dataurl||null;
          if(!sName||!sNip){ showToast('Masukkan nama & NIP penanggung jawab', true); return; }
          r.supervisorName=sName; r.supervisorNIP=sNip; r.supervisorSignature=sSig; r.supervisorApprovalDate=(new Date()).toISOString().split('T')[0]; r.status='Fully Approved'; r.updatedAt=new Date().toISOString();
          saveLocalRequests(); renderAllRequests(); renderVerifierDashboard(); renderSupervisorDashboard(); showToast('Request telah disetujui penuh'); switchView('supervisor');
        });

        document.getElementById('btnRejectSup').addEventListener('click', ()=> {
          const reason = prompt('Masukkan alasan penolakan oleh Penanggung Jawab:'); if(!reason) return;
          const sName=document.getElementById('supervisorNameInput').value.trim()||'Penanggung Jawab';
          r.status='Rejected by Supervisor'; r.rejectionReason=reason; r.rejectedBy='Penanggung Jawab'; r.supervisorName=sName; r.supervisorNIP=document.getElementById('supervisorNIPInput').value.trim(); r.updatedAt=new Date().toISOString();
          saveLocalRequests(); renderAllRequests(); renderVerifierDashboard(); renderSupervisorDashboard(); showToast('Request ditolak oleh penanggung jawab'); switchView('supervisor');
        });
      }
    }, 50);
  } else supSection.innerHTML='';

  // --- GOODS RELEASE SECTION (ditampilkan untuk Fully Approved; menampilkan gambar tanda tangan di atas label)
  try{
    // hapus bila ada
    const old = document.getElementById('goodsReleaseSection');
    if(old) old.remove();

    if(r.status === 'Fully Approved'){
      const goodsHtml = `
        <div id="goodsReleaseSection" class="border-t pt-6 print-section">
          <h3 class="text-xl font-bold text-gray-800 mb-6 text-center">GOODS RELEASE SECTION</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <!-- Verifikator -->
            <div class="text-center">
              <p class="text-sm font-semibold text-gray-700 mb-4">Verifikator</p>
              ${r.verifierSignature ? `<img src="${r.verifierSignature}" class="sig-img" alt="verifier-signature">` : `<p class="text-gray-400 italic mb-3">No signature</p>`}
              ${r.verifierName ? `
                <div class="digital-signature mx-auto" style="max-width:320px;">
                  <p class="text-green-700 font-semibold mb-1">✓ DIGITALLY SIGNED</p>
                  <p class="text-gray-800 text-sm"><strong>Signed by:</strong> ${escapeHtml(r.verifierName)}</p>
                  <p class="text-gray-700 text-sm"><strong>NIP:</strong> ${escapeHtml(r.verifierNIP || '')}</p>
                  <p class="text-gray-600 text-xs"><strong>Date:</strong> ${formatDate(r.verificationDate || '')}</p>
                </div>
              ` : `<p class="text-gray-500 text-sm">Not verified</p>`}
            </div>

            <!-- Penanggung Jawab -->
            <div class="text-center">
              <p class="text-sm font-semibold text-gray-700 mb-4">Penanggung Jawab</p>
              ${r.supervisorSignature ? `<img src="${r.supervisorSignature}" class="sig-img" alt="supervisor-signature">` : `<p class="text-gray-400 italic mb-3">No signature</p>`}
              ${r.supervisorName ? `
                <div class="digital-signature mx-auto" style="max-width:320px;">
                  <p class="text-green-700 font-semibold mb-1">✓ DIGITALLY SIGNED</p>
                  <p class="text-gray-800 text-sm"><strong>Signed by:</strong> ${escapeHtml(r.supervisorName)}</p>
                  <p class="text-gray-700 text-sm"><strong>NIP:</strong> ${escapeHtml(r.supervisorNIP || '')}</p>
                  <p class="text-gray-600 text-xs"><strong>Date:</strong> ${formatDate(r.supervisorApprovalDate || '')}</p>
                </div>
              ` : `<p class="text-gray-500 text-sm">Not approved</p>`}
            </div>

            <!-- Requester -->
            <div class="text-center">
              <p class="text-sm font-semibold text-gray-700 mb-4">Requester</p>
              ${r.requesterSignature ? `<img src="${r.requesterSignature}" class="sig-img" alt="requester-signature">` : `<p class="text-gray-400 italic mb-3">No signature</p>`}
              <div class="digital-signature mx-auto" style="max-width:320px;">
                <p class="text-green-700 font-semibold mb-1">✓ DIGITALLY SIGNED</p>
                <p class="text-gray-800 text-sm"><strong>Signed by:</strong> ${escapeHtml(r.requesterName)}</p>
                <p class="text-gray-700 text-sm"><strong>NIP:</strong> ${escapeHtml(r.requesterNIP || '')}</p>
                <p class="text-gray-600 text-xs"><strong>Date:</strong> ${formatDate(r.submissionDate || '')}</p>
              </div>
            </div>
          </div>

          ${ (r.status && (r.status.startsWith('Rejected'))) ? `
            <div class="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p class="text-sm font-semibold text-red-800 mb-2">Rejected by: ${escapeHtml(r.rejectedBy || '-')}</p>
              <p class="text-sm text-red-700 mb-1">Reason:</p>
              <p class="text-red-700">${escapeHtml(r.rejectionReason || '-')}</p>
            </div>
          ` : '' }
        </div>
      `;
      // sisipkan ke akhir viewDetail
      viewDetail.insertAdjacentHTML('beforeend', goodsHtml);
    }
  }catch(e){
    console.error('goods release render error', e);
  }

  switchView('detail');
}

/* export CSV (fallback) */
function exportRequestsToCSV(filteredList, filename){
  const rows=[['DocumentNumber','Year','WorkUnit','Status','Requester','RequesterNIP','SubmissionDate','SubmissionLocation','Items','Verifier','VerifierNIP','VerificationDate','Supervisor','SupervisorNIP','SupervisorApprovalDate','CreatedAt','UpdatedAt']];
  filteredList.forEach(r=>{
    const itemsText=(r.items||[]).map(it=>`${it.name} (${it.quantity} ${it.unit||''})`).join(' | ');
    rows.push([r.documentNumber, r.year, r.workUnit, r.status, r.requesterName, r.requesterNIP, r.submissionDate, r.submissionLocation, itemsText, r.verifierName||'', r.verifierNIP||'', r.verificationDate||'', r.supervisorName||'', r.supervisorNIP||'', r.supervisorApprovalDate||'', r.createdAt||'', r.updatedAt||'']);
  });
  const csv = rows.map(r=> r.map(cell=>`"${String(cell||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename||'requests.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

/* Export ke .xlsx termasuk embed signature images (ExcelJS) */
async function exportRequestsToExcelWithImages(filteredList, filename){
  filename = filename || 'requests.xlsx';
  try{
    if(typeof ExcelJS === 'undefined'){
      showToast('Library ExcelJS belum dimuat, mencoba fallback CSV', true);
      exportRequestsToCSV(filteredList, filename.replace(/\.xlsx$/i,'.csv'));
      return;
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Form ATK';
    wb.created = new Date();

    const ws = wb.addWorksheet('Requests', {
      views: [{state: 'frozen', xSplit: 0, ySplit: 1}],
    });

    // Define columns
    ws.columns = [
      { header: 'DocumentNumber', key: 'documentNumber', width: 18 },
      { header: 'Year', key: 'year', width: 8 },
      { header: 'WorkUnit', key: 'workUnit', width: 18 },
      { header: 'Status', key: 'status', width: 18 },
      { header: 'Requester', key: 'requesterName', width: 20 },
      { header: 'RequesterNIP', key: 'requesterNIP', width: 22 },
      { header: 'SubmissionDate', key: 'submissionDate', width: 15 },
      { header: 'SubmissionLocation', key: 'submissionLocation', width: 15 },
      { header: 'Items', key: 'items', width: 40 },
      { header: 'Verifier', key: 'verifierName', width: 18 },
      { header: 'VerifierNIP', key: 'verifierNIP', width: 22 },
      { header: 'Supervisor', key: 'supervisorName', width: 18 },
      { header: 'SupervisorNIP', key: 'supervisorNIP', width: 22 },
      { header: 'CreatedAt', key: 'createdAt', width: 22 },
      { header: 'UpdatedAt', key: 'updatedAt', width: 22 },
      // Keep some empty columns for signature images
      { header: 'Sig_Verifier', key: 'sig_verifier', width: 14 },
      { header: 'Sig_Supervisor', key: 'sig_supervisor', width: 14 },
      { header: 'Sig_Requester', key: 'sig_requester', width: 14 }
    ];

    // style header
    ws.getRow(1).font = { bold: true };

    // helper to convert dataURL to base64 without prefix
    function dataUrlToBase64(dataUrl){
      if(!dataUrl) return null;
      const idx = dataUrl.indexOf('base64,');
      return idx === -1 ? null : dataUrl.slice(idx + 7);
    }

    // append rows first (text fields), keep track of row index and image base64s
    const imagesToAdd = []; // {base64, sheetRow, colKey, ext}
    filteredList.forEach((r, i) => {
      const itemsText = (r.items||[]).map(it=>`${it.name} (${it.quantity} ${it.unit||''})`).join(' | ');
      const rowIndex = i + 2; // header is row 1
      ws.addRow({
        documentNumber: r.documentNumber || '',
        year: r.year || '',
        workUnit: r.workUnit || '',
        status: r.status || '',
        requesterName: r.requesterName || '',
        requesterNIP: r.requesterNIP || '',
        submissionDate: r.submissionDate || '',
        submissionLocation: r.submissionLocation || '',
        items: itemsText,
        verifierName: r.verifierName || '',
        verifierNIP: r.verifierNIP || '',
        supervisorName: r.supervisorName || '',
        supervisorNIP: r.supervisorNIP || '',
        createdAt: r.createdAt || '',
        updatedAt: r.updatedAt || ''
      });

      // prepare images (expect PNG dataURLs). Map them to specific column headers
      if(r.verifierSignature){
        const b = dataUrlToBase64(r.verifierSignature);
        if(b) imagesToAdd.push({base64: b, row: rowIndex, col: 'Sig_Verifier', ext:'png'});
      }
      if(r.supervisorSignature){
        const b = dataUrlToBase64(r.supervisorSignature);
        if(b) imagesToAdd.push({base64: b, row: rowIndex, col: 'Sig_Supervisor', ext:'png'});
      }
      if(r.requesterSignature){
        const b = dataUrlToBase64(r.requesterSignature);
        if(b) imagesToAdd.push({base64: b, row: rowIndex, col: 'Sig_Requester', ext:'png'});
      }

      // set a larger row height to fit signature images
      ws.getRow(rowIndex).height = 60; // in points (~px)
    });

    // Add images into workbook and position them
    for(const img of imagesToAdd){
      try{
        const imageId = wb.addImage({
          base64: img.base64,
          extension: img.ext || 'png'
        });

        // find the column number (ExcelJS columns are 1-indexed)
        const colNumber = ws.columns.findIndex(c => c && c.header === img.col) + 1;
        if(colNumber <= 0) continue;

        // place image inside the cell area (tl = top-left, br = bottom-right)
        ws.addImage(imageId, {
          tl: { col: colNumber - 1 + 0.15, row: img.row - 1 + 0.1 }, // zero-based cell coords
          br: { col: colNumber - 1 + 0.85, row: img.row - 1 + 0.9 }
        });
      }catch(e){
        console.warn('failed to add image to excel row', img.row, e);
      }
    }

    // auto-wrap for items column
    ws.getColumn('items').alignment = { wrapText: true, vertical: 'top' };

    // write and save
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, filename);
    showToast('Export Excel dengan tanda tangan selesai');
  }catch(err){
    console.error('exportRequestsToExcelWithImages error', err);
    showToast('Gagal export Excel dengan gambar, fallback CSV dibuat', true);
    exportRequestsToCSV(filteredList, filename.replace(/\.xlsx$/i,'.csv'));
  }
}

/* switch view & settings apply */
function switchView(name){
  [viewForm, viewAll, viewVerifier, viewSupervisor, viewSettings, viewDetail].forEach(v=>v.classList.add('hidden'));
  if(name==='form') viewForm.classList.remove('hidden');
  else if(name==='all'){ viewAll.classList.remove('hidden'); renderAllRequests(); }
  else if(name==='verifier'){ viewVerifier.classList.remove('hidden'); renderVerifierDashboard(); }
  else if(name==='supervisor'){ viewSupervisor.classList.remove('hidden'); renderSupervisorDashboard(); }
  else if(name==='settings'){ viewSettings.classList.remove('hidden'); loadSettingsForm(); }
  else if(name==='detail'){ viewDetail.classList.remove('hidden'); }
}

function loadSettingsForm(){
  document.getElementById('settingFormTitle').value = appSettings.form_title || '';
  document.getElementById('settingBudgetYear').value = appSettings.budget_year || '';
  document.getElementById('settingDocPrefix').value = appSettings.doc_prefix || '';
  document.getElementById('settingDocFormat').value = appSettings.doc_format || '{AUTO}/ATK/{MM}/{YYYY}';
  document.getElementById('settingWhatsAppNumber').value = appSettings.whatsapp_number || '';
  document.getElementById('settingOrgName').value = appSettings.organization_name || '';
  document.getElementById('settingLogoUrl').value = appSettings.logo_url || '';
  buildDocFormatPreview();
}
function applySettingsToUI(){
  document.getElementById('uiFormTitle').textContent = appSettings.form_title;
  document.getElementById('uiBudgetYear').textContent = 'Tahun Anggaran ' + appSettings.budget_year;
  document.getElementById('uiOrg').textContent = appSettings.organization_name;
  yearSelect.value = appSettings.budget_year;
  filterYear.value = appSettings.budget_year;
  buildDocFormatPreview();

  // --- logo handling with fallback on error ---
  const logoEl = document.getElementById('uiLogo');
  if(logoEl){
    if(appSettings.logo_url && appSettings.logo_url.trim() !== ''){
      logoEl.style.display = 'block';
      logoEl.src = appSettings.logo_url;
      // jika gambar gagal dimuat, sembunyikan
      logoEl.onerror = function(){ console.warn('Logo failed to load:', appSettings.logo_url); this.style.display = 'none'; this.src = ''; };
      // jika berhasil load, pastikan tampil
      logoEl.onload = function(){ this.style.display = 'block'; };
    } else {
      logoEl.onerror = null;
      logoEl.onload = null;
      logoEl.src = '';
      logoEl.style.display = 'none';
    }
  }
}

/* init */
function init(){
  initYearDropdowns();
  document.getElementById('submissionDate').value = (new Date()).toISOString().split('T')[0];
  addItemRow(); initRequestSignature();

  document.getElementById('btnNew').addEventListener('click', ()=> switchView('form'));
  document.getElementById('btnAll').addEventListener('click', ()=> switchView('all'));
  document.getElementById('btnVerifier').addEventListener('click', ()=> switchView('verifier'));
  document.getElementById('btnSupervisor').addEventListener('click', ()=> switchView('supervisor'));
  document.getElementById('btnSettings').addEventListener('click', ()=> switchView('settings'));

  document.getElementById('btnAddItem').addEventListener('click', ()=> addItemRow());
  document.getElementById('reqSigClear').addEventListener('click', ()=> { if(requesterSigPad) requesterSigPad.clear(); const c=document.getElementById('requesterSignatureCanvas'); if(c) c.dataset.dataurl=''; });
  document.getElementById('reqSigSave').addEventListener('click', ()=> { const c=document.getElementById('requesterSignatureCanvas'); if(!requesterSigPad || requesterSigPad.isEmpty()){ showToast('Silakan buat tanda tangan pemohon terlebih dahulu', true); return; } c.dataset.dataurl = requesterSigPad.toDataURL(); showToast('Tanda tangan pemohon disimpan'); });
  document.getElementById('submitRequestBtn').addEventListener('click', submitRequest);

  document.getElementById('saveSettingsBtn').addEventListener('click', ()=>{
    const f=document.getElementById('settingFormTitle').value.trim();
    const y=document.getElementById('settingBudgetYear').value.trim();
    const prefix=document.getElementById('settingDocPrefix').value.trim();
    const format=document.getElementById('settingDocFormat').value.trim();
    const wa=document.getElementById('settingWhatsAppNumber').value.trim();
    const o=document.getElementById('settingOrgName').value.trim();
    const logo=document.getElementById('settingLogoUrl').value.trim();
    if(!f||!y||!o){ showToast('Mohon isi semua pengaturan utama', true); return; }
    appSettings.form_title=f; appSettings.budget_year=y; appSettings.organization_name=o; appSettings.logo_url=logo;
    appSettings.doc_prefix = prefix || appSettings.doc_prefix || '0001';
    appSettings.doc_format = format || appSettings.doc_format || '{AUTO}/ATK/{MM}/{YYYY}';
    appSettings.whatsapp_number = wa || '';
    saveSettingsToStorage(); applySettingsToUI(); updateDocumentNumber(); showToast('Settings disimpan'); switchView('form');
  });
  document.getElementById('cancelSettingsBtn').addEventListener('click', ()=> switchView('form'));

  document.getElementById('filterMonth').addEventListener('change', ()=> renderAllRequests());
  document.getElementById('filterYear').addEventListener('change', ()=> renderAllRequests());

  document.getElementById('btnExportFiltered').addEventListener('click', ()=>{
    const month=document.getElementById('filterMonth').value, year=document.getElementById('filterYear').value;
    const filtered=currentRequests.filter(r=>{
      if(r.recordType!=='request') return false;
      if(!month && !year) return true;
      const parts=(r.documentNumber||'').split('/'); const m=parts[2]||''; const y=parts[3]||'';
      if(month && year) return m===month && y===year;
      if(month) return m===month; if(year) return y===year; return true;
    });
    exportRequestsToExcelWithImages(filtered, `requests_${month||'all'}_${year||'all'}.xlsx`);
  });

  // guard for optional btnExportAll (in case not present)
  const btnExportAll = document.getElementById('btnExportAll');
  if(btnExportAll) btnExportAll.addEventListener('click', ()=> exportRequestsToExcelWithImages(currentRequests.filter(r=>r.recordType==='request'), `requests_all.xlsx`));

  // live preview of format in settings
  document.getElementById('settingDocFormat').addEventListener('input', (e)=> {
    const v = e.target.value.trim(); appSettings.doc_format = v; buildDocFormatPreview(); updateDocumentNumber();
  });
  document.getElementById('settingDocPrefix').addEventListener('input', (e)=> { appSettings.doc_prefix = e.target.value.trim(); buildDocFormatPreview(); updateDocumentNumber(); });

  // live preview of logo url while typing in settings
  document.getElementById('settingLogoUrl').addEventListener('input', (e)=> {
    appSettings.logo_url = e.target.value.trim(); applySettingsToUI();
  });

  // update number when submission date or year changes
  document.getElementById('submissionDate').addEventListener('change', updateDocumentNumber);
  document.getElementById('yearSelect').addEventListener('change', updateDocumentNumber);

  applySettingsToUI(); updateDocumentNumber(); renderAllRequests(); renderVerifierDashboard(); renderSupervisorDashboard();
}

init(); switchView('form');

/* expose for html onclick */
window.viewRequestDetail = viewRequestDetail;
window.deleteRequest = deleteRequest;
window.openWhatsAppFor = openWhatsAppFor;