import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Campos permitidos para actualización parcial (PATCH)
const ALLOWED_FIELDS = ["name", "basePriceCents", "isAvailable", "imageUrl", "description"] as const;
type AllowedField = typeof ALLOWED_FIELDS[number];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { productId: string } }
) {
  try {
    const body = await req.json();

    // Validar que el body no esté vacío
    if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
      return NextResponse.json(
        { error: "Body vacío o inválido" },
        { status: 400 }
      );
    }

    // Extraer solo los campos permitidos (PATCH parcial)
    const data: Partial<Record<AllowedField, unknown>> = {};
    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        data[field] = body[field];
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No se enviaron campos válidos para actualizar" },
        { status: 400 }
      );
    }

    // Verificar que el producto existe
    const product = await prisma.product.findUnique({
      where: { id: params.productId },
    });

    if (!product) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    // Actualizar el producto
    const updated = await prisma.product.update({
      where: { id: params.productId },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/admin/products/[productId]]", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { productId: string } }
) {
  try {
    const product = await prisma.product.findUnique({
      where: { id: params.productId },
      include: { category: true },
    });

    if (!product) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error("[GET /api/admin/products/[productId]]", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
