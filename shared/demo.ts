/** The judge demo (/demo): videos with precomputed cards, and the one transcript the "Rodar ao vivo" button may analyse. */
export interface DemoVideo {
  id: string;
  title: string;
  channel: string;
  /** What to look for (shown under the player). */
  hint: string;
}

export const DEMO_VIDEOS: DemoVideo[] = [
  { id: "1FzdBFDbMUs", title: "O que realmente gera inflação?", channel: "José Kobori", hint: "Monetarismo x novo consenso, crédito e inflação." },
  { id: "wOpqx7XvD54", title: "Giane Guerra analisa proposta de André Lara Resende para reduzir juros", channel: "Rádio Gaúcha", hint: "Dominância fiscal, a proposta de Lara Resende, a crise de 2002." },
  { id: "nc55w2yFyoE", title: "O plano de Lara Resende para derrubar a Selic", channel: "Economista Sincero", hint: "MMT, teoria fiscal do nível de preços." },
  { id: "p7YTkl30MQ4", title: "Economista explica JUROS em 3 níveis de dificuldade", channel: "Economia Mainstream", hint: "Metas de inflação e o Banco Central." },
  { id: "M4xUpAnuMJ4", title: "Enriquecimento requer industrialização?", channel: "Economia Mainstream", hint: "Desenvolvimentismo x liberalismo." },
  { id: "4wZdCOvolDU", title: "Brasil segue com o maior juros real do mundo após Copom manter Selic", channel: "MBL", hint: "Cartão de fato: a Selic oficial ao lado do número citado." },
];

export const DEMO_IDS = new Set(DEMO_VIDEOS.map((v) => v.id));

/** Transcripts the live button may send. Only these ids; never text from the client. */
export const LIVE_TRANSCRIPTS = {
  TESTfacts01: "Transcrição de teste (sintética, 48 s): juros, inflação e dívida",
} as const;
export type LiveId = keyof typeof LIVE_TRANSCRIPTS;
