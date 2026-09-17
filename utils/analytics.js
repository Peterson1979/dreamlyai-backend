/**
 * Centralized Google Analytics 4 Configuration for Dreamly AI Website
 *
 * Provides official Google tag (gtag.js) implementation and
 * full conversion measurement foundation (Play Store conversions, CTAs,
 * topic views, content navigation, outbound clicks, and scroll depth).
 */

const GA_MEASUREMENT_ID = "G-G70KM0K4XS";

/**
 * Returns the official Google tag (gtag.js) head snippet for GA4.
 *
 * @param {string} [measurementId=GA_MEASUREMENT_ID] GA4 Measurement ID
 * @returns {string} Formatted HTML script tags for insertion into <head>
 */
function getGoogleTagHeadScript(measurementId = GA_MEASUREMENT_ID) {
  return `  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());

    gtag('config', '${measurementId}');
  </script>`;
}

/**
 * Generates the centralized measurement foundation script for Dreamly AI web pages.
 * Handles UTM preservation, Play Store link attribution, CTA tracking,
 * topic engagement, content navigation, outbound clicks, and scroll depth.
 *
 * @param {object} [options]
 * @param {string} [options.topicId] Optional specific dream topic ID for /dreams/:topic pages
 * @returns {string} Formatted HTML script block
 */
function getMeasurementFoundationScript(options = {}) {
  const topicParam = options.topicId ? JSON.stringify(options.topicId) : "null";

  return `  <!-- Acquisition Measurement & Conversion Foundation -->
  <script id="measurement-foundation">
    (function() {
      var storageKey = 'dreamly_utm_attribution';

      function getStoredUtm() {
        try {
          var raw = sessionStorage.getItem(storageKey);
          return raw ? JSON.parse(raw) : null;
        } catch (_) {
          return null;
        }
      }

      function storeUtm(data) {
        try {
          sessionStorage.setItem(storageKey, JSON.stringify(data));
        } catch (_) {}
      }

      function extractUtm() {
        var params = new URLSearchParams(window.location.search);
        var source = params.get('utm_source');
        var medium = params.get('utm_medium');
        var campaign = params.get('utm_campaign');
        var content = params.get('utm_content');
        var term = params.get('utm_term');

        if (source || campaign) {
          return {
            source: source || 'unknown',
            medium: medium || 'referral',
            campaign: campaign || 'website_visit',
            content: content || 'direct_landing',
            term: term || ''
          };
        }

        var ref = document.referrer || '';
        if (ref) {
          try {
            var refHost = new URL(ref).hostname.toLowerCase();
            if (refHost.includes('google.')) {
              return { source: 'google', medium: 'organic', campaign: 'web_search', content: 'seo' };
            } else if (refHost.includes('instagram.')) {
              return { source: 'instagram', medium: 'social', campaign: 'profile_bio', content: 'web_referral' };
            } else if (refHost.includes('facebook.')) {
              return { source: 'facebook', medium: 'social', campaign: 'page_post', content: 'web_referral' };
            } else if (refHost.includes('pinterest.')) {
              return { source: 'pinterest', medium: 'social', campaign: 'pin_share', content: 'web_referral' };
            } else if (refHost.includes('t.co') || refHost.includes('twitter.') || refHost.includes('x.com')) {
              return { source: 'twitter', medium: 'social', campaign: 'tweet_link', content: 'web_referral' };
            }
          } catch (_) {}
        }

        return { source: 'website', medium: 'direct', campaign: 'landing_page', content: 'organic' };
      }

      var currentUtm = getStoredUtm();
      if (!currentUtm) {
        currentUtm = extractUtm();
        storeUtm(currentUtm);
      }

      function trackEvent(eventName, params) {
        if (typeof window.gtag === 'function') {
          window.gtag('event', eventName, params);
        }
      }

      // 1 & 2. Google Play Store Conversion & Primary CTA Tracking
      function initPlayStoreAndCtaTracking() {
        var playBase = 'https://play.google.com/store/apps/details?id=com.oberon.dreamlyai';
        var links = document.querySelectorAll('a[href*="play.google.com/store/apps/details?id=com.oberon.dreamlyai"]');

        links.forEach(function(link, index) {
          var location = 'body';
          var ctaName = 'download_app';

          if (link.closest('.hero') || link.id === 'hero_google_play_btn') {
            location = 'hero';
            ctaName = 'get_dreamly_hero';
          } else if (link.closest('nav') || link.classList.contains('nav-cta')) {
            location = 'nav';
            ctaName = 'download_nav';
          } else if (link.closest('.cta-banner')) {
            if (document.querySelector('.related-section') || window.location.pathname.startsWith('/dreams/')) {
              location = 'topic_cta_banner';
              ctaName = 'get_dreamly_topic';
            } else if (document.querySelector('.category-section') || window.location.pathname === '/dreams') {
              location = 'directory_cta_banner';
              ctaName = 'get_dreamly_directory';
            } else {
              location = 'cta_banner';
              ctaName = 'download_cta_banner';
            }
          } else if (link.closest('footer') || link.id === 'footer_google_play_btn') {
            location = 'footer';
            ctaName = 'download_footer';
          }

          var existingHref = link.getAttribute('href') || '';
          var attributedUrl = existingHref;
          if (!existingHref.includes('utm_source=')) {
            var rawReferrer = 'utm_source=' + encodeURIComponent(currentUtm.source || 'website') +
                              '&utm_medium=' + encodeURIComponent(currentUtm.medium || 'direct') +
                              '&utm_campaign=' + encodeURIComponent(currentUtm.campaign || 'landing_page') +
                              '&utm_content=' + encodeURIComponent(currentUtm.content || 'organic');
            attributedUrl = playBase + '&referrer=' + encodeURIComponent(rawReferrer);
            link.href = attributedUrl;
          }
          link.setAttribute('data-attribution-source', currentUtm.source || 'website');

          link.addEventListener('click', function() {
            // Event 1: play_store_click
            trackEvent('play_store_click', {
              link_url: link.href || attributedUrl,
              link_location: location,
              utm_source: currentUtm.source,
              utm_medium: currentUtm.medium,
              utm_campaign: currentUtm.campaign,
              utm_content: currentUtm.content
            });

            // Event 2: cta_click
            trackEvent('cta_click', {
              cta_name: ctaName,
              cta_location: location,
              destination: 'play_store'
            });
          });
        });

        // Track primary exploratory CTAs
        var exploreBtn = document.getElementById('hero_explore_dreams_btn');
        if (exploreBtn) {
          exploreBtn.addEventListener('click', function() {
            trackEvent('cta_click', {
              cta_name: 'explore_dreams_hero',
              cta_location: 'hero',
              destination: '/dreams'
            });
          });
        }
      }

      // 3. Dream Topic Engagement (dream_topic_view)
      function initTopicEngagement(explicitTopicId) {
        var topic = explicitTopicId;
        if (!topic) {
          var match = window.location.pathname.match(/\\/dreams\\/([a-z0-9-]+)/i);
          if (match && match[1] && match[1].toLowerCase() !== 'index') {
            topic = match[1].toLowerCase();
          }
        }
        if (topic) {
          trackEvent('dream_topic_view', {
            topic: topic
          });
        }
      }

      // 4. Content Navigation (content_navigation)
      function initContentNavigation() {
        var links = document.querySelectorAll('a[href]');
        links.forEach(function(link) {
          var href = link.getAttribute('href');
          if (!href) return;

          if (href.startsWith('#') || href.startsWith('javascript:')) return;
          if (href.includes('play.google.com')) return;

          var isExternal = false;
          try {
            if (href.startsWith('http://') || href.startsWith('https://')) {
              var url = new URL(href, window.location.origin);
              if (url.hostname !== window.location.hostname && !url.hostname.includes('dreamlyai.life')) {
                isExternal = true;
              }
            }
          } catch (_) {}

          if (isExternal) return;

          var location = null;
          var destination = href;

          if (link.closest('#primary-nav-menu') || link.closest('nav')) {
            if (href === '/dreams' || href.startsWith('/dreams/')) {
              location = 'nav';
            }
          } else if (link.closest('.topics-grid') || link.closest('#encyclopedia')) {
            location = 'homepage_encyclopedia';
          } else if (link.closest('.related-grid') || link.closest('.related-section')) {
            location = 'related_topics';
          } else if (link.closest('.category-topics-grid') || link.closest('.category-section')) {
            location = 'directory_topic_card';
          } else if (link.closest('.breadcrumb-nav')) {
            location = 'breadcrumb';
          } else if (link.closest('footer')) {
            if (href === '/dreams' || href.startsWith('/dreams/')) {
              location = 'footer';
            }
          }

          if (location) {
            link.addEventListener('click', function() {
              trackEvent('content_navigation', {
                link_location: location,
                destination: destination
              });
            });
          }
        });
      }

      // 5. Outbound Link Engagement (outbound_click)
      function initOutboundTracking() {
        var links = document.querySelectorAll('a[href^="http://"], a[href^="https://"]');
        links.forEach(function(link) {
          var href = link.getAttribute('href');
          if (!href) return;

          try {
            var url = new URL(href, window.location.origin);
            if (url.hostname === window.location.hostname || url.hostname.includes('dreamlyai.life') || url.hostname.includes('localhost')) {
              return;
            }
            if (href.includes('play.google.com/store/apps/details?id=com.oberon.dreamlyai')) {
              return;
            }
            if (url.hostname.includes('googletagmanager.com') || url.hostname.includes('google-analytics.com')) {
              return;
            }

            var location = 'body';
            if (link.closest('footer')) location = 'footer';
            else if (link.closest('.privacy-content') || link.closest('.terms-content') || link.closest('.disclaimer-content') || link.closest('article')) location = 'legal_content';
            else if (link.closest('nav')) location = 'nav';

            link.addEventListener('click', function() {
              trackEvent('outbound_click', {
                link_url: href,
                link_location: location
              });
            });
          } catch (_) {}
        });
      }

      // 6. Scroll Engagement (scroll)
      function initScrollEngagement() {
        var scrollTriggered = false;
        function checkScroll() {
          if (scrollTriggered) return;
          var h = document.documentElement;
          var b = document.body;
          var scrollTop = (h && h.scrollTop) || (b && b.scrollTop) || 0;
          var scrollHeight = ((h && h.scrollHeight) || (b && b.scrollHeight) || 0) - ((h && h.clientHeight) || 0);
          if (scrollHeight > 0 && (scrollTop / scrollHeight) >= 0.9) {
            scrollTriggered = true;
            trackEvent('scroll', {
              percent_scrolled: 90
            });
            window.removeEventListener('scroll', checkScroll);
          }
        }
        window.addEventListener('scroll', checkScroll, { passive: true });
      }

      function init() {
        initPlayStoreAndCtaTracking();
        initTopicEngagement(${topicParam});
        initContentNavigation();
        initOutboundTracking();
        initScrollEngagement();
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    })();
  </script>`;
}

module.exports = {
  GA_MEASUREMENT_ID,
  getGoogleTagHeadScript,
  getMeasurementFoundationScript
};
