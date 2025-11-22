import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { AuthProvider } from "../contexts/AuthContext";
import { Toaster } from "@/components/ui/toaster";
import { TawkToChat } from "@/components/TawkToChat";
import { useEffect } from "react";
import { useRouter } from "next/router";
import Script from "next/script";
import { trackPageView } from "@/lib/analytics";

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  useEffect(() => {
    // Track page views on route change
    const handleRouteChange = (url: string) => {
      trackPageView(url);
    };

    router.events.on('routeChangeComplete', handleRouteChange);
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [router.events]);

  return (
    <>
      {/* Google Analytics 4 */}
      {process.env.NEXT_PUBLIC_GA_ID && (
        <>
          <Script
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
          />
          <Script
            id="google-analytics"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}', {
                  page_path: window.location.pathname,
                });
              `,
            }}
          />
        </>
      )}

      {/* Ahrefs Analytics */}
      <Script
        src="https://analytics.ahrefs.com/analytics.js"
        data-key="7Cena+E0qkEjHPjSxgB1zg"
        strategy="afterInteractive"
        async
      />

      <AuthProvider>
        <Component {...pageProps} />
        <Toaster />
        <TawkToChat />
      </AuthProvider>
    </>
  );
}
