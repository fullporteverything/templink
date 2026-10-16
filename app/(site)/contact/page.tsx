import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 pt-6 pb-16 sm:px-6 lg:grid-cols-2 lg:pt-14">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">Get in touch</h1>
        <p className="mt-4 max-w-md text-muted">
          Questions, bigger limits for your team, or a problem with a link? Send us a message and we&apos;ll reply by
          email.
        </p>
        <p className="mt-6 max-w-md text-sm text-muted">
          To report a specific link, open it and use <strong className="text-fg">Report abuse</strong> under the file list.
          That gets it to our moderators fastest.
        </p>
      </div>
      <ContactForm />
    </div>
  );
}
