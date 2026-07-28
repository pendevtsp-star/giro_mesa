WITH canonical_role_permissions ("code", "required_permissions") AS (
  VALUES
    (
      'owner',
      '[
        "tenant:manage",
        "catalog:manage",
        "pos:operate",
        "pos:qr_review",
        "pos:kds_send",
        "pos:payment_manage",
        "pos:close_order",
        "kds:operate",
        "cash:manage",
        "fiscal:read",
        "fiscal:manage",
        "hardware:manage",
        "print:operate",
        "inventory:manage",
        "reports:read",
        "delivery:manage",
        "approvals:manage"
      ]'::jsonb
    ),
    (
      'manager',
      '[
        "catalog:manage",
        "pos:operate",
        "pos:qr_review",
        "pos:kds_send",
        "pos:payment_manage",
        "pos:close_order",
        "kds:operate",
        "cash:manage",
        "fiscal:read",
        "hardware:manage",
        "print:operate",
        "inventory:manage",
        "reports:read",
        "approvals:manage"
      ]'::jsonb
    ),
    (
      'cashier',
      '[
        "pos:operate",
        "pos:qr_review",
        "pos:payment_manage",
        "pos:close_order",
        "cash:manage",
        "fiscal:read",
        "print:operate",
        "reports:read"
      ]'::jsonb
    ),
    (
      'waiter',
      '[
        "pos:operate",
        "pos:qr_review",
        "pos:kds_send"
      ]'::jsonb
    )
)
UPDATE "roles" AS role
SET "permissions" = (
  SELECT COALESCE(jsonb_agg(permission ORDER BY permission), '[]'::jsonb)
  FROM (
    SELECT jsonb_array_elements_text(COALESCE(role."permissions", '[]'::jsonb)) AS permission
    UNION
    SELECT jsonb_array_elements_text(canonical."required_permissions") AS permission
  ) AS merged_permissions
)
FROM canonical_role_permissions AS canonical
WHERE role."tenant_id" IS NOT NULL
  AND role."code" = canonical."code"
  AND NOT role."permissions" @> canonical."required_permissions";
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "roles" AS role
    JOIN (
      VALUES
        (
          'owner',
          '[
            "tenant:manage",
            "catalog:manage",
            "pos:operate",
            "pos:qr_review",
            "pos:kds_send",
            "pos:payment_manage",
            "pos:close_order",
            "kds:operate",
            "cash:manage",
            "fiscal:read",
            "fiscal:manage",
            "hardware:manage",
            "print:operate",
            "inventory:manage",
            "reports:read",
            "delivery:manage",
            "approvals:manage"
          ]'::jsonb
        ),
        (
          'manager',
          '[
            "catalog:manage",
            "pos:operate",
            "pos:qr_review",
            "pos:kds_send",
            "pos:payment_manage",
            "pos:close_order",
            "kds:operate",
            "cash:manage",
            "fiscal:read",
            "hardware:manage",
            "print:operate",
            "inventory:manage",
            "reports:read",
            "approvals:manage"
          ]'::jsonb
        ),
        (
          'cashier',
          '[
            "pos:operate",
            "pos:qr_review",
            "pos:payment_manage",
            "pos:close_order",
            "cash:manage",
            "fiscal:read",
            "print:operate",
            "reports:read"
          ]'::jsonb
        ),
        (
          'waiter',
          '[
            "pos:operate",
            "pos:qr_review",
            "pos:kds_send"
          ]'::jsonb
        )
    ) AS canonical ("code", "required_permissions")
      ON role."code" = canonical."code"
    WHERE role."tenant_id" IS NOT NULL
      AND NOT role."permissions" @> canonical."required_permissions"
  ) THEN
    RAISE EXCEPTION 'Canonical role permission backfill verification failed';
  END IF;
END $$;
