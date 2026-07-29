import { describe, expect, it } from "vitest";
import { isValidIp, machineSchema, serviceSchema } from "./schema";

describe("isValidIp", () => {
  it("accepts valid IPv4", () => {
    expect(isValidIp("192.168.1.1")).toBe(true);
    expect(isValidIp("10.0.0.255")).toBe(true);
  });
  it("rejects invalid IPv4", () => {
    expect(isValidIp("999.1.2.3")).toBe(false);
    expect(isValidIp("not-an-ip")).toBe(false);
  });
  it("accepts IPv6", () => {
    expect(isValidIp("fd00::1")).toBe(true);
  });
});

describe("machineSchema", () => {
  const base = {
    name: "test-vm",
    machine_type: "VM",
    status: "Draft",
    tags: [],
  };

  it("accepts a minimal machine", () => {
    const result = machineSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("converts empty strings to null", () => {
    const result = machineSchema.parse({ ...base, host: "", vmid: "", ip_address: "" });
    expect(result.host).toBeNull();
    expect(result.vmid).toBeNull();
    expect(result.ip_address).toBeNull();
  });

  it("rejects a bad IP", () => {
    expect(machineSchema.safeParse({ ...base, ip_address: "300.1.1.1" }).success).toBe(false);
  });

  it("rejects a bad MAC", () => {
    expect(machineSchema.safeParse({ ...base, mac_address: "zz:zz" }).success).toBe(false);
  });

  it("parses numeric strings from inputs", () => {
    const result = machineSchema.parse({ ...base, vmid: "104", cpu_cores: "4", memory_value: "8" });
    expect(result.vmid).toBe(104);
    expect(result.cpu_cores).toBe(4);
    expect(result.memory_value).toBe(8);
  });
});

describe("serviceSchema", () => {
  it("validates port range", () => {
    expect(serviceSchema.safeParse({ name: "x", port: "99999" }).success).toBe(false);
    expect(serviceSchema.safeParse({ name: "x", port: "8080" }).success).toBe(true);
  });
  it("requires http(s) URLs", () => {
    expect(serviceSchema.safeParse({ name: "x", url: "ftp://nope" }).success).toBe(false);
    expect(serviceSchema.safeParse({ name: "x", url: "https://ok.example" }).success).toBe(true);
  });
});
