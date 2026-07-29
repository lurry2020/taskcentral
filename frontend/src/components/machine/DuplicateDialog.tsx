import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Machine } from "@/lib/types";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Checkbox, FormField, Input, Label } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";

export function DuplicateDialog({
  open,
  onClose,
  machineId,
  machineName,
}: {
  open: boolean;
  onClose: () => void;
  machineId: number;
  machineName: string;
}) {
  const [name, setName] = useState(`${machineName}-copy`);
  const [copyServices, setCopyServices] = useState(true);
  const [copyDependencies, setCopyDependencies] = useState(true);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () =>
      api.post<Machine>(`/machines/${machineId}/duplicate`, {
        name: name.trim(),
        copy_services: copyServices,
        copy_dependencies: copyDependencies,
      }),
    onSuccess: (machine) => {
      qc.invalidateQueries({ queryKey: ["machines"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast(`Machine "${machine.name}" created from "${machineName}".`);
      onClose();
      navigate(`/inventory/${machine.id}`);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Duplicate "${machineName}"`}
      description="A fresh checklist is generated from current task templates. IP, MAC, DNS record, and VMID are cleared."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => mutation.mutate()}
            disabled={!name.trim()}
            loading={mutation.isPending}
          >
            Duplicate
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="New machine name" htmlFor="dup-name">
          <Input
            id="dup-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </FormField>
        <div className="space-y-2">
          <Label>Copy options</Label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={copyServices}
              onChange={(e) => setCopyServices(e.target.checked)}
            />
            Copy services
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={copyDependencies}
              onChange={(e) => setCopyDependencies(e.target.checked)}
            />
            Copy dependencies
          </label>
        </div>
      </div>
    </Dialog>
  );
}
