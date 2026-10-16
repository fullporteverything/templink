"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconTrash } from "./icons";

export function DeleteLink({ id, token }: { id: string; token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn-danger flex-1"
      disabled={busy}
      onClick={async () => {
        if (!confirm("Delete these files now? The link will stop working immediately.")) return;
        setBusy(true);
        await fetch(`/api/s/${id}/delete`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        router.refresh();
      }}
    >
      <IconTrash size={16} /> {busy ? "Deleting…" : "Delete now"}
    </button>
  );
}
