"use client";

import Link from "next/link";
import { Fragment } from "react";
import { splitRoutes, TAB_EVENT, type PanelRoute } from "./panelLinks";

// Texto de NORA y del manual: párrafos, listas («- » o «1. ») y **negritas**.
// Las rutas del panel («**Carta → Productos**») se convierten en enlaces que
// llevan a esa pantalla y pestaña (ver panelLinks.ts).

function RouteLink({ route, children, onNavigate }: { route: PanelRoute; children: React.ReactNode; onNavigate?: () => void }) {
  return (
    <Link
      href={route.href}
      onClick={() => {
        // Si ya estás en esa pantalla, la pestaña se cambia con el aviso.
        if (route.tab) setTimeout(() => window.dispatchEvent(new CustomEvent(TAB_EVENT, { detail: route.tab })), 50);
        onNavigate?.();
      }}
      className="font-semibold text-[var(--p-brand)] underline underline-offset-2 hover:decoration-2"
    >
      {children}
      <span aria-hidden className="ml-0.5 text-[0.85em]">↗</span>
    </Link>
  );
}

function Inline({ text, tenant, onNavigate }: { text: string; tenant: string; onNavigate?: () => void }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
        const bold = part.startsWith("**") && part.endsWith("**") && part.length > 4;
        const inner = bold ? part.slice(2, -2) : part;
        const pieces = splitRoutes(inner, tenant, bold).map((p, j) =>
          p.route ? (
            <RouteLink key={j} route={p.route} onNavigate={onNavigate}>
              {p.text}
            </RouteLink>
          ) : (
            <Fragment key={j}>{p.text}</Fragment>
          )
        );
        return bold ? <strong key={i}>{pieces}</strong> : <Fragment key={i}>{pieces}</Fragment>;
      })}
    </>
  );
}

export default function RichText({ text, tenant, onNavigate, className = "space-y-1.5" }: { text: string; tenant: string; onNavigate?: () => void; className?: string }) {
  return (
    <div className={className}>
      {text
        .split("\n")
        .filter((l) => l.trim())
        .map((l, i) => {
          const num = /^\s*(\d+)[.)]\s+(.*)/.exec(l);
          if (num)
            return (
              <p key={i} className="flex gap-2">
                <span className="shrink-0 tabular-nums text-[var(--p-muted)]">{num[1]}.</span>
                <span>
                  <Inline text={num[2]} tenant={tenant} onNavigate={onNavigate} />
                </span>
              </p>
            );
          if (/^\s*[-•*]\s+/.test(l))
            return (
              <p key={i} className="flex gap-2">
                <span aria-hidden className="text-[var(--p-muted)]">•</span>
                <span>
                  <Inline text={l.replace(/^\s*[-•*]\s+/, "")} tenant={tenant} onNavigate={onNavigate} />
                </span>
              </p>
            );
          return (
            <p key={i}>
              <Inline text={l.replace(/^#+\s*/, "").replace(/^>\s*/, "")} tenant={tenant} onNavigate={onNavigate} />
            </p>
          );
        })}
    </div>
  );
}
