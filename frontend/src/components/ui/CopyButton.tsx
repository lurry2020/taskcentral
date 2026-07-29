import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyToClipboard } from "@/lib/utils";
import { Button, type ButtonProps } from "./Button";

export function CopyButton({
  text,
  label,
  copiedLabel = "Copied",
  size = "sm",
  variant = "outline",
  ...props
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
} & Omit<ButtonProps, "onClick" | "children">) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size={size}
      variant={variant}
      aria-label={label ? undefined : "Copy to clipboard"}
      onClick={async () => {
        if (await copyToClipboard(text)) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        }
      }}
      {...props}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-ok" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
      {label && (copied ? copiedLabel : label)}
    </Button>
  );
}
