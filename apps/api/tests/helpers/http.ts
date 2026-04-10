export const waitForHttpReady = async (
  url: string,
  timeoutMs = 15_000,
): Promise<Response> => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);

      return response;
    } catch {
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    }
  }

  throw new Error(`Timed out waiting for HTTP readiness at ${url}`);
};
