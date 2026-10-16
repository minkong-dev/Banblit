import js from "@eslint/js";
import a11y from "eslint-plugin-jsx-a11y";
import hooks from "eslint-plugin-react-hooks";
import globals from "globals";
import ts from "typescript-eslint";

// lint 대상은 화면 소스입니다. dist 와 node_modules 는 제외합니다.
export default [
  // manual/ 은 매뉴얼 캡처 도구입니다. tsconfig.json 의 include 에 없어 타입 정보를 쓰는 lint 가 거부하므로 제외합니다.
  { ignores: ["dist/**", "node_modules/**", "manual/**"] },
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
    // 설정 파일은 타입 정보 없이 lint 합니다. eslint.config.js 는 tsconfig.json 의 include 에 없습니다.
    files: ["*.config.{js,ts}", "eslint.config.js"],
    ...ts.configs.disableTypeChecked,
  },
  {
    // 테스트 파일은 _ 로 시작하는 미사용 인자와 await 없는 async 함수(fetch mock)를 허용합니다.
    files: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/require-await": "off",
    },
  },
];
