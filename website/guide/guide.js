(() => {
  "use strict";

  const input = document.querySelector("[data-guide-search]");
  const cards = [...document.querySelectorAll("[data-guide-card]")];
  const chapters = [...document.querySelectorAll("[data-guide-chapter]")];
  const status = document.querySelector("[data-guide-status]");
  const empty = document.querySelector("[data-guide-empty]");

  input?.addEventListener("input", () => {
    const terms = input.value.toLocaleLowerCase().match(/[a-z0-9]+/g) || [];
    let count = 0;

    cards.forEach((card) => {
      const visible = terms.every((term) => card.dataset.search.includes(term));
      card.hidden = !visible;
      if (visible) count += 1;
    });

    chapters.forEach((chapter) => {
      chapter.hidden = !chapter.querySelector("[data-guide-card]:not([hidden])");
    });

    status.textContent = terms.length
      ? `${count} matching ${count === 1 ? "plate" : "plates"}`
      : "Showing all 55 plates";
    empty.hidden = count !== 0;
  });
})();
