import babelParser from "@babel/eslint-parser";
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import turboPlugin from "eslint-plugin-turbo";

/**
 * Shared ESLint configuration.
 *
 * TypeScript 7 (the native compiler) ships no classic JS API, so typed linting
 * via typescript-eslint is unavailable. We parse TS/TSX with Babel and leave
 * undefined/unused identifier checks to `tsc --noEmit` (noUnusedLocals etc.).
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  js.configs.recommended,
  eslintConfigPrettier,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ["@babel/preset-typescript"],
        },
      },
    },
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "off",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": "off",
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // The TypeScript compiler performs these checks with full type information.
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-redeclare": "off",
    },
  },
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**"],
  },
];
