/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");

function createFakeCloudbase() {
  const collections = new Map();
  let nextId = 1;
  let caller = null;
  const command = {
    gte(value) {
      return { operation: "gte", value };
    },
  };

  function collectionApi(name) {
    const state = { condition: {}, orders: [], skip: 0, limit: 100 };
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
            const l = left[field];
            const r = right[field];
            const difference = typeof l === "number" && typeof r === "number"
              ? l - r
              : String(l).localeCompare(String(r));
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
        const documentId = String(id);
        return {
          async get() {
            const document = collections.get(name)?.get(documentId);
            return { data: document ? [{ ...document }] : [] };
          },
          async set(fields) {
            if (!collections.has(name)) throw new Error("DATABASE_COLLECTION_NOT_EXIST");
            collections.get(name).set(documentId, { _id: documentId, ...fields });
            return { updated: 1 };
          },
          async update(fields) {
            const document = collections.get(name)?.get(documentId);
            if (!document) throw new Error("DOCUMENT_NOT_FOUND");
            collections.get(name).set(documentId, { ...document, ...fields, _id: documentId });
            return { updated: 1 };
          },
          async remove() {
            collections.get(name)?.delete(documentId);
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
      return {
        database: () => database,
        auth: () => ({
          getUserInfo: () => caller ? { ...caller } : {},
        }),
      };
    },
    setCaller(info) {
      caller = info;
    },
  };
}

const originalLoad = Module._load;
const fakeCloudbase = createFakeCloudbase();
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "@cloudbase/node-sdk") return fakeCloudbase;
  return originalLoad.call(this, request, parent, isMain);
};
const { main } = require("./index.js");
Module._load = originalLoad;

function invoke(platformUid, action, payload = {}, sessionToken, channel) {
  fakeCloudbase.setCaller(platformUid
    ? typeof platformUid === "object" ? platformUid : { uid: platformUid }
    : null);
  return main({ action, payload, sessionToken, channel });
}

let firstToken;
let secondToken;
let firstRecoveryCode;

test("exposes a credential-free deployment health check", async () => {
  const result = await invoke(null, "health");
  assert.equal(result.status, 200);
  assert.equal(result.data.ok, true);
  assert.equal(result.data.service, "couple-tracker");
  assert.equal(result.data.version, "0.2.0");
});

test("requires a CloudBase platform identity", async () => {
  const result = await invoke(null, "bootstrap");
  assert.equal(result.status, 401);
  assert.equal(result.data.code, "PLATFORM_AUTH_REQUIRED");
});

test("registers password accounts without storing plain-text passwords", async () => {
  const firstRegistration = await invoke("browser-a", "register", {
    username: "chicken_egg",
    password: "farmPass123",
  });
  assert.equal(firstRegistration.status, 201);
  assert.match(firstRegistration.data.sessionToken, /^[a-f0-9]{64}$/);
  assert.match(firstRegistration.data.recoveryCode, /^[2-9A-HJ-NP-Z]{8}-[2-9A-HJ-NP-Z]{8}$/);
  firstToken = firstRegistration.data.sessionToken;
  firstRecoveryCode = firstRegistration.data.recoveryCode;

  const duplicate = await invoke("browser-x", "register", {
    username: "CHICKEN_EGG",
    password: "anotherPass123",
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.data.code, "USERNAME_TAKEN");

  const secondRegistration = await invoke("browser-b", "register", {
    username: "poopy_friend",
    password: "farmPass456",
  });
  assert.equal(secondRegistration.status, 201);
  secondToken = secondRegistration.data.sessionToken;

  const copiedToken = await invoke("browser-b", "bootstrap", {}, firstToken);
  assert.equal(copiedToken.status, 401);

  const loggedIn = await invoke("browser-a-new", "login", {
    username: "chicken_egg",
    password: "farmPass123",
  });
  assert.equal(loggedIn.status, 200);
  assert.notEqual(loggedIn.data.sessionToken, firstToken);

  const recovered = await invoke("browser-a", "recover-account", {
    username: "chicken_egg",
    recoveryCode: firstRecoveryCode,
    newPassword: "newFarmPass789",
  });
  assert.equal(recovered.status, 200);
  const oldSession = await invoke("browser-a", "bootstrap", {}, firstToken);
  assert.equal(oldSession.status, 401);
  firstToken = recovered.data.sessionToken;
});

test("automatically creates a mini-program profile from verified OpenID", async () => {
  const mini = await invoke(
    { uid: "platform-mini-user", openId: "openid-123", appId: "wx-app" },
    "bootstrap",
    {},
    undefined,
    "mini",
  );
  assert.equal(mini.status, 200);
  assert.match(mini.data.viewer.uid, /^wx_[a-f0-9]{40}$/);
  assert.equal(mini.data.viewer.profileComplete, false);
});

test("creates profiles and securely pairs two different accounts", async () => {
  const first = await invoke("browser-a", "bootstrap", {}, firstToken);
  assert.equal(first.status, 200);
  assert.equal(first.data.viewer.profileComplete, false);
  assert.equal(first.data.couple, null);

  await invoke("browser-a", "update-profile", { nickname: "鸡包蛋", avatar: "🐣" }, firstToken);
  await invoke("browser-b", "bootstrap", {}, secondToken);
  await invoke("browser-b", "update-profile", { nickname: "拉粑臭", avatar: "🐰" }, secondToken);

  const invite = await invoke("browser-a", "create-invite", {}, firstToken);
  assert.equal(invite.status, 201);
  assert.match(invite.data.code, /^[2-9A-HJ-NP-Z]{8}$/);

  const selfPair = await invoke("browser-a", "accept-invite", { code: invite.data.code }, firstToken);
  assert.equal(selfPair.status, 400);
  assert.equal(selfPair.data.code, "SELF_PAIRING");

  const paired = await invoke("browser-b", "accept-invite", { code: invite.data.code.toLowerCase() }, secondToken);
  assert.equal(paired.status, 200);
  assert.equal(paired.data.viewer.nickname, "拉粑臭");
  assert.equal(paired.data.partner.nickname, "鸡包蛋");
  assert.ok(paired.data.couple.id.startsWith("couple_"));

  const reused = await invoke("browser-b", "accept-invite", { code: invite.data.code }, secondToken);
  assert.equal(reused.status, 409);
  assert.equal(reused.data.code, "ALREADY_PAIRED");
});

test("shares couple data while enforcing record ownership", async () => {
  const created = await invoke("browser-a", "add-weight", {
    weightKg: 68.4,
    occurredAt: Date.now(),
  }, firstToken);
  assert.equal(created.status, 201);
  assert.match(created.data.entry.ownerUid, /^acct_/);

  const poop = await invoke("browser-b", "add-poop", { occurredAt: Date.now() }, secondToken);
  assert.equal(poop.status, 201);
  assert.match(poop.data.entry.ownerUid, /^acct_/);

  const reaction = await invoke("browser-b", "react", { kind: "like" }, secondToken);
  assert.equal(reaction.status, 201);
  assert.notEqual(reaction.data.reaction.toUserUid, reaction.data.reaction.fromUserUid);

  const partnerDelete = await invoke("browser-b", "delete-weight", { id: created.data.entry.id }, secondToken);
  assert.equal(partnerDelete.status, 403);
  assert.equal(partnerDelete.data.code, "RECORD_FORBIDDEN");

  const dashboard = await invoke("browser-b", "get-dashboard", {}, secondToken);
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.data.weights.length, 1);
  assert.equal(dashboard.data.poops.length, 1);
  assert.equal(dashboard.data.reactions.length, 1);

  const ownerDelete = await invoke("browser-a", "delete-weight", { id: created.data.entry.id }, firstToken);
  assert.equal(ownerDelete.status, 200);
  const afterDelete = await invoke("browser-b", "get-dashboard", {}, secondToken);
  assert.equal(afterDelete.data.weights.length, 0);
});

test("supports editable profiles, farm settings, reminders and anniversaries", async () => {
  const profile = await invoke("browser-a", "update-profile", {
    nickname: "鸡包蛋改",
    avatar: "🐻",
    color: "#2f9e62",
  }, firstToken);
  assert.equal(profile.status, 200);
  assert.equal(profile.data.viewer.nickname, "鸡包蛋改");
  assert.equal(profile.data.viewer.color, "#2f9e62");

  const couple = await invoke("browser-a", "update-couple-settings", {
    farmName: "臭蛋幸福农场",
    togetherSince: "2020-04-15",
  }, firstToken);
  assert.equal(couple.status, 200);
  assert.equal(couple.data.couple.farmName, "臭蛋幸福农场");
  assert.equal(couple.data.couple.togetherSince, "2020-04-15");

  const reminders = await invoke("browser-a", "update-reminders", {
    weight: { enabled: true, time: "07:30", days: [1, 3, 5] },
    poop: { enabled: true, time: "21:00", days: [0, 1, 2, 3, 4, 5, 6] },
    anniversary: { enabled: true, advanceDays: [14, 7, 1, 0] },
  }, firstToken);
  assert.equal(reminders.status, 200);
  assert.equal(reminders.data.reminders.weight.time, "07:30");
  assert.deepEqual(reminders.data.reminders.weight.days, [1, 3, 5]);

  const created = await invoke("browser-a", "add-anniversary", {
    title: "第一次约会",
    date: "2020-05-20",
    icon: "💞",
    note: "一起吃了火锅",
    repeatsYearly: true,
  }, firstToken);
  assert.equal(created.status, 201);
  assert.equal(created.data.anniversary.title, "第一次约会");

  const updated = await invoke("browser-b", "update-anniversary", {
    id: created.data.anniversary.id,
    title: "第一次正式约会",
    date: "2020-05-21",
    icon: "✨",
    repeatsYearly: true,
  }, secondToken);
  assert.equal(updated.status, 200);
  assert.equal(updated.data.anniversary.title, "第一次正式约会");

  const dashboard = await invoke("browser-b", "get-dashboard", {}, secondToken);
  assert.equal(dashboard.data.couple.farmName, "臭蛋幸福农场");
  assert.equal(dashboard.data.partner.nickname, "鸡包蛋改");
  assert.equal(dashboard.data.anniversaries.length, 1);
  assert.equal(dashboard.data.partner.reminders, undefined);
  assert.ok(dashboard.data.viewer.reminders);

  const removed = await invoke("browser-a", "delete-anniversary", { id: created.data.anniversary.id }, firstToken);
  assert.equal(removed.status, 200);
});

test("allows owners to edit their records and clear their history", async () => {
  const weight = await invoke("browser-a", "add-weight", {
    weightKg: 67.2,
    occurredAt: Date.now() - 60_000,
  }, firstToken);
  const editedWeight = await invoke("browser-a", "update-weight", {
    id: weight.data.entry.id,
    weightKg: 66.8,
    occurredAt: Date.now(),
  }, firstToken);
  assert.equal(editedWeight.status, 200);
  assert.equal(editedWeight.data.entry.weightKg, 66.8);

  const poop = await invoke("browser-b", "add-poop", { occurredAt: Date.now() - 60_000 }, secondToken);
  const forbidden = await invoke("browser-a", "update-poop", {
    id: poop.data.entry.id,
    occurredAt: Date.now(),
  }, firstToken);
  assert.equal(forbidden.status, 403);

  const cleared = await invoke("browser-a", "clear-my-records", {}, firstToken);
  assert.equal(cleared.status, 200);
  assert.ok(cleared.data.deleted >= 1);
  const dashboard = await invoke("browser-b", "get-dashboard", {}, secondToken);
  assert.equal(dashboard.data.weights.filter((entry) => entry.ownerUid === editedWeight.data.entry.ownerUid).length, 0);
});

test("can delete and recreate a mini-program identity without credentials", async () => {
  const caller = { uid: "platform-delete-user", openId: "openid-delete", appId: "wx-app" };
  const initial = await invoke(caller, "bootstrap", {}, undefined, "mini");
  await invoke(caller, "update-profile", { nickname: "待注销", avatar: "🐱" }, undefined, "mini");
  const deleted = await invoke(caller, "delete-identity", {}, undefined, "mini");
  assert.equal(deleted.status, 200);
  const recreated = await invoke(caller, "bootstrap", {}, undefined, "mini");
  assert.equal(recreated.status, 200);
  assert.equal(recreated.data.viewer.uid, initial.data.viewer.uid);
  assert.equal(recreated.data.viewer.profileComplete, false);
});

test("ending a relationship immediately isolates the archived records", async () => {
  const result = await invoke("browser-a", "unbind", {}, firstToken);
  assert.equal(result.status, 200);

  const first = await invoke("browser-a", "bootstrap", {}, firstToken);
  const second = await invoke("browser-b", "bootstrap", {}, secondToken);
  assert.equal(first.data.couple, null);
  assert.equal(second.data.couple, null);

  const blocked = await invoke("browser-a", "get-dashboard", {}, firstToken);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, "PAIRING_REQUIRED");
});
