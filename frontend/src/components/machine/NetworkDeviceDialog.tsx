import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select, Textarea } from "@/components/ui/Field";
import { networkDeviceSchema, type NetworkDeviceFormOutput } from "./schema";

export const DEVICE_ROLES = [
  "Router",
  "Switch",
  "Access Point",
  "Firewall",
  "Gateway",
  "ONT / Modem",
  "Other",
];

export interface NetworkDeviceDraft {
  name: string;
  role: string;
  ip_address: string;
  notes: string;
}

const empty: NetworkDeviceDraft = { name: "", role: "Switch", ip_address: "", notes: "" };

export function toDeviceDraft(d: {
  name: string;
  role?: string;
  ip_address?: string | null;
  notes?: string | null;
}): NetworkDeviceDraft {
  return {
    name: d.name,
    role: d.role ?? "Switch",
    ip_address: d.ip_address ?? "",
    notes: d.notes ?? "",
  };
}

export function NetworkDeviceDialog({
  open,
  onClose,
  onSubmit,
  initial,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: NetworkDeviceFormOutput) => void;
  initial?: NetworkDeviceDraft;
  saving?: boolean;
}) {
  const [draft, setDraft] = useState<NetworkDeviceDraft>(initial ?? empty);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setDraft(initial ?? empty);
      setErrors({});
    }
  }, [open, initial]);

  const set = <K extends keyof NetworkDeviceDraft>(key: K, value: NetworkDeviceDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const submit = () => {
    const parsed = networkDeviceSchema.safeParse(draft);
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
      title={initial ? "Edit device" : "Add network device"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {initial ? "Save device" : "Add device"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Device name" htmlFor="nd-name" error={errors.name}>
          <Input
            id="nd-name"
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. USW Flex Mini"
            autoFocus
          />
        </FormField>
        <FormField label="Role" htmlFor="nd-role">
          <Select id="nd-role" value={draft.role} onChange={(e) => set("role", e.target.value)}>
            {DEVICE_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          label="Management IP"
          htmlFor="nd-ip"
          error={errors.ip_address}
          className="sm:col-span-2"
        >
          <Input
            id="nd-ip"
            value={draft.ip_address}
            onChange={(e) => set("ip_address", e.target.value)}
            placeholder="192.168.1.115"
            className="font-mono"
          />
        </FormField>
        <FormField label="Notes" htmlFor="nd-notes" className="sm:col-span-2">
          <Textarea
            id="nd-notes"
            rows={2}
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </FormField>
      </div>
    </Dialog>
  );
}
