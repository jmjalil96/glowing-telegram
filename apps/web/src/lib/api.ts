export interface ApiErrorDetail {
  code: string;
  message: string;
  path: string;
  source: string;
}

export interface ApiErrorPayload {
  code: string;
  details: ApiErrorDetail[];
  message: string;
  requestId: string | null;
}

export interface ApiErrorResponse {
  error: ApiErrorPayload;
}

interface ApiErrorInit extends ApiErrorPayload {
  status: number;
}

export class ApiError extends Error {
  public readonly code: string;
  public readonly details: ApiErrorDetail[];
  public readonly requestId: string | null;
  public readonly status: number;

  public constructor({
    status,
    code,
    message,
    details,
    requestId,
  }: ApiErrorInit) {
    super(message);

    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

interface FetchJsonOptions extends Omit<
  RequestInit,
  "body" | "credentials" | "signal"
> {
  body?: unknown;
  signal?: AbortSignal;
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isApiErrorResponse = (value: unknown): value is ApiErrorResponse => {
  if (!isObjectRecord(value)) {
    return false;
  }

  const error = value.error;

  if (!isObjectRecord(error)) {
    return false;
  }

  return (
    typeof error.code === "string" &&
    typeof error.message === "string" &&
    Array.isArray(error.details) &&
    (typeof error.requestId === "string" || error.requestId === null)
  );
};

const createFallbackApiError = (response: Response): ApiError =>
  new ApiError({
    status: response.status,
    code: "HTTP_ERROR",
    details: [],
    message: response.statusText || "Request failed",
    requestId: null,
  });

const parseErrorResponse = async (response: Response): Promise<ApiError> => {
  const responseBody = (await response.json().catch(() => null)) as unknown;

  if (!isApiErrorResponse(responseBody)) {
    return createFallbackApiError(response);
  }

  return new ApiError({
    status: response.status,
    ...responseBody.error,
  });
};

export const isApiError = (error: unknown): error is ApiError =>
  error instanceof ApiError;

export const fetchJson = async <TResponse>(
  path: `/api/v1/${string}`,
  options: FetchJsonOptions = {},
): Promise<TResponse> => {
  const headers = new Headers(options.headers);

  headers.set("accept", "application/json");

  if (options.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(path, {
    ...options,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: "include",
    headers,
    signal: options.signal,
  });

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  const responseBody = (await response.json()) as unknown;

  return responseBody as TResponse;
};
