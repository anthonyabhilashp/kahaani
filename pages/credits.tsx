import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, CreditCard, CheckCircle2, XCircle, Sparkles } from "lucide-react";

export default function CreditsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [user, setUser] = useState<any>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCanceled, setShowCanceled] = useState(false);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    // Check for success/canceled params from Stripe redirect
    if (router.query.success === 'true') {
      setShowSuccess(true);
      fetchCredits(); // Refresh credits after purchase
      // Clear URL params after showing message
      setTimeout(() => {
        router.replace('/credits', undefined, { shallow: true });
      }, 3000);
    } else if (router.query.canceled === 'true') {
      setShowCanceled(true);
      setTimeout(() => {
        setShowCanceled(false);
        router.replace('/credits', undefined, { shallow: true });
      }, 3000);
    }
  }, [router.query]);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      router.push('/');
      return;
    }

    setUser(session.user);
    await fetchCredits();
    setLoading(false);
  };

  const fetchCredits = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const response = await fetch('/api/get_user_credits', {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      setCredits(data.balance);
    }
  };

  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Please log in to purchase credits');
        return;
      }

      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          credits: 20,
        }),
      });

      const data = await response.json();

      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        alert('Failed to create checkout session');
        setPurchasing(false);
      }
    } catch (error) {
      console.error('Purchase error:', error);
      alert('Failed to initiate purchase');
      setPurchasing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ← Back to Dashboard
            </button>
            <h1 className="text-2xl font-bold">Purchase Credits</h1>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-orange-400" />
            <span className="text-lg font-semibold">{credits ?? 0} Credits</span>
          </div>
        </div>
      </header>

      {/* Success/Canceled Alerts */}
      {showSuccess && (
        <div className="container mx-auto px-4 pt-6">
          <div className="bg-green-900/20 border border-green-500 rounded-lg p-4 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-400" />
            <div>
              <h3 className="font-semibold">Payment Successful!</h3>
              <p className="text-sm text-gray-300">Your credits have been added to your account.</p>
            </div>
          </div>
        </div>
      )}

      {showCanceled && (
        <div className="container mx-auto px-4 pt-6">
          <div className="bg-yellow-900/20 border border-yellow-500 rounded-lg p-4 flex items-center gap-3">
            <XCircle className="w-6 h-6 text-yellow-400" />
            <div>
              <h3 className="font-semibold">Payment Canceled</h3>
              <p className="text-sm text-gray-300">Your payment was canceled. No charges were made.</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Current Balance */}
        <Card className="bg-gray-800 border-gray-700 p-8 mb-8">
          <div className="text-center">
            <p className="text-gray-400 text-sm uppercase tracking-wide mb-2">Current Balance</p>
            <p className="text-6xl font-bold text-orange-400 mb-2">{credits ?? 0}</p>
            <p className="text-gray-400">Credits Available</p>
          </div>
        </Card>

        {/* Credit Package */}
        <Card className="bg-gray-800 border-gray-700 p-8">
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold mb-2">Buy More Credits</h2>
            <p className="text-gray-400">1 credit = 1 image OR 1 audio narration</p>
          </div>

          <div className="bg-gradient-to-br from-orange-500 to-pink-500 p-1 rounded-lg max-w-md mx-auto">
            <div className="bg-gray-900 rounded-lg p-8">
              <div className="text-center">
                <div className="mb-4">
                  <CreditCard className="w-16 h-16 mx-auto text-orange-400" />
                </div>
                <h3 className="text-4xl font-bold mb-2">20 Credits</h3>
                <p className="text-3xl font-bold text-orange-400 mb-4">$20</p>
                <p className="text-gray-400 text-sm mb-6">$1 per credit</p>

                <Button
                  onClick={handlePurchase}
                  disabled={purchasing}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-6 text-lg"
                >
                  {purchasing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Redirecting to Stripe...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5 mr-2" />
                      Purchase 20 Credits
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center text-sm text-gray-400">
            <p>Secure payment powered by Stripe</p>
            <p className="mt-2">Credits never expire</p>
          </div>
        </Card>

        {/* Usage Info */}
        <Card className="bg-gray-800 border-gray-700 p-6 mt-8">
          <h3 className="text-xl font-semibold mb-4">How Credits Work</h3>
          <ul className="space-y-3 text-gray-300">
            <li className="flex items-start gap-3">
              <span className="text-orange-400 font-bold">•</span>
              <span><strong>Image Generation:</strong> 1 credit per scene image</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-orange-400 font-bold">•</span>
              <span><strong>Audio Narration:</strong> 1 credit per scene audio</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-orange-400 font-bold">•</span>
              <span><strong>Video Generation:</strong> Free! No credits required</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-orange-400 font-bold">•</span>
              <span>New users get 15 free credits to get started</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-orange-400 font-bold">•</span>
              <span>Credits never expire</span>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
