import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Loader2,
  CreditCard,
  CheckCircle2,
  XCircle,
  Sparkles,
  ArrowLeft,
  Coins,
  Zap,
  Info
} from "lucide-react";
import { useCredits } from "../hooks/useCredits";

type CreditPackage = {
  id: string;
  credits: number;
  price: number;
  pricePerCredit: number;
  popular?: boolean;
  bestValue?: boolean;
  savings?: string;
};

const packages: CreditPackage[] = [
  {
    id: "starter",
    credits: 250,
    price: 20,
    pricePerCredit: 0.08,
    savings: "~25 stories"
  },
  {
    id: "popular",
    credits: 1000,
    price: 70,
    pricePerCredit: 0.07,
    popular: true,
    savings: "~100 stories"
  },
  {
    id: "pro",
    credits: 3000,
    price: 180,
    pricePerCredit: 0.06,
    bestValue: true,
    savings: "~300 stories"
  }
];

export default function CreditsPage() {
  const router = useRouter();
  const { balance: creditBalance, loading: creditsLoading, refetch: refreshBalance } = useCredits();
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCanceled, setShowCanceled] = useState(false);

  // Check if page is embedded (loaded in iframe)
  const isEmbedded = router.query.embedded === 'true';

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    // Check for success/canceled params from Stripe redirect
    if (router.query.success === 'true') {
      setShowSuccess(true);
      refreshBalance(); // Refresh credits after purchase
      // Clear URL params after showing message
      setTimeout(() => {
        setShowSuccess(false);
        router.replace('/credits', undefined, { shallow: true });
      }, 5000);
    } else if (router.query.canceled === 'true') {
      setShowCanceled(true);
      setTimeout(() => {
        setShowCanceled(false);
        router.replace('/credits', undefined, { shallow: true });
      }, 3000);
    }
  }, [router.query]);

  // Load and initialize Paddle.js
  useEffect(() => {
    // Load Paddle.js script
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.async = true;

    script.onload = () => {
      // Initialize Paddle
      if (typeof window !== 'undefined' && (window as any).Paddle) {
        (window as any).Paddle.Initialize({
          token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN!,
          eventCallback: (event: any) => {
            if (event.name === 'checkout.completed') {
              console.log('Paddle checkout completed:', event);
              setShowSuccess(true);
              refreshBalance();
              // Clear _ptxn parameter
              router.replace('/credits', undefined, { shallow: true });
            } else if (event.name === 'checkout.closed') {
              console.log('Paddle checkout closed');
              setPurchasing(null);
              // Clear _ptxn parameter
              router.replace('/credits', undefined, { shallow: true });
            }
          }
        });

        // Check for _ptxn parameter and open checkout
        const transactionId = router.query._ptxn as string;
        if (transactionId) {
          console.log('Opening Paddle checkout for transaction:', transactionId);
          (window as any).Paddle.Checkout.open({
            transactionId: transactionId
          });
        }
      }
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup script on unmount
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, [router.query._ptxn]);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      router.push('/');
      return;
    }

    setLoading(false);
  };

  const handlePurchase = async (pkg: CreditPackage) => {
    setPurchasing(pkg.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Please log in to purchase credits');
        setPurchasing(null);
        return;
      }

      console.log('Creating checkout for:', pkg.credits, 'credits');

      const response = await fetch('/api/paddle/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          credits: pkg.credits,
          price: pkg.price,
        }),
      });

      console.log('Checkout response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Checkout API error:', errorData);
        alert(`Error: ${errorData.error || 'Failed to create checkout'}`);
        setPurchasing(null);
        return;
      }

      const data = await response.json();
      console.log('Checkout data:', data);

      if (data.checkoutUrl) {
        console.log('Redirecting to:', data.checkoutUrl);
        // Redirect to Paddle Checkout
        window.location.href = data.checkoutUrl;
      } else {
        console.error('No checkoutUrl in response:', data);
        alert('Failed to create checkout session - no URL returned');
        setPurchasing(null);
      }
    } catch (error) {
      console.error('Purchase error:', error);
      alert(`Failed to initiate purchase: ${error}`);
      setPurchasing(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Main Content */}
      <div className="flex-1 w-full">
        {/* Mobile Header - Hide when embedded */}
        {!isEmbedded && (
        <div className="md:hidden border-b border-gray-800 bg-gray-950 sticky top-0 z-20 px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push('/')}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-base font-semibold text-white">Buy Credits</h1>
            <div className="flex items-center gap-1 bg-gray-800/50 rounded-lg px-2 py-1">
              <Coins className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-sm font-semibold text-white">{creditBalance ?? 0}</span>
            </div>
          </div>
        </div>
        )}

        {/* Page Content */}
        <div className="px-4 md:px-8 py-6 md:py-8">
          {/* Desktop Header with Balance */}
          {!isEmbedded && (
          <div className="hidden md:flex items-center justify-between mb-10">
            <div>
              <h1 className="text-2xl font-semibold text-white">Buy Credits</h1>
              <p className="text-sm text-gray-400 mt-1">Choose a package that fits your needs</p>
            </div>
            <div className="flex items-center gap-2 bg-gray-800/50 rounded-lg px-3 py-2">
              <Coins className="w-4 h-4 text-orange-500" />
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-semibold text-white">{creditBalance ?? 0}</span>
                <span className="text-xs text-gray-500">credits</span>
              </div>
            </div>
          </div>
          )}

          {/* Success/Canceled Alerts */}
          {showSuccess && (
            <div className="mb-6">
              <div className="bg-green-900/20 border border-green-500 rounded-lg p-4 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-400 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold">Payment Successful!</h3>
                  <p className="text-sm text-gray-300">Your credits have been added to your account.</p>
                </div>
              </div>
            </div>
          )}

          {showCanceled && (
            <div className="mb-6">
              <div className="bg-yellow-900/20 border border-yellow-500 rounded-lg p-4 flex items-center gap-3">
                <XCircle className="w-6 h-6 text-yellow-400 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold">Payment Canceled</h3>
                  <p className="text-sm text-gray-300">Your payment was canceled. No charges were made.</p>
                </div>
              </div>
            </div>
          )}

          {/* Credit Packages */}
          <div className="mb-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className={`relative rounded-xl border transition-all duration-200 hover:-translate-y-1 ${
                    pkg.popular
                      ? "bg-gradient-to-b from-orange-500/5 to-transparent border-orange-500/30 shadow-lg shadow-orange-500/5"
                      : pkg.bestValue
                      ? "bg-gradient-to-b from-green-500/5 to-transparent border-green-500/30 shadow-lg shadow-green-500/5"
                      : "bg-gray-900/40 border-gray-800/60 hover:border-gray-700"
                  }`}
                >
                  {/* Badge */}
                  {pkg.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                      <span className="bg-gradient-to-r from-orange-500 to-orange-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-lg">
                        Popular
                      </span>
                    </div>
                  )}
                  {pkg.bestValue && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                      <span className="bg-gradient-to-r from-green-500 to-green-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-lg flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        Best Value
                      </span>
                    </div>
                  )}

                  <div className="p-6">
                    {/* Credits */}
                    <div className="mb-4">
                      <div className="flex items-baseline justify-center gap-1.5 mb-1">
                        <h3 className="text-3xl font-bold text-white">{pkg.credits}</h3>
                        <span className="text-sm text-gray-500 font-medium">credits/Lifetime</span>
                        <div className="relative group">
                          <Info className="w-3.5 h-3.5 text-gray-600 hover:text-orange-500 cursor-help transition-colors ml-0.5" />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 hidden group-hover:block z-50 pointer-events-none">
                            <div className="bg-gray-800 backdrop-blur-sm text-white rounded-lg px-3 py-2 shadow-2xl border border-gray-700 min-w-max">
                              <div className="space-y-0.5 text-[11px] font-medium">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-orange-400">1</span>
                                  <span className="text-gray-300">credit per image</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-orange-400">1</span>
                                  <span className="text-gray-300">credit per audio</span>
                                </div>
                              </div>
                              <div className="absolute top-full left-1/2 -translate-x-1/2">
                                <div className="border-[5px] border-transparent border-t-gray-800"></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <p className="text-center text-xs text-gray-500">{pkg.savings}</p>
                    </div>

                    {/* Price */}
                    <div className="text-center mb-5">
                      <div className="flex items-baseline justify-center gap-0.5 mb-1">
                        <span className="text-4xl font-bold text-white">${pkg.price}</span>
                      </div>
                      <p className="text-xs text-gray-500">${pkg.pricePerCredit.toFixed(2)} per credit</p>
                    </div>

                    {/* Buy Button */}
                    <Button
                      onClick={() => handlePurchase(pkg)}
                      disabled={purchasing !== null}
                      className={`w-full font-semibold text-sm h-10 rounded-lg transition-all ${
                        pkg.popular
                          ? "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg shadow-orange-500/25"
                          : pkg.bestValue
                          ? "bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-lg shadow-green-500/25"
                          : "bg-gray-800 hover:bg-gray-700 text-white border border-gray-700"
                      }`}
                    >
                      {purchasing === pkg.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Processing...
                        </>
                      ) : (
                        "Buy Now"
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* How Credits Work */}
          <Card className="bg-gray-900/30 border-gray-800/50 p-6">
            <h3 className="text-lg font-semibold mb-5">How Credits Work</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-xs font-semibold mb-3 text-gray-400 uppercase tracking-wider">What Credits Cover</h4>
                <ul className="space-y-2.5 text-gray-400 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span><span className="text-white font-medium">Each Scene:</span> 2 credits (1 image + 1 audio)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span><span className="text-white font-medium">Typical Story:</span> ~10 credits (5 scenes, ~1 minute)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span><span className="text-white font-medium">Video Generation:</span> Free</span>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-semibold mb-3 text-gray-400 uppercase tracking-wider">Key Benefits</h4>
                <ul className="space-y-2.5 text-gray-400 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span><span className="text-white font-medium">One-time purchase</span> - credits never expire</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>New users get 10 free credits</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>Secure payments</span>
                  </li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
