import * as dashboardRepository from "@/lib/dashboard/dashboard-repository";

export function getDashboardCounts(organisationId: string) {
  return dashboardRepository.getDashboardCounts(organisationId);
}
