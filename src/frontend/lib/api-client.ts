export type ApiRequestInit = Omit<RequestInit, "body"> & {
  body?: BodyInit | Record<string, unknown> | unknown[];
};

export type ToastVariant = "default" | "destructive" | "success";

export type ToastMessage = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  copyable?: boolean;
  codingPrompt?: string;
};

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export async function apiFetch<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;

  if (body && typeof body === "object" && !(body instanceof FormData) && !(body instanceof Blob)) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(body);
  }

  const response = await fetch(path, {
    ...init,
    body: body as BodyInit | undefined,
    credentials: "include",
    headers,
  });
  const payload = await readPayload(response);

  if (!response.ok) {
    const message = readErrorMessage(payload, response.statusText);
    toast({
      title: "Request failed",
      description: message,
      variant: "destructive",
      codingPrompt: `Please fix the following frontend API error:\n\nURL: ${path}\nMethod: ${init.method || "GET"}\nStatus: ${response.status} ${response.statusText}\nResponse Payload:\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
    });
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

export function apiGet<T>(path: string, init?: ApiRequestInit) {
  return apiFetch<T>(path, { ...init, method: "GET" });
}

export function apiPost<T>(path: string, body?: ApiRequestInit["body"], init?: ApiRequestInit) {
  return apiFetch<T>(path, { ...init, body, method: "POST" });
}

export function apiPut<T>(path: string, body?: ApiRequestInit["body"], init?: ApiRequestInit) {
  return apiFetch<T>(path, { ...init, body, method: "PUT" });
}

export function apiPatch<T>(path: string, body?: ApiRequestInit["body"], init?: ApiRequestInit) {
  return apiFetch<T>(path, { ...init, body, method: "PATCH" });
}

export function apiDelete<T>(path: string, init?: ApiRequestInit) {
  return apiFetch<T>(path, { ...init, method: "DELETE" });
}

export function toast(message: ToastMessage) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<ToastMessage>("app:toast", { detail: message }));
}

async function readPayload(response: Response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

function readErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = payload.error;
    return typeof error === "string" ? error : fallback;
  }

  return typeof payload === "string" && payload.length > 0 ? payload : fallback;
}
