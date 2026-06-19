import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { publicAiKeys } from "@/lib/ai/keys";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/onboarding");
  if (user.onboardedAt) redirect("/");

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <OnboardingFlow
          user={{
            name: user.name,
            headline: user.headline,
            bio: user.bio,
            preferredProjectTypes: user.preferredProjectTypes,
            excludedCategories: user.excludedCategories,
            budgetMaxDkk: user.budgetMaxDkk,
            preferredCurrency: user.preferredCurrency,
            aiKeys: publicAiKeys(user.aiKeys),
          }}
        />
      </div>
    </main>
  );
}
