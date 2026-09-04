// frontend/eslint.config.js(저장소 루트 설정)는 config-protection 훅이 에이전트의
// 수정을 막는다. e2e 디렉터리만 따로 타입 인식 검사를 켜려고 별도 설정 파일을 둔다.
// 쓰는 자리: package.json 의 "lint:e2e" — eslint --config e2e/lint.config.js "e2e/**/*.ts"
import path from "node:path";

import js from "@eslint/js";
import ts from "typescript-eslint";

// tsconfig.json(과 그 include 목록의 "e2e")은 frontend 루트에 있다. projectService 는
// 이 root 위로는 올라가 찾지 않으므로, 이 파일이 있는 e2e/ 가 아니라 한 단계 위로 잡는다.
const frontendRoot = path.resolve(import.meta.dirname, "..");

export default [
  js.configs.recommended,
  ...ts.configs.recommendedTypeChecked,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: frontendRoot },
    },
  },
];
