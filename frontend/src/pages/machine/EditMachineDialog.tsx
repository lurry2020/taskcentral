import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  machineSchema,
  type MachineFormValues,
} from "@/components/machine/schema";
import { IdentityFields, HardwareFields } from "@/components/machine/MachineFields";
import { api } from "@/lib/api";
import { useInvalidateMachine } from "@/lib/queries";
import type { Machine } from "@/lib/types";

function toFormValues(m: Machine): MachineFormValues {
  return {
    name: m.name,
    machine_type: m.machine_type,
    status: m.status,
    host: m.host ?? "",
    vmid: m.vmid === null ? "" : String(m.vmid),
    ip_address: m.ip_address ?? "",
    mac_address: m.mac_address ?? "",
    dns_record: m.dns_record ?? "",
    operating_system: m.operating_system ?? "",
    operating_system_version: m.operating_system_version ?? "",
    hypervisor: m.hypervisor ?? "",
    architecture: m.architecture ?? "",
    purpose: m.purpose ?? "",
    responsibilities: m.responsibilities ?? "",
    isp: m.isp ?? "",
    connection_type: m.connection_type ?? "",
    download_speed: m.download_speed ?? "",
    upload_speed: m.upload_speed ?? "",
    wan_type: m.wan_type ?? "",
    location: m.location ?? "",
    owner: m.owner ?? "",
    deployment_date: m.deployment_date ?? "",
    cpu: m.cpu ?? "",
    cpu_cores: m.cpu_cores === null ? "" : String(m.cpu_cores),
    memory_value: m.memory_value === null ? "" : String(m.memory_value),
    memory_unit: m.memory_unit ?? "GB",
    disk_value: m.disk_value === null ? "" : String(m.disk_value),
    disk_unit: m.disk_unit ?? "GB",
    storage_location: m.storage_location ?? "",
    gpu: m.gpu ?? "",
    network_interface: m.network_interface ?? "",
    hardware_model: m.hardware_model ?? "",
    serial_number: m.serial_number ?? "",
    asset_tag: m.asset_tag ?? "",
    tags: m.tags,
  };
}

export function EditMachineDialog({
  machine,
  open,
  onClose,
}: {
  machine: Machine;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const invalidate = useInvalidateMachine();

  const form = useForm<MachineFormValues>({
    resolver: zodResolver(machineSchema),
    defaultValues: toFormValues(machine),
    mode: "onBlur",
  });

  const mutation = useMutation({
    mutationFn: (values: MachineFormValues) =>
      api.put<Machine>(`/machines/${machine.id}`, machineSchema.parse(values)),
    onSuccess: (updated) => {
      invalidate(machine.id);
      if (updated.warnings.length > 0) {
        updated.warnings.forEach((w) => toast(w, "info"));
      }
      toast(`"${updated.name}" saved.`);
      onClose();
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Edit ${machine.name}`}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={form.handleSubmit((v) => mutation.mutate(v))}
            loading={mutation.isPending}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">
            Identity & network
          </h3>
          <IdentityFields form={form} />
        </section>
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">
            Hardware resources
          </h3>
          <HardwareFields form={form} />
        </section>
      </div>
    </Dialog>
  );
}
