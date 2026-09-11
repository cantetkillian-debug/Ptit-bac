const toast = document.querySelector('.toast');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1600);
}

document.querySelector('.player-id')?.addEventListener('click', async (event) => {
  const value = event.currentTarget.dataset.copy;
  try {
    await navigator.clipboard.writeText(value);
    showToast('Identifiant copié');
  } catch {
    showToast(value);
  }
});

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.action;

    // Branche ici les routes de ton application.
    const routes = {
      'edit-profile': '#modifier-profil',
      'friends': '#amis',
      'settings': '#parametres',
      'logout': '#deconnexion'
    };

    if (routes[action]) {
      window.location.hash = routes[action];
    }
  });
});
