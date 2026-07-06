import { defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import listRentalPackagesTool from "./tools/list-rental-packages";
import listOutstationVehiclesTool from "./tools/list-outstation-vehicles";

export default defineMcp({
  name: "luxury-cabs-mcp",
  title: "Luxury Cabs MCP",
  version: "0.1.0",
  instructions:
    "Tools for the Luxury Cabs app. Use `list_rental_packages` and `list_outstation_vehicles` to look up current pricing, or `echo` to verify connectivity.",
  tools: [echoTool, listRentalPackagesTool, listOutstationVehiclesTool],
});
