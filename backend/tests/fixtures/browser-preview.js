// Disposable local preview for browser verification; never uses configured Supabase data.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const net = require("node:net");
(async () => {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const port = await new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
  const db = new EmbeddedPostgres({
    databaseDir: fs.mkdtempSync(path.join(os.tmpdir(), "osquiz-browser-")),
    user: "browser_test",
    password: crypto.randomBytes(24).toString("hex"),
    port,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await db.initialise();
  await db.start();
  await db.createDatabase("quiz_browser");
  // Use the runtime's private local connection details without printing them.
  const client = db.getPgClient();
  const settings = client.connectionParameters;
  process.env.DATABASE_URL = `postgresql://${settings.user}:${settings.password}@localhost:${port}/quiz_browser`;
  process.env.DATABASE_SSL = "false";
  process.env.SESSION_SECRET = crypto.randomBytes(48).toString("hex");
  process.env.NODE_ENV = "test";
  process.env.CLIENT_ORIGIN = "http://localhost:5067";
  delete process.env.TRUST_PROXY_HOPS;
  const { pool } = require("../../config/db");
  await pool.query(
    fs.readFileSync(path.join(__dirname, "../../db/schema.sql"), "utf8"),
  );
  await require("../../scripts/migrate").migrate();
  await require("../../scripts/seed").seed();
  const express = require("express");
  const app = express();
  const api = require("../../server").createApp();
  app.use((req, res, next) =>
    req.path.startsWith("/api") ? api(req, res, next) : next(),
  );
  app.use(express.static(path.join(__dirname, "../../../frontend/dist")));
  const server = app.listen(5067, "127.0.0.1", () =>
    console.log("Disposable browser preview ready: http://localhost:5067"),
  );
  const stop = () =>
    server.close(async () => {
      await pool.end();
      await db.stop();
      process.exit(0);
    });
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
})().catch(() => {
  console.error("Disposable preview could not start.");
  process.exit(1);
});
