const { Pool } = require("pg");
const connectionString = process.env.DATABASE_URL;
const useSsl = process.env.DATABASE_SSL !== "false";
const pool = new Pool({
  connectionString,
  ssl: useSsl
    ? {
        rejectUnauthorized: true,
        ...(process.env.DATABASE_SSL_CA
          ? { ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, "\n") }
          : {}),
      }
    : false,
  max: 10,
});
pool.on("error", () => console.error("Unexpected database connection error."));
async function connectDB() {
  if (!connectionString)
    throw new Error("DATABASE_URL must be set in the backend environment.");
  try {
    await pool.query("select 1");
    console.log("PostgreSQL connected.");
  } catch {
    throw new Error(
      "Database connection failed. Check backend database configuration and TLS certificate.",
    );
  }
}
module.exports = { pool, connectDB };
