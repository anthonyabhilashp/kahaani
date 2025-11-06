import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { AuthProvider } from "../contexts/AuthContext";
import { Toaster } from "@/components/ui/toaster";
import { TawkToChat } from "@/components/TawkToChat";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
      <Toaster />
      <TawkToChat />
    </AuthProvider>
  );
}
