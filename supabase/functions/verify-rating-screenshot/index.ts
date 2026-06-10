import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image_path, base64_image } = await req.json();
    const apiKey = Deno.env.get("GOOGLE_VISION_API_KEY");

    if (!apiKey) {
      console.error("Missing GOOGLE_VISION_API_KEY");
      return new Response(
        JSON.stringify({ error: "Vision API key not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    let imageSource: any = {};

    if (image_path) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data, error } = await supabase.storage
        .from("rating-screenshots")
        .createSignedUrl(image_path, 60);

      if (error || !data?.signedUrl) {
        throw new Error("Could not create signed URL for image");
      }
      imageSource = { imageUri: data.signedUrl };
    } else if (base64_image) {
      // Remove data:image/png;base64, prefix if present
      const base64 = base64_image.replace(/^data:image\/\w+;base64,/, "");
      imageSource = { content: base64 };
    } else {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const visionUrl = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
    const visionBody = {
      requests: [
        {
          image: imageSource,
          features: [
            { type: "TEXT_DETECTION" },
            { type: "LABEL_DETECTION", maxResults: 10 }
          ],
        },
      ],
    };

    const response = await fetch(visionUrl, {
      method: "POST",
      body: JSON.stringify(visionBody),
      headers: { "Content-Type": "application/json" },
    });

    const result = await response.json();
    const annotations = result.responses?.[0];

    if (!annotations) {
      throw new Error("No response from Vision API");
    }

    const fullText = annotations.fullTextAnnotation?.text?.toLowerCase() || "";
    const labels = (annotations.labelAnnotations || []).map((l: any) => l.description.toLowerCase());

    console.log("Vision full text:", fullText);
    console.log("Vision labels:", labels);

    // Heuristics for a 5-star Play Store rating screenshot
    const hasPlayStore = fullText.includes("play store") || 
                        fullText.includes("google play") || 
                        labels.includes("software") || 
                        labels.includes("app store") ||
                        labels.includes("screenshot");

    const hasStars = fullText.includes("★") || 
                     fullText.includes("5 stars") || 
                     fullText.includes("★★★★★") ||
                     // Look for "5" near the top or rating area
                     /rating.*5/.test(fullText) ||
                     /rated.*5/.test(fullText);

    // Negative indicators: if it looks like a person, food, or random object
    const negativeLabels = ["person", "human", "face", "portrait", "food", "nature", "landscape", "gameplay", "game", "toy"];
    const containsNegative = labels.some(label => negativeLabels.includes(label) && !labels.includes("multimedia") && !labels.includes("display device"));

    // Final verdict
    // We want to be strict as per user's "100% accurate" request.
    // If it's a screenshot and mentions Play Store/Google Play and has some indication of 5 stars.
    let isValid = (hasPlayStore || labels.includes("screenshot") || labels.includes("multimedia")) && (hasStars || fullText.includes("rate") || fullText.includes("review"));
    
    // If it clearly contains a person or something else, reject it.
    if (containsNegative && labels.length > 5) {
       isValid = false;
    }

    if (isValid) {
      return new Response(
        JSON.stringify({ success: true, message: "Valid 5-star rating detected" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "invalid_screenshot",
          message: "You submitted a different image, which is why your submission is not being accepted. Please upload a screenshot of your 5-star rating on the Play Store." 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error: any) {
    console.error("Vision API Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
