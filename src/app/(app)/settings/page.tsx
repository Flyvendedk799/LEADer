import { OperationsPanel } from "@/components/settings/operations-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyForm } from "@/components/settings/company-form";
export const dynamic = "force-dynamic";

import { Settings as SettingsIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { publicAiKeys } from "@/lib/ai/keys";
import { DEFAULT_WEIGHTS } from "@/lib/scoring";
import type { ExportPreferences, ScoreWeights } from "@/lib/types";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileForm } from "@/components/settings/profile-form";
import { ScoringWeightsForm } from "@/components/settings/scoring-weights-form";
import { CalibrationPanel } from "@/components/settings/calibration-panel";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { AiProviderForm } from "@/components/settings/ai-provider-form";
import { SecurityForm } from "@/components/settings/security-form";
import { ApiTokensPanel } from "@/components/settings/api-tokens-panel";
import type { PublicAiKeys } from "@/components/settings/ai-provider-fields";

const SETTINGS_TABS = [
  "profile",
  "scoring",
  "learning",
  "preferences",
  "ai",
  "security",
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

export default async function SettingsPage(props: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="max-w-3xl">
        <PageHeader
          title="Settings"
          description="Profile, scoring, and export preferences."
        />
        <EmptyState
          icon={SettingsIcon}
          title="No user found"
          description="Run the seed to create the power user, then revisit settings."
        />
      </div>
    );
  }

  // Prisma JSON blobs → typed shapes (see lib/types.ts).
  const weights =
    (user.scoringWeights as ScoreWeights | null) ?? DEFAULT_WEIGHTS;
  const exportPrefs = (user.exportPrefs as ExportPreferences | null) ?? null;
  const aiKeys: PublicAiKeys = publicAiKeys(user.aiKeys);
  const defaultTab: SettingsTab = SETTINGS_TABS.includes(
    searchParams?.tab as SettingsTab,
  )
    ? (searchParams?.tab as SettingsTab)
    : "profile";

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Settings"
        description="Tune your profile, scoring weights, and export defaults."
      />

      <Tabs defaultValue={defaultTab}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="scoring">Scoring</TabsTrigger>
          <TabsTrigger value="learning">Learning</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <OperationsPanel />
          <CompanyForm value={user.companyProfile} />
          <ProfileForm
            user={{
              name: user.name,
              headline: user.headline,
              bio: user.bio,
              preferredProjectTypes: user.preferredProjectTypes,
              excludedCategories: user.excludedCategories,
              budgetMaxDkk: user.budgetMaxDkk,
              preferredCurrency: user.preferredCurrency,
            }}
          />
        </TabsContent>

        <TabsContent value="scoring">
          <ScoringWeightsForm weights={weights} />
        </TabsContent>

        <TabsContent value="learning">
          <CalibrationPanel />
        </TabsContent>

        <TabsContent value="preferences" className="space-y-6">
          <PreferencesForm user={{ exportPrefs }} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Crawler</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Public source fetches use a simple HTTP download. Same-host
                pages are capped by CRAWLER_MAX_PAGES_PER_RUN, and robots.txt is
                cached on the source.
              </p>
              <p>
                Set CRAWLER_ENABLE_PLAYWRIGHT=1 only on a local or self-hosted
                machine. That renders one JavaScript page with Playwright.
                Scheduled runs on Vercel stay on the HTTP fetch.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai">
          <AiProviderForm aiKeys={aiKeys} />
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="text-muted-foreground">Email</div>
              <div className="font-medium">{user.email}</div>
              <div className="text-muted-foreground">Role</div>
              <div className="font-medium">{user.role}</div>
            </CardContent>
          </Card>
          <SecurityForm hasPassword={Boolean(user.passwordHash)} />
          <ApiTokensPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
