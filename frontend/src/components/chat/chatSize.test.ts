import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAT_SIZE,
  MAX_CHAT_SIZE,
  MIN_CHAT_SIZE,
  constrainChatSize,
} from "./chatSize";

describe("constrainChatSize", () => {
  it("keeps the default size unchanged on a normal viewport", () => {
    expect(constrainChatSize(DEFAULT_CHAT_SIZE, 1440, 900)).toEqual(DEFAULT_CHAT_SIZE);
  });

  it("enforces the configured minimum and maximum", () => {
    expect(constrainChatSize({ width: 100, height: 100 }, 1440, 900)).toEqual(MIN_CHAT_SIZE);
    expect(constrainChatSize({ width: 900, height: 900 }, 1440, 900)).toEqual(MAX_CHAT_SIZE);
  });

  it("fits inside a smaller viewport without overflowing its edge gap", () => {
    expect(constrainChatSize(MAX_CHAT_SIZE, 360, 500)).toEqual({
      width: 328,
      height: 468,
    });
  });
});
