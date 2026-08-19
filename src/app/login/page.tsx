import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginClient } from "@/components/auth/login-client";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");
  return <LoginClient />;
}
