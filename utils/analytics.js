/**
 * Centralized Google Analytics 4 Configuration for Dreamly AI Website
 *
 * Provides the official Google tag (gtag.js) implementation
 * for production website measurement.
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

module.exports = {
  GA_MEASUREMENT_ID,
  getGoogleTagHeadScript
};
