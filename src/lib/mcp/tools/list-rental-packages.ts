import { createClient } from "@supabase/supabase-js";
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "list_rental_packages",
  title: "List rental packages",
  description:
    "List the active hourly rental packages (e.g. 4h/40km, 8h/80km) with sedan and SUV pricing.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await supabase
      .from("rental_packages")
      .select("code,label,hours,km,sedan_price,suv_price,sub,extra_per_hour,extra_per_km,sort_order")
      .eq("active", true)
      .order("sort_order");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { packages: data ?? [] },
    };
  },
});
