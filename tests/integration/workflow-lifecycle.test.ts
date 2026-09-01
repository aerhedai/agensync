import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import * as workflowService from "@/lib/workflows/workflow-service";

describe("workflow lifecycle", () => {
  const organisationId = "test-org-workflow-lifecycle";
  let classifierId: string;
  let handlerId: string;

  beforeEach(async () => {
    await prisma.workflowAgent.deleteMany({
      where: { workflow: { organisationId } },
    });
    await prisma.workflow.deleteMany({ where: { organisationId } });
    await prisma.agent.deleteMany({ where: { organisationId } });
    await prisma.organisation.deleteMany({ where: { id: organisationId } });

    await prisma.organisation.create({
      data: {
        id: organisationId,
        clerkOrgId: organisationId,
        name: "Lifecycle Org",
      },
    });
    const classifier = await prisma.agent.create({
      data: {
        organisationId,
        name: "Classifier",
        description: "d",
        instructions: "i",
        model: "test-model",
        status: "ACTIVE",
      },
    });
    classifierId = classifier.id;
    const handler = await prisma.agent.create({
      data: {
        organisationId,
        name: "Handler",
        description: "d",
        instructions: "i",
        model: "test-model",
        status: "ACTIVE",
        executionMode: "HARNESS",
        pipelineKey: "acknowledge_reply",
      },
    });
    handlerId = handler.id;
  });

  afterAll(async () => {
    await prisma.workflowAgent.deleteMany({
      where: { workflow: { organisationId } },
    });
    await prisma.workflow.deleteMany({ where: { organisationId } });
    await prisma.agent.deleteMany({ where: { organisationId } });
    await prisma.organisation.deleteMany({ where: { id: organisationId } });
    await prisma.$disconnect();
  });

  it("creates new workflows as CUSTOM and DRAFT, never live on creation", async () => {
    const workflow = await workflowService.createWorkflow(organisationId, {
      name: "Invoice Processing",
      description: "Handles inbound invoices.",
      trigger: "EMAIL",
    });

    expect(workflow).toMatchObject({
      source: "CUSTOM",
      status: "DRAFT",
      templateKey: null,
    });
  });

  it("refuses to activate a workflow with no classifier or handler", async () => {
    const workflow = await prisma.workflow.create({
      data: {
        organisationId,
        name: "Empty",
        description: "d",
        trigger: "EMAIL",
        source: "CUSTOM",
        status: "DRAFT",
      },
    });

    await expect(
      workflowService.activateWorkflow(organisationId, workflow.id),
    ).rejects.toThrow(/classifier and at least one handler/);
  });

  it("activates a fully-configured workflow and deactivates whatever else held that trigger", async () => {
    const alreadyActive = await prisma.workflow.create({
      data: {
        organisationId,
        name: "Email Handling",
        description: "d",
        trigger: "EMAIL",
        source: "TEMPLATE",
        templateKey: "email_handling",
        status: "ACTIVE",
      },
    });

    const custom = await prisma.workflow.create({
      data: {
        organisationId,
        name: "Custom Email Flow",
        description: "d",
        trigger: "EMAIL",
        source: "CUSTOM",
        status: "DRAFT",
      },
    });
    await prisma.workflowAgent.createMany({
      data: [
        { workflowId: custom.id, agentId: classifierId, role: "CLASSIFIER" },
        { workflowId: custom.id, agentId: handlerId, role: "HANDLER" },
      ],
    });

    await workflowService.activateWorkflow(organisationId, custom.id);

    const refreshedCustom = await prisma.workflow.findUniqueOrThrow({
      where: { id: custom.id },
    });
    const refreshedOld = await prisma.workflow.findUniqueOrThrow({
      where: { id: alreadyActive.id },
    });
    expect(refreshedCustom.status).toBe("ACTIVE");
    expect(refreshedOld.status).toBe("DRAFT");
  });

  it("deactivates a workflow back to draft", async () => {
    const workflow = await prisma.workflow.create({
      data: {
        organisationId,
        name: "Live One",
        description: "d",
        trigger: "EMAIL",
        source: "CUSTOM",
        status: "ACTIVE",
      },
    });

    await workflowService.deactivateWorkflow(organisationId, workflow.id);

    const refreshed = await prisma.workflow.findUniqueOrThrow({
      where: { id: workflow.id },
    });
    expect(refreshed.status).toBe("DRAFT");
  });
});
