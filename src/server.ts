#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";

import { createTransport } from "./transport.js";
import { createRates } from "./rates.js";
import { SEARCH_TOOL_DESCRIPTION, createSearch, searchParamsSchema } from "./tools/search.js";
import { GET_LISTING_TOOL_DESCRIPTION, createGetListing, getListingParamsSchema } from "./tools/getListing.js";
import { LIST_CATEGORIES_TOOL_DESCRIPTION, createListCategories } from "./tools/listCategories.js";

const transport = createTransport();
const rates = createRates(transport);

const search = createSearch({ transport, rates });
const getListing = createGetListing({ transport, rates });
const listCategories = createListCategories({ transport });

const server = new Server({ name: "nine99-mcp", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "search_999", description: SEARCH_TOOL_DESCRIPTION, inputSchema: zodToJsonSchema(searchParamsSchema) as object },
    { name: "get_listing_999", description: GET_LISTING_TOOL_DESCRIPTION, inputSchema: zodToJsonSchema(getListingParamsSchema) as object },
    { name: "list_categories_999", description: LIST_CATEGORIES_TOOL_DESCRIPTION, inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    let result: unknown;
    if (name === "search_999") result = await search(args as never);
    else if (name === "get_listing_999") result = await getListing(args as never);
    else if (name === "list_categories_999") result = await listCategories();
    else throw new Error(`Unknown tool: ${name}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 1) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
console.error("999.md MCP server started");
