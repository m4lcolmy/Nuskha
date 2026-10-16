// Small shared UI state: which result the arrow keys have selected (for the search box's
// aria-activedescendant) and a handle to focus the search box from anywhere.

class Ui {
  /** id of the highlighted result card, or "" */
  activeId = $state('');
  searchInput: HTMLInputElement | undefined;

  focusSearch() {
    this.searchInput?.focus();
    this.searchInput?.select();
  }
}

export const ui = new Ui();
