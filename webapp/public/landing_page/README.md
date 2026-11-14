# Lastro — Landing page

Landing page estática e responsiva, em português e inglês. Código e identificadores em inglês. HTML, CSS e JavaScript sem dependências, sem instalação de Node e sem etapa de build.

## Abrir no Windows

1. Extraia o ZIP inteiro.
2. Abra `index.html` no Chrome ou Edge.
3. Mantenha `styles.css`, `script.js` e `favicon.svg` na mesma pasta do HTML.

Opcionalmente, use a extensão Live Server do VS Code para recarregar ao editar.

## Arquivos

- `index.html`: estrutura, texto, metadados e links.
- `styles.css`: identidade visual, layouts desktop/mobile e estados de foco.
- `script.js`: exemplos editoriais, abas acessíveis e menu mobile.
- `favicon.svg`: símbolo provisório desenhado para esta proposta (não um arquivo oficial da marca).

## O que está funcionando

- Navegação por seções e menu mobile.
- Três ideias demonstrativas, cada uma com contexto, outro olhar e links de fontes.
- Navegação das abas por teclado: setas, Home e End.
- FAQ expansível.
- Links para o aplicativo publicado, extensão e repositório.
- Preferência de movimento reduzido respeitada.

## Escopo da demonstração

Os exemplos são editoriais e estão identificados como ilustrativos. A representação de player no topo é uma ilustração feita em CSS, não um vídeo reproduzível. A landing page não chama a API, não envia transcrições, não faz análises com IA, não usa cookies e não coleta eventos. Links externos exigem internet; o conteúdo e a demonstração da página funcionam localmente.

## Personalização

- Altere cores nas variáveis `:root` em `styles.css`.
- Edite os textos principais no HTML.
- Edite o array `demoIdeas` em `script.js` para mudar os exemplos.
- Os links do produto são `https://lastro.lovu.club/` e a página da extensão já informada no projeto. Confira sua disponibilidade antes de publicar.
- Os links de fontes são pontos de partida educativos, não verificações individuais das frases.

## Integração ao repositório Lastro

Esta entrega é independente. Não substitua automaticamente a pasta `site/` do projeto: a versão publicada usa rotas e build que não foram fornecidos integralmente. Primeiro abra e revise esta página em uma pasta separada. Depois adapte seu HTML/CSS/JS ao framework e ao build atuais, mantendo as rotas `/api/*` e as telas do produto.

## Publicação opcional

Sirva todos os arquivos HTML, CSS, JS e SVG na mesma pasta em uma hospedagem de sua escolha. Não há segredos nem backend nesta entrega. Nenhuma alteração foi feita no site publicado.

## Idiomas

O seletor PT/EN no cabeçalho usa bandeiras SVG locais do Brasil e dos Estados Unidos. Traduz textos, cartões, FAQ, metadados e rótulos acessíveis sem recarregar. A escolha é salva apenas no navegador em `localStorage` (`lastro-language`). Se o navegador bloquear o armazenamento, a troca continua funcionando, mas a preferência pode não persistir. As fontes externas mantêm seus endereços originais e podem estar em português.

- `translations.js`: dicionário de traduções e controle do idioma. Deve carregar antes de `script.js`.
- `flag-br.svg` e `flag-us.svg`: bandeiras locais, sem dependência de emoji ou internet.

## Revisão de conversão

Todos os CTAs de instalação levam à extensão publicada na Chrome Web Store, com a URL solicitada (authuser=0&hl=en). A instalação é concluída pelo visitante na loja. O texto inicial explica diretamente a função da extensão, seguido de três passos para começar. O CTA final é único. Em inglês, “beyond the words” usa a mesma fonte serifada em itálico. A seleção PT/EN continua disponível; o idioma do destino da loja permanece inglês conforme a URL fornecida.
