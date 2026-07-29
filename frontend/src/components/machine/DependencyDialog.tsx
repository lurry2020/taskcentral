import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select, Textarea } from "@/components/ui/Field";
import { useMachines, useMeta } from "@/lib/queries";
import { cn } from "@/lib/utils";

export interface DependencyDraft {
  mode: "machine" | "external";
  depends_on_machine_id: string;
  external_name: string;
  dependency_type: string;
  notes: string;
}

const empty: DependencyDraft = {
  mode: "machine",
  depends_on_machine_id: "",
  external_name: "",
  dependency_type: "Other",
  notes: "",
};

export interface DependencySubmit {
  depends_on_machine_id: number | null;
  depends_on_machine_name: string | null;
  external_name: string | null;
  dependency_type: string;
  notes: string | null;
}

export function DependencyDialog({
  open,
  onClose,
  onSubmit,
  excludeMachineId,
  initial,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: DependencySubmit) => void;
  excludeMachineId?: number;
  initial?: DependencyDraft;
  saving?: boolean;
}) {
  const [draft, setDraft] = useState<DependencyDraft>(initial ?? empty);
  const [error, setError] = useState("");
  const { data: meta } = useMeta();
  const { data: machines } = useMachines({ page: 1, page_size: 200, sort_by: "name", sort_dir: "asc" });

  useEffect(() => {
    if (open) {
      setDraft(initial ?? empty);
      setError("");
    }
  }, [open, initial]);

  const candidates = (machines?.items ?? []).filter((m) => m.id !== excludeMachineId);

  const submit = () => {
    if (draft.mode === "machine") {
      if (!draft.depends_on_machine_id) {
        setError("Select a machine");
        return;
      }
      const id = Number(draft.depends_on_machine_id);
      onSubmit({
        depends_on_machine_id: id,
        depends_on_machine_name: candidates.find((m) => m.id === id)?.name ?? null,
        external_name: null,
        dependency_type: draft.dependency_type,
        notes: draft.notes.trim() || null,
      });
    } else {
      if (!draft.external_name.trim()) {
        setError("Enter the external dependency name");
        return;
      }
      onSubmit({
        depends_on_machine_id: null,
        depends_on_machine_name: null,
        external_name: draft.external_name.trim(),
        dependency_type: draft.dependency_type,
        notes: draft.notes.trim() || null,
      });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial ? "Edit dependency" : "Add dependency"}
      description="Record something this machine depends on to function."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {initial ? "Save dependency" : "Add dependency"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2" role="radiogroup" aria-label="Dependency source">
          {(
            [
              { value: "machine", label: "Tracked machine" },
              { value: "external", label: "External dependency" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              role="radio"
              aria-checked={draft.mode === opt.value}
              onClick={() => setDraft((d) => ({ ...d, mode: opt.value }))}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-sm transition-colors",
                draft.mode === opt.value
                  ? "border-accent/60 bg-accent-soft text-accent-hover"
                  : "border-border-strong text-muted hover:bg-fill-hover",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {draft.mode === "machine" ? (
          <FormField label="Machine" htmlFor="dep-machine" error={error}>
            <Select
              id="dep-machine"
              value={draft.depends_on_machine_id}
              onChange={(e) => {
                setError("");
                setDraft((d) => ({ ...d, depends_on_machine_id: e.target.value }));
              }}
            >
              <option value="">Select a machine…</option>
              {candidates.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.machine_type})
                </option>
              ))}
            </Select>
          </FormField>
        ) : (
          <FormField
            label="External dependency"
            htmlFor="dep-external"
            error={error}
            hint="Something not tracked in Task Central, e.g. an ISP router or cloud service."
          >
            <Input
              id="dep-external"
              value={draft.external_name}
              onChange={(e) => {
                setError("");
                setDraft((d) => ({ ...d, external_name: e.target.value }));
              }}
              placeholder="e.g. Cloudflare DNS, UniFi gateway"
            />
          </FormField>
        )}

        <FormField label="Dependency type" htmlFor="dep-type">
          <Select
            id="dep-type"
            value={draft.dependency_type}
            onChange={(e) => setDraft((d) => ({ ...d, dependency_type: e.target.value }))}
          >
            {(meta?.dependency_types ?? ["Other"]).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Notes" htmlFor="dep-notes">
          <Textarea
            id="dep-notes"
            rows={2}
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          />
        </FormField>
      </div>
    </Dialog>
  );
}
