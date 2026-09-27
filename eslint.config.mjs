import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: { obsidianmd },
    rules: {
      "obsidianmd/settings-tab/no-manual-html-headings": "error",
      "obsidianmd/settings-tab/prefer-setting-definitions": "error",
      "obsidianmd/settings-tab/prefer-update-over-display": "error",
      "obsidianmd/settings-tab/require-display": "error"
    }
  }
];
