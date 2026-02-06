import { requireUser } from "@/lib/auth";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireUser(locale);

  return <div className="space-y-6">{children}</div>;
}

