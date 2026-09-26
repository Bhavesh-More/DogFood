import { config } from "@dogfood/eslint-config/react-internal";

export default [
  ...config,
  {
    ignores: ["dist/**", "scripts/**"],
  },
];
