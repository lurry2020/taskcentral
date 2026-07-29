import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

/** Renders the current page title (and optional breadcrumb) into the sticky header. */
export function PageHeader({
  title,
  crumbs,
}: {
  title: ReactNode;
  crumbs?: { label: string; to?: string }[];
}) {
  const slot = document.getElementById("page-header-slot");
  const content = (
    <div className="flex min-w-0 items-center gap-1.5 text-sm">
      {crumbs?.map((crumb, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1.5">
          {crumb.to ? (
            <Link to={crumb.to} className="truncate text-muted transition-colors hover:text-text">
              {crumb.label}
            </Link>
          ) : (
            <span className="truncate text-muted">{crumb.label}</span>
          )}
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />
        </span>
      ))}
      <h1 className="truncate text-[0.95rem] font-semibold tracking-tight">{title}</h1>
    </div>
  );
  if (!slot) return null;
  return createPortal(content, slot);
}
