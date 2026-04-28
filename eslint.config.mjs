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

const runtimeAdapterImports = [
  "drizzle-orm",
  "drizzle-orm/*",
  "express",
  "express/*",
  "pg",
  "pg/*",
];

const crossModuleDeepImportPattern =
  "^\\.\\.\\/(?:\\.\\.\\/)*(?!platform\\/)[^/]+\\/(?:application|domain|email|http|infrastructure)\\/";

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
    files: ["apps/api/src/platform/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^\\.\\.\\/(?:\\.\\.\\/)*modules\\/",
              message: "Platform code must not depend on backend modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/api/src/modules/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: crossModuleDeepImportPattern,
              message:
                "Modules may depend on another module only through its public entrypoint, not deep layer files.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/api/src/modules/*/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: runtimeAdapterImports,
              message:
                "Domain code must stay independent of HTTP and database adapters.",
            },
            {
              regex: "^\\.\\.\\/(?:\\.\\.\\/)*platform\\/",
              message: "Domain code must not import platform infrastructure.",
            },
            {
              regex: "^\\.\\.\\/(?:application|email|http|infrastructure)\\/",
              message: "Domain code must not depend on outer identity layers.",
            },
            {
              regex: crossModuleDeepImportPattern,
              message:
                "Modules may depend on another module only through its public entrypoint, not deep layer files.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/api/src/modules/*/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: runtimeAdapterImports,
              message:
                "Application use cases must depend on ports instead of HTTP or database adapters.",
            },
            {
              regex: "^\\.\\.\\/(?:\\.\\.\\/)*platform\\/database(?:\\/|$)",
              message:
                "Application use cases must not import database infrastructure.",
            },
            {
              regex: "^\\.\\.\\/infrastructure(?:\\/|$)",
              message:
                "Application use cases must depend on ports, not concrete infrastructure adapters.",
            },
            {
              regex: crossModuleDeepImportPattern,
              message:
                "Modules may depend on another module only through its public entrypoint, not deep layer files.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/api/src/modules/*/infrastructure/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["express", "express/*"],
              message: "Infrastructure adapters must not depend on HTTP.",
            },
            {
              regex: crossModuleDeepImportPattern,
              message:
                "Modules may depend on another module only through its public entrypoint, not deep layer files.",
            },
          ],
        },
      ],
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
    files: [
      "apps/web/vite.config.ts",
      "apps/web/vitest.config.ts",
      "apps/web/playwright.config.ts",
    ],
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
