# Knowledge-graph coverage probe (lastro-15)

Lastro's graph (`shared/kg.json`: 22 nodes, 29 edges, prompt p6) bounds what the cards can say. The model drops any idea it can't tie to a node or an indicator. This probe measures which ideas real videos argue from that the graph lacks. **Measure only**: `kg.json`, the prompt and `PROMPT_VERSION` are unchanged.

- Run: `npm run probe -- --run`, then `--report`, using Haiku 5.5 on 210 videos.
- Spend: **$0.040**, from the prompt cache hitting on 208 of 210 calls. That brings the $20 cap to about $0.121 spent.
- Raw rows are in `.cache/coverage/raw.jsonl` (gitignored).
- Generated 2026-11-08.

## Read this first: what the sample can and can't show

- **The input is thin.**
  - 192 of the 210 videos have title + description only.
  - 18 have stored captions, which cover just the first ~3 minutes.
  - So counts rank the gaps; they are not frequencies.
- **Only 54 videos (26%) argue from any idea at all.**
  - The other 156 are political news (impeachment, STF, the right after the election, scandals). Their title or description names people and parties but no tradition.
  - On political news, the cards can only ever hang on **institutions** (STF, impeachment, electoral system, coalition presidentialism), not on schools.
- **The model's in-graph matching is noisy.** It marked existing nodes as missing 5 times:
  - "Novo consenso" ×1, "Justiça como equidade (Rawls)" ×1, "Desenvolvimentismo" ×1, "Cortes da Selic em 2011–13" ×1;
  - "Estado não quebra" was mapped to `s_dominancia`, but it is an alias of `s_mmt`.
  - The curated table below fixes these by hand.

## Ranked gaps (hand-grouped)

Video counts are distinct videos per family, from the per-video list at the bottom.
- "Attach" is my suggestion for where a node would hang. It is not a drafted edge.
- Luan reviews refs and every new `opposes` edge himself.

| # | Missing concept (family) | Type | Videos | Attach (suggested) | Example evidence |
|---|---|---|---|---|---|
| 1 | **Marxismo** (Marx, mais-valia, materialismo histórico, marxismo-leninismo, socialismo, Gramsci) | school | 6 | opposes `f_liberalismo_classico`; `p_socialdemocracia` derives_from it (reformist branch) | "Karl Marx (O Capital) · trabalho como mercadoria · força de trabalho" (uCtPfxjSdyM); "O enigma do PT: entre o comunismo e a socialdemocracia" (RyJb0UhxG-4) |
| 2 | **Teoria da dependência / pensamento social brasileiro** (colonialidade, Florestan Fernandes, Jessé Souza, "a culpa é da colonização", pan-africanismo, Amílcar Cabral) | school | 5 | derives_from `p_desenvolvimentismo`; opposed by `f_liberalismo_classico` (institutions, not colonization, explain development: Tb5nwnaYfMU) | "os participantes refletem sobre dependência intelectual, identidade nacional, … colonialidade" (3VHzi5UBGQs); "que 'a culpa é da colonização'" (Tb5nwnaYfMU) |
| 3 | **Ética normativa** (virtude/Aristóteles, deontologia/Kant, Platão, cinismo/Diógenes, Spinoza) | school ×2–3 | 5 | `filosofia` domain; grounds `f_justica_rawls` / `f_liberalismo_classico` | "a justa medida de Aristóteles" (sGYlQ2sHaZM); "o cinismo pragmático de Diógenes de Sínope" (G9Ki3Dk6uJ0) |
| 4 | **Recessão de 2014–16** (crise de 2014, recessão 2015/16, pedaladas) | episode | 4 | `s_dominancia` tested_in; `s_austeridade` tested_in (2015 adjustment). Distinct from `e_cortes2012` (2011–13), whose aliases already include "nova matriz econômica" | "A PRÓXIMA RECESSÃO NO BRASIL NÃO DEVE SER COMO 2015/16" (JEZTRk2Vk0A); "Juros e a Crise de 2014" (UQ1CIPyefZQ) |
| 5 | **Regulação / falhas de mercado** (bets, OAB da Medicina, licenças e alvarás, supervisão bancária, defesa do consumidor) | school | 4 | opposes `f_libertarianismo`; justifies an "agências reguladoras" institution | "Regulação estatal de jogos de azar" (T4RvTv3mAZc); "Por que trabalhar precisa de permissão?" (BQ8hKTCA5Hs) |
| 6 | **Political institutions** (presidencialismo de coalizão, impeachment, STF/"juristocracia", Colégio Eleitoral) | institution | 3 | none today; the graph has no political institution. Would be justified by row 8 | "a eleição presidencial americana é indireta … Colégio Eleitoral" (sCvXN46nw4E); "juristocracia" (zezco8Tfin0) |
| 7 | **Trabalho** (taylorismo/fordismo/toyotismo, uberização, escala 6x1 e reforma trabalhista, salário por escassez) | school + institution | 3 | institution "legislação trabalhista (CLT, reforma de 2017, 6x1)", justified by `p_socialdemocracia` and opposed by `f_liberalismo_classico` | "Mais-Valia, Uberização e Taylorismo, Fordismo e Toyotismo" (uCtPfxjSdyM); "HORA DO ALMOÇO VIRA HORA DE TRABALHO" (5WYhrmCW-zM) |
| 8 | **Teoria democrática** (democracia procedimental: Schumpeter, Przeworski, Bobbio; polarização afetiva) | school | 2 | justifies row 3 | "o minimalismo institucional de Adam Przeworski, Joseph Schumpeter e Norbert Bobbio" (fzm-rBlQVaI) |
| 9 | **Conservadorismo / populismo** (nova direita, populismo) | school | 2 | opposes `f_libertarianismo` on morals and `p_socialdemocracia` on the state; populismo needs its own note | "organizar o movimento conservador desde a base" (zezco8Tfin0) |
| 10 | **Protecionismo / nacionalismo econômico** (tarifas, America First, BRICS, China's industrial policy) | school | 2 | opposes `f_liberalismo_classico`; overlaps `p_desenvolvimentismo` | "Tarifaço de Trump, Protecionismo e BRICS" (Ezicrj2RQyY) |
| 11 | **Previdência** (repartição × capitalização) | institution | 1 | justified by `p_socialdemocracia`; `f_liberalismo_classico` argues for capitalização | "Os desafios da Previdência e como superá-los" (wIZSV6drxiE) |
| 12 | **Plano Real** (inflação inercial) | episode | 1 | tested_in for an inertial-inflation idea; Lara Resende co-authored it | "Plano Real" (M1sZ8IojcN4) |
| 13 | **Juros cortados "na marra" abroad** (Turkey) | episode | 1 | like `e_cortes2012`: `s_novoconsenso` tested_in | "Casos reais de queda de juros na marra: … a crise na Turquia" (nc55w2yFyoE) |
| 14 | **Tributação** (imposto embutido no consumo, reforma tributária) | institution | 1 | none today | "O imposto que não se vê" (6Q526M2X8w8) |

Singletons with no family were left out: Hiroshima, Canudos, golpe de 1964, URSS, Tratado de Petrópolis, McLuhan, Mark Fisher, Paulo Freire ×2, ENEM repertoire authors. They are listed in the raw output below.

**Thinkers.** None qualifies as a node by the orchestrator's rule (only where a thinker is cited for something their school doesn't cover). Each is cited as the face of a school:
- Marx → row 1; Aristóteles and Kant → row 3; Schumpeter, Przeworski and Bobbio → row 8. They should be aliases of those schools.
- The one possible exception is **Paulo Freire** (2 videos, education). He fits the hackathon track (Acesso à educação) but sits outside the economics/politics scope.

## Existing nodes

**Never hit (6):** `s_keynes`, `t_kelton`, `t_hayek`, `t_furtado`, `p_soberania_monetaria`, `e_selic2`.
- Keynes at 0 is the surprise. With titles and descriptions only, "Keynes" or "demanda agregada" rarely appears. The 18 captioned videos are 3-minute openings.
- My read: this is a sampling artefact, not proof the node is useless. Keep all six. `t_kelton`, `t_hayek` and `t_furtado` are the obvious candidates to fold into aliases of their schools if node count gets tight.

**Most hit:**
- `f_liberalismo_classico` 11;
- `s_dominancia` 9;
- `i_regras_fiscais` 5;
- `p_desenvolvimentismo` 4;
- `s_novoconsenso`, `s_austeridade`, `t_lararesende` and `i_bc_autonomo` 3 each.

## Alias candidates

Aliases never reach the model today: `kgPromptText()` sends only name, summary and claims. Below are the candidates worth adding, cleaned by hand from the raw table:

| Node | Add as alias | Why |
|---|---|---|
| `p_socialdemocracia` | "socialdemocracia" (no hyphen) | `looseNorm` gives "socialdemocracia" ≠ "social democracia", so the current alias misses it |
| `f_libertarianismo` | "libertária", "libertários" | `looseNorm` doesn't fold gender or plural |
| `f_liberalismo_classico` | "liberdade econômica", "liberdade de mercado", "liberalismo econômico" | 3 videos use these |
| `p_desenvolvimentismo` | "reindustrialização", "política industrial", "mudança estrutural" | M4xUpAnuMJ4, N8qhTLbK-JM, Ezicrj2RQyY |
| `s_novoconsenso` | "juros restritivos", "Copom" | JEZTRk2Vk0A, E5sO60IrcL8 |
| `s_monetarismo` | "ortodoxo", "ortodoxia" | UQ1CIPyefZQ. Caution: "ortodoxo" covers more than monetarism |
| `s_austeridade` | "equilibrar as contas" | |
| school rows 1, 3, 8 | thinkers above | |

**Don't add as aliases:** the generic fiscal terms "risco fiscal", "cenário fiscal", "dívida/PIB" and "seriedade fiscal". The model tagged 9 fiscal-news videos as `s_dominancia` from these words alone, which overreaches. Dominância fiscal is a specific claim (high debt forces the central bank to accommodate). Plain fiscal worry is closer to `i_regras_fiscais`.

## What needs Luan

1. **Pick the families to turn into nodes.** Reaching ~45–50 nodes means adding 23–28.
   - My order: rows 1, 2, 4 and 6 first (marxismo, dependência, recessão 2014–16, political institutions), then 5, 7, 9 and 8. Row 3 (ética) is `filosofia`, outside the eco/pol videos the product targets.
   - Row 6 alone needs 3–4 nodes: presidencialismo de coalizão, impeachment, STF/controle de constitucionalidade, sistema eleitoral.
2. **Confirm the alias plan**, including whether `kgPromptText()` should start sending aliases. That is a prompt change: p6 → p7, and every cached card is invalidated.
3. **Decide whether the 6 never-hit nodes stay.** My recommendation is to keep them; the absence is a sampling artefact.

<!-- auto: everything below is regenerated by npm run probe -- --report -->

## Raw output

Generated by `scripts/coverage-probe.ts` with claude-haiku-5-5, graph 22 nodes / 29 edges (p6). Measure only: `shared/kg.json` and the prompt are unchanged.

### Inputs and limits

- 210 videos labelled economia or politica in `data/classifier/labels.csv`. 18 had stored captions (first ~3 minutes only); the rest are title + description.
- 54 videos (26%) yielded at least one concept. Most of the rest are political news with no idea argued in the title or description.
- Titles and descriptions understate what a full video argues. Treat counts as a ranking, not as frequencies.
- 1 concepts naming a party or active politician were dropped (graph rule).
- Spend: $0.0404.

### Missing concepts as the model named them, ranked by videos

Model's suggestion for where each would attach: `relation node` (the new concept *relation* the node), most common answer.

| # | Concept | Type | Videos | Would attach | Example evidence |
|---|---|---|---|---|---|
| 1 | Karl Marx | thinker | 2 | opposes f_liberalismo_classico | "O Capital — Karl Marx" (S5IkEMYIwKw)<br>"Karl Marx (O Capital) · trabalho como mercadoria · força de trabalho" (uCtPfxjSdyM) |
| 2 | 1984 de George Orwell (proletas) | episode | 1 | — | "Os proletas de Orwell e a amputação do senso histórico" (S5IkEMYIwKw) |
| 3 | Adam Przeworski | thinker | 1 | — | "contrastando-as com o minimalismo institucional de Adam Przeworski, Joseph Schumpeter e Norbert Bobbio" (fzm-rBlQVaI) |
| 4 | America First | school | 1 | none f_liberalismo_classico | "America First: Acordo de Paris, ONU e OMC" (Ezicrj2RQyY) |
| 5 | Amílcar Cabral | thinker | 1 | none p_desenvolvimentismo | "Amílcar Cabral e Cheikh Anta Diop: Filomeno os recomenda como leituras importantes para pensar uma ruptura" (3VHzi5UBGQs) |
| 6 | Antonio Gramsci | thinker | 1 | none s_keynes | "Autores e figuras citados ou evocados Antonio Gramsci; Achille Mbembe" (3VHzi5UBGQs) |
| 7 | Aristóteles | thinker | 1 | — | "as formulações clássicas de Platão e Aristóteles, contrastando-as com o minimalismo institucional" (fzm-rBlQVaI) |
| 8 | Aristóteles (virtude como justa medida e eudaimonia) | thinker | 1 | none f_liberalismo_classico | "a justa medida de Aristóteles" (sGYlQ2sHaZM) |
| 9 | Atuação de multinacionais na economia africana | institution | 1 | opposes p_desenvolvimentismo | "como essas multinacionais trabalharam nos últimos anos e como isso impactou gravemente todo o ecossistema econômico desses países" (wgn3ETrvYkY) |
| 10 | Banco dos BRICS (NDB) x FMI e Banco Mundial | institution | 1 | — | "Banco dos BRICS (NDB) x FMI e Banco Mundial" (Ezicrj2RQyY) |
| 11 | Bens em comum | school | 1 | none p_socialdemocracia | "refletimos sobre os bens em comum e sua importância para a vida coletiva" (CXCj4hWpP58) |
| 12 | Bombardeios de Hiroshima e Nagasaki (1945) | episode | 1 | — | "Truman autorizou as bombas sobre Hiroshima e Nagasaki, que mataram mais de cem mil pessoas" (sGYlQ2sHaZM) |
| 13 | BRICS | institution | 1 | none p_desenvolvimentismo | "o que é BRICS, o Banco dos BRICS e o BRICS+" (Ezicrj2RQyY) |
| 14 | Canudos | episode | 1 | — | "a violência fundadora da nossa história (Canudos, as intentonas de 1935 e 1938)" (M1sZ8IojcN4) |
| 15 | Capital cultural (Pierre Bourdieu) | thinker | 1 | — | "Repertório para redação sobre educação: Paulo Freire e Bourdieu" (tsk5U_acEDM) |
| 16 | Captura do Estado por grupos privados (simbiose entre elites e especulação bancária) | school | 1 | opposes f_liberalismo_classico | "Master e Ueno são ‘grupos privados que usam estrutura política para lucrar’, diz Amanda Harumy" (vp-APD1Ba4U) |
| 17 | Cheikh Anta Diop | thinker | 1 | none t_furtado | "Amílcar Cabral e Cheikh Anta Diop: Filomeno os recomenda como leituras importantes para pensar uma ruptura" (3VHzi5UBGQs) |
| 18 | Cidadania (T. H. Marshall; José Murilo de Carvalho) | thinker | 1 | derives_from p_socialdemocracia | "Repertório coringa e repertório sociocultural para a Redação do ENEM 2026" (tsk5U_acEDM) |
| 19 | Cinismo | school | 1 | none f_liberalismo_classico | "A reflexão evoca desde o cinismo pragmático de Diógenes de Sínope até as noções clássicas de punição e moralidade" (G9Ki3Dk6uJ0) |
| 20 | Colapso por dados sintéticos (Ouroboros algorítmico) | episode | 1 | — | "Ouroboros algorítmico: o colapso da linguagem por dados sintéticos" (JVj79nwxEKE) |
| 21 | Colégio Eleitoral | institution | 1 | none i_regras_fiscais | "por que a eleição presidencial americana é indireta e como o voto popular se relaciona com os delegados e o Colégio Eleitoral" (sCvXN46nw4E) |
| 22 | Colonialidade / dependência intelectual | school | 1 | opposes p_desenvolvimentismo | "os participantes refletem sobre dependência intelectual, identidade nacional, futebol, colonialidade" (3VHzi5UBGQs) |
| 23 | Colonização europeia da África | episode | 1 | — | "A colonização do continente africano pelos europeus teve início no século 15" (wgn3ETrvYkY) |
| 24 | conservadorismo | school | 1 | none f_liberalismo_classico | "organizar o movimento conservador desde a base" (zezco8Tfin0) |
| 25 | Corrupção como causa única do atraso | school | 1 | — | ""que “o problema é apenas a corrupção”"" (Tb5nwnaYfMU) |
| 26 | Corte de programas sociais por condicionalidade de trabalho | institution | 1 | opposes p_socialdemocracia | "900 mil pessoas foram cortadas de programas sociais, sendo que estavam recebendo mesmo podendo trabalhar" (KCiVaEiTOIo) |
| 27 | Cortes da Selic / crise de 2014 | episode | 1 | tested_in e_crise2002 | "A história mostra que já tivemos dois cenários muito diferentes: um que acalmou o mercado e outro que terminou em recessão." (E5sO60IrcL8) |
| 28 | Cortes da Selic em 2011–13 | episode | 1 | tested_in e_cortes2012 | "o que aconteceu com outros países que tentaram fazer o mesmo" (iRCgbq6Zkls) |
| 29 | Crise de 2014 | episode | 1 | tested_in e_crise2002 | "Juros e a Crise de 2014" (UQ1CIPyefZQ) |
| 30 | Crise econômica de 2015/16 (recessão brasileira) | episode | 1 | tested_in e_crise2002 | "A PRÓXIMA RECESSÃO NO BRASIL NÃO DEVE SER COMO 2015/16" (JEZTRk2Vk0A) |
| 31 | Crise na Turquia (queda de juros na marra) | episode | 1 | none e_cortes2012 | "Casos reais de queda de juros na marra: O governo Dilma e a crise na Turquia" (nc55w2yFyoE) |
| 32 | Culpa da colonização como explicação do atraso | school | 1 | opposes t_furtado | ""que “a culpa é da colonização”"" (Tb5nwnaYfMU) |
| 33 | Defesa do consumidor / proteção do consumidor vulnerável | school | 1 | justifies f_justica_rawls | "apontou os aspectos desproporcionais sobre a população vulnerável; práticas abusivas como apelo à obtenção de renda extra vedado pelo Código de Defesa de Consumidor" (T4RvTv3mAZc) |
| 34 | Déficit primário versus déficit nominal | school | 1 | grounds s_dominancia | "Entenda a diferença entre déficit primário e déficit nominal" (nc55w2yFyoE) |
| 35 | Desenvolvimentismo | school | 1 | none p_desenvolvimentismo | "o que de fato muda na vida de uma família entre um governo e outro" (M1sZ8IojcN4) |
| 36 | Diógenes de Sínope | thinker | 1 | — | "A reflexão evoca desde o cinismo pragmático de Diógenes de Sínope até as noções clássicas de punição e moralidade" (G9Ki3Dk6uJ0) |
| 37 | Direito como prática social (Lopes, Aristóteles, Wittgenstein, Anscombe) | school | 1 | none f_justica_rawls | "compreendemos o direito como uma prática social, orientada por regras e pela finalidade de organizar a convivência humana" (CXCj4hWpP58) |
| 38 | Dívidas impagáveis e exploração de recursos (causas externas da pobreza africana) | episode | 1 | — | "ocasionou dívidas impagáveis, extraíram os próprios recursos vendendo a preços baixíssimos" (wgn3ETrvYkY) |
| 39 | Doutrinas políticas nos parlamentos africanos | school | 1 | — | "tivemos também as doutrinas políticas infiltrando os parlamentos nacionais" (wgn3ETrvYkY) |
| 40 | Economia da atenção | school | 1 | — | "Entrelaçando a crítica à economia da atenção com a distopia 1984" (S5IkEMYIwKw) |

81 more concepts, one video each: Eduardo Viveiros de Castro; Educação popular / alfabetização de adultos; Escala 6x1 e reforma trabalhista; escassez e valor de mercado como determinantes do salário; Especulação financeira sobre volatilidade; Estratégia empresarial de captura de mercado via conflito; Exploração de diamantes na África; Factfulness (Hans Rosling); Fascismo da ambiguidade; Filosofia africana / autenticidade africana; Florestan Fernandes; Fordismo; Golpe de 1964 e ditadura militar; Hannah Arendt (cidadania e direito a ter direitos); Impeachment de 2016; Imposto sobre consumo embutido nos preços; Interseccionalidade (Kimberlé Crenshaw); Jessé Souza e a crítica do patrimonialismo; Jogo patológico / saúde mental; Joseph Schumpeter; juristocracia; Justiça como equidade (Rawls); Justiça como virtude social e política; Kant (dever universal); Karl Jaspers; Karl Marx (trabalho); Lei Magnitsky; Lucro da indústria militar em conflitos; Mais-valia (mais-valor); Maquiavel e O Príncipe; Mark Fisher; Marshall McLuhan — o meio é a mensagem; Marxismo-leninismo e a vanguarda partidária; Materialismo histórico; Max Weber (ética protestante); Microfísica do poder (Foucault); Milton Santos (cidade); Minimalismo institucional (mínimo procedimental); Nelson Rodrigues; Norbert Bobbio; Novo consenso / metas de inflação; Pan-africanismo; Parresia e elenchos socrático; Paulo Freire; Peak Human (Johan Norberg); Pedagogia do Oprimido (Paulo Freire); Pedaladas fiscais; Pier Paolo Pasolini; Plano Real; Platão; Platão — afastamento da realidade; Polarização afetiva / identidade partidária; Populismo; Presidencialismo de coalizão; Previdência por repartição; Produtividade econômica; Protecionismo não tarifário; Protecionismo tarifário; Racismo ambiental (Ailton Krenak); Rationalist Explanations for War (James Fearon); Realismo capitalista (Mark Fisher); Recompra de cotas como dever moral do gestor para com o cotista; Reforma da Previdência como questão ética; Regra do 72; Regras de licenciamento e alvarás estatais; Regulação e supervisão bancária (segurança e requisitos do banco); Regulação estatal da formação médica por exame obrigatório; Regulação estatal de jogos de azar (prevenção e restrição de apostas); Revolução Francesa e a origem de esquerda e direita; Seção 301; Socialismo; Spinoza (ética geométrica); Superendividamento; Talidomida e o lucro que atropela a ética; Taylorismo; Tecnofascismo; Toyotismo; Tratado de Petrópolis; Uberização; União Soviética (bloco político-militar); Uso político do conflito para consolidar poder.

### Existing nodes: hits

| Node | Type | Videos |
|---|---|---|
| `f_liberalismo_classico` Liberalismo clássico | school | 10 |
| `s_dominancia` Dominância fiscal | school | 9 |
| `i_regras_fiscais` Regras fiscais (LRF, teto, arcabouço) | institution | 5 |
| `p_desenvolvimentismo` Desenvolvimentismo (CEPAL) | school | 4 |
| `s_novoconsenso` Novo consenso / metas de inflação | school | 3 |
| `s_austeridade` Austeridade expansionista | school | 3 |
| `t_lararesende` André Lara Resende | thinker | 3 |
| `i_bc_autonomo` Autonomia do Banco Central (LC 179/2021) | institution | 3 |
| `e_cortes2012` Cortes da Selic em 2011–13 | episode | 2 |
| `s_mmt` MMT (Teoria Monetária Moderna) | school | 1 |
| `s_ftpl` Teoria fiscal do nível de preços | school | 1 |
| `s_monetarismo` Monetarismo | school | 1 |
| `e_crise2002` Crise de confiança de 2002 | episode | 1 |
| `f_libertarianismo` Libertarianismo | school | 1 |
| `f_justica_rawls` Justiça como equidade (Rawls) | school | 1 |
| `p_socialdemocracia` Social-democracia / Estado de bem-estar | school | 1 |
| `s_keynes` Keynesianismo | school | 0 |
| `t_kelton` Stephanie Kelton | thinker | 0 |
| `e_selic2` Selic a 2% na pandemia (2020–21) | episode | 0 |
| `t_hayek` Friedrich Hayek | thinker | 0 |
| `t_furtado` Celso Furtado | thinker | 0 |
| `p_soberania_monetaria` Soberania monetária do Estado | school | 0 |

Never hit (6): `s_keynes`, `t_kelton`, `e_selic2`, `t_hayek`, `t_furtado`, `p_soberania_monetaria`.

### Alias candidates (terms of 5 words or fewer)

Terms the videos use for an existing node that are not yet its name or an alias. Today aliases never reach the model prompt (`kgPromptText()` sends name, summary and claims only).

| Node | Term in video | Videos | Evidence |
|---|---|---|---|
| `i_regras_fiscais` | preconceito fiscal | 1 | "“PRECONCEITO FISCAL” OU GASTANÇA DE ESPECIALISTA?" |
| `f_liberalismo_classico` | Liberdade para Trabalhar | 1 | "questiona a necessidade de uma autorização estatal para trabalhar" |
| `f_liberalismo_classico` | Lei de Liberdade Econômica | 1 | "aplicação da Lei de Liberdade Econômica, isentando alvarás e licenças para atividades consideradas de baixo risco" |
| `f_justica_rawls` | medicina não é negócio | 1 | ""medicina não é negócio", declarou" |
| `s_novoconsenso` | juro em território restritivo | 1 | "após tantos anos de juro em território restritivo" |
| `f_liberalismo_classico` | liberdade de mercado | 1 | "o parlamentar também analisa o papel do Estado na economia, a liberdade de mercado" |
| `s_dominancia` | seriedade fiscal | 1 | "desmontam a fala de Lula sobre “seriedade fiscal” com a relação dívida/PIB" |
| `s_dominancia` | cenário fiscal | 1 | "A grande questão agora é o cenário fiscal. O governo enfrentará um Congresso desafiador, forte pressão sobre os gastos públicos" |
| `i_regras_fiscais` | sustentabilidade das contas do país | 1 | "a necessidade de manter promessas sem comprometer a sustentabilidade das contas do país" |
| `f_libertarianismo` | Uma sociedade libertária | 1 | "31:13 Uma sociedade libertária" |
| `f_liberalismo_classico` | Boicote é belo e moral | 1 | "7:50 Boicote é belo e moral" |
| `p_socialdemocracia` | socialdemocracia | 1 | "O enigma do PT: entre o comunismo e a socialdemocracia" |
| `i_regras_fiscais` | ajuste fiscal | 1 | "Qual é a verdadeira solução? Ajuste fiscal, corte de gastos e o exemplo do governo Temer" |

### Per video

<details><summary>Concepts per video</summary>

- **3_egu4MCpDI** 'Projeto que ganhou eleição não tem a austeridade fiscal com: austeridade fiscal (`s_austeridade`)
- **3VHzi5UBGQs** #257: E se os africanos desaparecessem do mapa-múndi?, com F: Filosofia africana / autenticidade africana; Colonialidade / dependência intelectual; Pan-africanismo; Cheikh Anta Diop; Amílcar Cabral; Antonio Gramsci
- **4feX1BiEP18** Como o estado deve enfrentar o crime organizado: Liberalismo clássico (limites liberais para o uso da força) (`f_liberalismo_classico`)
- **5WYhrmCW-zM** NOVO PROJETO NA CÂMARA: HORA DO ALMOÇO VIRA HORA DE TRABALHO: Populismo; Produtividade econômica
- **6Q526M2X8w8** O imposto que não se vê: Imposto sobre consumo embutido nos preços
- **9EWtSgfnLFI** Fraude bancária derruba o presidente do Paraguai / Direto da: André Lara Resende (`t_lararesende`); Dominância fiscal (`s_dominancia`); Autonomia do Banco Central (`i_bc_autonomo`)
- **AAyCJRH0rKY** “PRECONCEITO FISCAL” OU GASTANÇA DE ESPECIALISTA? - CURADORI: Regras fiscais (LRF, teto, arcabouço) (`i_regras_fiscais`)
- **BQ8hKTCA5Hs** Por que trabalhar precisa de permissão?: Liberdade para trabalhar / liberdade econômica (licenças para atividades de baixo risco) (`f_liberalismo_classico`); Liberalismo clássico (`f_liberalismo_classico`); Regras de licenciamento e alvarás estatais
- **C3TmTsdyvHk** #255: Fascismo da ambiguidade, com Marcia Cavalcante: Fascismo da ambiguidade; Pier Paolo Pasolini; Tecnofascismo
- **CXCj4hWpP58** #254: Direito como Prática, com José Reinaldo de Lima Lopes: Direito como prática social (Lopes, Aristóteles, Wittgenstein, Anscombe); Justiça como virtude social e política; Bens em comum
- **E5sO60IrcL8** URGENTE: TAXA SELIC É MANTIDA (deu ruim!): Dominância fiscal (`s_dominancia`); Novo consenso / metas de inflação (`s_novoconsenso`); Cortes da Selic / crise de 2014
- **G9Ki3Dk6uJ0** Como é dar aula de Filosofia para "bandido"? / Conversa com : Diógenes de Sínope; Cinismo
- **GAkSO5yHqbo** Podcast EcM/IA #1 - Por que a MMT está errada?: MMT (Teoria Monetária Moderna) (`s_mmt`); Novo consenso / metas de inflação
- **Ezicrj2RQyY** Tarifaço de Trump, Protecionismo e BRICS: Atualidades ENEM 2: Protecionismo tarifário; Protecionismo não tarifário; Desenvolvimentismo (reindustrialização) (`p_desenvolvimentismo`); BRICS; Seção 301; Lei Magnitsky; Banco dos BRICS (NDB) x FMI e Banco Mundial; America First
- **GGHV0-kA8uk** “Medicina não é negócio”, diz Ludhmila ao defender OAB da Me: Medicina como serviço público, não negócio (`f_justica_rawls`); Regulação estatal da formação médica por exame obrigatório
- **JEZTRk2Vk0A** A PRÓXIMA RECESSÃO NO BRASIL NÃO DEVE SER COMO 2015/16 - REF: Crise econômica de 2015/16 (recessão brasileira); Juros em território restritivo (`s_novoconsenso`)
- **JNFkv6dfkyw** O retorno dos demônios apocalípticos / BOA NOITE, PROF. VITO: Realismo capitalista (Mark Fisher); Mark Fisher; Eduardo Viveiros de Castro; Parresia e elenchos socrático
- **JVj79nwxEKE** Por que empresas de IA estão DESTRUINDO livros antigos? / BO: Marshall McLuhan — o meio é a mensagem; Platão — afastamento da realidade; Karl Jaspers; Nelson Rodrigues; Colapso por dados sintéticos (Ouroboros algorítmico)
- **KCiVaEiTOIo** O que Flávio precisa aprender com Milei? - Milei Report: Corte de programas sociais por condicionalidade de trabalho
- **M4xUpAnuMJ4** Enriquecimento requer industrialização?: Mudança estrutural e industrialização como motor de produtividade (`p_desenvolvimentismo`)
- **N8qhTLbK-JM** OS CARROS CHINESES VÃO COLAPSAR AS EMPRESAS DE CARRO NO BRAS: Planejamento estatal chinês da indústria (`p_desenvolvimentismo`)
- **M1sZ8IojcN4** Esquerda ou direita: faz diferença na sua vida? Karnal pergu: Liberalismo clássico (`f_liberalismo_classico`); Justiça como equidade (Rawls); Desenvolvimentismo; Microfísica do poder (Foucault); Factfulness (Hans Rosling); Maquiavel e O Príncipe; Polarização afetiva / identidade partidária; Revolução Francesa e a origem de esquerda e direita; Canudos; Plano Real
- **S5IkEMYIwKw** Por que estamos AJUDANDO a máquina que vai nos substituir? /: Materialismo histórico; Karl Marx; Economia da atenção; 1984 de George Orwell (proletas)
- **RyJb0UhxG-4** Flávio e Direita vs STF: Vai ter guerra pelo Impeachment?: Estado mínimo / limitação do poder estatal (`f_liberalismo_classico`); Socialismo; Rationalist Explanations for War (James Fearon); Peak Human (Johan Norberg)
- **SyMtYJfQ25s** #256: Luiz Costa Lima: Paulo Freire; Educação popular / alfabetização de adultos; Golpe de 1964 e ditadura militar
- **Tb5nwnaYfMU** Mentiram para nós sobre o Brasil: Culpa da colonização como explicação do atraso; Corrupção como causa única do atraso; Liberalismo / instituições de mercado como solução para o desenvolvimento (`f_liberalismo_classico`)
- **T4RvTv3mAZc** STF REÚNE INSTITUIÇÕES E GOVERNO PARA DISCUTIR A AÇÃO DAS BE: Defesa do consumidor / proteção do consumidor vulnerável; Superendividamento; Jogo patológico / saúde mental; Regulação estatal de jogos de azar (prevenção e restrição de apostas)
- **V6gc5BiOUa8** Thiago Manzoni comenta sobre reformas, economia e educação /: Liberdade de mercado / papel do Estado na economia (`f_liberalismo_classico`)
- **VEGbrAXUmCA** PT QUER BOLSONARO SOLTO E LULA ROMPE CONTRATO COM A REDETV: seriedade fiscal (relação dívida/PIB) (`s_dominancia`)
- **UQ1CIPyefZQ** Taxa de juros: Lula está correto em criticar Campos Neto?: Novo consenso / metas de inflação (`s_novoconsenso`); Autonomia do Banco Central (`i_bc_autonomo`); Cortes da Selic em 2011–13 (`e_cortes2012`); Crise de 2014; Mito do economista ortodoxo (`s_monetarismo`)
- **_cKByL7QMvI** Os jogadores de futebol ganham muito dinheiro. Isso é certo?: escassez e valor de mercado como determinantes do salário
- **_UpUPfdToAo** Se prepare para o novo governo Lula: Dominância fiscal (`s_dominancia`); Regras fiscais (`i_regras_fiscais`)
- **aUnbMh0P_0A** França volta a discutir os limites do poder do Estado e da l: Liberdade individual versus ordem pública (limites do poder do Estado) (`f_liberalismo_classico`)
- **eUU253ekIBs** Queda do IFIX, Bolsa brasileira e oportunidades pós-eleição : Estado não quebra / dívida pública e expectativa fiscal pós-eleição (`s_dominancia`)
- **f45GW7CGw3Q** Boicotar petista: belo, moral e civilizatório: Libertarianismo (`f_libertarianismo`); Liberalismo clássico (`f_liberalismo_classico`)
- **fOBK34rpSwc** FIIs negociam com desconto: por que André Bacci defende a re: Recompra de cotas como dever moral do gestor para com o cotista
- **hdDLIJDI-xE** URGENTE: Selic FICA em 13,75%, onde investir agora?: Regra do 72
- **fzm-rBlQVaI** A democracia está em risco? Conversa com Marize Schons: Platão; Aristóteles; Adam Przeworski; Joseph Schumpeter; Norbert Bobbio; Minimalismo institucional (mínimo procedimental); Jessé Souza e a crítica do patrimonialismo; Presidencialismo de coalizão; Impeachment de 2016; Pedaladas fiscais; Socialdemocracia (`p_socialdemocracia`); Marxismo-leninismo e a vanguarda partidária; Desenvolvimentismo (`p_desenvolvimentismo`)
- **hxKOLvWJUXE** O futuro da bolsa nos próximos anos de Lula: Dominância fiscal (`s_dominancia`); Regras fiscais (`i_regras_fiscais`); Austeridade expansionista (`s_austeridade`)
- **iRCgbq6Zkls** O NOVO PLANO DO GOVERNO PRA DERRUBAR A SELIC PARA 7,5% (faz : André Lara Resende (`t_lararesende`); Teoria fiscal do nível de preços (`s_ftpl`); Dominância fiscal (`s_dominancia`); Cortes da Selic em 2011–13
- **nc55w2yFyoE** O plano de Lara Resende para derrubar a Selic: André Lara Resende (`t_lararesende`); Dominância fiscal (`s_dominancia`); Déficit primário versus déficit nominal; Episódio do governo Dilma (controle de juros e tarifas) (`e_cortes2012`); Crise na Turquia (queda de juros na marra); Ajuste fiscal e corte de gastos (`s_austeridade`); Regras fiscais (`i_regras_fiscais`); Fuga de capital e risco cambial (`e_crise2002`)
- **oPafKXFsBf0** LA GUERRA ES UN NEGOCIO: Lucro da indústria militar em conflitos; Especulação financeira sobre volatilidade; Uso político do conflito para consolidar poder; Estratégia empresarial de captura de mercado via conflito
- **p-2Zy9ab-IE** O ACRE pode ser vendido? O que aconteceria?: Tratado de Petrópolis
- **qXht6Q_rxek** Um presidente renunciou durante esse vídeo: Regulação e supervisão bancária (segurança e requisitos do banco); Autonomia do Banco Central (`i_bc_autonomo`)
- **roe9QpbmrEE** O que está por trás do recado de Bolsonaro para a direita / : Dominância fiscal / dívida e inflação (`s_dominancia`); Regras fiscais / ajuste fiscal (`i_regras_fiscais`)
- **sCvXN46nw4E** Como funcionam as eleições nos Estados Unidos?: Colégio Eleitoral
- **sGYlQ2sHaZM** A IA lançaria a bomba atômica? Karnal debate ética com a máq: Aristóteles (virtude como justa medida e eudaimonia); Kant (dever universal); Spinoza (ética geométrica); Bombardeios de Hiroshima e Nagasaki (1945); Talidomida e o lucro que atropela a ética
- **sneACzZAXXc** O FRACASSO da URSS 2.0! Como, sem sair do papel, o projeto n: União Soviética (bloco político-militar)
- **vp-APD1Ba4U** Master e Ueno são ‘grupos privados que usam estrutura políti: Captura do Estado por grupos privados (simbiose entre elites e especulação bancária)
- **uCtPfxjSdyM** Mais-Valia, Uberização e Taylorismo, Fordismo e Toyotismo / : Mais-valia (mais-valor); Karl Marx; Taylorismo; Fordismo; Toyotismo; Uberização; Max Weber (ética protestante); Adam Smith (`f_liberalismo_classico`); Escala 6x1 e reforma trabalhista
- **tsk5U_acEDM** Repertório Coringa para a Redação do ENEM 2026: os 12 eixos : Cidadania (T. H. Marshall; José Murilo de Carvalho); Interseccionalidade (Kimberlé Crenshaw); Capital cultural (Pierre Bourdieu); Pedagogia do Oprimido (Paulo Freire); Hannah Arendt (cidadania e direito a ter direitos); Milton Santos (cidade); Karl Marx (trabalho); Racismo ambiental (Ailton Krenak); Florestan Fernandes
- **wIZSV6drxiE** Os desafios da Previdência e como superá-los: Previdência por repartição; Capitalização e responsabilidade individual (`f_liberalismo_classico`); Reforma da Previdência como questão ética
- **wgn3ETrvYkY** Esse é o continente mais pobre do planeta! Mas, como?: Colonização europeia da África; Exploração de diamantes na África; Dívidas impagáveis e exploração de recursos (causas externas da pobreza africana); Doutrinas políticas nos parlamentos africanos; Atuação de multinacionais na economia africana
- **zezco8Tfin0** Flávio Bolsonaro na CPAC: o erro que a direita não pode repe: conservadorismo; juristocracia

</details>
