import Vue from 'vue'

function filterQueryString(obj) {
  return Object.keys(obj)
    .map(k => `filter[${k}]=${encodeURIComponent(obj[k])}`)
    .join('&');
}

const storeRecords = (records) => (newRecords) => {
  const normRecords = normalize(newRecords)
  for (let id in normRecords) {
    Vue.set(records, id, normRecords[id]);
  }
};

const normalizeItem = (data) => {
  let id = data['id']
  delete data['id']
  delete data['type']
  return {[id]: data}
}

const normalize = (data) => {
  const norm = {}
  if (Array.isArray(data)) {
    data.forEach(result => {
      Object.assign(norm, normalizeItem(result))
    })
  } else {
    norm = normalizeItem(data)
  }
  return norm
}

const getOptionsQuery = (optionsObject = {}) => (
  optionsObject.include ? `include=${optionsObject.include}` : ''
);

const matches = (criteria) => (test) => (
  Object.keys(criteria).every(key => (
    criteria[key] === test[key]
  ))
);

const resourceStore = ({ name: resourceName, httpClient: api }) => {
  const collectionUrl = resourceName;
  const resourceUrl = id => `${resourceName}/${id}`;
  const relatedResourceUrl = ({ parent, relationship }) => (
    `${parent.type}/${parent.id}/${relationship}`
  );

  return {
    namespaced: true,

    state: {
      records: {},
      related: [],
      filtered: [],
    },

    mutations: {
      REPLACE_ALL_RECORDS: (state, records) => {
        state.records = records;
      },

      REPLACE_ALL_RELATED: (state, related) => {
        state.related = related;
      },

      STORE_RECORDS: (state, newRecord) => {
        const { records } = state;

        storeRecords(records)(newRecord);
      },

      STORE_RELATED: (state, parent) => {
        const { related } = state;

        storeRecord(related)(parent);
      },

      STORE_FILTERED: (state, { filter, matches }) => {
        const { filtered } = state;

        const ids = matches.map(({ id }) => id);

        // TODO: handle overwriting existing one
        filtered.push({ filter, ids });
      },

      REMOVE_RECORD: (state, record) => {
        delete state.records[record.id];
      },
    },

    actions: {
      loadAll({ commit }, { options } = {}) {
        const url = `${collectionUrl}?${getOptionsQuery(options)}`;
        return api.get(url)
          .then(results => {
            commit('STORE_RECORDS', results.data.data);
          });
      },

      loadById({ commit }, { id, options }) {
        const url = `${resourceUrl(id)}?${getOptionsQuery(options)}`;
        return api.get(url)
          .then(results => {
            commit('STORE_RECORDS', results.data.data)
          });
      },

      loadBy({ commit }, { filter, options }) {
        const searchQuery = filterQueryString(filter);
        const optionsQuery = getOptionsQuery(options);
        const fullUrl = `${collectionUrl}?${searchQuery}&${optionsQuery}`;
        return api.get(fullUrl)
          .then(results => {
            const matches = results.data.data;
            commit('STORE_RECORDS', matches);
            commit('STORE_FILTERED', { filter, matches });
          });
      },

      loadRelated({ commit }, {
        parent,
        relationship = resourceName,
        options,
      }) {
        const url = relatedResourceUrl({ parent, relationship });
        return api.get(`${url}?${getOptionsQuery(options)}`)
          .then(results => {
            const { id, type } = parent;
            const relatedRecords = results.data.data;
            const relatedIds = relatedRecords.map(record => record.id);
            commit('STORE_RECORDS', relatedRecords);
            commit('STORE_RELATED', { id, type, relatedIds });
          });
      },

      create({ commit }, recordData) {
        const requestBody = {
          data: Object.assign(
            { type: resourceName },
            recordData,
          ),
        };
        return api.post(collectionUrl, requestBody)
          .then(result => {
            commit('STORE_RECORDS', result.data.data);
          });
      },

      update({ commit }, record) {
        // http://jsonapi.org/faq/#wheres-put
        return api.patch(resourceUrl(record.id), record)
          .then(() => {
            commit('STORE_RECORDS', record);
          });
      },

      delete({ commit }, record) {
        return api.delete(resourceUrl(record.id))
          .then(() => {
            commit('REMOVE_RECORD', record);
          });
      },
    },

    getters: {
      all: state => state.records,
      find: state => id => ({[id]: state.records[id]}),
      where: state => filter => {
        const matchesRequestedFilter = matches(filter);
        const entry = state.filtered.find(({ filter: testFilter }) => (
          matchesRequestedFilter(testFilter)
        ));

        if (!entry) {
          return [];
        }

        const { ids } = entry;
        return state.records.filter(record => ids.includes(record.id));
      },
      related: state => ({
        parent,
        relationship = resourceName,
      }) => {
        const { type, id } = parent;
        const related = state.related.find(matches({ type, id }));

        if (!related) {
          return [];
        }

        const ids = related.relatedIds;
        return state.records.filter(record => ids.includes(record.id));
      },
    },
  };
};

const mapResourceStores = ({ names, httpClient }) => (
  names.reduce(
    (acc, name) => (
      Object.assign({ [name]: resourceStore({ name, httpClient }) }, acc)
    ),
    {},
  )
);

export {
  resourceStore,
  mapResourceStores,
};
