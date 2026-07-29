import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Code2, Download, Eye, FileCode2, History, RefreshCw } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/State";
import { Markdown } from "@/components/ui/Markdown";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useDocument, useDocuments, useInvalidateMachine } from "@/lib/queries";
import type { GeneratedDocument, Machine } from "@/lib/types";
import { cn, downloadText, formatDateTime } from "@/lib/utils";

export function ObsidianTab({ machine }: { machine: Machine }) {
  const machineId = machine.id;
  const documents = useDocuments(machineId);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<"source" | "preview">("source");
  const invalidate = useInvalidateMachine();
  const { toast } = useToast();

  const latestId = documents.data?.[0]?.id;
  const activeId = selectedId ?? latestId;
  const document = useDocument(machineId, activeId);

  const generateMutation = useMutation({
    mutationFn: () => api.post<GeneratedDocument>(`/machines/${machineId}/documents/generate`),
    onSuccess: (doc) => {
      invalidate(machineId);
      setSelectedId(doc.id);
      toast(`Document generated (${doc.filename}).`);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  if (documents.isLoading) return <LoadingState label="Loading documents…" />;
  if (documents.isError)
    return (
      <ErrorState
        message={(documents.error as Error)?.message}
        onRetry={() => documents.refetch()}
      />
    );

  const doc = document.data;
  const isLatest = activeId === latestId;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => generateMutation.mutate()}
            loading={generateMutation.isPending}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {documents.data?.length === 0 ? "Generate document" : "Regenerate"}
          </Button>
          {doc && (
            <>
              <CopyButton text={doc.content} label="Copy Markdown" copiedLabel="Copied!" />
              <Button size="sm" variant="outline" onClick={() => downloadText(doc.filename, doc.content)}>
                <Download className="h-3.5 w-3.5" aria-hidden /> Download .md
              </Button>
              <div className="ml-auto flex rounded-lg border border-border-strong p-0.5">
                {(
                  [
                    { key: "source", label: "Source", icon: Code2 },
                    { key: "preview", label: "Preview", icon: Eye },
                  ] as const
                ).map((v) => (
                  <button
                    key={v.key}
                    onClick={() => setView(v.key)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      view === v.key ? "bg-surface-3 text-text" : "text-muted hover:text-text",
                    )}
                    aria-pressed={view === v.key}
                  >
                    <v.icon className="h-3 w-3" aria-hidden /> {v.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {documents.data?.length === 0 && !doc ? (
          <EmptyState
            icon={<FileCode2 />}
            title="No document generated yet"
            description={`Render this ${machine.machine_type} using its Obsidian template, then copy or download the Markdown for your vault.`}
            action={
              <Button
                size="sm"
                variant="primary"
                onClick={() => generateMutation.mutate()}
                loading={generateMutation.isPending}
              >
                Generate document
              </Button>
            }
          />
        ) : doc ? (
          <Card>
            <CardHeader
              title={doc.filename}
              description={
                <>
                  Generated {formatDateTime(doc.created_at)}
                  {!isLatest && " · viewing an older version"}
                </>
              }
              actions={
                !isLatest && (
                  <Button size="sm" variant="outline" onClick={() => setSelectedId(latestId ?? null)}>
                    View latest
                  </Button>
                )
              }
            />
            <CardBody className="p-0">
              {view === "source" ? (
                <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap break-words rounded-b-xl bg-surface-2 p-4 font-mono text-xs leading-relaxed text-text">
                  {doc.content}
                </pre>
              ) : (
                <div className="max-h-[65vh] overflow-auto p-5">
                  <Markdown content={doc.content} />
                </div>
              )}
            </CardBody>
          </Card>
        ) : (
          <LoadingState label="Loading document…" />
        )}
      </div>

      <Card className="h-fit">
        <CardHeader
          title={
            <span className="flex items-center gap-1.5">
              <History className="h-4 w-4 text-muted" aria-hidden /> Versions
            </span>
          }
          description="Snapshots saved on each generation"
        />
        <CardBody className="p-0">
          {(documents.data?.length ?? 0) === 0 ? (
            <p className="px-5 py-4 text-xs text-muted">No versions yet.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {documents.data?.map((d, i) => (
                <li key={d.id}>
                  <button
                    onClick={() => setSelectedId(d.id)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors hover:bg-fill-hover",
                      activeId === d.id && "bg-surface-2",
                    )}
                    aria-current={activeId === d.id}
                  >
                    <span className="flex items-center gap-2 text-xs font-medium">
                      {formatDateTime(d.created_at)}
                      {i === 0 && (
                        <span className="rounded-full bg-ok-soft px-1.5 py-px text-[10px] text-ok">
                          latest
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[11px] text-faint">{d.filename}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
