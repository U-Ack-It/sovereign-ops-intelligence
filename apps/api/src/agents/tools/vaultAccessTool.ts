export type VaultAccessInput = {
  resourceId: string;
  reason: string;
};

export function vaultAccessTool(input: VaultAccessInput): string {
  return `vault_access_request:${input.resourceId}:${input.reason}`;
}
