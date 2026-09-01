import { WorkflowForm } from "@/components/workflows/workflow-form";

export default function NewWorkflowPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Create workflow</h1>
      <p className="text-sm text-muted-foreground">
        A custom workflow for a process this business needs that isn&rsquo;t one
        of the built-in starters. It&rsquo;s created as a draft — add a
        classifier and handler agents on the next page, then activate it.
      </p>
      <WorkflowForm />
    </div>
  );
}
