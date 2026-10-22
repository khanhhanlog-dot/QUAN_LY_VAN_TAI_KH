"use client";
import type { ComponentType } from "react";
import { CreateAdvanceDialog, CreateExpenseDialog, type CreateActionProps } from "./create-dialogs";
import { CreatePayableDialog, CreatePayrollDialog, CreateReceivableDialog } from "./payroll-debt-dialogs";
import { AdvanceRowActions, ApprovalRowActions, ExpenseRowActions, type RowActionProps } from "./row-actions";
import { BillingRowActions, PayableRowActions, PaymentRowActions, PayrollRowActions, ReceivableRowActions } from "./payroll-debt-actions";

/** Biểu mẫu nghiệp vụ thay cho biểu mẫu chung khi bấm "Tạo …" trên bảng (EntityDef.createAction) */
export const CREATE_ACTIONS: Record<string, ComponentType<CreateActionProps>> = {
  advance: CreateAdvanceDialog,
  expense: CreateExpenseDialog,
  payroll: CreatePayrollDialog,
  receivable: CreateReceivableDialog,
  payable: CreatePayableDialog,
};

/** Nút thao tác trên từng dòng (EntityDef.rowActions) */
export const ROW_ACTIONS: Record<string, ComponentType<RowActionProps>> = {
  approval: ApprovalRowActions,
  advance: AdvanceRowActions,
  expense: ExpenseRowActions,
  payroll: PayrollRowActions,
  receivable: ReceivableRowActions,
  payable: PayableRowActions,
  billing: BillingRowActions,
  payment: PaymentRowActions,
};

/** Độ rộng cột thao tác (px) theo loại nút */
export const ROW_ACTION_WIDTH: Record<string, number> = {
  approval: 290,
  advance: 170,
  expense: 150,
  payroll: 210,
  receivable: 250,
  payable: 250,
  billing: 170,
  payment: 150,
};
