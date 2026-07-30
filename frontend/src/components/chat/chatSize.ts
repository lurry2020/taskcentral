export interface ChatSize {
  width: number;
  height: number;
}

export const DEFAULT_CHAT_SIZE: ChatSize = { width: 320, height: 384 };
export const MIN_CHAT_SIZE: ChatSize = { width: 280, height: 320 };
export const MAX_CHAT_SIZE: ChatSize = { width: 480, height: 640 };
export const CHAT_VIEWPORT_GAP = 32;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function constrainChatSize(
  size: ChatSize,
  viewportWidth: number,
  viewportHeight: number,
): ChatSize {
  const maximumWidth = Math.max(1, Math.min(MAX_CHAT_SIZE.width, viewportWidth - CHAT_VIEWPORT_GAP));
  const maximumHeight = Math.max(
    1,
    Math.min(MAX_CHAT_SIZE.height, viewportHeight - CHAT_VIEWPORT_GAP),
  );
  const minimumWidth = Math.min(MIN_CHAT_SIZE.width, maximumWidth);
  const minimumHeight = Math.min(MIN_CHAT_SIZE.height, maximumHeight);

  return {
    width: clamp(Math.round(size.width), minimumWidth, maximumWidth),
    height: clamp(Math.round(size.height), minimumHeight, maximumHeight),
  };
}
