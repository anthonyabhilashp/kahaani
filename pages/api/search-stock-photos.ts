import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface PixabayImage {
  id: number;
  pageURL: string;
  type: string;
  tags: string;
  previewURL: string;
  previewWidth: number;
  previewHeight: number;
  webformatURL: string;
  webformatWidth: number;
  webformatHeight: number;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  imageSize: number;
  views: number;
  downloads: number;
  likes: number;
  comments: number;
  user_id: number;
  user: string;
  userImageURL: string;
}

interface PixabayResponse {
  total: number;
  totalHits: number;
  hits: PixabayImage[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify authentication
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { query, orientation, per_page = 15, page = 1 } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  const apiKey = process.env.PIXABAY_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  // Use AI to extract search keywords from scene text
  let searchQuery = query.trim();

  if (openrouterKey && searchQuery.length > 30) {
    try {
      const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openrouterKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.CUT_SHORTS_MODEL || 'openai/gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'Extract 2-4 simple keywords for stock photo search from the given text. Return ONLY the keywords separated by spaces, nothing else. Focus on visual elements, subjects, settings. Example: "lion savanna wildlife" or "ocean waves sunset"'
            },
            {
              role: 'user',
              content: searchQuery
            }
          ],
          max_tokens: 30,
          temperature: 0.3,
        }),
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        let keywords = aiData.choices?.[0]?.message?.content?.trim();
        // Remove <think>...</think> tags from deepseek models
        if (keywords) {
          keywords = keywords.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        }
        if (keywords && keywords.length > 0 && keywords.length <= 100) {
          console.log(`AI extracted keywords: "${keywords}" from: "${searchQuery.substring(0, 50)}..."`);
          searchQuery = keywords;
        }
      }
    } catch (aiError) {
      console.error('AI keyword extraction failed, using original query:', aiError);
    }
  }

  // Pixabay has a 100 character limit for queries - truncate at word boundary
  if (searchQuery.length > 100) {
    searchQuery = searchQuery.substring(0, 100).replace(/\s+\S*$/, '').trim();
  }

  if (!apiKey) {
    return res.status(500).json({ error: 'Pixabay API key not configured' });
  }

  try {
    // Build Pixabay API URL for images
    const searchUrl = new URL('https://pixabay.com/api/');
    searchUrl.searchParams.set('key', apiKey);
    searchUrl.searchParams.set('q', searchQuery);
    searchUrl.searchParams.set('per_page', String(per_page));
    searchUrl.searchParams.set('page', String(page));
    searchUrl.searchParams.set('safesearch', 'true');
    searchUrl.searchParams.set('image_type', 'photo');

    // Map orientation
    if (orientation === 'landscape') {
      searchUrl.searchParams.set('orientation', 'horizontal');
    } else if (orientation === 'portrait') {
      searchUrl.searchParams.set('orientation', 'vertical');
    }

    const response = await fetch(searchUrl.toString());

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Pixabay API error:', errorText);
      return res.status(response.status).json({ error: 'Failed to search Pixabay' });
    }

    const data: PixabayResponse = await response.json();

    // Transform to common format
    const photos = data.hits.map((photo) => ({
      id: photo.id,
      thumbnail: photo.previewURL,
      preview_url: photo.webformatURL,
      download_url: photo.largeImageURL,
      width: photo.imageWidth,
      height: photo.imageHeight,
      user: photo.user,
    }));

    const totalPages = Math.ceil(data.totalHits / per_page);
    const has_more = page < totalPages;

    return res.status(200).json({
      photos,
      total_results: data.totalHits,
      page,
      per_page,
      has_more,
      search_query: searchQuery, // Return the actual query used (AI extracted keywords)
    });
  } catch (error: any) {
    console.error('Stock photo search error:', error);
    return res.status(500).json({ error: error.message || 'Failed to search stock photos' });
  }
}
