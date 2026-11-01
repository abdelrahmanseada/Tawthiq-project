import "dotenv/config";
import { Worker } from "bullmq";
import { createRedisConnection, IMPORT_QUEUE_NAME } from "@/lib/queue/import-queue";
import { processImportBatch } from "@/lib/services/imports";

const connection = createRedisConnection();
const worker = new Worker(
  IMPORT_QUEUE_NAME,
  async (job) => {
    const batchId = String(job.data?.batchId ?? "");
    if (!batchId) throw new Error("Import job is missing a batch id");
    await processImportBatch(batchId);
  },
  { connection, concurrency: 2 },
);

worker.on("completed", (job) => console.log(`[worker] import ${job.id} completed`));
worker.on("failed", (job, error) => console.error(`[worker] import ${job?.id ?? "?"} failed`, error.message));

async function shutdown() {
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
console.log("[worker] import worker ready");
