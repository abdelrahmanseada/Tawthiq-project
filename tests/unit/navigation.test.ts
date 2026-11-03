import { describe, expect, it } from "vitest";
import { breadcrumbsForPath } from "@/lib/navigation";

const labels = {
  dashboard: "Dashboard",
  employees: "Employees",
  account: "My account",
  settings: "Company settings",
  auditLog: "Audit log",
  scanLogs: "Scan log",
  cards: "ID cards",
  admins: "Administrators",
  analytics: "Analytics",
  imports: "Bulk import",
  system: "System status",
};

describe("breadcrumbsForPath", () => {
  it("shows only Dashboard on the dashboard", () => {
    expect(breadcrumbsForPath("/dashboard", labels)).toEqual([{ href: "/dashboard", label: "Dashboard" }]);
  });

  it("uses the real account route, never Employees", () => {
    expect(breadcrumbsForPath("/account", labels)).toEqual([
      { href: "/dashboard", label: "Dashboard" },
      { href: "/account", label: "My account" },
    ]);
  });

  it("uses the longest matching section for nested pages", () => {
    expect(breadcrumbsForPath("/employees/abc-123/edit", labels).at(-1)?.label).toBe("Employees");
    expect(breadcrumbsForPath("/logs/audit", labels).at(-1)?.label).toBe("Audit log");
    expect(breadcrumbsForPath("/logs/scans", labels).at(-1)?.label).toBe("Scan log");
  });

  it("covers every admin section", () => {
    for (const [path, label] of Object.entries({
      "/dashboard": "Dashboard",
      "/analytics": "Analytics",
      "/employees": "Employees",
      "/cards": "ID cards",
      "/imports": "Bulk import",
      "/logs/scans": "Scan log",
      "/logs/audit": "Audit log",
      "/settings": "Company settings",
      "/admins": "Administrators",
      "/status": "System status",
      "/account": "My account",
    })) {
      expect(breadcrumbsForPath(path, labels).at(-1)?.label, path).toBe(label);
    }
  });
});
