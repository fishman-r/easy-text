"""Independent subset of the Sublime command/event class protocol."""
import re
commands = {}
listeners = []
view_listeners = []

def command_name(name):
    if name.endswith('Command'): name = name[:-7]
    name = re.sub(r'(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', name).lower()

class Command:
    def is_enabled(self, **args): return True
    def is_visible(self, **args): return True
    def description(self, **args): return None
    def __getattr__(self, name):
        from sublime import UnsupportedAPI
        raise UnsupportedAPI('sublime_plugin.Command.' + name)

class TextCommand(Command):
    def __init__(self, view): self.view = view
    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        commands[command_name(cls.__name__)] = ('text', cls)
    def want_event(self): return False

class WindowCommand(Command):
    def __init__(self, window): self.window = window
    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        commands[command_name(cls.__name__)] = ('window', cls)

class ApplicationCommand(Command):
    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        commands[command_name(cls.__name__)] = ('application', cls)

class EventListener:
    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        listeners.append(cls)

class ViewEventListener:
    def __init__(self, view): self.view = view
    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        view_listeners.append(cls)
    @classmethod
    def is_applicable(cls, settings): return True
    @classmethod
    def applies_to_primary_view_only(cls): return True

def __getattr__(name):
    if name.startswith('__'): raise AttributeError(name)
    from sublime import UnsupportedAPI
    raise UnsupportedAPI('sublime_plugin.' + name)
