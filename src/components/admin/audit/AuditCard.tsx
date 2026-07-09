import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, AlertTriangle, XCircle, LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type AuditStatus = "ok" | "warn" | "bad" | "info";

interface Props {
  title: string;
  metric: ReactNode;
  hint?: ReactNode;
  status?: AuditStatus;
  icon?: LucideIcon;
  to?: string;
  ctaLabel?: string;
}

const statusStyles: Record<AuditStatus, { badge: string; icon: LucideIcon; label: string }> = {
  ok: { badge: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2, label: "OK" },
  warn: { badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: AlertTriangle, label: "Attention" },
  bad: { badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: XCircle, label: "Missing" },
  info: { badge: "bg-muted text-muted-foreground", icon: CheckCircle2, label: "Info" },
};

export default function AuditCard({ title, metric, hint, status = "info", icon: Icon, to, ctaLabel = "View report" }: Props) {
  const s = statusStyles[status];
  const StatusIcon = s.icon;
  return (
    <Card className="hover:shadow-md transition-shadow h-full">
      <CardContent className="p-4 sm:p-5 flex flex-col h-full gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {Icon && <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
            <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
          </div>
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 flex-shrink-0", s.badge)}>
            <StatusIcon className="w-3 h-3" />
            {s.label}
          </span>
        </div>
        <div className="text-2xl font-bold leading-tight break-words">{metric}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        {to && (
          <Link to={to} className="mt-auto text-xs font-medium text-primary inline-flex items-center gap-1 hover:underline">
            {ctaLabel} <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
