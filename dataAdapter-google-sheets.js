// dataAdapter-google-sheets.js
// Safe local adapter that provides a minimal dataSdk API:
// - init(dataHandler) => loads localStorage dataset and calls dataHandler.onDataChanged(dataset)
// - create(record) => adds record, saves to localStorage, calls dataHandler.onDataChanged
// - update(record) => updates matching record by __backendId or documentNumber, saves, notifies
// - delete(record) => removes record, saves, notifies
//
// This adapter intentionally DOES NOT use gapi and is safe to load in any environment.

(function(window){
  const STORAGE_KEY = 'atk_requests';
  const DEFAULTS = [
    // optionally include default settings record if none exists
    // { recordType: 'settings', __backendId: 'settings-1', form_title: 'Form Permintaan ATK', budget_year: new Date().getFullYear().toString(), organization_name: 'BPS Kota Jakarta Selatan', doc_number_format: '0001', logo_url: '', whatsapp_number: '' }
  ];

  function loadAll(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw){
        const initial = DEFAULTS.slice();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
        return initial;
      }
      return JSON.parse(raw);
    }catch(e){ console.warn('adapter.loadAll error', e); return DEFAULTS.slice(); }
  }

  function saveAll(data){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; }catch(e){ console.warn('adapter.saveAll error', e); return false; }
  }

  // create unique backend id
  function newId(){ return 'local-' + Math.random().toString(36).slice(2,10); }

  // Expose dataSdk
  const dataSdk = {
    _dataHandler: null,
    async init(dataHandler, options){
      this._dataHandler = dataHandler;
      // load stored dataset and call onDataChanged
      const all = loadAll();
      // ensure every record has __backendId (for old data)
      all.forEach(r => { if(!r.__backendId) r.__backendId = newId(); });
      saveAll(all);
      if(this._dataHandler && typeof this._dataHandler.onDataChanged === 'function'){
        // return a Promise-resolved result to mimic async init
        setTimeout(()=> this._dataHandler.onDataChanged(all), 50);
      }
      return { isOk: true };
    },

    async create(record){
      try{
        const all = loadAll();
        const rec = Object.assign({}, record);
        if(!rec.__backendId) rec.__backendId = newId();
        all.push(rec);
        saveAll(all);
        if(this._dataHandler && typeof this._dataHandler.onDataChanged === 'function'){
          setTimeout(()=> this._dataHandler.onDataChanged(all), 50);
        }
        return { isOk: true, data: rec };
      }catch(e){
        console.error('adapter.create failed', e);
        return { isOk: false, error: { message: e.message || String(e) } };
      }
    },

    async update(record){
      try{
        const all = loadAll();
        const id = record.__backendId || record.documentNumber;
        let found = false;
        for(let i=0;i<all.length;i++){
          const r = all[i];
          if((r.__backendId && record.__backendId && r.__backendId === record.__backendId) || (r.documentNumber && record.documentNumber && r.documentNumber === record.documentNumber)){
            all[i] = Object.assign({}, r, record);
            if(!all[i].__backendId) all[i].__backendId = record.__backendId || newId();
            found = true;
            break;
          }
        }
        if(!found){
          // if not found, push as new
          const rec = Object.assign({}, record);
          if(!rec.__backendId) rec.__backendId = newId();
          all.push(rec);
        }
        saveAll(all);
        if(this._dataHandler && typeof this._dataHandler.onDataChanged === 'function'){
          setTimeout(()=> this._dataHandler.onDataChanged(all), 50);
        }
        return { isOk: true };
      }catch(e){
        console.error('adapter.update failed', e);
        return { isOk: false, error: { message: e.message || String(e) } };
      }
    },

    async delete(record){
      try{
        const all = loadAll();
        const before = all.length;
        const id = record.__backendId || record.documentNumber;
        const filtered = all.filter(r => !((r.__backendId && record.__backendId && r.__backendId === record.__backendId) || (r.documentNumber && record.documentNumber && r.documentNumber === record.documentNumber)));
        saveAll(filtered);
        if(this._dataHandler && typeof this._dataHandler.onDataChanged === 'function'){
          setTimeout(()=> this._dataHandler.onDataChanged(filtered), 50);
        }
        return { isOk: true };
      }catch(e){
        console.error('adapter.delete failed', e);
        return { isOk: false, error: { message: e.message || String(e) } };
      }
    }
  };

  // attach
  window.dataSdk = dataSdk;
})(window);
