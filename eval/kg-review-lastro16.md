# Graph expansion lastro-16: review list

Approved by Luan 2026-11-09 (A1–A9, B1–B38) with four changes, all applied: B22 title fixed, B35 year dropped, a Lara Resende gold case + prompt fix, demo card refreshed, version named p8. See section H.

- Graph: 22 → 36 nodes, 29 → 50 edges (+14 nodes, +21 edges, of which 9 are new `opposes`). Source: [eval/coverage-probe.md](coverage-probe.md), set approved by Luan 2026-11-08.
- Prompt: p6 → p8 (aliases now sent; three wording changes, sections D and H). Named p8, not p7: git already has a different p7 (7d13280, reverted in 58eeac5).
- Eval: 618/618 on fresh p8 streams for all 5 gold videos; typecheck clean. Live spend $0.0076 (draft) + $0.0079 (p8).

## A. New `opposes` edges (9)

Each shows on a card as "Quem discorda" with this note.

| # | From | Opposes | Note (shown on the card) | OK? |
|---|---|---|---|---|
| A1 | Marxismo (`p_marxismo`) | Liberalismo clássico (`f_liberalismo_classico`) | O mercado livre gera prosperidade ou exploração do trabalho? | |
| A2 | Teoria da dependência (`p_dependencia`) | Liberalismo clássico (`f_liberalismo_classico`) | O atraso vem da posição do país na economia mundial ou de instituições e políticas internas? | |
| A3 | Regulação e falhas de mercado (`s_falhas_mercado`) | Libertarianismo (`f_libertarianismo`) | Regras e licenças protegem quem compra e trabalha, ou só limitam a liberdade de contratar? | |
| A4 | Teoria democrática procedimental (`p_democracia_procedimental`) | Marxismo (`p_marxismo`) | Democracia é a regra do jogo eleitoral, ou ela esconde a dominação de classe? | |
| A5 | Conservadorismo (`p_conservadorismo`) | Marxismo (`p_marxismo`) | Reformar devagar a partir da tradição ou transformar a estrutura da sociedade? | |
| A6 | Conservadorismo (`p_conservadorismo`) | Libertarianismo (`f_libertarianismo`) | O Estado deve ser neutro sobre costumes ou proteger valores e instituições tradicionais? | |
| A7 | Protecionismo / nacionalismo econômico (`p_protecionismo`) | Liberalismo clássico (`f_liberalismo_classico`) | Livre comércio enriquece os dois lados ou deixa o país sem indústria? | |
| A8 | Liberalismo clássico (`f_liberalismo_classico`) | Legislação trabalhista (CLT, reforma de 2017, escala 6x1) (`i_legislacao_trabalhista`) | Proteção legal ao trabalhador ou liberdade de contratar e menos informalidade? | |
| A9 | Liberalismo clássico (`f_liberalismo_classico`) | Previdência (repartição × capitalização) (`i_previdencia`) | Repartição solidária entre gerações ou capitalização individual? | |

Two of these (A8, A9) have an institution on the `to` side. By the stance change in D3, they show only on the institution's cards (a speaker relying on CLT or on the Previdência sees "Quem discorda: Liberalismo clássico"), never the reverse.

## B. New references (38)

⚠ = the title or year is from memory and least certain; check that it exists before shipping. All other refs are works I'm confident exist, but every title is still from memory (same caveat as the existing graph note).

| # | Node | Level | Reference | OK? |
|---|---|---|---|---|
| B1 | Marxismo (`p_marxismo`) | intro | Karl Marx e Friedrich Engels, Manifesto do Partido Comunista (1848) | |
| B2 | Marxismo (`p_marxismo`) | deep | Karl Marx, O Capital, Livro I (1867) | |
| B3 | Marxismo (`p_marxismo`) | opposing | Eugen von Böhm-Bawerk, Karl Marx and the Close of His System (1896) | |
| B4 | Teoria da dependência (`p_dependencia`) | intro | Eduardo Galeano, As Veias Abertas da América Latina (1971) | |
| B5 | Teoria da dependência (`p_dependencia`) | deep | Ruy Mauro Marini, Dialética da Dependência (1973) | |
| B6 | Teoria da dependência (`p_dependencia`) | opposing | Daron Acemoglu e James Robinson, Por que as Nações Fracassam (2012) | |
| B7 | Regulação e falhas de mercado (`s_falhas_mercado`) | intro | Joseph Stiglitz, Economics of the Public Sector (1986) | |
| B8 | Regulação e falhas de mercado (`s_falhas_mercado`) | deep | George Akerlof, The Market for 'Lemons' (1970) | |
| B9 | Regulação e falhas de mercado (`s_falhas_mercado`) | opposing | George Stigler, The Theory of Economic Regulation (1971) | |
| B10 | Teoria democrática procedimental (`p_democracia_procedimental`) | intro | Steven Levitsky e Daniel Ziblatt, Como as Democracias Morrem (2018) | |
| B11 | Teoria democrática procedimental (`p_democracia_procedimental`) | deep | Joseph Schumpeter, Capitalismo, Socialismo e Democracia (1942) | |
| B12 | Teoria democrática procedimental (`p_democracia_procedimental`) | opposing | Carole Pateman, Participation and Democratic Theory (1970) | |
| B13 | Conservadorismo (`p_conservadorismo`) | intro | Roger Scruton, Como Ser um Conservador (2014) | |
| B14 | Conservadorismo (`p_conservadorismo`) | deep | Edmund Burke, Reflexões sobre a Revolução na França (1790) | |
| B15 | Conservadorismo (`p_conservadorismo`) | opposing | Thomas Paine, Os Direitos do Homem (1791) | |
| B16 | Protecionismo / nacionalismo econômico (`p_protecionismo`) | intro | Ha-Joon Chang, Chutando a Escada (2002) | |
| B17 | Protecionismo / nacionalismo econômico (`p_protecionismo`) | deep | Friedrich List, Sistema Nacional de Economia Política (1841) | |
| B18 | Protecionismo / nacionalismo econômico (`p_protecionismo`) | opposing | Douglas Irwin, Free Trade Under Fire (2002) | |
| B19 | Recessão de 2014–16 (`e_recessao2015`) | intro | Laura Carvalho, Valsa Brasileira (2018) | |
| B20 | Recessão de 2014–16 (`e_recessao2015`) | deep | Fernando de Holanda Barbosa Filho, A crise econômica de 2014/2017, Estudos Avançados (2017) | |
| B21 | Plano Real (1993–94) (`e_plano_real`) | intro | Miriam Leitão, Saga Brasileira: a longa luta de um povo por sua moeda (2011) | |
| B22 | Plano Real (1993–94) (`e_plano_real`) | deep | Persio Arida e André Lara Resende, Inertial Inflation and Monetary Reform in Brazil (PUC-Rio, Texto para Discussão 85, 1985) — title fixed, verified by Luan 11-09 | |
| B23 | Presidencialismo de coalizão (`i_presidencialismo_coalizao`) | intro | Sérgio Abranches, Presidencialismo de Coalizão: raízes e evolução do modelo político brasileiro (2018) | |
| B24 | Presidencialismo de coalizão (`i_presidencialismo_coalizao`) | deep | Sérgio Abranches, Presidencialismo de coalizão: o dilema institucional brasileiro, Dados (1988) | |
| B25 | Presidencialismo de coalizão (`i_presidencialismo_coalizao`) | opposing | Argelina Figueiredo e Fernando Limongi, Executivo e Legislativo na Nova Ordem Constitucional (1999) | |
| B26 | Impeachment (`i_impeachment`) | intro | Lei nº 1.079/1950 (texto da lei) | |
| B27 | Impeachment (`i_impeachment`) | deep | Aníbal Pérez-Liñán, Presidential Impeachment and the New Political Instability in Latin America (2007) | |
| B28 | STF e controle de constitucionalidade (`i_stf_controle`) | intro | Oscar Vilhena Vieira, Supremocracia, Revista Direito GV (2008) | |
| B29 | STF e controle de constitucionalidade (`i_stf_controle`) | deep | Alexander Bickel, The Least Dangerous Branch (1962) | |
| B30 | STF e controle de constitucionalidade (`i_stf_controle`) | opposing | Ran Hirschl, Towards Juristocracy (2004) | |
| B31 | Sistema eleitoral (`i_sistema_eleitoral`) | intro | Jairo Nicolau, Sistemas Eleitorais (1999) | |
| B32 | Sistema eleitoral (`i_sistema_eleitoral`) | deep | Arend Lijphart, Modelos de Democracia (1999) | |
| B33 | Legislação trabalhista (CLT, reforma de 2017, escala 6x1) (`i_legislacao_trabalhista`) | intro | Decreto-Lei nº 5.452/1943 (CLT) e Lei nº 13.467/2017 (reforma trabalhista), textos legais | |
| B34 | Legislação trabalhista (CLT, reforma de 2017, escala 6x1) (`i_legislacao_trabalhista`) | deep | Ricardo Antunes, O Privilégio da Servidão (2018) | |
| B35 | Legislação trabalhista (CLT, reforma de 2017, escala 6x1) (`i_legislacao_trabalhista`) | opposing | ⚠ José Pastore, A Agonia do Emprego — year dropped: title is in his bibliography, year and publisher not found (11-09) | |
| B36 | Previdência (repartição × capitalização) (`i_previdencia`) | intro | Emenda Constitucional nº 103/2019 (texto da reforma) | |
| B37 | Previdência (repartição × capitalização) (`i_previdencia`) | deep | Fabio Giambiagi, Reforma da Previdência: o encontro marcado (2007) | |
| B38 | Previdência (repartição × capitalização) (`i_previdencia`) | opposing | Denise Lobato Gentil, A política fiscal e a falsa crise da seguridade social brasileira (tese, UFRJ, 2006) | |

Nodes without an opposing ref: episodes (as the existing ones), `i_impeachment` and `i_sistema_eleitoral` (I found no single work that argues against the institution; their cards show no opposing reading).

## C. Other new edges (12, FYI: no card shows them as disagreement)

| From | Relation | To | Note |
|---|---|---|---|
| `p_socialdemocracia` | derives_from | `p_marxismo` | Ramo reformista: mudar o capitalismo por eleições, não por revolução. |
| `p_dependencia` | derives_from | `p_desenvolvimentismo` | Radicaliza a ideia de centro e periferia da CEPAL. |
| `p_marxismo` | grounds | `p_dependencia` | Vertente marxista: Marini, Theotonio dos Santos. |
| `p_protecionismo` | grounds | `p_desenvolvimentismo` | Indústria nascente como base da substituição de importações. |
| `p_democracia_procedimental` | justifies | `i_sistema_eleitoral` | Eleições livres e competitivas são o núcleo da democracia. |
| `p_democracia_procedimental` | justifies | `i_stf_controle` | Um tribunal independente protege as regras do jogo. |
| `i_presidencialismo_coalizao` | derives_from | `i_sistema_eleitoral` | Voto proporcional com muitos partidos obriga o presidente a montar coalizões. |
| `p_socialdemocracia` | justifies | `i_legislacao_trabalhista` | O Estado protege quem trabalha. |
| `p_socialdemocracia` | justifies | `i_previdencia` | Previdência pública e solidária é parte do Estado de bem-estar. |
| `s_dominancia` | tested_in | `e_recessao2015` | Déficit e dívida em alta, juros altos e recessão: citado como dominância fiscal. |
| `s_austeridade` | tested_in | `e_recessao2015` | O ajuste de 2015: os dois lados citam o episódio. |
| `s_monetarismo` | tested_in | `e_plano_real` | O Real atacou a inércia, não só a moeda; monetaristas e inercialistas leem o sucesso de forma diferente. |

## D. Prompt and logic changes in p8 (drafted as p7)

1. `kgPromptText()` now sends each node's aliases: `- id [type · domain] name (também: a; b; c): summary`. The cached system prompt grew to ~11.8k tokens (still a cache read, ~$0.0012 per uncached video).
2. Two sentences of `shared/prompt.ts` widened, else the new political institutions could never be used:
   - intro: "vídeo brasileiro sobre economia" → "sobre economia ou política", and "ideias econômicas" → "ideias econômicas e políticas (escolas, tradições, instituições e episódios)";
   - rule: "Ignore … opiniões sem conteúdo econômico" → "… sem uma ideia econômica ou política por trás".
3. `shared/stance.ts`: when the speaker relies on a school or thinker, institutions are no longer listed under "Quem discorda" (an institution is not a view). Side effect on an existing card: an MMT speaker no longer sees "Regras fiscais" as disagreeing (still sees Novo consenso and Dominância fiscal). Stance case added.
4. Refs got an optional `unverified: true` flag (`shared/kg.ts` type); nothing renders it yet.

## E. Aliases added to existing nodes

| Node | Added |
|---|---|
| `s_novoconsenso` | juros restritivos, Copom |
| `s_austeridade` | equilibrar as contas |
| `f_liberalismo_classico` | liberdade econômica, liberdade de mercado, liberalismo econômico, Lei de Liberdade Econômica |
| `f_libertarianismo` | libertária, libertários |
| `p_socialdemocracia` | socialdemocracia |
| `p_desenvolvimentismo` | reindustrialização, política industrial, mudança estrutural |

Left out as agreed: "risco fiscal", "cenário fiscal", "dívida/PIB", "seriedade fiscal", "ortodoxo/ortodoxia".

New nodes' aliases (thinkers on their school): see `shared/kg.json`. Names that are aliases, not nodes: Marx, Gramsci → marxismo; Marini, Theotonio dos Santos, Florestan Fernandes, Galeano → dependência; Schumpeter, Przeworski, Bobbio, Levitsky → teoria democrática; Burke, Scruton → conservadorismo; Friedrich List → protecionismo; Sérgio Abranches → presidencialismo de coalizão.

## F. Measured effect on the real gold video (Gaúcha, wOpqx7XvD54)

Three p7 runs vs three p6 runs, $0.0035:

| | p6 (3 runs) | p7 (3 runs) |
|---|---|---|
| Gold cases (2) | pass | pass |
| André Lara Resende linked (`t_lararesende`) | 3/3 | **1/3** |
| `s_mmt` linked (the "canetaço" line) | 1/3 | 3/3 |
| Debt card carries `dbgg_pib` | 3/3 | 0/3 |
| Cards | 9–11 | 7–11 |

- `dbgg_pib` loss is a fix: p6 put the indicator on a *theory* card with no claimed value, which the prompt says to leave null.
- Lara Resende loss is a real drop on a video that is about his proposal. Not covered by gold. I did not tune the prompt for it; options in G.

## G. What needs Luan

1. Approve or strike A1–A9 and B1–B38 (mark the OK column or reply with the numbers to strike).
2. Lara Resende drop (F): (a) accept for now; (b) add a gold case "Lara Resende proposal links `t_lararesende`" and iterate the prompt (≤ $0.05); (c) move his name into the `s_ftpl` aliases too. I recommend (b).
3. Demo fallback cards (`fixtures/demo-cards/wOpqx7XvD54.json`) are still the p6 output. Refresh them from a p7 run after (2)?

## Housekeeping

- `TESTecon02` was renamed `TESTecono02`: the Worker requires an 11-character video id.
- The local KV still held cards under `p7` from the p7 attempt that was reverted earlier on 11-08; the first p7 runs here returned them in 28 ms. All runs above used `--nocache`. Production KV never had p7 (no deploy yet), so this only affects local dev.

## H. After review (2026-11-09)

- Gold case added on the Gaúcha video: the card quoting the proposal ("defende uma redução…", "canetaço", "reduzir a dívida pública poderia") must link `t_lararesende`, any role.
- Prompt line added to the `nodes` rule: when the video attributes the idea to a thinker on the map (by name, or "ele" right after naming him), include that thinker's node as well as the school.
- Gaúcha, 3 fresh p8 runs: Lara Resende linked **3/3**; all 3 gold cases pass on every run; `dbgg_pib` on 0/3 theory cards (kept).
- Demo fallback `fixtures/demo-cards/wOpqx7XvD54.json` and `fixtures/streams/wOpqx7XvD54.ndjson` are p8 run 3 (10 cards, one `cambio_usd` fact card).
- Seen once in p8 run 1, not gated: a card on "a ofensiva terrorista dos rentistas" linked `p_socialdemocracia`. Run 3 dropped that line (no node).
