import { createServer } from 'http'
import config from './src/configs/app.config'
import app from './src/app'
import { sequelize } from './src/db/models'

const httpServer = createServer(app)

httpServer.listen({ port: config.get('port') }, () => {
  console.log(`Server listening on port ${config.get('port')}`)
})

const shutdown = (signal) => {
  console.log(`Received ${signal}, shutting down`)
  httpServer.close(async () => {
    try {
      await sequelize.close()
    } finally {
      process.exit(0)
    }
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
