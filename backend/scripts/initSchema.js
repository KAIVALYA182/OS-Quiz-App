require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { pool } = require("../config/db");
(async () => {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select pg_advisory_xact_lock(187421,1)");
    if (
      (await c.query("select to_regclass('public.users') as existing")).rows[0]
        .existing
    )
      throw new Error(
        "Existing database detected. Use npm run migrate instead.",
      );
    await c.query(
      fs.readFileSync(path.join(__dirname, "../db/schema.sql"), "utf8"),
    );
    await c.query("commit");
    console.log("Fresh database schema initialized.");
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
})()
  .catch((e) => {
    console.error(
      e.code ? "Schema initialization failed (" + e.code + ")." : e.message,
    );
    process.exitCode = 1;
  })
  .finally(() => pool.end());
