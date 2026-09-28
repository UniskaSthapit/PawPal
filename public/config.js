/* PUBLIC configuration only. Anything here is visible to every visitor.
   NEVER put passwords, JWT secrets, DB URIs, SMTP or OpenAI keys here — those live in the server's .env. */
window.CONFIG = {
  API_BASE_URL: "",                       // "" = same origin (default). Set to your API URL if hosted separately.
  MAPS_API_KEY: "YOUR_PUBLIC_API_KEY"     // Public embed key only; restrict by website in Google Cloud.
};
