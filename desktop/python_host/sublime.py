"""ET's independently implemented, explicitly bounded Sublime Python API."""
import json
import os
import re
import sys
import uuid

class UnsupportedAPI(NotImplementedError):
    def __init__(self, name): super().__init__('Unsupported Sublime API: ' + name)

LITERAL = 1
IGNORECASE = 2
MONOSPACE_FONT = 1
KEEP_OPEN_ON_FOCUS_LOST = 2
ENCODED_POSITION = 1
TRANSIENT = 4
HIDDEN = 16

_runtime = None

def _ctx():
    if _runtime is None: raise RuntimeError('Plugin API is not attached to a host request')
    return _runtime

def _u16(text, point): return len(text[:point].encode('utf-16-le', 'surrogatepass')) // 2

def _cp(text, offset):
    if not isinstance(offset, int) or offset < 0: raise ValueError('Invalid UTF-16 offset')
    units = 0
    for i, char in enumerate(text):
        if units == offset: return i
        units += 2 if ord(char) > 0xffff else 1
        if units > offset: raise ValueError('Selection bisects a Unicode surrogate pair')
    if units == offset: return len(text)
    raise ValueError('Selection is outside document')

class Region:
    def __init__(self, a, b=None, xpos=-1): self.a, self.b, self.xpos = int(a), int(a if b is None else b), xpos
    def begin(self): return min(self.a, self.b)
    def end(self): return max(self.a, self.b)
    def size(self): return abs(self.a - self.b)
    def empty(self): return self.a == self.b
    def contains(self, other):
        if isinstance(other, Region): return self.begin() <= other.begin() and self.end() >= other.end()
        return self.begin() <= other <= self.end()
    def intersects(self, other): return (self.begin(), self.end()) == (other.begin(), other.end()) or max(self.begin(), other.begin()) < min(self.end(), other.end()) or (self.empty() and other.begin() < self.a < other.end()) or (other.empty() and self.begin() < other.a < self.end())
    def intersection(self, other):
        a, b = max(self.begin(), other.begin()), min(self.end(), other.end())
        return Region(a, b) if a < b else Region(0)
    def cover(self, other):
        ends = (min(self.begin(), other.begin()), max(self.end(), other.end()))
        return Region(*(ends if self.a < self.b else ends[::-1]))
    def __lt__(self, other): return (self.begin(), self.end()) < (other.begin(), other.end())
    def __eq__(self, other): return isinstance(other, Region) and self.a == other.a and self.b == other.b
    def __repr__(self): return 'Region(%d, %d)' % (self.a, self.b)
    def __len__(self): return self.size()

class Selection:
    def __init__(self, regions=None): self.regions = list(regions or [])
    def __iter__(self): return iter(list(self.regions))
    def __len__(self): return len(self.regions)
    def __getitem__(self, key): return self.regions[key]
    def clear(self): self.regions.clear()
    def add(self, region):
        region = Region(region) if isinstance(region, int) else Region(region.a, region.b, region.xpos)
        self.regions.append(region)
        self.regions.sort(key=lambda r: (r.begin(), r.end()))
        merged = []
        for r in self.regions:
            if merged and (merged[-1].intersects(r) or merged[-1] == r):
                last = merged[-1]; end = max(last.end(), r.end()); begin = min(last.begin(), r.begin())
                last.a, last.b = (begin, end) if last.a <= last.b else (end, begin)
            else: merged.append(r)
        self.regions = merged
    def add_all(self, regions):
        for region in regions: self.add(region)
    def contains(self, region): return any(r.contains(region) for r in self.regions)
    def subtract(self, region):
        output = []
        for r in self.regions:
            if not r.intersects(region): output.append(r); continue
            if r.begin() < region.begin(): output.append(Region(r.begin(), region.begin()))
            if r.end() > region.end(): output.append(Region(region.end(), r.end()))
        self.regions = output

class Settings:
    def __init__(self, values=None, on_change=None): self.values = dict(values or {}); self.callbacks = {}; self.on_change = on_change
    def get(self, name, default=None): return self.values.get(name, default)
    def has(self, name): return name in self.values
    def set(self, name, value):
        json.dumps(value)
        self.values[name] = value; self._changed()
    def erase(self, name): self.values.pop(name, None); self._changed()
    def add_on_change(self, key, callback): self.callbacks[key] = callback
    def clear_on_change(self, key): self.callbacks.pop(key, None)
    def to_dict(self): return dict(self.values)
    def _changed(self):
        if self.on_change: self.on_change(self.values)
        for callback in list(self.callbacks.values()): callback()

class Edit:
    def __init__(self, view, secret=None):
        if secret is not _ctx().edit_secret: raise RuntimeError('Edit objects are created only by TextCommand transactions')
        self.view, self.active = view, True

class View:
    def __init__(self, data):
        self.key = data['id']; self.original = data['text']; self.text = self.original
        self.version = data['version']; self.path = data.get('path'); self._name = data.get('name', '')
        self._selection = Selection([Region(_cp(self.text, s['anchor']), _cp(self.text, s['head'])) for s in data.get('selections', [{'anchor': 0, 'head': 0}])])
        self._settings = Settings(data.get('settings'), lambda values: _ctx().effects.append({'type': 'settings', 'viewId': self.key, 'values': values.copy()}))
        self.read_only = bool(data.get('readOnly')); self.regions = {}; self.status = {}
    def __getattr__(self, name): raise UnsupportedAPI('View.' + name)
    def id(self): return _ctx().view_number(self.key)
    def buffer_id(self): return self.id()
    def is_valid(self): return True
    def is_loading(self): return False
    def file_name(self): return self.path
    def name(self): return self._name
    def set_name(self, name): raise UnsupportedAPI('View.set_name (requires document metadata transaction)')
    def window(self): return _ctx().window
    def settings(self): return self._settings
    def size(self): return len(self.text)
    def sel(self): return self._selection
    def is_read_only(self): return self.read_only
    def is_dirty(self): return self.text != self.original or bool(self._settings.get('et_dirty', False))
    def change_count(self): return _ctx().change_counts.get(self.key, 0)
    def substr(self, value):
        if isinstance(value, Region): return self.text[max(0, value.begin()):max(0, value.end())]
        return self.text[value:value+1] if 0 <= value < len(self.text) else '\x00'
    def _check(self, edit):
        if not isinstance(edit, Edit) or not edit.active or edit.view is not self: raise RuntimeError('Invalid or expired edit token')
        if self.read_only: raise RuntimeError('Cannot edit a read-only view')
    def replace(self, edit, region, text):
        self._check(edit)
        if not isinstance(region, Region) or region.begin() < 0 or region.end() > len(self.text): raise ValueError('Edit range is outside the document')
        if not isinstance(text, str): raise TypeError('Replacement must be text')
        begin, end, size = region.begin(), region.end(), len(text)
        delta = size - (end - begin)
        def mapped(p):
            if p < begin: return p
            if p > end: return p + delta
            if begin == end: return begin + size
            if p == begin: return begin
            return begin + size
        self.text = self.text[:begin] + text + self.text[end:]
        for r in self._selection.regions: r.a, r.b = mapped(r.a), mapped(r.b)
        for values in self.regions.values():
            for r in values: r.a, r.b = mapped(r.a), mapped(r.b)
        _ctx().change_counts[self.key] = self.change_count() + 1
    def insert(self, edit, point, text): self.replace(edit, Region(point), text); return len(text)
    def erase(self, edit, region): self.replace(edit, region, '')
    def rowcol(self, point):
        point = min(max(0, point), len(self.text)); prefix = self.text[:point]
        return prefix.count('\n'), point - prefix.rfind('\n') - 1
    def text_point(self, row, col, clamp_column=False):
        if row < 0: return 0
        starts = [0] + [m.end() for m in re.finditer('\n', self.text)]
        if row >= len(starts): return len(self.text)
        start = starts[row]; end = self.text.find('\n', start)
        return min(start + max(0, col), len(self.text) if end < 0 else end)
    def utf16_code_units(self, point=None): return _u16(self.text, len(self.text) if point is None else point)
    def line(self, value):
        a = value.begin() if isinstance(value, Region) else value; b = value.end() if isinstance(value, Region) else value
        a = min(max(0, a), len(self.text)); b = min(max(0, b), len(self.text))
        start = self.text.rfind('\n', 0, a) + 1; end = self.text.find('\n', b)
        return Region(start, len(self.text) if end < 0 else end)
    def full_line(self, value):
        r = self.line(value)
        if r.b < len(self.text): r.b += 1
        return r
    def lines(self, region):
        result = []; p = region.begin()
        while p <= region.end():
            r = self.line(p); result.append(r)
            if r.end() >= region.end() or r.end() == len(self.text): break
            p = r.end() + 1
        return result
    def word(self, value):
        point = value.begin() if isinstance(value, Region) else value; point = min(max(0, point), len(self.text))
        start, end = point, point
        while start > 0 and (self.text[start-1].isalnum() or self.text[start-1] == '_'): start -= 1
        while end < len(self.text) and (self.text[end].isalnum() or self.text[end] == '_'): end += 1
        return Region(start, end)
    def find(self, pattern, start_pt, flags=0):
        source = re.escape(pattern) if flags & LITERAL else pattern
        m = re.compile(source, re.I if flags & IGNORECASE else 0).search(self.text, start_pt)
        return Region(m.start(), m.end()) if m else Region(-1)
    def find_all(self, pattern, flags=0, fmt=None, extractions=None):
        source = re.escape(pattern) if flags & LITERAL else pattern; result = []
        for m in re.finditer(source, self.text, re.I if flags & IGNORECASE else 0):
            result.append(Region(m.start(), m.end()))
            if fmt is not None and extractions is not None: extractions.append(m.expand(fmt))
        return result
    def show(self, location, show_surrounds=True, **kwargs):
        point = location.begin() if isinstance(location, Region) else location
        _ctx().effects.append({'type': 'show', 'viewId': self.key, 'point': _u16(self.text, point)})
    def show_at_center(self, location, **kwargs): self.show(location)
    def run_command(self, name, args=None): return _ctx().run_command(name, args or {}, view=self)
    def set_status(self, key, value): self.status[key] = value; status_message(value)
    def get_status(self, key): return self.status.get(key, '')
    def erase_status(self, key): self.status.pop(key, None); status_message('')
    def get_regions(self, key): return [Region(r.a, r.b) for r in self.regions.get(key, [])]
    def add_regions(self, key, regions, scope='', icon='', flags=0, **kwargs): raise UnsupportedAPI('View.add_regions (renderer decorations)')
    def erase_regions(self, key): raise UnsupportedAPI('View.erase_regions (renderer decorations)')

class Window:
    def __init__(self, data=None): self.data = data or {}; self._settings = Settings(self.data.get('settings'), lambda values: _ctx().effects.append({'type': 'settings', 'windowId': 1, 'values': values.copy()}))
    def __getattr__(self, name): raise UnsupportedAPI('Window.' + name)
    def id(self): return 1
    def is_valid(self): return True
    def active_view(self): return _ctx().views.get(_ctx().active_id)
    def views(self): return list(_ctx().views.values())
    def folders(self): return list(self.data.get('folders', []))
    def settings(self): return self._settings
    def find_open_file(self, file_name): return next((v for v in self.views() if v.file_name() == file_name), None)
    def focus_view(self, view): _ctx().active_id = view.key; _ctx().effects.append({'type': 'focus-view', 'viewId': view.key})
    def run_command(self, name, args=None): return _ctx().run_command(name, args or {}, window=self)
    def status_message(self, message): status_message(message)
    def extract_variables(self):
        view = self.active_view(); file_name = view.file_name() if view else None; result = {'packages': packages_path()}
        if self.folders(): result['folder'] = self.folders()[0]
        if file_name:
            name = os.path.basename(file_name); base, ext = os.path.splitext(name)
            result.update(file=file_name, file_path=os.path.dirname(file_name), file_name=name, file_base_name=base, file_extension=ext[1:])
        return result
    def open_file(self, file_name, flags=0, group=-1):
        view = self.find_open_file(file_name)
        if view: self.focus_view(view); return view
        raise UnsupportedAPI('Window.open_file for files not in the transaction snapshot')
    def show_input_panel(self, caption, initial_text, on_done, on_change=None, on_cancel=None): raise UnsupportedAPI('Window.show_input_panel (interactive callbacks)')
    def show_quick_panel(self, items, on_done, *args, **kwargs): raise UnsupportedAPI('Window.show_quick_panel (interactive callbacks)')

def active_window(): return _ctx().window

def windows(): return [_ctx().window]

def run_command(name, args=None): return _ctx().run_command(name, args or {}, application=True)

def status_message(message): _ctx().effects.append({'type': 'status', 'message': str(message)})

def error_message(message): _ctx().effects.append({'type': 'status', 'message': 'Plugin error: ' + str(message)})

def message_dialog(message): raise UnsupportedAPI('sublime.message_dialog (interactive dialogs)')

def set_clipboard(text): _ctx().clipboard = str(text); _ctx().effects.append({'type': 'clipboard', 'text': str(text)})

def get_clipboard(size_limit=16777216):
    if _ctx().clipboard is None: raise UnsupportedAPI('sublime.get_clipboard (clipboard absent from snapshot)')
    return _ctx().clipboard[:size_limit]

def load_settings(name): return _ctx().load_settings(name)

def save_settings(name): _ctx().save_settings(name)

def packages_path(): return _ctx().packages_dir

def installed_packages_path(): return _ctx().packages_dir

def cache_path():
    target = os.path.join(_ctx().state_dir, 'cache'); os.makedirs(target, exist_ok=True); return target

def platform(): return 'osx' if sys.platform == 'darwin' else 'windows' if sys.platform == 'win32' else 'linux'

def arch():
    import platform as p
    return 'arm64' if p.machine() in ('arm64', 'aarch64') else 'x64'

def version(): return '3211'

def channel(): return 'stable'

def executable_path(): return sys.executable

def set_timeout(callback, delay=0):
    if delay != 0: raise UnsupportedAPI('sublime.set_timeout with delayed callback')
    _ctx().callbacks.append(callback)

def set_timeout_async(callback, delay=0): raise UnsupportedAPI('sublime.set_timeout_async (thread-affine API)')

def load_resource(name): return _ctx().load_resource(name)

def load_binary_resource(name): return _ctx().load_resource(name, binary=True)

def find_resources(pattern): return _ctx().find_resources(pattern)

def decode_value(value): return json.loads(value)

def encode_value(value, pretty=False): return json.dumps(value, ensure_ascii=False, indent=2 if pretty else None)

def expand_variables(value, variables):
    if isinstance(value, list): return [expand_variables(v, variables) for v in value]
    if isinstance(value, dict): return {k: expand_variables(v, variables) for k, v in value.items()}
    if not isinstance(value, str): return value
    return re.sub(r'\$\{([^}:]+)(?::([^}]*))?\}|\$(\w+)', lambda m: str(variables.get(m.group(1) or m.group(3), m.group(2) or '')), value)

def __getattr__(name): raise UnsupportedAPI('sublime.' + name)
