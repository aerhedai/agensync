import { createAgentAction } from "@/app/agents/actions";
import { AgentForm } from "@/components/agents/agent-form";

export default function NewAgentPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Create agent</h1>
      <AgentForm action={createAgentAction} submitLabel="Create agent" />
    </div>
  );
}
