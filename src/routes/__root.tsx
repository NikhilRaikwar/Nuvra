import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";
import { Analytics } from "@vercel/analytics/react";

import appCss from "../styles.css?url";

const appUrl = import.meta.env.VITE_APP_URL?.replace(/\/$/, "");
const socialImageUrl = appUrl ? `${appUrl}/nuvra-og-banner.png` : "/nuvra-og-banner.png";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-base px-4">
      <div className="max-w-md text-center">
        <div className="font-mono text-[10px] uppercase tracking-widest text-ink/40 mb-4">
          404 / ROUTE NOT FOUND
        </div>
        <h1 className="text-2xl font-medium text-ink">Nothing here to ship.</h1>
        <p className="mt-2 text-sm text-ink/60">The page you're looking for doesn't exist.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center bg-ink px-4 py-2 text-xs font-medium text-cream-base hover:bg-accent transition-colors"
          >
            Back to Job Radar
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-base px-4">
      <div className="max-w-md text-center">
        <div className="font-mono text-[10px] uppercase tracking-widest text-accent mb-4">
          ERROR / SOMETHING BROKE
        </div>
        <h1 className="text-2xl font-medium">This page didn't load</h1>
        <p className="mt-2 text-sm text-ink/60">Try again, or head back to the radar.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="bg-ink text-cream-base px-4 py-2 text-xs font-medium hover:bg-accent transition-colors"
          >
            Try again
          </button>
          <a
            href="/"
            className="border border-border-dim px-4 py-2 text-xs font-medium hover:bg-cream-surface transition-colors"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Nuvra - Prove the next move." },
      {
        name: "description",
        content:
          "Nuvra turns live startup roles into grounded fit reports, proof projects, and truthful outreach for technical builders.",
      },
      {
        name: "keywords",
        content:
          "AI job agent, startup jobs, proof of work, job matching, technical careers, Speedrun Talent Network, OpenRouter, AI engineer jobs",
      },
      { name: "author", content: "Nuvra" },
      { name: "theme-color", content: "#ff5200" },
      { property: "og:url", content: appUrl || "/" },
      { property: "og:title", content: "Nuvra - Prove the next move." },
      {
        property: "og:description",
        content:
          "Live startup roles, grounded fit reports, shippable proof projects, and honest outreach drafts.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Nuvra" },
      { property: "og:image", content: socialImageUrl },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:type", content: "image/png" },
      {
        property: "og:image:alt",
        content: "Nuvra job intelligence agent: Live Role, Proof, Signal.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Nuvra - Prove the next move." },
      {
        name: "twitter:description",
        content: "Grounded startup-job intelligence for technical builders.",
      },
      { name: "twitter:image", content: socialImageUrl },
      {
        name: "twitter:image:alt",
        content: "Nuvra job intelligence agent: Live Role, Proof, Signal.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600&family=Work+Sans:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Analytics />
    </QueryClientProvider>
  );
}
