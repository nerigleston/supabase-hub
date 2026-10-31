import { Nav } from "@/components/nav";
import { requireSession } from "@/lib/session";

export default async function PainelLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Nav email={session.email} />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
