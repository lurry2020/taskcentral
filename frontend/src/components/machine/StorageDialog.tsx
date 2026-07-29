import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Textarea } from "@/components/ui/Field";
import { storageSchema, type StorageFormOutput } from "./schema";

export interface StorageDraft {
  name: string;
  capacity: string;
  purpose: string;
  notes: string;
}

const empty: StorageDraft = { name: "", capacity: "", purpose: "", notes: "" };

export function toStorageDraft(s: {
  name: string;
  capacity?: string | null;
  purpose?: string | null;
  notes?: string | null;
}): StorageDraft {
  return {
    name: s.name,
    capacity: s.capacity ?? "",
    purpose: s.purpose ?? "",
    notes: s.notes ?? "",
  };
}

export function StorageDialog({
  open,
  onClose,
  onSubmit,
  initial,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: StorageFormOutput) => void;
  initial?: StorageDraft;
  saving?: boolean;
}) {
  const [draft, setDraft] = useState<StorageDraft>(initial ?? empty);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setDraft(initial ?? empty);
      setErrors({});
    }
  }, [open, initial]);

  const set = <K extends keyof StorageDraft>(key: K, value: StorageDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const submit = () => {
    const parsed = storageSchema.safeParse(draft);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        errs[String(issue.path[0])] = issue.message;
      });
      setErrors(errs);
      return;
    }
    onSubmit(parsed.data);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial ? "Edit drive" : "Add drive"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {initial ? "Save drive" : "Add drive"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Drive" htmlFor="st-name" error={errors.name}>
          <Input
            id="st-name"
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. nvme0n1, sda, Pool: tank"
            autoFocus
          />
        </FormField>
        <FormField label="Capacity" htmlFor="st-capacity">
          <Input
            id="st-capacity"
            value={draft.capacity}
            onChange={(e) => set("capacity", e.target.value)}
            placeholder="e.g. 1 TB, 2×4 TB"
          />
        </FormField>
        <FormField label="Purpose" htmlFor="st-purpose" className="sm:col-span-2">
          <Input
            id="st-purpose"
            value={draft.purpose}
            onChange={(e) => set("purpose", e.target.value)}
            placeholder="e.g. Boot / VM disks, Backups, ZFS mirror"
          />
        </FormField>
        <FormField label="Notes" htmlFor="st-notes" className="sm:col-span-2">
          <Textarea
            id="st-notes"
            rows={2}
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </FormField>
      </div>
    </Dialog>
  );
}
