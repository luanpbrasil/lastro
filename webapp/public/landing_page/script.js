'use strict';

// Editorial examples for this landing page, not live API results.
const demoIdeas = [
  {
    quote: '“Quando os juros sobem, o crédito tende a ficar mais caro.”',
    topic: 'JUROS & CRÉDITO',
    context: { title: 'O preço do dinheiro também muda.', body: 'A taxa básica de juros influencia as condições de financiamento. Com crédito mais caro, famílias e empresas podem adiar compras e investimentos.', concept: 'Política monetária' },
    perspective: { title: 'O efeito não é igual para todo mundo.', body: 'Além da taxa básica, o custo de um empréstimo depende de risco, prazo, concorrência e outras condições. Uma mudança na Selic não chega a todos os contratos da mesma forma.', concept: 'Condições de crédito' },
    sources: [{ label: 'Banco Central · Política monetária', url: 'https://www.bcb.gov.br/controleinflacao' }, { label: 'Banco Central · Estatísticas', url: 'https://www.bcb.gov.br/estatisticas' }]
  },
  {
    quote: '“O investimento público pode estimular a atividade econômica.”',
    topic: 'ESTADO & ECONOMIA',
    context: { title: 'Uma decisão pode movimentar outras.', body: 'Uma obra pública pode gerar demanda por trabalho e materiais. Essa renda circula e pode estimular outras atividades. A intensidade do efeito depende das condições da economia.', concept: 'Demanda agregada' },
    perspective: { title: 'Como e quando investir também importa.', body: 'O resultado depende da qualidade do projeto, do financiamento e da capacidade produtiva disponível. Há debates sobre custos, prioridades e efeitos sobre o investimento privado.', concept: 'Escolhas de política econômica' },
    sources: [{ label: 'Ipea · Estudos e pesquisas', url: 'https://www.ipea.gov.br/' }, { label: 'IBGE · Contas nacionais', url: 'https://www.ibge.gov.br/estatisticas/economicas/contas-nacionais.html' }]
  },
  {
    quote: '“A inflação caiu, mas minha compra continua cara.”',
    topic: 'INFLAÇÃO & COTIDIANO',
    context: { title: 'Subir menos ainda é subir.', body: 'Uma queda na taxa de inflação pode significar que os preços estão aumentando mais devagar. Isso é diferente de uma queda no nível dos preços.', concept: 'Inflação e desinflação' },
    perspective: { title: 'Uma média não descreve toda experiência.', body: 'O índice considera uma cesta de bens e serviços. Como cada família tem hábitos de consumo diferentes, a variação sentida no orçamento pode ser distinta da média.', concept: 'Cesta de consumo' },
    sources: [{ label: 'IBGE · Inflação', url: 'https://www.ibge.gov.br/explica/inflacao.php' }, { label: 'Banco Central · Controle da inflação', url: 'https://www.bcb.gov.br/controleinflacao' }]
  }
];

let activeIdea = 0;
let activeTab = 'context';
const panel = document.querySelector('#demo-panel');
const tabs = [...document.querySelectorAll('[data-tab]')];
const ideaButtons = [...document.querySelectorAll('[data-idea]')];

function createTextElement(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = translate(text);
  if (className) element.className = className;
  return element;
}

function renderDemo() {
  const idea = demoIdeas[activeIdea];
  document.querySelector('#demo-quote').textContent = translate(idea.quote);
  document.querySelector('#demo-topic').textContent = translate(idea.topic);
  document.querySelector('#idea-count').textContent = `0${activeIdea + 1} / 03`;
  ideaButtons.forEach((button, index) => {
    button.classList.toggle('active', index === activeIdea);
    button.setAttribute('aria-pressed', String(index === activeIdea));
  });
  tabs.forEach(button => {
    const selected = button.dataset.tab === activeTab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  panel.setAttribute('aria-labelledby', `tab-${activeTab}`);
  panel.replaceChildren();
  if (activeTab === 'sources') {
    panel.append(createTextElement('p', 'CONTINUE SUA PESQUISA', 'eyebrow'));
    panel.append(createTextElement('h3', 'Vá à fonte. Faça novas perguntas.'));
    panel.append(createTextElement('p', 'Pontos de partida para aprofundar os temas deste exemplo.'));
    idea.sources.forEach(source => {
      const link = createTextElement('a', source.label, 'source-link');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      panel.append(link);
    });
  } else {
    const content = idea[activeTab];
    panel.append(createTextElement('p', activeTab === 'context' ? 'ENTENDA O CONCEITO' : 'AMPLIE A PERSPECTIVA', 'eyebrow'));
    panel.append(createTextElement('h3', content.title));
    panel.append(createTextElement('p', content.body));
    panel.append(createTextElement('span', content.concept, 'concept-label'));
  }
}

ideaButtons.forEach(button => button.addEventListener('click', () => {
  activeIdea = Number(button.dataset.idea);
  renderDemo();
}));
tabs.forEach((button, index) => {
  button.addEventListener('click', () => {
    activeTab = button.dataset.tab;
    renderDemo();
  });
  button.addEventListener('keydown', event => {
    let nextIndex;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    activeTab = tabs[nextIndex].dataset.tab;
    renderDemo();
    tabs[nextIndex].focus();
  });
});

const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
function closeMenu() {
  menuToggle.setAttribute('aria-expanded', 'false');
  navigation.classList.remove('open');
}
menuToggle.addEventListener('click', () => {
  const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!isOpen));
  navigation.classList.toggle('open', !isOpen);
});
navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
    closeMenu();
    menuToggle.focus();
  }
});
setLanguage(currentLanguage, false);
