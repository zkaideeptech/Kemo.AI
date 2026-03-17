import { redirect } from "next/navigation";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  redirect(`/${locale}/app/jobs?job=${id}`);
}
