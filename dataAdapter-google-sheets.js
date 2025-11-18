// safe data adapter stub for optional Google Sheets integration
(function(window){
  // expose minimal API surface so app can call dataSdk.init/create/update/delete safely
  const dataSdk = {
    initialized: false,
    // init will be called with dataHandler and options if you want to connect
    async init(dataHandler, options = {}) {
      // only attempt to use gapi if it's present
      if (typeof gapi === 'undefined') {
        console.warn('gapi not available — dataSdk will run in local mode');
        this.initialized = true;
        // simulate OK result
        return { isOk: true };
      }

      // Put real init logic here if you later add gapi library.
      // Example:
      // await realInitWithGapi(gapi, dataHandler, options);
      this.initialized = true;
      return { isOk: true };
    },
    // fallback create (for local/demo)
    async create(record){
      // if a real SDK exists you would forward; here we return isOk false to indicate not connected
      console.warn('dataSdk.create called but adapter not connected — storing locally');
      // emulate returning object with isOk true if you want caller to think saved
      return { isOk: false, error: { message: 'Adapter not connected' } };
    },
    async update(record){ return { isOk: false, error: { message: 'Adapter not connected' } }; },
    async delete(record){ return { isOk: false, error: { message: 'Adapter not connected' } }; 
  };

  window.dataSdk = dataSdk;
})(window);
