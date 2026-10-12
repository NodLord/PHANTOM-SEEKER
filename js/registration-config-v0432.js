/* PHANTOM SEEKER V0.4.32 // REGISTRATION API CONFIG
   After deploying registration-worker, replace apiBase with the Worker URL.
   Example: https://phantom-seeker-registration.<your-subdomain>.workers.dev
*/
window.PHANTOM_REGISTRATION_CONFIG = Object.freeze({
  apiBase: "https://phantom-seeker-registration.phantom-seeker.workers.dev",
  requestTimeoutMs: 9000
});
