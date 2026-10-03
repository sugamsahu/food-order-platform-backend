import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import routes from './routes'
import { errorHandler, notFoundHandler } from './middlewares/errorHandler'

const app = express()

// Only trust a proxy when explicitly configured; 'true' would let clients spoof X-Forwarded-For
// and weaken IP-based rate limiting.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY))

app.use(helmet())
app.use(express.json({ limit: '100kb' }))
if (process.env.NODE_ENV !== 'test') app.use(morgan('tiny'))

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174')
  .split(',').map((o) => o.trim()).filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    // Requests without an Origin header (mobile apps, curl) are not browser cross-origin requests.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    const err = new Error('Origin not allowed by CORS')
    err.code = 'CORS_FORBIDDEN'
    return callback(err)
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
}))

app.use(routes)
app.use(notFoundHandler)
app.use(errorHandler)

export default app
