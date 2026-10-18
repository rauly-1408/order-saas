import { requireManagerPage } from "@/app/lib/auth";
import ArchivosClient from "./ArchivosClient";

export default async function ArchivosPage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ tipo?: string }> }) {
  const { tenant } = await params;
  await requireManagerPage(tenant);
  const { tipo } = await searchParams;
  return <ArchivosClient tenant={tenant} initialTab={tipo === "videos" ? "videos" : "imagenes"} />;
}
