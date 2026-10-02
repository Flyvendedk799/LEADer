import { redirect } from "next/navigation";
export default async function GlobalPage(props: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const searchParams = await props.searchParams;
  const params = new URLSearchParams({ workspace: "GLOBAL" });
  if (typeof searchParams.q === "string") {
    params.set("q", searchParams.q);
    redirect("/deals?" + params);
  }
  redirect("/?" + params);
}
