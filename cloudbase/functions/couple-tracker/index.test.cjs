/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");

function createFakeCloudbase() {
  const collections = new Map();
  let nextId = 1;
  const command = {
    gte(value) {
      return { operation: "gte", value };
    },
  };

  function collectionApi(name) {
    const state = {
      condition: {},
      orders: [],
      skip: 0,
      limit: 100,
    };

    const api = {
      where(condition) {
        state.condition = condition;
        return api;
      },
      orderBy(field, direction) {
        state.orders.push([field, direction]);
        return api;
      },
      skip(value) {
        state.skip = value;
        return api;
      },
      limit(value) {
        state.limit = value;
        return api;
      },
      async get() {
        if (!collections.has(name)) throw new Error("DATABASE_COLLECTION_NOT_EXIST");
        let documents = [...collections.get(name).values()];
        documents = documents.filter((document) => Object.entries(state.condition).every(([field, expected]) => {
          if (expected && expected.operation === "gte") return document[field] >= expected.value;
          return document[field] === expected;
        }));
        for (const [field, direction] of state.orders) {
          documents.sort((left, right) => {
            const difference = left[field] - right[field];
            return direction === "desc" ? -difference : difference;
          });
        }
        return { data: documents.slice(state.skip, state.skip + state.limit).map((item) => ({ ...item })) };
      },
      async add(fields) {
        if (!collections.has(name)) throw new Error("DATABASE_COLLECTION_NOT_EXIST");
        const id = String(nextId++);
        collections.get(name).set(id, { _id: id, ...fields });
        return { id };
      },
      doc(id) {
        return {
          async get() {
            const document = collections.get(name)?.get(String(id));
            return { data: document ? [{ ...document }] : [] };
          },
          async remove() {
            collections.get(name)?.delete(String(id));
            return { deleted: 1 };
          },
        };
      },
    };
    return api;
  }

  const database = {
    command,
    collection: collectionApi,
    async createCollection(name) {
      if (!collections.has(name)) collections.set(name, new Map());
      return {};
    },
  };

  return {
    SYMBOL_CURRENT_ENV: "current",
    init() {
      return { database: () => database };
    },
    parseContext() {
      return { environ: {} };
    },
  };
}

const originalLoad = Module._load;
const fakeCloudbase = createFakeCloudbase();
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "@cloudbase/node-sdk") return fakeCloudbase;
  return originalLoad.call(this, request, parent, isMain);
};

process.env.CHICKEN_TOKEN = "chicken-test-token";
process.env.POOPY_TOKEN = "poopy-test-token";
const { main } = require("./index.js");
Module._load = originalLoad;

function invoke(token, method, payload = {}) {
  return main({ token, method, payload }, {});
}

test("rejects an invalid dedicated link", async () => {
  const result = await invoke("wrong-token", "GET");
  assert.equal(result.status, 401);
});

test("stores, reads and protects each member's records", async () => {
  const empty = await invoke("chicken-test-token", "GET");
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.data.weights, []);

  const created = await invoke("chicken-test-token", "POST", {
    action: "add-weight",
    weightKg: 68.4,
    occurredAt: Date.now(),
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.entry.member, "chicken");

  const partnerDelete = await invoke("poopy-test-token", "POST", {
    action: "delete-weight",
    id: created.data.entry.id,
  });
  assert.equal(partnerDelete.status, 404);

  const afterDeniedDelete = await invoke("chicken-test-token", "GET");
  assert.equal(afterDeniedDelete.data.weights.length, 1);

  const ownerDelete = await invoke("chicken-test-token", "POST", {
    action: "delete-weight",
    id: created.data.entry.id,
  });
  assert.equal(ownerDelete.status, 200);

  const afterOwnerDelete = await invoke("chicken-test-token", "GET");
  assert.equal(afterOwnerDelete.data.weights.length, 0);
});

test("records poop times and partner reactions", async () => {
  const poop = await invoke("poopy-test-token", "POST", {
    action: "add-poop",
    occurredAt: Date.now(),
  });
  assert.equal(poop.status, 201);
  assert.equal(poop.data.entry.member, "poopy");

  const reaction = await invoke("poopy-test-token", "POST", {
    action: "react",
    kind: "like",
  });
  assert.equal(reaction.status, 201);
  assert.equal(reaction.data.reaction.toMember, "chicken");

  const chickenView = await invoke("chicken-test-token", "GET");
  assert.equal(chickenView.data.poops.length, 1);
  assert.equal(chickenView.data.reactions[0].toMember, "chicken");
});
