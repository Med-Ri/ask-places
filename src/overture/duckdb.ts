import { DuckDBInstance, type DuckDBValue, type Json } from "@duckdb/node-api";

export type Row = Record<string, Json>;

/** Runs one SQL query with `$1, $2...` parameters and returns plain JSON rows. */
export type RunQuery = (sql: string, params?: DuckDBValue[]) => Promise<Row[]>;

const SETUP_SQL = `
  LOAD httpfs;
  SET GLOBAL s3_region = 'us-west-2';
  SET GLOBAL enable_external_file_cache = true;
  SET GLOBAL parquet_metadata_cache = true;
`;

let instance: Promise<DuckDBInstance> | undefined;

/**
 * One DuckDB database for the whole process. Its caches (file metadata, downloaded parts of
 * Overture files) are what makes queries after the first one fast, so it is never recreated.
 * DuckDB downloads its httpfs extension on first use, which needs outbound internet access.
 */
function getInstance(): Promise<DuckDBInstance> {
  instance ??= (async () => {
    const db = await DuckDBInstance.create(":memory:");
    const connection = await db.connect();
    try {
      await connection.run(SETUP_SQL);
    } finally {
      connection.closeSync();
    }
    return db;
  })().catch((error: unknown) => {
    instance = undefined;
    throw error;
  });
  return instance;
}

/**
 * After an internal or fatal error DuckDB refuses every later query on the same database
 * ("database has been invalidated"), so the next query must start from a new one.
 */
export function isDatabaseBroken(error: unknown): boolean {
  return error instanceof Error && /^(INTERNAL|FATAL) Error/.test(error.message);
}

/** Each query gets its own short-lived connection so concurrent questions do not wait on each other. */
export const runQuery: RunQuery = async (sql, params) => {
  const db = getInstance();
  const connection = await (await db).connect();
  try {
    const reader = await connection.runAndReadAll(sql, params);
    return reader.getRowObjectsJson();
  } catch (error) {
    if (isDatabaseBroken(error) && instance === db) instance = undefined;
    throw error;
  } finally {
    connection.closeSync();
  }
};
