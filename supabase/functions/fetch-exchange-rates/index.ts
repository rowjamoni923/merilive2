import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// List of countries to fetch rates for
const countryCodes = [
  { code: 'BD', currency: 'BDT', symbol: '৳', name: 'Bangladesh Taka' },
  { code: 'IN', currency: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'PK', currency: 'PKR', symbol: 'Rs', name: 'Pakistani Rupee' },
  { code: 'NP', currency: 'NPR', symbol: 'रू', name: 'Nepalese Rupee' },
  { code: 'AE', currency: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SA', currency: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal' },
  { code: 'KW', currency: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar' },
  { code: 'QA', currency: 'QAR', symbol: 'ر.ق', name: 'Qatari Riyal' },
  { code: 'OM', currency: 'OMR', symbol: 'ر.ع', name: 'Omani Rial' },
  { code: 'MY', currency: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'SG', currency: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'GB', currency: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'AU', currency: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CA', currency: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'EU', currency: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'JP', currency: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'KR', currency: 'KRW', symbol: '₩', name: 'Korean Won' },
  { code: 'PH', currency: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  { code: 'ID', currency: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  { code: 'TH', currency: 'THB', symbol: '฿', name: 'Thai Baht' },
  { code: 'VN', currency: 'VND', symbol: '₫', name: 'Vietnamese Dong' },
  { code: 'EG', currency: 'EGP', symbol: 'E£', name: 'Egyptian Pound' },
  { code: 'TR', currency: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  { code: 'ZA', currency: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'NG', currency: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  { code: 'KE', currency: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  { code: 'GH', currency: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi' },
  { code: 'US', currency: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'LK', currency: 'LKR', symbol: 'Rs', name: 'Sri Lankan Rupee' },
  { code: 'BH', currency: 'BHD', symbol: '.د.ب', name: 'Bahraini Dinar' },
  { code: 'JO', currency: 'JOD', symbol: 'JD', name: 'Jordanian Dinar' },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    // First try to use AI to get accurate rates
    if (LOVABLE_API_KEY) {
      console.log("Using AI to fetch accurate exchange rates...");
      
      const currencyList = countryCodes.map(c => `${c.currency} (${c.name})`).join(', ');
      
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `You are a financial data assistant. Return ONLY a JSON object with current exchange rates against USD. Today's date is ${new Date().toISOString().split('T')[0]}. Be accurate with the latest market rates.`
            },
            {
              role: "user",
              content: `Provide the current exchange rates for 1 USD to these currencies: ${currencyList}. 
              
              Return ONLY a JSON object in this exact format (no markdown, no explanation):
              {
                "BDT": 121.50,
                "INR": 84.20,
                "PKR": 278.50,
                ...
              }
              
              Use the latest accurate exchange rates as of today. Just the JSON object, nothing else.`
            }
          ],
          temperature: 0.1,
          max_tokens: 2000,
        }),
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        const content = aiData.choices?.[0]?.message?.content?.trim() || "";
        
        console.log("AI Response:", content);
        
        // Try to parse the JSON response
        try {
          // Clean up the response - remove markdown code blocks if present
          let jsonStr = content;
          if (jsonStr.includes("```json")) {
            jsonStr = jsonStr.replace(/```json\n?/g, "").replace(/```\n?/g, "");
          } else if (jsonStr.includes("```")) {
            jsonStr = jsonStr.replace(/```\n?/g, "");
          }
          jsonStr = jsonStr.trim();
          
          const rates = JSON.parse(jsonStr);
          
          // Build the response with proper structure
          const result = countryCodes.map(country => {
            const rate = rates[country.currency];
          if (rate && typeof rate === 'number') {
              // USD is always 1:1, never adjust it
              // For other currencies, subtract 5 but never go below 0.01
              const adjustedRate = country.currency === 'USD' ? 1 : Math.max(0.01, rate - 5);
              
              return {
                code: country.code,
                currency: country.currency,
                symbol: country.symbol,
                name: country.name,
                marketRate: rate,
                adjustedRate: Math.round(adjustedRate * 100) / 100,
              };
            }
            return null;
          }).filter(Boolean);
          
          console.log(`Successfully fetched ${result.length} rates via AI`);
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              source: 'ai',
              rates: result,
              fetchedAt: new Date().toISOString()
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (parseError) {
          console.error("Failed to parse AI response:", parseError);
        }
      } else {
        console.error("AI request failed:", aiResponse.status);
      }
    }

    // Fallback: Use free exchange rate API
    console.log("Falling back to exchange rate API...");
    
    const apiResponse = await fetch("https://open.er-api.com/v6/latest/USD");
    
    if (apiResponse.ok) {
      const apiData = await apiResponse.json();
      const apiRates = apiData.rates || {};
      
      const result = countryCodes.map(country => {
        const rate = apiRates[country.currency];
        if (rate && typeof rate === 'number') {
          // USD is always 1:1, never adjust it
          // For other currencies, subtract 5 but never go below 0.01
          const adjustedRate = country.currency === 'USD' ? 1 : Math.max(0.01, rate - 5);
          
          return {
            code: country.code,
            currency: country.currency,
            symbol: country.symbol,
            name: country.name,
            marketRate: rate,
            adjustedRate: Math.round(adjustedRate * 100) / 100,
          };
        }
        return null;
      }).filter(Boolean);
      
      console.log(`Successfully fetched ${result.length} rates via API`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          source: 'api',
          rates: result,
          fetchedAt: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error("Failed to fetch exchange rates from all sources");
    
  } catch (error) {
    console.error("Exchange rate fetch error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to fetch rates" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
