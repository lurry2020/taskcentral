import { describe, expect, it } from "vitest";
import { cn, formatSize, relativeTime } from "./utils";

describe("cn", () => {
  it("joins truthy classes", () => {
    expect(cn("a", false, undefined, "b", null, "c")).toBe("a b c");
  });
});

describe("formatSize", () => {
  it("formats value with unit", () => {
    expect(formatSize(8, "GB")).toBe("8 GB");
    expect(formatSize(1.5, "TB")).toBe("1.5 TB");
  });
  it("handles missing values", () => {
    expect(formatSize(null, "GB")).toBe("—");
    expect(formatSize(512, null)).toBe("512");
  });
});

describe("relativeTime", () => {
  it("handles recent timestamps", () => {
    expect(relativeTime(new Date(Date.now() - 30_000).toISOString())).toBe("just now");
    expect(relativeTime(new Date(Date.now() - 5 * 60_000).toISOString())).toBe("5m ago");
  });
  it("handles empty input", () => {
    expect(relativeTime(null)).toBe("—");
  });
});
