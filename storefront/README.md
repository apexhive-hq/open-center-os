# open-center-os Storefront & Interactive PWA Preview

Cloudflare Worker serving:
- Full client-side sandboxed trilingual (`繁體中文` / `简体中文` / `English`) POS, check-in, renewal queue, receipt, and SVG pass preview
- XML-safe dynamic SVG student/client pass renderer (`GET /api/pass/:passCode.svg`)
- Non-custodial Base USDC (`0x2105`) Ed25519 licensing checkout (`15` / `49` USDC voluntary donations, `499 USDC` up to 3 branches Team, `999 USDC` unlimited branches Chain) backed by shared cross-product replay protection (`GLOBAL_CLAIMED_TX_KV`)
