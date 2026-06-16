import { HeaderSkeleton, DashboardSkeleton } from "@/components/shared/loading-skeletons";
export default function Loading() {
  return (
    <div>
      <HeaderSkeleton />
      <DashboardSkeleton />
    </div>
  );
}
