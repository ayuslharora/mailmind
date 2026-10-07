import { OpenAIEmbeddings } from "@langchain/openai";

// bge-m3 on Cloudflare Workers AI: free, multilingual, and Cloudflare neither
// trains on nor keeps the text. Its endpoint speaks the OpenAI format.
export const EMBEDDING_MODEL = "@cf/baai/bge-m3";
export const EMBEDDING_DIMENSIONS = 1024;

// Created on first use, after dotenv has loaded the Cloudflare keys.
let embeddings;

export const getEmbeddings = () =>
  (embeddings ??= new OpenAIEmbeddings({
    model: EMBEDDING_MODEL,
    apiKey: process.env.CLOUDFLARE_API_TOKEN,
    configuration: {
      baseURL: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
    },
    encodingFormat: "float",
    batchSize: 50,
  }));
