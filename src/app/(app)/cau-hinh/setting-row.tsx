"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateSystemSetting } from "./actions";

export function SettingValueEditor({ settingKey, value, canEdit }: { settingKey: string; value: unknown; canEdit: boolean }) {
  const initial = JSON.stringify(value);
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  if (!canEdit) return <code className="text-sm">{initial}</code>;
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await updateSystemSetting(settingKey, v);
          if (res.ok) toast.success(res.message);
          else toast.error(res.error);
        });
      }}
    >
      <Input value={v} onChange={(e) => setV(e.target.value)} className="font-mono" aria-label={settingKey} />
      <Button type="submit" size="sm" variant="outline" disabled={pending || v === initial}>
        Lưu
      </Button>
    </form>
  );
}
