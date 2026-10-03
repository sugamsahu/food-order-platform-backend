import config from './app.config.js'

const commonSetting = {
  username: config.get('db.username'),
  password: config.get('db.password'),
  database: config.get('db.name'),
  host: config.get('db.host'),
  port: config.get('db.port'),
  dialect: 'postgres',
  logging: false,
  dialectOptions: config.get('db.ssl')
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : {},
  define: {
    underscored: true,
    timestamps: true
  },
  pool: {
    max: 10,
    min: 0,
    idle: 5000,
    acquire: 30000
  }
}

export const development = { ...commonSetting }
export const test = { ...commonSetting }
export const staging = { ...commonSetting }
export const production = { ...commonSetting }
