module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './src/index.html',
  ],
  theme: {
    extend: {
      colors: {
        // You can customize the color palette here to match your design
        'gray': {
          800: '#1e1e1e',
          900: '#121212',
        },
        'blue': {
          600: '#0078f2',
          700: '#0066cc',
        },
      },
      // Add custom responsive breakpoints for better scaling
      screens: {
        'xs': '480px',    // Extra small screens (mobile)
        'sm': '640px',    // Small screens (tablet portrait)
        'md': '768px',    // Medium screens (tablet landscape)
        'lg': '1024px',   // Large screens (desktop)
        'xl': '1280px',   // Extra large screens (large desktop)
        '2xl': '1536px',  // 2X large screens (very large desktop)
        '3xl': '1920px',  // 3X large screens (ultra-wide)
        '4xl': '2560px',  // 4X large screens (4K+)
      },
      // Add responsive spacing for consistent scaling
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '26': '6.5rem',
      }
    },
  },
  plugins: [],
};
