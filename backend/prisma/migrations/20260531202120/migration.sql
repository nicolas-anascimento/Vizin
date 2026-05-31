/*
  Warnings:

  - A unique constraint covering the columns `[token]` on the table `Resetar_Senha` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Resetar_Senha_token_key" ON "Resetar_Senha"("token");
