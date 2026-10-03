import convict from 'convict'
import dotenv from 'dotenv'

dotenv.config()

const DEV_JWT_SECRET = 'dev-only-insecure-secret-change-me'

const config = convict({
  app: {
    name: {
      doc: 'Name of the service',
      format: String,
      default: 'food-order-platform-api',
      env: 'APP_NAME'
    }
  },

  env: {
    doc: 'The application environment.',
    format: ['production', 'development', 'staging', 'test'],
    default: 'development',
    env: 'NODE_ENV'
  },

  port: {
    doc: 'The port to bind.',
    format: 'port',
    default: 8080,
    env: 'PORT'
  },

  restaurant: {
    name: {
      doc: 'Name of the sample restaurant',
      format: String,
      default: 'Sample Restaurant',
      env: 'RESTAURANT_NAME'
    },
    currency: {
      doc: 'Single currency used for every price (ISO 4217)',
      format: String,
      default: 'AED',
      env: 'CURRENCY'
    }
  },

  db: {
    name: { format: String, default: 'food_order', env: 'DB_NAME' },
    username: { format: String, default: 'postgres', env: 'DB_USERNAME' },
    password: { format: String, default: 'postgres', env: 'DB_PASSWORD', sensitive: true },
    host: { format: String, default: '127.0.0.1', env: 'DB_HOST' },
    port: { format: 'port', default: 5432, env: 'DB_PORT' },
    ssl: {
      doc: 'Use TLS for the database connection (true for most hosted databases)',
      format: Boolean,
      default: false,
      env: 'DB_SSL'
    }
  },

  jwt: {
    loginTokenSecret: {
      doc: 'Secret used to sign staff and customer access tokens',
      format: String,
      default: DEV_JWT_SECRET,
      env: 'JWT_LOGIN_SECRET',
      sensitive: true
    },
    loginTokenExpiry: {
      doc: 'Access token lifetime (jsonwebtoken format)',
      format: String,
      default: '2d',
      env: 'JWT_LOGIN_TOKEN_EXPIRY'
    }
  }
})

config.validate({ allowed: 'strict' })

if (config.get('env') === 'production' && config.get('jwt.loginTokenSecret') === DEV_JWT_SECRET) {
  throw new Error('JWT_LOGIN_SECRET must be set in production')
}

export default config
