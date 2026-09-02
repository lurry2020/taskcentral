// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntegrationTokensCard } from "./IntegrationTokensCard";
import type { IntegrationToken, IntegrationTokenCreated } from "@/lib/types";

const plaintext = `tcint_abcdef123456_${"A".repeat(43)}`;
const activeToken: IntegrationToken = {
  id: 7,
  name: "Automation dashboard",
  token_prefix: "abcdef123456",
  scopes: ["inventory:read"],
  created_at: "2026-09-02T12:00:00",
  last_used_at: null,
  revoked_at: null,
  active: true,
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <IntegrationTokensCard />
    </QueryClientProvider>,
  );
}

describe("IntegrationTokensCard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse([])));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders token metadata and never renders a plaintext token from the list", async () => {
    vi.mocked(fetch).mockImplementation(() => jsonResponse([activeToken]));
    renderCard();

    expect(await screen.findByText("Automation dashboard")).toBeTruthy();
    expect(screen.getByText("tcint_abcdef123456_…")).toBeTruthy();
    expect(screen.getAllByText("inventory:read")).toHaveLength(2);
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.queryByText(plaintext)).toBeNull();
  });

  it("validates the token name before sending a create request", async () => {
    const user = userEvent.setup();
    renderCard();
    await screen.findByText("No integration tokens have been created.");

    await user.click(screen.getByRole("button", { name: "Create token" }));
    expect(screen.getByText("Enter a token name.")).toBeTruthy();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("displays a created token once with a copy action, then forgets it", async () => {
    const created: IntegrationTokenCreated = { ...activeToken, token: plaintext };
    vi.mocked(fetch).mockImplementation((input, init) => {
      if (String(input).endsWith("/settings/integration-tokens") && init?.method === "POST") {
        return jsonResponse(created, 201);
      }
      return jsonResponse([]);
    });
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    const rendered = renderCard();

    await screen.findByText("No integration tokens have been created.");
    await user.type(screen.getByLabelText("Token name"), "Automation dashboard");
    await user.click(screen.getByRole("button", { name: "Create token" }));

    expect(await screen.findByText(plaintext)).toBeTruthy();
    const copy = screen.getByRole("button", { name: "Copy token" });
    expect(copy).toBeTruthy();
    await user.click(copy);
    expect(writeText).toHaveBeenCalledWith(plaintext);
    await user.click(screen.getByRole("button", { name: "I saved the token" }));
    expect(screen.queryByText(plaintext)).toBeNull();

    rendered.unmount();
    vi.mocked(fetch).mockImplementation(() => jsonResponse([activeToken]));
    renderCard();
    expect(await screen.findByText("Automation dashboard")).toBeTruthy();
    expect(screen.queryByText(plaintext)).toBeNull();
  });

  it("requires confirmation and displays revoked tokens correctly", async () => {
    const revoked: IntegrationToken = {
      ...activeToken,
      active: false,
      revoked_at: "2026-09-02T13:00:00",
    };
    vi.mocked(fetch).mockImplementation((input, init) => {
      if (String(input).endsWith("/7/revoke") && init?.method === "POST") {
        return jsonResponse(revoked);
      }
      return jsonResponse([activeToken]);
    });
    const user = userEvent.setup();
    renderCard();

    await screen.findByText("Automation dashboard");
    await user.click(screen.getByRole("button", { name: "Revoke" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Revoke token" }));
    await waitFor(() => expect(screen.getByText("Revoked")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();
  });

  it("shows API errors as text", async () => {
    vi.mocked(fetch).mockImplementation(() => jsonResponse({ detail: "Unable to list tokens" }, 500));
    renderCard();
    expect((await screen.findByRole("alert")).textContent).toContain("Unable to list tokens");
  });
});
