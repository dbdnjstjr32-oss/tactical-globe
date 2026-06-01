export const dynamic = "force-dynamic";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ReactNode } from "react";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "";

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;

  if (token !== "tactical_admin_ok") {
    redirect("/admin/login");
  }

  return <>{children}</>;
}
