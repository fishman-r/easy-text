/** Shared application confirmations. Text is always inserted as text, never HTML. */
export function installAppDialogs(native) {
  const dialog = document.createElement('dialog');
  dialog.id = 'app-confirm-dialog';
  dialog.className = 'settings-dialog confirmation-dialog';
  dialog.setAttribute('aria-labelledby', 'app-confirm-title');
  dialog.setAttribute('aria-describedby', 'app-confirm-message');
  dialog.innerHTML = `<div class="dialog-label"><strong id="app-confirm-title"></strong><button type="button" aria-label="取消并关闭">×</button></div><div class="settings-body"><p id="app-confirm-message"></p><pre class="confirmation-detail"></pre><div class="settings-actions"></div></div>`;
  document.body.append(dialog);
  const title = dialog.querySelector('strong');
  const message = dialog.querySelector('p');
  const detail = dialog.querySelector('pre');
  const actions = dialog.querySelector('.settings-actions');
  // Native <dialog> supplies focus trapping and Escape cancellation for all forms.
  const dismissBackdrop = event => {
    const target = event.target;
    if (target === dialog || target?.tagName !== 'DIALOG' || !target.open) return;
    const box = target.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) {
      const cancel = new Event('cancel', {cancelable:true});
      if (target.dispatchEvent(cancel)) target.close();
    }
  };
  document.addEventListener('click', dismissBackdrop);
  const queue = [];
  let active = null, disposed = false;
  function advance() {
    if (disposed || active || !queue.length) return;
    active = queue.shift();
    title.textContent = active.options.title || 'easy text';
    message.textContent = active.options.message || '';
    detail.textContent = active.options.detail || '';
    detail.hidden = !detail.textContent;
    actions.replaceChildren();
    for (const entry of active.options.buttons || [{id:'cancel',label:'取消'},{id:'confirm',label:'确认'}]) {
      if (!['cancel','confirm'].includes(entry.id)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry.label || (entry.id === 'cancel' ? '取消' : '确认');
      button.dataset.choice = entry.id;
      if (entry.id === 'confirm') button.className = 'primary';
      button.addEventListener('click', () => finish(entry.id));
      actions.append(button);
    }
    dialog.showModal();
    // Destructive operations must never receive initial affirmative focus.
    (actions.querySelector('[data-choice="cancel"]') || dialog.querySelector('button')).focus();
  }
  function finish(choice = 'cancel') {
    if (!active) return;
    const completed = active;
    active = null;
    if (dialog.open) dialog.close();
    completed.resolve(choice);
    queueMicrotask(advance);
  }
  dialog.querySelector('.dialog-label button').addEventListener('click', () => finish());
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(); });
  dialog.addEventListener('click', event => {
    const box = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) finish();
  });
  function request(options = {}) {
    if (disposed) return Promise.resolve('cancel');
    return new Promise(resolve => { queue.push({options,resolve}); advance(); });
  }
  const unsubscribe = native?.onEvent?.(event => {
    if (typeof event.requestId !== 'string') return;
    if (event.type === 'app-dialog-dismiss') {
      if (active?.options.requestId === event.requestId) finish('cancel');
      for (let index = queue.length - 1; index >= 0; index--) {
        if (queue[index].options.requestId === event.requestId) queue.splice(index, 1)[0].resolve('cancel');
      }
      return;
    }
    if (event.type !== 'app-dialog') return;
    void request(event).then(choice => native.respondDialog({requestId:event.requestId,choice})).catch(() => {});
  });
  return {
    confirm: options => request(typeof options === 'string' ? {message:options} : options).then(choice => choice === 'confirm'),
    alert: options => request({...(typeof options === 'string' ? {message:options} : options),buttons:[{id:'cancel',label:'关闭'}]}).then(() => undefined),
    dispose() {
      disposed = true;
      unsubscribe?.();
      document.removeEventListener('click', dismissBackdrop);
      finish();
      for (const item of queue.splice(0)) item.resolve('cancel');
      dialog.remove();
    },
  };
}
