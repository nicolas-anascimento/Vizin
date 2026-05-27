-- CreateEnum
CREATE TYPE "Tipos" AS ENUM ('admin', 'usuario');

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "tipo" "Tipos" NOT NULL DEFAULT 'usuario';
