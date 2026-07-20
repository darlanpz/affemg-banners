/* supabase-config.js — configuração do backend (login + banners salvos).
 *
 * Enquanto estiver vazio, o login/salvar ficam desativados e o site funciona
 * normalmente (criar + baixar, e a galeria local de banners prontos).
 *
 * Preencha com os dados do SEU projeto Supabase (veja SUPABASE-SETUP.md):
 *   url     -> Project URL         (Settings → API → Project URL)
 *   anonKey -> chave "anon public" (Settings → API → Project API keys → anon public)
 *
 * A anon key é PÚBLICA (pode ficar no front-end). NUNCA coloque aqui a
 * "service_role" — essa é secreta.
 */
window.AFFEMG_SUPABASE = {
  url: 'https://zazknvlgoyotqdzopclj.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphemtudmxnb3lvdHFkem9wY2xqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNTE4NjMsImV4cCI6MjA5OTYyNzg2M30.kz6pxr1a200DSdA9egSQnolRce6v4umioYsfnaGG9E0',
  adminEmail: 'gapz.visual@gmail.com', // admin master: pode remover qualquer banner

  // Captcha do formulário "Solicitar acesso" (Cloudflare Turnstile, grátis).
  // Site key é PÚBLICA. A secret key vai como variável da Edge Function
  // (TURNSTILE_SECRET_KEY), nunca aqui. Enquanto vazio, o formulário funciona
  // sem captcha. Ver SUPABASE-SETUP.md.
  turnstileSiteKey: '0x4AAAAAAD6BGK3DcH1WASau',
};
