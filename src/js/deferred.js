// Code a hosted page fetches only once it is needed. `npm run site` moves each group's modules out of the page into
// js/<group>-<hash>.js and names the file here (`BL.deferredScripts`, written ahead of every module); the portable
// single-file page and the source tree carry the modules already, so `load` finds them present and answers at once
// with null, with no request. Otherwise it adds one same-origin script (the page's policy allows 'self'), bounded by
// TIMEOUT_MS; a failure or timeout rejects and is forgotten, so the next `load` tries again.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const TIMEOUT_MS = 20000;
  // How each group shows it has arrived: the module that runs last in it.
  const PRESENT = { timechain: () => !!BL.timechainInterior };
  const loading = new Map();
  const load = (group) => {
    if (PRESENT[group]()) return null;
    if (loading.has(group)) return loading.get(group);
    const src = BL.deferredScripts && BL.deferredScripts[group];
    if (!src) return Promise.reject(new Error(`No ${group} code on this page`));
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const finish = (error) => {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (!error && !PRESENT[group]()) error = new Error(`The ${group} code did not start`);
        if (error) {
          script.remove();
          loading.delete(group);
          reject(error);
        } else resolve(null);
      };
      const timer = setTimeout(() => finish(new Error(`The ${group} code took too long`)), TIMEOUT_MS);
      script.onload = () => finish(null);
      script.onerror = () => finish(new Error(`The ${group} code could not be fetched`));
      script.src = src;
      document.head.appendChild(script);
    });
    loading.set(group, promise);
    return promise;
  };
  BL.deferred = { load, present: (group) => PRESENT[group](), get pending() { return loading.size; } };
})();
