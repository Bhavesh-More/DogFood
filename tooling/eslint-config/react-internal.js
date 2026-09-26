import babelParser from "@babel/eslint-parser";
import pluginReactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import { config as baseConfig } from "./base.js";

/** @type {import("eslint").Linter.Config[]} */
export const config = [
  ...baseConfig,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      globals: { ...globals.browser },
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ["@babel/preset-typescript", "@babel/preset-react"],
        },
      },
    },
  },
  pluginReactHooks.configs.flat.recommended,
];
