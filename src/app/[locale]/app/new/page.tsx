import { redirect } from "next/navigation";

export default async function NewJobPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/app/jobs?new=1`);
}
