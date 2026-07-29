import { Controller, type UseFormReturn } from "react-hook-form";
import { FormField, Input, Select, Textarea } from "@/components/ui/Field";
import { useMachines, useMeta } from "@/lib/queries";
import type { MachineFormValues } from "./schema";
import { TagInput } from "./TagInput";

type Form = UseFormReturn<MachineFormValues>;

function err(form: Form, field: keyof MachineFormValues): string | undefined {
  return form.formState.errors[field]?.message as string | undefined;
}

/** Identity, network, and organization fields. Visibility adapts to machine type. */
export function IdentityFields({ form }: { form: Form }) {
  const { data: meta } = useMeta();
  const machineType = form.watch("machine_type");
  const isVirtual = machineType === "VM" || machineType === "LXC";
  const isHost = machineType === "HOST";
  const isNetwork = machineType === "NETWORK";

  // Hosts (hypervisors) already added, offered as a dropdown for the Host field.
  const { data: hostPage } = useMachines({
    machine_type: "HOST",
    page_size: 200,
    sort_by: "name",
    sort_dir: "asc",
  });
  const hostNames = (hostPage?.items ?? []).map((m) => m.name);
  const currentHost = form.watch("host");
  // Include the machine's existing host value even if it isn't a tracked Host
  // machine, so an older free-text value is preserved in the dropdown.
  const hostOptions = [...hostNames];
  if (currentHost && !hostOptions.includes(currentHost)) hostOptions.push(currentHost);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Name *" htmlFor="m-name" error={err(form, "name")}>
        <Input
          id="m-name"
          placeholder={
            isNetwork ? "e.g. Home Network" : isHost ? "e.g. proxmox-01" : "e.g. docker-host-01"
          }
          {...form.register("name")}
        />
      </FormField>
      {isNetwork ? null : isVirtual ? (
        hostOptions.length > 0 ? (
          <FormField
            label="Host (hypervisor)"
            htmlFor="m-host"
            hint="Choose one of your Host machines"
          >
            <Select id="m-host" {...form.register("host")}>
              <option value="">— Select a host —</option>
              {hostOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </FormField>
        ) : (
          <FormField
            label="Host (hypervisor)"
            htmlFor="m-host"
            hint="Add a Host machine to pick it from a dropdown here"
          >
            <Input id="m-host" placeholder="proxmox-01" {...form.register("host")} />
          </FormField>
        )
      ) : isHost ? (
        <FormField label="Cluster / group" htmlFor="m-host" hint="Optional — e.g. a Proxmox cluster name">
          <Input id="m-host" placeholder="pve-cluster" {...form.register("host")} />
        </FormField>
      ) : (
        <FormField
          label="Host / rack location"
          htmlFor="m-host"
          hint="Where this hardware lives"
        >
          <Input id="m-host" placeholder="rack-shelf-2" {...form.register("host")} />
        </FormField>
      )}
      {isVirtual && (
        <FormField
          label={machineType === "LXC" ? "CTID" : "VMID"}
          htmlFor="m-vmid"
          error={err(form, "vmid")}
        >
          <Input id="m-vmid" type="number" min={1} placeholder="104" {...form.register("vmid")} />
        </FormField>
      )}
      <FormField label="Status" htmlFor="m-status">
        <Select id="m-status" {...form.register("status")}>
          {(meta?.machine_statuses ?? []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField
        label={isNetwork || isHost ? "Management IP" : "IP address"}
        htmlFor="m-ip"
        error={err(form, "ip_address")}
      >
        <Input id="m-ip" placeholder="192.168.1.1" className="font-mono" {...form.register("ip_address")} />
      </FormField>
      {!isNetwork && (
        <FormField label="MAC address" htmlFor="m-mac" error={err(form, "mac_address")}>
          <Input
            id="m-mac"
            placeholder="AA:BB:CC:DD:EE:FF"
            className="font-mono"
            {...form.register("mac_address")}
          />
        </FormField>
      )}
      <FormField label="DNS record" htmlFor="m-dns" className="sm:col-span-2">
        <Input
          id="m-dns"
          placeholder="docker-host-01.home.arpa"
          className="font-mono"
          {...form.register("dns_record")}
        />
      </FormField>
      {isHost ? (
        <FormField
          label="Hypervisor"
          htmlFor="m-hypervisor"
          className="sm:col-span-2"
          hint="Platform and version running on this host"
        >
          <Input
            id="m-hypervisor"
            placeholder="e.g. Proxmox VE 9"
            {...form.register("hypervisor")}
          />
        </FormField>
      ) : isNetwork ? (
        <>
          <FormField label="Router model" htmlFor="m-router" className="sm:col-span-2">
            <Input
              id="m-router"
              placeholder="e.g. UniFi Dream Router 7 (UDR7)"
              {...form.register("hardware_model")}
            />
          </FormField>
          <FormField
            label="Router responsibilities"
            htmlFor="m-resp"
            className="sm:col-span-2"
            hint="One per line — e.g. Routing, DHCP, DNS Forwarding, Firewall, VPN"
          >
            <Textarea
              id="m-resp"
              rows={3}
              placeholder={"Routing\nDHCP\nDNS Forwarding\nFirewall"}
              {...form.register("responsibilities")}
            />
          </FormField>
          <FormField label="ISP" htmlFor="m-isp">
            <Input id="m-isp" placeholder="Brightspeed" {...form.register("isp")} />
          </FormField>
          <FormField label="Connection type" htmlFor="m-conn">
            <Input id="m-conn" placeholder="Fiber (FTTH)" {...form.register("connection_type")} />
          </FormField>
          <FormField label="Download speed" htmlFor="m-down">
            <Input id="m-down" placeholder="1 Gbps" {...form.register("download_speed")} />
          </FormField>
          <FormField label="Upload speed" htmlFor="m-up">
            <Input id="m-up" placeholder="1 Gbps" {...form.register("upload_speed")} />
          </FormField>
          <FormField label="WAN type" htmlFor="m-wan" className="sm:col-span-2">
            <Input id="m-wan" placeholder="Dynamic Public IP" {...form.register("wan_type")} />
          </FormField>
        </>
      ) : (
        <>
          <FormField label="Operating system" htmlFor="m-os">
            <Input id="m-os" placeholder="Debian" {...form.register("operating_system")} />
          </FormField>
          <FormField label="OS version" htmlFor="m-osv">
            <Input id="m-osv" placeholder="12" {...form.register("operating_system_version")} />
          </FormField>
        </>
      )}
      <FormField label="Architecture" htmlFor="m-arch">
        <Select id="m-arch" {...form.register("architecture")}>
          <option value="">—</option>
          {["x86_64", "arm64", "armhf", "riscv64", "Other"].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Deployment date" htmlFor="m-deploy">
        <Input id="m-deploy" type="date" {...form.register("deployment_date")} />
      </FormField>
      <FormField label="Purpose" htmlFor="m-purpose" className="sm:col-span-2">
        <Textarea
          id="m-purpose"
          rows={2}
          placeholder="What is this machine for?"
          {...form.register("purpose")}
        />
      </FormField>
      {!isVirtual && (
        <FormField label="Physical location" htmlFor="m-location">
          <Input id="m-location" placeholder="Office closet, rack U12…" {...form.register("location")} />
        </FormField>
      )}
      <FormField label="Owner / maintainer" htmlFor="m-owner">
        <Input id="m-owner" placeholder="Me" {...form.register("owner")} />
      </FormField>
      <FormField label="Tags" htmlFor="m-tags" className="sm:col-span-2">
        <Controller
          control={form.control}
          name="tags"
          render={({ field }) => (
            <TagInput id="m-tags" value={field.value ?? []} onChange={field.onChange} />
          )}
        />
      </FormField>
    </div>
  );
}

/** Hardware resource fields. Physical machines get inventory fields. */
export function HardwareFields({ form }: { form: Form }) {
  const machineType = form.watch("machine_type");
  const isVirtual = machineType === "VM" || machineType === "LXC";
  const isNetwork = machineType === "NETWORK";
  const units = ["MB", "GB", "TB"];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField
        label="CPU"
        htmlFor="m-cpu"
        hint={isVirtual ? 'CPU type, e.g. "host" or "x86-64-v2-AES"' : "Processor model"}
      >
        <Input
          id="m-cpu"
          placeholder={isVirtual ? "host" : "Intel N100"}
          {...form.register("cpu")}
        />
      </FormField>
      <FormField label="CPU cores" htmlFor="m-cores" error={err(form, "cpu_cores")}>
        <Input id="m-cores" type="number" min={1} placeholder="4" {...form.register("cpu_cores")} />
      </FormField>
      <FormField label="Memory" htmlFor="m-mem" error={err(form, "memory_value")}>
        <div className="flex gap-2">
          <Input
            id="m-mem"
            type="number"
            min={0}
            step="any"
            placeholder="8"
            {...form.register("memory_value")}
          />
          <Select className="w-24" aria-label="Memory unit" {...form.register("memory_unit")}>
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </div>
      </FormField>
      <FormField label="Disk" htmlFor="m-disk" error={err(form, "disk_value")}>
        <div className="flex gap-2">
          <Input
            id="m-disk"
            type="number"
            min={0}
            step="any"
            placeholder="64"
            {...form.register("disk_value")}
          />
          <Select className="w-24" aria-label="Disk unit" {...form.register("disk_unit")}>
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </div>
      </FormField>
      <FormField
        label="Storage location"
        htmlFor="m-storage"
        hint={isVirtual ? "Proxmox storage, e.g. local-zfs" : "Disk / pool the OS lives on"}
      >
        <Input id="m-storage" placeholder="local-zfs" {...form.register("storage_location")} />
      </FormField>
      <FormField label="GPU" htmlFor="m-gpu">
        <Input id="m-gpu" placeholder="None / passthrough details" {...form.register("gpu")} />
      </FormField>
      <FormField label="Network interface" htmlFor="m-nic">
        <Input
          id="m-nic"
          placeholder={isVirtual ? "vmbr0" : "eth0 / 2.5GbE"}
          {...form.register("network_interface")}
        />
      </FormField>
      {!isVirtual && !isNetwork && (
        <>
          <FormField label="Hardware model" htmlFor="m-model">
            <Input
              id="m-model"
              placeholder="Raspberry Pi 5, Beelink S12 Pro…"
              {...form.register("hardware_model")}
            />
          </FormField>
          <FormField label="Serial number" htmlFor="m-serial">
            <Input id="m-serial" {...form.register("serial_number")} />
          </FormField>
          <FormField label="Asset tag" htmlFor="m-asset">
            <Input id="m-asset" {...form.register("asset_tag")} />
          </FormField>
        </>
      )}
    </div>
  );
}
