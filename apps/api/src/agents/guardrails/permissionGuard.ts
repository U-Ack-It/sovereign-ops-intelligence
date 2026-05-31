export type PermissionContext = {
  permissions: string[];
};

export function permissionGuard(
  context: PermissionContext,
  requiredPermission: string,
): void {
  if (!context.permissions.includes(requiredPermission)) {
    throw new Error("Access denied");
  }
}
