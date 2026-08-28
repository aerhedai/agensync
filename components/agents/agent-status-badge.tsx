import { Badge } from "@/components/ui/badge";
import type { AgentStatus } from "@/lib/generated/prisma/client";

const STYLES: Record<AgentStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  ACTIVE: "bg-success/15 text-success border-transparent",
  ARCHIVED: "bg-muted text-muted-foreground",
};

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  return (
    <Badge variant="outline" className={STYLES[status]}>
      {status}
    </Badge>
  );
}
