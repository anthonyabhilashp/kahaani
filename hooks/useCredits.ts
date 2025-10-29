import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface CreditData {
  balance: number;
  loading: boolean;
  error: string | null;
}

export function useCredits(): CreditData & { refetch: () => Promise<void> } {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCredits = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get current session
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setBalance(0);
        setLoading(false);
        return;
      }

      // Fetch user credits
      const res = await fetch('/api/get_user_credits', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!res.ok) {
        throw new Error('Failed to fetch credits');
      }

      const data = await res.json();
      setBalance(data.balance || 0);
    } catch (err: any) {
      console.error('Error fetching credits:', err);
      setError(err.message || 'Failed to load credits');
      setBalance(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCredits();
  }, []);

  return {
    balance,
    loading,
    error,
    refetch: fetchCredits
  };
}
