import { PageHeader } from "@/components/shared/page-header";
import { DiscoveryWorkbench } from "@/components/discovery/discovery-workbench";

export const dynamic = "force-dynamic";

export default function DiscoverPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Discover"
        description="Find Danish software, MVP, AI and udbud leads before they enter your pipeline."
      />
      <DiscoveryWorkbench initialWorkspace="DK" />
    </div>
  );
}
