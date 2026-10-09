import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const hasGoogle = !!process.env.GOOGLE_CLIENT_ID;
  const hasGithub = !!process.env.GITHUB_CLIENT_ID;

  return (
    <Suspense>
      <AuthForm mode="register" hasGoogle={hasGoogle} hasGithub={hasGithub} />
    </Suspense>
  );
}
