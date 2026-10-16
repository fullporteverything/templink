import type { Metadata } from "next";
import { NewContactForm } from "@/components/admin/forms";
import { PageHeader } from "@/components/admin/ui";

export const metadata: Metadata = { title: "New contact" };

export default function NewContact() {
  return (
    <>
      <PageHeader back={{ href: "/admin/contacts", label: "CRM" }} title="New contact" />
      <div className="card max-w-2xl p-6">
        <NewContactForm />
      </div>
    </>
  );
}
