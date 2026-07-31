function normalizeVersion(value: string | undefined): string {
  const version = (value ?? "dev").trim();
  return version.toLowerCase().startsWith("v") ? version.slice(1) : version;
}

export const FRONTEND_BUILD_VERSION = normalizeVersion(
  import.meta.env.VITE_TASKCENTRAL_VERSION,
);

export function runningVersionDiffers(
  frontendVersion: string,
  backendVersion: string | undefined,
): boolean {
  const frontend = normalizeVersion(frontendVersion);
  const backend = normalizeVersion(backendVersion);
  if (!backendVersion || frontend === "dev" || backend === "dev") return false;
  return frontend !== backend;
}
