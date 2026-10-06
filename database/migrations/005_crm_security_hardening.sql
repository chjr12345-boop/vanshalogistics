-- CRM security hardening
-- Permission grants for existing Company Admin roles and concurrency-safe numbering.

CREATE TABLE IF NOT EXISTS crm_number_counters (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  counter_key TEXT NOT NULL,
  next_value BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY (company_id, counter_key),
  CONSTRAINT crm_number_counters_value_chk CHECK (next_value > 0)
);

-- Existing Company Admins must retain full CRM administration through explicit permissions.
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Company Admin'
  AND p.code LIKE 'crm.%'
ON CONFLICT DO NOTHING;
