// The landing page: screenshots that scale like images, a step-by-step screenshot that follows the scroll,
// and sections that fade in. Everything here is progressive: without it the page still reads top to bottom.
document.documentElement.classList.add("js");

// Each screenshot is drawn at a fixed size (like a real window) and scaled to its box, so it stays crisp and true.
for (const box of document.querySelectorAll<HTMLElement>(".canvas-box")) {
  const width = Number(getComputedStyle(box).getPropertyValue("--w")) || 1280;
  const fit = () => box.style.setProperty("--k", String(box.clientWidth / width));
  new ResizeObserver(fit).observe(box);
  fit();
}

// "How it works": the step crossing the middle of the screen sets what the screenshot shows.
const mock = document.querySelector<HTMLElement>(".mock");
const steps = [...document.querySelectorAll<HTMLElement>(".step")];
function show(step: HTMLElement): void {
  if (mock && mock.dataset.step !== step.dataset.step) mock.dataset.step = step.dataset.step;
  for (const s of steps) s.classList.toggle("active", s === step);
}
if (mock && steps.length) {
  const middle = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) show(e.target as HTMLElement);
    },
    { rootMargin: "-50% 0px -50% 0px" },
  );
  for (const s of steps) middle.observe(s);
  show(steps[0]);
}

// Sections fade in once, the first time they come into view.
const reveal = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      reveal.unobserve(e.target);
    }
  },
  { rootMargin: "0px 0px -12% 0px" },
);
for (const el of document.querySelectorAll(".reveal")) reveal.observe(el);
