import type { Segment } from "@/app/lib/retention";

export type CustomerRow = {
  id: string;
  name: string | null;
  phone: string;
  segment: Segment;
  ordersCount: number;
  totalSpentCents: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  marketingConsent: boolean;
};

export type SegmentStat = { segment: Segment; count: number; reachable: number };

export type CouponRow = {
  id: string;
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  minOrderCents: number;
  maxRedemptions: number | null;
  redeemedCount: number;
  oncePerCustomer: boolean;
  active: boolean;
  expiresAt: string | null;
};

export type CampaignRow = {
  id: string;
  name: string;
  status: "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "CANCELLED";
  targetSegment: Segment;
  messageBody: string;
  couponId: string | null;
  couponCode: string | null;
  createdAt: string;
  recipients: number;
  sent: number;
  converted: number;
  revenueCents: number;
};

export type Overview = {
  restaurant: string;
  aiEnabled: boolean;
  segments: SegmentStat[];
  customers: CustomerRow[];
  coupons: CouponRow[];
  campaigns: CampaignRow[];
};

export const euros = (cents: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

// Colores de cada segmento (insignias y tarjetas).
export const SEGMENT_STYLE: Record<Segment, string> = {
  NEW: "bg-sky-50 text-sky-700",
  REGULAR: "bg-[var(--p-brand-soft)] text-[var(--p-brand)]",
  VIP: "bg-amber-50 text-amber-700",
  AT_RISK: "bg-[var(--p-accent-soft)] text-[var(--p-accent)]",
};

export const card = "rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]";
export const input = "w-full rounded-lg border border-[var(--p-line)] px-3 py-2 text-sm outline-none focus:border-[var(--p-brand)]";
export const label = "mb-1 block text-[13px] font-medium text-[var(--p-muted)]";
export const primaryBtn = "p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
export const ghostBtn = "p-press rounded-full px-4 py-2 text-sm font-medium text-[var(--p-muted)] hover:bg-black/[0.04]";
