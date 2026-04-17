import type { UIAdapterModule } from "../types";
import {
  parseMastraGatewayStdoutLine,
  buildMastraGatewayConfig,
} from "@paperclipai/adapter-mastra-gateway/ui";
import { SchemaConfigFields } from "../schema-config-fields";

/**
 * UI registration for the mastra_gateway adapter.
 *
 * For v1 this reuses the generic schema-driven config form — no bespoke
 * ConfigFields component. `url` + `extraArgs` (repurposed as workflowId) +
 * `payloadTemplateJson` are surfaced by the schema form and translated into
 * adapterConfig by buildMastraGatewayConfig.
 */
export const mastraGatewayUIAdapter: UIAdapterModule = {
  type: "mastra_gateway",
  label: "Mastra Gateway",
  parseStdoutLine: parseMastraGatewayStdoutLine,
  ConfigFields: SchemaConfigFields,
  buildAdapterConfig: buildMastraGatewayConfig,
};
