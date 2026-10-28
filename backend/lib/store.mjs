import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';

/* Dead-simple JSON persistence. Enough for a single-merchant app; swap in
   SQLite/Postgres if you expect volume. Writes are atomic (tmp + rename). */
const DATA_FILE = path.join(config.dataDir, 'gymflow.json');

const EMPTY = { orders: {}, entitlements: {}, syncs: {} };

function ensureDir() {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

export function readDB() {
  ensureDir();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return { ...EMPTY, ...parsed };
  } catch {
    return structuredClone(EMPTY);
  }
}

export function writeDB(db) {
  ensureDir();
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

export function mutate(fn) {
  const db = readDB();
  const result = fn(db);
  writeDB(db);
  return result;
}

export const orders = {
  create(order) {
    return mutate((db) => {
      db.orders[order.orderId] = order;
      return order;
    });
  },
  get(orderId) {
    const db = readDB();
    return db.orders[orderId] || null;
  },
  update(orderId, patch) {
    return mutate((db) => {
      if (!db.orders[orderId]) return null;
      db.orders[orderId] = { ...db.orders[orderId], ...patch, updatedAt: Date.now() };
      return db.orders[orderId];
    });
  },
  findByPayment(paymentId) {
    const db = readDB();
    return Object.values(db.orders).find((o) => o.paymentId === paymentId) || null;
  },
  list() {
    return Object.values(readDB().orders).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
};

export const entitlements = {
  get(deviceId) {
    const db = readDB();
    return db.entitlements[deviceId] || null;
  },
  grant(deviceId, info) {
    return mutate((db) => {
      const existing = db.entitlements[deviceId];
      if (existing && existing.expires && info.expires && existing.expires > info.expires) return existing;
      const record = {
        deviceId,
        pro: true,
        plan: info.plan,
        orderId: info.orderId || null,
        source: info.source || 'gateway',
        status: info.status || 'paid',
        grant: info.grant || null,
        expires: info.expires || null,
        since: Date.now()
      };
      db.entitlements[deviceId] = record;
      return record;
    });
  },
  revoke(deviceId) {
    return mutate((db) => {
      delete db.entitlements[deviceId];
      return true;
    });
  }
};

export const syncs = {
  put(code, payload) {
    return mutate((db) => {
      db.syncs[code] = { ...payload, savedAt: Date.now() };
      return db.syncs[code];
    });
  },
  get(code) {
    const db = readDB();
    return db.syncs[code] || null;
  }
};
