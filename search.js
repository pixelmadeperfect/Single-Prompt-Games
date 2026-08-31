(() => {
  'use strict';

  const input = document.getElementById('gameSearch');
  const clearButton = document.getElementById('clearSearch');
  const resetButton = document.getElementById('resetSearch');
  const status = document.getElementById('searchStatus');
  const noResults = document.getElementById('noResults');
  const cards = [...document.querySelectorAll('.game-card')];

  if (!input || !clearButton || !resetButton || !status || !noResults || !cards.length) return;

  const games = cards.map(card => ({
    card,
    title: card.querySelector('h3')?.textContent.trim() || '',
  }));

  const normalize = value => value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .toLocaleLowerCase();

  function filterGames() {
    const query = normalize(input.value.trim());
    let visible = 0;

    games.forEach(game => {
      const matches = !query || normalize(game.title).includes(query);
      game.card.hidden = !matches;
      if (matches) visible += 1;
    });

    clearButton.hidden = !query;
    noResults.hidden = visible !== 0;
    status.textContent = query
      ? `${visible} ${visible === 1 ? 'game' : 'games'} found`
      : `Showing all ${games.length} games`;
  }

  function resetSearch() {
    input.value = '';
    filterGames();
    input.focus({ preventScroll: true });
  }

  input.addEventListener('input', filterGames);
  input.addEventListener('search', filterGames);
  clearButton.addEventListener('click', resetSearch);
  resetButton.addEventListener('click', resetSearch);
})();
