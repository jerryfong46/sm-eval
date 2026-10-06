# Minimal HTML fixture loader for offline interface smoke testing (not a renderer).
import json
from html.parser import HTMLParser
from pathlib import Path
class Parser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.root = {'tag':'document', 'attrs':{}, 'children':[]}
        self.stack = [self.root]
    def handle_starttag(self, tag, attrs):
        node = {'tag':tag, 'attrs':dict(attrs), 'children':[]}
        self.stack[-1]['children'].append(node)
        if tag not in ('input','link','meta','br','img','hr'): self.stack.append(node)
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i]['tag'] == tag:
                self.stack = self.stack[:i]
                break
p=Parser()
p.feed((Path(__file__).parent.parent/'index.html').read_text())
print(json.dumps(p.root))
