export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  return <div className="kemo-app-route">{children}</div>;
}
