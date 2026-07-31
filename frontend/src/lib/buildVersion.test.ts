import { describe, expect, it } from "vitest";
import { runningVersionDiffers } from "./buildVersion";

describe("runningVersionDiffers", () => {
  it("does not prompt when frontend and backend versions match", () => {
    expect(runningVersionDiffers("1.2.0", "1.2.0")).toBe(false);
    expect(runningVersionDiffers("v1.2.0", "1.2.0")).toBe(false);
  });

  it("prompts when a different backend release is running", () => {
    expect(runningVersionDiffers("1.1.2", "1.2.0")).toBe(true);
    expect(runningVersionDiffers("1.2.0", "1.1.2")).toBe(true);
  });

  it("does not prompt for development builds or a missing backend version", () => {
    expect(runningVersionDiffers("dev", "1.2.0")).toBe(false);
    expect(runningVersionDiffers("1.2.0", undefined)).toBe(false);
  });
});
