"use client";
import type { ComponentType } from "react";
import { CreateAdvanceDialog, CreateExpenseDialog, type CreateActionProps } from "./create-dialogs";
import { AdvanceRowActions, ApprovalRowActions, ExpenseRowActions, type RowActionProps } from "./row-actions";

/** Biểu mẫu nghiệp vụ thay cho biểu mẫu chung khi bấm "Tạo …" trên bảng (EntityDef.createAction) */
export const CREATE_ACTIONS: Record<string, ComponentType<CreateActionProps>> = {
  advance: CreateAdvanceDialog,
  expense: CreateExpenseDialog,
};

/** Nút thao tác trên từng dòng (EntityDef.rowActions) */
export const ROW_ACTIONS: Record<string, ComponentType<RowActionProps>> = {
  approval: ApprovalRowActions,
  advance: AdvanceRowActions,
  expense: ExpenseRowActions,
};

/** Độ rộng cột thao tác (px) theo loại nút */
export const ROW_ACTION_WIDTH: Record<string, number> = { approval: 290, advance: 170, expense: 150 };
