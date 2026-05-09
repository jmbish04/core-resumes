import { checkOpenRoute } from "./src/backend/health/checks/openroute";

// mock env
const env: any = {
  AI: {
    run: async (model, body) => {
      console.log("AI run called with:", model, body.messages[0].content);
      return {
        response: '{"location": "Dublin, IE", "workplaceType": "onsite", "rtoPolicy": "Unknown"}',
      };
    },
  },
  AI_GATEWAY_ID: "test",
  MODEL_EXTRACT: "@cf/moonshotai/kimi-k2.6",
  DB: null,
  OPENROUTE_API_KEY: "test",
};

// We don't have the real DB/env, so this script might crash, but let's see.
