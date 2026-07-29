import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-linear-to-b from-accent to-accent-deep text-white shadow-[0_1px_0_0_#ffffff2e_inset,0_1px_2px_0_#00000066] hover:from-accent-hover hover:to-accent focus-visible:ring-accent/50",
  secondary:
    "bg-fill text-text ring-1 ring-inset ring-line hover:bg-fill-hover focus-visible:ring-border-strong",
  outline:
    "text-text ring-1 ring-inset ring-line hover:bg-fill-hover focus-visible:ring-border-strong",
  ghost: "text-muted hover:text-text hover:bg-fill-hover focus-visible:ring-border-strong",
  danger:
    "text-accent-hover ring-1 ring-inset ring-accent/25 hover:bg-accent hover:text-white hover:ring-accent focus-visible:ring-accent/50",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-4 text-[0.8rem] gap-2",
  lg: "h-10 px-5 text-sm gap-2",
  icon: "h-8 w-8 p-0",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-bg",
        "active:translate-y-px disabled:pointer-events-none disabled:opacity-45",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
