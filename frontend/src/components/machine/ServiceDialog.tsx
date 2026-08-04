import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Checkbox, FormField, Input, Select, Textarea } from "@/components/ui/Field";
import { serviceSchema, type ServiceFormOutput } from "./schema";

export interface ServiceDraft {
  name: string;
  description: string;
  port: string;
  protocol: string;
  url: string;
  is_external: boolean;
  notes: string;
}

const empty: ServiceDraft = {
  name: "",
  description: "",
  port: "",
  protocol: "HTTP",
  url: "",
  is_external: false,
  notes: "",
};

export function toDraft(s: {
  name: string;
  description?: string | null;
  port?: number | null;
  protocol?: string | null;
  url?: string | null;
  is_external?: boolean;
  notes?: string | null;
}): ServiceDraft {
  return {
    name: s.name,
    description: s.description ?? "",
    port: s.port === null || s.port === undefined ? "" : String(s.port),
    protocol: s.protocol ?? "",
    url: s.url ?? "",
    is_external: s.is_external ?? false,
    notes: s.notes ?? "",
  };
}

export function ServiceDialog({
  open,
  onClose,
  onSubmit,
  initial,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: ServiceFormOutput) => void;
  initial?: ServiceDraft;
  saving?: boolean;
}) {
  const [draft, setDraft] = useState<ServiceDraft>(initial ?? empty);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setDraft(initial ?? empty);
      setErrors({});
    }
  }, [open, initial]);

  const set = <K extends keyof ServiceDraft>(key: K, value: ServiceDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const submit = () => {
    const parsed = serviceSchema.safeParse(draft);
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
      title={initial ? "Edit service" : "Add service"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {initial ? "Save service" : "Add service"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Service name" htmlFor="svc-name" error={errors.name} className="sm:col-span-2">
          <Input
            id="svc-name"
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Pi-hole, Jellyfin, Docker"
            autoFocus
          />
        </FormField>
        <FormField label="Port" htmlFor="svc-port" error={errors.port}>
          <Input
            id="svc-port"
            type="number"
            min={1}
            max={65535}
            value={draft.port}
            onChange={(e) => set("port", e.target.value)}
            placeholder="8080"
          />
        </FormField>
        <FormField label="Protocol" htmlFor="svc-protocol">
          <Select
            id="svc-protocol"
            value={draft.protocol}
            onChange={(e) => set("protocol", e.target.value)}
          >
            <option value="">-</option>
            {["HTTP", "HTTPS", "TCP", "UDP", "SSH", "SMB", "NFS", "Other"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="URL" htmlFor="svc-url" error={errors.url} className="sm:col-span-2">
          <Input
            id="svc-url"
            value={draft.url}
            onChange={(e) => set("url", e.target.value)}
            placeholder="http://192.168.1.10:8080"
          />
        </FormField>
        <FormField label="Description" htmlFor="svc-desc" className="sm:col-span-2">
          <Input
            id="svc-desc"
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="What this service does"
          />
        </FormField>
        <FormField label="Notes" htmlFor="svc-notes" className="sm:col-span-2">
          <Textarea
            id="svc-notes"
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
          />
        </FormField>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox
            checked={draft.is_external}
            onChange={(e) => set("is_external", e.target.checked)}
          />
          Externally accessible (exposed outside the LAN)
        </label>
      </div>
    </Dialog>
  );
}
