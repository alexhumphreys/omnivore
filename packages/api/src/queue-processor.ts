/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-misused-promises */
import {
  ConnectionOptions,
  Job,
  JobType,
  Queue,
  QueueEvents,
  Worker,
} from 'bullmq'
import express, { Express } from 'express'
import { SnakeNamingStrategy } from 'typeorm-naming-strategies'
import { appDataSource } from './data_source'
import { env } from './env'
import { bulkAction, BULK_ACTION_JOB_NAME } from './jobs/bulk_action'
import { CALL_WEBHOOK_JOB_NAME, callWebhook } from './jobs/call_webhook'
import { findThumbnail, THUMBNAIL_JOB } from './jobs/find_thumbnail'
import { refreshAllFeeds } from './jobs/rss/refreshAllFeeds'
import { refreshFeed } from './jobs/rss/refreshFeed'
import { savePageJob } from './jobs/save_page'
import {
  syncReadPositionsJob,
  SYNC_READ_POSITIONS_JOB_NAME,
} from './jobs/sync_read_positions'
import { triggerRule, TRIGGER_RULE_JOB_NAME } from './jobs/trigger_rule'
import {
  updateHighlight,
  updateLabels,
  UPDATE_HIGHLIGHT_JOB,
  UPDATE_LABELS_JOB,
} from './jobs/update_db'
import { updatePDFContentJob } from './jobs/update_pdf_content'
import { redisDataSource } from './redis_data_source'
import { CACHED_READING_POSITION_PREFIX } from './services/cached_reading_position'
import { CustomTypeOrmLogger, logger } from './utils/logger'

export const QUEUE_NAME = 'omnivore-backend-queue'
export const JOB_VERSION = 'v001'

let backendQueue: Queue | undefined
export const getBackendQueue = async (): Promise<Queue | undefined> => {
  if (backendQueue) {
    await backendQueue.waitUntilReady()
    return backendQueue
  }
  if (!redisDataSource.workerRedisClient) {
    throw new Error('Can not create queues, redis is not initialized')
  }
  backendQueue = new Queue(QUEUE_NAME, {
    connection: redisDataSource.workerRedisClient,
    defaultJobOptions: {
      backoff: {
        type: 'exponential',
        delay: 2000, // 2 seconds
      },
      removeOnComplete: {
        age: 24 * 3600, // keep up to 24 hours
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // keep up to 7 days
      },
    },
  })
  await backendQueue.waitUntilReady()
  return backendQueue
}

export const createWorker = (connection: ConnectionOptions) =>
  new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      switch (job.name) {
        case 'refresh-all-feeds': {
          const queue = await getBackendQueue()
          const counts = await queue?.getJobCounts('prioritized')
          if (counts && counts.wait > 1000) {
            return
          }
          return await refreshAllFeeds(appDataSource)
        }
        case 'refresh-feed': {
          return await refreshFeed(job.data)
        }
        case 'save-page': {
          return savePageJob(job.data, job.attemptsMade)
        }
        case 'update-pdf-content': {
          return updatePDFContentJob(job.data)
        }
        case THUMBNAIL_JOB:
          return findThumbnail(job.data)
        case TRIGGER_RULE_JOB_NAME:
          return triggerRule(job.data)
        case UPDATE_LABELS_JOB:
          return updateLabels(job.data)
        case UPDATE_HIGHLIGHT_JOB:
          return updateHighlight(job.data)
        case SYNC_READ_POSITIONS_JOB_NAME:
          return syncReadPositionsJob(job.data)
        case BULK_ACTION_JOB_NAME:
          return bulkAction(job.data)
        case CALL_WEBHOOK_JOB_NAME:
          return callWebhook(job.data)
      }
    },
    {
      connection,
    }
  )

const setupCronJobs = async () => {
  const queue = await getBackendQueue()
  if (!queue) {
    logger.error('Unable to setup cron jobs. Queue is not available.')
    return
  }

  await queue.add(
    SYNC_READ_POSITIONS_JOB_NAME,
    {},
    {
      priority: 1,
      repeat: {
        every: 60_000,
      },
    }
  )
}

const main = async () => {
  console.log('[queue-processor]: starting queue processor')

  const app: Express = express()
  const port = process.env.PORT || 3002

  redisDataSource.setOptions({
    cache: env.redis.cache,
    mq: env.redis.mq,
  })

  appDataSource.setOptions({
    type: 'postgres',
    host: env.pg.host,
    port: env.pg.port,
    schema: 'omnivore',
    username: env.pg.userName,
    password: env.pg.password,
    database: env.pg.dbName,
    logging: ['query', 'info'],
    entities: [__dirname + '/entity/**/*{.js,.ts}'],
    subscribers: [__dirname + '/events/**/*{.js,.ts}'],
    namingStrategy: new SnakeNamingStrategy(),
    logger: new CustomTypeOrmLogger(['query', 'info']),
    connectTimeoutMS: 40000, // 40 seconds
    maxQueryExecutionTime: 10000, // 10 seconds
  })

  // respond healthy to auto-scaler.
  app.get('/_ah/health', (req, res) => res.sendStatus(200))

  app.get('/lifecycle/prestop', async (req, res) => {
    logger.info('prestop lifecycle hook called.')
    await worker.close()
    res.sendStatus(200)
  })

  app.get('/metrics', async (_, res) => {
    const queue = await getBackendQueue()
    if (!queue) {
      res.sendStatus(400)
      return
    }

    let output = ''
    const metrics: JobType[] = ['active', 'failed', 'completed', 'prioritized']
    const counts = await queue.getJobCounts(...metrics)
    console.log('counts: ', counts)

    metrics.forEach((metric, idx) => {
      output += `# TYPE omnivore_queue_messages_${metric} gauge\n`
      output += `omnivore_queue_messages_${metric}{queue="${QUEUE_NAME}"} ${counts[metric]}\n`
    })

    if (redisDataSource.redisClient) {
      // Add read-position count, if its more than 10K items just denote
      // 10_001. As this should never occur and means there is some
      // other serious issue occurring.
      const [cursor, batch] = await redisDataSource.redisClient.scan(
        0,
        'MATCH',
        `${CACHED_READING_POSITION_PREFIX}:*`,
        'COUNT',
        10_000
      )
      if (cursor != '0') {
        output += `# TYPE omnivore_read_position_messages gauge\n`
        output += `omnivore_read_position_messages{queue="${QUEUE_NAME}"} ${10_001}\n`
      } else if (batch) {
        output += `# TYPE omnivore_read_position_messages gauge\n`
        output += `omnivore_read_position_messages{} ${batch.length}\n`
      }
    }

    res.status(200).setHeader('Content-Type', 'text/plain').send(output)
  })

  const server = app.listen(port, () => {
    console.log(`[queue-processor]: started`)
  })

  // This is done after all the setup so it can access the
  // environment that was loaded from GCP
  await appDataSource.initialize()
  await redisDataSource.initialize()

  const redisClient = redisDataSource.redisClient
  const workerRedisClient = redisDataSource.workerRedisClient
  if (!workerRedisClient || !redisClient) {
    throw '[queue-processor] error redis is not initialized'
  }

  const worker = createWorker(workerRedisClient)

  await setupCronJobs()

  const queueEvents = new QueueEvents(QUEUE_NAME, {
    connection: workerRedisClient,
  })

  queueEvents.on('added', async (job) => {
    console.log('added job: ', job.jobId, job.name)
  })

  queueEvents.on('removed', async (job) => {
    console.log('removed job: ', job.jobId)
  })

  queueEvents.on('completed', async (job) => {
    console.log('completed job: ', job.jobId)
  })

  workerRedisClient.on('error', (error) => {
    console.trace('[queue-processor]: redis worker error', { error })
  })

  redisClient.on('error', (error) => {
    console.trace('[queue-processor]: redis error', { error })
  })

  const gracefulShutdown = async (signal: string) => {
    console.log(`[queue-processor]: Received ${signal}, closing server...`)
    await worker.close()
    await redisDataSource.shutdown()
    process.exit(0)
  }

  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
}

// only call main if the file was called from the CLI and wasn't required from another module
if (require.main === module) {
  main().catch((e) => console.error(e))
}
