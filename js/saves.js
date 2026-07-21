/* GRIDIRON DYNASTY 2.0 - named IndexedDB dynasty slots with recovery snapshots. */
(function () {
  'use strict';
  var DB_NAME = 'gridiron-dynasty';
  var STORE = 'slots';
  var ACTIVE_KEY = 'gd-active-slot';
  var LEGACY_KEY = 'gridiron-save-v1';
  var dbPromise = null;

  function checksum(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }
  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }
  function withStore(mode, work) {
    return open().then(function (db) { return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, mode), store = tx.objectStore(STORE), result;
      try { result = work(store); } catch (e) { reject(e); return; }
      tx.oncomplete = function () { resolve(result); }; tx.onerror = function () { reject(tx.error); };
    }); });
  }
  function get(id) { return open().then(function (db) { return new Promise(function (resolve, reject) {
    var req = db.transaction(STORE).objectStore(STORE).get(id); req.onsuccess = function () { resolve(req.result || null); }; req.onerror = function () { reject(req.error); };
  }); }); }
  function activeId() { try { return localStorage.getItem(ACTIVE_KEY) || 'slot-1'; } catch (e) { return 'slot-1'; } }
  function setActive(id) { try { localStorage.setItem(ACTIVE_KEY, id); } catch (e) {} }
  function pack(state) { var data = JSON.stringify(state); return { data: data, checksum: checksum(data) }; }

  var Saves = {
    MAX_SLOTS: 5,
    init: function () {
      return open().then(function () {
        var legacy = null; try { legacy = localStorage.getItem(LEGACY_KEY); } catch (e) {}
        if (!legacy) return null;
        return get('slot-1').then(function (slot) {
          if (slot) return slot;
          var state; try { state = JSON.parse(legacy); } catch (e) { return null; }
          return Saves.saveSlot('slot-1', state, 'Legacy Dynasty').then(function () { setActive('slot-1'); return state; });
        });
      }).catch(function () { return null; });
    },
    list: function () { return open().then(function (db) { return new Promise(function (resolve, reject) {
      var req = db.transaction(STORE).objectStore(STORE).getAll();
      req.onsuccess = function () { resolve(req.result.sort(function (a, b) { return b.updatedAt - a.updatedAt; })); }; req.onerror = function () { reject(req.error); };
    }); }); },
    saveSlot: function (id, state, name) {
      if (!state) return Promise.reject(new Error('No dynasty state to save.'));
      return get(id).then(function (old) {
        var payload = pack(state), now = Date.now();
        var snapshots = old && old.snapshots || [];
        if (old && old.data && old.checksum !== payload.checksum) snapshots.unshift({ data: old.data, checksum: old.checksum, savedAt: old.updatedAt });
        snapshots = snapshots.slice(0, 5);
        var slot = { id: id, name: name || old && old.name || 'Dynasty', data: payload.data, checksum: payload.checksum,
          updatedAt: now, createdAt: old && old.createdAt || now, snapshots: snapshots,
          summary: { coach: state.coach && state.coach.name || '', team: state.team && state.team.name || '', year: state.career && state.career.year || 2025 } };
        return withStore('readwrite', function (store) { store.put(slot); }).then(function () { setActive(id); return slot; });
      });
    },
    autosave: function (state) { return Saves.saveSlot(activeId(), state).catch(function () { return null; }); },
    loadSlot: function (id) { return get(id).then(function (slot) {
      if (!slot || checksum(slot.data) !== slot.checksum) throw new Error('Save integrity check failed.');
      setActive(id); return JSON.parse(slot.data);
    }); },
    deleteSlot: function (id) { return withStore('readwrite', function (store) { store.delete(id); }); },
    renameSlot: function (id, name) { return get(id).then(function (slot) { if (!slot) return null; slot.name = name; return withStore('readwrite', function (store) { store.put(slot); }).then(function () { return slot; }); }); },
    exportSlot: function (id) { return get(id).then(function (slot) { return slot ? JSON.stringify({ format: 'gridiron-dynasty-save', version: 2, checksum: slot.checksum, state: JSON.parse(slot.data) }, null, 2) : null; }); },
    importSlot: function (id, raw, name) { var obj = typeof raw === 'string' ? JSON.parse(raw) : raw; var state = obj && obj.state || obj; return Saves.saveSlot(id, state, name || 'Imported Dynasty'); },
    activeId: activeId,
    setActive: setActive,
    checksum: checksum
  };
  window.GameSaves = Saves;
})();
