export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMilliseconds = 8_000,
) {
  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(),
    timeoutMilliseconds,
  );

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}
