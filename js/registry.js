/* GRIDIRON DYNASTY 2.0 - shared data-driven content registries. */
(function () {
  'use strict';
  var buckets = {};

  function bucket(kind) { return buckets[kind] || (buckets[kind] = {}); }

  window.GameRegistry = {
    register: function (kind, id, value) {
      if (!kind || !id) throw new Error('Registry entries require a kind and id.');
      bucket(kind)[id] = value;
      return value;
    },
    registerAll: function (kind, values) {
      (values || []).forEach(function (value) { this.register(kind, value.id, value); }, this);
      return this.list(kind);
    },
    get: function (kind, id) { return bucket(kind)[id] || null; },
    list: function (kind) { return Object.keys(bucket(kind)).map(function (id) { return bucket(kind)[id]; }); },
    has: function (kind, id) { return !!bucket(kind)[id]; },
    kinds: function () { return Object.keys(buckets); }
  };
})();
