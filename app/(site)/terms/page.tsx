import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Terms & abuse" };

export default async function Terms() {
  const s = await getSettings();
  return (
    <article className="mx-auto max-w-2xl px-4 pt-6 pb-16 text-[15px] leading-relaxed sm:px-6 sm:pt-12">
      <h1 className="text-3xl font-semibold tracking-tight">Terms &amp; abuse policy</h1>
      <p className="mt-4 text-muted">
        {s.siteName} is a temporary file sharing service. By uploading you confirm you have the right to share the files.
      </p>
      <h2 className="mt-8 text-lg font-semibold">What you can&apos;t upload</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
        <li>Malware, phishing pages or anything designed to harm the recipient.</li>
        <li>Content you don&apos;t have the rights to share.</li>
        <li>Anything illegal where you or the recipient live.</li>
      </ul>
      <h2 className="mt-8 text-lg font-semibold">Retention</h2>
      <p className="mt-2 text-muted">
        Files are deleted when their link expires, reaches its download limit, or is deleted by the uploader or by us.
        Deleted files can&apos;t be recovered.
      </p>
      <h2 className="mt-8 text-lg font-semibold">Privacy</h2>
      <p className="mt-2 text-muted">
        We keep the approximate city of each upload and download (never a precise location) and a one-way hash of the IP
        address for rate limiting. The homepage shows anonymous activity: file type, size, city and time. It never
        shows file names, links or email addresses.
      </p>
      <h2 className="mt-8 text-lg font-semibold">Reporting</h2>
      <p className="mt-2 text-muted">
        Every share page has a <strong className="text-fg">Report abuse</strong> link. Reports go straight to our
        moderators, who can disable a link immediately.
      </p>
    </article>
  );
}
