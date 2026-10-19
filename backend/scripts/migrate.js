require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { pool } = require("../config/db");
async function migrate(db = pool) {
  const c = await db.connect();
  try {
    await c.query("begin");
    await c.query("select pg_advisory_xact_lock(187421,1)");
    await c.query(
      "create table if not exists schema_migrations(name text primary key, applied_at timestamptz not null default now())",
    );
    for (const name of fs
      .readdirSync(path.join(__dirname, "../db/migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      if (
        (await c.query("select 1 from schema_migrations where name=$1", [name]))
          .rowCount
      )
        continue;
      await c.query(
        fs.readFileSync(path.join(__dirname, "../db/migrations", name), "utf8"),
      );
      await c.query("insert into schema_migrations(name) values($1)", [name]);
    }
    await c.query("commit");
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
module.exports = { migrate };
if (require.main === module)
  migrate()
    .then(() => console.log("Migrations complete."))
    .catch((e) => {
      console.error("Migration failed:", e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
