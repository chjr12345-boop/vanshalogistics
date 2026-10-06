-- Vansha Logistic Hub
-- Gate 3 / CRM module

CREATE TABLE IF NOT EXISTS crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  priority TEXT NOT NULL DEFAULT 'normal',
  company_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  city TEXT,
  state TEXT,
  requirement_summary TEXT,
  expected_volume NUMERIC(14,3),
  volume_unit TEXT,
  next_follow_up_at TIMESTAMPTZ,
  lost_reason TEXT,
  converted_customer_id UUID,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_leads_status_chk CHECK (status IN ('new','contacted','qualified','proposal','won','lost')),
  CONSTRAINT crm_leads_priority_chk CHECK (priority IN ('low','normal','high','urgent'))
);
CREATE INDEX IF NOT EXISTS idx_crm_leads_company_status ON crm_leads(company_id,status);
CREATE INDEX IF NOT EXISTS idx_crm_leads_company_owner ON crm_leads(company_id,owner_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_followup ON crm_leads(company_id,next_follow_up_at);

CREATE TABLE IF NOT EXISTS crm_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  gstin TEXT,
  pan TEXT,
  email TEXT,
  phone TEXT,
  billing_address JSONB NOT NULL DEFAULT '{}'::jsonb,
  shipping_address JSONB NOT NULL DEFAULT '{}'::jsonb,
  credit_limit NUMERIC(14,2),
  credit_days INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  source_lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_customers_status_chk CHECK (status IN ('active','inactive','blocked')),
  CONSTRAINT crm_customers_company_code_unique UNIQUE(company_id,code)
);
CREATE INDEX IF NOT EXISTS idx_crm_customers_company_status ON crm_customers(company_id,status);
CREATE INDEX IF NOT EXISTS idx_crm_customers_company_name ON crm_customers(company_id,legal_name);

ALTER TABLE crm_leads ADD CONSTRAINT crm_leads_converted_customer_fk
  FOREIGN KEY (converted_customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES crm_customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  designation TEXT,
  email TEXT,
  phone TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_contacts_status_chk CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_company_customer ON crm_contacts(company_id,customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_one_primary_contact
  ON crm_contacts(customer_id) WHERE is_primary=TRUE AND status='active';

CREATE TABLE IF NOT EXISTS crm_enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES crm_customers(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  enquiry_no TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  enquiry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  pickup_location TEXT,
  delivery_location TEXT,
  product_name TEXT,
  quantity NUMERIC(14,3),
  quantity_unit TEXT,
  vehicle_type TEXT,
  heating_required BOOLEAN NOT NULL DEFAULT FALSE,
  temperature_requirement TEXT,
  hazardous BOOLEAN NOT NULL DEFAULT FALSE,
  requirement_notes TEXT,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_enquiries_status_chk CHECK (status IN ('open','qualified','quoted','negotiation','won','lost','closed')),
  CONSTRAINT crm_enquiries_company_no_unique UNIQUE(company_id,enquiry_no)
);
CREATE INDEX IF NOT EXISTS idx_crm_enquiries_company_status ON crm_enquiries(company_id,status);
CREATE INDEX IF NOT EXISTS idx_crm_enquiries_company_assigned ON crm_enquiries(company_id,assigned_to);

CREATE TABLE IF NOT EXISTS crm_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE CASCADE,
  enquiry_id UUID REFERENCES crm_enquiries(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES crm_customers(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  follow_up_at TIMESTAMPTZ NOT NULL,
  channel TEXT NOT NULL DEFAULT 'call',
  subject TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_followups_channel_chk CHECK (channel IN ('call','whatsapp','email','meeting','other')),
  CONSTRAINT crm_followups_status_chk CHECK (status IN ('pending','completed','cancelled')),
  CONSTRAINT crm_followups_parent_chk CHECK (num_nonnulls(lead_id,enquiry_id,customer_id)>=1)
);
CREATE INDEX IF NOT EXISTS idx_crm_followups_company_due ON crm_followups(company_id,follow_up_at,status);

CREATE TABLE IF NOT EXISTS crm_quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  enquiry_id UUID REFERENCES crm_enquiries(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES crm_customers(id) ON DELETE SET NULL,
  quotation_no TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  valid_until DATE,
  currency TEXT NOT NULL DEFAULT 'INR',
  freight_amount NUMERIC(14,2),
  additional_charges NUMERIC(14,2) NOT NULL DEFAULT 0,
  detention_charges NUMERIC(14,2) NOT NULL DEFAULT 0,
  heating_charges NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2),
  terms TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_quotations_status_chk CHECK (status IN ('draft','sent','accepted','rejected','expired','cancelled')),
  CONSTRAINT crm_quotations_company_no_version_unique UNIQUE(company_id,quotation_no,version)
);
CREATE INDEX IF NOT EXISTS idx_crm_quotations_company_status ON crm_quotations(company_id,status);

CREATE TABLE IF NOT EXISTS crm_negotiations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  enquiry_id UUID REFERENCES crm_enquiries(id) ON DELETE CASCADE,
  quotation_id UUID REFERENCES crm_quotations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES crm_customers(id) ON DELETE CASCADE,
  discussion_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discussed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'call',
  summary TEXT NOT NULL,
  agreed_amount NUMERIC(14,2),
  next_action TEXT,
  next_action_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_negotiations_channel_chk CHECK (channel IN ('call','whatsapp','email','meeting','other'))
);
CREATE INDEX IF NOT EXISTS idx_crm_negotiations_company_date ON crm_negotiations(company_id,discussion_at DESC);

CREATE TABLE IF NOT EXISTS crm_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_history_entity ON crm_history(company_id,entity_type,entity_id,created_at DESC);

INSERT INTO permissions(code,description) VALUES
('crm.leads.view','View CRM leads'),('crm.leads.manage','Create and update CRM leads'),
('crm.enquiries.view','View CRM enquiries'),('crm.enquiries.manage','Create and update CRM enquiries'),
('crm.followups.manage','Manage CRM follow-ups'),('crm.quotations.manage','Create and manage CRM quotations'),
('crm.customers.view','View CRM customers'),('crm.customers.manage','Create and update CRM customers'),
('crm.contacts.manage','Manage customer contacts'),('crm.negotiations.manage','Record CRM negotiations'),
('crm.history.view','View customer history')
ON CONFLICT(code) DO UPDATE SET description=EXCLUDED.description;
