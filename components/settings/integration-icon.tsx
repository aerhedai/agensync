import {
  CalendarClock,
  FolderOpen,
  HardDrive,
  Inbox,
  Mail,
  MessageSquare,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

// No real logo assets exist for any of these (no public/ directory in this
// repo, and copying third-party trademarked logo files in isn't something
// to do without the business's own brand agreements) — a colored icon
// tile is the pragmatic stand-in: enough to visually distinguish cards at
// a glance, paired with the label text for actual identification.
const ICONS: Record<string, { Icon: LucideIcon; className: string }> = {
  gmail: {
    Icon: Mail,
    className: "bg-red-500/15 text-red-600 dark:text-red-400",
  },
  slack: {
    Icon: MessageSquare,
    className: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
  },
  outlook: {
    Icon: Inbox,
    className: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  },
  teams: {
    Icon: Users,
    className: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  },
  "outlook-calendar": {
    Icon: CalendarClock,
    className: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  webhook: {
    Icon: Webhook,
    className: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  },
  "google-drive": {
    Icon: HardDrive,
    className: "bg-green-500/15 text-green-600 dark:text-green-400",
  },
  sharepoint: {
    Icon: FolderOpen,
    className: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  },
};

export function IntegrationIcon({ provider }: { provider: string }) {
  const { Icon, className } = ICONS[provider] ?? {
    Icon: Webhook,
    className: "bg-muted text-muted-foreground",
  };

  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg",
        className,
      )}
    >
      <Icon className="size-5" />
    </div>
  );
}
