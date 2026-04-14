import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { resetMswHandlers, server } from "./msw";

const matchMedia = (query: string): MediaQueryList => ({
  addEventListener: vi.fn(),
  addListener: vi.fn(),
  dispatchEvent: vi.fn(),
  matches: false,
  media: query,
  onchange: null,
  removeEventListener: vi.fn(),
  removeListener: vi.fn(),
});

class ResizeObserverMock {
  public disconnect(): void {}

  public observe(): void {}

  public unobserve(): void {}
}

class IntersectionObserverMock {
  public readonly root = null;
  public readonly rootMargin = "";
  public readonly thresholds = [];

  public disconnect(): void {}

  public observe(): void {}

  public takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  public unobserve(): void {}
}

beforeAll(() => {
  server.listen({
    onUnhandledRequest: "error",
  });
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(matchMedia),
    writable: true,
  });
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: ResizeObserverMock,
    writable: true,
  });
  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    value: IntersectionObserverMock,
    writable: true,
  });
  Object.defineProperty(globalThis, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
    writable: true,
  });
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
});

afterEach(() => {
  cleanup();
  resetMswHandlers();
  vi.restoreAllMocks();
});

afterAll(() => {
  server.close();
});
