import type { ReactNode } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import type { Machine } from "@/lib/types";
import { formatDate, formatDateTime, formatSize, machineTypeLabels } from "@/lib/utils";

function Row({
  label,
  value,
  mono,
  wrap,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  wrap?: boolean;
}) {
  // Long free-text fields (e.g. Purpose) stack the value under the label and
  // wrap fully so nothing is clipped, growing the card as needed.
  if (wrap) {
    return (
      <div className="py-1.5 text-sm">
        <dt className="mb-0.5 text-muted">{label}</dt>
        <dd className="whitespace-pre-wrap break-words leading-relaxed text-text">
          {value ?? "-"}
        </dd>
      </div>
    );
  }
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={`min-w-0 truncate text-right ${mono ? "font-mono text-xs leading-5" : ""}`}>
        {value ?? "-"}
      </dd>
    </div>
  );
}

export function OverviewTab({ machine }: { machine: Machine }) {
  const isVirtual = machine.machine_type === "VM" || machine.machine_type === "LXC";
  const isHost = machine.machine_type === "HOST";
  const isNetwork = machine.machine_type === "NETWORK";
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="General" />
        <CardBody>
          <dl className="divide-y divide-border">
            <Row label="Type" value={machineTypeLabels[machine.machine_type]} />
            <Row label="Status" value={machine.status} />
            {!isNetwork && <Row label="Host" value={machine.host} />}
            {isVirtual && <Row label={machine.machine_type === "LXC" ? "CTID" : "VMID"} value={machine.vmid} mono />}
            <Row label={isNetwork ? "Overview" : "Purpose"} value={machine.purpose} wrap />
            <Row label="Owner" value={machine.owner} />
            {!isVirtual && <Row label="Location" value={machine.location} />}
            <Row label="Created" value={formatDateTime(machine.created_at)} />
            <Row label="Deployment date" value={formatDate(machine.deployment_date)} />
            <Row label="Last updated" value={formatDateTime(machine.updated_at)} />
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={isNetwork ? "Router" : "Network"} />
        <CardBody>
          <dl className="divide-y divide-border">
            {isNetwork ? (
              <>
                <Row label="Model" value={machine.hardware_model} />
                <Row label="Management IP" value={machine.ip_address} mono />
                <Row label="DNS record" value={machine.dns_record} mono />
                <Row label="Responsibilities" value={machine.responsibilities} wrap />
              </>
            ) : (
              <>
                <Row label={isHost ? "Management IP" : "IP address"} value={machine.ip_address} mono />
                <Row label="MAC address" value={machine.mac_address} mono />
                <Row label="DNS record" value={machine.dns_record} mono />
                <Row label="Network interface" value={machine.network_interface} />
              </>
            )}
          </dl>
        </CardBody>
      </Card>

      {isNetwork ? (
        <Card>
          <CardHeader title="Internet service" />
          <CardBody>
            <dl className="divide-y divide-border">
              <Row label="ISP" value={machine.isp} />
              <Row label="Connection type" value={machine.connection_type} />
              <Row label="Download speed" value={machine.download_speed} />
              <Row label="Upload speed" value={machine.upload_speed} />
              <Row label="WAN type" value={machine.wan_type} />
            </dl>
          </CardBody>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader title={isHost ? "Platform" : "Operating system"} />
            <CardBody>
              <dl className="divide-y divide-border">
                {isHost ? (
                  <Row label="Hypervisor" value={machine.hypervisor} />
                ) : (
                  <>
                    <Row label="OS" value={machine.operating_system} />
                    <Row label="Version" value={machine.operating_system_version} />
                  </>
                )}
                <Row label="Architecture" value={machine.architecture} />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Hardware resources" />
            <CardBody>
              <dl className="divide-y divide-border">
                <Row label="CPU" value={machine.cpu} />
                <Row label="CPU cores" value={machine.cpu_cores} />
                <Row label="Memory" value={formatSize(machine.memory_value, machine.memory_unit)} />
                <Row label="Disk" value={formatSize(machine.disk_value, machine.disk_unit)} />
                <Row label="Storage location" value={machine.storage_location} />
                <Row label="GPU" value={machine.gpu} />
                {!isVirtual && (
                  <>
                    <Row label="Hardware model" value={machine.hardware_model} />
                    <Row label="Serial number" value={machine.serial_number} mono />
                    <Row label="Asset tag" value={machine.asset_tag} mono />
                  </>
                )}
              </dl>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
