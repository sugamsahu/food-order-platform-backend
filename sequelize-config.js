// Used only by sequelize-cli (migrations and seeders). Reads the same env vars as the app.
require('dotenv').config()

const ssl = String(process.env.DB_SSL || 'false') === 'true'

const base = {
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'food_order',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  dialect: 'postgres',
  dialectOptions: ssl ? { ssl: { require: true, rejectUnauthorized: false } } : {},
  define: { underscored: true, timestamps: true }
}

module.exports = {
  development: base,
  test: base,
  staging: base,
  production: base
}
