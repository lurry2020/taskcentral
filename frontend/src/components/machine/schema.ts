import { z } from "zod";

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[0-9a-fA-F:]{2,45}$/;
const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

export function isValidIp(value: string): boolean {
  if (IPV4_RE.test(value)) {
    return value.split(".").every((octet) => Number(octet) <= 255);
  }
  return value.includes(":") && IPV6_RE.test(value);
}

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

const optionalNumber = z.preprocess(
  (v) => (v === "" || v === null || v === undefined || Number.isNaN(v) ? null : Number(v)),
  z.number().positive().nullable().optional(),
);

export const machineSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  machine_type: z.enum(["VM", "LXC", "PHYSICAL", "HOST", "NETWORK"]),
  status: z.enum(["Draft", "In Progress", "Active", "Maintenance", "Retired", "Archived"]),
  host: optionalString,
  vmid: z.preprocess(
    (v) => (v === "" || v === null || v === undefined || Number.isNaN(v) ? null : Number(v)),
    z
      .number()
      .int("VMID must be a whole number")
      .min(1, "VMID must be at least 1")
      .nullable()
      .optional(),
  ),
  ip_address: z
    .string()
    .trim()
    .refine((v) => v === "" || isValidIp(v), "Enter a valid IPv4 or IPv6 address")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  mac_address: z
    .string()
    .trim()
    .refine((v) => v === "" || MAC_RE.test(v), "Format: AA:BB:CC:DD:EE:FF")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  dns_record: optionalString,
  operating_system: optionalString,
  operating_system_version: optionalString,
  hypervisor: optionalString,
  architecture: optionalString,
  purpose: optionalString,
  responsibilities: optionalString,
  isp: optionalString,
  connection_type: optionalString,
  download_speed: optionalString,
  upload_speed: optionalString,
  wan_type: optionalString,
  location: optionalString,
  owner: optionalString,
  deployment_date: optionalString,
  cpu: optionalString,
  cpu_cores: z.preprocess(
    (v) => (v === "" || v === null || v === undefined || Number.isNaN(v) ? null : Number(v)),
    z.number().int().min(1).max(4096).nullable().optional(),
  ),
  memory_value: optionalNumber,
  memory_unit: optionalString,
  disk_value: optionalNumber,
  disk_unit: optionalString,
  storage_location: optionalString,
  gpu: optionalString,
  network_interface: optionalString,
  hardware_model: optionalString,
  serial_number: optionalString,
  asset_tag: optionalString,
  tags: z.array(z.string()).default([]),
});

export type MachineFormValues = z.input<typeof machineSchema>;
export type MachineFormOutput = z.output<typeof machineSchema>;

export const serviceSchema = z.object({
  name: z.string().trim().min(1, "Service name is required").max(200),
  description: optionalString,
  port: z.preprocess(
    (v) => (v === "" || v === null || v === undefined || Number.isNaN(v) ? null : Number(v)),
    z
      .number()
      .int()
      .min(1, "Port must be 1-65535")
      .max(65535, "Port must be 1-65535")
      .nullable()
      .optional(),
  ),
  protocol: optionalString,
  url: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || v.startsWith("http://") || v.startsWith("https://"),
      "URL must start with http:// or https://",
    )
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  is_external: z.boolean().default(false),
  notes: optionalString,
});

export type ServiceFormValues = z.input<typeof serviceSchema>;
export type ServiceFormOutput = z.output<typeof serviceSchema>;

export const storageSchema = z.object({
  name: z.string().trim().min(1, "Drive name is required").max(200),
  capacity: optionalString,
  purpose: optionalString,
  notes: optionalString,
});

export type StorageFormValues = z.input<typeof storageSchema>;
export type StorageFormOutput = z.output<typeof storageSchema>;

export const networkDeviceSchema = z.object({
  name: z.string().trim().min(1, "Device name is required").max(200),
  role: z.string().default("Switch"),
  ip_address: z
    .string()
    .trim()
    .refine((v) => v === "" || isValidIp(v), "Enter a valid IP address")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  notes: optionalString,
});

export type NetworkDeviceFormValues = z.input<typeof networkDeviceSchema>;
export type NetworkDeviceFormOutput = z.output<typeof networkDeviceSchema>;

export const networkSegmentSchema = z.object({
  name: z.string().trim().min(1, "Segment name is required").max(120),
  vlan_id: z.preprocess(
    (v) => (v === "" || v === null || v === undefined || Number.isNaN(v) ? null : Number(v)),
    z.number().int().min(1).max(4094).nullable().optional(),
  ),
  subnet: optionalString,
  purpose: optionalString,
  notes: optionalString,
});

export type NetworkSegmentFormValues = z.input<typeof networkSegmentSchema>;
export type NetworkSegmentFormOutput = z.output<typeof networkSegmentSchema>;

export function emptyMachineValues(defaultStatus = "Draft"): MachineFormValues {
  return {
    name: "",
    machine_type: "VM",
    status: defaultStatus as MachineFormValues["status"],
    host: "",
    vmid: "",
    ip_address: "",
    mac_address: "",
    dns_record: "",
    operating_system: "",
    operating_system_version: "",
    hypervisor: "",
    architecture: "",
    responsibilities: "",
    isp: "",
    connection_type: "",
    download_speed: "",
    upload_speed: "",
    wan_type: "",
    purpose: "",
    location: "",
    owner: "",
    deployment_date: "",
    cpu: "",
    cpu_cores: "",
    memory_value: "",
    memory_unit: "GB",
    disk_value: "",
    disk_unit: "GB",
    storage_location: "",
    gpu: "",
    network_interface: "",
    hardware_model: "",
    serial_number: "",
    asset_tag: "",
    tags: [],
  };
}
