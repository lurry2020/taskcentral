import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldBase, Input } from "./Field";

/**
 * A searchable dropdown for the (400+) IANA timezone list. Unlike a native
 * <select>, it always opens downward - positioned in a body portal relative to
 * the trigger, capped to the viewport with internal scroll.
 */
export function TimezoneSelect({
  id,
  value,
  onChange,
  zones,
}: {
  id?: string;
  value: string;
  onChange: (tz: string) => void;
  zones: string[];
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setAnchor(null);
  };

  // The fixed menu would drift from its anchor on page scroll/resize, so close it
  // then - but NOT when scrolling happens inside the menu's own list.
  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return zones;
    return zones.filter((z) => z.toLowerCase().includes(q));
  }, [zones, query]);

  const label = (tz: string) => tz.replace(/_/g, " ");

  const toggle = () => {
    if (open) {
      close();
    } else {
      setQuery("");
      setAnchor(triggerRef.current?.getBoundingClientRect() ?? null);
      setOpen(true);
    }
  };

  const pick = (tz: string) => {
    onChange(tz);
    close();
  };

  const menuStyle: CSSProperties | undefined = anchor
    ? {
        top: anchor.bottom + 4,
        left: anchor.left,
        width: anchor.width,
        maxHeight: Math.min(320, window.innerHeight - anchor.bottom - 16),
      }
    : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        className={cn(fieldBase, "relative flex h-9 items-center pr-8 text-left")}
      >
        <span className="min-w-0 flex-1 truncate">{label(value)}</span>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 h-4 w-4 text-faint"
          aria-hidden
        />
      </button>

      {open &&
        anchor &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={close} aria-hidden />
            <div
              ref={menuRef}
              role="listbox"
              className="fixed z-50 flex flex-col overflow-hidden rounded-lg bg-surface-2 shadow-(--shadow-pop) ring-1 ring-inset ring-line"
              style={menuStyle}
            >
              <div className="border-b border-border p-1.5">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
                    aria-hidden
                  />
                  <Input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && filtered.length > 0) {
                        e.preventDefault();
                        pick(filtered[0]);
                      }
                    }}
                    placeholder="Search timezones…"
                    className="h-8 pl-8"
                    aria-label="Search timezones"
                  />
                </div>
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
                {filtered.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-faint">No timezones match.</li>
                ) : (
                  filtered.map((tz) => (
                    <li key={tz}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={tz === value}
                        onClick={() => pick(tz)}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-fill-hover",
                          tz === value ? "text-text" : "text-muted",
                        )}
                      >
                        <Check
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            tz === value ? "text-accent" : "opacity-0",
                          )}
                          aria-hidden
                        />
                        <span className="truncate">{label(tz)}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
