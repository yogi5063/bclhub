// gateway-registry.js — Extensible plugin registry for payment gateway file parsers.
//
// To add a new gateway (e.g. Stripe), create a new file in parsers/gateway/,
// call registerGateway({ name, detect, parse }) at the bottom of that file,
// and add a <script> tag for it in index.html.
//
// Each plugin:
//   name:   Display name (e.g. 'Payex', 'PayPal')
//   detect: function(filename: string, sheetNames: string[]) → boolean
//   parse:  async function(file: File) → GatewayResult
//
// GatewayResult shape:
//   {
//     gatewayName: string,
//     territory:   string | null,    // if detectable from content
//     currency:    string | null,
//     gross:       number,
//     net:         number,
//     fee:         number,
//     transactions: Array<{ date, amount, reference, description, type }>
//   }

const GATEWAY_PLUGINS = [];

function registerGateway(plugin) {
  if (!plugin.name || !plugin.detect || !plugin.parse) {
    console.warn('Gateway plugin missing required fields:', plugin);
    return;
  }
  GATEWAY_PLUGINS.push(plugin);
}

/**
 * Find a matching gateway plugin for a given file.
 *
 * @param {string}   filename
 * @param {string[]} sheetNames — sheet names if xlsx (empty for CSV)
 * @returns {object|null} matching plugin or null
 */
function detectGateway(filename, sheetNames = []) {
  const lower = filename.toLowerCase();
  return GATEWAY_PLUGINS.find(p => {
    try { return p.detect(lower, sheetNames); } catch { return false; }
  }) || null;
}

