import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog, Dialog } from "@/components/ui/Dialog";
import { Checkbox, FormField, Input } from "@/components/ui/Field";
import { CopyButton } from "@/components/ui/CopyButton";
import { api } from "@/lib/api";
import type {
  IntegrationToken,
  IntegrationTokenCreated,
  IntegrationTokenScope,
} from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

const INVENTORY_READ: IntegrationTokenScope = "inventory:read";

export function IntegrationTokensCard() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [includeInventoryRead, setIncludeInventoryRead] = useState(true);
  const [nameError, setNameError] = useState("");
  const [actionError, setActionError] = useState("");
  const [revealedToken, setRevealedToken] = useState<IntegrationTokenCreated | null>(null);
  const [tokenToRevoke, setTokenToRevoke] = useState<IntegrationToken | null>(null);

  const tokenQuery = useQuery({
    queryKey: ["integration-tokens"],
    queryFn: () => api.get<IntegrationToken[]>("/settings/integration-tokens"),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; scopes: IntegrationTokenScope[] }) => {
      const created = await api.post<IntegrationTokenCreated>(
        "/settings/integration-tokens",
        payload,
      );
      const { token: _plaintext, ...metadata } = created;
      setRevealedToken(created);
      return metadata;
    },
    onSuccess: (metadata) => {
      queryClient.setQueryData<IntegrationToken[]>(["integration-tokens"], (current = []) => [
        metadata,
        ...current,
      ]);
      setName("");
      setActionError("");
    },
    onError: (error) => setActionError((error as Error).message),
  });

  const revokeMutation = useMutation({
    mutationFn: (tokenId: number) =>
      api.post<IntegrationToken>(`/settings/integration-tokens/${tokenId}/revoke`),
    onSuccess: (revoked) => {
      queryClient.setQueryData<IntegrationToken[]>(["integration-tokens"], (current = []) =>
        current.map((token) => (token.id === revoked.id ? revoked : token)),
      );
      setTokenToRevoke(null);
      setActionError("");
    },
    onError: (error) => {
      setTokenToRevoke(null);
      setActionError((error as Error).message);
    },
  });

  const createToken = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("Enter a token name.");
      return;
    }
    if (!includeInventoryRead) {
      setActionError("Select at least one scope.");
      return;
    }
    setNameError("");
    setActionError("");
    createMutation.mutate({ name: trimmedName, scopes: [INVENTORY_READ] });
  };

  return (
    <>
      <Card>
        <CardHeader
          title="Integration API"
          description="Create revocable, read-only tokens for trusted automation and tools"
        />
        <CardBody className="space-y-5">
          <div className="rounded-lg bg-info-soft px-3.5 py-3 text-xs leading-relaxed text-info ring-1 ring-inset ring-info/20">
            Integration tokens are separate from your browser login. A token can read inventory
            through the dedicated integration endpoints, but it cannot modify Task Central.
          </div>

          <div className="grid gap-4 border-b border-border pb-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <FormField label="Token name" htmlFor="integration-token-name" error={nameError}>
              <Input
                id="integration-token-name"
                value={name}
                maxLength={120}
                onChange={(event) => {
                  setName(event.target.value);
                  if (nameError) setNameError("");
                }}
                placeholder="Automation dashboard"
                autoComplete="off"
              />
            </FormField>
            <Button onClick={createToken} loading={createMutation.isPending}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Create token
            </Button>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox
                checked={includeInventoryRead}
                onChange={(event) => setIncludeInventoryRead(event.target.checked)}
              />
              <span>
                <code>inventory:read</code>
                <span className="ml-2 text-xs text-faint">Read machines, services, and dependencies</span>
              </span>
            </label>
          </div>

          {actionError && (
            <div role="alert" className="rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent-hover">
              {actionError}
            </div>
          )}

          {tokenQuery.isLoading ? (
            <p className="text-sm text-muted">Loading integration tokens…</p>
          ) : tokenQuery.isError ? (
            <div role="alert" className="text-sm text-accent-hover">
              {(tokenQuery.error as Error).message}
            </div>
          ) : tokenQuery.data?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="text-[0.7rem] uppercase tracking-wider text-faint">
                  <tr className="border-b border-border">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Prefix</th>
                    <th className="pb-2 pr-4 font-medium">Scopes</th>
                    <th className="pb-2 pr-4 font-medium">Created</th>
                    <th className="pb-2 pr-4 font-medium">Last used</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {tokenQuery.data.map((token) => (
                    <tr key={token.id} className="border-b border-border/70 last:border-0">
                      <td className="py-3 pr-4 font-medium text-text">{token.name}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-muted">
                        tcint_{token.token_prefix}_…
                      </td>
                      <td className="py-3 pr-4">
                        {token.scopes.map((scope) => (
                          <Badge key={scope} className="bg-fill text-muted ring-1 ring-inset ring-line">
                            {scope}
                          </Badge>
                        ))}
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted">{formatDateTime(token.created_at)}</td>
                      <td className="py-3 pr-4 text-xs text-muted">
                        {token.last_used_at ? formatDateTime(token.last_used_at) : "Never"}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={token.active ? "text-ok" : "text-faint"}>
                          {token.active ? "Active" : "Revoked"}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {token.active && (
                          <Button variant="danger" size="sm" onClick={() => setTokenToRevoke(token)}>
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-border px-4 py-4 text-sm text-muted">
              <KeyRound className="h-5 w-5 text-faint" aria-hidden />
              No integration tokens have been created.
            </div>
          )}
        </CardBody>
      </Card>

      <Dialog
        open={revealedToken !== null}
        onClose={() => setRevealedToken(null)}
        title="Integration token created"
        description="This is the only time Task Central will display the complete token."
        footer={
          <Button variant="primary" onClick={() => setRevealedToken(null)}>
            I saved the token
          </Button>
        }
      >
        {revealedToken && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-warn-soft px-3.5 py-3 text-xs leading-relaxed text-warn ring-1 ring-inset ring-warn/20">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Copy and store this token securely now. If it is lost, revoke it and create a replacement.
            </div>
            <div className="rounded-lg bg-fill p-3 ring-1 ring-inset ring-line">
              <code className="block break-all text-xs text-text">{revealedToken.token}</code>
            </div>
            <CopyButton text={revealedToken.token} label="Copy token" />
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={tokenToRevoke !== null}
        onClose={() => setTokenToRevoke(null)}
        onConfirm={() => tokenToRevoke && revokeMutation.mutate(tokenToRevoke.id)}
        title="Revoke integration token?"
        message={
          <>
            <strong className="text-text">{tokenToRevoke?.name}</strong> will immediately stop
            working. This action cannot be undone.
          </>
        }
        confirmLabel="Revoke token"
        danger
        loading={revokeMutation.isPending}
      />
    </>
  );
}
