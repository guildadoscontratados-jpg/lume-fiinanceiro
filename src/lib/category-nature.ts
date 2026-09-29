import type { CategoryNature } from "@/generated/prisma-v9";

export const categoryNatures: CategoryNature[] = ["DESPESA_FAMILIAR", "VALOR_A_RECEBER", "MOVIMENTACAO_INTERNA", "A_CLASSIFICAR"];

export const categoryNatureLabels: Record<CategoryNature, string> = {
  DESPESA_FAMILIAR: "Despesa familiar",
  VALOR_A_RECEBER: "Valor a receber",
  MOVIMENTACAO_INTERNA: "Movimentação interna",
  A_CLASSIFICAR: "A classificar",
};

export function isCategoryNature(value: string): value is CategoryNature {
  return (categoryNatures as string[]).includes(value);
}
