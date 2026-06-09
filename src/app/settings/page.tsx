export const dynamic = "force-dynamic";

import { Building2, Compass, Settings as SettingsIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
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

type AiKeys = { provider?: string; baseUrl?: string; model?: string } | null;

export default async function SettingsPage() {
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
  const aiKeys = (user.aiKeys as AiKeys) ?? null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Settings"
        description="Tune your profile, scoring weights, and export defaults."
      />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="scoring">Scoring</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
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
          <PreferencesForm user={{ exportPrefs, aiKeys }} />
        </TabsContent>
      </Tabs>
    </div>
  );
}