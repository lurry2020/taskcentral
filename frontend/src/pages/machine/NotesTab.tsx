import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Eye, NotebookPen, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Textarea } from "@/components/ui/Field";
import { ConfirmDialog, Dialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/State";
import { Markdown } from "@/components/ui/Markdown";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useInvalidateMachine, useNotes } from "@/lib/queries";
import type { Machine, Note } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

export function NotesTab({ machine }: { machine: Machine }) {
  const machineId = machine.id;
  const { data: notes, isLoading, isError, error, refetch } = useNotes(machineId);
  const invalidate = useInvalidateMachine();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<{ open: boolean; editing?: Note }>({ open: false });
  const [deleting, setDeleting] = useState<Note | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (note: Note) => api.delete(`/machines/${machineId}/notes/${note.id}`),
    onSuccess: () => {
      invalidate(machineId);
      toast("Note deleted.");
      setDeleting(null);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  if (isLoading) return <LoadingState label="Loading notes…" />;
  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setDialog({ open: true })}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add note
        </Button>
      </div>
      {notes && notes.length === 0 ? (
        <EmptyState
          icon={<NotebookPen />}
          title="No notes yet"
          description="Keep install quirks, config decisions, and gotchas here. Markdown is supported."
          action={
            <Button size="sm" variant="primary" onClick={() => setDialog({ open: true })}>
              Write the first note
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {notes?.map((note) => (
            <Card key={note.id}>
              <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
                <div>
                  {note.title && <h3 className="text-sm font-semibold">{note.title}</h3>}
                  <p className="text-[11px] text-faint">
                    {formatDateTime(note.created_at)}
                    {note.updated_at !== note.created_at &&
                      ` · edited ${formatDateTime(note.updated_at)}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Edit note"
                    onClick={() => setDialog({ open: true, editing: note })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete note"
                    onClick={() => setDeleting(note)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-accent-hover" />
                  </Button>
                </div>
              </div>
              <div className="px-5 py-4">
                <Markdown content={note.content} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {dialog.open && (
        <NoteDialog
          machineId={machineId}
          note={dialog.editing}
          onClose={() => setDialog({ open: false })}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title="Delete note?"
        message="This note will be permanently deleted."
        confirmLabel="Delete"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

function NoteDialog({
  machineId,
  note,
  onClose,
}: {
  machineId: number;
  note?: Note;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [preview, setPreview] = useState(false);
  const invalidate = useInvalidateMachine();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { title: title.trim() || null, content };
      return note
        ? api.put(`/machines/${machineId}/notes/${note.id}`, payload)
        : api.post(`/machines/${machineId}/notes`, payload);
    },
    onSuccess: () => {
      invalidate(machineId);
      toast(note ? "Note updated." : "Note added.");
      onClose();
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={note ? "Edit note" : "Add note"}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!content.trim()}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {note ? "Save note" : "Add note"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Title (optional)" htmlFor="note-title">
          <Input id="note-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-muted">Content (Markdown)</span>
            <Button
              size="sm"
              variant={preview ? "primary" : "ghost"}
              onClick={() => setPreview((p) => !p)}
            >
              <Eye className="h-3 w-3" aria-hidden /> Preview
            </Button>
          </div>
          {preview ? (
            <div
              className={cn(
                "min-h-40 rounded-lg border border-border bg-surface-2 px-3 py-2",
                !content.trim() && "flex items-center justify-center text-xs text-faint",
              )}
            >
              {content.trim() ? <Markdown content={content} /> : "Nothing to preview yet"}
            </div>
          ) : (
            <Textarea
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={"## Install notes\n\n- Used the Debian 12 cloud image\n- ..."}
              className="font-mono text-xs leading-relaxed"
              aria-label="Note content"
              autoFocus
            />
          )}
        </div>
      </div>
    </Dialog>
  );
}
