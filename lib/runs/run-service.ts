import * as runRepository from "@/lib/runs/run-repository";

export function getRun(organisationId: string, runId: string) {
  return runRepository.findRunById(organisationId, runId);
}

export function listRunsForAgent(organisationId: string, agentId: string) {
  return runRepository.findRunsByAgent(organisationId, agentId);
}
