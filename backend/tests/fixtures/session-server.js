const { createApp } = require("../../server");
const { pool } = require("../../config/db");
const server = createApp().listen(0, "127.0.0.1", () =>
  process.send({ port: server.address().port }),
);
process.on("SIGTERM", () =>
  server.close(() => pool.end().then(() => process.exit(0))),
);
