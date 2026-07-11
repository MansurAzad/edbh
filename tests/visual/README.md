# Visual regression tests

Snapshots of the premium homepage and `/shop` pages across mobile / tablet / desktop
breakpoints, powered by Playwright's `toHaveScreenshot`.

## Run locally

```bash
# 1. Start the dev server (or point BASE_URL at a preview URL)
bun run dev

# 2. In another terminal, run the visual suite
BASE_URL=http://localhost:8080 npx playwright test -c playwright.visual.config.ts
```

## Update baselines after an intentional UI change

```bash
BASE_URL=http://localhost:8080 npx playwright test -c playwright.visual.config.ts --update-snapshots
```

Then commit the new PNGs under `tests/visual/__screenshots__/`.

## Breakpoints covered

| Project        | Viewport            | Purpose                          |
| -------------- | ------------------- | -------------------------------- |
| `mobile-small` | iPhone SE (375×667) | small-phone layout guard         |
| `mobile-large` | iPhone 13 Pro Max   | large-phone layout guard         |
| `tablet`       | iPad (gen 7)        | tablet breakpoint guard          |
| `desktop`      | 1280×900            | desktop reference                |

## What's covered

Pages (`homepage-shop.visual.spec.ts` + `additional-pages.visual.spec.ts`):

- Premium homepage (`/`) — hero above-the-fold + full-page scroll.
- Shop landing (`/shop`).
- Shop with price filter (`/shop?maxPrice=3000`) — protects the price-chip → URL → slider wiring.
- Product detail (`/product/:id`) — first product resolved dynamically from `/shop`.
- Cart empty state (`/cart`).
- Checkout (`/checkout`).
- Blog listing (`/blog`).
- Contact (`/contact`).

Interaction states (`interaction-states.visual.spec.ts`):

- Shop product card **hover**.
- Homepage primary CTA (`.btn-gold`) **hover**.
- Homepage PriceQuickShop chip **hover**.
- Header search dialog **open**.
- Blog category filter **active/selected**.

## Notes

- Animations, transitions, and caret blink are disabled during capture.
- Floating contact widget, chat widget, and social-proof toasts are hidden — they're not
  part of the layout under test and would cause flakes.
- `maxDiffPixelRatio: 0.003` tolerates minor antialiasing/font-hinting jitter.
