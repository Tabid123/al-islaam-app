import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function isRecoverableLoadError(error: unknown) {
  const msg = String((error as any)?.message ?? error ?? "");
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("Load failed") ||
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError")
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  // Khaladaadka chunk/shabakadda: hal mar si otomaatig ah dib u soo celi bogga
  // si aan user-ka loogu hayn shaashad madhan.
  useEffect(() => {
    if (typeof window === "undefined" || !isRecoverableLoadError(error)) return;
    let last = 0;
    try {
      last = Number(sessionStorage.getItem("__root_error_reload_at") || 0);
    } catch {
      /* ignore */
    }
    if (Date.now() - last < 15000) return;
    try {
      sessionStorage.setItem("__root_error_reload_at", String(Date.now()));
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => window.location.reload(), 400);
    return () => clearTimeout(t);
  }, [error]);


  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
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
      { title: "Riyokaab Data —Ka iibso Internet raqiis ah." },
      { name: "description", content: "Buy mobile data packages for Hormuud, Somtel, Somlink, Somnet and Amtel in Somalia. Fast, reliable top-ups with instant delivery." },
      { name: "author", content: "Riyokaab" },
      { property: "og:title", content: "Riyokaab Data —Ka iibso Internet raqiis ah." },
      { property: "og:description", content: "Buy mobile data packages for Hormuud, Somtel, Somlink, Somnet and Amtel in Somalia. Fast, reliable top-ups with instant delivery." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Riyokaab Data —Ka iibso Internet raqiis ah." },
      { name: "twitter:description", content: "Buy mobile data packages for Hormuud, Somtel, Somlink, Somnet and Amtel in Somalia. Fast, reliable top-ups with instant delivery." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/b9457fe4-88dc-45f8-be83-5c84b2909550" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/b9457fe4-88dc-45f8-be83-5c84b2909550" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const CHUNK_RECOVERY_SCRIPT = `(function(){
  var KEY='__chunk_reload_at';
  function isChunkError(m){return typeof m==='string'&&(m.indexOf('Failed to fetch dynamically imported module')>-1||m.indexOf('error loading dynamically imported module')>-1||m.indexOf('Importing a module script failed')>-1);}
  function recover(m){
    if(!isChunkError(m))return;
    try{
      var last=Number(sessionStorage.getItem(KEY)||0);
      if(Date.now()-last<10000)return;
      sessionStorage.setItem(KEY,String(Date.now()));
    }catch(e){}
    if('caches' in window){try{caches.keys().then(function(k){return Promise.all(k.map(function(n){return caches.delete(n);}))}).finally(function(){location.reload()});return;}catch(e){}}
    location.reload();
  }
  window.addEventListener('error',function(e){recover(e&&e.message);});
  window.addEventListener('unhandledrejection',function(e){recover(e&&e.reason&&(e.reason.message||String(e.reason)));});
})();`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: CHUNK_RECOVERY_SCRIPT }} />
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
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
