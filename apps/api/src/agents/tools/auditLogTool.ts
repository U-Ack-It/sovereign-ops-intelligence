export type AuditLogInput = {
  action: string;
  resourceType: string;
  resourceId?: string;
  result: string;
};

export function auditLogTool(input: AuditLogInput): AuditLogInput {
  return input;
}
