// Runs once before the test suite. Creates and rebuilds a dedicated test database so the tests
// never touch development data. Requires a PostgreSQL user that can create databases.
const { execSync } = require('child_process')
const path = require('path')
const { Client } = require('pg')

module.exports = async () => {
  const dbName = process.env.TEST_DB_NAME || 'food_order_test'
  process.env.DB_NAME = dbName
  process.env.NODE_ENV = 'test'

  const admin = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: 'postgres'
  })
  await admin.connect()
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName])
  if (!rowCount) await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`)
  await admin.end()

  execSync('node scripts/reset-db.js', {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'ignore',
    env: process.env
  })
}
