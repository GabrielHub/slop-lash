import { createHash } from "crypto";
import { Pool } from "pg";

type LockState = {
  pool: Pool | null;
};

const globalForGameOperationLock = globalThis as typeof globalThis & {
  __slopLashGameOperationLockState?: LockState;
};

const state =
  globalForGameOperationLock.__slopLashGameOperationLockState ??
  (() => {
    const nextState: LockState = {
      pool: null,
    };
    globalForGameOperationLock.__slopLashGameOperationLockState = nextState;
    return nextState;
  })();

function getDatabaseUrl(): string | null {
  return process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? null;
}

function getLockPool(): Pool | null {
  const connectionString = getDatabaseUrl();
  if (!connectionString) return null;
  if (state.pool) return state.pool;

  state.pool = new Pool({
    connectionString,
    max: 4,
  });

  return state.pool;
}

function getLockKeys(scope: string, resourceId: string): [number, number] {
  const digest = createHash("sha256").update(`${scope}:${resourceId}`).digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)];
}

export async function withGameOperationLock<T>(
  gameId: string,
  scope: string,
  operation: () => Promise<T>,
): Promise<{ acquired: boolean; result?: T }> {
  const pool = getLockPool();
  if (!pool) {
    return {
      acquired: true,
      result: await operation(),
    };
  }

  const [keyA, keyB] = getLockKeys(scope, gameId);
  const client = await pool.connect();

  try {
    const { rows } = await client.query<{ acquired: boolean }>(
      "select pg_try_advisory_lock($1, $2) as acquired",
      [keyA, keyB],
    );
    const acquired = rows[0]?.acquired ?? false;
    if (!acquired) {
      return { acquired: false };
    }

    try {
      return {
        acquired: true,
        result: await operation(),
      };
    } finally {
      await client
        .query("select pg_advisory_unlock($1, $2)", [keyA, keyB])
        .catch(() => undefined);
    }
  } finally {
    client.release();
  }
}
