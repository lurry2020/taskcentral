import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

// breaks: true matches Obsidian's default rendering, where a single newline
// is a real line break (e.g. the field lines in generated machine documents).
marked.setOptions({ gfm: true, breaks: true });

export function Markdown({ content, className }: { content: string; className?: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  }, [content]);
  return <div className={cn("md-prose", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
