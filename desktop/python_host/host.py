"""Line-delimited JSON subprocess host. Plugin code is trusted local code, not sandboxed."""
import fnmatch
import importlib.util
import json
import inspect
import os
import re
import sys
import traceback
import types
import uuid
import zipfile
import zipimport
from pathlib import Path
import sublime
import sublime_plugin

PROTOCOL = sys.stdout
sys.stdout = sys.stderr
if sys.version_info < (3, 9):
    print("ET Python plugin host requires Python 3.9 or newer", file=sys.stderr); sys.exit(3)

class Runtime:
    def __init__(self, state_dir):
        self.state_dir = state_dir
        self.packages_dir = os.path.join(state_dir, 'packages')
        os.makedirs(self.packages_dir, exist_ok=True)
        self.views = {}; self.active_id = None; self.window = sublime.Window()
        self.effects = []; self.callbacks = []; self.errors = []; self.clipboard = None
        self.edit_secret = object(); self.instances = {}; self.listener_instances = []
        self.view_listener_instances = {}; self.settings = {}; self.modules = []; self.resources = {}
        self.numbers = {}; self.change_counts = {}; self.depth = 0
        sublime._runtime = self
    def view_number(self, key):
        if key not in self.numbers: self.numbers[key] = len(self.numbers) + 1
        return self.numbers[key]
    def snapshot(self, value):
        self.effects = []; self.callbacks = []; self.errors = []; self.clipboard = value.get('clipboard')
        self.window = sublime.Window(value.get('window'))
        self.views = {v['id']: sublime.View(v) for v in value.get('views', [])}
        self.active_id = value.get('activeViewId')
        if self.active_id is not None and self.active_id not in self.views: raise ValueError('Active view is absent from snapshot')
    def load_settings(self, name):
        if not isinstance(name, str) or os.path.basename(name) != name: raise ValueError('Settings name must be a basename')
        if name not in self.settings:
            values = {}
            for resource in sorted(self.find_resources(name)):
                try: values.update(json.loads(self.load_resource(resource)))
                except (ValueError, TypeError): raise ValueError('Only strict JSON settings are supported: ' + resource)
            target = os.path.join(self.state_dir, 'settings', name)
            if os.path.exists(target):
                with open(target, encoding='utf8') as f: values.update(json.load(f))
            self.settings[name] = sublime.Settings(values)
        return self.settings[name]
    def save_settings(self, name):
        settings = self.load_settings(name)
        directory = os.path.join(self.state_dir, 'settings'); os.makedirs(directory, exist_ok=True)
        temp = os.path.join(directory, '.' + uuid.uuid4().hex)
        with open(temp, 'w', encoding='utf8') as f:
            json.dump(settings.values, f, ensure_ascii=True); f.flush(); os.fsync(f.fileno())
        os.replace(temp, os.path.join(directory, name))
    def find_resources(self, pattern): return [name for name in self.resources if fnmatch.fnmatch(os.path.basename(name), pattern)]
    def load_resource(self, name, binary=False):
        if name not in self.resources: raise FileNotFoundError(name)
        source, member = self.resources[name]
        if member is None:
            with open(source, 'rb') as f: data = f.read()
        else:
            with zipfile.ZipFile(source) as z: data = z.read(member)
        return data if binary else data.decode('utf8')
    def _package(self, name, source, is_archive=False, only=None):
        identifier = re.sub(r'\W', '_', name)
        if not identifier or identifier[0].isdigit(): identifier = 'ET_' + identifier
        if identifier in sys.modules: identifier += '_' + uuid.uuid4().hex[:8]
        package = types.ModuleType(identifier); package.__path__ = [source]; package.__package__ = identifier
        package.__et_package__ = name; sys.modules[identifier] = package
        if is_archive:
            with zipfile.ZipFile(source) as z:
                members = [n for n in z.namelist() if not n.endswith('/') and not n.startswith('/') and '..' not in n.split('/')]
                for n in members: self.resources['Packages/' + name + '/' + n] = (source, n)
                scripts = sorted(n for n in members if n.endswith('.py') and '/' not in n and n != '__init__.py')
            loader = zipimport.zipimporter(source)
        else:
            for directory, dirs, files in os.walk(source, followlinks=False):
                dirs[:] = [d for d in dirs if not d.startswith('.') and not os.path.islink(os.path.join(directory, d))]
                for filename in files:
                    full = os.path.join(directory, filename)
                    if os.path.islink(full): continue
                    relative = os.path.relpath(full, source).replace(os.sep, '/')
                    self.resources['Packages/' + name + '/' + relative] = (full, None)
            scripts = sorted(n for n in os.listdir(source) if n.endswith('.py') and n != '__init__.py' and os.path.isfile(os.path.join(source, n)) and not os.path.islink(os.path.join(source, n)))
        for script in scripts:
            if only is not None and script != only: continue
            module_name = identifier + '.' + script[:-3]
            if module_name in sys.modules:
                existing = sys.modules[module_name]; existing.__et_package__ = name
                if existing not in self.modules: self.modules.append(existing)
                continue
            before = set(sublime_plugin.commands)
            try:
                if is_archive:
                    module = types.ModuleType(module_name); module.__file__ = source + '/' + script
                    module.__package__ = identifier; module.__et_package__ = name
                    sys.modules[module_name] = module
                    exec(loader.get_code(script[:-3]), module.__dict__)
                else:
                    spec = importlib.util.spec_from_file_location(module_name, os.path.join(source, script))
                    module = importlib.util.module_from_spec(spec); module.__et_package__ = name
                    sys.modules[module_name] = module; spec.loader.exec_module(module)
                self.modules.append(module)
            except Exception:
                self.errors.append({'package': name, 'module': script, 'message': traceback.format_exc()})
                for key in list(sublime_plugin.commands):
                    if key not in before and sublime_plugin.commands[key][1].__module__ == module_name: del sublime_plugin.commands[key]
                sublime_plugin.listeners[:] = [c for c in sublime_plugin.listeners if c.__module__ != module_name]
                sublime_plugin.view_listeners[:] = [c for c in sublime_plugin.view_listeners if c.__module__ != module_name]
    def load(self, sources):
        for source in sources:
            target = source['path']; name = source.get('name') or Path(target).stem
            try:
                if source['kind'] == 'archive': self._package(name, target, True)
                elif source['kind'] == 'python': self._package(name, os.path.dirname(target), only=os.path.basename(target))
                else:
                    entries = sorted(os.listdir(target))
                    if any(n.endswith('.py') for n in entries): self._package(name, target)
                    for entry in entries:
                        full = os.path.join(target, entry)
                        if entry.startswith('.') or os.path.islink(full): continue
                        if os.path.isdir(full): self._package(entry, full)
                        elif entry.endswith('.sublime-package'): self._package(entry[:-16], full, True)
            except Exception: self.errors.append({'package': name, 'message': traceback.format_exc()})
        for cls in sublime_plugin.listeners:
            try: self.listener_instances.append(cls())
            except Exception: self.errors.append({'package': cls.__module__, 'message': traceback.format_exc()})
        for module in self.modules:
            callback = getattr(module, 'plugin_loaded', None)
            if callback:
                try: callback()
                except Exception: self.errors.append({'package': module.__name__, 'message': traceback.format_exc()})
        self.drain()
        return self.describe()
    def describe(self):
        return {'commands': [{'name': name, 'kind': kind, 'package': getattr(sys.modules.get(cls.__module__), '__et_package__', cls.__module__)} for name, (kind, cls) in sorted(sublime_plugin.commands.items())], 'errors': self.errors, 'effects': self.effects, 'compatibility': {'baseline': 'Sublime Text 3 API subset (independent ET implementation)', 'offsets': 'UTF-16 at bridge, Unicode code points inside Python', 'unsupported': 'Unsupported APIs raise UnsupportedAPI; no native extension ABI, arbitrary panels, syntax engine, or threaded callbacks.'}}
    def run_command(self, name, args, view=None, window=None, application=False):
        if self.depth >= 32: raise RuntimeError('Nested command limit exceeded')
        self.depth += 1
        try:
            if name not in sublime_plugin.commands:
                return self.builtin(name, args, view or self.window.active_view())
            kind, cls = sublime_plugin.commands[name]
            view = view or self.window.active_view()
            if kind == 'text' and not view: raise RuntimeError('TextCommand requires an active view')
            key = (cls, view.key if kind == 'text' else kind)
            if key not in self.instances: self.instances[key] = cls(view) if kind == 'text' else cls(self.window) if kind == 'window' else cls()
            instance = self.instances[key]
            if kind == 'text': instance.view = view
            if kind == 'window': instance.window = self.window
            args = dict(args)
            if kind == 'text' and not instance.want_event(): args.pop('event', None)
            enabled_args = args
            try: inspect.signature(instance.is_enabled).bind(**enabled_args)
            except TypeError: enabled_args = {}
            if not instance.is_enabled(**enabled_args): raise RuntimeError('Command is disabled in this context: ' + name)
            if kind == 'text':
                edit = sublime.Edit(view, self.edit_secret)
                try: return instance.run(edit, **args)
                finally: edit.active = False
            return instance.run(**args)
        finally: self.depth -= 1
    def builtin(self, name, args, view):
        if not view: raise sublime.UnsupportedAPI('native command ' + name)
        edit = sublime.Edit(view, self.edit_secret)
        try:
            if name == 'insert':
                for region in view.sel(): view.replace(edit, region, args.get('characters', ''))
            elif name == 'append': view.insert(edit, view.size(), args.get('characters', ''))
            elif name == 'select_all': view.sel().clear(); view.sel().add(sublime.Region(0, view.size()))
            elif name in ('left_delete', 'right_delete'):
                for region in view.sel():
                    target = region if not region.empty() else sublime.Region(max(0, region.a - 1), region.a) if name == 'left_delete' else sublime.Region(region.a, min(view.size(), region.a + 1))
                    view.erase(edit, target)
            else: raise sublime.UnsupportedAPI('native command ' + name)
        finally: edit.active = False
    def event(self, name):
        allowed = {'on_new', 'on_load', 'on_activated', 'on_deactivated', 'on_modified', 'on_selection_modified', 'on_pre_save', 'on_post_save', 'on_close', 'on_init'}
        if name not in allowed: raise sublime.UnsupportedAPI('event ' + name)
        view = self.window.active_view()
        for listener in self.listener_instances:
            callback = getattr(listener, name, None)
            if callback:
                try: callback(list(self.views.values()) if name == 'on_init' else view)
                except Exception: self.errors.append({'event': name, 'message': traceback.format_exc()})
        if view:
            for cls in sublime_plugin.view_listeners:
                try:
                    if not cls.is_applicable(view.settings()): continue
                    key = (cls, view.key)
                    if key not in self.view_listener_instances: self.view_listener_instances[key] = cls(view)
                    listener = self.view_listener_instances[key]; listener.view = view
                    callback = getattr(listener, name, None)
                    if callback: callback()
                except Exception: self.errors.append({'event': name, 'message': traceback.format_exc()})
        if self.errors: raise RuntimeError('Plugin event transaction aborted; no document/effects result was committed.\n' + '\n'.join(e['message'] for e in self.errors))
        self.drain()
    def drain(self):
        count = 0
        while self.callbacks:
            count += 1
            if count > 100: raise RuntimeError('Scheduled callback limit exceeded')
            self.callbacks.pop(0)()
    def result(self):
        documents = []
        for view in self.views.values():
            before, after = view.original, view.text
            start = 0
            while start < min(len(before), len(after)) and before[start] == after[start]: start += 1
            end_before, end_after = len(before), len(after)
            while end_before > start and end_after > start and before[end_before-1] == after[end_after-1]: end_before -= 1; end_after -= 1
            changes = [] if before == after else [{'from': sublime._u16(before, start), 'to': sublime._u16(before, end_before), 'insert': after[start:end_after]}]
            documents.append({'id': view.key, 'expectedVersion': view.version, 'text': after, 'changes': changes, 'selections': [{'anchor': sublime._u16(after, r.a), 'head': sublime._u16(after, r.b)} for r in view.sel()]})
        return {'documents': documents, 'effects': self.effects, 'errors': self.errors}
    def unload(self):
        for module in reversed(self.modules):
            callback = getattr(module, 'plugin_unloaded', None)
            if callback:
                try: callback()
                except Exception: traceback.print_exc()

runtime = Runtime(sys.argv[1])
for line in sys.stdin:
    request = {}
    try:
        request = json.loads(line); op = request['op']
        if op == 'load': result = runtime.load(request.get('sources', []))
        elif op == 'list': result = runtime.describe()
        elif op in ('run', 'event'):
            runtime.snapshot(request.get('snapshot') or {})
            if op == 'run': runtime.run_command(request['name'], request.get('args') or {}); runtime.drain()
            else: runtime.event(request['name'])
            result = runtime.result()
        elif op == 'shutdown': runtime.unload(); result = {'stopped': True}
        else: raise ValueError('Unknown host operation')
        response = {'id': request.get('id'), 'result': result}
    except Exception: response = {'id': request.get('id'), 'error': traceback.format_exc()}
    PROTOCOL.write(json.dumps(response, ensure_ascii=True) + '\n'); PROTOCOL.flush()
    if request.get('op') == 'shutdown': break
