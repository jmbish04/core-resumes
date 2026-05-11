export type ConfigRow<T = unknown> = {
  key: string;
  value: T;
  updatedAt: string | null;
  isDefault: boolean;
};

export type ConfigResult<T> = {
  value: T;
  isDefault: boolean;
};

export async function readConfig<T>(key: string, fallback: T): Promise<ConfigResult<T>> {
  const response = await fetch(`/api/config/${key}`, { credentials: "include" });

  if (!response.ok) {
    return { value: fallback, isDefault: true };
  }

  const row = (await response.json()) as ConfigRow<T>;
  return { value: row.value, isDefault: row.isDefault };
}
