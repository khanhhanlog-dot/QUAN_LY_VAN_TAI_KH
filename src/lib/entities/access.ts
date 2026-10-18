import type { EntityDef } from "./types";

export type EntityAccess = { view: boolean; create: boolean; update: boolean; delete: boolean; export: boolean; import: boolean };

/** Quyền thao tác trên một thực thể, khớp với RLS trong CSDL (CSDL vẫn là lớp kiểm tra cuối). */
export function entityAccess(entity: EntityDef, perms: Set<string>): EntityAccess {
  const has = (a: string) => perms.has(`${entity.perm}.${a}`);
  const sensitiveOk = !entity.sensitive || has("view_sensitive");
  const view = has("view") && sensitiveOk;
  const create = sensitiveOk && (entity.writeAsUpdate ? has("update") : has("create"));
  const update = sensitiveOk && has("update");
  const del = !entity.noDelete && sensitiveOk && (entity.writeAsUpdate ? has("update") : has("delete"));
  const exp = view && (entity.hasExport ? has("export") : true);
  return { view, create, update, delete: del, export: exp, import: create && !entity.parentKey && !entity.singleton };
}
