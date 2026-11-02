import "dotenv/config";
import { prisma } from "../lib/db";
import { env } from "../lib/env";

if (env.NODE_ENV === "production") {
  throw new Error("db:clear-demo refuses to run in production");
}

async function main() {
  const employees = await prisma.employee.findMany({
    where: { employee_code: { startsWith: "DEMO-" } },
    select: { id: true },
  });
  const ids = employees.map((employee) => employee.id);
  await prisma.card.deleteMany({ where: { employee_id: { in: ids } } });
  const removed = await prisma.employee.deleteMany({ where: { id: { in: ids } } });
  console.log(`[demo] removed ${removed.count} demo employees and their cards`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
