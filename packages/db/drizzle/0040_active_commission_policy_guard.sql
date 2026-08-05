CREATE UNIQUE INDEX IF NOT EXISTS "commission_policies_one_active_idx"
ON "commission_policies" ("tenant_id", "branch_id", "name")
WHERE "status" = 'active';
