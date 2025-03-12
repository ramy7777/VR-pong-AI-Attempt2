// Entry file for bundling the OpenAI Realtime API client
const { RealtimeClient } = require('@openai/realtime-api-beta');

// Export to the global window object for browser access
window.RealtimeClient = RealtimeClient; 