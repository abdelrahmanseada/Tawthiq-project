import "dotenv/config";
import { prisma } from "../lib/db";
import { env } from "../lib/env";
import { issueCardForEmployee } from "../lib/services/cards";
import { addDays } from "../lib/format";

if (env.NODE_ENV === "production") {
  throw new Error("db:demo refuses to run in production");
}

const EMPLOYEES = [
  ["Amelia Hart", "Operations", "Maintenance Technician", "ACTIVE", true],
  ["Noah Williams", "Human Resources", "Talent Partner", "ACTIVE", false],
  ["Sofia Ramirez", "Information Technology", "Network Engineer", "ACTIVE", false],
  ["Ethan Brooks", "Finance", "Senior Accountant", "ACTIVE", false],
  ["Ava Thompson", "Operations", "Shift Supervisor", "ACTIVE", true],
  ["Liam Chen", "Marketing", "Brand Coordinator", "ACTIVE", false],
  ["Isabella Rossi", "Sales", "Account Executive", "ACTIVE", false],
  ["Mateo Garcia", "Customer Support", "Support Specialist", "ACTIVE", false],
  ["Oliver Schmidt", "Operations", "Electrical Technician", "ACTIVE", true],
  ["Priya Nair", "Human Resources", "People Operations Lead", "ACTIVE", false],
  ["Lucas Martin", "Information Technology", "Software Engineer", "ACTIVE", false],
  ["Emma Johansson", "Finance", "Payroll Accountant", "ACTIVE", false],
  ["Daniel Okafor", "Operations", "HVAC Technician", "SUSPENDED", false],
  ["Grace Kim", "Finance", "Internal Auditor", "TERMINATED", false],
  ["Tomas Silva", "Information Technology", "IT Support Analyst", "ACTIVE", false],
  ["Chloe Dubois", "Marketing", "Visual Designer", "ACTIVE", false],
] as const;

async function main() {
  const company = await prisma.company.findFirstOrThrow({ orderBy: { created_at: "asc" } });
  const owner = await prisma.adminUser.findFirstOrThrow({ where: { company_id: company.id, role: "SUPER_ADMIN" } });
  let cards = 0;
  for (let index = 0; index < EMPLOYEES.length; index += 1) {
    const [fullName, department, jobTitle, status, expiring] = EMPLOYEES[index]!;
    const code = `DEMO-${String(index + 1).padStart(3, "0")}`;
    const employee = await prisma.employee.upsert({
      where: { company_id_employee_code: { company_id: company.id, employee_code: code } },
      create: {
        company_id: company.id,
        employee_code: code,
        full_name: fullName,
        department,
        job_title: jobTitle,
        status,
      },
      update: {
        full_name: fullName,
        department,
        job_title: jobTitle,
        status,
        deleted_at: null,
      },
    });
    const existing = await prisma.card.findFirst({ where: { employee_id: employee.id, status: "ACTIVE" } });
    if (!existing) {
      await issueCardForEmployee(employee, company, owner.id, {
        expiresAt: expiring ? addDays(new Date(), 20) : addDays(new Date(), 365),
      });
      cards += 1;
    }
  }
  console.log(`[demo] ${EMPLOYEES.length} demo employees ready, ${cards} cards issued`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
