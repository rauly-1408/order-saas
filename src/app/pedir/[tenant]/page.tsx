import MenuClient from "./MenuClient";
import { prisma } from "@/app/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PedirPage({
    params,
}: {
    params: Promise<{ tenant: string }>;
}) {
    const { tenant: tenantSlug } = await params;

  try {
        const tenant = await prisma.tenant.findUnique({
                where: { slug: tenantSlug },
                select: { id: true, name: true, slug: true },
        });

      if (!tenant) {
              return (
                        <div style={{ padding: 40, color: "#f0ece4", background: "#0d0d0d", fontFamily: "monospace" }}>
                                    <h1>Tenant no encontrado: {tenantSlug}</h1>h1>
                        </div>div>
                      );
      }
    
        const categories = await prisma.category.findMany({
                where: { tenantId: tenant.id, isActive: true },
                orderBy: { sortOrder: "asc" },
                select: {
                          id: true,
                          name: true,
                          slug: true,
                          products: {
                                      where: { isActive: true, isAvailable: true },
                                      orderBy: { sortOrder: "asc" },
                                      select: {
                                                    id: true,
                                                    name: true,
                                                    description: true,
                                                    basePriceCents: true,
                                                    imageUrl: true,
                                      },
                          },
                },
        });
    
        return (
                <MenuClient
                          tenant={tenantSlug}
                          tenantName={tenant.name}
                          categories={categories}
                        />
              );
  } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const stack = e instanceof Error ? (e.stack ?? "") : "";
        const dbUrl = process.env.DATABASE_URL;
        return (
                <div style={{ padding: 40, color: "#f0ece4", background: "#0d0d0d", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                        <h1 style={{ color: "#e8a020" }}>Error de diagnostico — /pedir/{tenantSlug}</h1>h1>
                        <p><strong>DATABASE_URL configurada:</strong>strong> {dbUrl ? "SI — " + dbUrl.substring(0, 30) + "..." : "NO — variable no encontrada"}</p>p>
                        <h2>Error:</h2>h2>
                        <pre style={{ background: "#1a1a1a", padding: 16, borderRadius: 8, color: "#ff6b6b", overflow: "auto" }}>{msg}</pre>pre>
                        <h2>Stack:</h2>h2>
                        <pre style={{ background: "#1a1a1a", padding: 16, borderRadius: 8, fontSize: 11, color: "#888", overflow: "auto" }}>{stack.substring(0, 2000)}</pre>pre>
                </div>div>
              );
  }
}</h1>
