import type { HealthStepResult } from "@/backend/health/types";

/**
 * Verify all required Secrets Store bindings are present and non-empty.
 * Re-export from the existing co-located file for coordinator consumption.
 */
export { checkSecrets } from "@/backend/utils/health";

/**
 * Verify all required environment variables are present.
 * Re-export from the existing co-located file for coordinator consumption.
 */
export { checkEnvVars } from "@/backend/utils/health";
