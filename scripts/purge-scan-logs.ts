import "dotenv/config";
import { purgeExpiredData } from "../lib/services/retention";

async function main() {
  const result = await purgeExpiredData();
  console.log(
    `[retention] scans=${result.scansDeleted} reports=${result.reportsDeleted} rate_limit_rows=${result.rateLimitRowsDeleted}`,
  );
}

main().catch((error) => {
  console.error("[retention] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
