/**
 * Corner Ribbon Configuration
 * 
 * Use this file to control the promotional ribbon in the top-right corner.
 * Perfect for special events, promotions, or announcements.
 */

export const ribbonConfig = {
  // Set to true to show the ribbon, false to hide it
  enabled: false,

  // Text displayed on the ribbon
  text: 'Start your project today!',

  // URL to navigate to when the ribbon is clicked (optional)
  // Leave empty string '' or null for no link
  link: '/create-project',

  // Color scheme (Tailwind classes)
  colors: {
    background: 'from-emerald-500 via-emerald-600 to-emerald-700',
    text: 'text-white',
  },
};
