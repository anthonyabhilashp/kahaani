# Coupon System Design

## Database Tables

### 1. `coupons` table
```sql
CREATE TABLE coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,  -- e.g., "SAVE20", "EARLYBIRD"
  type TEXT NOT NULL,  -- "discount_percent", "discount_amount", "bonus_credits"
  value DECIMAL NOT NULL,  -- 20 (for 20%), 10 (for $10 off), 25 (for 25 bonus credits)

  -- Usage limits
  max_total_uses INTEGER,  -- NULL = unlimited, 100 = only 100 people can use
  max_uses_per_user INTEGER DEFAULT 1,  -- Usually 1, but can be more
  current_uses INTEGER DEFAULT 0,  -- Track total redemptions

  -- Time restrictions
  valid_from TIMESTAMPTZ,  -- NULL = valid immediately
  valid_until TIMESTAMPTZ,  -- NULL = never expires

  -- Status
  active BOOLEAN DEFAULT true,

  -- Metadata
  description TEXT,  -- "20% off Black Friday sale"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Index for fast lookups
CREATE INDEX idx_coupons_code ON coupons(code);
CREATE INDEX idx_coupons_active ON coupons(active);
```

### 2. `coupon_redemptions` table (Track who used what)
```sql
CREATE TABLE coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coupon_id UUID REFERENCES coupons(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What they got
  original_price DECIMAL,  -- $70
  discount_amount DECIMAL,  -- $14 (if 20% off)
  final_price DECIMAL,  -- $56
  bonus_credits INTEGER,  -- 25 (if bonus credits type)
  credits_purchased INTEGER,  -- 100

  -- When
  redeemed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicates
  UNIQUE(coupon_id, user_id)
);

-- Index for fast user lookups
CREATE INDEX idx_redemptions_user ON coupon_redemptions(user_id);
CREATE INDEX idx_redemptions_coupon ON coupon_redemptions(coupon_id);
```

## Validation Flow

### Step 1: User enters coupon code
```typescript
// Frontend: credits.tsx
const [couponCode, setCouponCode] = useState("");
const [couponDiscount, setCouponDiscount] = useState(null);
const [couponError, setCouponError] = useState("");

const validateCoupon = async () => {
  const response = await fetch('/api/coupons/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: couponCode })
  });

  const data = await response.json();

  if (data.valid) {
    setCouponDiscount(data.coupon);
    setCouponError("");
  } else {
    setCouponError(data.error);
  }
};
```

### Step 2: Validate on server (CRITICAL!)
```typescript
// /api/coupons/validate.ts
export default async function handler(req, res) {
  const { code } = req.body;
  const { user } = await getUser(req);

  // 1️⃣ Find coupon
  const { data: coupon } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', code.toUpperCase())
    .single();

  if (!coupon) {
    return res.json({ valid: false, error: "Invalid coupon code" });
  }

  // 2️⃣ Check if active
  if (!coupon.active) {
    return res.json({ valid: false, error: "This coupon is no longer active" });
  }

  // 3️⃣ Check time restrictions
  const now = new Date();
  if (coupon.valid_from && new Date(coupon.valid_from) > now) {
    return res.json({ valid: false, error: "This coupon is not yet valid" });
  }
  if (coupon.valid_until && new Date(coupon.valid_until) < now) {
    return res.json({ valid: false, error: "This coupon has expired" });
  }

  // 4️⃣ Check total usage limit
  if (coupon.max_total_uses && coupon.current_uses >= coupon.max_total_uses) {
    return res.json({ valid: false, error: "This coupon has reached its maximum usage limit" });
  }

  // 5️⃣ Check per-user limit
  const { count: userRedemptions } = await supabase
    .from('coupon_redemptions')
    .select('*', { count: 'exact', head: true })
    .eq('coupon_id', coupon.id)
    .eq('user_id', user.id);

  if (userRedemptions >= coupon.max_uses_per_user) {
    return res.json({ valid: false, error: "You have already used this coupon" });
  }

  // ✅ All checks passed!
  return res.json({
    valid: true,
    coupon: {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      description: coupon.description
    }
  });
}
```

### Step 3: Apply discount at checkout
```typescript
// /api/paddle/create-checkout.ts (modified)
export default async function handler(req, res) {
  const { credits, price, couponCode } = req.body;

  let finalPrice = price;
  let discountAmount = 0;
  let couponId = null;

  // If coupon provided, validate and apply
  if (couponCode) {
    const validation = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/coupons/validate`, {
      method: 'POST',
      body: JSON.stringify({ code: couponCode })
    });
    const { valid, coupon } = await validation.json();

    if (valid && coupon.type.startsWith('discount_')) {
      if (coupon.type === 'discount_percent') {
        discountAmount = (price * coupon.value) / 100;
      } else if (coupon.type === 'discount_amount') {
        discountAmount = coupon.value;
      }
      finalPrice = Math.max(0, price - discountAmount);
      couponId = coupon.id;
    }
  }

  // Create Paddle checkout with final price
  const checkout = await paddle.checkout.create({
    priceId: getPriceIdForAmount(finalPrice),
    customData: {
      credits,
      originalPrice: price,
      couponCode: couponCode || null,
      userId: user.id
    }
  });

  // ... rest
}
```

### Step 4: Record redemption after payment
```typescript
// /api/paddle/webhook.ts (modified)
const handleTransactionCompleted = async (transaction) => {
  const { credits, couponCode, userId } = transaction.customData;

  // Add purchased credits
  await addCredits(userId, credits);

  // If coupon was used, record redemption
  if (couponCode) {
    const { data: coupon } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', couponCode)
      .single();

    if (coupon) {
      // Calculate what they got
      const originalPrice = transaction.customData.originalPrice;
      const finalPrice = transaction.total;
      const discountAmount = originalPrice - finalPrice;
      let bonusCredits = 0;

      // If bonus credits type, add them now
      if (coupon.type === 'bonus_credits') {
        bonusCredits = Math.floor((credits * coupon.value) / 100);
        await addCredits(userId, bonusCredits);
      }

      // Record redemption
      await supabase.from('coupon_redemptions').insert({
        coupon_id: coupon.id,
        user_id: userId,
        original_price: originalPrice,
        discount_amount: discountAmount,
        final_price: finalPrice,
        bonus_credits: bonusCredits,
        credits_purchased: credits
      });

      // Increment usage counter
      await supabase.rpc('increment_coupon_usage', {
        coupon_id: coupon.id
      });
    }
  }
};
```

## Security & Anti-Abuse

### 1. Rate Limiting
```typescript
// Limit coupon validation attempts
const rateLimitValidation = checkRateLimit(
  ip,
  { interval: 60000, maxRequests: 10 }  // 10 attempts per minute
);
```

### 2. Case Insensitive
```sql
-- Always uppercase coupon codes
code TEXT UNIQUE NOT NULL CHECK (code = UPPER(code))
```

### 3. Prevent Double-Redemption
```sql
-- Unique constraint
UNIQUE(coupon_id, user_id)
```

### 4. Atomic Counters
```sql
-- PostgreSQL function to safely increment
CREATE OR REPLACE FUNCTION increment_coupon_usage(coupon_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE coupons
  SET current_uses = current_uses + 1
  WHERE id = coupon_id;
END;
$$ LANGUAGE plpgsql;
```

## Example Coupons

```sql
-- 20% off for Black Friday (limited time)
INSERT INTO coupons (code, type, value, max_total_uses, valid_from, valid_until, description)
VALUES (
  'BLACKFRIDAY20',
  'discount_percent',
  20,
  1000,
  '2024-11-24 00:00:00+00',
  '2024-11-27 23:59:59+00',
  'Black Friday 20% off'
);

-- $10 off for early adopters (first 100 users)
INSERT INTO coupons (code, type, value, max_total_uses, description)
VALUES (
  'EARLYBIRD',
  'discount_amount',
  10,
  100,
  'Early adopter $10 discount'
);

-- 50% bonus credits for influencer (unlimited uses, never expires)
INSERT INTO coupons (code, type, value, max_uses_per_user, description)
VALUES (
  'INFLUENCER-JOHN',
  'bonus_credits',
  50,
  1,
  'John's 50% bonus credits'
);
```

## Admin Dashboard (Future)

Track coupon performance:
```sql
-- Analytics query
SELECT
  c.code,
  c.description,
  COUNT(r.id) as total_redemptions,
  SUM(r.discount_amount) as total_discounted,
  SUM(r.bonus_credits) as total_bonus_given,
  SUM(r.credits_purchased) as total_credits_sold
FROM coupons c
LEFT JOIN coupon_redemptions r ON c.id = r.coupon_id
GROUP BY c.id
ORDER BY total_redemptions DESC;
```

---

## Summary

✅ **Time-based validation** - valid_from / valid_until
✅ **Usage limits** - max_total_uses + max_uses_per_user
✅ **No double-redemption** - UNIQUE constraint
✅ **Track everything** - coupon_redemptions table
✅ **Atomic counters** - Prevent race conditions
✅ **Flexible types** - Discounts OR bonus credits

Should I build this system?
