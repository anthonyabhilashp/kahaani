import { supabaseAdmin } from './supabaseAdmin';
import { CREDIT_COSTS, NEW_USER_CREDITS, type TransactionType } from './creditConstants';

// Re-export for backward compatibility
export { CREDIT_COSTS, NEW_USER_CREDITS, type TransactionType };

/**
 * Get user's credit balance
 */
export async function getUserCredits(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('user_credits')
    .select('balance')
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('Error getting user credits:', error);
    return 0;
  }

  return data?.balance || 0;
}

/**
 * Initialize credits for new user
 */
export async function initializeUserCredits(userId: string): Promise<void> {
  // Check if user already has credits
  const { data: existing } = await supabaseAdmin
    .from('user_credits')
    .select('user_id')
    .eq('user_id', userId)
    .single();

  if (existing) {
    console.log('User already has credits initialized');
    return;
  }

  // Create initial credit balance
  const { error: creditError } = await supabaseAdmin
    .from('user_credits')
    .insert({
      user_id: userId,
      balance: NEW_USER_CREDITS,
    });

  if (creditError) {
    console.error('Error initializing user credits:', creditError);
    throw new Error('Failed to initialize credits');
  }

  // Record the transaction
  await recordTransaction(
    userId,
    NEW_USER_CREDITS,
    'free_signup',
    'Welcome bonus - free credits for new users'
  );

  console.log(`✅ Initialized ${NEW_USER_CREDITS} credits for user ${userId}`);
}

/**
 * Deduct credits from user (ATOMIC - prevents race conditions)
 */
export async function deductCredits(
  userId: string,
  amount: number,
  type: TransactionType,
  description: string,
  storyId?: string
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  // Use atomic PostgreSQL function to prevent race conditions
  const { data, error } = await supabaseAdmin
    .rpc('deduct_credits_atomic', {
      p_user_id: userId,
      p_amount: amount
    });

  if (error) {
    console.error('Error deducting credits:', error);
    const currentBalance = await getUserCredits(userId);
    return {
      success: false,
      newBalance: currentBalance,
      error: 'Failed to deduct credits',
    };
  }

  // Check if deduction was successful
  if (!data || data.length === 0 || !data[0].success) {
    const currentBalance = data && data[0] ? data[0].new_balance : await getUserCredits(userId);
    return {
      success: false,
      newBalance: currentBalance,
      error: `Insufficient credits. You have ${currentBalance} credits but need ${amount}.`,
    };
  }

  const newBalance = data[0].new_balance;

  // Record the transaction
  await recordTransaction(userId, -amount, type, description, storyId);

  console.log(`✅ Deducted ${amount} credits from user ${userId}. New balance: ${newBalance}`);

  return {
    success: true,
    newBalance,
  };
}

/**
 * Refund credits to user (e.g., when operation fails) - ATOMIC
 */
export async function refundCredits(
  userId: string,
  amount: number,
  description: string,
  storyId?: string
): Promise<{ success: boolean; newBalance: number }> {
  // Use atomic addition (refund is just adding credits back)
  const { data, error } = await supabaseAdmin
    .rpc('add_credits_atomic', {
      p_user_id: userId,
      p_amount: amount
    });

  if (error || !data || data.length === 0 || !data[0].success) {
    console.error('Error refunding credits:', error);
    const currentBalance = await getUserCredits(userId);
    return {
      success: false,
      newBalance: currentBalance,
    };
  }

  const newBalance = data[0].new_balance;

  // Record the transaction
  await recordTransaction(userId, amount, 'refund', description, storyId);

  console.log(`✅ Refunded ${amount} credits to user ${userId}. New balance: ${newBalance}`);

  return {
    success: true,
    newBalance,
  };
}

/**
 * Add credits to user (e.g., purchase, admin adjustment) - ATOMIC
 */
export async function addCredits(
  userId: string,
  amount: number,
  type: TransactionType,
  description: string
): Promise<{ success: boolean; newBalance: number }> {
  // Use atomic addition
  const { data, error } = await supabaseAdmin
    .rpc('add_credits_atomic', {
      p_user_id: userId,
      p_amount: amount
    });

  if (error || !data || data.length === 0 || !data[0].success) {
    console.error('Error adding credits:', error);
    const currentBalance = await getUserCredits(userId);
    return {
      success: false,
      newBalance: currentBalance,
    };
  }

  const newBalance = data[0].new_balance;

  // Record the transaction
  await recordTransaction(userId, amount, type, description);

  console.log(`✅ Added ${amount} credits to user ${userId}. New balance: ${newBalance}`);

  return {
    success: true,
    newBalance,
  };
}

/**
 * Record a credit transaction
 */
async function recordTransaction(
  userId: string,
  amount: number,
  type: TransactionType,
  description: string,
  storyId?: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('credit_transactions')
    .insert({
      user_id: userId,
      amount,
      type,
      description,
      story_id: storyId,
    });

  if (error) {
    console.error('Error recording transaction:', error);
    // Don't throw - transaction recording is non-critical
  }
}

/**
 * Get user's credit transaction history
 */
export async function getTransactionHistory(
  userId: string,
  limit: number = 50
): Promise<any[]> {
  const { data, error } = await supabaseAdmin
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error getting transaction history:', error);
    return [];
  }

  return data || [];
}
