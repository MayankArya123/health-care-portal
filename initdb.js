require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  try {
    const sqlPath = path.join(__dirname, "database", "init.sql");
    console.log("📂 Reading file:", sqlPath);

    const sql = fs.readFileSync(sqlPath, "utf8");
    console.log("📄 SQL Loaded");

    await pool.query(sql);
    console.log("✅ DB initialized");
  } catch (err) {
    console.error("❌ Full Error:", err);
  }
}

initDB();