import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["output/**", "**/tests-dist/**", "**/node_modules/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // the layout/render code intentionally uses `any` for a few internal scratch fields
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  }
);
