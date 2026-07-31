import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  ActivityEvent,
  AppSettings,
  ChangelogSeen,
  CurrentChangelog,
  DashboardData,
  Dependency,
  DependencyInput,
  GeneratedDocument,
  GeneratedDocumentListItem,
  ImportResult,
  Machine,
  MachineConnectivity,
  MachineConnectivityListItem,
  MachineListItem,
  MachineReminder,
  MachineTask,
  MetaOptions,
  ReminderTemplate,
  Note,
  ObsidianTemplate,
  Page,
  NetworkDevice,
  NetworkDeviceInput,
  NetworkSegment,
  NetworkSegmentInput,
  ReverseDependency,
  Service,
  ServiceInput,
  StorageDevice,
  StorageInput,
  TaskTemplate,
  TemplateVariable,
  VersionStatus,
} from "./types";

export interface MachineListParams {
  search?: string;
  machine_type?: string;
  status?: string;
  host?: string;
  tag?: string;
  archived?: boolean;
  sort_by?: string;
  sort_dir?: string;
  page?: number;
  page_size?: number;
}

function qs(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  });
  const s = search.toString();
  return s ? `?${s}` : "";
}

export const useDashboard = () =>
  useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<DashboardData>("/dashboard") });

export const useCurrentChangelog = () =>
  useQuery({
    queryKey: ["changelog-current"],
    queryFn: () => api.get<CurrentChangelog>("/changelog/current"),
    staleTime: Infinity,
  });

export const useVersionStatus = () =>
  useQuery({
    queryKey: ["version-status"],
    queryFn: () => api.get<VersionStatus>("/version"),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

export function useMarkCurrentChangelogSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ChangelogSeen>("/changelog/current/seen"),
    onSuccess: () => {
      queryClient.setQueryData<CurrentChangelog>(
        ["changelog-current"],
        (current) => (current ? { ...current, seen: true } : current),
      );
    },
  });
}

export const useMachines = (params: MachineListParams) =>
  useQuery({
    queryKey: ["machines", params],
    queryFn: () => api.get<Page<MachineListItem>>(`/machines${qs({ ...params })}`),
  });

export const useMachine = (id: number | undefined) =>
  useQuery({
    queryKey: ["machine", id],
    queryFn: () => api.get<Machine>(`/machines/${id}`),
    enabled: id !== undefined,
  });

export const useMachineConnectivity = (id: number | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ["machine-connectivity", id],
    queryFn: () => api.get<MachineConnectivity>(`/machines/${id}/connectivity`),
    enabled: id !== undefined && enabled,
    refetchInterval: 30_000,
    staleTime: 10_000,
    retry: false,
  });

export const useMachineConnectivityList = (machineIds: number[]) =>
  useQuery({
    queryKey: ["machine-connectivity-list", machineIds],
    queryFn: () => {
      const search = new URLSearchParams();
      machineIds.forEach((machineId) => search.append("machine_ids", String(machineId)));
      return api.get<MachineConnectivityListItem[]>(
        `/machines/connectivity?${search.toString()}`,
      );
    },
    enabled: machineIds.length > 0,
    refetchInterval: 30_000,
    staleTime: 10_000,
    retry: false,
  });

export const useHosts = () =>
  useQuery({ queryKey: ["hosts"], queryFn: () => api.get<string[]>("/machines/hosts") });

export const useTags = () =>
  useQuery({ queryKey: ["tags"], queryFn: () => api.get<string[]>("/machines/tags") });

export const useMeta = () =>
  useQuery({
    queryKey: ["meta"],
    queryFn: () => api.get<MetaOptions>("/meta/options"),
    staleTime: 5 * 60 * 1000,
  });

export const useTasks = (machineId: number | undefined) =>
  useQuery({
    queryKey: ["tasks", machineId],
    queryFn: () => api.get<MachineTask[]>(`/machines/${machineId}/tasks`),
    enabled: machineId !== undefined,
  });

export const useReminders = (machineId: number | undefined) =>
  useQuery({
    queryKey: ["reminders", machineId],
    queryFn: () => api.get<MachineReminder[]>(`/machines/${machineId}/reminders`),
    enabled: machineId !== undefined,
  });

export const useReminderTemplates = () =>
  useQuery({
    queryKey: ["reminder-templates"],
    queryFn: () => api.get<ReminderTemplate[]>("/reminder-templates"),
  });

export const useServices = (machineId: number | undefined) =>
  useQuery({
    queryKey: ["services", machineId],
    queryFn: () => api.get<Service[]>(`/machines/${machineId}/services`),
    enabled: machineId !== undefined,
  });

export const useStorage = (machineId: number | undefined) =>
  useQuery({
    queryKey: ["storage", machineId],
    queryFn: () => api.get<StorageDevice[]>(`/machines/${machineId}/storage`),
    enabled: machineId !== undefined,
  });

export const useNetworkDevices = (machineId: number | undefined) =>
  useQuery({
    queryKey: ["network-devices", machineId],
    queryFn: () => api.get<NetworkDevice[]>(`/machines/${machineId}/network-devices`),
    enabled: machineId !== undefined,
  });

export const useNetworkSegments = (machineId: number | undefined) =>
  useQuery({
    queryKey: ["network-segments", machineId],
    queryFn: () => api.get<NetworkSegment[]>(`/machines/${machineId}/network-segments`),
    enabled: machineId !== undefined,
  });

export const useDependencies = (machineId: number | undefined) =>
  useQuery({
    queryKey: ["dependencies", machineId],
    queryFn: () => api.get<Dependency[]>(`/machines/${machineId}/dependencies`),
    enabled: machineId !== undefined,
  });

export const useReverseDependencies = (machineId: number | undefined) =>
  useQuery({
    queryKey: ["reverse-dependencies", machineId],
    queryFn: () => api.get<ReverseDependency[]>(`/machines/${machineId}/dependencies/reverse`),
    enabled: machineId !== undefined,
  });

export const useNotes = (machineId: number | undefined) =>
  useQuery({
    queryKey: ["notes", machineId],
    queryFn: () => api.get<Note[]>(`/machines/${machineId}/notes`),
    enabled: machineId !== undefined,
  });

export const useActivity = (machineId: number | undefined) =>
  useQuery({
    queryKey: ["activity", machineId],
    queryFn: () => api.get<ActivityEvent[]>(`/machines/${machineId}/activity`),
    enabled: machineId !== undefined,
  });

export const useDocuments = (machineId: number | undefined) =>
  useQuery({
    queryKey: ["documents", machineId],
    queryFn: () => api.get<GeneratedDocumentListItem[]>(`/machines/${machineId}/documents`),
    enabled: machineId !== undefined,
  });

export const useDocument = (machineId: number | undefined, documentId: number | undefined) =>
  useQuery({
    queryKey: ["document", machineId, documentId],
    queryFn: () => api.get<GeneratedDocument>(`/machines/${machineId}/documents/${documentId}`),
    enabled: machineId !== undefined && documentId !== undefined,
  });

export const useTaskTemplates = () =>
  useQuery({
    queryKey: ["task-templates"],
    queryFn: () => api.get<TaskTemplate[]>("/task-templates"),
  });

export const useObsidianTemplates = () =>
  useQuery({
    queryKey: ["obsidian-templates"],
    queryFn: () => api.get<ObsidianTemplate[]>("/obsidian-templates"),
  });

export const useTemplateVariables = () =>
  useQuery({
    queryKey: ["template-variables"],
    queryFn: () => api.get<TemplateVariable[]>("/obsidian-templates/variables"),
    staleTime: Infinity,
  });

export const useSettings = () =>
  useQuery({ queryKey: ["settings"], queryFn: () => api.get<AppSettings>("/settings") });

/** Invalidate everything related to one machine after a mutation. */
export function useInvalidateMachine() {
  const qc = useQueryClient();
  return (machineId: number) => {
    qc.invalidateQueries({ queryKey: ["machine", machineId] });
    qc.invalidateQueries({ queryKey: ["tasks", machineId] });
    qc.invalidateQueries({ queryKey: ["reminders", machineId] });
    qc.invalidateQueries({ queryKey: ["services", machineId] });
    qc.invalidateQueries({ queryKey: ["storage", machineId] });
    qc.invalidateQueries({ queryKey: ["network-devices", machineId] });
    qc.invalidateQueries({ queryKey: ["network-segments", machineId] });
    qc.invalidateQueries({ queryKey: ["dependencies", machineId] });
    qc.invalidateQueries({ queryKey: ["reverse-dependencies", machineId] });
    qc.invalidateQueries({ queryKey: ["notes", machineId] });
    qc.invalidateQueries({ queryKey: ["activity", machineId] });
    qc.invalidateQueries({ queryKey: ["documents", machineId] });
    qc.invalidateQueries({ queryKey: ["machines"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

export function useApiMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  onSuccess?: (result: TResult, args: TArgs) => void,
) {
  return useMutation({ mutationFn: fn, onSuccess });
}

export type {
  ServiceInput,
  StorageInput,
  NetworkDeviceInput,
  NetworkSegmentInput,
  DependencyInput,
  ImportResult,
};
