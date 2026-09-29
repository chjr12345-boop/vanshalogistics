export type PermissionCode =
  | "system.read"
  | "system.manage";

export interface RoleDefinition {
  id: string;
  name: string;
  permissions: PermissionCode[];
}
