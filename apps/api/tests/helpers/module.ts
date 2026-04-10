import { vi } from "vitest";

export const resetModuleGraph = (): void => {
  vi.resetModules();
};

export const importFresh = async <TModule>(
  importModule: () => Promise<TModule>,
): Promise<TModule> => {
  resetModuleGraph();

  return importModule();
};
