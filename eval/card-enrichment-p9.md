# Card enrichment lastro-17 (p9): before and after

For Luan, to judge depth and tone. Committed locally, not pushed.

Gaúcha video `wOpqx7XvD54`, same moments, p8 demo card vs p9 demo card (p9 run 3). Text is what the card shows: the main text, the quote, then "Quem discorda". On p9, the line in italics is the node's fixed summary, now a smaller secondary line.

### 1. The "canetaço" proposal (1:23)

**Before (p8)**

**Esta fala lembra MMT (Teoria Monetária Moderna).** Quem emite a própria moeda não fica sem ela; o limite do gasto público é a inflação, não a solvência.

> “reduzir a taxa de juro no que se chama de canetaço e manter ela tabelada numa faixa reduzida, isso poderia cortar a dívida pública do país.”

QUEM DISCORDA DESTA FALA: Novo consenso / metas de inflação: Quem controla a inflação: o gasto público ou o banco central. · Dominância fiscal: Dívida alta na própria moeda pode forçar inflação?

**After (p9)**

**O falante afirma que tabelar juros baixos por decreto poderia reduzir a dívida pública.**

O falante propõe usar a taxa de juros como alavanca fiscal por decreto, ideia associada a André Lara Resende, que critica o consenso dos juros altos.

_Lembra MMT (Teoria Monetária Moderna): Quem emite a própria moeda não fica sem ela; o limite do gasto público é a inflação, não a solvência._

> “reduzir a taxa de juro no que se chama de canetaço e manter ela tabelada numa faixa reduzida, isso poderia cortar a dívida pública do país.”

QUEM DISCORDA DESTA FALA: Novo consenso / metas de inflação: O novo consenso responderia que juros tabelados por decreto desancoram as expectativas e minam a credibilidade do banco central. · Dominância fiscal: Dívida alta na própria moeda pode forçar inflação?

### 2. "Artificial… not in Turkey" (1:36)

**Before (p8)**

**Esta fala se apoia em Novo consenso / metas de inflação.** Um banco central independente move a taxa de juros para levar a inflação à meta.

> “medida considerada artificial pelos economistas. Já foi ah adotada em outros países, mais recentemente até na Turquia, não deu certo.”

QUEM DISCORDA DESTA FALA: MMT (Teoria Monetária Moderna): Quem controla a inflação: o gasto público ou o banco central.

**After (p9)**

**O falante afirma que tabelar juros é considerado artificial pelos economistas e fracassou em outros países.**

O falante usa o exemplo da Turquia e a ideia de artificialidade para rejeitar o tabelamento, seguindo a lógica de que a política monetária deve ser guiada pela inflação.

_Apoia-se em Novo consenso / metas de inflação: Um banco central independente move a taxa de juros para levar a inflação à meta._

> “Porém, isso é uma medida considerada artificial pelos economistas. Já foi ah adotada em outros países, mais recentemente até na Turquia, não deu certo.”

QUEM DISCORDA DESTA FALA: MMT (Teoria Monetária Moderna): A MMT responderia que o tabelamento é uma escolha legítima do Estado emissor, e que o problema é a inflação gerada, não o instrumento em si.

### 3. Market distrust without spending cuts (1:46)

**Before (p8)**

**Esta fala se apoia em Austeridade expansionista.** Um ajuste fiscal crível pode aumentar o crescimento ao melhorar a confiança.

> “Porque gera uma desconfiança do mercado como um todo, ah que o governo não vai cortar também o gasto. Pode manter o gasto elevado, talvez até aumentá-lo.”

QUEM DISCORDA DESTA FALA: Keynesianismo: Cortar gastos na recessão contrai ou expande a economia?

**After (p9)**

**O falante afirma que tabelar juros gera desconfiança do mercado de que o governo não cortará gastos.**

O falante liga a desconfiança do mercado à expectativa de gasto crescente, como faz a tradição austeritária.

_Apoia-se em Austeridade expansionista: Um ajuste fiscal crível pode aumentar o crescimento ao melhorar a confiança._

> “Porque gera uma desconfiança do mercado como um todo, ah que o governo não vai cortar também o gasto.”

QUEM DISCORDA DESTA FALA: Keynesianismo: O keynesianismo responderia que cortar gasto em momento de fraqueza da economia contrai a demanda e não restaura a confiança.

## What changed

- Each card now has `context` (why this claim belongs to the school, in the speaker's own argument) and `counterpoint` (how the opposing view answers this claim). Both come from the same single Haiku call per video and are cached in KV with the cards.
- **Deviation from the plan:** the two fields are not inside each unit. Inside the unit they changed the labels: p9 runs passed all Gaúcha gold cases in 5 of 12 runs vs 6 of 6 at p8; the Turkey card lost `s_novoconsenso` or got the wrong role. They are now a `notes` array written after all units. Cards stream as before; each card's text arrives as an `enrich` event about 10 s later. The extension and demo site redraw an open card when it arrives.
- **Counterpoint guard:** the model also names the view it speaks for (`against`). The Worker keeps the counterpoint only if that view is one the card already lists under "Quem discorda" (`shared/stance.ts`). Before the guard, 5 of 9 cards in one run gave a "counterpoint" from the speaker's own school. Dropped counterpoints fall back to the graph's edge note.
- Old cached cards (p8 and older, e.g. the `1FzdBFDbMUs` demo card) have no `context` and render the p8 layout.

## Measurements (Gaúcha, fresh runs)

| | p8 (6 runs) | p9 final (3 runs) |
|---|---|---|
| Gaúcha gold, all cases pass | 6/6 | 3/3 (plus 3/3 on the previous prompt revision) |
| Lara Resende linked | 6/6 | 3/3 |
| Time to first card, median | 1.9 s | 1.4 s |
| Time to last card text (done), median | 6.5 s | 11.9 s |
| Output tokens, median | 1,684 | 3,132 |
| Cost per video, warm prompt cache | $0.0012 | $0.0019 |
| Cost per video, first call after a prompt change (cache write) | $0.0026–0.0029 | $0.0037 |
| Node cards with `context` | – | 28/28 |
| Cards with a kept `counterpoint` | – | 2/10, 7/10, 8/9 |

Eval: 770/770 on fresh p9 streams of all 5 gold videos; typecheck clean. New checks: theory/forecast node cards have `context`; neither field has numbers absent from the quote and the linked map text, or a party/politician name; a kept counterpoint speaks for a view under "Quem discorda".

## Known limits

- Fact cards with a node sometimes get no `context` (1 of 4 across the final runs; the model treats facts as data). They keep the p8 layout; the coverage check covers theory/forecast cards only.
- Some `context` lines are generic ("como faz a tradição austeritária"). Some counterpoints lean on the same MMT line for many cards.
- One borderline word: "o tabelamento é uma escolha legítima do Estado emissor" (MMT counterpoint, example 2) is the opposing school's voice, not the card's verdict.
- Cards still reach the viewer before their text; a card that pops in the first ~10 s shows the p8 layout until its text arrives, then redraws.

## What needs Luan

1. Depth and tone of the examples above: ship p9, or adjust the wording first.
2. The deviation: text arrives after the cards (notes array) instead of inside each card. Required to keep the labels stable.
