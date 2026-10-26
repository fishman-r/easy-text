/** A transient menu shared by tabs, open buffers and the folder tree. */
export function showFileContextMenu(event, items, onError) {
  document.querySelector('.file-context-menu')?.dispatchEvent(new Event('dismiss'));
  const menu = document.createElement('div');
  menu.className = 'file-context-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', '文件操作');
  const previous = document.activeElement;
  const close = () => { menu.remove(); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', keyboard, true); window.removeEventListener('blur', close); };
  const outside = e => { if (!menu.contains(e.target)) close(); };
  const keyboard = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); previous?.focus(); }
    if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault(); e.stopPropagation();
      const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
      buttons[(buttons.indexOf(document.activeElement) + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  };
  for (const item of items) {
    const button = document.createElement('button');
    button.textContent = item.label;
    button.disabled = !!item.disabled;
    button.setAttribute('role', 'menuitem');
    button.addEventListener('click', async () => { close(); try { await item.action(); } catch (error) { onError(error.message); } });
    menu.append(button);
  }
  menu.addEventListener('dismiss', close);
  document.body.append(menu);
  menu.style.left = `${Math.max(4, Math.min(event.clientX, innerWidth - menu.offsetWidth - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(event.clientY, innerHeight - menu.offsetHeight - 4))}px`;
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', keyboard, true);
  window.addEventListener('blur', close);
  menu.querySelector('button:not(:disabled)')?.focus();
}
