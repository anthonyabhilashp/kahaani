import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

// Declare Tawk_API on window
declare global {
  interface Window {
    Tawk_API?: any;
    Tawk_LoadStart?: Date;
  }
}

export function TawkToChat() {
  const { user } = useAuth();

  useEffect(() => {
    // Only load Tawk.to if TAWK_PROPERTY_ID is set in environment
    const tawkPropertyId = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID;
    const tawkWidgetId = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID || 'default';

    if (!tawkPropertyId) {
      console.log('📞 Tawk.to not configured - set NEXT_PUBLIC_TAWK_PROPERTY_ID in .env.local');
      return;
    }

    // Initialize Tawk.to
    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://embed.tawk.to/${tawkPropertyId}/${tawkWidgetId}`;
    script.charset = 'UTF-8';
    script.setAttribute('crossorigin', '*');

    const firstScript = document.getElementsByTagName('script')[0];
    firstScript.parentNode?.insertBefore(script, firstScript);

    // Configure widget and pass user info
    script.onload = () => {
      if (window.Tawk_API) {
        window.Tawk_API.onLoad = function() {
          // Hide the default widget initially
          window.Tawk_API.hideWidget();

          // Pass user information if logged in
          if (user) {
            window.Tawk_API.setAttributes({
              name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
              email: user.email || '',
              userId: user.id,
            }, function(error: any) {
              if (error) {
                console.error('Error setting Tawk.to attributes:', error);
              }
            });
          }

          // Inject custom CSS to match orange theme
          const style = document.createElement('style');
          style.innerHTML = `
            /* Tawk.to widget customization - Orange theme */
            #tawk-bubble-container .tawk-button {
              background-color: #ea580c !important;
            }

            /* Chat widget header */
            iframe[title*="chat widget"] {
              color-scheme: light;
            }

            /* Override green colors with orange */
            .tawk-button-circle,
            .tawk-min-container .tawk-button-circle {
              background-color: #ea580c !important;
            }

            /* Try to override the chat bubble colors - may not work due to iframe restrictions */
            .tawk-chat-panel .tawk-button {
              background-color: #ea580c !important;
            }
          `;
          document.head.appendChild(style);
        };

        // Listen for widget customization
        window.Tawk_API.onChatStarted = function() {
          // Additional customization when chat starts
          window.Tawk_API.setAttributes({
            name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User',
            email: user?.email || '',
            userId: user?.id || '',
          });
        };
      }
    };

    return () => {
      // Cleanup on unmount
      if (window.Tawk_API) {
        try {
          window.Tawk_API.hideWidget();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, [user]);

  return null; // This component doesn't render anything
}
