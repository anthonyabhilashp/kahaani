#!/bin/bash
# Deployment script for Hostinger VPS
# This ensures the correct platform is used for AMD64 servers

set -e

# Load environment variables from .env.local
if [ ! -f .env.local ]; then
  echo "❌ Error: .env.local file not found!"
  echo "Create .env.local with your Supabase credentials first."
  exit 1
fi

# Export variables needed for build
export $(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | xargs)
export $(grep -E '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local | xargs)

echo "🔨 Building Docker image for AMD64 platform..."
echo "📦 Using Supabase URL: $NEXT_PUBLIC_SUPABASE_URL"

docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -t anthonyabhilash/kahaani:latest \
  --push \
  .

echo ""
echo "✅ Build and push complete!"
echo ""
echo "📋 Next steps on Hostinger server:"
echo "1. Stop and remove old container:"
echo "   docker stop kahaani && docker rm kahaani"
echo ""
echo "2. Pull latest image:"
echo "   docker pull anthonyabhilash/kahaani:latest"
echo ""
echo "3. Run new container:"
echo "   docker run -d --name kahaani -p 3000:3000 --env-file .env --restart unless-stopped anthonyabhilash/kahaani:latest"
echo ""
echo "4. Check logs:"
echo "   docker logs -f kahaani"
