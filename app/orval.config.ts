import { defineConfig } from "orval";

export default defineConfig({
  // Block 1: TanStack Query hooks + TypeScript types
  Automation: {
    input: {
      target: "http://localhost:5189/openapi/v1.json",
    },
    output: {
      mode: "tags-split",
      target: "src/gen/endpoints",
      schemas: "src/gen/model",
      client: "react-query",
      httpClient: "axios",
      override: {
        operationName: (operation) => {
          if (!operation.operationId) return;
          let name = operation.operationId;

          if (name.endsWith("Endpoint")) {
            name = name.slice(0, -8);
            // Find repeated suffix like CreateUserCreateUser
            for (let i = Math.floor(name.length / 2); i >= 1; i--) {
              const suffix1 = name.substring(name.length - i);
              const suffix2 = name.substring(
                name.length - i * 2,
                name.length - i,
              );
              if (suffix1 === suffix2) {
                name = suffix1;
                break;
              }
            }
          }

          return name.charAt(0).toLowerCase() + name.slice(1);
        },
        mutator: {
          path: "src/lib/api-client.ts",
          name: "customInstance",
        },
      },
    },
    hooks: {
      afterAllFilesWrite: "pnpm exec prettier --write",
    },
  },

  // Block 2: Zod schemas (cùng spec, output vào cùng thư mục endpoints, tên file khác)
  AutomationZod: {
    input: {
      target: "http://localhost:5189/openapi/v1.json",
    },
    output: {
      mode: "tags-split",
      client: "zod",
      target: "src/gen/endpoints",
      fileExtension: ".zod.ts", // tránh xung đột với *.ts của hooks
      override: {
        operationName: (operation) => {
          if (!operation.operationId) return;
          let name = operation.operationId;

          if (name.endsWith("Endpoint")) {
            name = name.slice(0, -8);
            for (let i = Math.floor(name.length / 2); i >= 1; i--) {
              const suffix1 = name.substring(name.length - i);
              const suffix2 = name.substring(
                name.length - i * 2,
                name.length - i,
              );
              if (suffix1 === suffix2) {
                name = suffix1;
                break;
              }
            }
          }

          return name.charAt(0).toLowerCase() + name.slice(1);
        },
        zod: {
          variant: "mini", // tree-shakeable, bundle-size friendly
          version: 4, // pin cứng Zod v4
        },
      },
    },
  },
});
