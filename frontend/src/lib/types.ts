export type MachineType = "VM" | "LXC" | "PHYSICAL" | "HOST" | "NETWORK";
export type MachineStatus =
  | "Draft"
  | "In Progress"
  | "Active"
  | "Maintenance"
  | "Retired"
  | "Archived";
export type TaskStatus = "Pending" | "In Progress" | "Completed" | "Blocked" | "Not Applicable";
export type TemplateScope = "ALL" | MachineType;

export interface ChecklistProgress {
  total_tasks: number;
  applicable_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  blocked_tasks: number;
  progress_percent: number;
}

export interface MachineBase {
  name: string;
  machine_type: MachineType;
  status: MachineStatus;
  host: string | null;
  vmid: number | null;
  ip_address: string | null;
  mac_address: string | null;
  dns_record: string | null;
  operating_system: string | null;
  operating_system_version: string | null;
  hypervisor: string | null;
  architecture: string | null;
  responsibilities: string | null;
  isp: string | null;
  connection_type: string | null;
  download_speed: string | null;
  upload_speed: string | null;
  wan_type: string | null;
  purpose: string | null;
  location: string | null;
  owner: string | null;
  deployment_date: string | null;
  cpu: string | null;
  cpu_cores: number | null;
  memory_value: number | null;
  memory_unit: string | null;
  disk_value: number | null;
  disk_unit: string | null;
  storage_location: string | null;
  gpu: string | null;
  network_interface: string | null;
  hardware_model: string | null;
  serial_number: string | null;
  asset_tag: string | null;
  tags: string[];
}

export interface Machine extends MachineBase {
  id: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  progress: ChecklistProgress;
  warnings: string[];
}

export interface MachineConnectivity {
  status: "online" | "offline" | "unknown";
  ip_address: string | null;
  checked_at: string;
  latency_ms: number | null;
  message: string;
}

export interface CurrentChangelog {
  version: string;
  display_version: string;
  released_at: string | null;
  content: string;
  available: boolean;
  seen: boolean;
}

export interface ChangelogSeen {
  version: string;
  seen: boolean;
}

export interface MachineListItem {
  id: number;
  name: string;
  machine_type: MachineType;
  status: MachineStatus;
  host: string | null;
  vmid: number | null;
  ip_address: string | null;
  dns_record: string | null;
  operating_system: string | null;
  operating_system_version: string | null;
  tags: string[];
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  progress: ChecklistProgress;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface Service {
  id: number;
  machine_id: number;
  name: string;
  description: string | null;
  port: number | null;
  protocol: string | null;
  url: string | null;
  is_external: boolean;
  notes: string | null;
  sort_order: number;
}

export interface ServiceInput {
  name: string;
  description?: string | null;
  port?: number | null;
  protocol?: string | null;
  url?: string | null;
  is_external?: boolean;
  notes?: string | null;
}

export interface StorageDevice {
  id: number;
  machine_id: number;
  name: string;
  capacity: string | null;
  purpose: string | null;
  notes: string | null;
  sort_order: number;
}

export interface StorageInput {
  name: string;
  capacity?: string | null;
  purpose?: string | null;
  notes?: string | null;
}

export interface NetworkDevice {
  id: number;
  machine_id: number;
  name: string;
  role: string;
  ip_address: string | null;
  notes: string | null;
  sort_order: number;
}

export interface NetworkDeviceInput {
  name: string;
  role?: string;
  ip_address?: string | null;
  notes?: string | null;
}

export interface NetworkSegment {
  id: number;
  machine_id: number;
  name: string;
  vlan_id: number | null;
  subnet: string | null;
  purpose: string | null;
  notes: string | null;
  sort_order: number;
}

export interface NetworkSegmentInput {
  name: string;
  vlan_id?: number | null;
  subnet?: string | null;
  purpose?: string | null;
  notes?: string | null;
}

export interface Dependency {
  id: number;
  machine_id: number;
  depends_on_machine_id: number | null;
  depends_on_machine_name: string | null;
  external_name: string | null;
  dependency_type: string;
  notes: string | null;
}

export interface DependencyInput {
  depends_on_machine_id?: number | null;
  external_name?: string | null;
  dependency_type: string;
  notes?: string | null;
}

export interface ReverseDependency {
  machine_id: number;
  machine_name: string;
  machine_type: MachineType;
  machine_status: MachineStatus;
  dependency_type: string;
  notes: string | null;
}

export interface Note {
  id: number;
  machine_id: number;
  title: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface MachineTask {
  id: number;
  machine_id: number;
  template_id: number | null;
  title: string;
  description: string | null;
  category: string;
  status: TaskStatus;
  required: boolean;
  is_custom: boolean;
  sort_order: number;
  due_date: string | null;
  completed_at: string | null;
  notes: string | null;
  blocked_reason: string | null;
  not_applicable_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskTemplate {
  id: number;
  title: string;
  description: string | null;
  category: string;
  machine_type_scope: TemplateScope;
  required: boolean;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ReminderTemplate {
  id: number;
  title: string;
  description: string | null;
  category: string;
  machine_type_scope: TemplateScope;
  interval_days: number;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MachineReminder {
  id: number;
  machine_id: number;
  template_id: number | null;
  title: string;
  description: string | null;
  category: string;
  interval_days: number;
  last_performed_at: string | null;
  next_due_at: string | null;
  enabled: boolean;
  is_custom: boolean;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ObsidianTemplate {
  id: number;
  name: string;
  machine_type: MachineType;
  description: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateVariable {
  variable: string;
  description: string;
}

export interface GeneratedDocument {
  id: number;
  machine_id: number;
  template_id: number | null;
  filename: string;
  content: string;
  created_at: string;
}

export interface GeneratedDocumentListItem {
  id: number;
  machine_id: number;
  filename: string;
  created_at: string;
}

export interface ActivityEvent {
  id: number;
  machine_id: number | null;
  event_type: string;
  description: string;
  created_at: string;
}

export interface DashboardData {
  summary: {
    total_machines: number;
    active_deployments: number;
    completed_deployments: number;
    incomplete_tasks: number;
    overdue_tasks: number;
    pending_tasks: number;
    blocked_tasks: number;
  };
  recent_machines: {
    id: number;
    name: string;
    machine_type: MachineType;
    status: MachineStatus;
    host: string | null;
    ip_address: string | null;
    updated_at: string;
    progress: ChecklistProgress;
  }[];
  needs_attention: {
    machine_id: number;
    machine_name: string;
    machine_type: MachineType;
    status: MachineStatus;
    reasons: string[];
  }[];
}

export interface AppSettings {
  app_name: string;
  timezone: string;
  default_machine_status: string;
  date_format: string;
  default_page_size: number;
  confirm_destructive: boolean;
  default_task_category: string;
  required_task_behavior: string;
  obsidian_filename_format: string;
  obsidian_include_checklist: boolean;
  obsidian_include_completed: boolean;
  obsidian_include_not_applicable: boolean;
  alerts_enabled: boolean;
  pending_task_threshold_hours: number;
  alert_frequency_hours: number;
  reminder_alerts_enabled: boolean;
  reminder_send_time: string;
  telegram_bot_token: string;
  telegram_chat_id: string;
  llm_enabled: boolean;
  llm_provider: "ollama" | "openai_compatible";
  llm_base_url: string;
  llm_model: string;
  llm_api_key: string;
  llm_timeout_seconds: number;
  llm_include_manual: boolean;
}

export interface MetaOptions {
  task_categories: string[];
  dependency_types: string[];
  machine_statuses: MachineStatus[];
  task_statuses: TaskStatus[];
  machine_types: { value: MachineType; label: string }[];
}

export interface ImportResult {
  valid: boolean;
  errors: string[];
  summary: Record<string, number>;
  imported?: boolean;
}
