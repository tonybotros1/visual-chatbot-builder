import type { FactSchema, FlowDocument, LinkAction } from "./flow";

export type User = {
  id: string;
  name: string;
  email: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: User;
};

export type BotRecord = {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: "draft" | "published" | "archived";
  created_at: string;
  updated_at: string;
};

export type ValidationIssue = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  node_ids: string[];
  entity_type?: "bot" | "node" | "subflow" | "rule_set" | "decision" | null;
  entity_id?: string | null;
  path?: string | null;
  suggested_fix?: string | null;
};

export type ValidationReport = {
  valid: boolean;
  issues: ValidationIssue[];
};

export type RuntimeNode = {
  id: string;
  type: string;
  data: Record<string, unknown> & {
    label?: string;
    variable?: string;
    required?: boolean;
    options?: string[];
    option_values?: string[];
    min_value?: number;
    max_value?: number;
    step?: number;
    min_selections?: number;
    max_selections?: number;
    min_date?: string;
    max_date?: string;
    links?: LinkAction[];
    cta_label?: string;
    cta_url?: string;
    whatsapp_phone?: string;
    whatsapp_message?: string;
    provider?: string;
    amount?: number;
    currency?: string;
    duration_minutes?: number;
    timezone?: string;
    max_files?: number;
    max_file_size_mb?: number;
    file_types?: string[];
    otp_required?: boolean;
  };
};

export type ConversationState = {
  conversation_id: string;
  session_id: string;
  status: string;
  messages: RuntimeNode[];
  next_node: RuntimeNode | null;
  variables: Record<string, unknown>;
  trace: Array<Record<string, unknown>>;
  locale: string;
  direction: "ltr" | "rtl";
  appearance: {
    title?: string;
    description?: string;
    primary_color?: string;
    background_color?: string;
    surface_color?: string;
    text_color?: string;
    avatar_url?: string;
    layout_style?: "card" | "personal" | "modern" | "minimal";
  };
};

export type ConversationRecord = {
  id: string;
  session_id: string;
  status: string;
  current_node_id: string | null;
  variables: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
  answers: Array<{
    id: string;
    node_id: string;
    variable_name: string;
    value: unknown;
    created_at: string;
  }>;
  trace: Array<Record<string, unknown>>;
  source: string;
  metadata: Record<string, unknown>;
  tags: string[];
  notes: Array<{ text: string; created_at: string; user_id?: string }>;
};

export type LogicKind = "rule_set" | "decision_table";

export type LogicAssetRecord = {
  id: string;
  kind: LogicKind;
  name: string;
  slug: string;
  description: string;
  status: "draft" | "published" | "archived";
  created_at: string;
  updated_at: string;
};

export type LogicDraft = {
  id: string;
  logic_asset_id: string;
  version_number: 0;
  definition: Record<string, unknown>;
  input_schema: FactSchema;
  output_schema: FactSchema;
  published: false;
  updated_at: string;
};

export type LogicVersion = {
  id: string;
  logic_asset_id: string;
  version_number: number;
  definition: Record<string, unknown>;
  input_schema: FactSchema;
  output_schema: FactSchema;
  published: true;
  created_at: string;
};

export type LogicPublishResponse = {
  asset: LogicAssetRecord;
  version: LogicVersion;
};

export type BotTestScenario = {
  id: string;
  bot_id: string;
  name: string;
  answers: Record<string, unknown>;
  expected: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ScenarioRun = {
  scenario_id: string;
  passed: boolean;
  status: string;
  variables: Record<string, unknown>;
  failures: string[];
  trace: Array<Record<string, unknown>>;
};

export type BotAnalytics = {
  conversations: number;
  completed: number;
  active: number;
  completion_rate: number;
  drop_off_by_node: Record<string, number>;
  answers_by_node: Record<string, number>;
  node_metrics: Record<string, { entered: number; answered: number; dropoffs: number; errors: number; average_dwell_seconds: number }>;
};

export type TargetSegment = {
  id: string;
  name: string;
  slug: string;
  rules: Record<string, unknown>;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
};

export type DeploymentMode = "widget" | "embed" | "link";

export type DeploymentRecord = {
  id: string;
  bot_id: string;
  bot_version_id: string;
  target_segment_id: string | null;
  name: string;
  deployment_key: string;
  mode: DeploymentMode;
  environment: "development" | "staging" | "production";
  config: Record<string, unknown>;
  rules: Record<string, unknown>;
  status: "active" | "paused" | "archived";
  created_at: string;
  updated_at: string;
};

export type DeploymentBootstrap = {
  eligible: boolean;
  reasons: string[];
  deployment_key: string;
  mode: DeploymentMode;
  config: Record<string, unknown>;
  bot_slug: string | null;
  version_number: number | null;
  start_endpoint: string | null;
  eligibility_token: string | null;
};

export type CustomDomain = {
  id: string;
  deployment_id: string;
  hostname: string;
  verification_token: string;
  status: "pending" | "verified";
  verified_at: string | null;
  created_at: string;
};

export type IntegrationConnection = {
  id: string;
  kind: "webhook" | "email" | "sms" | "slack" | "storage" | "stripe" | "paypal" | "google_calendar" | "microsoft_calendar";
  name: string;
  config: Record<string, unknown>;
  has_secrets: boolean;
  status: "active" | "disabled";
  created_at: string;
  updated_at: string;
};

export type EventSubscription = {
  id: string;
  bot_id: string;
  connection_id: string;
  event: "conversation.started" | "conversation.completed" | "response.qualified";
  status: string;
  created_at: string;
};

export type IntegrationDelivery = {
  id: string;
  bot_id: string;
  conversation_id: string | null;
  connection_id: string;
  event: string;
  status: "pending" | "retrying" | "delivered" | "failed";
  attempt_count: number;
  next_attempt_at: string | null;
  last_error: string;
  response_code: number | null;
  created_at: string;
  delivered_at: string | null;
};

export type BotCollaborator = {
  id: string | null;
  user_id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "editor" | "viewer";
  owner: boolean;
  created_at: string | null;
};

export type AuditLogRecord = {
  id: string;
  bot_id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  created_at: string;
};

export type BotLocale = {
  id: string;
  bot_id: string;
  locale: string;
  name: string;
  direction: "ltr" | "rtl";
  translations: Record<string, unknown>;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type SubflowRecord = {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: "draft" | "published" | "archived";
  created_at: string;
  updated_at: string;
};

export type SubflowDraft = {
  id: string;
  subflow_id: string;
  version_number: 0;
  flow_json: FlowDocument;
  input_schema: FactSchema;
  output_schema: FactSchema;
  published: false;
  updated_at: string;
};

export type SubflowVersion = {
  id: string;
  subflow_id: string;
  version_number: number;
  input_schema: FactSchema;
  output_schema: FactSchema;
  published: true;
  created_at: string;
};

export type SubflowPublishResponse = {
  subflow: SubflowRecord;
  version: SubflowVersion;
};

export type DependencyRecord = {
  id: string;
  dependency_type: string;
  dependency_version_id: string;
  node_id: string;
  created_at: string;
};
