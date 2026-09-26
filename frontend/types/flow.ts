import type { Edge, Node } from "@xyflow/react";

export type BuilderNodeType =
  | "start"
  | "message"
  | "textInput"
  | "numberInput"
  | "emailInput"
  | "phoneInput"
  | "singleChoice"
  | "choice"
  | "multipleChoice"
  | "searchableList"
  | "rangeInput"
  | "ratingInput"
  | "opinionScale"
  | "dateInput"
  | "fileUpload"
  | "links"
  | "thankYou"
  | "whatsappRedirect"
  | "payment"
  | "appointment"
  | "ruleSet"
  | "decisionTable"
  | "condition"
  | "setVariable"
  | "subflow"
  | "return"
  | "end";

export type FactType = "string" | "number" | "boolean" | "date" | "enum";

export type FactDefinition = {
  type: FactType;
  required: boolean;
  description: string;
  values: string[];
};

export type FactSchema = Record<string, FactDefinition>;

export type LinkAction = {
  label: string;
  url: string;
  link_type?: string;
  new_tab?: boolean;
};

export type BuilderNodeData = {
  node_number?: number;
  label: string;
  description?: string;
  options?: string[];
  option_values?: string[];
  variable?: string;
  required?: boolean;
  min_length?: number;
  max_length?: number;
  pattern?: string;
  pattern_message?: string;
  allowed_domains?: string[];
  otp_required?: boolean;
  min_value?: number;
  max_value?: number;
  step?: number;
  min_selections?: number;
  max_selections?: number;
  min_date?: string;
  max_date?: string;
  file_types?: string[];
  max_file_size_mb?: number;
  max_files?: number;
  links?: LinkAction[];
  cta_label?: string;
  cta_url?: string;
  redirect_url?: string;
  whatsapp_phone?: string;
  whatsapp_message?: string;
  provider?: string;
  provider_connection_id?: string;
  storage_provider?: string;
  amount?: number;
  currency?: string;
  duration_minutes?: number;
  timezone?: string;
  opening_hour?: number;
  closing_hour?: number;
  logic_asset_id?: string;
  logic_version_id?: string;
  logic_name?: string;
  logic_kind?: "rule_set" | "decision_table";
  operator?: "==" | "!=" | ">" | ">=" | "<" | "<=" | "contains" | "not contains";
  value?: unknown;
  subflow_id?: string;
  subflow_version_id?: string;
  subflow_name?: string;
  version_number?: number;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, string>;
  input_schema?: FactSchema;
  output_schema?: FactSchema;
};

export type BuilderNode = Node<BuilderNodeData, BuilderNodeType>;
export type BuilderEdge = Edge;

export type FlowAppearance = {
  title: string;
  description: string;
  primary_color: string;
  background_color: string;
  surface_color: string;
  text_color: string;
  avatar_url: string;
  layout_style: "card" | "personal" | "modern" | "minimal";
};

export type FlowSettings = {
  enabled: boolean;
  show_progress_bar: boolean;
  response_delay_seconds: number;
  delivery_mode: "widget" | "link" | "embed";
  timezone: string;
  collect_visitor_context: boolean;
  email_notifications_enabled: boolean;
  send_incomplete_notifications: boolean;
  notification_from_email: string;
  notification_to_emails: string[];
  notification_subject: string;
  notification_subject_append: "none" | "chatbot_title" | "status" | "session_id";
  notification_reply_to_variable: string;
  notification_filters: Array<{
    variable: string;
    operator: "equals" | "not_equals" | "contains";
    value: string;
  }>;
};

export type FlowDocument = {
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  variables: Array<Record<string, unknown>>;
  appearance?: FlowAppearance;
  settings?: FlowSettings;
};
