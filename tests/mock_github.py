# Προσομοίωση του GitHub API (Git Data API) για τους ελέγχους: ένα ιδιωτικό αποθετήριο στη μνήμη.
import base64
import hashlib
import json
import re


class MockGitHub:
    def __init__(self, token='good-token', private=True):
        self.token, self.private = token, private
        self.blobs, self.trees, self.commits, self.ref = {}, {}, {}, None
        self.requests = []

    # ---- βοηθητικά
    def _sha(self, kind, data):
        return hashlib.sha1(kind.encode() + b'\0' + data).hexdigest()

    def put_blob(self, data):
        s = self._sha('blob', data)
        self.blobs[s] = data
        return s

    def put_tree(self, entries):
        s = self._sha('tree', json.dumps(entries, sort_keys=True).encode())
        self.trees[s] = dict(entries)
        return s

    def put_commit(self, tree, parents, message):
        s = self._sha('commit', json.dumps([tree, parents, message, len(self.commits)]).encode())
        self.commits[s] = {'tree': tree, 'parents': parents, 'message': message}
        return s

    def files(self):
        if not self.ref:
            return {}
        return {p: self.blobs[s] for p, s in self.trees[self.commits[self.ref]['tree']].items()}

    def read_json(self, path):
        return json.loads(self.files()[path].decode())

    def external_commit(self, path, data, message='Αλλαγή από άλλον χρήστη'):
        # Αλλαγή «από άλλη συσκευή», για έλεγχο ταυτόχρονων αλλαγών
        tree = dict(self.trees[self.commits[self.ref]['tree']])
        tree[path] = self.put_blob(data if isinstance(data, bytes) else data.encode())
        self.ref = self.put_commit(self.put_tree(tree), [self.ref], message)

    # ---- HTTP
    def handle(self, route, request):
        url, method = request.url, request.method
        self.requests.append((method, url))
        if request.headers.get('authorization') != f'Bearer {self.token}':
            return route.fulfill(status=401, json={'message': 'Bad credentials'})
        m = re.match(r'https://api\.github\.com/repos/([^/]+)/([^/]+)(/[^?]*)?', url)
        path = (m.group(3) or '') if m else ''
        body = json.loads(request.post_data or '{}') if request.post_data else {}
        ok = lambda data, status=200: route.fulfill(status=status, json=data)
        if path == '' and method == 'GET':
            return ok({'private': self.private, 'permissions': {'push': True}})
        if path == '/git/ref/heads/main':
            return ok({'object': {'sha': self.ref}}) if self.ref else route.fulfill(status=409, json={'message': 'Git Repository is empty.'})
        if path.startswith('/contents/') and method == 'PUT':
            data = base64.b64decode(body['content'])
            tree = dict(self.trees[self.commits[self.ref]['tree']]) if self.ref else {}
            tree[path[len('/contents/'):]] = self.put_blob(data)
            self.ref = self.put_commit(self.put_tree(tree), [self.ref] if self.ref else [], body['message'])
            return ok({'commit': {'sha': self.ref}}, 201)
        if path.startswith('/git/commits/') and method == 'GET':
            sha = path.rsplit('/', 1)[1]
            return ok({'sha': sha, 'tree': {'sha': self.commits[sha]['tree']}})
        if path.startswith('/git/trees/') and method == 'GET':
            t = self.trees[path.rsplit('/', 1)[1]]
            return ok({'tree': [{'path': p, 'type': 'blob', 'sha': s, 'mode': '100644'} for p, s in t.items()]})
        if path.startswith('/git/blobs/') and method == 'GET':
            return ok({'content': base64.b64encode(self.blobs[path.rsplit('/', 1)[1]]).decode(), 'encoding': 'base64'})
        if path == '/git/blobs' and method == 'POST':
            return ok({'sha': self.put_blob(base64.b64decode(body['content']))}, 201)
        if path == '/git/trees' and method == 'POST':
            tree = dict(self.trees[body['base_tree']])
            for e in body['tree']:
                if e.get('sha') is None:
                    tree.pop(e['path'], None)
                else:
                    tree[e['path']] = e['sha']
            return ok({'sha': self.put_tree(tree)}, 201)
        if path == '/git/commits' and method == 'POST':
            return ok({'sha': self.put_commit(body['tree'], body['parents'], body['message'])}, 201)
        if path == '/git/refs/heads/main' and method == 'PATCH':
            if self.ref not in self.commits[body['sha']]['parents']:
                return route.fulfill(status=422, json={'message': 'Update is not a fast forward'})
            self.ref = body['sha']
            return ok({'object': {'sha': self.ref}})
        return route.fulfill(status=404, json={'message': 'Not Found'})
