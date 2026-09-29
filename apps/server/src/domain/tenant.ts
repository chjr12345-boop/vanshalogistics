export type TenantId = string;

export interface TenantContext {
  tenantId: TenantId;
  userId: string;
  branchId?: string;
}
