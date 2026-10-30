export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "user" | "superadmin";
  is_active: boolean;
  created_at: string;
  bot_count: number;
};

export type SessionUser = { id: string; name: string; email: string; role: string; is_active: boolean };

export type Overview = {
  users_total: number;
  users_active: number;
  bots_total: number;
  bots_published: number;
  bots_archived: number;
  conversations_total: number;
  conversations_last_7_days: number;
  conversations_completed: number;
  deployments_active: number;
  deliveries_pending: number;
  deliveries_failed: number;
  subflows_total: number;
  logic_assets_total: number;
};

export type AdminBot = {
  id: string;
  name: string;
  slug: string;
  status: "draft" | "published" | "archived";
  owner_id: string;
  owner_email: string;
  owner_name: string;
  created_at: string;
  updated_at: string;
  conversation_count: number;
  deployment_count: number;
  published_version: number | null;
};

export type AuditEntry = {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  bot_id: string;
  bot_name: string | null;
  user_id: string | null;
  user_email: string | null;
};

export type Delivery = {
  id: string;
  created_at: string;
  bot_id: string;
  bot_name: string | null;
  event: string;
  status: string;
  attempt_count: number;
  next_attempt_at: string | null;
  last_error: string;
  connection_name: string | null;
  provider: string | null;
};
