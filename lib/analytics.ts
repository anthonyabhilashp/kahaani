import { supabase } from './supabaseClient';

export type AnalyticsEvent =
  | 'story_created'
  | 'video_generated'
  | 'upgrade_clicked'
  | 'download_clicked'
  | 'image_generated'
  | 'audio_generated'
  | 'story_deleted'
  | 'scene_edited';

interface EventData {
  [key: string]: any;
}

/**
 * Track an analytics event in Supabase
 * @param eventName - Name of the event to track
 * @param eventData - Optional additional data to store with the event
 */
export async function trackEvent(
  eventName: AnalyticsEvent,
  eventData?: EventData
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.warn('Cannot track event: User not authenticated');
      return;
    }

    const { error } = await supabase
      .from('analytics_events')
      .insert({
        user_id: user.id,
        event_name: eventName,
        event_data: eventData || {},
      });

    if (error) {
      console.error('Error tracking event:', error);
    }

    // Also track in Google Analytics if available
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', eventName, eventData);
    }
  } catch (error) {
    console.error('Error tracking event:', error);
  }
}

/**
 * Track a page view in Google Analytics
 * @param url - URL of the page
 */
export function trackPageView(url: string): void {
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('config', process.env.NEXT_PUBLIC_GA_ID, {
      page_path: url,
    });
  }
}
