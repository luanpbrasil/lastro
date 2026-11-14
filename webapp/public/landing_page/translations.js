'use strict';

// English translations keyed by the original Portuguese copy.
const englishCopy = {
'Lastro — Dê play. Vá além da fala.': 'Lastro — Press play. Go beyond the words.',
'Pular para o conteúdo': 'Skip to content',
'Menu': 'Menu',
'Como funciona': 'How it works',
'Explore o Lastro': 'Explore Lastro',
'Nossa proposta': 'Our approach',
'Experimentar': 'Try it out',
'UM NOVO OLHAR PARA O QUE VOCÊ ASSISTE': 'A FRESH PERSPECTIVE ON WHAT YOU WATCH',
'Dê play no vídeo.': 'Press play.',
'Vá além': 'Go beyond',
'da fala.': 'the words.',
'Toda ideia tem uma história. Descubra os conceitos, conheça os contrapontos e explore as fontes por trás do que você ouve.': 'Every idea has a story. Discover the concepts, consider other perspectives, and explore the sources behind what you hear.',
'Experimentar o Lastro': 'Try Lastro',
'Veja como funciona': 'See how it works',
'Economia e política. Mais contexto. Suas próprias conclusões.': 'Economics and politics. More context. Your own conclusions.',
'UMA IDEIA EM DISCUSSÃO': 'AN IDEA TO EXPLORE',
'O que move': 'What drives',
'uma': 'an',
'economia?': 'economy?',
'CONTEXTO DA IDEIA': 'CONTEXT BEHIND THE IDEA',
'Uma fala. Diferentes perspectivas.': 'One statement. Different perspectives.',
'Entenda os conceitos que entram nessa conversa — e os argumentos que olham por outro ângulo.': 'Explore the concepts behind the conversation — and the arguments that offer another angle.',
'Conceitos': 'Concepts',
'Contrapontos': 'Counterpoints',
'Fontes': 'Sources',
'Ilustração da experiência': 'Illustration of the experience',
'O vídeo é o começo.': 'The video is just the beginning.',
'Contexto para compreender': 'Context to understand',
'Perspectivas para comparar': 'Perspectives to compare',
'Fontes para aprofundar': 'Sources to explore',
'01 / SIMPLES DE EXPLORAR': '01 / EASY TO EXPLORE',
'Você dá o play.': 'You press play.',
'O contexto acompanha.': 'Context comes along.',
'Continue assistindo. Quando uma ideia aparecer, o Lastro ajuda você a olhar mais de perto.': 'Keep watching. When an idea comes up, Lastro helps you take a closer look.',
'Escolha um vídeo': 'Choose a video',
'Abra um vídeo de economia ou política na versão web ou use a extensão no YouTube.': 'Open an economics or politics video in the web app, or use the extension on YouTube.',
'Encontre o contexto': 'Find the context',
'Explore cartões associados às falas, com explicações e conexões entre ideias.': 'Explore cards linked to statements, with explanations and connections between ideas.',
'Forme sua leitura': 'Build your own understanding',
'Compare perspectivas e aprofunde a pesquisa nas referências. A conclusão é sua.': 'Compare perspectives and dig deeper into the references. The conclusion is yours.',
'02 / EXPERIMENTE A PERSPECTIVA': '02 / EXPLORE A NEW PERSPECTIVE',
'Menos “é isso mesmo?”.': 'From “is that so?”',
'Mais “deixa eu entender”.': 'to “let me understand”.',
'Selecione uma ideia e explore as camadas do cartão. Esta é uma demonstração ilustrativa, sem análise ao vivo.': 'Select an idea and explore the layers of its card. This is an illustrative demo, not a live analysis.',
'EXEMPLO INTERATIVO': 'INTERACTIVE EXAMPLE',
'UMA FRASE PARA COMEÇAR A CONVERSA': 'A STATEMENT TO START THE CONVERSATION',
'Juros': 'Interest rates',
'Estado': 'Government',
'Inflação': 'Inflation',
'Explore a ideia': 'Explore the idea',
'Contexto': 'Context',
'Outro olhar': 'Another perspective',
'ENTENDA O CONCEITO': 'UNDERSTAND THE CONCEPT',
'AMPLIE A PERSPECTIVA': 'BROADEN YOUR PERSPECTIVE',
'CONTINUE SUA PESQUISA': 'CONTINUE YOUR RESEARCH',
'Vá à fonte. Faça novas perguntas.': 'Go to the source. Ask new questions.',
'Pontos de partida para aprofundar os temas deste exemplo.': 'Starting points to explore the topics in this example.',
'Conteúdo educativo simplificado. Um exemplo não substitui a análise do contexto completo.': 'Simplified educational content. An example is no substitute for examining the full context.',
'Curiosidade é um ótimo ponto de partida.': 'Curiosity is a great place to start.',
'Explorar vídeos no Lastro': 'Explore videos on Lastro',
'03 / MAIS AUTONOMIA PARA PENSAR': '03 / MORE INDEPENDENCE TO THINK',
'Não é sobre pensar igual.': 'Different minds.',
'É sobre ter mais': 'More room',
'para pensar.': 'to think.',
'Uma fala pode abrir muitas perguntas. O Lastro aproxima você das ideias e das referências que ajudam a explorá-las.': 'One statement can spark many questions. Lastro connects you with the ideas and references that help you explore them.',
'Ideias têm contexto': 'Ideas have context',
'Conecte o que está sendo dito a conceitos e tradições de pensamento.': 'Connect what is being said to concepts and traditions of thought.',
'Contrapontos ampliam a conversa': 'Counterpoints expand the conversation',
'Conheça argumentos diferentes e observe onde as interpretações se encontram ou divergem.': 'Explore different arguments and notice where interpretations converge or diverge.',
'A pesquisa continua nas fontes': 'Research continues with the sources',
'Use referências e dados oficiais, quando disponíveis, para ir além do cartão.': 'Use references and official data, when available, to go beyond the card.',
'TRANSPARÊNCIA FAZ PARTE': 'TRANSPARENCY MATTERS',
'Uma ferramenta de apoio. Não a última palavra.': 'A tool to support you. Not the final word.',
'O Lastro utiliza inteligência artificial, que pode cometer erros. Uma afirmação classificada como factual não é, por isso, uma afirmação verificada. Confira as fontes, considere o contexto e mantenha suas perguntas por perto.': 'Lastro uses artificial intelligence, which can make mistakes. A statement classified as factual is not necessarily verified. Check the sources, consider the context, and keep asking questions.',
'ANTES DO PRÓXIMO PLAY': 'BEFORE YOU PRESS PLAY AGAIN',
'Algumas boas': 'A few good',
'perguntas.': 'questions.',
'O Lastro decide quem está certo?': 'Does Lastro decide who is right?',
'Não. A proposta é apresentar contexto, conceitos e perspectivas para apoiar sua compreensão. A ferramenta não deve ser tomada como um árbitro definitivo de ideias.': 'No. The goal is to present context, concepts, and perspectives to support your understanding. The tool should not be treated as the final authority on ideas.',
'Preciso instalar para experimentar?': 'Do I need to install it to try it?',
'Você pode acessar a versão web pelo botão “Experimentar o Lastro”. Para usar a experiência da extensão no YouTube, acesse a página de instalação no Chrome Web Store.': 'You can access the web app through the “Try Lastro” button. To use the extension on YouTube, visit its installation page in the Chrome Web Store.',
'Os cartões são checagens de fatos?': 'Are the cards fact-checks?',
'Nem todos. Há cartões sobre ideias, previsões e afirmações factuais. Quando houver comparação com dados oficiais, observe a fonte e o período. A classificação “factual” não garante veracidade.': 'Not all of them. Cards cover ideas, forecasts, and factual claims. When a comparison with official data is available, check the source and time period. A “factual” label does not guarantee accuracy.',
'Esta demonstração analisa um vídeo?': 'Does this demo analyze a video?',
'Não. Os exemplos desta página foram preparados para apresentar a navegação dos cartões. Para utilizar o produto, abra a versão web ou instale a extensão.': 'No. The examples on this page were prepared to demonstrate how to explore the cards. To use the product, open the web app or install the extension.',
'SEU PRÓXIMO VÍDEO PODE IR ALÉM.': 'YOUR NEXT VIDEO CAN TAKE YOU FURTHER.',
'Mais contexto.': 'More context.',
'Novas perguntas.': 'New questions.',
'Continue curioso. O Lastro acompanha.': 'Stay curious. Lastro is right there with you.',
'Experimentar na web': 'Try the web app',
'Instalar extensão': 'Install the extension',
'Contexto para aprender. Autonomia para pensar.': 'Context to learn. Independence to think.',
'Conheça o projeto': 'Explore the project',
'Lastro, início': 'Lastro, home',
'Navegação principal': 'Main navigation',
'Ilustração de um vídeo com cartão de contexto': 'Illustration of a video with a context card',
'Escolha uma ideia': 'Choose an idea',
'Camadas do cartão': 'Card layers',
'Idioma da página': 'Page language',
'“Quando os juros sobem, o crédito tende a ficar mais caro.”': '“When interest rates rise, borrowing tends to become more expensive.”',
'JUROS & CRÉDITO': 'INTEREST RATES & CREDIT',
'O preço do dinheiro também muda.': 'The price of money changes, too.',
'A taxa básica de juros influencia as condições de financiamento. Com crédito mais caro, famílias e empresas podem adiar compras e investimentos.': 'The benchmark interest rate influences financing conditions. When borrowing becomes more expensive, households and businesses may postpone purchases and investments.',
'Política monetária': 'Monetary policy',
'O efeito não é igual para todo mundo.': 'The effect is not the same for everyone.',
'Além da taxa básica, o custo de um empréstimo depende de risco, prazo, concorrência e outras condições. Uma mudança na Selic não chega a todos os contratos da mesma forma.': 'Beyond the benchmark rate, borrowing costs depend on risk, maturity, competition, and other conditions. A change in Brazil’s Selic rate does not affect every loan in the same way.',
'Condições de crédito': 'Credit conditions',
'Banco Central · Política monetária': 'Central Bank of Brazil · Monetary policy',
'Banco Central · Estatísticas': 'Central Bank of Brazil · Statistics',
'“O investimento público pode estimular a atividade econômica.”': '“Public investment can stimulate economic activity.”',
'ESTADO & ECONOMIA': 'GOVERNMENT & THE ECONOMY',
'Uma decisão pode movimentar outras.': 'One decision can set others in motion.',
'Uma obra pública pode gerar demanda por trabalho e materiais. Essa renda circula e pode estimular outras atividades. A intensidade do efeito depende das condições da economia.': 'A public infrastructure project can create demand for labor and materials. That income circulates and can stimulate other activities. The size of the effect depends on economic conditions.',
'Demanda agregada': 'Aggregate demand',
'Como e quando investir também importa.': 'How and when to invest matters, too.',
'O resultado depende da qualidade do projeto, do financiamento e da capacidade produtiva disponível. Há debates sobre custos, prioridades e efeitos sobre o investimento privado.': 'The outcome depends on project quality, financing, and available productive capacity. Costs, priorities, and effects on private investment remain subjects of debate.',
'Escolhas de política econômica': 'Economic policy choices',
'Ipea · Estudos e pesquisas': 'Ipea · Studies and research',
'IBGE · Contas nacionais': 'IBGE · National accounts',
'“A inflação caiu, mas minha compra continua cara.”': '“Inflation has fallen, but my groceries are still expensive.”',
'INFLAÇÃO & COTIDIANO': 'INFLATION & EVERYDAY LIFE',
'Subir menos ainda é subir.': 'Rising more slowly is still rising.',
'Uma queda na taxa de inflação pode significar que os preços estão aumentando mais devagar. Isso é diferente de uma queda no nível dos preços.': 'A lower inflation rate can mean that prices are increasing more slowly. That is different from a fall in the price level.',
'Inflação e desinflação': 'Inflation and disinflation',
'Uma média não descreve toda experiência.': 'An average does not tell every story.',
'O índice considera uma cesta de bens e serviços. Como cada família tem hábitos de consumo diferentes, a variação sentida no orçamento pode ser distinta da média.': 'The index tracks a basket of goods and services. Because each household has different spending habits, the change felt in its budget may differ from the average.',
'Cesta de consumo': 'Consumer basket',
'IBGE · Inflação': 'IBGE · Inflation',
'Banco Central · Controle da inflação': 'Central Bank of Brazil · Inflation control'
};

Object.assign(englishCopy, {
  "SUA EXTENSÃO PARA ENTENDER MELHOR O YOUTUBE": "YOUR EXTENSION FOR A DEEPER UNDERSTANDING OF YOUTUBE",
  "O Lastro é uma extensão que mostra cartões de contexto enquanto você assiste a vídeos de economia e política no YouTube. Entenda os conceitos, explore contrapontos e consulte fontes sem sair do vídeo.": "Lastro is a browser extension that shows context cards while you watch economics and politics videos on YouTube. Understand concepts, explore counterpoints, and consult sources without leaving the video.",
  "Disponível na Chrome Web Store. Instale e abra um vídeo no YouTube.": "Available in the Chrome Web Store. Install it and open a video on YouTube.",
  "Adicionar ao Chrome": "Add to Chrome",
  "Instale a extensão": "Install the extension",
  "Clique em “Adicionar ao Chrome” e conclua a instalação na Chrome Web Store.": "Click “Add to Chrome” and complete the installation in the Chrome Web Store.",
  "Abra um vídeo no YouTube": "Open a YouTube video",
  "Escolha um vídeo de economia ou política. O Lastro usa as legendas disponíveis para identificar as ideias.": "Choose an economics or politics video. Lastro uses the available captions to identify ideas.",
  "Explore os cartões": "Explore the cards",
  "Acompanhe as explicações, abra os contrapontos e consulte as referências. Você decide o que aprofundar.": "Follow the explanations, open the counterpoints, and consult the references. You decide what to explore further.",
  "Uma fala no vídeo.": "A statement in the video.",
  "Mais contexto na tela.": "More context on your screen.",
  "Leve os cartões para os vídeos que você assiste.": "Bring context cards to the videos you watch.",
  "Como começo a usar?": "How do I get started?",
  "Clique em “Adicionar ao Chrome”, instale a extensão pela Chrome Web Store e abra um vídeo de economia ou política no YouTube com legendas disponíveis.": "Click “Add to Chrome”, install the extension from the Chrome Web Store, and open an economics or politics video on YouTube with captions available.",
  "Não. Estes exemplos mostram como explorar os cartões. Para usar o Lastro nos seus vídeos, instale a extensão pelo botão “Adicionar ao Chrome”.": "No. These examples show how to explore the cards. To use Lastro with your videos, install the extension using the “Add to Chrome” button.",
  "Instale o Lastro e entenda melhor as ideias do seu próximo vídeo.": "Install Lastro and better understand the ideas in your next video.",
  "Vá": "Go",
  "além": "beyond"
});

let currentLanguage = 'pt-BR';
try {
  if (localStorage.getItem('lastro-language') === 'en-US') currentLanguage = 'en-US';
} catch { /* Language switching remains available when storage is blocked. */ }

function translate(text) {
  return currentLanguage === 'en-US' ? (englishCopy[text] ?? text) : text;
}

// Capture original text nodes once, preserving links, SVGs and event handlers.
const staticTextNodes = [];
const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
while (textWalker.nextNode()) {
  const node = textWalker.currentNode;
  if (node.parentElement.closest('script, style, #demo-panel, #demo-quote, #demo-topic, #language-status')) continue;
  const key = node.textContent.trim();
  if (Object.hasOwn(englishCopy, key)) staticTextNodes.push({ node, original: node.textContent, key });
}
const translatedAttributes = [];
document.querySelectorAll('[aria-label]').forEach(element => {
  const original = element.getAttribute('aria-label');
  if (Object.hasOwn(englishCopy, original)) translatedAttributes.push({ element, original });
});

function setLanguage(language, announce = true) {
  if (!['pt-BR', 'en-US'].includes(language)) return;
  currentLanguage = language;
  document.documentElement.lang = language;
  document.title = translate('Lastro — Dê play. Vá além da fala.');
  document.querySelector('meta[name="description"]').content = language === 'en-US'
    ? 'Go beyond the words. Explore concepts, counterpoints, and sources while watching economics and politics videos with Lastro.'
    : 'Vá além da fala. Explore conceitos, contrapontos e fontes enquanto assiste a vídeos de economia e política com o Lastro.';
  staticTextNodes.forEach(({ node, original, key }) => {
    node.textContent = original.replace(key, translate(key));
  });
  translatedAttributes.forEach(({ element, original }) => element.setAttribute('aria-label', translate(original)));
  document.querySelectorAll('[data-language]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.language === language));
  });
  try { localStorage.setItem('lastro-language', language); } catch { /* Optional persistence. */ }
  renderDemo();
  if (announce) document.querySelector('#language-status').textContent = language === 'en-US' ? 'Page language changed to English.' : 'Idioma da página alterado para português.';
}
document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => setLanguage(button.dataset.language)));
