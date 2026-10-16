"use client";

import { setContactStatus } from "@/app/admin/actions";
import { CONTACT_STATUSES, type ContactStatus } from "@/lib/types";

/** Change a contact's pipeline stage in place; submits as soon as the value changes. */
export function StatusSelect({ id, status }: { id: number; status: ContactStatus }) {
  return (
    <form action={setContactStatus}>
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        defaultValue={status}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-7 rounded-md border border-line bg-surface px-1.5 text-xs capitalize text-muted outline-none focus:border-accent"
        aria-label="Stage"
      >
        {CONTACT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </form>
  );
}
