import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  Container,
  HardDrive,
  Link2,
  Pencil,
  Plus,
  Router,
  Server,
  ServerCog,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/State";
import { useToast } from "@/components/ui/Toast";
import {
  emptyMachineValues,
  machineSchema,
  type MachineFormValues,
  type ServiceFormOutput,
  type StorageFormOutput,
} from "@/components/machine/schema";
import { IdentityFields, HardwareFields } from "@/components/machine/MachineFields";
import { ServiceDialog, toDraft } from "@/components/machine/ServiceDialog";
import { StorageDialog, toStorageDraft } from "@/components/machine/StorageDialog";
import {
  DependencyDialog,
  type DependencySubmit,
} from "@/components/machine/DependencyDialog";
import { api } from "@/lib/api";
import { useSettings } from "@/lib/queries";
import type { Machine, MachineType, TaskTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Machine Type", short: "Type" },
  { label: "Identity & Network", short: "Identity" },
  { label: "Hardware", short: "Hardware" },
  { label: "Services & Dependencies", short: "Services" },
  { label: "Checklist", short: "Checklist" },
  { label: "Review", short: "Review" },
] as const;

const typeOptions: {
  value: MachineType;
  label: string;
  description: string;
  icon: typeof Server;
}[] = [
  {
    value: "VM",
    label: "Virtual Machine",
    description: "A Proxmox (or other hypervisor) virtual machine with its own kernel.",
    icon: Box,
  },
  {
    value: "LXC",
    label: "LXC Container",
    description: "A lightweight Proxmox container sharing the host kernel.",
    icon: Container,
  },
  {
    value: "PHYSICAL",
    label: "Physical Machine",
    description: "Raspberry Pi, mini PC, NAS, bare-metal server, or network appliance.",
    icon: HardDrive,
  },
  {
    value: "HOST",
    label: "Host",
    description: "A hypervisor host that runs VMs or containers - Proxmox, ESXi, or bare-metal host.",
    icon: ServerCog,
  },
  {
    value: "NETWORK",
    label: "Network",
    description: "Your router / network - equipment, VLANs, and internet connection (e.g. UniFi UDR7).",
    icon: Router,
  },
];

interface WizardService extends ServiceFormOutput {
  _localId: number;
}

interface WizardStorage extends StorageFormOutput {
  _localId: number;
}

interface WizardDependency extends DependencySubmit {
  _localId: number;
}

const STEP_FIELDS: Record<number, (keyof MachineFormValues)[]> = {
  1: ["name", "host", "vmid", "status", "ip_address", "mac_address", "dns_record"],
  2: ["cpu_cores", "memory_value", "disk_value"],
};

export function NewMachine() {
  const [step, setStep] = useState(0);
  const [services, setServices] = useState<WizardService[]>([]);
  const [storage, setStorage] = useState<WizardStorage[]>([]);
  const [dependencies, setDependencies] = useState<WizardDependency[]>([]);
  const [generateChecklist, setGenerateChecklist] = useState(true);
  const [serviceDialog, setServiceDialog] = useState<{ open: boolean; editing?: WizardService }>({
    open: false,
  });
  const [storageDialog, setStorageDialog] = useState<{ open: boolean; editing?: WizardStorage }>({
    open: false,
  });
  const [dependencyDialog, setDependencyDialog] = useState(false);
  const [localId, setLocalId] = useState(1);

  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: settings } = useSettings();

  const form = useForm<MachineFormValues>({
    resolver: zodResolver(machineSchema),
    defaultValues: emptyMachineValues(settings?.default_machine_status ?? "In Progress"),
    mode: "onBlur",
  });

  useEffect(() => {
    if (settings && !form.formState.isDirty) {
      form.setValue("status", settings.default_machine_status as MachineFormValues["status"]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const machineType = form.watch("machine_type");
  const isHost = machineType === "HOST";
  const isNetwork = machineType === "NETWORK";
  const name = form.watch("name");
  const values = form.watch();

  const { data: templates } = useQuery({
    queryKey: ["task-templates", machineType],
    queryFn: () => api.get<TaskTemplate[]>(`/task-templates?scope=${machineType}`),
  });
  // Network machines get only NETWORK-scoped tasks (not the server-centric ALL set).
  const applicableTemplates = (templates ?? []).filter(
    (t) => t.enabled && (isNetwork ? t.machine_type_scope === "NETWORK" : true),
  );

  const validateQuery = useQuery({
    queryKey: ["validate", name, values.ip_address, values.dns_record, values.vmid, values.host],
    queryFn: () => {
      const params = new URLSearchParams();
      if (name) params.set("name", name);
      if (values.ip_address) params.set("ip_address", String(values.ip_address));
      if (values.dns_record) params.set("dns_record", String(values.dns_record));
      if (values.vmid) params.set("vmid", String(values.vmid));
      if (values.host) params.set("host", String(values.host));
      return api.get<{ warnings: string[] }>(`/machines/validate?${params.toString()}`);
    },
    enabled: step === 5,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const parsed = machineSchema.parse(form.getValues());
      return api.post<Machine>("/machines", {
        ...parsed,
        services: isHost || isNetwork ? [] : services.map(({ _localId, ...s }) => s),
        storage: isHost ? storage.map(({ _localId, ...s }) => s) : [],
        dependencies: dependencies.map((d) => ({
          depends_on_machine_id: d.depends_on_machine_id,
          external_name: d.external_name,
          dependency_type: d.dependency_type,
          notes: d.notes,
        })),
        generate_checklist: generateChecklist,
      });
    },
    onSuccess: (machine) => {
      qc.invalidateQueries({ queryKey: ["machines"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast(`Machine "${machine.name}" created with ${machine.progress.total_tasks} checklist tasks.`);
      navigate(`/inventory/${machine.id}`);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const next = async () => {
    const fields = STEP_FIELDS[step];
    if (fields) {
      const ok = await form.trigger(fields);
      if (!ok) return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const summaryRows: [string, string][] = useMemo(() => {
    const v = values;
    const rows: [string, string | null | undefined][] = [
      ["Type", typeOptions.find((t) => t.value === v.machine_type)?.label],
      ["Name", v.name],
      ["Host", v.host as string],
      ...(machineType === "VM" || machineType === "LXC"
        ? [["VMID", v.vmid ? String(v.vmid) : ""] as [string, string]]
        : []),
      ["IP address", v.ip_address as string],
      ["DNS record", v.dns_record as string],
      ["OS", [v.operating_system, v.operating_system_version].filter(Boolean).join(" ")],
      ["Status", v.status],
      ["CPU cores", v.cpu_cores ? String(v.cpu_cores) : ""],
      ["Memory", v.memory_value ? `${v.memory_value} ${v.memory_unit}` : ""],
      ["Disk", v.disk_value ? `${v.disk_value} ${v.disk_unit}` : ""],
      ["Tags", (v.tags ?? []).map((t) => `#${t}`).join(" ")],
    ];
    return rows.filter(([, val]) => val).map(([k, val]) => [k, val as string]);
  }, [values, machineType]);

  return (
    <>
      <PageHeader title="New Machine" crumbs={[{ label: "Inventory", to: "/inventory" }]} />
      <div className="mx-auto max-w-3xl space-y-5">
        {/* Stepper */}
        <ol className="flex flex-wrap items-center justify-center gap-x-1 gap-y-2" aria-label="Wizard progress">
          {STEPS.map((s, i) => (
            <li key={s.label} className="flex items-center gap-1">
              <button
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  i === step
                    ? "bg-accent-soft text-accent-hover"
                    : i < step
                      ? "text-ok hover:bg-fill-hover"
                      : "text-faint",
                )}
              >
                <span
                  className={cn(
                    "flex h-4.5 w-4.5 items-center justify-center rounded-full border text-[10px]",
                    i === step
                      ? "border-accent text-accent-hover"
                      : i < step
                        ? "border-ok bg-ok-soft text-ok"
                        : "border-border-strong",
                  )}
                >
                  {i < step ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{s.short}</span>
              </button>
              {i < STEPS.length - 1 && <span className="px-0.5 text-faint" aria-hidden>-</span>}
            </li>
          ))}
        </ol>

        <Card>
          <CardHeader
            title={STEPS[step].label}
            description={
              [
                "What kind of machine are you provisioning?",
                "Identity, addressing, and organization.",
                "Resource allocation and hardware details.",
                "What runs on it, and what it needs to function.",
                "The setup checklist generated for this machine.",
                "Double-check everything before creating the record.",
              ][step]
            }
          />
          <CardBody>
            {step === 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {typeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => form.setValue("machine_type", opt.value, { shouldDirty: true })}
                    className={cn(
                      "flex flex-col items-start gap-2.5 rounded-xl border p-4 text-left transition-all",
                      machineType === opt.value
                        ? "border-accent/60 bg-accent-soft shadow-sm"
                        : "border-border-strong hover:border-border-strong hover:bg-fill-hover",
                    )}
                    aria-pressed={machineType === opt.value}
                  >
                    <opt.icon
                      className={cn(
                        "h-6 w-6",
                        machineType === opt.value ? "text-accent-hover" : "text-muted",
                      )}
                      aria-hidden
                    />
                    <div>
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted">{opt.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {step === 1 && <IdentityFields form={form} />}
            {step === 2 && <HardwareFields form={form} />}

            {step === 3 && (
              <div className="space-y-6">
                {isNetwork && (
                  <p className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-xs text-muted">
                    Add your switches, access points, and VLANs from the Equipment and Segments
                    tabs once the network is created.
                  </p>
                )}
                {!isHost && !isNetwork && (
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-medium">Services running</h3>
                    <Button size="sm" onClick={() => setServiceDialog({ open: true })}>
                      <Plus className="h-3.5 w-3.5" aria-hidden /> Add service
                    </Button>
                  </div>
                  {services.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border-strong px-4 py-5 text-center text-xs text-muted">
                      No services yet. You can also add them later from the machine page.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {services.map((s) => (
                        <li key={s._localId} className="flex items-center gap-3 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{s.name}</p>
                            <p className="truncate font-mono text-xs text-faint">
                              {[s.port && `:${s.port}`, s.protocol, s.url].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${s.name}`}
                            onClick={() => setServiceDialog({ open: true, editing: s })}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${s.name}`}
                            onClick={() =>
                              setServices((prev) => prev.filter((x) => x._localId !== s._localId))
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5 text-accent-hover" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                )}

                {isHost && (
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-medium">Storage</h3>
                    <Button size="sm" onClick={() => setStorageDialog({ open: true })}>
                      <Plus className="h-3.5 w-3.5" aria-hidden /> Add drive
                    </Button>
                  </div>
                  {storage.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border-strong px-4 py-5 text-center text-xs text-muted">
                      No drives yet. Add the disks this host has, or do it later from the Storage tab.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {storage.map((s) => (
                        <li key={s._localId} className="flex items-center gap-3 px-3 py-2.5">
                          <HardDrive className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-sm font-medium">{s.name}</p>
                            <p className="truncate text-xs text-faint">
                              {[s.capacity, s.purpose].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${s.name}`}
                            onClick={() => setStorageDialog({ open: true, editing: s })}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${s.name}`}
                            onClick={() =>
                              setStorage((prev) => prev.filter((x) => x._localId !== s._localId))
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5 text-accent-hover" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                )}

                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-medium">This machine depends on</h3>
                    <Button size="sm" onClick={() => setDependencyDialog(true)}>
                      <Plus className="h-3.5 w-3.5" aria-hidden /> Add dependency
                    </Button>
                  </div>
                  {dependencies.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border-strong px-4 py-5 text-center text-xs text-muted">
                      No dependencies recorded.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {dependencies.map((d) => (
                        <li key={d._localId} className="flex items-center gap-3 px-3 py-2.5">
                          <Link2 className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">
                              {d.depends_on_machine_name ?? d.external_name}
                              {d.external_name && (
                                <span className="ml-2 text-xs text-faint">(external)</span>
                              )}
                            </p>
                            <p className="text-xs text-muted">{d.dependency_type}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Remove dependency"
                            onClick={() =>
                              setDependencies((prev) =>
                                prev.filter((x) => x._localId !== d._localId),
                              )
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5 text-accent-hover" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <label className="flex items-center gap-2.5 text-sm">
                  <Checkbox
                    checked={generateChecklist}
                    onChange={(e) => setGenerateChecklist(e.target.checked)}
                  />
                  Generate the setup checklist from task templates
                </label>
                {generateChecklist ? (
                  applicableTemplates.length > 0 ? (
                    <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                      {applicableTemplates.map((t) => (
                        <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                          <Badge className="border-border bg-surface-2 text-faint">{t.category}</Badge>
                          {!t.required && (
                            <span className="text-[11px] text-faint">optional</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      title="No enabled task templates apply to this machine type"
                      description="Add templates under Task Templates, or continue without a checklist."
                    />
                  )
                ) : (
                  <p className="text-xs text-muted">
                    The machine will be created without tasks. You can apply default tasks later
                    from the checklist tab.
                  </p>
                )}
                {generateChecklist && (
                  <p className="text-xs text-faint">
                    {applicableTemplates.length} task(s) will be generated. The copies are
                    independent - editing templates later never changes this machine's checklist.
                  </p>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                {(validateQuery.data?.warnings.length ?? 0) > 0 && (
                  <div className="rounded-lg border border-warn/40 bg-warn-soft p-3">
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-warn">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Possible duplicates
                    </p>
                    <ul className="space-y-1 text-xs text-warn/90">
                      {validateQuery.data?.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                    <p className="mt-2 text-[11px] text-warn/70">
                      You can still create the machine if this is intentional.
                    </p>
                  </div>
                )}
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                  {summaryRows.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 border-b border-border py-1.5 text-sm">
                      <dt className="text-muted">{k}</dt>
                      <dd className="text-right font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="flex flex-wrap gap-4 text-xs text-muted">
                  {isHost ? (
                    <span>{storage.length} drive(s)</span>
                  ) : (
                    <span>{services.length} service(s)</span>
                  )}
                  <span>{dependencies.length} dependenc{dependencies.length === 1 ? "y" : "ies"}</span>
                  <span>
                    {generateChecklist ? `${applicableTemplates.length} checklist task(s)` : "No checklist"}
                  </span>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={back} disabled={step === 0}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button variant="primary" onClick={next}>
              Continue <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => createMutation.mutate()}
              loading={createMutation.isPending}
              disabled={!name.trim()}
            >
              <Check className="h-3.5 w-3.5" aria-hidden /> Create machine
            </Button>
          )}
        </div>
      </div>

      <ServiceDialog
        open={serviceDialog.open}
        onClose={() => setServiceDialog({ open: false })}
        initial={serviceDialog.editing ? toDraft(serviceDialog.editing) : undefined}
        onSubmit={(svc) => {
          if (serviceDialog.editing) {
            const id = serviceDialog.editing._localId;
            setServices((prev) => prev.map((s) => (s._localId === id ? { ...svc, _localId: id } : s)));
          } else {
            setServices((prev) => [...prev, { ...svc, _localId: localId }]);
            setLocalId((n) => n + 1);
          }
          setServiceDialog({ open: false });
        }}
      />
      <StorageDialog
        open={storageDialog.open}
        onClose={() => setStorageDialog({ open: false })}
        initial={storageDialog.editing ? toStorageDraft(storageDialog.editing) : undefined}
        onSubmit={(dev) => {
          if (storageDialog.editing) {
            const id = storageDialog.editing._localId;
            setStorage((prev) => prev.map((s) => (s._localId === id ? { ...dev, _localId: id } : s)));
          } else {
            setStorage((prev) => [...prev, { ...dev, _localId: localId }]);
            setLocalId((n) => n + 1);
          }
          setStorageDialog({ open: false });
        }}
      />
      <DependencyDialog
        open={dependencyDialog}
        onClose={() => setDependencyDialog(false)}
        onSubmit={(dep) => {
          setDependencies((prev) => [...prev, { ...dep, _localId: localId }]);
          setLocalId((n) => n + 1);
          setDependencyDialog(false);
        }}
      />
    </>
  );
}
