# Maestro Strategy Deliverables

This folder contains the July 2026 Maestro product and community strategy.

## Primary deliverables

- `Maestro_Strategy_Deck.pptx` — editable 23-slide pitch/strategy deck.
- `Maestro_Strategy_Deck.pdf` — presentation-ready PDF export.
- `Maestro_Strategy_Document.md` — detailed written strategy and operating guidance.
- `Maestro_Strategy_Deck_contact_sheet.png` — one-image visual preview of the full deck.

## What the deck covers

- problem hierarchy: surface pain vs. root problem;
- primary audience and expansion sequence;
- category and positioning;
- the core capture → assign → verify → learn product loop;
- Agentic Coding Space + Collab Space architecture;
- task creation, ownership, assignment, and anti-duplication protocol;
- evidence-based verification;
- design and peer-review workflow;
- onboarding and mobile direction;
- team members as “Skills++”;
- competitive reality and durable differentiation;
- community-first growth to 100–1,000 retained users;
- product roadmap, 90-day plan, metrics, risks, and messaging.

## Claim discipline

The deck labels implemented foundations as **Built now**, near-term priorities as **Next**, and expansion bets as **Later**. Current competitor statements are based on official Anthropic, OpenAI, and Nous Research documentation listed in the deck and the strategy document.

## Rebuild

```bash
cd docs/strategy
npm install
npm run build
libreoffice --headless --convert-to pdf --outdir . Maestro_Strategy_Deck.pptx
```

The deck generator uses Maestro’s warm-paper design language and product assets from this repository.
