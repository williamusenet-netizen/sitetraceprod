import { TerrainDirectPage } from "@/components/terrain-direct-page";

export default async function Page(props: PageProps<"/operation/[incidentId]">) {
  const params = await props.params;

  return <TerrainDirectPage initialIncidentId={params.incidentId} />;
}
