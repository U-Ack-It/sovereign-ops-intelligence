export type ClientProfileLookup = {
  clientId: string;
  estateId?: string;
};

export function clientProfileTool(input: ClientProfileLookup): string {
  return `client_profile:${input.clientId}:${input.estateId ?? "all"}`;
}
