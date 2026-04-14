const delay = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const waitForHttpResponse = async (
  url: string,
  matcher: (response: Response) => boolean | Promise<boolean>,
  timeoutMs = 15_000,
): Promise<Response> => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);

      if (await matcher(response.clone())) {
        return response;
      }
    } catch {
      // Keep polling until the deadline is reached.
    }

    await delay(100);
  }

  throw new Error(`Timed out waiting for HTTP response at ${url}`);
};

export const waitForHttpReady = async (
  url: string,
  timeoutMs = 15_000,
): Promise<Response> => waitForHttpResponse(url, () => true, timeoutMs);

export const expectHttpUnavailable = async (
  url: string,
  timeoutMs = 1_000,
): Promise<void> => {
  try {
    await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return;
  }

  throw new Error(`Expected HTTP request to fail for ${url}`);
};
