// charts.js — Chart.js wrapper

Chart.defaults.color = '#8b949e';
Chart.defaults.font.family = "'Sora', system-ui, sans-serif";
Chart.defaults.font.size = 12;

const COLORS = {
  accent: '#6958C2',  // Primary brand accent — interactive elements
  green:  '#00c896',  // Data display — positive values, revenue
  red:    '#ff4d6d',
  amber:  '#f5a623',
  blue:   '#4a90e2',
  purple: '#9b6cf7',
  cyan:   '#00d4ff',
  grey:   '#8899aa',
};

// Vietnam added to currency symbols & flags (used across views)
// These are read by views before STATE is available, so defined here

const TERRITORY_COLORS = {
  India:       '#FF9933',
  Malaysia:    '#CC0001',
  Philippines: '#0038A8',
  Thailand:    '#A51931',
  Indonesia:   '#CE1126',
  Vietnam:     '#DA251D',
  Brazil:      '#009739',
  Europe:      '#003399',
  GCC:         '#006C35',
  Japan:       '#BC002D',
  Korea:       '#003478',
  Latam:       '#f5a623',
  Oceania:     '#00843D',
  USA:         '#3C3B6E',
  Molnu:       '#9b6cf7',
};

// Currency symbols used across views
const CURRENCY_SYMBOLS = {
  INR: '₹', MYR: 'RM', PHP: '₱', THB: '฿', IDR: 'Rp', VND: '₫',
  BRL: 'R$', EUR: '€', AED: 'AED', JPY: '¥', KRW: '₩',
  USD: '$', AUD: 'A$', GBP: '£',
};

// Territory flags used across views
const TERRITORY_FLAGS = {
  India: '🇮🇳', Malaysia: '🇲🇾', Philippines: '🇵🇭', Thailand: '🇹🇭',
  Indonesia: '🇮🇩', Vietnam: '🇻🇳', Brazil: '🇧🇷', Europe: '🌍', GCC: '🇦🇪',
  Japan: '🇯🇵', Korea: '🇰🇷', Latam: '🌎', Oceania: '🇦🇺',
  USA: '🇺🇸', Molnu: '🔵',
};

// getAvailablePeriods is defined in app.js (loaded later in the bundle)

function mkChart(id, config) {
  if (!STATE.charts) STATE.charts = {};
  const existing = STATE.charts[id];
  if (existing) { try { existing.destroy(); } catch(e) {} }

  const canvas = document.getElementById(id);
  if (!canvas) return null;

  // Apply dark theme defaults
  if (!config.options) config.options = {};
  if (!config.options.plugins) config.options.plugins = {};
  if (!config.options.plugins.tooltip) config.options.plugins.tooltip = {};
  config.options.plugins.tooltip.backgroundColor = '#1c2128';
  config.options.plugins.tooltip.borderColor = '#30363d';
  config.options.plugins.tooltip.borderWidth = 1;
  config.options.plugins.tooltip.titleColor = '#e6edf3';
  config.options.plugins.tooltip.bodyColor = '#8b949e';
  config.options.animation = config.options.animation !== undefined ? config.options.animation : { duration: 400 };

  // Set scale defaults
  if (config.options.scales) {
    for (const axis of Object.values(config.options.scales)) {
      if (!axis.ticks) axis.ticks = {};
      if (!axis.ticks.color) axis.ticks.color = '#8b949e';
    }
  }

  const chart = new Chart(canvas, config);
  STATE.charts[id] = chart;
  return chart;
}

/**
 * Format number helper used across views
 */
function fmt(v, decimals = 2, useKM = false) {
  if (v === null || v === undefined || isNaN(v)) return '0.00';
  if (useKM) {
    if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (Math.abs(v) >= 1_000)     return (v / 1_000).toFixed(1) + 'K';
  }
  return Math.abs(v) >= 10000
    ? v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : v.toFixed(decimals);
}

// toMYR is defined in parsers/helpers.js (loaded earlier in the bundle)
