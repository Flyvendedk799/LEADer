export const dynamic = "force-dynamic";

import { Building2, Compass, Settings as SettingsIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { publicAiKeys } from "@/lib/ai/keys";
import { DEFAULT_WEIGHTS } from "@/lib/scoring";
import type { ExportPreferences, ScoreWeights } from "@/lib/types";
import { formatBudget } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileForm } from "@/components/settings/profile-form";
import { ScoringWeightsForm } from "@/components/settings/scoring-weights-form";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { AiProviderForm } from "@/components/settings/ai-provider-form";
import { SecurityForm } from "@/components/settings/security-form";
import type { PublicAiKeys } from "@/components/settings/ai-provider-fields";

const SETTINGS_TABS = ["profile", "scoring", "preferences", "ai", "security"] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Settings" description="Profile, scoring, and export preferences." />
        <EmptyState
          icon={SettingsIcon}
          title="No user found"
          description="Run the seed to create the power user, then revisit settings."
        />
      </div>
    );
  }

  // Prisma JSON blobs → typed shapes (see lib/types.ts).
  const weights = (user.scoringWeights as ScoreWeights | null) ?? DEFAULT_WEIGHTS;
  const exportPrefs = (user.exportPrefs as ExportPreferences | null) ?? null;
  const aiKeys: PublicAiKeys = publicAiKeys(user.aiKeys);
  const defaultTab: SettingsTab = SETTINGS_TABS.includes(searchParams?.tab as SettingsTab)
    ? (searchParams?.tab as SettingsTab)
    : "profile";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Settings"
        description="Tune your profile, scoring weights, and export defaults."
      />

      <Tabs defaultValue={defaultTab}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="scoring">Scoring</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          {/* Read-only summary of the owner-profile defaults the scorer is tuned to. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Compass className="h-4 w-4 text-muted-foreground" />
                Owner profile defaults
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Fullstack</Badge>
                <Badge variant="secondary">AI</Badge>
                <Badge variant="secondary">MVP</Badge>
                <Badge variant="secondary">Startup</Badge>
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <span className="tnum">{formatBudget(undefined, 100000, "DKK")}</span>
                </div>
                <div className="text-muted-foreground">Active opportunities</div>
                <div className="text-muted-foreground">Direct application route</div>
              </div>
              <p className="text-xs text-muted-foreground">
                These defaults bias discovery and scoring toward small (&lt; 100k DKK),
                active, directly-applicable AI / fullstack / MVP / startup work. Edit the
                fields below to personalise them.
              </p>
            </CardContent>
          </Card>

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

        <TabsContent value="preferences">
          <PreferencesForm user={{ exportPrefs }} />
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
