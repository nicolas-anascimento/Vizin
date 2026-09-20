export { recordHandover } from "./handoverController.ts";
import { recordHandover } from "./handoverController.ts";
// Alias legado de retirada que reutiliza o fluxo de fotos e confirmação das duas partes.
export const createWithdrawal = recordHandover(false);
