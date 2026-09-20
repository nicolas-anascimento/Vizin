// Executa a suíte de integração no ambiente de teste configurado.
import { spawnSync } from "node:child_process";
if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.startsWith("/vizin_contract_test_")) throw new Error("TEST_DATABASE_URL é obrigatório para test:integration (banco isolado)");
for (const file of ["api.test.ts", "payments.test.ts", "admin.integration.test.ts", "frontendContract.integration.test.ts"]) {
  const result = spawnSync(process.execPath, ["--env-file=.env", "--import", "tsx", `src/tests/integration/${file}`], { env: process.env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
