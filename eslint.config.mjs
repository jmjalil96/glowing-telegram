import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

const sharedTypeScriptRules = {
  "@typescript-eslint/consistent-type-imports": "error",
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      args: "all",
      argsIgnorePattern: "^_",
      caughtErrors: "all",
      caughtErrorsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
    },
  ],
};

export default defineConfig(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/routeTree.gen.ts",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    files: ["apps/api/**/*.ts"],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "apps/api/drizzle.config.ts",
            "apps/api/vitest.config.ts",
          ],
          defaultProject: "apps/api/tsconfig.json",
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: sharedTypeScriptRules,
  },
  {
    files: ["apps/api/tests/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: {
          defaultProject: "apps/api/tests/tsconfig.json",
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: {
          defaultProject: "apps/web/tsconfig.app.json",
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...sharedTypeScriptRules,
      ...reactHooks.configs.flat.recommended.rules,
      ...reactRefresh.configs.vite.rules,
    },
  },
  {
    files: ["apps/web/vite.config.ts"],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: {
          defaultProject: "apps/web/tsconfig.node.json",
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: sharedTypeScriptRules,
  },
  {
    files: ["apps/web/vitest.config.ts", "apps/web/playwright.config.ts"],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "apps/web/vitest.config.ts",
            "apps/web/playwright.config.ts",
          ],
          defaultProject: "apps/web/tests/tsconfig.json",
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: sharedTypeScriptRules,
  },
  {
    files: ["apps/web/tests/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: {
          defaultProject: "apps/web/tests/tsconfig.json",
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: sharedTypeScriptRules,
  },
  {
    files: ["apps/web/src/routes/**/*.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: ["apps/web/src/components/ui/**/*.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: ["apps/web/tests/**/*.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
);
