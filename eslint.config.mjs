import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // react-hooks v6 ships new React Compiler-readiness rules (refs/purity/
    // set-state-in-effect). We aren't opting into the compiler in phase 1,
    // and these rules would otherwise flag patterns carried over verbatim
    // from the v19 UI prototype (BottomSheet's drag ref, event-handler
    // closures using Date.now(), the interest-detection effect). Revisit
    // when/if the React Compiler is actually adopted.
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Original completed-UI prototype kept for reference only; not part of the app build.
  globalIgnores([
    "qol-app-v19.tsx",
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
