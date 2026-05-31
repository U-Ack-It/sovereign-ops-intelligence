export type FinancialAction = {
  amount: number;
  approved: boolean;
};

export function financialActionGuard(action: FinancialAction): void {
  if (action.amount > 0 && !action.approved) {
    throw new Error("Financial action requires approval");
  }
}
