import js from "@eslint/js";
import a11y from "eslint-plugin-jsx-a11y";
import hooks from "eslint-plugin-react-hooks";
import globals from "globals";
import ts from "typescript-eslint";

// eslint . 로 돈다. 검사 대상은 화면 소스뿐이다 — dist 와 꾸러미는 우리가 쓴 것이 아니다.
export default [
  { ignores: ["dist/**", "node_modules/**", "prototypes/**"] },
  js.configs.recommended,
  ...ts.configs.recommendedTypeChecked,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { "react-hooks": hooks, "jsx-a11y": a11y },
    rules: {
      ...hooks.configs.recommended.rules,
      ...a11y.flatConfigs.recommended.rules,
    },
  },
  {
    // 설정 파일은 타입 정보를 붙이지 않는다. tsconfig 가 이 파일들을 포함하지 않는다.
    files: ["*.config.{js,ts}", "eslint.config.js"],
    ...ts.configs.disableTypeChecked,
  },
  {
    // 검사 파일은 가짜 fetch 를 세우며 안 쓰는 매개변수를 밑줄로 받고, 실제 서버를
    // 부르지 않아도 시그니처를 맞추려고 async 를 쓴다. 소스 코드 규칙과는 다르다.
    files: ["src/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/require-await": "off",
    },
  },
];
