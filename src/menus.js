const groups = {
  file: [
    "file.new",
    "file.open",
    "folder.open",
    "file.save",
    "file.saveAll",
    "file.reopenClosed",
    "file.saveAs",
    "file.rename",
    "file.reload",
    "file.encoding",
    "file.lineEnding",
    "project.export",
    "project.import",
    "tabs.closeOthers",
    "tabs.closeRight",
  ],
  edit: [
    "edit.undo",
    "edit.redo",
    "edit.find",
    "project.replace",
    "edit.comment",
    "line.up",
    "line.down",
    "line.copyUp",
    "line.copyDown",
    "line.delete",
    "indent.more",
    "indent.less",
    "indent.auto",
    "indent.configure",
    "indent.tabs",
    "indent.spaces",
    "text.titleCase", "text.swapCase", "text.rot13", "lines.reverse", "lines.join",
    "text.upper",
    "text.lower",
    "text.sort",
    "text.unique",
  ],
  selection: [
    "selection.allOccurrences", "selection.undo", "selection.redo",
    "edit.next",
    "line.select",
    "line.split",
    "text.transpose",
    "snippet.insert",
    "keybindings.edit",
  ],
  view: [
    "commands.show",
    "view.sidebar",
    "view.split",
    "view.wrap",
    "view.theme",
    "view.larger",
    "view.smaller",
    "view.minimap",
    "fold.all",
    "unfold.all",
    "view.diff",
    "git.panel",
    "build.panel",
    "tabs.moveLeft",
    "tabs.moveRight",
  ],
  goto: [
    "file.quick",
    "goto.line",
    "symbols",
    "navigation.definition",
    "navigation.back",
    "navigation.forward",
    "bookmark.toggle",
    "bookmark.next",
    "bookmark.previous",
  ],
  find: ["edit.find", "project.search", "project.replace", "edit.next"],
  tools: [
    "build.panel",
    "git.panel",
    "snippet.insert",
    "plugins.manage",
  ],
  preferences: [
    "settings.open",
    "language.configure",
    "view.theme",
    "view.wrap",
    "view.minimap",
    "indent.configure",
    "keybindings.edit",
    "plugins.manage",
  ],
  help: ["help"],
};

export function installMenus(getCommands, notify) {
  const menu = document.createElement("div");
  menu.className = "app-menu";
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  document.body.append(menu);
  let owner = null;
  const close = () => {
    menu.hidden = true;
    owner?.setAttribute("aria-expanded", "false");
  };
  document.addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-menu]");
    if (trigger) {
      if (owner === trigger && !menu.hidden) {
        close();
        return;
      }
      owner?.setAttribute("aria-expanded", "false");
      owner = trigger;
      owner.setAttribute("aria-expanded", "true");
      menu.replaceChildren();
      for (const id of groups[trigger.dataset.menu] || []) {
        const command = getCommands().find((command) => command[0] === id);
        if (!command) continue;
        const button = document.createElement("button");
        button.setAttribute("role", "menuitem");
        button.dataset.menuCommand = id;
        const label = document.createElement("span");
        label.textContent = command[1];
        const hint = document.createElement("kbd");
        hint.textContent = command[2];
        button.append(label, hint);
        menu.append(button);
      }
      const rect = trigger.getBoundingClientRect();
      menu.style.left =
        Math.max(8, Math.min(rect.left, innerWidth - 340)) + "px";
      menu.style.top = rect.bottom + 7 + "px";
      menu.hidden = false;
      return;
    }
    const item = event.target.closest("[data-menu-command]");
    if (item) {
      close();
      try {
        await getCommands().find(
          (command) => command[0] === item.dataset.menuCommand,
        )?.[3]();
      } catch (error) {
        notify(error.message);
      }
      return;
    }
    if (!menu.contains(event.target)) close();
  });
  document.addEventListener("keydown", (event) => {
    if (menu.hidden) return;
    if (event.key === "Escape") {
      close();
      owner?.focus();
      event.preventDefault();
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const buttons = [...menu.querySelectorAll("button")];
      const index = buttons.indexOf(document.activeElement);
      buttons[
        (index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) %
          buttons.length
      ]?.focus();
      event.preventDefault();
    }
  });
}
