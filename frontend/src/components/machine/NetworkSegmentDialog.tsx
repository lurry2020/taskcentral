import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Textarea } from "@/components/ui/Field";
import { networkSegmentSchema, type NetworkSegmentFormOutput } from "./schema";

export interface NetworkSegmentDraft {
  name: string;
  vlan_id: string;
  subnet: string;
  purpose: string;
  notes: string;
}

const empty: NetworkSegmentDraft = { name: "", vlan_id: "", subnet: "", purpose: "", notes: "" };

export function toSegmentDraft(s: {
  name: string;
  vlan_id?: number | null;
  subnet?: string | null;
  purpose?: string | null;
  notes?: string | null;
}): NetworkSegmentDraft {
  return {
    name: s.name,
    vlan_id: s.vlan_id === null || s.vlan_id === undefined ? "" : String(s.vlan_id),
    subnet: s.subnet ?? "",
    purpose: s.purpose ?? "",
    notes: s.notes ?? "",
  };
}

export function NetworkSegmentDialog({
  open,
  onClose,
  onSubmit,
  initial,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: NetworkSegmentFormOutput) => void;
  initial?: NetworkSegmentDraft;
  saving?: boolean;
}) {
  const [draft, setDraft] = useState<NetworkSegmentDraft>(initial ?? empty);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setDraft(initial ?? empty);
      setErrors({});
    }
  }, [open, initial]);

  const set = <K extends keyof NetworkSegmentDraft>(key: K, value: NetworkSegmentDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const submit = () => {
    const parsed = networkSegmentSchema.safeParse(draft);
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
      title={initial ? "Edit segment" : "Add network segment"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {initial ? "Save segment" : "Add segment"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Network name" htmlFor="ns-name" error={errors.name}>
          <Input
            id="ns-name"
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Main, IoT, Guest"
            autoFocus
          />
        </FormField>
        <FormField label="VLAN ID" htmlFor="ns-vlan" error={errors.vlan_id}>
          <Input
            id="ns-vlan"
            type="number"
            min={1}
            max={4094}
            value={draft.vlan_id}
            onChange={(e) => set("vlan_id", e.target.value)}
            placeholder="1"
          />
        </FormField>
        <FormField label="Subnet" htmlFor="ns-subnet" className="sm:col-span-2">
          <Input
            id="ns-subnet"
            value={draft.subnet}
            onChange={(e) => set("subnet", e.target.value)}
            placeholder="192.168.1.0/24"
            className="font-mono"
          />
        </FormField>
        <FormField label="Purpose" htmlFor="ns-purpose" className="sm:col-span-2">
          <Input
            id="ns-purpose"
            value={draft.purpose}
            onChange={(e) => set("purpose", e.target.value)}
            placeholder="Trusted devices & homelab"
          />
        </FormField>
        <FormField label="Notes" htmlFor="ns-notes" className="sm:col-span-2">
          <Textarea
            id="ns-notes"
            rows={2}
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </FormField>
      </div>
    </Dialog>
  );
}
