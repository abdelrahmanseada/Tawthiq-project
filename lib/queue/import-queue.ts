import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env, isBullMqEnabled } from "@/lib/env";

export const IMPORT_QUEUE_NAME = "imports";

export function createRedisConnection(options?: { maxRetriesPerRequest?: number | null }): Redis {
  if (!env.REDIS_URL) throw new Error("REDIS_URL is not configured");
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: options?.maxRetriesPerRequest ?? null,
    enableOfflineQueue: true,
  });
}

let queue: Queue | null = null;
let queueConnection: Redis | null = null;

function getQueue(): Queue {
  if (!queue) {
    queueConnection = createRedisConnection({ maxRetriesPerRequest: 3 });
    queue = new Queue(IMPORT_QUEUE_NAME, {
      connection: queueConnection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 200,
        removeOnFail: 200,
      },
    });
  }
  return queue;
}

/** Enqueue a batch for the BullMQ worker (Docker `worker` service). */
export async function enqueueImport(batchId: string): Promise<boolean> {
  if (!isBullMqEnabled()) return false;
  const jobQueue = getQueue();
  await jobQueue.add("process-import", { batchId }, { jobId: batchId });
  return true;
}

export async function closeImportQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
  if (queueConnection) {
    await queueConnection.quit();
    queueConnection = null;
  }
}

