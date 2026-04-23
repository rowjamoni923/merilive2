const fs = require('fs');
const content = fs.readFileSync('i:/ami-tomar-jonno-62e3a48a/src/pages/AgencyWithdrawal.tsx', 'utf-8');

let feeMatch = content.match(/const WITHDRAWAL_FEE_CONFIG: Record<string, CountryFeeConfig> = (\{[\s\S]*?\n\});/);
let countryMatch = content.match(/const COUNTRY_CONFIGS: Record<string, CountryConfig> = (\{[\s\S]*?\n\});/);

if (!feeMatch || !countryMatch) {
    console.error('Regex failed to match');
    process.exit(1);
}

let dartFee = feeMatch[1].replace(/Infinity/g, 'double.infinity');
let dartCountry = countryMatch[1]; // We don't even need strictly json, since dart map literal is basically identical to JS object literal (just need everything to be map, Dart needs quotes on keys if not using var but we can just type 'static const Map<String, dynamic>')

// Wait, Dart Maps MUST have quoted string keys! `BD: {` -> `'BD': {`
// Let's quickly parse it as JS object via eval, then output proper Dart.
// To do this we just remove type annotations and eval it.

let jsCode = `
    const Infinity = "Infinity_MAGIC";
    const WITHDRAWAL_FEE_CONFIG = ${feeMatch[1]};
    const COUNTRY_CONFIGS = ${countryMatch[1]};
    
    function toDart(obj, indent = "") {
        if (obj === "Infinity_MAGIC") return "double.infinity";
        if (typeof obj === 'string') return "'" + obj.replace(/'/g, "\\'") + "'";
        if (typeof obj === 'number') return obj;
        if (typeof obj === 'boolean') return obj;
        if (Array.isArray(obj)) {
            if (obj.length === 0) return "[]";
            let parts = obj.map(v => toDart(v, indent + "  "));
            return "[\\n" + indent + "  " + parts.join(",\\n" + indent + "  ") + "\\n" + indent + "]";
        }
        if (typeof obj === 'object' && obj !== null) {
            let entries = Object.entries(obj);
            if (entries.length === 0) return "{}";
            let parts = entries.map(([k,v]) => "'" + k.replace(/'/g, "\\'") + "': " + toDart(v, indent + "  "));
            return "{\\n" + indent + "  " + parts.join(",\\n" + indent + "  ") + "\\n" + indent + "}";
        }
        return "null";
    }

    let dartFeeCode = toDart(WITHDRAWAL_FEE_CONFIG);
    let dartCountryCode = toDart(COUNTRY_CONFIGS);

    let finalOutput = \`class WithdrawalConstants {
  static const double minimumWithdrawalUsd = 10.0;
  
  static const Map<String, dynamic> withdrawalFeeConfig = \${dartFeeCode};
  
  static const Map<String, dynamic> countryConfigs = \${dartCountryCode};
}
\`;

fs.writeFileSync('i:/ami-tomar-jonno-62e3a48a/merilive_flutter/lib/utils/withdrawal_constants.dart', finalOutput);
console.log('Dart constants generated successfully');
`;

eval(jsCode);
